import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Logger,
  BadRequestException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { AiAskService } from "./ai-ask.service";

interface CreateSessionDto {
  title?: string;
  modelId?: string;
}

interface UpdateSessionDto {
  title?: string;
  modelId?: string;
}

interface SendMessageDto {
  content: string;
  modelId?: string;
  webSearch?: boolean;
}

@Controller("ask/sessions")
@UseGuards(JwtAuthGuard)
export class AiAskController {
  private readonly logger = new Logger(AiAskController.name);

  constructor(private readonly aiAskService: AiAskService) {}

  /**
   * 创建新会话
   * POST /api/v1/ask/sessions
   */
  @Post()
  async createSession(@Request() req: any, @Body() dto: CreateSessionDto) {
    this.logger.log(`Creating session for user ${req.user.id}`);
    return this.aiAskService.createSession(req.user.id, dto);
  }

  /**
   * 获取会话列表
   * GET /api/v1/ask/sessions?page=1&limit=20
   */
  @Get()
  async getSessions(
    @Request() req: any,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    const pageNum = parseInt(page || "1", 10);
    const limitNum = parseInt(limit || "50", 10);
    return this.aiAskService.getSessions(req.user.id, pageNum, limitNum);
  }

  /**
   * 搜索会话
   * GET /api/v1/ask/sessions/search?q=keyword
   */
  @Get("search")
  async searchSessions(
    @Request() req: any,
    @Query("q") query: string,
    @Query("limit") limit?: string,
  ) {
    if (!query || query.trim().length === 0) {
      return [];
    }
    const limitNum = parseInt(limit || "20", 10);
    return this.aiAskService.searchSessions(req.user.id, query, limitNum);
  }

  /**
   * 获取单个会话详情（含消息）
   * GET /api/v1/ask/sessions/:id
   */
  @Get(":id")
  async getSession(@Request() req: any, @Param("id") id: string) {
    return this.aiAskService.getSession(id, req.user.id);
  }

  /**
   * 更新会话
   * PATCH /api/v1/ask/sessions/:id
   */
  @Patch(":id")
  async updateSession(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.aiAskService.updateSession(id, req.user.id, dto);
  }

  /**
   * 删除会话
   * DELETE /api/v1/ask/sessions/:id
   */
  @Delete(":id")
  async deleteSession(@Request() req: any, @Param("id") id: string) {
    return this.aiAskService.deleteSession(id, req.user.id);
  }

  /**
   * 发送消息
   * POST /api/v1/ask/sessions/:sessionId/messages
   */
  @Post(":sessionId/messages")
  async sendMessage(
    @Request() req: any,
    @Param("sessionId") sessionId: string,
    @Body() dto: SendMessageDto,
  ) {
    if (!dto.content || dto.content.trim().length === 0) {
      throw new BadRequestException("Message content is required");
    }
    return this.aiAskService.sendMessage(sessionId, req.user.id, dto);
  }

  /**
   * 获取会话消息
   * GET /api/v1/ask/sessions/:sessionId/messages?limit=50&before=timestamp
   */
  @Get(":sessionId/messages")
  async getMessages(
    @Request() req: any,
    @Param("sessionId") sessionId: string,
    @Query("limit") limit?: string,
    @Query("before") before?: string,
  ) {
    const limitNum = parseInt(limit || "50", 10);
    const beforeDate = before ? new Date(before) : undefined;
    return this.aiAskService.getMessages(
      sessionId,
      req.user.id,
      limitNum,
      beforeDate,
    );
  }

  /**
   * 重新生成消息
   * POST /api/v1/ask/sessions/:sessionId/messages/:messageId/regenerate
   */
  @Post(":sessionId/messages/:messageId/regenerate")
  async regenerateMessage(
    @Request() req: any,
    @Param("sessionId") sessionId: string,
    @Param("messageId") messageId: string,
  ) {
    return this.aiAskService.regenerateMessage(
      sessionId,
      messageId,
      req.user.id,
    );
  }
}
