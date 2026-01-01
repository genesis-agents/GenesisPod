/**
 * WeChat Data Source Controller
 * API endpoints for managing WeChat synced items
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Logger,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Request } from "express";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { WechatDataSourceService } from "./wechat-data-source.service";
import { WechatWorkCryptoService } from "./wechat-work-crypto.service";
import { WechatItemType } from "@prisma/client";

interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

@ApiTags("WeChat Data Source")
@Controller("wechat-data-source")
@ApiBearerAuth()
export class WechatDataSourceController {
  private readonly logger = new Logger(WechatDataSourceController.name);

  constructor(
    private readonly wechatDataSourceService: WechatDataSourceService,
    private readonly wechatCryptoService: WechatWorkCryptoService,
  ) {}

  private getUserId(req: AuthenticatedRequest): string {
    const userId = req.user?.id;
    if (!userId) {
      throw new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED);
    }
    return userId;
  }

  /**
   * Get WeChat data source status and stats
   */
  @Get("status")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Get WeChat data source status and statistics" })
  @ApiResponse({
    status: 200,
    description: "Returns WeChat data source status",
  })
  async getStatus(@Req() req: AuthenticatedRequest) {
    const userId = this.getUserId(req);
    const isConfigured = this.wechatCryptoService.isConfigured();
    const stats = await this.wechatDataSourceService.getStats(userId);

    return {
      isConnected: isConfigured,
      corpId: isConfigured
        ? `${this.wechatCryptoService.getCorpId().substring(0, 4)}****`
        : null,
      stats,
    };
  }

  /**
   * List WeChat items
   */
  @Get("items")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "List WeChat items" })
  @ApiQuery({
    name: "type",
    required: false,
    enum: ["ARTICLE", "VIDEO", "EXTERNAL"],
  })
  @ApiQuery({ name: "syncedToRag", required: false, type: Boolean })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiResponse({ status: 200, description: "Returns list of WeChat items" })
  async listItems(
    @Req() req: AuthenticatedRequest,
    @Query("type") type?: string,
    @Query("syncedToRag") syncedToRag?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const userId = this.getUserId(req);

    const options: {
      type?: WechatItemType;
      syncedToRag?: boolean;
      limit?: number;
      offset?: number;
    } = {};

    if (type && ["ARTICLE", "VIDEO", "EXTERNAL"].includes(type)) {
      options.type = type as WechatItemType;
    }

    if (syncedToRag !== undefined) {
      options.syncedToRag = syncedToRag === "true";
    }

    if (limit) {
      options.limit = parseInt(limit, 10);
    }

    if (offset) {
      options.offset = parseInt(offset, 10);
    }

    const result = await this.wechatDataSourceService.getItems(userId, options);

    return {
      items: result.items,
      total: result.total,
      limit: options.limit || 50,
      offset: options.offset || 0,
    };
  }

  /**
   * Get a single WeChat item
   */
  @Get("items/:id")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Get a single WeChat item" })
  @ApiResponse({ status: 200, description: "Returns the WeChat item" })
  @ApiResponse({ status: 404, description: "Item not found" })
  async getItem(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    const userId = this.getUserId(req);
    const item = await this.wechatDataSourceService.getItem(userId, id);
    return { item };
  }

  /**
   * Delete a WeChat item
   */
  @Delete("items/:id")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Delete a WeChat item" })
  @ApiResponse({ status: 200, description: "Item deleted successfully" })
  @ApiResponse({ status: 404, description: "Item not found" })
  async deleteItem(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    const userId = this.getUserId(req);
    await this.wechatDataSourceService.deleteItem(userId, id);
    return { success: true, message: "Item deleted successfully" };
  }

  /**
   * Batch delete WeChat items
   */
  @Post("items/batch-delete")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Batch delete WeChat items" })
  @ApiResponse({ status: 200, description: "Items deleted successfully" })
  async batchDeleteItems(
    @Req() req: AuthenticatedRequest,
    @Body() body: { ids: string[] },
  ) {
    const userId = this.getUserId(req);

    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      throw new HttpException("Invalid item IDs", HttpStatus.BAD_REQUEST);
    }

    const count = await this.wechatDataSourceService.deleteItems(
      userId,
      body.ids,
    );
    return { success: true, deletedCount: count };
  }

  /**
   * Manually add a URL to WeChat data source
   */
  @Post("items")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Manually add a URL to WeChat data source" })
  @ApiResponse({ status: 201, description: "Item created successfully" })
  @ApiResponse({ status: 400, description: "Invalid URL or duplicate" })
  async addItem(
    @Req() req: AuthenticatedRequest,
    @Body() body: { url: string; title?: string; description?: string },
  ) {
    const userId = this.getUserId(req);

    if (!body.url) {
      throw new HttpException("URL is required", HttpStatus.BAD_REQUEST);
    }

    // Validate URL
    try {
      new URL(body.url);
    } catch {
      throw new HttpException("Invalid URL format", HttpStatus.BAD_REQUEST);
    }

    // Check if already exists
    const exists = await this.wechatDataSourceService.urlExists(
      userId,
      body.url,
    );
    if (exists) {
      throw new HttpException("URL already exists", HttpStatus.CONFLICT);
    }

    // Identify link type
    const type = this.wechatDataSourceService.identifyLinkType(body.url);

    try {
      const item = await this.wechatDataSourceService.createItem({
        userId,
        type,
        title: body.title || body.url,
        sourceUrl: body.url,
        description: body.description,
        syncSource: "manual",
      });

      return { success: true, item };
    } catch (error) {
      this.logger.error(`Failed to create item: ${error}`);
      throw new HttpException(
        error instanceof Error ? error.message : "Failed to create item",
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Sync item to RAG knowledge base
   */
  @Post("items/:id/sync-to-rag")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Sync a WeChat item to RAG knowledge base" })
  @ApiResponse({ status: 200, description: "Item synced to RAG" })
  async syncItemToRag(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() _body: { knowledgeBaseId?: string },
  ) {
    const userId = this.getUserId(req);

    // Get the item first
    const item = await this.wechatDataSourceService.getItem(userId, id);

    if (item.syncedToRag) {
      throw new HttpException(
        "Item is already synced to RAG",
        HttpStatus.BAD_REQUEST,
      );
    }

    // TODO: Implement actual RAG sync
    // This would call KnowledgeBaseService.addDocument and then markSyncedToRag

    return {
      success: true,
      message: "Sync to RAG not yet implemented",
      item,
    };
  }
}
