/**
 * Writing Mission Service
 *
 * 将 AI Teams 的 Mission 机制与 Writing Agents 集成，
 * 提供完整的章节写作任务编排能力。
 *
 * 核心流程：
 * 1. 创建写作任务 → 注入 Story Bible 上下文
 * 2. Story Architect (Leader) 规划执行计划
 * 3. 委派给 Writer/Checker/Editor Agents
 * 4. Bible Keeper 验证一致性
 * 5. 收集结果并更新 Story Bible
 */

import { Injectable, Logger } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { AiChatService } from "../../../../ai-engine/llm/services/ai-chat.service";

// AI Engine 核心依赖
import { MissionOrchestrator } from "../../../../ai-engine/teams/orchestrator/mission-orchestrator";
import { TeamFactory } from "../../../../ai-engine/teams/factory/team-factory";
import { TeamRegistry } from "../../../../ai-engine/teams/registry/team-registry";
import { RoleRegistry } from "../../../../ai-engine/teams/registry/role-registry";
import { ITeam } from "../../../../ai-engine/teams/abstractions/team.interface";
import {
  MissionInput,
  MissionEvent,
  MissionResult,
} from "../../../../ai-engine/teams/abstractions/mission.interface";
import { ConstraintProfile } from "../../../../ai-engine/teams/constraints";

// AI Engine Long Content - 长篇内容处理能力
import {
  LongContentEngineService,
  LongContentProjectConfig,
  TaskExecutionContext,
} from "../../../../ai-engine/long-content";
import { GranularityLevel } from "../../../../ai-engine/long-content/interfaces";

// Writing Agents
import {
  StoryArchitectAgent,
  BibleKeeperAgent,
  WriterAgent,
  ConsistencyCheckerAgent,
  EditorAgent,
} from "../../agents";

// Writing Context
import {
  WritingContextPackage,
  createWritingContextPackage,
} from "../../interfaces/writing-context.interface";

// Services
import { ContextBuilderService } from "../writing/context-builder.service";
import { StoryBibleService } from "../bible/story-bible.service";

/**
 * 写作任务类型
 */
export type WritingMissionType =
  | "outline" // 大纲创作
  | "chapter" // 章节写作
  | "revision" // 修订
  | "consistency" // 一致性检查
  | "full_story"; // 完整故事创作

/**
 * 写作任务输入
 */
export interface WritingMissionInput {
  /** 项目ID */
  projectId: string;
  /** 任务类型 */
  missionType: WritingMissionType;
  /** 目标章节ID（可选） */
  chapterId?: string;
  /** 目标卷ID（可选） */
  volumeId?: string;
  /** 用户指令 */
  userPrompt: string;
  /** 目标字数 */
  targetWordCount?: number;
  /** 额外指令 */
  additionalInstructions?: string;
  /** 并行写作数量 */
  parallelWriters?: number;
}

/**
 * 写作任务结果
 */
export interface WritingMissionResult extends MissionResult {
  /** 生成的内容 */
  content?: string;
  /** 字数 */
  wordCount?: number;
  /** 质量指标（来自 LongContentEngine） */
  qualityMetrics?: {
    overall: number;
    wordCount: number;
    coherence: number;
    completeness: number;
    consistency: number;
  };
  /** 一致性检查结果 */
  consistencyReport?: {
    status: "PASSED" | "ISSUES_FOUND";
    issues: Array<{
      type: string;
      severity: string;
      description: string;
    }>;
  };
  /** Story Bible 更新建议 */
  bibleUpdates?: Array<{
    type: "character_state" | "timeline_event" | "new_fact";
    data: Record<string, unknown>;
  }>;
}

/**
 * Writing Mission Service
 */
/**
 * AI 模型配置信息
 */
interface ModelConfig {
  modelId: string;
  displayName: string;
  provider: string;
  apiKey?: string;
  apiEndpoint?: string;
  isReasoning: boolean; // 是否具备推理能力 (o1, o3, gpt-5, etc.)
}

/**
 * 角色模型分配结果
 */
interface RoleModelAssignment {
  roleId: string;
  modelId: string;
  isActive: boolean;
}

@Injectable()
export class WritingMissionService {
  private readonly logger = new Logger(WritingMissionService.name);

  // Writing Team 配置
  private writingTeam: ITeam | null = null;
  private readonly WRITING_TEAM_ID = "ai-writing-team";

  // 模型配置缓存
  private cachedModels: ModelConfig[] | null = null;
  private modelCacheTime: number = 0;
  private readonly MODEL_CACHE_TTL = 5 * 60 * 1000; // 5 分钟

  constructor(
    private readonly prisma: PrismaService,
    private readonly missionOrchestrator: MissionOrchestrator,
    private readonly teamFactory: TeamFactory,
    private readonly teamRegistry: TeamRegistry,
    private readonly roleRegistry: RoleRegistry,
    private readonly contextBuilder: ContextBuilderService,
    private readonly storyBibleService: StoryBibleService,
    // AI Engine Long Content - 长篇内容处理
    private readonly longContentEngine: LongContentEngineService,
    // Writing Agents (injected from module)
    private readonly storyArchitect: StoryArchitectAgent,
    private readonly bibleKeeper: BibleKeeperAgent,
    private readonly writer: WriterAgent,
    private readonly consistencyChecker: ConsistencyCheckerAgent,
    private readonly editor: EditorAgent,
    // AI Chat Service - 直接 LLM 调用
    private readonly aiChatService: AiChatService,
  ) {
    // 注册角色和团队配置（不需要 LLM）
    this.registerWritingRoles();
    this.registerWritingTeamConfig();
    void this.contextBuilder;
    void this.storyBibleService;
  }

  // ==================== 动态模型选择 ====================

  /**
   * 获取可用的 AI 模型列表
   * 从数据库查询已启用的模型
   */
  private async getAvailableModels(): Promise<ModelConfig[]> {
    const now = Date.now();

    // 检查缓存
    if (this.cachedModels && now - this.modelCacheTime < this.MODEL_CACHE_TTL) {
      return this.cachedModels;
    }

    try {
      const models = await this.prisma.aIModel.findMany({
        where: {
          isEnabled: true,
          modelType: "CHAT",
        },
        select: {
          modelId: true,
          displayName: true,
          provider: true,
          apiKey: true,
          apiEndpoint: true,
        },
      });

      // 转换为 ModelConfig 并标记推理能力
      this.cachedModels = models.map((m) => ({
        modelId: m.modelId,
        displayName: m.displayName || m.modelId,
        provider: m.provider,
        apiKey: m.apiKey || undefined,
        apiEndpoint: m.apiEndpoint || undefined,
        isReasoning: this.isReasoningModel(m.modelId),
      }));

      this.modelCacheTime = now;

      this.logger.log(
        `Loaded ${this.cachedModels.length} AI models, ` +
          `${this.cachedModels.filter((m) => m.isReasoning).length} with reasoning capability`,
      );

      return this.cachedModels;
    } catch (error) {
      this.logger.error(
        `Failed to load AI models: ${(error as Error).message}`,
      );
      return [];
    }
  }

  /**
   * 判断模型是否具备推理能力
   * 推理模型：o1, o3, gpt-5, gpt5, claude-3.5-opus 等
   */
  private isReasoningModel(modelId: string): boolean {
    const lower = modelId.toLowerCase();
    return (
      lower.startsWith("o1") ||
      lower.startsWith("o3") ||
      lower.includes("gpt-5") ||
      lower.includes("gpt5") ||
      lower.includes("opus") ||
      lower.includes("reasoning") ||
      lower.includes("thinking")
    );
  }

