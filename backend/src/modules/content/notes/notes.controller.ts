import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Request,
  Query,
  UseGuards,
  UnauthorizedException,
} from "@nestjs/common";
import { NotesService } from "./notes.service";
import { CreateNoteDto, UpdateNoteDto, AddHighlightDto } from "./dto";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../../../common/guards/optional-jwt-auth.guard";

/**
 * 笔记控制器
 *
 * API端点：
 * - POST /api/v1/notes - 创建笔记
 * - GET /api/v1/notes - 获取用户笔记列表
 * - GET /api/v1/notes/resource/:resourceId - 获取资源的笔记
 * - GET /api/v1/notes/:id - 获取单个笔记
 * - PATCH /api/v1/notes/:id - 更新笔记
 * - DELETE /api/v1/notes/:id - 删除笔记
 * - POST /api/v1/notes/:id/bookmark - 切换收藏状态
 * - POST /api/v1/notes/:id/highlights - 添加高亮
 * - DELETE /api/v1/notes/:id/highlights/:highlightId - 删除高亮
 * - POST /api/v1/notes/:id/ai-explain - 请求AI解释
 * - POST /api/v1/notes/:id/graph-nodes - 关联知识图谱节点
 */
@Controller("notes")
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  /**
   * 创建笔记
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  async createNote(@Request() req: any, @Body() dto: CreateNoteDto) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.notesService.createNote(userId, dto);
  }

  /**
   * 获取用户的所有笔记（分页）
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  async getUserNotes(
    @Request() req: any,
    @Query("skip") skip?: string,
    @Query("take") take?: string,
    @Query("source") source?: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    const skipNum = skip ? parseInt(skip, 10) : 0;
    const takeNum = take ? parseInt(take, 10) : 50;
    return this.notesService.getUserNotes(userId, skipNum, takeNum, source);
  }

  /**
   * 获取资源的笔记
   */
  @Get("resource/:resourceId")
  @UseGuards(OptionalJwtAuthGuard)
  async getResourceNotes(
    @Param("resourceId") resourceId: string,
    @Request() req: any,
  ) {
    const userId = req.user?.id;
    return this.notesService.getResourceNotes(resourceId, userId);
  }

  /**
   * 获取单个笔记
   */
  @Get(":id")
  @UseGuards(OptionalJwtAuthGuard)
  async getNote(@Param("id") id: string, @Request() req: any) {
    const userId = req.user?.id;
    return this.notesService.getNote(id, userId);
  }

  /**
   * 更新笔记
   */
  @Patch(":id")
  @UseGuards(JwtAuthGuard)
  async updateNote(
    @Param("id") id: string,
    @Request() req: any,
    @Body() dto: UpdateNoteDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.notesService.updateNote(id, userId, dto);
  }

  /**
   * 删除笔记
   */
  @Delete(":id")
  @UseGuards(JwtAuthGuard)
  async deleteNote(@Param("id") id: string, @Request() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.notesService.deleteNote(id, userId);
  }

  /**
   * Toggle bookmark status
   */
  @Post(":id/bookmark")
  @UseGuards(JwtAuthGuard)
  async toggleBookmark(@Param("id") id: string, @Request() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.notesService.toggleBookmark(id, userId);
  }

  /**
   * 添加高亮标注
   */
  @Post(":id/highlights")
  @UseGuards(JwtAuthGuard)
  async addHighlight(
    @Param("id") id: string,
    @Request() req: any,
    @Body() dto: AddHighlightDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.notesService.addHighlight(id, userId, dto);
  }

  /**
   * 删除高亮标注
   */
  @Delete(":id/highlights/:highlightId")
  @UseGuards(JwtAuthGuard)
  async removeHighlight(
    @Param("id") id: string,
    @Param("highlightId") highlightId: string,
    @Request() req: any,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.notesService.removeHighlight(id, userId, highlightId);
  }

  /**
   * 请求AI解释
   */
  @Post(":id/ai-explain")
  @UseGuards(JwtAuthGuard)
  async requestAIExplanation(
    @Param("id") id: string,
    @Request() req: any,
    @Body("text") text: string,
    @Body("pdfContext") pdfContext?: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.notesService.requestAIExplanation(id, userId, text, pdfContext);
  }

  /**
   * 关联知识图谱节点
   */
  @Post(":id/graph-nodes")
  @UseGuards(JwtAuthGuard)
  async linkGraphNode(
    @Param("id") id: string,
    @Request() req: any,
    @Body("nodeId") nodeId: string,
    @Body("nodeType") nodeType: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.notesService.linkGraphNode(id, userId, nodeId, nodeType);
  }
}
