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
  Res,
  Logger,
} from "@nestjs/common";
import { Response } from "express";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { AiCodingService } from "./ai-coding.service";
import {
  StandardsService,
  ComplianceService,
  GithubOAuthService,
  GithubRepoService,
  DocumentService,
  CodingTaskService,
} from "./services";
import {
  CreateCodingProjectDto,
  UpdateProjectDto,
  StartProjectDto,
  IterateProjectDto,
  CreateStandardDto,
  UpdateStandardDto,
  ApplyTemplateDto,
  CreateRepoDto,
  PushToRepoDto,
  CreateBranchDto,
  CreatePRDto,
  GithubCallbackDto,
  CheckComplianceDto,
} from "./dto";
import { AiCodingProjectStatus, AiCodingDocumentType } from "@prisma/client";

@Controller("ai-coding")
@UseGuards(JwtAuthGuard)
export class AiCodingController {
  private readonly logger = new Logger(AiCodingController.name);

  constructor(
    private readonly aiCodingService: AiCodingService,
    private readonly standardsService: StandardsService,
    private readonly complianceService: ComplianceService,
    private readonly githubOAuthService: GithubOAuthService,
    private readonly githubRepoService: GithubRepoService,
    private readonly documentService: DocumentService,
    private readonly codingTaskService: CodingTaskService,
  ) {}

  // ==================== Project CRUD ====================

  /**
   * 创建项目
   * POST /api/v1/ai-coding/projects
   */
  @Post("projects")
  async createProject(
    @Request() req: any,
    @Body() dto: CreateCodingProjectDto,
  ) {
    this.logger.log(`Creating project for user ${req.user.id}`);
    return this.aiCodingService.createProject(req.user.id, dto);
  }

  /**
   * 获取项目列表
   * GET /api/v1/ai-coding/projects
   */
  @Get("projects")
  async getProjects(
    @Request() req: any,
    @Query("status") status?: AiCodingProjectStatus,
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string,
  ) {
    return this.aiCodingService.getProjects(req.user.id, {
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      cursor,
    });
  }

  /**
   * 获取项目详情
   * GET /api/v1/ai-coding/projects/:id
   */
  @Get("projects/:id")
  async getProjectById(@Request() req: any, @Param("id") id: string) {
    return this.aiCodingService.getProjectById(id, req.user.id);
  }

  /**
   * 更新项目
   * PATCH /api/v1/ai-coding/projects/:id
   */
  @Patch("projects/:id")
  async updateProject(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.aiCodingService.updateProject(id, req.user.id, dto);
  }

  /**
   * 删除项目
   * DELETE /api/v1/ai-coding/projects/:id
   */
  @Delete("projects/:id")
  async deleteProject(@Request() req: any, @Param("id") id: string) {
    await this.aiCodingService.deleteProject(id, req.user.id);
    return { success: true, message: "Project deleted" };
  }

  // ==================== Project Execution ====================

  /**
   * 启动项目（开始多智能体协作）
   * POST /api/v1/ai-coding/projects/:id/start
   */
  @Post("projects/:id/start")
  async startProject(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto?: StartProjectDto,
  ) {
    this.logger.log(`Starting project ${id} for user ${req.user.id}`);
    return this.aiCodingService.startProject(id, req.user.id, dto);
  }

  /**
   * 检查项目是否可以恢复
   * GET /api/v1/ai-coding/projects/:id/can-resume
   */
  @Get("projects/:id/can-resume")
  async canResumeProject(@Request() req: any, @Param("id") id: string) {
    // 验证项目归属
    await this.aiCodingService.getProjectById(id, req.user.id);
    return this.codingTaskService.canResume(id);
  }

  /**
   * 恢复项目执行（从检查点继续）
   * POST /api/v1/ai-coding/projects/:id/resume
   */
  @Post("projects/:id/resume")
  async resumeProject(@Request() req: any, @Param("id") id: string) {
    this.logger.log(`Resuming project ${id} for user ${req.user.id}`);
    return this.aiCodingService.resumeProject(id, req.user.id);
  }

  /**
   * 迭代项目（基于反馈修改）
   * POST /api/v1/ai-coding/projects/:id/iterate
   */
  @Post("projects/:id/iterate")
  async iterateProject(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: IterateProjectDto,
  ) {
    this.logger.log(`Iterating project ${id} for user ${req.user.id}`);
    return this.aiCodingService.iterateProject(id, req.user.id, dto);
  }

  // ==================== Code Files ====================

  /**
   * 获取项目代码文件
   * GET /api/v1/ai-coding/projects/:id/files
   */
  @Get("projects/:id/files")
  async getProjectFiles(@Request() req: any, @Param("id") id: string) {
    return this.aiCodingService.getProjectFiles(id, req.user.id);
  }

  /**
   * 下载项目 ZIP
   * GET /api/v1/ai-coding/projects/:id/download
   */
  @Get("projects/:id/download")
  async downloadProject(
    @Request() req: any,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const { stream, filename } = await this.aiCodingService.downloadProject(
      id,
      req.user.id,
    );

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    stream.pipe(res);
  }

