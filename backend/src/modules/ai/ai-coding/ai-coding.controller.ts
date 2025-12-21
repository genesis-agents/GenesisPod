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
  CreateProjectDto,
  UpdateProjectDto,
  StartProjectDto,
  IterateProjectDto,
} from "./dto";
import { AiCodingProjectStatus } from "@prisma/client";

@Controller("ai-coding")
@UseGuards(JwtAuthGuard)
export class AiCodingController {
  private readonly logger = new Logger(AiCodingController.name);

  constructor(private readonly aiCodingService: AiCodingService) {}

  // ==================== Project CRUD ====================

  /**
   * 创建项目
   * POST /api/v1/ai-coding/projects
   */
  @Post("projects")
  async createProject(@Request() req: any, @Body() dto: CreateProjectDto) {
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
}
