import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
  Req,
  Logger,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Request, Response } from "express";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { GoogleDriveAuthService } from "./services/google-drive-auth.service";
import { GoogleDriveFileService } from "./services/google-drive-file.service";
import { GoogleDriveImportService } from "./services/google-drive-import.service";
import { GoogleDriveExportService } from "./services/google-drive-export.service";
import {
  ListFilesDto,
  ImportFilesDto,
  ExportResourcesDto,
  UpdateConnectionDto,
} from "./dto/google-drive.dto";
import { PrismaService } from "../../../common/prisma/prisma.service";

// Extend Express Request to include user
interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

@ApiTags("Google Drive Integration")
@Controller("google-drive")
@ApiBearerAuth()
export class GoogleDriveController {
  private readonly logger = new Logger(GoogleDriveController.name);

  constructor(
    private readonly authService: GoogleDriveAuthService,
    private readonly fileService: GoogleDriveFileService,
    private readonly importService: GoogleDriveImportService,
    private readonly exportService: GoogleDriveExportService,
    private readonly prisma: PrismaService,
  ) {}

  private getUserId(req: AuthenticatedRequest): string {
    const userId = req.user?.id;
    if (!userId) {
      throw new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED);
    }
    return userId;
  }

  // ============ OAuth & Connection ============

  @Get("connect")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "获取 Google Drive OAuth 授权 URL" })
  @ApiResponse({ status: 200, description: "返回授权 URL" })
  async getConnectUrl(@Req() req: AuthenticatedRequest) {
    const userId = this.getUserId(req);
    const state = Buffer.from(JSON.stringify({ userId })).toString("base64");
    const url = this.authService.getAuthorizationUrl(state);
    return { url };
  }

  @Get("callback")
  @ApiOperation({ summary: "Google Drive OAuth 回调（用于浏览器重定向流程）" })
  async callback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Query("error") error: string,
    @Res() res: Response,
  ) {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

    if (error) {
      return res.redirect(
        `${frontendUrl}/library?tab=google-drive&error=${encodeURIComponent(error)}`,
      );
    }

    try {
      // 解析 state 获取 userId
      const stateData = JSON.parse(Buffer.from(state, "base64").toString());
      const userId = stateData.userId;

      const result = await this.authService.exchangeCodeForToken(userId, code);

      return res.redirect(
        `${frontendUrl}/library?tab=google-drive&success=true&email=${encodeURIComponent(result.email)}`,
      );
    } catch (err) {
      this.logger.error(`OAuth callback error: ${err}`);
      return res.redirect(
        `${frontendUrl}/library?tab=google-drive&error=${encodeURIComponent("Failed to connect Google Drive")}`,
      );
    }
  }

  @Delete("disconnect")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "断开 Google Drive 连接" })
  @ApiResponse({ status: 200, description: "断开成功" })
  async disconnect(@Req() req: AuthenticatedRequest) {
    const userId = this.getUserId(req);
    await this.authService.disconnect(userId);
    return { success: true, message: "Google Drive disconnected" };
  }

  @Delete("disconnect/:connectionId")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "断开 Google Drive 连接（通过 ID）" })
  @ApiResponse({ status: 200, description: "断开成功" })
  async disconnectById(
    @Req() req: AuthenticatedRequest,
    @Param("connectionId") connectionId: string,
  ) {
    const userId = this.getUserId(req);
    // 验证 connectionId 属于当前用户
    const connection = await this.authService.getConnection(userId);
    if (!connection || connection.id !== connectionId) {
      throw new HttpException("Connection not found", HttpStatus.NOT_FOUND);
    }
    await this.authService.disconnect(userId);
    return { success: true, message: "Google Drive disconnected" };
  }

  @Get("connection")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "获取连接信息" })
  @ApiResponse({ status: 200, description: "返回连接信息" })
  async getConnection(@Req() req: AuthenticatedRequest) {
    const userId = this.getUserId(req);
    const connection = await this.authService.getConnection(userId);
    return { connection };
  }

  @Patch("connection")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "更新连接配置" })
  @ApiResponse({ status: 200, description: "更新成功" })
  async updateConnection(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateConnectionDto,
  ) {
    const userId = this.getUserId(req);
    const connection = await this.authService.updateConnection(userId, dto);
    return { connection };
  }

  // ============ Connections (复数路由，兼容前端) ============

  @Get("connections")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "获取用户的所有连接（兼容前端）" })
  @ApiResponse({ status: 200, description: "返回连接列表" })
  async getConnections(@Req() req: AuthenticatedRequest) {
    const userId = this.getUserId(req);
    const connection = await this.authService.getConnection(userId);
    // 返回数组格式，兼容前端期望的 connections 列表
    return { connections: connection ? [connection] : [] };
  }

  @Get("connections/:id")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "获取单个连接详情" })
  @ApiResponse({ status: 200, description: "返回连接信息" })
  async getConnectionById(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    const userId = this.getUserId(req);
    const connection = await this.authService.getConnection(userId);
    if (!connection || connection.id !== id) {
      throw new HttpException("Connection not found", HttpStatus.NOT_FOUND);
    }
    return { connection };
  }

  @Patch("connections/:id")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "更新连接配置（通过 ID）" })
  @ApiResponse({ status: 200, description: "更新成功" })
  async updateConnectionById(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateConnectionDto,
  ) {
    const userId = this.getUserId(req);
    const connection = await this.authService.getConnection(userId);
    if (!connection || connection.id !== id) {
      throw new HttpException("Connection not found", HttpStatus.NOT_FOUND);
    }
    const updated = await this.authService.updateConnection(userId, dto);
    return { connection: updated };
  }

  // ============ Files ============

  @Get("files")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "列出文件" })
  @ApiResponse({ status: 200, description: "返回文件列表" })
  async listFiles(
    @Req() req: AuthenticatedRequest,
    @Query() dto: ListFilesDto,
  ) {
    const userId = this.getUserId(req);
    const result = await this.fileService.listFiles(userId, dto);
    return result;
  }

  @Get("files/:id")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "获取单个文件信息" })
  @ApiResponse({ status: 200, description: "返回文件信息" })
  async getFile(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    const userId = this.getUserId(req);
    const file = await this.fileService.getFile(userId, id);
    return { file };
  }

  // ============ Import/Export ============

  @Post("import")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "导入文件到 Library" })
  @ApiResponse({ status: 200, description: "导入成功" })
  async importFiles(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ImportFilesDto,
  ) {
    const userId = this.getUserId(req);
    const result = await this.importService.importFiles(userId, dto);
    return {
      success: true,
      message: `Imported ${result.imported} of ${result.totalFiles} files`,
      ...result,
    };
  }

  @Post("export")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "导出资源到 Google Drive" })
  @ApiResponse({ status: 200, description: "导出成功" })
  async exportResources(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ExportResourcesDto,
  ) {
    const userId = this.getUserId(req);
    const result = await this.exportService.exportResources(userId, dto);
    return {
      success: true,
      message: `Exported ${result.exported} of ${result.totalResources} resources`,
      ...result,
    };
  }

  // ============ Sync ============

  @Get("sync/status")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "获取同步状态" })
  @ApiResponse({ status: 200, description: "返回同步状态" })
  async getSyncStatus(@Req() req: AuthenticatedRequest) {
    const userId = this.getUserId(req);
    const connection = await this.authService.getConnection(userId);

    if (!connection) {
      return { status: "not_connected" };
    }

    return {
      status: connection.status,
      lastSyncAt: connection.lastSyncAt,
      lastError: connection.lastError,
    };
  }

  @Get("sync/history")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "获取同步历史" })
  @ApiResponse({ status: 200, description: "返回同步历史" })
  async getSyncHistory(
    @Req() req: AuthenticatedRequest,
    @Query("limit") limit?: number,
  ) {
    const userId = this.getUserId(req);

    const connection = await this.authService.getConnection(userId);
    if (!connection) {
      throw new HttpException(
        "Google Drive not connected",
        HttpStatus.BAD_REQUEST,
      );
    }

    const history = await this.prisma.googleDriveSyncHistory.findMany({
      where: { connectionId: connection.id },
      orderBy: { startedAt: "desc" },
      take: limit || 10,
    });

    return { history };
  }

  // ============ Config ============

  @Get("config")
  @ApiOperation({ summary: "获取 Google Drive 集成配置状态" })
  @ApiResponse({ status: 200, description: "返回配置状态" })
  async getConfig() {
    return {
      configured: this.authService.isConfigured(),
      redirectUri: process.env.GOOGLE_DRIVE_REDIRECT_URI || "",
    };
  }
}
