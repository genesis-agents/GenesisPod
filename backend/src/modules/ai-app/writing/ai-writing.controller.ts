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
  NotFoundException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { Public } from "../../../common/decorators/public.decorator";
import { AiWritingService } from "./ai-writing.service";
import { ProjectService } from "./services/writing/project.service";
import { StoryBibleService } from "./services/bible/story-bible.service";
import { CharacterService } from "./services/bible/character.service";
import { ChapterWritingService } from "./services/writing/chapter-writing.service";
import { ChapterRevisionService } from "./services/writing/chapter-revision.service";
import { ChapterAnnotationService } from "./services/writing/chapter-annotation.service";
import { ChapterImportService } from "./services/writing/chapter-import.service";
import { ConsistencyEngineService } from "./services/consistency/consistency-engine.service";
import { ParallelOrchestratorService } from "./services/parallel/parallel-orchestrator.service";
import { WritingMissionService } from "./services/mission/writing-mission.service";
// DOME/SCORE Enhanced Services
import { StoryCompletionDetectorService } from "./services/quality/story-completion-detector.service";
import { TemporalConflictAnalyzerService } from "./services/consistency/temporal-conflict-analyzer.service";
import { HierarchicalSummaryService } from "./services/writing/hierarchical-summary.service";
import { SharedScratchpadService } from "./services/mission/shared-scratchpad.service";
import {
  CreateProjectDto,
  UpdateProjectDto,
  CreateCharacterDto,
  UpdateCharacterDto,
  CreateVolumeDto,
  CreateChapterDto,
  UpdateChapterDto,
  StartWritingDto,
} from "./dto";
import { getAllStylePresets, recommendStyleByGenre } from "./constants";
import type { RequestWithUser } from "../../../common/types/express-request.types";

@Controller("ai-writing")
@UseGuards(JwtAuthGuard)
export class AiWritingController {
  private readonly logger = new Logger(AiWritingController.name);

  constructor(
    private readonly aiWritingService: AiWritingService,
    private readonly projectService: ProjectService,
    private readonly storyBibleService: StoryBibleService,
    private readonly characterService: CharacterService,
    private readonly chapterWritingService: ChapterWritingService,
    private readonly chapterRevisionService: ChapterRevisionService,
    private readonly chapterAnnotationService: ChapterAnnotationService,
    private readonly chapterImportService: ChapterImportService,
    private readonly consistencyEngine: ConsistencyEngineService,
    private readonly parallelOrchestrator: ParallelOrchestratorService,
    private readonly writingMissionService: WritingMissionService,
    // DOME/SCORE Enhanced Services
    private readonly storyCompletionDetector: StoryCompletionDetectorService,
    private readonly temporalConflictAnalyzer: TemporalConflictAnalyzerService,
    private readonly hierarchicalSummaryService: HierarchicalSummaryService,
    private readonly sharedScratchpadService: SharedScratchpadService,
  ) {
    void this.logger;
    void this.aiWritingService;
  }

  // ==================== Writing Style Presets ====================

  /**
   * 获取所有写作风格预设（公开接口）
   */
  @Public()
  @Get("style-presets")
  getStylePresets() {
    return {
      presets: getAllStylePresets(),
    };
  }

  /**
   * 根据类型推荐写作风格
   */
  @Public()
  @Get("style-presets/recommend")
  getRecommendedStyles(@Query("genre") genre: string) {
    const recommendedIds = recommendStyleByGenre(genre || "");
    const allPresets = getAllStylePresets();
    const recommended = allPresets.filter((p) => recommendedIds.includes(p.id));
    return {
      genre,
      recommended,
      all: allPresets,
    };
  }

  // ==================== Project CRUD ====================

  @Post("projects")
  async createProject(
    @Request() req: RequestWithUser,
    @Body() dto: CreateProjectDto,
  ) {
    this.logger.log(`Creating writing project for user ${req.user.id}`);
    return this.projectService.create(req.user.id, dto);
  }

