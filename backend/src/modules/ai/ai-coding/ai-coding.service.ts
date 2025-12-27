import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AiChatService } from "../ai-core/ai-chat.service";
import {
  AiCodingProjectStatus,
  AiCodingAgentStatus,
  AiCodingProject,
  Prisma,
} from "@prisma/client";
import {
  CreateCodingProjectDto,
  UpdateProjectDto,
  StartProjectDto,
  IterateProjectDto,
} from "./dto";
import {
  DocumentService,
  StandardsService,
  ProjectEventEmitterService,
  CodingTaskService,
  CodingTaskPhase,
  TaskCheckpoint,
  CodingTeamService,
  DefaultAIModel,
} from "./services";
import { CodingMessageType, CodingAgentRole } from "@prisma/client";
import * as archiver from "archiver";
import { PassThrough } from "stream";

/**
 * AI Coding Agent 类型
 */
export enum CodingAgentType {
  PM = "pm", // 产品经理
  ARCHITECT = "architect", // 架构师
  PM_LEAD = "pmLead", // 项目经理
  ENGINEER = "engineer", // 工程师
  QA = "qa", // QA工程师
}

/**
 * 项目产出物结构
 */
interface ProjectOutputs {
  prd?: {
    overview: string;
    userStories: Array<{ id: string; description: string; priority: string }>;
    functionalRequirements: string[];
    nonFunctionalRequirements: string[];
    acceptanceCriteria: string[];
  };
  design?: {
    architecture: string;
    dataModels: Array<{ name: string; fields: string[] }>;
    apiDesign: Array<{ method: string; path: string; description: string }>;
    directoryStructure: string;
  };
  tasks?: Array<{
    id: string;
    title: string;
    description: string;
    status: string;
  }>;
  code?: {
    files: Array<{ path: string; language: string; content?: string }>;
    entryPoint: string;
    buildCommand: string;
    runCommand: string;
  };
  tests?: {
    testFiles: string[];
    coverage: number;
  };
  [key: string]: unknown;
}

@Injectable()
export class AiCodingService {
  private readonly logger = new Logger(AiCodingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiChatService: AiChatService,
    private readonly documentService: DocumentService,
    private readonly standardsService: StandardsService,
    private readonly eventEmitter: ProjectEventEmitterService,
    private readonly codingTaskService: CodingTaskService,
    private readonly teamService: CodingTeamService,
  ) {}

  /**
   * 发送 Agent 输出消息到团队聊天
   * 同时保存到数据库并通过 WebSocket 广播
   */
  private async sendAgentMessage(
    projectId: string,
    role: CodingAgentRole,
    content: string,
    messageType: CodingMessageType = CodingMessageType.OUTPUT,
  ): Promise<void> {
    try {
      // 保存消息到数据库
      const message = await this.teamService.sendMessage({
        projectId,
        senderRole: role,
        content,
        messageType,
      });

      // 通过 WebSocket 广播消息
      await this.eventEmitter.emitTeamMessage(projectId, {
        id: message.id,
        senderId: message.senderId || undefined,
        senderRole: message.senderRole || undefined,
        content: message.content,
        messageType: message.messageType,
        metadata: message.metadata as Record<string, unknown> | undefined,
        createdAt: message.createdAt,
      });

      this.logger.debug(
        `[${projectId}] Sent and emitted message: ${messageType} from ${role}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to send agent message: ${(error as Error).message}`,
      );
    }
  }

  /**
   * 创建项目
   */
  async createProject(
    userId: string,
    dto: CreateCodingProjectDto,
  ): Promise<AiCodingProject> {
    const project = await this.prisma.aiCodingProject.create({
      data: {
        userId,
        name: dto.name,
        description: dto.description,
        requirement: dto.requirement,
        techStack: (dto.techStack || {}) as Prisma.InputJsonValue,
        template: dto.template,
        status: AiCodingProjectStatus.DRAFT,
        agentStatus: {
          pm: { status: "PENDING" },
          architect: { status: "PENDING" },
          pmLead: { status: "PENDING" },
          engineer: { status: "PENDING" },
          qa: { status: "PENDING" },
        },
        outputs: {},
      },
    });

    this.logger.log(`Project created: ${project.id}`);
    return project;
  }