  // ==================== Templates ====================

  /**
   * 获取项目模板列表
   * GET /api/v1/ai-coding/templates
   */
  @Get("templates")
  async getTemplates() {
    return [
      {
        id: "webapp",
        name: "Web Application",
        description:
          "Full-stack web application with React frontend and Node.js backend",
        icon: "🌐",
        techStack: {
          frontend: "React",
          backend: "Node.js",
          database: "PostgreSQL",
          language: "TypeScript",
        },
      },
      {
        id: "cli",
        name: "CLI Tool",
        description: "Command-line tool with rich argument parsing",
        icon: "⌨️",
        techStack: {
          language: "Python",
        },
      },
      {
        id: "api",
        name: "REST API",
        description: "RESTful API server with authentication and database",
        icon: "🔌",
        techStack: {
          backend: "Node.js",
          database: "PostgreSQL",
          language: "TypeScript",
        },
      },
      {
        id: "data-analysis",
        name: "Data Analysis",
        description: "Data analysis and visualization project",
        icon: "📊",
        techStack: {
          language: "Python",
        },
      },
    ];
  }

  // ==================== Engineering Standards ====================

  /**
   * 获取用户的工程规范列表
   * GET /api/v1/ai-coding/standards
   */
  @Get("standards")
  async getStandards(@Request() req: any) {
    return this.standardsService.getUserStandards(req.user.id);
  }

  /**
   * 获取可用的规范模板
   * GET /api/v1/ai-coding/standards/templates
   */
  @Get("standards/templates")
  async getStandardTemplates() {
    return this.standardsService.getTemplates();
  }

  /**
   * 创建自定义规范
   * POST /api/v1/ai-coding/standards
   */
  @Post("standards")
  async createStandard(@Request() req: any, @Body() dto: CreateStandardDto) {
    return this.standardsService.createStandard(req.user.id, dto);
  }

  /**
   * 应用规范模板
   * POST /api/v1/ai-coding/standards/apply-template
   */
  @Post("standards/apply-template")
  async applyStandardTemplate(
    @Request() req: any,
    @Body() dto: ApplyTemplateDto,
  ) {
    return this.standardsService.applyTemplate(req.user.id, dto.templateId);
  }

  /**
   * 获取单个规范
   * GET /api/v1/ai-coding/standards/:id
   */
  @Get("standards/:id")
  async getStandardById(@Request() req: any, @Param("id") id: string) {
    return this.standardsService.getStandardById(id, req.user.id);
  }

  /**
   * 更新规范
   * PATCH /api/v1/ai-coding/standards/:id
   */
  @Patch("standards/:id")
  async updateStandard(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateStandardDto,
  ) {
    return this.standardsService.updateStandard(id, req.user.id, dto);
  }

  /**
   * 删除规范
   * DELETE /api/v1/ai-coding/standards/:id
   */
  @Delete("standards/:id")
  async deleteStandard(@Request() req: any, @Param("id") id: string) {
    await this.standardsService.deleteStandard(id, req.user.id);
    return { success: true, message: "Standard deleted" };
  }

  // ==================== Compliance Checking ====================

  /**
   * 运行项目合规性检查
   * POST /api/v1/ai-coding/projects/:id/compliance/check
   */
  @Post("projects/:id/compliance/check")
  async checkCompliance(
    @Request() req: any,
    @Param("id") projectId: string,
    @Body() dto?: CheckComplianceDto,
  ) {
    this.logger.log(`Running compliance check for project ${projectId}`);
    return this.complianceService.checkCompliance(projectId, req.user.id, dto);
  }

  /**
   * 获取项目的合规性报告
   * GET /api/v1/ai-coding/projects/:id/compliance
   */
  @Get("projects/:id/compliance")
  async getComplianceReports(
    @Request() req: any,
    @Param("id") projectId: string,
  ) {
    return this.complianceService.getProjectReports(projectId, req.user.id);
  }

  /**
   * 获取单个合规性报告
   * GET /api/v1/ai-coding/compliance/:reportId
   */
  @Get("compliance/:reportId")
  async getComplianceReportById(
    @Request() req: any,
    @Param("reportId") reportId: string,
  ) {
    return this.complianceService.getReportById(reportId, req.user.id);
  }

  // ==================== GitHub Integration ====================

  /**
   * 获取 GitHub 连接状态
   * GET /api/v1/ai-coding/github/status
   */
  @Get("github/status")
  async getGithubStatus(@Request() req: any) {
    return this.githubOAuthService.getStatus(req.user.id);
  }

  /**
   * 获取 GitHub OAuth 授权 URL
   * GET /api/v1/ai-coding/github/auth
   */
  @Get("github/auth")
  async getGithubAuthUrl(@Request() req: any) {
    const state = Buffer.from(
      JSON.stringify({ userId: req.user.id, timestamp: Date.now() }),
    ).toString("base64");
    const url = this.githubOAuthService.getAuthorizationUrl(state);
    return { url, state };
  }