  @Get("projects")
  async getProjects(
    @Request() req: RequestWithUser,
    @Query("status") status?: string,
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string,
  ) {
    return this.projectService.findAll(req.user.id, {
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      cursor,
    });
  }

  @Get("projects/:id")
  async getProject(@Request() req: RequestWithUser, @Param("id") id: string) {
    return this.projectService.findOne(id, req.user.id);
  }

  @Patch("projects/:id")
  async updateProject(
    @Request() req: RequestWithUser,
    @Param("id") id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectService.update(id, req.user.id, dto);
  }

  @Delete("projects/:id")
  async deleteProject(
    @Request() req: RequestWithUser,
    @Param("id") id: string,
  ) {
    return this.projectService.delete(id, req.user.id);
  }

  // ==================== Story Bible ====================

  @Get("projects/:projectId/bible")
  async getStoryBible(
    @Request() req: RequestWithUser,
    @Param("projectId") projectId: string,
  ) {
    return this.storyBibleService.getByProject(projectId, req.user.id);
  }

  @Patch("projects/:projectId/bible")
  async updateStoryBible(
    @Request() req: RequestWithUser,
    @Param("projectId") projectId: string,
    @Body()
    dto: {
      premise?: string;
      theme?: string;
      tone?: string;
      worldType?: string;
    },
  ) {
    return this.storyBibleService.update(projectId, req.user.id, dto);
  }

  // ==================== Characters ====================

  @Post("projects/:projectId/characters")
  async createCharacter(
    @Request() req: RequestWithUser,
    @Param("projectId") projectId: string,
    @Body() dto: CreateCharacterDto,
  ) {
    return this.characterService.create(projectId, req.user.id, dto);
  }

  @Get("projects/:projectId/characters")
  async getCharacters(
    @Request() req: RequestWithUser,
    @Param("projectId") projectId: string,
  ) {
    return this.characterService.findAll(projectId, req.user.id);
  }

  @Get("projects/:projectId/characters/:id")
  async getCharacter(
    @Request() req: RequestWithUser,
    @Param("projectId") projectId: string,
    @Param("id") id: string,
  ) {
    return this.characterService.findOne(id, projectId, req.user.id);
  }

  @Patch("projects/:projectId/characters/:id")
  async updateCharacter(
    @Request() req: RequestWithUser,
    @Param("projectId") projectId: string,
    @Param("id") id: string,
    @Body() dto: UpdateCharacterDto,
  ) {
    return this.characterService.update(id, projectId, req.user.id, dto);
  }

  @Delete("projects/:projectId/characters/:id")
  async deleteCharacter(
    @Request() req: RequestWithUser,
    @Param("projectId") projectId: string,
    @Param("id") id: string,
  ) {
    return this.characterService.delete(id, projectId, req.user.id);
  }

  // ==================== Character Relationships ====================

  @Get("projects/:projectId/relationships/graph")
  async getRelationshipGraph(
    @Request() req: RequestWithUser,
    @Param("projectId") projectId: string,
  ) {
    return this.characterService.getRelationshipGraph(projectId, req.user.id);
  }

  @Post("projects/:projectId/characters/:characterId/relationships")
  async addRelationship(
    @Request() req: RequestWithUser,
    @Param("projectId") projectId: string,
    @Param("characterId") characterId: string,
    @Body()
    dto: {
      targetCharacterId: string;
      relationshipType: string;
      description?: string;
    },
  ) {
    return this.characterService.addRelationship(
      characterId,
      projectId,
      req.user.id,
      dto,
    );
  }

  @Delete("projects/:projectId/relationships/:relationshipId")
  async deleteRelationship(
    @Request() req: RequestWithUser,
    @Param("projectId") projectId: string,
    @Param("relationshipId") relationshipId: string,
  ) {
    return this.characterService.deleteRelationship(
      relationshipId,
      projectId,
      req.user.id,
    );
  }

  // ==================== Volumes ====================

