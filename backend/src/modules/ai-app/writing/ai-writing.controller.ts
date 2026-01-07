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
import { AiWritingService } from "./ai-writing.service";
import { ProjectService } from "./services/writing/project.service";
import { StoryBibleService } from "./services/bible/story-bible.service";
import { CharacterService } from "./services/bible/character.service";
import { ChapterWritingService } from "./services/writing/chapter-writing.service";
import { ConsistencyEngineService } from "./services/consistency/consistency-engine.service";
import { ParallelOrchestratorService } from "./services/parallel/parallel-orchestrator.service";
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
}