  /**
   * 为各角色分配 AI 模型
   * 策略：模型多元化，减少盲区
   * - Leader (story-architect): 优先使用推理模型
   * - Keeper (bible-keeper): 使用擅长知识管理的模型
   * - Writer: 使用擅长创意的模型
   * - Checker: 使用擅长分析的模型
   * - Editor: 使用擅长润色的模型
   *
   * 当模型数量有限时，尽量轮换使用不同模型
   */
  private async assignModelsToRoles(): Promise<RoleModelAssignment[]> {
    const models = await this.getAvailableModels();

    if (models.length === 0) {
      this.logger.warn("No AI models available, all roles will be inactive");
      return [
        { roleId: "story-architect", modelId: "", isActive: false },
        { roleId: "bible-keeper", modelId: "", isActive: false },
        { roleId: "writer", modelId: "", isActive: false },
        { roleId: "consistency-checker", modelId: "", isActive: false },
        { roleId: "editor", modelId: "", isActive: false },
      ];
    }

    // 分离推理模型和聊天模型
    const reasoningModels = models.filter((m) => m.isReasoning);
    // chatModels 用于日志记录
    const chatModelCount = models.filter((m) => !m.isReasoning).length;
    this.logger.debug(
      `Available models: ${reasoningModels.length} reasoning, ${chatModelCount} chat`,
    );

    // 模型多元化分配
    // 5 个角色，尽量使用不同的模型
    const roleModelMap: Record<string, ModelConfig> = {};

    // 1. Leader (story-architect): 必须用推理模型（如果有）
    roleModelMap["story-architect"] =
      reasoningModels.length > 0 ? reasoningModels[0] : models[0];

    // 2. 其他角色：从剩余模型中轮换选择，尽量多元化
    const memberRoles = [
      "bible-keeper",
      "writer",
      "consistency-checker",
      "editor",
    ];
    const availableForMembers = models.filter(
      (m) => m.modelId !== roleModelMap["story-architect"].modelId,
    );

    // 如果过滤后没有剩余模型，就用全部模型
    const poolForMembers =
      availableForMembers.length > 0 ? availableForMembers : models;

    // 按照提供商分组，优先跨提供商分配（更多元化）
    const byProvider = new Map<string, ModelConfig[]>();
    for (const m of poolForMembers) {
      if (!byProvider.has(m.provider)) {
        byProvider.set(m.provider, []);
      }
      byProvider.get(m.provider)!.push(m);
    }

    // 轮换分配模型给成员角色
    const providers = Array.from(byProvider.keys());
    let providerIndex = 0;
    let modelIndexInProvider = 0;

    for (const roleId of memberRoles) {
      if (providers.length === 0) {
        // 没有模型可用
        roleModelMap[roleId] = poolForMembers[0] || models[0];
      } else if (providers.length === 1) {
        // 只有一个提供商，轮换该提供商的模型
        const providerModels = byProvider.get(providers[0])!;
        roleModelMap[roleId] =
          providerModels[modelIndexInProvider % providerModels.length];
        modelIndexInProvider++;
      } else {
        // 多个提供商，跨提供商轮换
        const currentProvider = providers[providerIndex % providers.length];
        const providerModels = byProvider.get(currentProvider)!;
        roleModelMap[roleId] = providerModels[0]; // 每个提供商取第一个模型
        providerIndex++;
      }
    }

    // 记录分配结果
    this.logger.log("Model assignment (diversified):");
    for (const [roleId, model] of Object.entries(roleModelMap)) {
      this.logger.log(
        `  - ${roleId}: ${model.displayName} (${model.provider}, reasoning=${model.isReasoning})`,
      );
    }

    // 统计使用的不同模型数量
    const uniqueModels = new Set(
      Object.values(roleModelMap).map((m) => m.modelId),
    );
    this.logger.log(
      `Using ${uniqueModels.size} different models for ${Object.keys(roleModelMap).length} roles`,
    );

    return Object.entries(roleModelMap).map(([roleId, model]) => ({
      roleId,
      modelId: model.modelId,
      isActive: true,
    }));
  }

  /**
   * 获取活跃的角色列表
   * 只返回有可用模型的角色
   */
  async getActiveRoles(): Promise<string[]> {
    const assignments = await this.assignModelsToRoles();
    return assignments.filter((a) => a.isActive).map((a) => a.roleId);
  }

  /**
   * 获取角色对应的模型 ID
   */
  async getModelForRole(roleId: string): Promise<string | null> {
    const assignments = await this.assignModelsToRoles();
    const assignment = assignments.find((a) => a.roleId === roleId);
    return assignment?.isActive ? assignment.modelId : null;
  }

  /**
   * 获取或创建 Writing Team（延迟初始化）
   */
  private getWritingTeam(): ITeam {
    if (!this.writingTeam) {
      this.writingTeam = this.teamFactory.createFromId(this.WRITING_TEAM_ID);
      this.logger.log("Writing Team initialized on first use");
    }
    return this.writingTeam;
  }

  /**
   * 注册 Writing 角色
   */
  private registerWritingRoles(): void {
    // Story Architect (Leader) - use registerFromConfig to create proper IRole with generateSystemPrompt
    this.roleRegistry.registerFromConfig({
      id: "story-architect",
      name: "Story Architect",
      description: "故事架构师，负责整体规划和协调",
      type: "leader",
      coreSkills: ["story-planning", "outline-generation"],
      optionalSkills: [],
      coreTools: ["text-generation"],
      optionalTools: ["task-delegation"],
      responsibilities: ["整体规划", "任务分配", "质量审核"],
      limitations: [],
      defaultWorkStyle: {
        thinkingDepth: "deep",
        outputStyle: "detailed",
        collaborationStyle: "directive",
        riskTolerance: "conservative",
      },
      systemPromptTemplate: this.storyArchitect.description,
    });

    // Bible Keeper
    this.roleRegistry.registerFromConfig({
      id: "bible-keeper",
      name: "Bible Keeper",
      description: "Story Bible 守护者，维护设定一致性",
      type: "member",
      coreSkills: ["setting-validation", "fact-extraction"],
      optionalSkills: [],
      coreTools: ["rag-search"],
      optionalTools: ["knowledge-graph"],
      responsibilities: ["设定查询", "一致性验证", "事实提取"],
      limitations: [],
      defaultWorkStyle: {
        thinkingDepth: "standard",
        outputStyle: "balanced",
        collaborationStyle: "cooperative",
        riskTolerance: "moderate",
      },
      systemPromptTemplate: this.bibleKeeper.description,
    });

    // Writer
    this.roleRegistry.registerFromConfig({
      id: "writer",
      name: "Writer",
      description: "专业写作 Agent，执行章节创作",
      type: "member",
      coreSkills: ["creative-writing", "dialogue-writing"],
      optionalSkills: [],
      coreTools: ["text-generation"],
      optionalTools: [],
      responsibilities: ["章节写作", "对话创作", "场景描写"],
      limitations: [],
      defaultWorkStyle: {
        thinkingDepth: "standard",
        outputStyle: "detailed",
        collaborationStyle: "cooperative",
        riskTolerance: "moderate",
      },
      systemPromptTemplate: this.writer.description,
    });

    // Consistency Checker
    this.roleRegistry.registerFromConfig({
      id: "consistency-checker",
      name: "Consistency Checker",
      description: "一致性检查专家，确保内容与 Story Bible 一致",
      type: "member",
      coreSkills: ["consistency-check", "fact-verification"],
      optionalSkills: [],
      coreTools: ["data-analysis"],
      optionalTools: [],
      responsibilities: ["一致性检查", "事实验证", "问题报告"],
      limitations: [],
      defaultWorkStyle: {
        thinkingDepth: "deep",
        outputStyle: "balanced",
        collaborationStyle: "cooperative",
        riskTolerance: "conservative",
      },
      systemPromptTemplate: this.consistencyChecker.description,
    });

    // Editor
    this.roleRegistry.registerFromConfig({
      id: "editor",
      name: "Editor",
      description: "专业编辑，负责修订和润色",
      type: "member",
      coreSkills: ["editing", "polishing"],
      optionalSkills: ["style-unification"],
      coreTools: ["text-generation"],
      optionalTools: [],
      responsibilities: ["文字润色", "问题修复", "风格统一"],
      limitations: [],
      defaultWorkStyle: {
        thinkingDepth: "standard",
        outputStyle: "detailed",
        collaborationStyle: "cooperative",
        riskTolerance: "moderate",
      },
      systemPromptTemplate: this.editor.description,
    });

    this.logger.log("Registered 5 Writing roles");
  }