  @Post("projects/:projectId/volumes")
  async createVolume(
    @Request() req: RequestWithUser,
    @Param("projectId") projectId: string,
    @Body() dto: CreateVolumeDto,
  ) {
    return this.projectService.createVolume(projectId, req.user.id, dto);
  }

  @Get("projects/:projectId/volumes")
  async getVolumes(
    @Request() req: RequestWithUser,
    @Param("projectId") projectId: string,
  ) {
    return this.projectService.getVolumes(projectId, req.user.id);
  }

  // ==================== Chapters ====================

  @Post("volumes/:volumeId/chapters")
  async createChapter(
    @Request() req: RequestWithUser,
    @Param("volumeId") volumeId: string,
    @Body() dto: CreateChapterDto,
  ) {
    return this.chapterWritingService.createChapter(volumeId, req.user.id, dto);
  }

  @Get("volumes/:volumeId/chapters")
  async getChapters(
    @Request() req: RequestWithUser,
    @Param("volumeId") volumeId: string,
  ) {
    return this.chapterWritingService.getChapters(volumeId, req.user.id);
  }

  @Get("chapters/:id")
  async getChapter(@Request() req: RequestWithUser, @Param("id") id: string) {
    return this.chapterWritingService.getChapter(id, req.user.id);
  }

  @Patch("chapters/:id")
  async updateChapter(
    @Request() req: RequestWithUser,
    @Param("id") id: string,
    @Body() dto: UpdateChapterDto,
  ) {
    return this.chapterWritingService.updateChapter(id, req.user.id, dto);
  }

  // ==================== Writing Actions ====================

  @Post("chapters/:id/write")
  async startWriting(
    @Request() req: RequestWithUser,
    @Param("id") id: string,
    @Body() dto: StartWritingDto,
  ) {
    this.logger.log(`Starting writing for chapter ${id}`);
    return this.chapterWritingService.startWriting(id, req.user.id, dto);
  }

  @Post("volumes/:volumeId/write-parallel")
  async startParallelWriting(
    @Request() req: RequestWithUser,
    @Param("volumeId") volumeId: string,
    @Body() dto: { maxParallel?: number },
  ) {
    this.logger.log(`Starting parallel writing for volume ${volumeId}`);
    return this.parallelOrchestrator.orchestrateParallelWriting(
      volumeId,
      req.user.id,
      dto,
    );
  }

  // ==================== Consistency ====================

  @Post("chapters/:id/check-consistency")
  async checkConsistency(
    @Request() req: RequestWithUser,
    @Param("id") id: string,
  ) {
    return this.consistencyEngine.validateChapter(id, req.user.id);
  }

  @Get("projects/:projectId/consistency-report")
  async getConsistencyReport(
    @Request() req: RequestWithUser,
    @Param("projectId") projectId: string,
  ) {
    return this.consistencyEngine.getProjectReport(projectId, req.user.id);
  }

  // ==================== AI Writing Missions ====================

  /**
   * 启动 AI 写作任务
   * 用户只需提供描述，AI 自动完成规划和写作
   */
  @Post("projects/:projectId/missions")
  async startMission(
    @Request() req: RequestWithUser,
    @Param("projectId") projectId: string,
    @Body()
    dto: {
      /** 写作指令/描述（必填） */
      prompt: string;
      /** 任务类型：outline(大纲) | chapter(章节) | full_story(完整故事) | edit(编辑调整) | consistency_check(一致性检查) */
      missionType?:
        | "outline"
        | "chapter"
        | "full_story"
        | "edit"
        | "consistency_check";
      /** 目标字数 */
      targetWordCount?: number;
      /** 额外指令 */
      additionalInstructions?: string;
      /** 目标 Agent（@mention 指定） */
      targetAgent?: string;
      /** 目标章节号（编辑特定章节时使用） */
      chapterNumber?: number;
      /** 多轮对话历史 */
      conversationHistory?: Array<{
        role: "user" | "assistant";
        content: string;
        timestamp?: string;
      }>;
    },
  ) {
    this.logger.log(
      `Starting AI writing mission for project ${projectId}: ${dto.missionType || "full_story"}`,
    );

    // 如果指定了章节号，查找对应的章节 ID
    let chapterId: string | undefined;
    if (dto.chapterNumber) {
      const chapter = await this.projectService.findChapterByNumber(
        projectId,
        dto.chapterNumber,
      );
      if (chapter) {
        chapterId = chapter.id;
      }
    }

    // 启动写作任务并获取 missionId
    const missionInfo = await this.writingMissionService.startMissionAsync(
      {
        projectId,
        missionType: dto.missionType || "full_story",
        userPrompt: dto.prompt,
        targetWordCount: dto.targetWordCount,
        additionalInstructions: dto.additionalInstructions,
        chapterId,
        targetAgent: dto.targetAgent,
        conversationHistory: dto.conversationHistory,
      },
      req.user.id,
    );

    // 返回任务已启动的信息（包含 missionId 用于轮询）
    return {
      success: true,
      message: "AI writing mission started",
      projectId,
      missionId: missionInfo.missionId,
      missionType: dto.missionType || "full_story",
    };
  }