  /**
   * 获取用户项目列表
   */
  async getProjects(
    userId: string,
    options?: {
      status?: AiCodingProjectStatus;
      limit?: number;
      cursor?: string;
    },
  ) {
    const { status, limit = 20, cursor } = options || {};

    const projects = await this.prisma.aiCodingProject.findMany({
      where: {
        userId,
        ...(status && { status }),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
      include: {
        _count: {
          select: { files: true },
        },
      },
    });

    const hasMore = projects.length > limit;
    if (hasMore) projects.pop();

    return {
      projects,
      nextCursor: hasMore ? projects[projects.length - 1]?.id : null,
    };
  }

  /**
   * 获取项目详情
   */
  async getProjectById(projectId: string, userId: string) {
    const project = await this.prisma.aiCodingProject.findFirst({
      where: { id: projectId, userId },
      include: {
        files: true,
        agentLogs: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        iterations: {
          orderBy: { version: "desc" },
        },
      },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    return project;
  }

  /**
   * 更新项目
   */
  async updateProject(
    projectId: string,
    userId: string,
    dto: UpdateProjectDto,
  ): Promise<AiCodingProject> {
    const project = await this.prisma.aiCodingProject.findFirst({
      where: { id: projectId, userId },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    if (project.status === AiCodingProjectStatus.PROCESSING) {
      throw new Error("Cannot update project while processing");
    }

    return this.prisma.aiCodingProject.update({
      where: { id: projectId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description && { description: dto.description }),
        ...(dto.requirement && { requirement: dto.requirement }),
        ...(dto.techStack && {
          techStack: dto.techStack as Prisma.InputJsonValue,
        }),
        ...(dto.template && { template: dto.template }),
      },
    });
  }

  /**
   * 删除项目
   */
  async deleteProject(projectId: string, userId: string): Promise<void> {
    const project = await this.prisma.aiCodingProject.findFirst({
      where: { id: projectId, userId },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    await this.prisma.aiCodingProject.delete({
      where: { id: projectId },
    });

    this.logger.log(`Project deleted: ${projectId}`);
  }

  /**
   * 启动项目处理（多智能体协作）
   */
  async startProject(
    projectId: string,
    userId: string,
    dto?: StartProjectDto,
  ): Promise<AiCodingProject> {
    const project = await this.prisma.aiCodingProject.findFirst({
      where: { id: projectId, userId },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    if (project.status === AiCodingProjectStatus.PROCESSING) {
      throw new Error("Project is already processing");
    }

    // 更新状态为处理中
    const updatedProject = await this.prisma.aiCodingProject.update({
      where: { id: projectId },
      data: {
        status: AiCodingProjectStatus.PROCESSING,
        startedAt: new Date(),
        progress: 0,
      },
    });

    // 异步执行多智能体处理流程
    this.executeAgentPipeline(projectId, dto?.options).catch((error) => {
      this.logger.error(
        `Agent pipeline failed for project ${projectId}`,
        error,
      );
      this.prisma.aiCodingProject.update({
        where: { id: projectId },
        data: {
          status: AiCodingProjectStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
    });

    return updatedProject;
  }

  /**
   * 执行多智能体协作流程
   */
  private async executeAgentPipeline(
    projectId: string,
    _options?: StartProjectDto["options"],
  ): Promise<void> {
    const project = await this.prisma.aiCodingProject.findUnique({
      where: { id: projectId },
    });

    if (!project) return;

    const outputs: ProjectOutputs = {};
    const techStack = project.techStack as Record<string, string>;

    // 获取用户的工程规范用于注入到 Agent prompts
    let standardsContext = "";
    try {
      standardsContext = await this.standardsService.getStandardsForAgent(
        project.userId,
      );
    } catch (e) {
      this.logger.warn("Failed to get standards for agent", e);
    }

    try {
      // Step 0: 获取系统配置的默认 AI 模型
      this.logger.log(`[${projectId}] Step 0: Getting default AI model...`);
      let aiModel: DefaultAIModel;
      try {
        aiModel = await this.teamService.getDefaultChatModel();
        this.logger.log(
          `[${projectId}] Using AI model: ${aiModel.displayName} (${aiModel.provider}/${aiModel.modelId})`,
        );

        // 发送模型信息到团队聊天
        await this.sendAgentMessage(
          projectId,
          CodingAgentRole.PM,
          `**AI 团队启动**\n\n使用模型: ${aiModel.displayName} (${aiModel.provider})\n模型 ID: ${aiModel.modelId}\n\n开始执行任务...`,
          CodingMessageType.SYSTEM,
        );
      } catch (modelError) {
        const errorMsg =
          modelError instanceof Error ? modelError.message : String(modelError);
        this.logger.error(`[${projectId}] Failed to get AI model: ${errorMsg}`);

        // 发送错误消息到团队聊天
        await this.sendAgentMessage(
          projectId,
          CodingAgentRole.PM,
          `**AI 模型配置错误**\n\n${errorMsg}\n\n请在管理后台 → AI 模型管理中配置至少一个 CHAT 类型的模型。`,
          CodingMessageType.ERROR,
        );

        throw new Error(`AI 模型未配置: ${errorMsg}`);
      }

      // Step 1: PM 生成 PRD (15%)
      this.logger.log(`[${projectId}] Step 1: PM generating PRD...`);
      await this.updateAgentStatus(projectId, CodingAgentType.PM, "RUNNING");
      await this.eventEmitter.emitProgress({
        projectId,
        phase: "pm",
        status: "started",
        progress: 0,
        message: "产品经理开始分析需求...",
      });
      await this.eventEmitter.emitAgentStatus({
        projectId,
        agent: "pm",
        status: "running",
        message: "正在生成 PRD 文档...",
      });

      const prd = await this.runPMAgent(
        project.requirement,
        techStack,
        standardsContext,
        aiModel,
      );
      outputs.prd = prd;
      await this.updateAgentStatus(projectId, CodingAgentType.PM, "COMPLETED");
      await this.updateProgress(projectId, 15, { prd });
      await this.eventEmitter.emitProgress({
        projectId,
        phase: "pm",
        status: "completed",
        progress: 15,
        message: "PRD 生成完成",
        data: { prd },
      });
      await this.eventEmitter.emitAgentStatus({
        projectId,
        agent: "pm",
        status: "completed",
        message: "PRD 文档已生成",
        output: prd,
      });

      // 发送 PM 输出消息到团队聊天
      if (prd) {
        const prdContent = `## 产品需求文档 (PRD)

### 项目概述
${prd.overview || "暂无概述"}

### 用户故事
${prd.userStories?.map((s) => `- [${s.priority}] ${s.description}`).join("\n") || "暂无用户故事"}

### 功能需求
${prd.functionalRequirements?.map((r) => `- ${r}`).join("\n") || "暂无功能需求"}

### 非功能需求
${prd.nonFunctionalRequirements?.map((r) => `- ${r}`).join("\n") || "暂无非功能需求"}

### 验收标准
${prd.acceptanceCriteria?.map((c) => `- ${c}`).join("\n") || "暂无验收标准"}`;

        await this.sendAgentMessage(
          projectId,
          CodingAgentRole.PM,
          prdContent,
          CodingMessageType.OUTPUT,
        );
      }

      // 生成 PRD 文档
      this.logger.log(`[${projectId}] Generating PRD document...`);
      if (prd) {
        await this.documentService.generatePRD(
          projectId,
          prd,
          {
            name: project.name,
            description: project.description,
            requirement: project.requirement,
          },
          aiModel,
        );
      }
      await this.updateProgress(projectId, 20, {});
      await this.eventEmitter.emitProgress({
        projectId,
        phase: "document",
        status: "progress",
        progress: 20,
        message: "PRD 文档已保存",
      });

      // Step 2: Architect 生成设计 (30%)
      this.logger.log(`[${projectId}] Step 2: Architect generating design...`);
      await this.updateAgentStatus(
        projectId,
        CodingAgentType.ARCHITECT,
        "RUNNING",
      );
      await this.eventEmitter.emitProgress({
        projectId,
        phase: "architect",
        status: "started",
        progress: 20,
        message: "架构师开始设计系统架构...",
      });
      await this.eventEmitter.emitAgentStatus({
        projectId,
        agent: "architect",
        status: "running",
        message: "正在生成技术设计文档...",
      });

      const design = await this.runArchitectAgent(
        prd,
        techStack,
        standardsContext,
        aiModel,
      );
      outputs.design = design;
      await this.updateAgentStatus(
        projectId,
        CodingAgentType.ARCHITECT,
        "COMPLETED",
      );
      await this.updateProgress(projectId, 30, { design });
      await this.eventEmitter.emitProgress({
        projectId,
        phase: "architect",
        status: "completed",
        progress: 30,
        message: "技术设计完成",
        data: { design },
      });
      await this.eventEmitter.emitAgentStatus({
        projectId,
        agent: "architect",
        status: "completed",
        message: "架构设计已完成",
        output: design,
      });

      // 发送 Architect 输出消息到团队聊天
      if (design) {
        const designContent = `## 系统架构设计

### 架构概述
${design.architecture || "暂无架构描述"}

### 数据模型
${design.dataModels?.map((m) => `**${m.name}**: ${m.fields.join(", ")}`).join("\n") || "暂无数据模型"}

### API 设计
${design.apiDesign?.map((a) => `- \`${a.method} ${a.path}\` - ${a.description}`).join("\n") || "暂无 API 设计"}

### 目录结构
\`\`\`
${design.directoryStructure || "暂无目录结构"}
\`\`\``;

        await this.sendAgentMessage(
          projectId,
          CodingAgentRole.ARCHITECT,
          designContent,
          CodingMessageType.OUTPUT,
        );
      }

      // 生成设计文档
      this.logger.log(`[${projectId}] Generating Design document...`);
      if (design) {
        await this.documentService.generateDesignDoc(
          projectId,
          design,
          {
            name: project.name,
            techStack,
          },
          aiModel,
        );
      }
      await this.updateProgress(projectId, 35, {});

      // 生成 API 文档
      this.logger.log(`[${projectId}] Generating API document...`);
      if (design) {
        await this.documentService.generateAPIDoc(
          projectId,
          design.apiDesign || [],
          design.dataModels || [],
          { name: project.name },
          aiModel,
        );
      }
      await this.updateProgress(projectId, 40, {});
      await this.eventEmitter.emitProgress({
        projectId,
        phase: "document",
        status: "progress",
        progress: 40,
        message: "设计文档和 API 文档已保存",
      });

      // Step 3: PM Lead 生成任务 (50%)
      this.logger.log(`[${projectId}] Step 3: PM Lead generating tasks...`);
      await this.updateAgentStatus(
        projectId,
        CodingAgentType.PM_LEAD,
        "RUNNING",
      );
      await this.eventEmitter.emitProgress({
        projectId,
        phase: "pm_lead",
        status: "started",
        progress: 40,
        message: "项目经理开始分解任务...",
      });
      await this.eventEmitter.emitAgentStatus({
        projectId,
        agent: "pmLead",
        status: "running",
        message: "正在生成任务列表...",
      });

      const tasks = await this.runPMLeadAgent(prd, design, aiModel);
      outputs.tasks = tasks;
      await this.updateAgentStatus(
        projectId,
        CodingAgentType.PM_LEAD,
        "COMPLETED",
      );
      await this.updateProgress(projectId, 50, { tasks });
      await this.eventEmitter.emitProgress({
        projectId,
        phase: "pm_lead",
        status: "completed",
        progress: 50,
        message: "任务分解完成",
        data: { tasks },
      });
      await this.eventEmitter.emitAgentStatus({
        projectId,
        agent: "pmLead",
        status: "completed",
        message: "任务列表已生成",
        output: tasks,
      });

      // 发送 PM Lead 输出消息到团队聊天
      if (tasks && tasks.length > 0) {
        const tasksContent = `## 任务分解

### 任务列表 (共 ${tasks.length} 个任务)

${tasks
  .map(
    (t, i) => `**${i + 1}. ${t.title}**
   - 描述: ${t.description}
   - 状态: ${t.status}`,
  )
  .join("\n\n")}

---
任务已分解完成，工程师可以开始编码了。`;

        await this.sendAgentMessage(
          projectId,
          CodingAgentRole.PM_LEAD,
          tasksContent,
          CodingMessageType.OUTPUT,
        );
      }

      // Step 4: Engineer 生成代码 (80%)
      this.logger.log(`[${projectId}] Step 4: Engineer generating code...`);
      await this.updateAgentStatus(
        projectId,
        CodingAgentType.ENGINEER,
        "RUNNING",
      );
      await this.eventEmitter.emitProgress({
        projectId,
        phase: "engineer",
        status: "started",
        progress: 50,
        message: "工程师开始编写代码...",
      });
      await this.eventEmitter.emitAgentStatus({
        projectId,
        agent: "engineer",
        status: "running",
        message: "正在生成项目代码...",
      });

      const code = await this.runEngineerAgent(
        projectId,
        prd,
        design,
        tasks,
        techStack,
        standardsContext,
        aiModel,
      );
      outputs.code = code;
      await this.updateAgentStatus(
        projectId,
        CodingAgentType.ENGINEER,
        "COMPLETED",
      );
      await this.updateProgress(projectId, 80, { code });
      await this.eventEmitter.emitProgress({
        projectId,
        phase: "engineer",
        status: "completed",
        progress: 80,
        message: "代码生成完成",
        data: { filesCount: code?.files?.length || 0 },
      });
      await this.eventEmitter.emitAgentStatus({
        projectId,
        agent: "engineer",
        status: "completed",
        message: `已生成 ${code?.files?.length || 0} 个代码文件`,
        output: code,
      });

      // 发送 Engineer 输出消息到团队聊天
      if (code?.files && code.files.length > 0) {
        const codeContent = `## 代码生成完成

### 生成的文件 (共 ${code.files.length} 个)

${code.files.map((f) => `- \`${f.path}\` (${f.language})`).join("\n")}

### 项目配置
- **入口文件**: \`${code.entryPoint || "index.js"}\`
- **构建命令**: \`${code.buildCommand || "npm run build"}\`
- **运行命令**: \`${code.runCommand || "npm start"}\`

---
代码已生成完毕，可以在右侧"产出"面板查看和下载代码文件。`;

        await this.sendAgentMessage(
          projectId,
          CodingAgentRole.ENGINEER,
          codeContent,
          CodingMessageType.OUTPUT,
        );
      }

      // Step 5: QA 生成测试 (90%)
      this.logger.log(`[${projectId}] Step 5: QA generating tests...`);
      await this.updateAgentStatus(projectId, CodingAgentType.QA, "RUNNING");
      await this.eventEmitter.emitProgress({
        projectId,
        phase: "qa",
        status: "started",
        progress: 80,
        message: "QA 工程师开始编写测试...",
      });
      await this.eventEmitter.emitAgentStatus({
        projectId,
        agent: "qa",
        status: "running",
        message: "正在生成测试用例...",
      });

      const tests = await this.runQAAgent(
        projectId,
        prd,
        code,
        standardsContext,
        aiModel,
      );
      outputs.tests = tests;
      await this.updateAgentStatus(projectId, CodingAgentType.QA, "COMPLETED");
      await this.updateProgress(projectId, 90, { tests });
      await this.eventEmitter.emitProgress({
        projectId,
        phase: "qa",
        status: "completed",
        progress: 90,
        message: "测试用例生成完成",
        data: { testsCount: tests?.testFiles?.length || 0 },
      });
      await this.eventEmitter.emitAgentStatus({
        projectId,
        agent: "qa",
        status: "completed",
        message: `已生成 ${tests?.testFiles?.length || 0} 个测试文件`,
        output: tests,
      });

      // 发送 QA 输出消息到团队聊天
      if (tests) {
        const testsContent = `## 测试用例生成完成

### 测试文件 (共 ${tests.testFiles?.length || 0} 个)

${tests.testFiles?.map((f) => `- \`${f}\``).join("\n") || "暂无测试文件"}

### 测试覆盖率
预估覆盖率: **${tests.coverage || 0}%**

---
测试用例已生成完毕，项目开发完成！ 🎉`;

        await this.sendAgentMessage(
          projectId,
          CodingAgentRole.QA,
          testsContent,
          CodingMessageType.OUTPUT,
        );
      }

      // 生成 README
      this.logger.log(`[${projectId}] Generating README...`);
      await this.documentService.generateREADME(
        projectId,
        {
          name: project.name,
          description: project.description,
          techStack,
        },
        { prd, design, code },
        aiModel,
      );
      await this.updateProgress(projectId, 100, {});
      await this.eventEmitter.emitProgress({
        projectId,
        phase: "complete",
        status: "completed",
        progress: 100,
        message: "项目生成完成！",
      });

      // 完成
      await this.prisma.aiCodingProject.update({
        where: { id: projectId },
        data: {
          status: AiCodingProjectStatus.COMPLETED,
          completedAt: new Date(),
          outputs: outputs as Prisma.InputJsonValue,
        },
      });

      // 发送完成事件
      await this.eventEmitter.emitComplete(projectId, true, outputs);

      this.logger.log(`[${projectId}] Project completed successfully`);
    } catch (error) {
      this.logger.error(`[${projectId}] Agent pipeline failed`, error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await this.eventEmitter.emitError(projectId, errorMessage);
      throw error;
    }
  }

  /**
   * PM Agent: 生成 PRD
   */
  private async runPMAgent(
    requirement: string,
    techStack: Record<string, string>,
    standardsContext?: string,
    aiModel?: DefaultAIModel,
  ): Promise<ProjectOutputs["prd"]> {
    let systemPrompt = `You are a Product Manager AI. Your job is to analyze user requirements and create a structured PRD (Product Requirements Document).

Output a JSON object with the following structure:
{
  "overview": "Brief project overview",
  "userStories": [{"id": "US-001", "description": "...", "priority": "P0/P1/P2"}],
  "functionalRequirements": ["Requirement 1", "Requirement 2"],
  "nonFunctionalRequirements": ["NFR 1", "NFR 2"],
  "acceptanceCriteria": ["Criteria 1", "Criteria 2"]
}

Be concise and focus on the core functionality.`;

    if (standardsContext) {
      systemPrompt += `\n\n${standardsContext}`;
    }

    const userMessage = `User Requirement: ${requirement}
Tech Stack: ${JSON.stringify(techStack)}

Generate a PRD for this project.`;

    // Use admin-configured model if provided
    const result = aiModel
      ? await this.aiChatService.generateChatCompletionWithKey({
          provider: aiModel.provider,
          modelId: aiModel.modelId,
          apiKey: aiModel.apiKey || "",
          apiEndpoint: aiModel.apiEndpoint || undefined,
          systemPrompt,
          messages: [{ role: "user", content: userMessage }],
          maxTokens: 4096,
          temperature: 0.7,
          displayName: aiModel.displayName,
        })
      : await this.aiChatService.chat({
          messages: [{ role: "user", content: userMessage }],
          systemPrompt,
          maxTokens: 4096,
          temperature: 0.7,
        });

    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      this.logger.warn("Failed to parse PM output as JSON");
    }

    return {
      overview: result.content,
      userStories: [],
      functionalRequirements: [],
      nonFunctionalRequirements: [],
      acceptanceCriteria: [],
    };
  }

  /**
   * Architect Agent: 生成技术设计
   */
  private async runArchitectAgent(
    prd: ProjectOutputs["prd"],
    techStack: Record<string, string>,
    standardsContext?: string,
    aiModel?: DefaultAIModel,
  ): Promise<ProjectOutputs["design"]> {
    let systemPrompt = `You are a Software Architect AI. Your job is to design the technical architecture based on the PRD.

Output a JSON object with the following structure:
{
  "architecture": "Architecture description (keep it brief)",
  "dataModels": [{"name": "ModelName", "fields": ["field1: type", "field2: type"]}],
  "apiDesign": [{"method": "GET/POST/PUT/DELETE", "path": "/api/...", "description": "..."}],
  "directoryStructure": "src/\\n├── components/\\n├── pages/\\n└── ..."
}`;

    if (standardsContext) {
      systemPrompt += `\n\n${standardsContext}`;
    }

    const userMessage = `PRD: ${JSON.stringify(prd)}
Tech Stack: ${JSON.stringify(techStack)}

Design the technical architecture.`;

    // Use admin-configured model if provided
    const result = aiModel
      ? await this.aiChatService.generateChatCompletionWithKey({
          provider: aiModel.provider,
          modelId: aiModel.modelId,
          apiKey: aiModel.apiKey || "",
          apiEndpoint: aiModel.apiEndpoint || undefined,
          systemPrompt,
          messages: [{ role: "user", content: userMessage }],
          maxTokens: 4096,
          temperature: 0.7,
          displayName: aiModel.displayName,
        })
      : await this.aiChatService.chat({
          messages: [{ role: "user", content: userMessage }],
          systemPrompt,
          maxTokens: 4096,
          temperature: 0.7,
        });

    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      this.logger.warn("Failed to parse Architect output as JSON");
    }

    return {
      architecture: result.content,
      dataModels: [],
      apiDesign: [],
      directoryStructure: "",
    };
  }

  /**
   * PM Lead Agent: 生成任务列表
   */
  private async runPMLeadAgent(
    prd: ProjectOutputs["prd"],
    design: ProjectOutputs["design"],
    aiModel?: DefaultAIModel,
  ): Promise<ProjectOutputs["tasks"]> {
    const systemPrompt = `You are a Project Manager AI. Your job is to break down the project into actionable tasks.

Output a JSON array with the following structure:
[
  {"id": "TASK-001", "title": "Task title", "description": "Brief description", "status": "pending"}
]

Keep it to 5-10 essential tasks.`;

    const userMessage = `PRD: ${JSON.stringify(prd)}
Design: ${JSON.stringify(design)}

Create a task list for this project.`;

    // Use admin-configured model if provided
    const result = aiModel
      ? await this.aiChatService.generateChatCompletionWithKey({
          provider: aiModel.provider,
          modelId: aiModel.modelId,
          apiKey: aiModel.apiKey || "",
          apiEndpoint: aiModel.apiEndpoint || undefined,
          systemPrompt,
          messages: [{ role: "user", content: userMessage }],
          maxTokens: 2048,
          temperature: 0.7,
          displayName: aiModel.displayName,
        })
      : await this.aiChatService.chat({
          messages: [{ role: "user", content: userMessage }],
          systemPrompt,
          maxTokens: 2048,
          temperature: 0.7,
        });

    try {
      const jsonMatch = result.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      this.logger.warn("Failed to parse PM Lead output as JSON");
    }

    return [];
  }

  /**
   * Engineer Agent: 生成代码
   */
  private async runEngineerAgent(
    projectId: string,
    prd: ProjectOutputs["prd"],
    design: ProjectOutputs["design"],
    tasks: ProjectOutputs["tasks"],
    techStack: Record<string, string>,
    standardsContext?: string,
    aiModel?: DefaultAIModel,
  ): Promise<ProjectOutputs["code"]> {
    let systemPrompt = `You are a Software Engineer AI. Your job is to implement the project code based on the PRD and design.

Output a JSON object with code files:
{
  "files": [
    {"path": "src/index.ts", "content": "...", "language": "typescript"},
    {"path": "package.json", "content": "...", "language": "json"}
  ],
  "entryPoint": "src/index.ts",
  "buildCommand": "npm run build",
  "runCommand": "npm start"
}

Generate complete, runnable code files. Focus on the core functionality.`;

    if (standardsContext) {
      systemPrompt += `\n\n${standardsContext}`;
    }

    const userMessage = `PRD: ${JSON.stringify(prd)}
Design: ${JSON.stringify(design)}
Tasks: ${JSON.stringify(tasks)}
Tech Stack: ${JSON.stringify(techStack)}

Generate the project code files.`;

    // Use admin-configured model if provided
    const result = aiModel
      ? await this.aiChatService.generateChatCompletionWithKey({
          provider: aiModel.provider,
          modelId: aiModel.modelId,
          apiKey: aiModel.apiKey || "",
          apiEndpoint: aiModel.apiEndpoint || undefined,
          systemPrompt,
          messages: [{ role: "user", content: userMessage }],
          maxTokens: 8192,
          temperature: 0.5,
          displayName: aiModel.displayName,
        })
      : await this.aiChatService.chat({
          messages: [{ role: "user", content: userMessage }],
          systemPrompt,
          maxTokens: 8192,
          temperature: 0.5,
        });

    let codeOutput: NonNullable<ProjectOutputs["code"]> = {
      files: [],
      entryPoint: "",
      buildCommand: "npm run build",
      runCommand: "npm start",
    };

    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        codeOutput = {
          files: parsed.files || [],
          entryPoint: parsed.entryPoint || "",
          buildCommand: parsed.buildCommand || "npm run build",
          runCommand: parsed.runCommand || "npm start",
        };
      }
    } catch (e) {
      this.logger.warn("Failed to parse Engineer output as JSON");
    }

    // 保存代码文件到数据库
    if (codeOutput.files.length > 0) {
      for (const file of codeOutput.files) {
        const content = file.content || "";
        await this.prisma.aiCodingFile.create({
          data: {
            projectId,
            path: file.path,
            content,
            language: file.language || "text",
            size: content.length,
            lineCount: content.split("\n").length,
            isEntry: file.path === codeOutput.entryPoint,
          },
        });
      }
    }

    return {
      files: codeOutput.files.map((f) => ({
        path: f.path,
        language: f.language,
      })),
      entryPoint: codeOutput.entryPoint,
      buildCommand: codeOutput.buildCommand,
      runCommand: codeOutput.runCommand,
    };
  }

  /**
   * QA Agent: 生成测试
   */
  private async runQAAgent(
    projectId: string,
    prd: ProjectOutputs["prd"],
    code: ProjectOutputs["code"],
    standardsContext?: string,
    aiModel?: DefaultAIModel,
  ): Promise<ProjectOutputs["tests"]> {
    let systemPrompt = `You are a QA Engineer AI. Your job is to create test cases for the project.

Output a JSON object with test files:
{
  "testFiles": [
    {"path": "tests/app.test.ts", "content": "...", "language": "typescript"}
  ],
  "coverage": 80
}

Generate simple but effective test cases.`;

    if (standardsContext) {
      systemPrompt += `\n\n${standardsContext}`;
    }

    const codeFiles = code?.files || [];
    const userMessage = `PRD: ${JSON.stringify(prd)}
Code Files: ${JSON.stringify(codeFiles)}

Generate test files for this project.`;

    // Use admin-configured model if provided
    const result = aiModel
      ? await this.aiChatService.generateChatCompletionWithKey({
          provider: aiModel.provider,
          modelId: aiModel.modelId,
          apiKey: aiModel.apiKey || "",
          apiEndpoint: aiModel.apiEndpoint || undefined,
          systemPrompt,
          messages: [{ role: "user", content: userMessage }],
          maxTokens: 4096,
          temperature: 0.5,
          displayName: aiModel.displayName,
        })
      : await this.aiChatService.chat({
          messages: [{ role: "user", content: userMessage }],
          systemPrompt,
          maxTokens: 4096,
          temperature: 0.5,
        });

    let testOutput: {
      testFiles: Array<{ path: string; content: string; language: string }>;
      coverage: number;
    } = {
      testFiles: [],
      coverage: 0,
    };

    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        testOutput = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      this.logger.warn("Failed to parse QA output as JSON");
    }

    // 保存测试文件到数据库
    if (testOutput.testFiles && testOutput.testFiles.length > 0) {
      for (const file of testOutput.testFiles) {
        const content = file.content || "";
        await this.prisma.aiCodingFile.create({
          data: {
            projectId,
            path: file.path,
            content,
            language: file.language || "typescript",
            size: content.length,
            lineCount: content.split("\n").length,
          },
        });
      }
    }

    return {
      testFiles: testOutput.testFiles.map((f) => f.path),
      coverage: testOutput.coverage,
    };
  }

  /**
   * 更新智能体状态
   */
  private async updateAgentStatus(
    projectId: string,
    agentType: CodingAgentType,
    status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED",
  ): Promise<void> {
    const project = await this.prisma.aiCodingProject.findUnique({
      where: { id: projectId },
    });

    if (!project) return;

    const agentStatus = (project.agentStatus || {}) as Record<string, unknown>;
    const now = new Date();

    agentStatus[agentType] = {
      status,
      ...(status === "RUNNING" && { startedAt: now }),
      ...(status === "COMPLETED" && { completedAt: now }),
    };

    await this.prisma.aiCodingProject.update({
      where: { id: projectId },
      data: { agentStatus: agentStatus as Prisma.InputJsonValue },
    });

    // 记录日志
    await this.prisma.aiCodingAgentLog.create({
      data: {
        projectId,
        agentType,
        status:
          status === "RUNNING"
            ? AiCodingAgentStatus.RUNNING
            : status === "COMPLETED"
              ? AiCodingAgentStatus.COMPLETED
              : status === "FAILED"
                ? AiCodingAgentStatus.FAILED
                : AiCodingAgentStatus.PENDING,
      },
    });
  }

  /**
   * 更新项目进度
   */
  private async updateProgress(
    projectId: string,
    progress: number,
    outputsUpdate?: Partial<ProjectOutputs>,
  ): Promise<void> {
    const project = await this.prisma.aiCodingProject.findUnique({
      where: { id: projectId },
    });

    if (!project) return;

    const currentOutputs = (project.outputs || {}) as ProjectOutputs;
    const updatedOutputs = { ...currentOutputs, ...outputsUpdate };

    await this.prisma.aiCodingProject.update({
      where: { id: projectId },
      data: {
        progress,
        outputs: updatedOutputs as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * 迭代项目
   */
  async iterateProject(
    projectId: string,
    userId: string,
    dto: IterateProjectDto,
  ): Promise<AiCodingProject> {
    const project = await this.prisma.aiCodingProject.findFirst({
      where: { id: projectId, userId },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    if (project.status !== AiCodingProjectStatus.COMPLETED) {
      throw new Error("Can only iterate completed projects");
    }

    // 创建迭代记录
    const iteration = await this.prisma.aiCodingIteration.create({
      data: {
        projectId,
        version: project.currentVersion + 1,
        feedback: dto.feedback,
        status: AiCodingProjectStatus.PROCESSING,
      },
    });

    // 更新项目状态
    const updatedProject = await this.prisma.aiCodingProject.update({
      where: { id: projectId },
      data: {
        status: AiCodingProjectStatus.PROCESSING,
        currentVersion: project.currentVersion + 1,
      },
    });

    // 异步执行迭代
    this.executeIteration(projectId, iteration.id, dto.feedback).catch(
      (error) => {
        this.logger.error(`Iteration failed for project ${projectId}`, error);
      },
    );

    return updatedProject;
  }

  /**
   * 执行迭代
   */
  private async executeIteration(
    projectId: string,
    iterationId: string,
    feedback: string,
  ): Promise<void> {
    const project = await this.prisma.aiCodingProject.findUnique({
      where: { id: projectId },
      include: { files: true },
    });

    if (!project) return;

    try {
      const systemPrompt = `You are a Software Engineer AI. The user has provided feedback on the existing code.
Based on the feedback, modify the code and output the updated files.

Output a JSON object:
{
  "files": [
    {"path": "src/index.ts", "content": "...", "language": "typescript"}
  ],
  "changes": ["Changed X to Y", "Added feature Z"]
}`;

      const result = await this.aiChatService.chat({
        messages: [
          {
            role: "user",
            content: `Current Files: ${JSON.stringify(
              project.files.map((f) => ({
                path: f.path,
                content: f.content,
              })),
            )}

User Feedback: ${feedback}

Update the code based on this feedback.`,
          },
        ],
        systemPrompt,
        maxTokens: 8192,
        temperature: 0.5,
      });

      let updates: {
        files: Array<{ path: string; content: string; language: string }>;
        changes: string[];
      } = {
        files: [],
        changes: [],
      };

      try {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          updates = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        this.logger.warn("Failed to parse iteration output");
      }

      // 更新代码文件
      for (const file of updates.files) {
        const content = file.content || "";
        await this.prisma.aiCodingFile.upsert({
          where: {
            projectId_path_version: {
              projectId,
              path: file.path,
              version: project.currentVersion,
            },
          },
          create: {
            projectId,
            path: file.path,
            content,
            language: file.language || "text",
            version: project.currentVersion,
            size: content.length,
            lineCount: content.split("\n").length,
          },
          update: {
            content,
            size: content.length,
            lineCount: content.split("\n").length,
          },
        });
      }

      // 更新迭代记录
      await this.prisma.aiCodingIteration.update({
        where: { id: iterationId },
        data: {
          status: AiCodingProjectStatus.COMPLETED,
          completedAt: new Date(),
          changes: updates.changes,
        },
      });

      // 更新项目状态
      await this.prisma.aiCodingProject.update({
        where: { id: projectId },
        data: {
          status: AiCodingProjectStatus.COMPLETED,
        },
      });

      this.logger.log(`Iteration completed for project ${projectId}`);
    } catch (error) {
      await this.prisma.aiCodingIteration.update({
        where: { id: iterationId },
        data: {
          status: AiCodingProjectStatus.FAILED,
        },
      });

      await this.prisma.aiCodingProject.update({
        where: { id: projectId },
        data: {
          status: AiCodingProjectStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });

      throw error;
    }
  }

  /**
   * 获取项目代码文件
   */
  async getProjectFiles(projectId: string, userId: string) {
    const project = await this.prisma.aiCodingProject.findFirst({
      where: { id: projectId, userId },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    return this.prisma.aiCodingFile.findMany({
      where: {
        projectId,
        version: project.currentVersion,
      },
      orderBy: { path: "asc" },
    });
  }

  /**
   * 下载项目 ZIP
   */
  async downloadProject(
    projectId: string,
    userId: string,
  ): Promise<{ stream: PassThrough; filename: string }> {
    const project = await this.prisma.aiCodingProject.findFirst({
      where: { id: projectId, userId },
      include: { files: true },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    const files = project.files.filter(
      (f) => f.version === project.currentVersion,
    );

    const passThrough = new PassThrough();
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.pipe(passThrough);

    // 添加代码文件
    for (const file of files) {
      archive.append(file.content, { name: file.path });
    }

    // 添加 README
    const readme = this.generateReadme(project);
    archive.append(readme, { name: "README.md" });

    // 添加文档
    const outputs = project.outputs as ProjectOutputs;
    if (outputs.prd) {
      archive.append(JSON.stringify(outputs.prd, null, 2), {
        name: "docs/PRD.json",
      });
    }
    if (outputs.design) {
      archive.append(JSON.stringify(outputs.design, null, 2), {
        name: "docs/DESIGN.json",
      });
    }

    archive.finalize();

    const filename = `${project.name.replace(/[^a-zA-Z0-9]/g, "-")}-v${project.currentVersion}.zip`;

    return { stream: passThrough, filename };
  }

  /**
   * 生成 README
   */
  private generateReadme(project: AiCodingProject): string {
    const outputs = project.outputs as ProjectOutputs;
    const techStack = project.techStack as Record<string, string>;

    return `# ${project.name}

${project.description}

## Generated by DeepDive AI Coding

This project was generated using AI-powered multi-agent collaboration.

## Tech Stack

${techStack.frontend ? `- Frontend: ${techStack.frontend}` : ""}
${techStack.backend ? `- Backend: ${techStack.backend}` : ""}
${techStack.database ? `- Database: ${techStack.database}` : ""}

## Getting Started

\`\`\`bash
${outputs.code?.buildCommand || "npm install"}
${outputs.code?.runCommand || "npm start"}
\`\`\`

## Project Structure

\`\`\`
${outputs.design?.directoryStructure || "See docs/DESIGN.json for details"}
\`\`\`

---

Generated on ${new Date().toISOString()}
`;
  }

  /**
   * 恢复项目执行（从检查点继续）
   */
  async resumeProject(
    projectId: string,
    userId: string,
  ): Promise<AiCodingProject> {
    const project = await this.prisma.aiCodingProject.findFirst({
      where: { id: projectId, userId },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    // 检查是否可以恢复
    const { canResume, checkpoint, reason } =
      await this.codingTaskService.canResume(projectId);

    if (!canResume) {
      throw new Error(reason || "Cannot resume project");
    }

    // 更新状态为处理中
    const updatedProject = await this.prisma.aiCodingProject.update({
      where: { id: projectId },
      data: {
        status: AiCodingProjectStatus.PROCESSING,
      },
    });

    // 异步从检查点恢复执行
    this.resumeFromCheckpoint(projectId, checkpoint!).catch((error) => {
      this.logger.error(
        `Resume from checkpoint failed for project ${projectId}`,
        error,
      );
      this.prisma.aiCodingProject.update({
        where: { id: projectId },
        data: {
          status: AiCodingProjectStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
    });

    return updatedProject;
  }

  /**
   * 从检查点恢复执行
   */
  private async resumeFromCheckpoint(
    projectId: string,
    checkpoint: TaskCheckpoint,
  ): Promise<void> {
    const project = await this.prisma.aiCodingProject.findUnique({
      where: { id: projectId },
    });

    if (!project) return;

    const outputs = checkpoint.outputs as ProjectOutputs;
    const techStack = project.techStack as Record<string, string>;

    // 获取用户的工程规范
    let standardsContext = "";
    try {
      standardsContext = await this.standardsService.getStandardsForAgent(
        project.userId,
      );
    } catch (e) {
      this.logger.warn("Failed to get standards for agent", e);
    }

    try {
      // 从检查点的下一个阶段开始
      const nextPhase = this.codingTaskService.getNextPhase(
        checkpoint.phase as CodingTaskPhase,
      );

      if (!nextPhase) {
        // 已经完成
        await this.codingTaskService.markTaskComplete(projectId, outputs);
        return;
      }

      this.logger.log(
        `[${projectId}] Resuming from phase: ${checkpoint.phase}, next: ${nextPhase}`,
      );

      // 根据下一个阶段继续执行
      await this.continueFromPhase(
        projectId,
        nextPhase,
        outputs,
        project.requirement,
        techStack,
        standardsContext,
      );
    } catch (error) {
      this.logger.error(`[${projectId}] Resume failed`, error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await this.codingTaskService.markPhaseFailed(
        projectId,
        checkpoint.phase as CodingTaskPhase,
        errorMessage,
      );
      throw error;
    }
  }

  /**
   * 从指定阶段继续执行
   */
  private async continueFromPhase(
    projectId: string,
    phase: CodingTaskPhase,
    outputs: ProjectOutputs,
    requirement: string,
    techStack: Record<string, string>,
    standardsContext: string,
  ): Promise<void> {
    const project = await this.prisma.aiCodingProject.findUnique({
      where: { id: projectId },
    });

    if (!project) return;

    // 获取默认 AI 模型
    let aiModel: DefaultAIModel | undefined;
    try {
      aiModel = await this.teamService.getDefaultChatModel();
    } catch (error) {
      this.logger.warn(
        `[${projectId}] Could not get AI model for resume, will use fallback`,
      );
    }

    // 根据阶段继续执行
    switch (phase) {
      case CodingTaskPhase.PM:
        // 从 PM 阶段开始（完整重新执行）
        await this.executeAgentPipeline(projectId);
        break;

      case CodingTaskPhase.ARCHITECT:
        await this.codingTaskService.markPhaseStart(
          projectId,
          CodingTaskPhase.ARCHITECT,
        );
        const design = await this.runArchitectAgent(
          outputs.prd,
          techStack,
          standardsContext,
          aiModel,
        );
        outputs.design = design;
        await this.codingTaskService.markPhaseComplete(
          projectId,
          CodingTaskPhase.ARCHITECT,
          { design },
        );
        await this.continueFromPhase(
          projectId,
          CodingTaskPhase.PM_LEAD,
          outputs,
          requirement,
          techStack,
          standardsContext,
        );
        break;

      case CodingTaskPhase.PM_LEAD:
        await this.codingTaskService.markPhaseStart(
          projectId,
          CodingTaskPhase.PM_LEAD,
        );
        const tasks = await this.runPMLeadAgent(
          outputs.prd,
          outputs.design,
          aiModel,
        );
        outputs.tasks = tasks;
        await this.codingTaskService.markPhaseComplete(
          projectId,
          CodingTaskPhase.PM_LEAD,
          { tasks },
        );
        await this.continueFromPhase(
          projectId,
          CodingTaskPhase.ENGINEER,
          outputs,
          requirement,
          techStack,
          standardsContext,
        );
        break;

      case CodingTaskPhase.ENGINEER:
        await this.codingTaskService.markPhaseStart(
          projectId,
          CodingTaskPhase.ENGINEER,
        );
        const code = await this.runEngineerAgent(
          projectId,
          outputs.prd,
          outputs.design,
          outputs.tasks,
          techStack,
          standardsContext,
          aiModel,
        );
        outputs.code = code;
        await this.codingTaskService.markPhaseComplete(
          projectId,
          CodingTaskPhase.ENGINEER,
          { code },
        );
        await this.continueFromPhase(
          projectId,
          CodingTaskPhase.QA,
          outputs,
          requirement,
          techStack,
          standardsContext,
        );
        break;

      case CodingTaskPhase.QA:
        await this.codingTaskService.markPhaseStart(
          projectId,
          CodingTaskPhase.QA,
        );
        const tests = await this.runQAAgent(
          projectId,
          outputs.prd,
          outputs.code,
          standardsContext,
          aiModel,
        );
        outputs.tests = tests;
        await this.codingTaskService.markPhaseComplete(
          projectId,
          CodingTaskPhase.QA,
          { tests },
        );
        await this.continueFromPhase(
          projectId,
          CodingTaskPhase.DOCUMENT,
          outputs,
          requirement,
          techStack,
          standardsContext,
        );
        break;

      case CodingTaskPhase.DOCUMENT:
        await this.codingTaskService.markPhaseStart(
          projectId,
          CodingTaskPhase.DOCUMENT,
        );
        await this.documentService.generateREADME(
          projectId,
          {
            name: project.name,
            description: project.description,
            techStack,
          },
          { prd: outputs.prd, design: outputs.design, code: outputs.code },
          aiModel,
        );
        await this.codingTaskService.markPhaseComplete(
          projectId,
          CodingTaskPhase.DOCUMENT,
          {},
        );
        // 标记完成
        await this.codingTaskService.markTaskComplete(projectId, outputs);
        break;

      case CodingTaskPhase.COMPLETE:
        await this.codingTaskService.markTaskComplete(projectId, outputs);
        break;

      default:
        this.logger.warn(`Unknown phase: ${phase}`);
        break;
    }
  }
}