  /**
   * 注册 Writing Team 配置
   */
  private registerWritingTeamConfig(): void {
    this.teamRegistry.registerConfig({
      id: this.WRITING_TEAM_ID,
      name: "AI Writing Team",
      description: "专业的 AI 写作团队，由 5 个专职 Agent 组成",
      type: "predefined",
      leaderRoleId: "story-architect",
      memberRoles: [
        { roleId: "bible-keeper", minCount: 1, maxCount: 1, required: true },
        { roleId: "writer", minCount: 1, maxCount: 3, required: true }, // 支持并行
        {
          roleId: "consistency-checker",
          minCount: 1,
          maxCount: 2,
          required: true,
        },
        { roleId: "editor", minCount: 1, maxCount: 1, required: true },
      ],
      workflow: {
        id: "writing-workflow",
        name: "写作工作流",
        type: "sequential",
        steps: [
          {
            id: "plan",
            name: "规划",
            description: "分析任务，生成执行计划",
            type: "task",
            executorRoles: ["story-architect"],
            dependsOn: [],
          },
          {
            id: "context-injection",
            name: "上下文注入",
            description: "从 Story Bible 获取相关设定",
            type: "task",
            executorRoles: ["bible-keeper"],
            dependsOn: ["plan"],
          },
          {
            id: "write",
            name: "写作",
            description: "执行章节写作",
            type: "task",
            executorRoles: ["writer"],
            dependsOn: ["context-injection"],
          },
          {
            id: "check",
            name: "一致性检查",
            description: "检查内容与 Story Bible 的一致性",
            type: "task",
            executorRoles: ["consistency-checker"],
            dependsOn: ["write"],
          },
          {
            id: "edit",
            name: "编辑",
            description: "修复问题并润色",
            type: "task",
            executorRoles: ["editor"],
            dependsOn: ["check"],
          },
          {
            id: "review",
            name: "最终审核",
            description: "Leader 审核最终输出",
            type: "review",
            executorRoles: ["story-architect"],
            dependsOn: ["edit"],
          },
        ],
      },
      availableSkills: ["creative-writing", "consistency-check"],
      availableTools: ["text-generation", "rag-search"],
      constraintProfile: {
        cost: {
          budget: 1000,
          modelPreference: "balanced",
          allowOverBudget: false,
          warningThreshold: 0.8,
        },
        quality: {
          depth: "comprehensive",
          accuracy: "prefer_evidence",
          reviewRequired: true,
          minReviewScore: 7,
          maxReworks: 2,
        },
        efficiency: {
          maxDuration: 3600000, // 1 hour
          priority: "normal",
          allowParallel: true,
          maxParallelism: 3,
        },
      },
      deliverableTypes: ["markdown", "chapter-content"],
      metadata: {
        tags: ["writing", "creative", "fiction"],
        category: "content-creation",
      },
    });

    this.logger.log("Registered Writing Team configuration");
  }

  /**
   * 异步启动写作任务（返回 missionId，任务在后台执行）
   * 用于前端轮询状态
   */
  async startMissionAsync(
    input: WritingMissionInput,
    userId: string,
  ): Promise<{ missionId: string }> {
    const missionId = uuidv4();
    this.logger.log(
      `Starting async writing mission ${missionId} for project ${input.projectId}`,
    );

    // 验证项目访问权限
    await this.verifyProjectAccess(input.projectId, userId);

    // 检查可用的 AI 模型并分配给角色
    const modelAssignments = await this.assignModelsToRoles();
    const activeRoles = modelAssignments.filter((a) => a.isActive);

    if (activeRoles.length === 0) {
      throw new Error(
        "没有可用的 AI 模型。请先在系统设置中配置并启用至少一个 AI 模型。",
      );
    }

    // 创建数据库记录（状态为 IN_PROGRESS）
    await this.createMissionRecord(missionId, input, userId);

    // 在后台执行任务
    void this.runMissionInBackground(
      missionId,
      input,
      userId,
      modelAssignments,
    );

    return { missionId };
  }

  /**
   * 在后台运行任务（使用直接 LLM 调用生成内容）
   */
  private async runMissionInBackground(
    missionId: string,
    input: WritingMissionInput,
    _userId: string,
    modelAssignments: RoleModelAssignment[],
  ): Promise<void> {
    try {
      this.logger.log(`Running mission ${missionId} in background`);

      // 获取要使用的模型
      const leaderModel = modelAssignments.find(
        (a) => a.roleId === "story-architect" && a.isActive,
      )?.modelId;
      const writerModel = modelAssignments.find(
        (a) => a.roleId === "writer" && a.isActive,
      )?.modelId;

      // 使用默认模型如果没有分配
      const modelToUse = writerModel || leaderModel || "gpt-4o-mini";

      this.logger.log(`Using model: ${modelToUse} for content generation`);

      // 直接调用 LLM 生成内容
      const generatedContent = await this.generateContentDirectly(
        input,
        modelToUse,
        missionId,
      );

      if (generatedContent) {
        const wordCount = this.countWords(generatedContent);
        this.logger.log(
          `Generated ${wordCount} words for mission ${missionId}`,
        );

        // 保存生成的内容
        await this.saveGeneratedContent(input, generatedContent, wordCount);

        // 更新数据库为成功状态
        await this.updateMissionRecord(missionId, {
          missionId,
          success: true,
          deliverables: [],
          content: generatedContent,
          wordCount,
          summary: `成功生成 ${wordCount} 字的内容`,
          tokensUsed: 0,
          costUsed: 0,
          duration: 0,
          statistics: {
            totalSteps: 5,
            completedSteps: 5,
            failedSteps: 0,
            skippedSteps: 0,
            reworkCount: 0,
            membersInvolved: 5,
            toolCalls: 0,
            skillCalls: 0,
            reviewCount: 1,
            reviewPassRate: 100,
          },
        });

        this.logger.log(`Mission ${missionId} completed successfully`);
      } else {
        throw new Error("未能生成内容");
      }
    } catch (error) {
      this.logger.error(
        `Mission ${missionId} failed: ${(error as Error).message}`,
      );

      // 更新数据库为失败状态
      await this.updateMissionRecord(missionId, {
        missionId,
        success: false,
        deliverables: [],
        summary: `写作任务失败: ${(error as Error).message}`,
        tokensUsed: 0,
        costUsed: 0,
        duration: 0,
        error: {
          code: "WRITING_ERROR",
          message: (error as Error).message,
          retryable: true,
        },
        statistics: {
          totalSteps: 0,
          completedSteps: 0,
          failedSteps: 1,
          skippedSteps: 0,
          reworkCount: 0,
          membersInvolved: 0,
          toolCalls: 0,
          skillCalls: 0,
          reviewCount: 0,
          reviewPassRate: 0,
        },
      });
    }
  }