  /**
   * 获取任务状态
   */
  @Get("missions/:missionId")
  async getMissionStatus(
    @Request() req: RequestWithUser,
    @Param("missionId") missionId: string,
  ) {
    return this.writingMissionService.getMissionStatus(missionId, req.user.id);
  }

  /**
   * 取消任务
   */
  @Post("missions/:missionId/cancel")
  async cancelMission(
    @Request() req: RequestWithUser,
    @Param("missionId") missionId: string,
  ) {
    return this.writingMissionService.cancelMission(missionId, req.user.id);
  }

  /**
   * 强制清理项目的卡住任务
   * 当任务状态不一致（显示有任务在运行但实际已卡死）时使用
   */
  @Post("projects/:projectId/force-cleanup")
  async forceCleanupStuckMissions(
    @Request() req: RequestWithUser,
    @Param("projectId") projectId: string,
  ) {
    // 先验证项目权限
    await this.projectService.findOne(projectId, req.user.id);
    return this.writingMissionService.forceCleanupStuckMissions(
      projectId,
      req.user.id,
    );
  }

  /**
   * 获取项目的所有任务
   */
  @Get("projects/:projectId/missions")
  async getProjectMissions(
    @Request() req: RequestWithUser,
    @Param("projectId") projectId: string,
    @Query("status") status?: string,
  ) {
    // 先验证项目权限
    await this.projectService.findOne(projectId, req.user.id);

    return this.writingMissionService.getProjectMissions(projectId, status);
  }

  /**
   * 获取任务日志（交互区消息）
   * @param limit - 返回条数限制
   * @param offset - 跳过前 N 条（用于分页加载历史）
   */
  @Get("missions/:missionId/logs")
  async getMissionLogs(
    @Request() req: RequestWithUser,
    @Param("missionId") missionId: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.writingMissionService.getMissionLogs(
      missionId,
      req.user.id,
      limit ? parseInt(limit, 10) : undefined,
      offset ? parseInt(offset, 10) : undefined,
    );
  }

  // ==================== Public API (无需登录) ====================

  /**
   * 公开阅读接口 - 获取项目内容（无需登录）
   * 只返回 visibility 为 PUBLIC 的项目
   */
  @Public()
  @Get("public/:projectId")
  async getPublicProject(@Param("projectId") projectId: string) {
    this.logger.log(`Public access to project ${projectId}`);

    const project = await this.projectService.findPublic(projectId);

    if (!project) {
      throw new NotFoundException("Project not found or not public");
    }

    return project;
  }

  // ==================== Admin: Reset Chapter Content ====================

