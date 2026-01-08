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
} from "@nestjs/common";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { Public } from "../../../common/decorators/public.decorator";
import { AiWritingService } from "./ai-writing.service";
import { ProjectService } from "./services/writing/project.service";
import { StoryBibleService } from "./services/bible/story-bible.service";
import { CharacterService } from "./services/bible/character.service";
import { ChapterWritingService } from "./services/writing/chapter-writing.service";
import { ConsistencyEngineService } from "./services/consistency/consistency-engine.service";
import { ParallelOrchestratorService } from "./services/parallel/parallel-orchestrator.service";
import { WritingMissionService } from "./services/mission/writing-mission.service";
import { PrismaService } from "../../../common/prisma/prisma.service";
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
    private readonly consistencyEngine: ConsistencyEngineService,
    private readonly parallelOrchestrator: ParallelOrchestratorService,
    private readonly writingMissionService: WritingMissionService,
    private readonly prisma: PrismaService,
  ) {
    void this.logger;
    void this.aiWritingService;
  }

  // ==================== Project CRUD ====================

  @Post("projects")
  async createProject(@Request() req: any, @Body() dto: CreateProjectDto) {
    this.logger.log(`Creating writing project for user ${req.user.id}`);
    return this.projectService.create(req.user.id, dto);
  }

  @Get("projects")
  async getProjects(
    @Request() req: any,
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
  async getProject(@Request() req: any, @Param("id") id: string) {
    return this.projectService.findOne(id, req.user.id);
  }

  @Patch("projects/:id")
  async updateProject(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectService.update(id, req.user.id, dto);
  }

  @Delete("projects/:id")
  async deleteProject(@Request() req: any, @Param("id") id: string) {
    return this.projectService.delete(id, req.user.id);
  }

  // ==================== Story Bible ====================

  @Get("projects/:projectId/bible")
  async getStoryBible(
    @Request() req: any,
    @Param("projectId") projectId: string,
  ) {
    return this.storyBibleService.getByProject(projectId, req.user.id);
  }

  @Patch("projects/:projectId/bible")
  async updateStoryBible(
    @Request() req: any,
    @Param("projectId") projectId: string,
    @Body() dto: any,
  ) {
    return this.storyBibleService.update(projectId, req.user.id, dto);
  }

  // ==================== Characters ====================

  @Post("projects/:projectId/characters")
  async createCharacter(
    @Request() req: any,
    @Param("projectId") projectId: string,
    @Body() dto: CreateCharacterDto,
  ) {
    return this.characterService.create(projectId, req.user.id, dto);
  }

  @Get("projects/:projectId/characters")
  async getCharacters(
    @Request() req: any,
    @Param("projectId") projectId: string,
  ) {
    return this.characterService.findAll(projectId, req.user.id);
  }

  @Get("projects/:projectId/characters/:id")
  async getCharacter(
    @Request() req: any,
    @Param("projectId") projectId: string,
    @Param("id") id: string,
  ) {
    return this.characterService.findOne(id, projectId, req.user.id);
  }

  @Patch("projects/:projectId/characters/:id")
  async updateCharacter(
    @Request() req: any,
    @Param("projectId") projectId: string,
    @Param("id") id: string,
    @Body() dto: UpdateCharacterDto,
  ) {
    return this.characterService.update(id, projectId, req.user.id, dto);
  }

  @Delete("projects/:projectId/characters/:id")
  async deleteCharacter(
    @Request() req: any,
    @Param("projectId") projectId: string,
    @Param("id") id: string,
  ) {
    return this.characterService.delete(id, projectId, req.user.id);
  }

  // ==================== Volumes ====================

  @Post("projects/:projectId/volumes")
  async createVolume(
    @Request() req: any,
    @Param("projectId") projectId: string,
    @Body() dto: CreateVolumeDto,
  ) {
    return this.projectService.createVolume(projectId, req.user.id, dto);
  }

  @Get("projects/:projectId/volumes")
  async getVolumes(@Request() req: any, @Param("projectId") projectId: string) {
    return this.projectService.getVolumes(projectId, req.user.id);
  }

  // ==================== Chapters ====================

  @Post("volumes/:volumeId/chapters")
  async createChapter(
    @Request() req: any,
    @Param("volumeId") volumeId: string,
    @Body() dto: CreateChapterDto,
  ) {
    return this.chapterWritingService.createChapter(volumeId, req.user.id, dto);
  }

  @Get("volumes/:volumeId/chapters")
  async getChapters(@Request() req: any, @Param("volumeId") volumeId: string) {
    return this.chapterWritingService.getChapters(volumeId, req.user.id);
  }

  @Get("chapters/:id")
  async getChapter(@Request() req: any, @Param("id") id: string) {
    return this.chapterWritingService.getChapter(id, req.user.id);
  }

  @Patch("chapters/:id")
  async updateChapter(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateChapterDto,
  ) {
    return this.chapterWritingService.updateChapter(id, req.user.id, dto);
  }

  // ==================== Writing Actions ====================

  @Post("chapters/:id/write")
  async startWriting(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: StartWritingDto,
  ) {
    this.logger.log(`Starting writing for chapter ${id}`);
    return this.chapterWritingService.startWriting(id, req.user.id, dto);
  }

  @Post("volumes/:volumeId/write-parallel")
  async startParallelWriting(
    @Request() req: any,
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
  async checkConsistency(@Request() req: any, @Param("id") id: string) {
    return this.consistencyEngine.validateChapter(id, req.user.id);
  }

  @Get("projects/:projectId/consistency-report")
  async getConsistencyReport(
    @Request() req: any,
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
    @Request() req: any,
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
    },
  ) {
    this.logger.log(
      `Starting AI writing mission for project ${projectId}: ${dto.missionType || "full_story"}`,
    );

    // 如果指定了章节号，查找对应的章节 ID
    let chapterId: string | undefined;
    if (dto.chapterNumber) {
      const chapter = await this.prisma.writingChapter.findFirst({
        where: {
          volume: { projectId },
          chapterNumber: dto.chapterNumber,
        },
        select: { id: true },
      });
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
    @Request() req: any,
    @Param("missionId") missionId: string,
  ) {
    return this.writingMissionService.getMissionStatus(missionId, req.user.id);
  }

  /**
   * 取消任务
   */
  @Post("missions/:missionId/cancel")
  async cancelMission(
    @Request() req: any,
    @Param("missionId") missionId: string,
  ) {
    return this.writingMissionService.cancelMission(missionId, req.user.id);
  }

  /**
   * 获取项目的所有任务
   */
  @Get("projects/:projectId/missions")
  async getProjectMissions(
    @Request() req: any,
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
    @Request() req: any,
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
   */
  @Public()
  @Get("public/:projectId")
  async getPublicProject(@Param("projectId") projectId: string) {
    this.logger.log(`Public access to project ${projectId}`);

    // 查询项目（暂时不检查公开状态，后续可以添加 isPublic 字段）
    const project = await this.prisma.writingProject.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        description: true,
        genre: true,
        targetWords: true,
        currentWords: true,
        status: true,
        storyBible: {
          select: {
            premise: true,
            theme: true,
            tone: true,
            worldType: true,
          },
        },
        volumes: {
          select: {
            id: true,
            title: true,
            volumeNumber: true,
            chapters: {
              select: {
                id: true,
                title: true,
                content: true,
                chapterNumber: true,
                wordCount: true,
              },
              orderBy: { chapterNumber: "asc" },
            },
          },
          orderBy: { volumeNumber: "asc" },
        },
      },
    });

    if (!project) {
      return { error: "Project not found", statusCode: 404 };
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
    @Request() req: any,
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
    const result = await this.prisma.writingChapter.updateMany({
      where: {
        volume: { projectId },
        chapterNumber: { in: dto.chapterNumbers },
      },
      data: {
        content: "",
        wordCount: 0,
        status: "PLANNED",
      },
    });

    // 更新项目字数统计
    const totalWords = await this.prisma.writingChapter.aggregate({
      where: { volume: { projectId } },
      _sum: { wordCount: true },
    });

    await this.prisma.writingProject.update({
      where: { id: projectId },
      data: { currentWords: totalWords._sum.wordCount || 0 },
    });

    this.logger.log(`Reset ${result.count} chapters`);

    return {
      success: true,
      resetCount: result.count,
      chapterNumbers: dto.chapterNumbers,
      message: `已重置 ${result.count} 个章节，使用"继续创作"可重新生成内容`,
    };
  }
}