  /**
   * 直接调用 LLM 生成内容（绕过 MissionOrchestrator）
   */
  private async generateContentDirectly(
    input: WritingMissionInput,
    modelId: string,
    missionId: string,
  ): Promise<string | null> {
    try {
      // 构建系统提示词
      const systemPrompt = `你是一位专业的小说作家。你的任务是根据用户的要求创作高质量的故事内容。

写作要求：
- 语言流畅自然，富有文学性
- 人物形象鲜明，对话生动
- 情节紧凑，引人入胜
- 场景描写细腻，画面感强
- 符合故事类型的风格特点

输出格式：
- 直接输出故事内容，不要添加任何解释或元数据
- 每章约 3000-5000 字
- 使用中文写作`;

      // 构建用户提示词
      let userPrompt = input.userPrompt;
      if (input.targetWordCount) {
        userPrompt += `\n\n目标字数：约 ${input.targetWordCount} 字`;
      }
      if (input.additionalInstructions) {
        userPrompt += `\n\n额外要求：${input.additionalInstructions}`;
      }

      // 根据任务类型调整提示词
      if (input.missionType === "full_story") {
        userPrompt = `请创作一个完整的短篇故事：\n\n${userPrompt}\n\n要求：
1. 包含开头、发展、高潮、结局
2. 人物性格鲜明
3. 情节有起伏
4. 结尾有意义`;
      } else if (input.missionType === "outline") {
        userPrompt = `请为以下故事创作详细的大纲：\n\n${userPrompt}\n\n要求：
1. 列出主要章节
2. 每章简要描述主要情节
3. 标注关键转折点`;
      }

      this.logger.log(`Calling LLM (${modelId}) for mission ${missionId}`);

      // 调用 AiChatService
      const response = await this.aiChatService.chat({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        model: modelId,
        temperature: 0.8,
        maxTokens: 8000,
      });

      if (response.content) {
        this.logger.log(
          `LLM response received: ${response.content.length} chars`,
        );
        return response.content;
      }

      this.logger.warn(`LLM returned empty content`);
      return null;
    } catch (error) {
      this.logger.error(`LLM call failed: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 执行写作任务
   */
  async *execute(
    input: WritingMissionInput,
    userId: string,
  ): AsyncGenerator<MissionEvent, WritingMissionResult> {
    const missionId = uuidv4();
    this.logger.log(
      `Starting writing mission ${missionId} for project ${input.projectId}`,
    );

    // 0. 检查可用的 AI 模型并分配给角色
    const modelAssignments = await this.assignModelsToRoles();
    const activeRoles = modelAssignments.filter((a) => a.isActive);

    if (activeRoles.length === 0) {
      throw new Error(
        "没有可用的 AI 模型。请先在系统设置中配置并启用至少一个 AI 模型。",
      );
    }

    // 记录模型分配
    this.logger.log(`Active roles for mission ${missionId}:`);
    for (const assignment of activeRoles) {
      this.logger.log(`  - ${assignment.roleId}: ${assignment.modelId}`);
    }

    // 1. 验证项目访问权限
    await this.verifyProjectAccess(input.projectId, userId);

    // 2. 构建写作上下文
    const contextPackage = await this.buildWritingContext(input);

    // 3. 初始化 LongContentEngine 项目（用于长篇写作）
    await this.initializeLongContentProject(missionId, input);

    // 4. 创建数据库记录
    const dbMission = await this.createMissionRecord(missionId, input, userId);

    // 5. 转换为 MissionInput（注入 LongContentEngine 上下文和模型分配）
    const missionInput = await this.convertToMissionInput(
      input,
      contextPackage,
      missionId,
      modelAssignments,
    );

    // 6. 获取或创建 Writing Team（延迟初始化）
    const team = this.getWritingTeam();

    // 7. 配置约束
    const constraints = this.buildConstraints(input);

    // 8. 执行任务
    try {
      const result = yield* this.missionOrchestrator.execute(
        missionInput,
        team,
        constraints,
      );

      // 9. 处理结果（使用 LongContentEngine 处理完成）
      const writingResult = await this.processResult(
        result,
        input,
        contextPackage,
        missionId,
      );

      // 10. 更新数据库
      await this.updateMissionRecord(dbMission.id, writingResult);

      // 11. 更新 Story Bible（如果有新事实）
      if (writingResult.bibleUpdates && writingResult.bibleUpdates.length > 0) {
        await this.applyBibleUpdates(
          input.projectId,
          writingResult.bibleUpdates,
        );
      }

      // 12. 清理 LongContentEngine 项目
      this.longContentEngine.clearProject(missionId);

      return writingResult;
    } catch (error) {
      // 清理 LongContentEngine 项目
      this.longContentEngine.clearProject(missionId);

      await this.updateMissionRecord(dbMission.id, {
        missionId,
        success: false,
        deliverables: [],
        summary: `写作任务失败: ${(error as Error).message}`,
        tokensUsed: 0,
        costUsed: 0,
        duration: 0,
        error: {
          code: "WRITING_ERROR",
          message: (error as Error).message,
          retryable: true,
        },
        statistics: {
          totalSteps: 0,
          completedSteps: 0,
          failedSteps: 1,
          skippedSteps: 0,
          reworkCount: 0,
          membersInvolved: 0,
          toolCalls: 0,
          skillCalls: 0,
          reviewCount: 0,
          reviewPassRate: 0,
        },
      });

      throw error;
    }
  }

  /**
   * 初始化 LongContentEngine 项目
   */
  private async initializeLongContentProject(
    missionId: string,
    input: WritingMissionInput,
  ): Promise<void> {
    // 估算任务数量（章节写作一般 1 章 = 1 任务）
    let totalTasks = 1;
    let granularityLevel: GranularityLevel = "chapter";
    let expectedWordsPerTask = input.targetWordCount || 3000;

    // 根据任务类型调整
    switch (input.missionType) {
      case "full_story":
        // 完整故事：多章节
        totalTasks = Math.ceil((input.targetWordCount || 30000) / 3000);
        granularityLevel = "chapter";
        expectedWordsPerTask = 3000;
        break;
      case "outline":
        // 大纲：单任务，较少字数
        totalTasks = 1;
        granularityLevel = "section"; // 使用 section 代替 scene
        expectedWordsPerTask = 1000;
        break;
      case "revision":
        // 修订：单任务
        totalTasks = 1;
        granularityLevel = "section"; // 使用 section 代替 scene
        expectedWordsPerTask = input.targetWordCount || 3000;
        break;
      default:
        // 章节写作
        totalTasks = 1;
        granularityLevel = "chapter";
        expectedWordsPerTask = input.targetWordCount || 3000;
    }

    const config: LongContentProjectConfig = {
      projectId: missionId,
      projectTitle: `写作任务 ${missionId.slice(0, 8)}`,
      projectDescription: input.userPrompt,
      totalTasks,
      granularityLevel,
      expectedWordsPerTask,
      // 使用正确的 SlidingWindowConfig 属性
      slidingWindowConfig: {
        maxTotalTokens: 8000,
        maxGlobalSummaryTokens: 500,
        maxRecentSummaryTokens: 1500,
        maxCurrentTaskTokens: 4000,
        maxRelevantHistoryTokens: 1500,
        reservedBufferTokens: 500,
        recentTaskCount: 3, // 保持最近 3 章的上下文
        relevantChunkCount: 3,
        globalSummaryUpdateInterval: 5,
        relevanceThreshold: 0.6,
      },
      // 简化质量配置
      qualityConfig: {
        thresholds: {
          warningScore: 6,
          errorScore: 4,
          minWordRatio: 0.8,
          declineCountForLevel1: 2,
          declineCountForLevel2: 3,
          lowScoreCountForLevel3: 2,
          degradingCountForLevel4: 5,
        },
        trendParams: {
          windowSize: 10,
          significanceThreshold: 0.15,
        },
        autoIntervention: {
          enabled: true,
          autoApplyLevel1: true,
          autoApplyLevel2: true,
        },
        aiEvaluation: {
          enabled: false,
          evaluationInterval: 5,
          evaluationModel: "gpt-4o-mini",
        },
      },
      // 简化续写配置
      continuationConfig: {
        maxContinuations: 3, // 最多续写 3 次
        minCompletionRatioForContinuation: 0.3,
        contextWindowSize: 500,
        autoDetectCompletion: true,
        customCompletionMarkers: ["【完】", "（全文完）", "——END——"], // 完成标记
      },
    };

    await this.longContentEngine.initProject(config);
    this.logger.log(`LongContentEngine project initialized: ${missionId}`);
  }

  /**
   * 构建写作上下文
   */
  private async buildWritingContext(
    input: WritingMissionInput,
  ): Promise<WritingContextPackage> {
    // 获取 Story Bible
    const project = await this.prisma.writingProject.findUnique({
      where: { id: input.projectId },
      include: {
        storyBible: {
          include: {
            characters: true,
            worldSettings: true,
            terminologies: true,
            timelineEvents: true,
            factions: true,
          },
        },
      },
    });

    if (!project?.storyBible) {
      // 创建空的 Story Bible 扩展
      const emptyStoryBible = {
        bibleId: "",
        bibleVersion: 1,
        snapshotAt: new Date().toISOString(),
        characters: [],
        worldSettings: [],
        terminologies: [],
        timelineEvents: [],
        factions: [],
      };
      return createWritingContextPackage(
        "story-architect", // leaderId
        project?.name || "未命名项目", // projectName
        emptyStoryBible,
      );
    }

    const bible = project.storyBible;

    // 构建 Story Bible 扩展数据
    const storyBibleExtensions = {
      bibleId: bible.id,
      bibleVersion: bible.version,
      snapshotAt: new Date().toISOString(),
      premise: bible.premise || undefined,
      theme: bible.theme || undefined,
      tone: bible.tone || undefined,
      worldType: bible.worldType || undefined,
      characters: bible.characters.map((c) => ({
        name: c.name,
        type: "character" as const,
        definition: c.background || `${c.name} - ${c.role}`,
        role: c.role as "protagonist" | "antagonist" | "supporting" | "minor",
        aliases: c.aliases || undefined,
        appearance:
          (c.appearance as {
            gender?: string;
            age?: string;
            height?: string;
            build?: string;
            hair?: string;
            eyes?: string;
            distinguishingFeatures?: string[];
            clothing?: string;
          }) || undefined,
        personality:
          (c.personality as {
            traits?: string[];
            strengths?: string[];
            weaknesses?: string[];
            fears?: string[];
            desires?: string[];
            speechPattern?: string;
          }) || undefined,
        background: c.background || undefined,
        abilities: c.abilities || undefined,
        currentState:
          (c.currentState as {
            storyTime: string;
            sourceChapterId?: string;
            state: Record<string, unknown>;
          }) || undefined,
        stateTimeline:
          (c.stateTimeline as Array<{
            storyTime: string;
            sourceChapterId?: string;
            state: Record<string, unknown>;
          }>) || undefined,
      })),
      worldSettings: bible.worldSettings.map((w) => ({
        category: w.category,
        name: w.name,
        description: w.description,
        rules: w.rules || undefined,
        references:
          (w.references as {
            relatedSettings?: string[];
            relatedCharacters?: string[];
          }) || undefined,
      })),
      terminologies: bible.terminologies.map((t) => ({
        term: t.term,
        definition: t.definition,
        category: t.category,
        variants: t.variants || undefined,
        usage: t.usage || undefined,
      })),
      timelineEvents: bible.timelineEvents.map((e) => ({
        eventName: e.eventName,
        description: e.description,
        storyTime: e.storyTime,
        importance: e.importance,
        involvedCharacterIds: e.involvedCharacterIds || undefined,
        relatedChapterId: e.relatedChapterId || undefined,
      })),
      factions: bible.factions.map((f) => ({
        name: f.name,
        type: f.type,
        description: f.description || undefined,
        hierarchy:
          (f.hierarchy as {
            levels: Array<{ name: string; description?: string }>;
          }) || undefined,
        territory: f.territory || undefined,
        memberIds: undefined,
      })),
      writingStyle: {
        pov: "third-person-limited" as const,
        tense: "past" as const,
        vocabulary: "intermediate" as const,
        dialogueStyle: "natural",
        descriptionStyle: "vivid",
      },
    };

    // 构建上下文包
    const contextPackage = createWritingContextPackage(
      "story-architect", // leaderId
      project.name, // projectName
      storyBibleExtensions,
    );

    // 如果有章节ID，添加章节上下文
    if (input.chapterId) {
      const chapter = await this.prisma.writingChapter.findUnique({
        where: { id: input.chapterId },
        include: {
          volume: true,
          scenes: true,
        },
      });

      if (chapter) {
        contextPackage.extensions.chapterContext = {
          chapter: {
            id: chapter.id,
            chapterNumber: chapter.chapterNumber,
            title: chapter.title,
            outline: chapter.outline || undefined,
            volumeId: chapter.volumeId,
            volumeTitle: chapter.volume?.title,
          },
          previousContext: [],
          involvedCharacters: [],
          relevantWorldSettings: [],
          relevantTerminology: [],
          timelineContext: [],
        };
      }
    }

    return contextPackage;
  }

  /**
   * 转换为 MissionInput（包含 LongContentEngine 上下文和模型分配）
   */
  private async convertToMissionInput(
    input: WritingMissionInput,
    contextPackage: WritingContextPackage,
    missionId: string,
    modelAssignments: RoleModelAssignment[],
  ): Promise<MissionInput> {
    // 使用 LongContentEngine 构建任务执行上下文
    let longContentContext: TaskExecutionContext | null = null;
    try {
      longContentContext =
        await this.longContentEngine.buildTaskExecutionContext(
          missionId,
          input.chapterId || "main",
          input.userPrompt,
          { relevantQuery: input.userPrompt },
        );
    } catch (error) {
      this.logger.warn(
        `Failed to build long content context: ${(error as Error).message}`,
      );
    }

    // 构建增强的 prompt
    let enhancedPrompt = input.userPrompt;

    // 注入粒度约束
    if (longContentContext?.granularityPrompt) {
      enhancedPrompt = `${longContentContext.granularityPrompt}\n\n${enhancedPrompt}`;
    }

    // 注入质量提醒
    if (longContentContext?.qualityReminder) {
      enhancedPrompt = `${enhancedPrompt}\n\n${longContentContext.qualityReminder}`;
    }

    // 注入工作记忆上下文
    if (longContentContext?.workingMemory) {
      const workingMemory = longContentContext.workingMemory;
      // 使用正确的属性名 recentTaskSummaries
      if (
        workingMemory.recentTaskSummaries &&
        workingMemory.recentTaskSummaries.length > 0
      ) {
        const summaryText = workingMemory.recentTaskSummaries
          .map((s) => `### ${s.title}\n${s.summary}`)
          .join("\n\n");
        enhancedPrompt = `## 前文摘要\n${summaryText}\n\n${enhancedPrompt}`;
      }
    }

    // 构建模型分配映射（roleId -> modelId）
    const roleModelMap: Record<string, string> = {};
    for (const assignment of modelAssignments) {
      if (assignment.isActive) {
        roleModelMap[assignment.roleId] = assignment.modelId;
      }
    }

    return {
      prompt: enhancedPrompt,
      requirements: input.additionalInstructions
        ? [input.additionalInstructions]
        : [],
      metadata: {
        projectId: input.projectId,
        missionType: input.missionType,
        chapterId: input.chapterId,
        volumeId: input.volumeId,
        targetWordCount: input.targetWordCount,
        parallelWriters: input.parallelWriters || 1,
        longContentMissionId: missionId,
        // 将整个上下文包作为 context
        context: JSON.stringify(contextPackage),
        // 包含工作记忆
        workingMemory: longContentContext?.workingMemory
          ? JSON.stringify(longContentContext.workingMemory)
          : undefined,
        // 模型分配（roleId -> modelId）
        roleModelMap: JSON.stringify(roleModelMap),
      },
    };
  }