  /**
   * 重置指定章节的内容（用于修复数据损坏）
   * 将章节内容清空，使其变为"待写"状态，续写时会重新生成
   */
  @Post("projects/:projectId/reset-chapters")
  async resetChapterContent(
    @Request() req: RequestWithUser,
    @Param("projectId") projectId: string,
    @Body()
    dto: {
      /** 要重置的章节号列表 */
      chapterNumbers: number[];
    },
  ) {
    this.logger.log(
      `Resetting chapters ${dto.chapterNumbers.join(", ")} for project ${projectId}`,
    );

    // 验证项目所有权
    await this.projectService.findOne(projectId, req.user.id);

    // 重置指定章节的内容
    const result = await this.projectService.resetChaptersByNumbers(
      projectId,
      dto.chapterNumbers,
    );

    this.logger.log(`Reset ${result.count} chapters`);

    return {
      success: true,
      resetCount: result.count,
      chapterNumbers: dto.chapterNumbers,
      message: `已重置 ${result.count} 个章节，使用"继续创作"可重新生成内容`,
    };
  }

  /**
   * 重新提取并更新项目所有章节的标题
   * 用于修复已有章节缺失标题的情况
   */
  @Post("projects/:projectId/fix-titles")
  async fixChapterTitles(
    @Request() req: RequestWithUser,
    @Param("projectId") projectId: string,
  ) {
    this.logger.log(`Re-extracting chapter titles for project ${projectId}`);

    const result = await this.writingMissionService.reExtractChapterTitles(
      projectId,
      req.user.id,
    );

    return {
      success: true,
      updated: result.updated,
      chapters: result.chapters,
      message: `已更新 ${result.updated} 个章节的标题`,
    };
  }

  // ==================== Chapter Revision (Version History) ====================

  /**
   * 获取章节修订历史
   */
  @Get("chapters/:chapterId/revisions")
  async getChapterRevisions(
    @Request() req: RequestWithUser,
    @Param("chapterId") chapterId: string,
  ) {
    return this.chapterRevisionService.getRevisions(chapterId, req.user.id);
  }

  /**
   * 更新章节内容（人工编辑，自动创建版本）
   */
  @Patch("chapters/:chapterId/content")
  async updateChapterContent(
    @Request() req: RequestWithUser,
    @Param("chapterId") chapterId: string,
    @Body() dto: { content: string; changeSummary?: string },
  ) {
    return this.chapterRevisionService.updateContent(
      chapterId,
      req.user.id,
      dto,
    );
  }

  /**
   * AI 辅助编辑章节
   */
  @Post("chapters/:chapterId/ai-edit")
  async aiEditChapter(
    @Request() req: RequestWithUser,
    @Param("chapterId") chapterId: string,
    @Body()
    dto: {
      operation: "rewrite" | "polish" | "expand" | "condense" | "style_fix";
      selection?: {
        startOffset: number;
        endOffset: number;
        originalText: string;
      };
      userFeedback: string;
      polishLevel?: "light" | "moderate" | "heavy";
      targetStyle?: {
        tone?: string;
        vocabulary?: string;
        sentenceLength?: string;
      };
    },
  ) {
    return this.chapterRevisionService.aiEdit(chapterId, req.user.id, dto);
  }

  /**
   * 比较两个版本
   */
  @Get("chapters/:chapterId/revisions/diff")
  async compareRevisions(
    @Request() req: RequestWithUser,
    @Param("chapterId") chapterId: string,
    @Query("v1") revisionId1: string,
    @Query("v2") revisionId2: string,
  ) {
    return this.chapterRevisionService.compareRevisions(
      chapterId,
      revisionId1,
      revisionId2,
      req.user.id,
    );
  }

  /**
   * 回退到指定版本
   */
  @Post("chapters/:chapterId/revisions/:revisionId/rollback")
  async rollbackRevision(
    @Request() req: RequestWithUser,
    @Param("chapterId") chapterId: string,
    @Param("revisionId") revisionId: string,
    @Body() dto: { reason?: string },
  ) {
    return this.chapterRevisionService.rollback(
      chapterId,
      revisionId,
      req.user.id,
      dto.reason,
    );
  }

  // ==================== Chapter Annotations ====================