  /**
   * GitHub OAuth 回调（不需要认证）
   * GET /api/v1/ai-coding/github/callback
   */
  @Get("github/callback")
  async githubCallback(@Query() dto: GithubCallbackDto, @Res() res: Response) {
    try {
      const stateData = JSON.parse(
        Buffer.from(dto.state, "base64").toString("utf-8"),
      );
      const tokenData = await this.githubOAuthService.exchangeCodeForToken(
        dto.code,
      );
      const userData = await this.githubOAuthService.getGithubUser(
        tokenData.access_token,
      );
      await this.githubOAuthService.saveConnection(
        stateData.userId,
        tokenData,
        userData,
      );

      // 重定向回前端
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3001";
      res.redirect(`${frontendUrl}/ai-coding?github=connected`);
    } catch (error) {
      this.logger.error("GitHub OAuth callback failed", error);
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3001";
      res.redirect(`${frontendUrl}/ai-coding?github=error`);
    }
  }

  /**
   * 断开 GitHub 连接
   * DELETE /api/v1/ai-coding/github/disconnect
   */
  @Delete("github/disconnect")
  async disconnectGithub(@Request() req: any) {
    await this.githubOAuthService.disconnect(req.user.id);
    return { success: true, message: "GitHub disconnected" };
  }

  /**
   * 为项目创建 GitHub 仓库
   * POST /api/v1/ai-coding/projects/:id/github/repo
   */
  @Post("projects/:id/github/repo")
  async createGithubRepo(
    @Request() req: any,
    @Param("id") projectId: string,
    @Body() dto: CreateRepoDto,
  ) {
    return this.githubRepoService.createRepository(projectId, req.user.id, dto);
  }

  /**
   * 获取项目的 GitHub 仓库信息
   * GET /api/v1/ai-coding/projects/:id/github
   */
  @Get("projects/:id/github")
  async getGithubRepoInfo(@Request() req: any, @Param("id") projectId: string) {
    return this.githubRepoService.getRepoInfo(projectId, req.user.id);
  }

  /**
   * 推送代码到 GitHub
   * POST /api/v1/ai-coding/projects/:id/github/push
   */
  @Post("projects/:id/github/push")
  async pushToGithub(
    @Request() req: any,
    @Param("id") projectId: string,
    @Body() dto?: PushToRepoDto,
  ) {
    return this.githubRepoService.pushToRepository(projectId, req.user.id, dto);
  }

  /**
   * 创建新分支
   * POST /api/v1/ai-coding/projects/:id/github/branches
   */
  @Post("projects/:id/github/branches")
  async createBranch(
    @Request() req: any,
    @Param("id") projectId: string,
    @Body() dto: CreateBranchDto,
  ) {
    return this.githubRepoService.createBranch(projectId, req.user.id, dto);
  }

  /**
   * 创建 Pull Request
   * POST /api/v1/ai-coding/projects/:id/github/prs
   */
  @Post("projects/:id/github/prs")
  async createPullRequest(
    @Request() req: any,
    @Param("id") projectId: string,
    @Body() dto: CreatePRDto,
  ) {
    return this.githubRepoService.createPullRequest(
      projectId,
      req.user.id,
      dto,
    );
  }

  /**
   * 获取项目的 Pull Requests
   * GET /api/v1/ai-coding/projects/:id/github/prs
   */
  @Get("projects/:id/github/prs")
  async getPullRequests(@Request() req: any, @Param("id") projectId: string) {
    return this.githubRepoService.getPullRequests(projectId, req.user.id);
  }

  /**
   * 同步 PR 状态
   * POST /api/v1/ai-coding/projects/:id/github/sync
   */
  @Post("projects/:id/github/sync")
  async syncGithubStatus(@Request() req: any, @Param("id") projectId: string) {
    await this.githubRepoService.syncPRStatus(projectId, req.user.id);
    return { success: true, message: "GitHub status synced" };
  }

  // ==================== Documents ====================

  /**
   * 获取项目的文档列表
   * GET /api/v1/ai-coding/projects/:id/documents
   */
  @Get("projects/:id/documents")
  async getProjectDocuments(
    @Request() req: any,
    @Param("id") projectId: string,
    @Query("type") type?: string,
  ) {
    // 验证用户对项目的访问权限
    await this.aiCodingService.getProjectById(projectId, req.user.id);

    const docType = type as AiCodingDocumentType | undefined;
    return this.documentService.getProjectDocuments(projectId, docType);
  }

  /**
   * 获取单个文档
   * GET /api/v1/ai-coding/documents/:id
   */
  @Get("documents/:id")
  async getDocumentById(@Request() req: any, @Param("id") docId: string) {
    return this.documentService.getDocumentById(docId, req.user.id);
  }

  /**
   * 重新生成文档
   * POST /api/v1/ai-coding/projects/:id/documents/regenerate
   */
  @Post("projects/:id/documents/regenerate")
  async regenerateDocument(
    @Request() req: any,
    @Param("id") projectId: string,
    @Query("type") type: string,
  ) {
    const docType = type as AiCodingDocumentType;
    return this.documentService.regenerateDocument(
      projectId,
      docType,
      req.user.id,
    );
  }
}