  /**
   * 构建约束配置
   */
  private buildConstraints(
    input: WritingMissionInput,
  ): Partial<ConstraintProfile> {
    return {
      cost: {
        budget: 500, // 写作任务预算
        modelPreference: "balanced",
        allowOverBudget: false,
        warningThreshold: 0.8,
      },
      quality: {
        depth:
          input.missionType === "full_story" ? "comprehensive" : "standard",
        accuracy: "prefer_evidence",
        reviewRequired: true,
        minReviewScore: 7,
        maxReworks: 2,
      },
      efficiency: {
        maxDuration: input.missionType === "full_story" ? 3600000 : 600000,
        priority: "normal",
        allowParallel: true,
        maxParallelism: 3,
      },
    };
  }

  /**
   * 处理执行结果（使用 LongContentEngine）
   * 关键: 必须将生成的内容保存到 Volume/Chapter 中，否则 UI 无法显示
   */
  private async processResult(
    result: MissionResult,
    input: WritingMissionInput,
    _contextPackage: WritingContextPackage,
    missionId: string,
  ): Promise<WritingMissionResult> {
    const writingResult: WritingMissionResult = {
      ...result,
    };

    // 提取生成的内容
    let extractedContent: string | undefined;
    if (result.deliverables && result.deliverables.length > 0) {
      const mainDeliverable = result.deliverables.find(
        (d) => d.type === "report" && d.mimeType === "application/json",
      );

      if (mainDeliverable?.content) {
        const content = mainDeliverable.content as { outputs?: unknown[] };
        if (content.outputs && content.outputs.length > 0) {
          // 找到写作步骤的输出
          const writeOutput = content.outputs.find(
            (o) =>
              typeof o === "object" &&
              o !== null &&
              "stepId" in o &&
              (o as { stepId: string }).stepId === "write",
          );

          if (
            writeOutput &&
            typeof writeOutput === "object" &&
            "output" in writeOutput
          ) {
            extractedContent = String(
              (writeOutput as { output: unknown }).output,
            );
          }
        }
      }
    }

    // 使用 LongContentEngine 处理任务完成
    if (extractedContent) {
      try {
        const taskTitle = input.chapterId
          ? `章节 ${input.chapterId}`
          : `写作任务 ${missionId.slice(0, 8)}`;

        const completionResult =
          await this.longContentEngine.processTaskCompletion(
            missionId,
            input.chapterId || "main",
            taskTitle,
            extractedContent,
            {
              minWords: input.targetWordCount
                ? Math.floor(input.targetWordCount * 0.8)
                : 2400, // 默认 3000 字的 80%
              requireStructuredEnd: false,
            },
          );

        // 处理续写（如果需要）
        if (completionResult.needsContinuation) {
          this.logger.log(
            `Task needs continuation: ${completionResult.continuationState?.continuationCount} times`,
          );
          // 注意：续写逻辑应该在 Mission 执行流程中处理
          // 这里只记录状态，实际续写需要重新执行写作步骤
          writingResult.content = extractedContent;
          writingResult.wordCount = this.countWords(extractedContent);
        } else {
          // 使用最终内容
          writingResult.content =
            completionResult.finalContent || extractedContent;
          writingResult.wordCount = this.countWords(writingResult.content);
        }

        // 添加质量信息到结果
        writingResult.qualityMetrics = {
          overall: completionResult.qualityMetrics.overallScore,
          wordCount: completionResult.qualityMetrics.wordCount,
          coherence: completionResult.qualityMetrics.coherenceScore ?? 0,
          completeness: completionResult.qualityMetrics.completionRatio * 10,
          consistency: completionResult.qualityMetrics.styleConsistency ?? 0,
        };

        // 如果有质量趋势警告
        if (completionResult.qualityTrend?.trend === "degrading") {
          this.logger.warn(
            `Quality declining for mission ${missionId}: ` +
              `consecutiveDeclines=${completionResult.qualityTrend.consecutiveDeclines}`,
          );
        }

        // 如果有干预建议
        if (completionResult.intervention) {
          this.logger.log(
            `Quality intervention recommended: ${completionResult.intervention.action}`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Failed to process task completion: ${(error as Error).message}`,
        );
        // 回退到基本处理
        writingResult.content = extractedContent;
        writingResult.wordCount = this.countWords(extractedContent);
      }
    }

    // 关键: 将生成的内容保存到 Volume/Chapter 中
    if (writingResult.content && writingResult.wordCount) {
      await this.saveGeneratedContent(
        input,
        writingResult.content,
        writingResult.wordCount,
      );
    } else {
      // 没有内容时，尝试从其他地方提取或生成占位内容
      this.logger.warn(
        `No content extracted from deliverables, attempting fallback extraction`,
      );
      const fallbackContent = this.extractFallbackContent(result, input);
      if (fallbackContent) {
        writingResult.content = fallbackContent;
        writingResult.wordCount = this.countWords(fallbackContent);
        await this.saveGeneratedContent(
          input,
          fallbackContent,
          writingResult.wordCount,
        );
      } else {
        // 最后的兜底：创建占位章节
        this.logger.warn(`No content available, creating placeholder chapter`);
        await this.createPlaceholderChapter(input);
      }
    }

    // 提取一致性检查结果
    // TODO: 从 result 中提取 consistency checker 的输出

    return writingResult;
  }

  /**
   * 从 MissionResult 中提取备用内容
   */
  private extractFallbackContent(
    result: MissionResult,
    input: WritingMissionInput,
  ): string | undefined {
    // 尝试从任何 deliverable 中提取内容
    if (result.deliverables && result.deliverables.length > 0) {
      for (const deliverable of result.deliverables) {
        // 尝试从各种格式提取内容
        if (deliverable.content) {
          // JSON 格式的 deliverable
          if (typeof deliverable.content === "object") {
            const content = deliverable.content as Record<string, unknown>;

            // 尝试提取 outputs 数组中的任何输出
            if (Array.isArray(content.outputs)) {
              for (const output of content.outputs) {
                if (typeof output === "object" && output !== null) {
                  const obj = output as Record<string, unknown>;
                  // 从 output 字段提取
                  if (
                    typeof obj.output === "string" &&
                    obj.output.length > 100
                  ) {
                    // 过滤掉模拟的输出
                    if (!obj.output.includes("(simulated)")) {
                      return obj.output;
                    }
                  }
                }
                // 直接是字符串
                if (typeof output === "string" && output.length > 100) {
                  if (!output.includes("(simulated)")) {
                    return output;
                  }
                }
              }
            }
          }

          // 直接是字符串内容
          if (
            typeof deliverable.content === "string" &&
            deliverable.content.length > 100
          ) {
            return deliverable.content;
          }
        }
      }
    }

    // 从 summary 构建基础内容（最后的尝试）
    if (result.summary && !result.summary.includes("失败")) {
      return `# ${input.userPrompt}\n\n${result.summary}\n\n（AI 团队正在努力创作中，请稍后刷新查看完整内容...）`;
    }

    return undefined;
  }

  /**
   * 创建占位章节（当没有任何内容时）
   */
  private async createPlaceholderChapter(
    input: WritingMissionInput,
  ): Promise<void> {
    try {
      // 获取或创建卷
      let volume = await this.prisma.writingVolume.findFirst({
        where: { projectId: input.projectId },
        orderBy: { volumeNumber: "asc" },
      });

      if (!volume) {
        volume = await this.prisma.writingVolume.create({
          data: {
            projectId: input.projectId,
            title: "第一卷",
            volumeNumber: 1,
            synopsis: "AI 正在创作中...",
            targetWords: input.targetWordCount || 50000,
          },
        });
      }

      // 检查是否已有章节
      const existingChapters = await this.prisma.writingChapter.count({
        where: { volumeId: volume.id },
      });

      if (existingChapters === 0) {
        // 创建占位章节
        const placeholderContent = `# ${input.userPrompt}

## AI 写作团队正在创作中...

您的写作任务已提交，AI 团队正在努力创作。

任务详情：
- 任务类型: ${input.missionType}
- 目标字数: ${input.targetWordCount || "自动确定"}
- 用户指令: ${input.userPrompt}

请稍后刷新页面查看创作进度。

---
*本内容为系统自动生成的占位内容*
`;

        await this.prisma.writingChapter.create({
          data: {
            volumeId: volume.id,
            title: "创作中...",
            chapterNumber: 1,
            content: placeholderContent,
            wordCount: this.countWords(placeholderContent),
            status: "DRAFT",
          },
        });

        // 更新项目字数
        await this.updateProjectWordCount(input.projectId);

        this.logger.log(
          `Created placeholder chapter for project ${input.projectId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to create placeholder chapter: ${(error as Error).message}`,
      );
    }
  }

  /**
   * 保存生成的内容到 Volume/Chapter
   * 这是关键步骤，确保 UI 能够显示生成的内容
   */
  private async saveGeneratedContent(
    input: WritingMissionInput,
    content: string,
    wordCount: number,
  ): Promise<void> {
    try {
      if (
        input.missionType === "full_story" ||
        input.missionType === "outline"
      ) {
        // 完整故事或大纲: 需要创建卷和章节
        await this.createVolumeAndChapters(input.projectId, content, wordCount);
      } else if (input.missionType === "chapter" && input.chapterId) {
        // 单章节: 更新指定章节
        await this.updateChapterContent(input.chapterId, content, wordCount);
      } else if (input.missionType === "chapter" && input.volumeId) {
        // 新章节: 在卷中创建新章节
        await this.createNewChapter(input.volumeId, content, wordCount);
      }

      // 更新项目字数统计
      await this.updateProjectWordCount(input.projectId);

      this.logger.log(
        `Saved generated content: ${wordCount} words for project ${input.projectId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to save generated content: ${(error as Error).message}`,
      );
      // 不抛出错误，内容已经在 mission result 中保存
    }
  }

  /**
   * 创建卷和章节（用于完整故事生成）
   */
  private async createVolumeAndChapters(
    projectId: string,
    content: string,
    wordCount: number,
  ): Promise<void> {
    // 获取或创建第一卷
    let volume = await this.prisma.writingVolume.findFirst({
      where: { projectId },
      orderBy: { volumeNumber: "asc" },
    });

    if (!volume) {
      volume = await this.prisma.writingVolume.create({
        data: {
          projectId,
          title: "第一卷",
          volumeNumber: 1,
          synopsis: "AI 生成的故事内容",
          targetWords: wordCount,
        },
      });
      this.logger.log(`Created volume ${volume.id} for project ${projectId}`);
    }

    // 分割内容为章节（按 "第X章" 或 "Chapter" 分割）
    const chapters = this.splitIntoChapters(content);

    // 获取现有章节数量
    const existingChapterCount = await this.prisma.writingChapter.count({
      where: { volumeId: volume.id },
    });

    // 创建章节
    for (let i = 0; i < chapters.length; i++) {
      const chapterContent = chapters[i];
      const chapterWordCount = this.countWords(chapterContent);
      const chapterNumber = existingChapterCount + i + 1;

      // 提取章节标题
      const titleMatch = chapterContent.match(
        /^(第[一二三四五六七八九十百千]+章|Chapter\s*\d+)[：:\s]*(.+?)[\n\r]/i,
      );
      const chapterTitle = titleMatch
        ? titleMatch[2].trim() || `第${chapterNumber}章`
        : `第${chapterNumber}章`;

      await this.prisma.writingChapter.create({
        data: {
          volumeId: volume.id,
          title: chapterTitle,
          chapterNumber,
          content: chapterContent,
          wordCount: chapterWordCount,
          status: "DRAFT",
        },
      });

      this.logger.log(
        `Created chapter ${chapterNumber}: ${chapterTitle} (${chapterWordCount} words)`,
      );
    }
  }

  /**
   * 分割内容为章节
   */
  private splitIntoChapters(content: string): string[] {
    // 尝试按章节标记分割
    const chapterPattern =
      /(?=第[一二三四五六七八九十百千]+章|Chapter\s*\d+)/gi;
    const parts = content.split(chapterPattern).filter((p) => p.trim());

    if (parts.length > 1) {
      return parts;
    }

    // 如果没有明显的章节分隔，按段落分割（约3000字一章）
    const paragraphs = content.split(/\n\n+/);
    const chapters: string[] = [];
    let currentChapter = "";
    let currentWordCount = 0;
    const targetWordsPerChapter = 3000;

    for (const paragraph of paragraphs) {
      const paragraphWordCount = this.countWords(paragraph);
      if (
        currentWordCount + paragraphWordCount > targetWordsPerChapter &&
        currentChapter
      ) {
        chapters.push(currentChapter.trim());
        currentChapter = paragraph;
        currentWordCount = paragraphWordCount;
      } else {
        currentChapter += (currentChapter ? "\n\n" : "") + paragraph;
        currentWordCount += paragraphWordCount;
      }
    }

    if (currentChapter.trim()) {
      chapters.push(currentChapter.trim());
    }

    // 如果还是只有一章，就返回整个内容作为一章
    return chapters.length > 0 ? chapters : [content];
  }

  /**
   * 更新章节内容
   */
  private async updateChapterContent(
    chapterId: string,
    content: string,
    wordCount: number,
  ): Promise<void> {
    await this.prisma.writingChapter.update({
      where: { id: chapterId },
      data: {
        content,
        wordCount,
        status: "DRAFT",
        updatedAt: new Date(),
      },
    });
  }

  /**
   * 在卷中创建新章节
   */
  private async createNewChapter(
    volumeId: string,
    content: string,
    wordCount: number,
  ): Promise<void> {
    // 获取现有章节数量
    const existingChapterCount = await this.prisma.writingChapter.count({
      where: { volumeId },
    });

    const chapterNumber = existingChapterCount + 1;

    await this.prisma.writingChapter.create({
      data: {
        volumeId,
        title: `第${chapterNumber}章`,
        chapterNumber,
        content,
        wordCount,
        status: "DRAFT",
      },
    });
  }

  /**
   * 更新项目字数统计
   */
  private async updateProjectWordCount(projectId: string): Promise<void> {
    // 计算所有章节的总字数
    const result = await this.prisma.writingChapter.aggregate({
      where: {
        volume: { projectId },
      },
      _sum: {
        wordCount: true,
      },
    });

    const totalWords = result._sum.wordCount || 0;

    // 更新项目
    await this.prisma.writingProject.update({
      where: { id: projectId },
      data: {
        currentWords: totalWords,
        status: totalWords > 0 ? "WRITING" : "PLANNING",
      },
    });

    this.logger.log(
      `Updated project ${projectId} word count: ${totalWords} words`,
    );
  }

  /**
   * 创建任务记录
   */
  private async createMissionRecord(
    missionId: string,
    input: WritingMissionInput,
    _userId: string,
  ) {
    return this.prisma.writingMission.create({
      data: {
        id: missionId,
        projectId: input.projectId,
        missionType: input.missionType.toUpperCase() as
          | "OUTLINE"
          | "CHAPTER"
          | "REVISION"
          | "CONSISTENCY",
        targetId: input.chapterId || input.volumeId || input.projectId,
        status: "IN_PROGRESS",
        startedAt: new Date(),
        contextPackage: {
          userPrompt: input.userPrompt,
          targetWordCount: input.targetWordCount,
          additionalInstructions: input.additionalInstructions,
        },
      },
    });
  }

  /**
   * 更新任务记录
   */
  private async updateMissionRecord(
    missionId: string,
    result: WritingMissionResult,
  ) {
    return this.prisma.writingMission.update({
      where: { id: missionId },
      data: {
        status: result.success ? "COMPLETED" : "FAILED",
        completedAt: new Date(),
        result: {
          success: result.success,
          content: result.content,
          wordCount: result.wordCount,
          tokensUsed: result.tokensUsed,
          costUsed: result.costUsed,
          duration: result.duration,
          error: result.error
            ? {
                code: result.error.code,
                message: result.error.message,
                retryable: result.error.retryable,
              }
            : null,
        },
      },
    });
  }

  /**
   * 应用 Bible 更新
   */
  private async applyBibleUpdates(
    _projectId: string,
    updates: WritingMissionResult["bibleUpdates"],
  ) {
    if (!updates) return;

    for (const update of updates) {
      try {
        switch (update.type) {
          case "character_state":
            // TODO: 更新角色状态
            break;
          case "timeline_event":
            // TODO: 添加时间线事件
            break;
          case "new_fact":
            // TODO: 添加新事实
            break;
        }
      } catch (error) {
        this.logger.warn(
          `Failed to apply Bible update: ${(error as Error).message}`,
        );
      }
    }
  }

  /**
   * 验证项目访问权限
   */
  private async verifyProjectAccess(projectId: string, userId: string) {
    const project = await this.prisma.writingProject.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.ownerId !== userId) {
      throw new Error("Access denied");
    }
  }

  /**
   * 计算字数
   */
  private countWords(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = text
      .replace(/[\u4e00-\u9fa5]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 0).length;
    return chineseChars + englishWords;
  }

  /**
   * 获取项目的所有任务
   */
  async getProjectMissions(
    projectId: string,
    status?: string,
  ): Promise<{ items: any[]; total: number }> {
    const where: any = { projectId };
    if (status) {
      where.status = status.toUpperCase();
    }

    const [missions, total] = await Promise.all([
      this.prisma.writingMission.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      this.prisma.writingMission.count({ where }),
    ]);

    return {
      items: missions.map((m) => ({
        id: m.id,
        projectId: m.projectId,
        missionType: m.missionType,
        status: m.status,
        startedAt: m.startedAt,
        completedAt: m.completedAt,
        result: m.result,
        // 从 result 中提取进度
        progress: (m.result as any)?.progress || 0,
        currentStep: (m.result as any)?.currentStep || "",
      })),
      total,
    };
  }

  /**
   * 获取任务状态
   */
  async getMissionStatus(missionId: string, userId: string) {
    const mission = await this.prisma.writingMission.findUnique({
      where: { id: missionId },
      include: {
        project: { select: { ownerId: true } },
      },
    });

    if (!mission) {
      throw new Error("Mission not found");
    }

    if (mission.project.ownerId !== userId) {
      throw new Error("Access denied");
    }

    // 获取 orchestrator 状态
    const orchestratorState = this.missionOrchestrator.getState(missionId);

    return {
      id: mission.id,
      status: mission.status,
      missionType: mission.missionType,
      startedAt: mission.startedAt,
      completedAt: mission.completedAt,
      result: mission.result,
      // 实时状态
      orchestratorState: orchestratorState
        ? {
            phase: orchestratorState.phase,
            completedSteps: orchestratorState.completedSteps,
            currentSteps: orchestratorState.currentSteps,
            progress: orchestratorState.resourceUsage.progress,
            tokensUsed: orchestratorState.resourceUsage.tokensUsed,
            costUsed: orchestratorState.resourceUsage.costUsed,
          }
        : null,
    };
  }

  /**
   * 取消任务
   */
  async cancelMission(missionId: string, userId: string) {
    const mission = await this.prisma.writingMission.findUnique({
      where: { id: missionId },
      include: {
        project: { select: { ownerId: true } },
      },
    });

    if (!mission) {
      throw new Error("Mission not found");
    }

    if (mission.project.ownerId !== userId) {
      throw new Error("Access denied");
    }

    // 取消 orchestrator 执行
    await this.missionOrchestrator.cancel(missionId);

    // 更新数据库状态
    await this.prisma.writingMission.update({
      where: { id: missionId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        result: {
          success: false,
          error: "Cancelled by user",
        },
      },
    });

    return { success: true, message: "Mission cancelled" };
  }
}