  /**
   * 获取章节批注
   */
  @Get("chapters/:chapterId/annotations")
  async getChapterAnnotations(
    @Request() req: RequestWithUser,
    @Param("chapterId") chapterId: string,
    @Query("status") status?: string,
  ) {
    return this.chapterAnnotationService.getAnnotations(
      chapterId,
      req.user.id,
      status as any,
    );
  }

  /**
   * 创建批注
   */
  @Post("chapters/:chapterId/annotations")
  async createAnnotation(
    @Request() req: RequestWithUser,
    @Param("chapterId") chapterId: string,
    @Body()
    dto: {
      startOffset: number;
      endOffset: number;
      content: string;
      type?: "COMMENT" | "SUGGESTION" | "ISSUE" | "REFERENCE";
      selectedText?: string;
    },
  ) {
    return this.chapterAnnotationService.createAnnotation(
      chapterId,
      req.user.id,
      dto,
    );
  }

  /**
   * 更新批注
   */
  @Patch("chapters/:chapterId/annotations/:annotationId")
  async updateAnnotation(
    @Request() req: RequestWithUser,
    @Param("annotationId") annotationId: string,
    @Body()
    dto: { content?: string; status?: "OPEN" | "RESOLVED" | "DISMISSED" },
  ) {
    return this.chapterAnnotationService.updateAnnotation(
      annotationId,
      req.user.id,
      dto,
    );
  }

  /**
   * 删除批注
   */
  @Delete("chapters/:chapterId/annotations/:annotationId")
  async deleteAnnotation(
    @Request() req: RequestWithUser,
    @Param("annotationId") annotationId: string,
  ) {
    await this.chapterAnnotationService.deleteAnnotation(
      annotationId,
      req.user.id,
    );
    return { message: "Annotation deleted successfully" };
  }

  /**
   * 批量解决批注
   */
  @Post("chapters/:chapterId/annotations/resolve")
  async resolveAnnotations(
    @Request() req: RequestWithUser,
    @Param("chapterId") chapterId: string,
    @Body() dto: { annotationIds: string[] },
  ) {
    return this.chapterAnnotationService.resolveAnnotations(
      chapterId,
      req.user.id,
      dto.annotationIds,
    );
  }

  // ==================== Chapter Import ====================

  /**
   * 解析导入内容
   */
  @Post("projects/:projectId/import/parse")
  async parseImport(
    @Request() req: RequestWithUser,
    @Param("projectId") projectId: string,
    @Body()
    dto: {
      source: string;
      content?: string;
      sourceUrl?: string;
      fileName?: string;
      chapterPattern?: string;
      customPattern?: string;
    },
  ) {
    return this.chapterImportService.parseImport(
      projectId,
      req.user.id,
      dto as any,
    );
  }

  /**
   * 确认并执行导入
   */
  @Post("projects/:projectId/import/:importId/confirm")
  async confirmImport(
    @Request() req: RequestWithUser,
    @Param("projectId") projectId: string,
    @Param("importId") importId: string,
    @Body()
    dto: {
      targetVolumeId: string;
      startChapterNumber: number;
      selectedChapters: number[];
      conflictStrategy?: "skip" | "overwrite" | "append";
      postProcess?: {
        runConsistencyCheck?: boolean;
        extractToBible?: boolean;
      };
    },
  ) {
    return this.chapterImportService.confirmImport(
      projectId,
      importId,
      req.user.id,
      dto as any,
    );
  }

  /**
   * 获取导入状态
   */
  @Get("projects/:projectId/import/:importId")
  async getImportStatus(
    @Request() req: RequestWithUser,
    @Param("projectId") projectId: string,
    @Param("importId") importId: string,
  ) {
    return this.chapterImportService.getImportStatus(
      projectId,
      importId,
      req.user.id,
    );
  }

  /**
   * 获取导入历史
   */
  @Get("projects/:projectId/import/history")
  async getImportHistory(
    @Request() req: RequestWithUser,
    @Param("projectId") projectId: string,
  ) {
    return this.chapterImportService.getImportHistory(projectId, req.user.id);
  }

  /**
   * 取消导入
   */
  @Delete("projects/:projectId/import/:importId")
  async cancelImport(
    @Request() req: RequestWithUser,
    @Param("projectId") projectId: string,
    @Param("importId") importId: string,
  ) {
    return this.chapterImportService.cancelImport(
      projectId,
      importId,
      req.user.id,
    );
  }

  // ==================== DOME/SCORE Enhanced Features ====================

  /**
   * 获取故事完成度分析
   * 分析故事是否已经有自然结局
   */
  @Get("projects/:projectId/completion-analysis")
  async getCompletionAnalysis(
    @Request() req: RequestWithUser,
    @Param("projectId") projectId: string,
  ) {
    // 验证项目权限
    await this.projectService.findOne(projectId, req.user.id);

    const analysis =
      await this.storyCompletionDetector.analyzeCompletion(projectId);

    return {
      projectId,
      analysis,
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * 获取时间线冲突分析
   * 检测章节内容中的时间线矛盾
   */
  @Get("projects/:projectId/timeline-conflicts")
  async getTimelineConflicts(
    @Request() req: RequestWithUser,
    @Param("projectId") projectId: string,
  ) {
    // 验证项目权限
    await this.projectService.findOne(projectId, req.user.id);

    const result =
      await this.temporalConflictAnalyzer.analyzeProject(projectId);

    // Transform conflicts to frontend format
    const conflicts = result.conflicts.map((c) => ({
      id: `${c.chapter1}-${c.chapter2}-${c.entity}`,
      type: c.type,
      severity: this.mapConflictSeverity(c.severity),
      description: c.description,
      sourceChapter: c.chapter1,
      targetChapter: c.chapter2,
      subject: c.entity,
      conflictingStatements: [c.expected, c.found],
      suggestedResolution: c.suggestion,
    }));

    return {
      projectId,
      conflicts,
      totalConflicts: conflicts.length,
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * 获取章节的时间线冲突
   * 注意：需要提供项目ID和章节内容来分析
   */
  @Get("chapters/:chapterId/timeline-conflicts")
  async getChapterTimelineConflicts(
    @Request() req: RequestWithUser,
    @Param("chapterId") chapterId: string,
  ) {
    // 获取章节信息（同时验证权限）- getChapter 已包含 volume.project
    const chapter = await this.chapterWritingService.getChapter(
      chapterId,
      req.user.id,
    ) as {
      id: string;
      content: string | null;
      chapterNumber: number;
      volumeId: string;
      volume: { project: { id: string } };
    };

    if (!chapter.content) {
      return {
        chapterId,
        conflicts: [],
        totalConflicts: 0,
        analyzedAt: new Date().toISOString(),
      };
    }

    const projectId = chapter.volume.project.id;

    const result = await this.temporalConflictAnalyzer.analyzeChapter(
      projectId,
      chapter.chapterNumber,
      chapter.content,
    );

    // Transform conflicts to frontend format
    const conflicts = result.conflicts.map((c) => ({
      id: `${c.chapter1}-${c.chapter2}-${c.entity}`,
      type: c.type,
      severity: this.mapConflictSeverity(c.severity),
      description: c.description,
      sourceChapter: c.chapter1,
      targetChapter: c.chapter2,
      subject: c.entity,
      conflictingStatements: [c.expected, c.found],
      suggestedResolution: c.suggestion,
    }));

    return {
      chapterId,
      conflicts,
      totalConflicts: conflicts.length,
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * Map internal severity to frontend severity
   */
  private mapConflictSeverity(
    severity: "CRITICAL" | "WARNING" | "INFO",
  ): "HIGH" | "MEDIUM" | "LOW" {
    switch (severity) {
      case "CRITICAL":
        return "HIGH";
      case "WARNING":
        return "MEDIUM";
      case "INFO":
      default:
        return "LOW";
    }
  }

  /**
   * 获取层次摘要上下文
   * 用于展示故事的多层次摘要
   */
  @Get("projects/:projectId/hierarchical-summaries")
  async getHierarchicalSummaries(
    @Request() req: RequestWithUser,
    @Param("projectId") projectId: string,
    @Query("currentChapter") currentChapter?: string,
    @Query("targetTokens") targetTokens?: string,
  ) {
    // 验证项目权限
    await this.projectService.findOne(projectId, req.user.id);

    const context = await this.hierarchicalSummaryService.getHierarchicalContext(
      projectId,
      {
        currentChapter: currentChapter ? parseInt(currentChapter, 10) : 999,
        targetTokens: targetTokens ? parseInt(targetTokens, 10) : 4000,
      },
    );

    return {
      projectId,
      context,
      formattedContext:
        this.hierarchicalSummaryService.formatContextForPrompt(context),
    };
  }

  /**
   * 批量生成章节摘要
   */
  @Post("projects/:projectId/generate-summaries")
  async generateSummaries(
    @Request() req: RequestWithUser,
    @Param("projectId") projectId: string,
  ) {
    // 验证项目权限
    await this.projectService.findOne(projectId, req.user.id);

    const updatedCount =
      await this.hierarchicalSummaryService.batchUpdateSummaries(projectId);

    return {
      projectId,
      updatedCount,
      message: `成功生成 ${updatedCount} 个章节的摘要`,
    };
  }

  /**
   * 获取共享便签板内容
   * 展示 Agent 间的通信记录
   */
  @Get("projects/:projectId/scratchpad")
  async getScratchpad(
    @Request() req: RequestWithUser,
    @Param("projectId") projectId: string,
    @Query("type") type?: string,
    @Query("limit") limit?: string,
  ) {
    // 验证项目权限
    await this.projectService.findOne(projectId, req.user.id);

    const entries = await this.sharedScratchpadService.getEntries(projectId, {
      type: type as any,
      limit: limit ? parseInt(limit, 10) : 50,
    });

    return {
      projectId,
      entries,
      totalEntries: entries.length,
    };
  }

  /**
   * 获取项目分析仪表板数据
   * 汇总完成度、冲突、摘要等信息
   */
  @Get("projects/:projectId/analysis-dashboard")
  async getAnalysisDashboard(
    @Request() req: RequestWithUser,
    @Param("projectId") projectId: string,
  ) {
    // 验证项目权限
    const project = await this.projectService.findOne(projectId, req.user.id);

    // 并行获取所有分析数据
    const [completionAnalysis, conflictResult, scratchpadEntries] =
      await Promise.all([
        this.storyCompletionDetector.analyzeCompletion(projectId),
        this.temporalConflictAnalyzer.analyzeProject(projectId),
        this.sharedScratchpadService.getEntries(projectId, { limit: 10 }),
      ]);

    // Transform conflicts to frontend format
    const transformedConflicts = conflictResult.conflicts.map((c) => ({
      id: `${c.chapter1}-${c.chapter2}-${c.entity}`,
      type: c.type,
      severity: this.mapConflictSeverity(c.severity),
      description: c.description,
      sourceChapter: c.chapter1,
      targetChapter: c.chapter2,
      subject: c.entity,
      conflictingStatements: [c.expected, c.found],
      suggestedResolution: c.suggestion,
    }));

    return {
      projectId,
      projectName: project.name,
      completion: {
        isComplete: completionAnalysis.isComplete,
        confidence: completionAnalysis.confidence,
        signals: completionAnalysis.signals,
        recommendation: completionAnalysis.recommendation,
      },
      conflicts: {
        total: transformedConflicts.length,
        highSeverity: transformedConflicts.filter((c) => c.severity === "HIGH")
          .length,
        mediumSeverity: transformedConflicts.filter(
          (c) => c.severity === "MEDIUM",
        ).length,
        lowSeverity: transformedConflicts.filter((c) => c.severity === "LOW")
          .length,
        recentConflicts: transformedConflicts.slice(0, 5),
      },
      agentActivity: {
        recentEntries: scratchpadEntries,
        totalEntries: scratchpadEntries.length,
      },
      analyzedAt: new Date().toISOString(),
    };
  }
}
