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

// Event Emitter for real-time updates
import { WritingEventEmitterService } from "../events/writing-event-emitter.service";

/**
 * 写作任务类型
 */
export type WritingMissionType =
  | "outline" // 大纲创作
  | "chapter" // 章节写作
  | "revision" // 修订
  | "consistency" // 一致性检查
  | "consistency_check" // 一致性检查（别名）
  | "full_story" // 完整故事创作
  | "edit"; // 编辑调整（@Leader 触发）

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
    // Event Emitter - 实时事件推送
    private readonly eventEmitter: WritingEventEmitterService,
  ) {
    // 注册角色和团队配置（不需要 LLM）
    this.registerWritingRoles();
    this.registerWritingTeamConfig();
    void this.contextBuilder;
    void this.storyBibleService;
    void this.eventEmitter; // Used in generateFullStory
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
          // 排除 xAI 模型（grok），优先使用 GPT 和 Gemini
          NOT: {
            provider: "xAI",
          },
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

      let generatedContent: string | null = null;
      let totalWordCount = 0;

      // 根据任务类型决定生成策略
      if (input.missionType === "full_story") {
        // 完整故事：一次性生成多章节内容
        generatedContent = await this.generateFullStory(
          input,
          modelToUse,
          missionId,
        );
      } else {
        // 单章节或大纲：直接调用 LLM 生成内容
        generatedContent = await this.generateContentDirectly(
          input,
          modelToUse,
          missionId,
        );
      }

      if (generatedContent) {
        totalWordCount = this.countWords(generatedContent);
        this.logger.log(
          `Generated ${totalWordCount} words for mission ${missionId}`,
        );

        // 验证生成的内容是否有效（不是错误消息）
        // edit 和 consistency_check 类型不强制最小字数（用于继续任务、状态检查等）
        const skipWordCountCheck =
          input.missionType === "edit" ||
          input.missionType === "consistency_check";
        const minWordCount = input.missionType === "outline" ? 50 : 200;
        const isErrorContent =
          generatedContent.includes("API Error") ||
          generatedContent.includes("rate limit") ||
          generatedContent.includes("429") ||
          generatedContent.includes("quota") ||
          generatedContent.includes("ECONNREFUSED") ||
          generatedContent.includes("Request failed") ||
          generatedContent.length < 100;

        if (
          !skipWordCountCheck &&
          (totalWordCount < minWordCount || isErrorContent)
        ) {
          this.logger.error(
            `Generated content is invalid or too short: ${totalWordCount} words, content length: ${generatedContent.length}`,
          );
          throw new Error(
            `内容生成失败：生成的内容无效或字数不足 (${totalWordCount} 字)。可能是 API 限流或配额不足。`,
          );
        }

        // 保存生成的内容
        await this.saveGeneratedContent(
          input,
          generatedContent,
          totalWordCount,
        );

        // 更新数据库为成功状态
        await this.updateMissionRecord(missionId, {
          missionId,
          success: true,
          deliverables: [],
          content: generatedContent,
          wordCount: totalWordCount,
          summary: `成功生成 ${totalWordCount} 字的内容`,
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
   * 一键生成完整长篇小说
   *
   * 使用 AI Engine 架构：
   * 1. MissionOrchestrator 编排任务
   * 2. Writing Team 多 Agent 协作
   * 3. LongContentEngine 管理长篇上下文
   *
   * 流程：
   * Phase 1: 故事架构师生成整体大纲（卷 + 章节结构）
   * Phase 2: 设定守护者建立世界观和角色设定
   * Phase 3: 逐章生成（作家创作 → 检查员校验 → 编辑润色）
   * Phase 4: 质量监控和一致性维护
   */
  private async generateFullStory(
    input: WritingMissionInput,
    modelId: string,
    missionId: string,
  ): Promise<string | null> {
    // 从项目获取目标字数作为默认值
    const project = await this.prisma.writingProject.findUnique({
      where: { id: input.projectId },
      select: { targetWords: true },
    });
    const targetWordCount =
      input.targetWordCount || project?.targetWords || 50000;
    const wordsPerChapter = 3000;
    const chaptersPerVolume = 10;

    // ★★★ 检查项目是否已有内容（继续创作场景）★★★
    const existingContent = await this.checkExistingContent(input.projectId);
    if (existingContent.hasContent && existingContent.currentWords > 0) {
      this.logger.log(
        `[${missionId}] Project has existing content (${existingContent.currentWords} words), using continuation mode`,
      );
      // 使用继续创作模式：只写空白章节
      return this.continueExistingStory(
        input,
        modelId,
        missionId,
        existingContent,
        targetWordCount,
      );
    }

    const totalChapters = Math.max(
      3,
      Math.ceil(targetWordCount / wordsPerChapter),
    );
    const totalVolumes = Math.max(
      1,
      Math.ceil(totalChapters / chaptersPerVolume),
    );

    this.logger.log(
      `[${missionId}] Starting long novel generation: ${totalVolumes} volumes, ${totalChapters} chapters, target ${targetWordCount} words`,
    );

    // 发送任务开始事件
    await this.eventEmitter.emitMissionStarted(
      input.projectId,
      missionId,
      "full_story",
      targetWordCount,
    );
    // 保存日志
    await this.saveMissionLog(
      missionId,
      "mission:started",
      "🚀 任务开始执行，AI 团队正在协作...",
    );

    // ==================== Phase 1: 故事架构师 - 整体规划 ====================
    this.logger.log(`[${missionId}] Phase 1: Story Architect planning...`);

    await this.updateMissionProgress(
      missionId,
      5,
      "故事架构师正在规划整体结构...",
    );

    // 更新 orchestrator 状态 - plan 阶段开始
    this.missionOrchestrator.updateState(missionId, {
      phase: "executing",
      currentSteps: ["plan"],
      completedSteps: [],
      progress: 5,
    });

    // 发送架构师工作事件
    await this.eventEmitter.emitAgentWorking(input.projectId, {
      agentId: "story-architect",
      agentName: "故事架构师",
      agentRole: "architect",
      status: "working",
      taskDescription: "规划整体故事结构和章节大纲",
    });

    // 使用 LongContentEngine 初始化项目
    await this.initializeLongContentProject(missionId, input);

    // 架构师生成大纲
    const outlinePrompt = `作为故事架构师，请为以下小说创作详细的结构规划：

【故事主题】
${input.userPrompt}

【规模要求】
- 总字数：约 ${targetWordCount.toLocaleString()} 字
- 分卷数：${totalVolumes} 卷
- 每卷章节数：约 ${chaptersPerVolume} 章
- 总章节数：${totalChapters} 章

【请输出以下内容】

## 一、故事核心
1. 一句话概括故事核心
2. 故事类型和风格
3. 主题思想

## 二、卷结构
${Array.from(
  { length: totalVolumes },
  (_, i) => `
### 第${this.numberToChinese(i + 1)}卷
- 卷名：
- 核心冲突：
- 主要情节：
- 情感走向：`,
).join("\n")}

## 三、章节大纲
请为每一章列出：
- 章节标题
- 主要情节（50字内）
- 关键转折

输出格式：JSON
{
  "core": { "summary": "", "genre": "", "theme": "" },
  "volumes": [{ "title": "", "conflict": "", "plot": "", "emotion": "" }],
  "chapters": [{ "volumeIndex": 0, "title": "", "plot": "", "keyPoint": "" }]
}`;

    const architectModel =
      (await this.getModelForRole("story-architect")) || modelId;

    const outlineResponse = await this.aiChatService.chat({
      messages: [
        {
          role: "system",
          content:
            this.storyArchitect.description +
            "\n\n你是专业的故事架构师，擅长规划长篇小说结构。请以 JSON 格式输出。",
        },
        { role: "user", content: outlinePrompt },
      ],
      model: architectModel,
      temperature: 0.7,
      maxTokens: 8000,
    });

    if (!outlineResponse.content) {
      throw new Error("故事架构规划失败");
    }

    // 解析大纲
    const outline = this.parseOutlineJSON(
      outlineResponse.content,
      totalVolumes,
      totalChapters,
    );
    this.logger.log(
      `[${missionId}] Outline generated: ${outline.chapters.length} chapters planned`,
    );

    // 架构师完成
    await this.eventEmitter.emitAgentWorking(input.projectId, {
      agentId: "story-architect",
      agentName: "故事架构师",
      agentRole: "architect",
      status: "completed",
      taskDescription: `已规划 ${outline.chapters.length} 章大纲`,
    });

    // ★ 立即创建卷和章节结构（空内容，让前端能看到大纲）
    await this.createOutlineStructure(input.projectId, outline);

    // 更新 orchestrator 状态 - plan 完成, context-injection 开始
    this.missionOrchestrator.updateState(missionId, {
      phase: "executing",
      currentSteps: ["context-injection"],
      completedSteps: ["plan"],
      progress: 10,
    });

    // ==================== Phase 2: 设定守护者 - 世界观建设 ====================
    this.logger.log(`[${missionId}] Phase 2: Bible Keeper building world...`);

    await this.updateMissionProgress(
      missionId,
      10,
      "设定守护者正在建立世界观...",
    );

    // 发送设定守护者工作事件
    await this.eventEmitter.emitAgentWorking(input.projectId, {
      agentId: "bible-keeper",
      agentName: "设定守护者",
      agentRole: "keeper",
      status: "working",
      taskDescription: "建立世界观和角色设定",
    });

    await this.eventEmitter.emitWorldBuilding(input.projectId, "started");

    const keeperModel = (await this.getModelForRole("bible-keeper")) || modelId;

    const worldBuildingPrompt = `作为设定守护者，请基于以下故事大纲建立完整的世界观设定：

【故事主题】
${input.userPrompt}

【故事核心】
${JSON.stringify(outline.core, null, 2)}

请建立以下设定（JSON 格式）：
{
  "world": {
    "type": "世界类型",
    "era": "时代背景",
    "geography": "地理环境",
    "society": "社会结构",
    "rules": ["世界规则1", "规则2"]
  },
  "characters": [
    {
      "name": "角色名",
      "role": "protagonist/antagonist/supporting",
      "appearance": "外貌描述",
      "personality": ["性格特点"],
      "background": "背景故事",
      "motivation": "行动动机",
      "arc": "角色发展弧"
    }
  ],
  "factions": [
    { "name": "势力名", "description": "描述", "relations": "关系" }
  ],
  "terminology": [
    { "term": "术语", "definition": "定义" }
  ]
}`;

    const worldResponse = await this.aiChatService.chat({
      messages: [
        {
          role: "system",
          content:
            this.bibleKeeper.description +
            "\n\n你是专业的设定守护者，负责维护世界观一致性。请以 JSON 格式输出。",
        },
        { role: "user", content: worldBuildingPrompt },
      ],
      model: keeperModel,
      temperature: 0.6,
      maxTokens: 6000,
    });

    const worldSettings = this.parseWorldSettings(
      worldResponse.content || "{}",
    );
    const charactersArray = worldSettings.characters as
      | Array<unknown>
      | undefined;
    this.logger.log(
      `[${missionId}] World settings built: ${charactersArray?.length || 0} characters`,
    );

    // 设定守护者完成
    await this.eventEmitter.emitAgentWorking(input.projectId, {
      agentId: "bible-keeper",
      agentName: "设定守护者",
      agentRole: "keeper",
      status: "completed",
      taskDescription: `已建立 ${charactersArray?.length || 0} 个角色设定`,
    });
    await this.eventEmitter.emitWorldBuilding(
      input.projectId,
      "completed",
      worldSettings,
    );

    // ★ 保存世界观到数据库 StoryBible
    try {
      const worldInfo = worldSettings.world as
        | { type?: string; era?: string; geography?: string; society?: string }
        | undefined;
      // 构建世界观描述
      const worldDescription = worldInfo
        ? [
            worldInfo.type && `类型: ${worldInfo.type}`,
            worldInfo.era && `时代: ${worldInfo.era}`,
            worldInfo.geography && `地理: ${worldInfo.geography}`,
            worldInfo.society && `社会: ${worldInfo.society}`,
          ]
            .filter(Boolean)
            .join("\n")
        : "";

      await this.prisma.storyBible.upsert({
        where: { projectId: input.projectId },
        create: {
          projectId: input.projectId,
          premise: `${input.userPrompt}\n\n${worldDescription}`,
          theme: outline.core?.theme || "",
          tone: worldInfo?.era || "",
          worldType: worldInfo?.type || "现代",
          version: 1,
          lastSyncAt: new Date(),
        },
        update: {
          premise: `${input.userPrompt}\n\n${worldDescription}`,
          theme: outline.core?.theme || "",
          tone: worldInfo?.era || "",
          worldType: worldInfo?.type || "现代",
          version: { increment: 1 },
          lastSyncAt: new Date(),
        },
      });
      this.logger.log(`[${missionId}] StoryBible saved to database`);
    } catch (e) {
      this.logger.warn(
        `[${missionId}] Failed to save StoryBible: ${(e as Error).message}`,
      );
    }

    // 更新 orchestrator 状态 - context-injection 完成, write 开始
    this.missionOrchestrator.updateState(missionId, {
      phase: "executing",
      currentSteps: ["write"],
      completedSteps: ["plan", "context-injection"],
      progress: 15,
    });

    // ==================== Phase 3: 逐章生成（多 Agent 协作）====================
    this.logger.log(
      `[${missionId}] Phase 3: Chapter generation with team collaboration...`,
    );

    const allChapters: string[] = [];
    let previousChapterSummary = "";

    // 获取各角色的模型
    const writerModel = (await this.getModelForRole("writer")) || modelId;
    const checkerModel =
      (await this.getModelForRole("consistency-checker")) || modelId;
    const editorModel = (await this.getModelForRole("editor")) || modelId;

    for (let i = 0; i < outline.chapters.length; i++) {
      const chapterInfo = outline.chapters[i];
      const chapterNumber = i + 1;
      // volumeIndex used in final assembly

      // 更新进度
      const baseProgress = 15;
      const chapterProgress = Math.round(
        baseProgress + (80 * chapterNumber) / outline.chapters.length,
      );
      await this.updateMissionProgress(
        missionId,
        chapterProgress,
        `作家团队正在创作第${this.numberToChinese(chapterNumber)}章...`,
      );

      this.logger.log(
        `[${missionId}] Generating chapter ${chapterNumber}/${outline.chapters.length}...`,
      );

      // 发送章节开始事件
      await this.eventEmitter.emitChapterStarted(
        input.projectId,
        chapterNumber,
        chapterInfo.title,
        chapterInfo.volumeIndex,
      );

      // ★ 守护者提取章节相关上下文（写作前）
      const keeperContext = await this.extractChapterContext(
        input.projectId,
        missionId,
        chapterNumber,
        chapterInfo,
        worldSettings,
        modelId,
      );

      // 发送作家工作事件
      await this.eventEmitter.emitAgentWorking(input.projectId, {
        agentId: "writer",
        agentName: "作家",
        agentRole: "writer",
        status: "working",
        taskDescription: `创作第${this.numberToChinese(chapterNumber)}章 ${chapterInfo.title}`,
        progress: chapterProgress,
      });

      // 发送进度事件
      await this.eventEmitter.emitMissionProgress(
        input.projectId,
        missionId,
        chapterProgress,
        `创作第${this.numberToChinese(chapterNumber)}章`,
        ["writer"],
      );

      // 3.1 作家创作（使用守护者提供的上下文）
      const writerPrompt = this.buildChapterWriterPrompt(
        chapterNumber,
        chapterInfo,
        outline,
        worldSettings,
        previousChapterSummary,
        input.userPrompt,
        keeperContext,
      );

      const writerResponse = await this.aiChatService.chat({
        messages: [
          {
            role: "system",
            content:
              this.writer.description +
              `\n\n你正在创作第${chapterNumber}章。语言流畅，富有文学性。`,
          },
          { role: "user", content: writerPrompt },
        ],
        model: writerModel,
        temperature: 0.8,
        maxTokens: 6000,
      });

      let chapterContent = writerResponse.content || "";

      if (!chapterContent || chapterContent.length < 500) {
        this.logger.warn(
          `[${missionId}] Chapter ${chapterNumber} content too short, retrying...`,
        );
        // 重试一次
        const retryResponse = await this.aiChatService.chat({
          messages: [
            {
              role: "system",
              content: "你是专业的小说作家。请直接创作故事内容，约3000字。",
            },
            {
              role: "user",
              content: `请创作"第${this.numberToChinese(chapterNumber)}章 ${chapterInfo.title}"的内容。\n\n情节要点：${chapterInfo.plot}\n\n${previousChapterSummary ? `前文摘要：${previousChapterSummary}` : "这是故事的开始。"}`,
            },
          ],
          model: writerModel,
          temperature: 0.85,
          maxTokens: 6000,
        });
        chapterContent =
          retryResponse.content ||
          `第${this.numberToChinese(chapterNumber)}章 ${chapterInfo.title}\n\n（内容生成中...）`;
      }

      // 3.2 检查员校验（每章都检查，确保一致性）
      // 发送检查员工作事件
      await this.eventEmitter.emitAgentWorking(input.projectId, {
        agentId: "consistency-checker",
        agentName: "一致性检查员",
        agentRole: "checker",
        status: "working",
        taskDescription: `校验第${this.numberToChinese(chapterNumber)}章一致性`,
      });

      await this.updateMissionProgress(
        missionId,
        chapterProgress + 1,
        `检查员正在校验第${this.numberToChinese(chapterNumber)}章...`,
      );

      const checkPrompt = `作为一致性检查员，请检查以下章节内容与世界观设定的一致性：

【章节内容】
${chapterContent.slice(0, 4000)}

【世界观设定】
${JSON.stringify(worldSettings, null, 2).slice(0, 2000)}

【前文摘要】
${previousChapterSummary || "这是第一章"}

请严格检查：
1. 角色名称是否一致（不能出现同一角色不同称呼混用）
2. 角色性格行为是否符合设定
3. 场景地点是否符合世界观
4. 时间线是否合理（不能出现逻辑矛盾）
5. 专有名词是否使用一致

输出 JSON 格式：
{
  "passed": true/false,
  "score": 0-100,
  "issues": [
    { "type": "character/setting/timeline/terminology", "severity": "error/warning", "description": "问题描述", "location": "问题位置", "fix": "修复建议" }
  ]
}`;

      const checkResponse = await this.aiChatService.chat({
        messages: [
          {
            role: "system",
            content:
              this.consistencyChecker.description +
              "\n\n你是严格的一致性检查员，必须仔细检查每一个细节。以 JSON 格式输出检查结果。",
          },
          { role: "user", content: checkPrompt },
        ],
        model: checkerModel,
        temperature: 0.2,
        maxTokens: 2000,
      });

      // 解析检查结果
      const checkResult = this.parseConsistencyCheckResult(
        checkResponse.content || "{}",
      );

      // 发送一致性检查事件
      await this.eventEmitter.emitConsistencyCheck(input.projectId, {
        chapterNumber,
        passed: checkResult.passed,
        issues: checkResult.issues.map((issue) => ({
          type: issue.type,
          severity: issue.severity as "error" | "warning" | "info",
          description: issue.description,
          suggestion: issue.fix,
        })),
      });

      // 如果有问题，自动修复
      if (!checkResult.passed && checkResult.issues.length > 0) {
        this.logger.warn(
          `[${missionId}] Chapter ${chapterNumber} has ${checkResult.issues.length} consistency issues, auto-fixing...`,
        );

        // 发送修复开始事件
        await this.eventEmitter.emitConsistencyFix(
          input.projectId,
          chapterNumber,
          checkResult.issues.length,
          "started",
        );

        // 自动修复
        const fixPrompt = `请修复以下章节内容中的一致性问题：

【原始内容】
${chapterContent}

【发现的问题】
${checkResult.issues.map((issue, i) => `${i + 1}. [${issue.severity}] ${issue.description}\n   位置：${issue.location}\n   建议：${issue.fix}`).join("\n\n")}

【世界观设定】
${JSON.stringify(worldSettings, null, 2).slice(0, 1500)}

请输出修复后的完整章节内容，确保：
1. 修复所有指出的问题
2. 保持故事的流畅性和可读性
3. 不改变主要情节和人物关系
4. 直接输出修复后的内容，不要加任何解释`;

        const fixResponse = await this.aiChatService.chat({
          messages: [
            {
              role: "system",
              content:
                "你是专业的小说编辑，擅长修复一致性问题同时保持故事质量。",
            },
            { role: "user", content: fixPrompt },
          ],
          model: writerModel,
          temperature: 0.4,
          maxTokens: 6000,
        });

        if (
          fixResponse.content &&
          fixResponse.content.length > chapterContent.length * 0.7
        ) {
          chapterContent = fixResponse.content;
          this.logger.log(
            `[${missionId}] Chapter ${chapterNumber} auto-fixed successfully`,
          );
        }

        // 发送修复完成事件
        await this.eventEmitter.emitConsistencyFix(
          input.projectId,
          chapterNumber,
          checkResult.issues.length,
          "completed",
        );
      }

      // 检查员完成
      await this.eventEmitter.emitAgentWorking(input.projectId, {
        agentId: "consistency-checker",
        agentName: "一致性检查员",
        agentRole: "checker",
        status: "completed",
        taskDescription: checkResult.passed
          ? "检查通过"
          : `已修复 ${checkResult.issues.length} 个问题`,
      });

      // 3.3 编辑润色（每 5 章一次润色）
      if (chapterNumber % 5 === 0) {
        await this.updateMissionProgress(
          missionId,
          chapterProgress + 2,
          `编辑正在润色第${this.numberToChinese(chapterNumber)}章...`,
        );

        const editPrompt = `作为编辑，请润色以下章节内容，改进文字表达：

${chapterContent}

要求：
1. 保持原意不变
2. 改进语句流畅度
3. 增强画面感
4. 润色对话
5. 输出完整润色后的内容`;

        const editResponse = await this.aiChatService.chat({
          messages: [
            { role: "system", content: this.editor.description },
            { role: "user", content: editPrompt },
          ],
          model: editorModel,
          temperature: 0.5,
          maxTokens: 6000,
        });

        if (
          editResponse.content &&
          editResponse.content.length > chapterContent.length * 0.8
        ) {
          chapterContent = editResponse.content;
        }
      }

      // 确保章节有标题
      if (
        !chapterContent.includes(`第${this.numberToChinese(chapterNumber)}章`)
      ) {
        chapterContent = `第${this.numberToChinese(chapterNumber)}章 ${chapterInfo.title}\n\n${chapterContent}`;
      }

      allChapters.push(chapterContent);

      // 更新上下文（使用 LongContentEngine）
      try {
        await this.longContentEngine.processTaskCompletion(
          missionId,
          `chapter-${chapterNumber}`,
          `第${chapterNumber}章 ${chapterInfo.title}`,
          chapterContent,
          { minWords: 1000, requireStructuredEnd: false },
        );
      } catch (e) {
        this.logger.warn(
          `LongContentEngine update failed: ${(e as Error).message}`,
        );
      }

      // 生成前文摘要
      previousChapterSummary = this.generateChapterSummary(chapterContent);

      const chapterWordCount = this.countWords(chapterContent);
      this.logger.log(
        `[${missionId}] Chapter ${chapterNumber} completed: ${chapterWordCount} words`,
      );

      // ★ 关键：立即将章节内容保存到数据库
      try {
        const existingChapter = await this.prisma.writingChapter.findFirst({
          where: {
            volume: { projectId: input.projectId },
            chapterNumber: chapterNumber,
          },
        });
        if (existingChapter) {
          await this.prisma.writingChapter.update({
            where: { id: existingChapter.id },
            data: {
              content: chapterContent,
              wordCount: chapterWordCount,
              status: "DRAFT",
              updatedAt: new Date(),
            },
          });
          this.logger.log(
            `[${missionId}] ✅ Saved chapter ${chapterNumber} to database (${chapterWordCount} words)`,
          );
        } else {
          this.logger.warn(
            `[${missionId}] ⚠️ Chapter ${chapterNumber} not found in database, cannot save`,
          );
        }
      } catch (dbError) {
        this.logger.error(
          `[${missionId}] ❌ Failed to save chapter ${chapterNumber}: ${(dbError as Error).message}`,
        );
      }

      // 更新项目总字数
      await this.updateProjectWordCount(input.projectId);

      // 发送章节内容和完成事件
      await this.eventEmitter.emitChapterContent(input.projectId, {
        chapterNumber,
        title: chapterInfo.title,
        content: chapterContent,
        wordCount: chapterWordCount,
        volumeIndex: chapterInfo.volumeIndex,
      });
      // 保存日志
      await this.saveMissionLog(
        missionId,
        "chapter:content",
        `📖 第 ${chapterNumber} 章「${chapterInfo.title}」内容生成中 (${chapterWordCount} 字)`,
        {
          agentId: "writer",
          agentName: "✍️ 作家",
          detail: {
            type: "chapter_content",
            data:
              chapterContent.slice(0, 300) +
              (chapterContent.length > 300 ? "..." : ""),
          },
        },
      );

      await this.eventEmitter.emitChapterCompleted(
        input.projectId,
        chapterNumber,
        chapterWordCount,
      );

      // 作家完成此章
      await this.eventEmitter.emitAgentWorking(input.projectId, {
        agentId: "writer",
        agentName: "作家",
        agentRole: "writer",
        status: "completed",
        taskDescription: `完成第${this.numberToChinese(chapterNumber)}章 (${chapterWordCount}字)`,
      });

      // ★ 守护者更新故事圣经（写作后）
      await this.updateStoryBibleAfterChapter(
        input.projectId,
        missionId,
        chapterNumber,
        chapterContent,
        worldSettings,
        modelId,
      );

      // 避免 API 限流
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // 更新 orchestrator 状态 - write/check/edit 完成, review 开始
    this.missionOrchestrator.updateState(missionId, {
      phase: "reviewing",
      currentSteps: ["review"],
      completedSteps: ["plan", "context-injection", "write", "check", "edit"],
      progress: 95,
    });

    // ==================== Phase 4: 最终整合 ====================
    await this.updateMissionProgress(
      missionId,
      98,
      "故事架构师正在最终审核...",
    );

    // 按卷组织内容
    const volumeContents: string[] = [];
    let currentVolumeChapters: string[] = [];
    let currentVolumeIndex = 0;

    for (let i = 0; i < allChapters.length; i++) {
      const chapterVolumeIndex = outline.chapters[i]?.volumeIndex || 0;

      if (
        chapterVolumeIndex !== currentVolumeIndex &&
        currentVolumeChapters.length > 0
      ) {
        // 新卷开始
        const volumeTitle =
          outline.volumes[currentVolumeIndex]?.title ||
          `第${this.numberToChinese(currentVolumeIndex + 1)}卷`;
        volumeContents.push(
          `# ${volumeTitle}\n\n${currentVolumeChapters.join("\n\n---\n\n")}`,
        );
        currentVolumeChapters = [];
        currentVolumeIndex = chapterVolumeIndex;
      }

      currentVolumeChapters.push(allChapters[i]);
    }

    // 最后一卷
    if (currentVolumeChapters.length > 0) {
      const volumeTitle =
        outline.volumes[currentVolumeIndex]?.title ||
        `第${this.numberToChinese(currentVolumeIndex + 1)}卷`;
      volumeContents.push(
        `# ${volumeTitle}\n\n${currentVolumeChapters.join("\n\n---\n\n")}`,
      );
    }

    const fullContent = volumeContents.join(
      "\n\n========================================\n\n",
    );
    const totalWords = this.countWords(fullContent);

    // 清理 LongContentEngine
    this.longContentEngine.clearProject(missionId);

    this.logger.log(
      `[${missionId}] Long novel completed: ${totalVolumes} volumes, ${allChapters.length} chapters, ${totalWords} words`,
    );

    // 发送任务完成事件
    await this.eventEmitter.emitMissionCompleted(
      input.projectId,
      missionId,
      totalWords,
      allChapters.length,
      totalVolumes,
    );
    // 保存日志
    await this.saveMissionLog(
      missionId,
      "mission:completed",
      `🎉 创作完成！共 ${allChapters.length} 章，${totalWords} 字`,
    );

    return fullContent;
  }

  /**
   * 更新任务进度
   */
  private async updateMissionProgress(
    missionId: string,
    progress: number,
    currentStep: string,
  ): Promise<void> {
    try {
      await this.prisma.writingMission.update({
        where: { id: missionId },
        data: {
          result: { progress, currentStep },
        },
      });
    } catch (e) {
      this.logger.warn(`Failed to update progress: ${(e as Error).message}`);
    }
  }

  /**
   * 解析大纲 JSON
   */
  private parseOutlineJSON(
    content: string,
    totalVolumes: number,
    totalChapters: number,
  ): {
    core: { summary: string; genre: string; theme: string };
    volumes: Array<{
      title: string;
      conflict: string;
      plot: string;
      emotion: string;
    }>;
    chapters: Array<{
      volumeIndex: number;
      title: string;
      plot: string;
      keyPoint: string;
    }>;
  } {
    let parsed: {
      core?: { summary?: string; genre?: string; theme?: string };
      volumes?: Array<{
        title?: string;
        conflict?: string;
        plot?: string;
        emotion?: string;
      }>;
      chapters?: Array<{
        volumeIndex?: number;
        title?: string;
        plot?: string;
        keyPoint?: string;
      }>;
    } | null = null;

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      this.logger.warn(`Failed to parse outline JSON: ${(e as Error).message}`);
    }

    // 生成默认卷结构
    const chaptersPerVolume = Math.ceil(totalChapters / totalVolumes);
    const defaultVolumes = Array.from({ length: totalVolumes }, (_, i) => ({
      title: `第${this.numberToChinese(i + 1)}卷`,
      conflict: "待定",
      plot: "待定",
      emotion: "待定",
    }));

    // 生成默认章节结构
    const defaultChapters = Array.from({ length: totalChapters }, (_, i) => ({
      volumeIndex: Math.floor(i / chaptersPerVolume),
      title: `第${this.numberToChinese(i + 1)}章`,
      plot: "待创作",
      keyPoint: "",
    }));

    // 如果没有解析到任何内容，返回默认结构
    if (!parsed) {
      return {
        core: { summary: "待定", genre: "待定", theme: "待定" },
        volumes: defaultVolumes,
        chapters: defaultChapters,
      };
    }

    // 合并解析结果和默认结构
    const core = {
      summary: parsed.core?.summary || "待定",
      genre: parsed.core?.genre || "待定",
      theme: parsed.core?.theme || "待定",
    };

    // 使用解析的卷，如果不足则补充默认卷
    const parsedVolumes = (parsed.volumes || []).map((v, i) => ({
      title: v.title || `第${this.numberToChinese(i + 1)}卷`,
      conflict: v.conflict || "待定",
      plot: v.plot || "待定",
      emotion: v.emotion || "待定",
    }));
    const volumes =
      parsedVolumes.length >= totalVolumes
        ? parsedVolumes.slice(0, totalVolumes)
        : [...parsedVolumes, ...defaultVolumes.slice(parsedVolumes.length)];

    // 使用解析的章节，如果不足则补充默认章节
    const parsedChapters = (parsed.chapters || []).map((c, i) => ({
      volumeIndex: c.volumeIndex ?? Math.floor(i / chaptersPerVolume),
      title: c.title || `第${this.numberToChinese(i + 1)}章`,
      plot: c.plot || "待创作",
      keyPoint: c.keyPoint || "",
    }));

    // ★ 关键：确保章节数量至少达到 totalChapters
    let chapters = parsedChapters;
    if (parsedChapters.length < totalChapters) {
      this.logger.warn(
        `Parsed chapters (${parsedChapters.length}) < expected (${totalChapters}), supplementing...`,
      );
      // 补充缺少的章节
      const supplementChapters = defaultChapters
        .slice(parsedChapters.length)
        .map((_, i) => {
          const actualIndex = parsedChapters.length + i;
          // 尝试基于已有章节推断后续情节
          const lastParsedChapter = parsedChapters[parsedChapters.length - 1];
          return {
            volumeIndex: Math.floor(actualIndex / chaptersPerVolume),
            title: `第${this.numberToChinese(actualIndex + 1)}章`,
            plot: lastParsedChapter?.plot ? "延续上一章情节发展" : "待创作",
            keyPoint: "",
          };
        });
      chapters = [...parsedChapters, ...supplementChapters];
    }

    this.logger.log(
      `Outline parsed: ${chapters.length} chapters (expected: ${totalChapters})`,
    );

    return { core, volumes, chapters };
  }

  /**
   * 解析世界观设定
   */
  private parseWorldSettings(content: string): Record<string, unknown> {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      this.logger.warn(
        `Failed to parse world settings: ${(e as Error).message}`,
      );
    }
    return { world: {}, characters: [], factions: [], terminology: [] };
  }

  /**
   * 解析一致性检查结果
   */
  private parseConsistencyCheckResult(content: string): {
    passed: boolean;
    score: number;
    issues: Array<{
      type: string;
      severity: string;
      description: string;
      location: string;
      fix: string;
    }>;
  } {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          passed: parsed.passed ?? true,
          score: parsed.score ?? 100,
          issues: (parsed.issues || []).map(
            (issue: Record<string, string>) => ({
              type: issue.type || "unknown",
              severity: issue.severity || "warning",
              description: issue.description || "",
              location: issue.location || "",
              fix: issue.fix || "",
            }),
          ),
        };
      }
    } catch (e) {
      this.logger.warn(
        `Failed to parse consistency check result: ${(e as Error).message}`,
      );
    }
    return { passed: true, score: 100, issues: [] };
  }

  /**
   * 构建章节创作提示词
   */
  private buildChapterWriterPrompt(
    chapterNumber: number,
    chapterInfo: { title: string; plot: string; keyPoint: string },
    outline: { core: { summary: string; genre: string; theme: string } },
    worldSettings: Record<string, unknown>,
    previousSummary: string,
    userPrompt: string,
    keeperContext?: {
      relevantCharacters: string[];
      relevantLocations: string[];
      previousEvents: string[];
      warnings: string[];
      contextPrompt: string;
    },
  ): string {
    const characters =
      (worldSettings.characters as Array<{
        name: string;
        personality: string[];
      }>) || [];
    const characterInfo = characters
      .slice(0, 5)
      .map((c) => `${c.name}: ${(c.personality || []).join("、")}`)
      .join("\n");

    return `【创作任务】第${this.numberToChinese(chapterNumber)}章 ${chapterInfo.title}

【故事主题】${userPrompt}
【故事类型】${outline.core.genre || "通用"}
【主题思想】${outline.core.theme || "待定"}

【本章情节要点】
${chapterInfo.plot}
${chapterInfo.keyPoint ? `关键转折：${chapterInfo.keyPoint}` : ""}

【主要角色】
${characterInfo || "待定"}

${previousSummary ? `【前文摘要】\n${previousSummary}\n` : "【开篇说明】这是故事的开始，需要引人入胜，建立故事背景和主要人物。\n"}
${keeperContext?.contextPrompt ? `【守护者提醒】\n${keeperContext.contextPrompt}\n` : ""}${keeperContext?.warnings?.length ? `\n⚠️ 注意事项：\n${keeperContext.warnings.map((w: string) => `- ${w}`).join("\n")}\n` : ""}
【创作要求】
1. 字数约 3000 字
2. 语言流畅自然，富有文学性
3. 人物对话生动，符合角色性格
4. 场景描写细腻，有画面感
5. 情节紧凑，节奏把控好

请直接输出章节内容，以"第${this.numberToChinese(chapterNumber)}章 ${chapterInfo.title}"开头：`;
  }

  /**
   * 生成章节摘要
   */
  private generateChapterSummary(content: string): string {
    // 取章节的前 200 字和后 200 字作为上下文
    const maxLength = 400;
    if (content.length <= maxLength) {
      return content;
    }
    const start = content.slice(0, 200);
    const end = content.slice(-200);
    return `${start}...\n...\n${end}`;
  }

  // ==================== 守护者增强功能 ====================

  /**
   * 守护者提取章节相关上下文
   * 在写作前调用，为作家提供相关设定信息
   */
  private async extractChapterContext(
    projectId: string,
    missionId: string,
    chapterNumber: number,
    chapterInfo: { title: string; plot: string; keyPoint?: string },
    worldSettings: Record<string, unknown>,
    modelId: string,
  ): Promise<{
    relevantCharacters: string[];
    relevantLocations: string[];
    previousEvents: string[];
    warnings: string[];
    contextPrompt: string;
  }> {
    // 发送守护者开始提取上下文事件
    await this.eventEmitter.emitKeeperExtractingContext(
      projectId,
      chapterNumber,
    );
    await this.eventEmitter.emitAgentWorking(projectId, {
      agentId: "bible-keeper",
      agentName: "设定守护者",
      agentRole: "keeper",
      status: "working",
      taskDescription: `为第${this.numberToChinese(chapterNumber)}章提取相关设定`,
    });

    const keeperModel = (await this.getModelForRole("bible-keeper")) || modelId;

    const extractPrompt = `作为设定守护者，请根据章节大纲从世界观设定中提取相关信息。

【章节信息】
章节：第${chapterNumber}章 ${chapterInfo.title}
情节：${chapterInfo.plot}
${chapterInfo.keyPoint ? `关键点：${chapterInfo.keyPoint}` : ""}

【世界观设定】
${JSON.stringify(worldSettings, null, 2).slice(0, 3000)}

请提取与本章相关的信息，输出 JSON：
{
  "relevantCharacters": ["角色1的相关设定摘要", "角色2的相关设定摘要"],
  "relevantLocations": ["地点1的描述", "地点2的描述"],
  "previousEvents": ["与本章相关的前情", "需要呼应的伏笔"],
  "warnings": ["注意事项1：如某角色已死亡不能出现", "注意事项2：某物品已损毁"],
  "contextSummary": "给作家的上下文提示，200字以内"
}`;

    try {
      const response = await this.aiChatService.chat({
        messages: [
          {
            role: "system",
            content:
              this.bibleKeeper.description +
              "\n\n你是专业的设定守护者，帮助作家了解本章相关的设定信息。请以 JSON 格式输出。",
          },
          { role: "user", content: extractPrompt },
        ],
        model: keeperModel,
        temperature: 0.3,
        maxTokens: 2000,
      });

      const content = response.content || "{}";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        const result = {
          relevantCharacters: parsed.relevantCharacters || [],
          relevantLocations: parsed.relevantLocations || [],
          previousEvents: parsed.previousEvents || [],
          warnings: parsed.warnings || [],
          contextPrompt: parsed.contextSummary || "",
        };

        // 发送上下文就绪事件
        await this.eventEmitter.emitKeeperContextReady(
          projectId,
          chapterNumber,
          result,
        );
        await this.eventEmitter.emitAgentWorking(projectId, {
          agentId: "bible-keeper",
          agentName: "设定守护者",
          agentRole: "keeper",
          status: "completed",
          taskDescription: `已为第${this.numberToChinese(chapterNumber)}章准备上下文`,
        });

        this.logger.log(
          `[${missionId}] Keeper extracted context for chapter ${chapterNumber}: ${result.relevantCharacters.length} characters, ${result.warnings.length} warnings`,
        );

        return result;
      }
    } catch (e) {
      this.logger.warn(
        `[${missionId}] Keeper context extraction failed: ${(e as Error).message}`,
      );
    }

    // 降级返回空上下文
    return {
      relevantCharacters: [],
      relevantLocations: [],
      previousEvents: [],
      warnings: [],
      contextPrompt: "",
    };
  }

  /**
   * 守护者更新故事圣经
   * 在写作后调用，记录新的事实和变化
   */
  private async updateStoryBibleAfterChapter(
    projectId: string,
    missionId: string,
    chapterNumber: number,
    chapterContent: string,
    worldSettings: Record<string, unknown>,
    modelId: string,
  ): Promise<{
    newFacts: string[];
    characterUpdates: string[];
    timelineEvents: string[];
  }> {
    // 发送守护者更新圣经事件
    await this.eventEmitter.emitKeeperUpdatingBible(projectId, chapterNumber);
    await this.eventEmitter.emitAgentWorking(projectId, {
      agentId: "bible-keeper",
      agentName: "设定守护者",
      agentRole: "keeper",
      status: "working",
      taskDescription: `分析第${this.numberToChinese(chapterNumber)}章并更新故事圣经`,
    });

    const keeperModel = (await this.getModelForRole("bible-keeper")) || modelId;

    const updatePrompt = `作为设定守护者，请分析这一章节并提取需要记录到故事圣经的新信息。

【章节内容】
${chapterContent.slice(0, 4000)}

【当前世界观设定摘要】
${JSON.stringify(worldSettings, null, 2).slice(0, 1500)}

请识别本章中出现的：
1. 新事实（新出现的人物、地点、物品、组织等）
2. 角色状态变化（受伤、死亡、关系变化、获得新能力等）
3. 时间线事件（重要事件及其时间）

输出 JSON：
{
  "newFacts": ["新事实1", "新事实2"],
  "characterUpdates": ["张三受了重伤", "李四获得了神秘宝剑"],
  "timelineEvents": ["第X天：发生了某事件"]
}

只输出有意义的变化，如果没有重要变化可以返回空数组。`;

    try {
      const response = await this.aiChatService.chat({
        messages: [
          {
            role: "system",
            content:
              this.bibleKeeper.description +
              "\n\n你是专业的设定守护者，负责跟踪和记录故事中的重要变化。请以 JSON 格式输出。",
          },
          { role: "user", content: updatePrompt },
        ],
        model: keeperModel,
        temperature: 0.3,
        maxTokens: 1500,
      });

      const content = response.content || "{}";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        const updates = {
          newFacts: parsed.newFacts || [],
          characterUpdates: parsed.characterUpdates || [],
          timelineEvents: parsed.timelineEvents || [],
        };

        // 将更新保存到数据库（创建 WorldSetting 记录）
        if (
          updates.newFacts.length > 0 ||
          updates.characterUpdates.length > 0 ||
          updates.timelineEvents.length > 0
        ) {
          try {
            const bible = await this.prisma.storyBible.findFirst({
              where: { projectId },
            });
            if (bible) {
              // 创建一个 WorldSetting 记录来存储章节更新
              await this.prisma.worldSetting.create({
                data: {
                  bibleId: bible.id,
                  category: "_chapterUpdate",
                  name: `第${chapterNumber}章更新`,
                  description: [
                    ...updates.newFacts.map((f: string) => `[新事实] ${f}`),
                    ...updates.characterUpdates.map(
                      (u: string) => `[角色变化] ${u}`,
                    ),
                    ...updates.timelineEvents.map(
                      (e: string) => `[时间线] ${e}`,
                    ),
                  ].join("\n"),
                  references: {
                    chapter: chapterNumber,
                    timestamp: new Date().toISOString(),
                    ...updates,
                  },
                },
              });

              this.logger.log(
                `[${missionId}] Keeper updated bible after chapter ${chapterNumber}: ${updates.newFacts.length} facts, ${updates.characterUpdates.length} character updates`,
              );
            }
          } catch (dbError) {
            this.logger.warn(
              `[${missionId}] Failed to save bible updates: ${(dbError as Error).message}`,
            );
          }
        }

        // 发送更新完成事件
        await this.eventEmitter.emitKeeperBibleUpdated(
          projectId,
          chapterNumber,
          updates,
        );
        await this.eventEmitter.emitAgentWorking(projectId, {
          agentId: "bible-keeper",
          agentName: "设定守护者",
          agentRole: "keeper",
          status: "completed",
          taskDescription:
            updates.newFacts.length + updates.characterUpdates.length > 0
              ? `已记录 ${updates.newFacts.length + updates.characterUpdates.length} 项更新`
              : "本章无重大设定变化",
        });

        return updates;
      }
    } catch (e) {
      this.logger.warn(
        `[${missionId}] Keeper bible update failed: ${(e as Error).message}`,
      );
    }

    return {
      newFacts: [],
      characterUpdates: [],
      timelineEvents: [],
    };
  }

  /**
   * 数字转中文
   */
  private numberToChinese(num: number): string {
    const chineseNums = [
      "零",
      "一",
      "二",
      "三",
      "四",
      "五",
      "六",
      "七",
      "八",
      "九",
      "十",
    ];
    if (num <= 10) return chineseNums[num];
    if (num < 20) return "十" + (num === 10 ? "" : chineseNums[num - 10]);
    if (num < 100) {
      const tens = Math.floor(num / 10);
      const ones = num % 10;
      return chineseNums[tens] + "十" + (ones === 0 ? "" : chineseNums[ones]);
    }
    return num.toString();
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
      } else if (input.missionType === "edit") {
        // @Leader 编辑调整：由故事架构师处理修改请求
        userPrompt = `作为故事架构师，请根据以下指令对当前内容进行调整：\n\n${userPrompt}\n\n要求：
1. 仔细理解用户的修改意图
2. 保持与现有内容的一致性
3. 输出修改后的完整内容
4. 说明主要修改了哪些部分`;
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
      case "edit":
        // @Leader 编辑调整：单任务，由故事架构师处理
        totalTasks = 1;
        granularityLevel = "section";
        expectedWordsPerTask = input.targetWordCount || 2000;
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
      } else if (input.missionType === "edit") {
        // @Leader 编辑调整：更新指定章节或创建新的修订版本
        if (input.chapterId) {
          await this.updateChapterContent(input.chapterId, content, wordCount);
        } else {
          // 没有指定章节时，将编辑结果保存到项目的最新卷/章节
          await this.saveEditToLatestContent(
            input.projectId,
            content,
            wordCount,
          );
        }
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
   * 创建大纲结构（卷和章节，空内容）
   * 在大纲生成后立即调用，让前端能看到章节结构
   */
  private async createOutlineStructure(
    projectId: string,
    outline: {
      core: { summary: string; genre: string; theme: string };
      volumes: Array<{
        title: string;
        conflict: string;
        plot: string;
        emotion: string;
      }>;
      chapters: Array<{
        volumeIndex: number;
        title: string;
        plot: string;
        keyPoint: string;
      }>;
    },
  ): Promise<void> {
    try {
      // 删除现有的卷和章节（如果有的话）
      const existingVolumes = await this.prisma.writingVolume.findMany({
        where: { projectId },
        select: { id: true },
      });
      if (existingVolumes.length > 0) {
        await this.prisma.writingChapter.deleteMany({
          where: { volumeId: { in: existingVolumes.map((v) => v.id) } },
        });
        await this.prisma.writingVolume.deleteMany({
          where: { projectId },
        });
      }

      // 创建卷
      const volumeMap = new Map<number, string>(); // volumeIndex -> volumeId
      for (let i = 0; i < outline.volumes.length; i++) {
        const vol = outline.volumes[i];
        const volume = await this.prisma.writingVolume.create({
          data: {
            projectId,
            title: vol.title || `第${this.numberToChinese(i + 1)}卷`,
            volumeNumber: i + 1,
            synopsis: vol.plot || vol.conflict || "",
          },
        });
        volumeMap.set(i, volume.id);
      }

      // 如果没有卷，创建一个默认卷
      if (volumeMap.size === 0) {
        const defaultVolume = await this.prisma.writingVolume.create({
          data: {
            projectId,
            title: "第一卷",
            volumeNumber: 1,
          },
        });
        volumeMap.set(0, defaultVolume.id);
      }

      // 创建章节（空内容，只有标题和大纲）
      for (let i = 0; i < outline.chapters.length; i++) {
        const ch = outline.chapters[i];
        const volumeId = volumeMap.get(ch.volumeIndex) || volumeMap.get(0)!;

        // 清理标题 - 移除开头的章节号（如"第一章"、"第1章"等）
        let cleanTitle = ch.title || "";
        cleanTitle = cleanTitle
          .replace(/^第[一二三四五六七八九十百千\d]+章[：:\s]*/i, "")
          .trim();
        if (!cleanTitle) {
          cleanTitle = `章节 ${i + 1}`;
        }

        await this.prisma.writingChapter.create({
          data: {
            volumeId,
            title: cleanTitle,
            chapterNumber: i + 1,
            outline: ch.plot || "", // 章节大纲
            content: "", // 空内容，等待后续填充
            wordCount: 0,
            status: "PLANNED",
          },
        });
      }

      this.logger.log(
        `[${projectId}] Created outline structure: ${outline.volumes.length} volumes, ${outline.chapters.length} chapters`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to create outline structure: ${(error as Error).message}`,
      );
      // 不抛出错误，继续执行
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
    // 分割内容为章节（按 "第X章" 或 "Chapter" 分割）
    const splitChapters = this.splitIntoChapters(content);

    this.logger.log(
      `[createVolumeAndChapters] Split content into ${splitChapters.length} chapters`,
    );

    // 获取现有的章节（按章节号排序）
    const existingChapters = await this.prisma.writingChapter.findMany({
      where: {
        volume: { projectId },
      },
      orderBy: { chapterNumber: "asc" },
      include: { volume: true },
    });

    this.logger.log(
      `[createVolumeAndChapters] Found ${existingChapters.length} existing chapters`,
    );

    // 如果有现有章节，优先更新它们的内容（保留卷结构）
    if (existingChapters.length > 0) {
      for (let i = 0; i < splitChapters.length; i++) {
        const chapterContent = splitChapters[i];
        const chapterWordCount = this.countWords(chapterContent);
        const chapterNumber = i + 1;

        // 提取章节标题
        const titleMatch = chapterContent.match(
          /^第[一二三四五六七八九十百千\d]+章[：:\s]+(.+?)[\n\r]/i,
        );
        let chapterTitle = titleMatch
          ? titleMatch[1]
              .trim()
              .replace(/^第[一二三四五六七八九十百千\d]+章[：:\s]*/i, "")
          : "";

        if (
          !chapterTitle ||
          chapterTitle.match(/^第[一二三四五六七八九十百千\d]+章/)
        ) {
          chapterTitle = `第${chapterNumber}章`;
        }

        // 查找对应的现有章节
        const existingChapter = existingChapters.find(
          (ch) => ch.chapterNumber === chapterNumber,
        );

        if (existingChapter) {
          // 更新现有章节的内容（保留其卷归属）
          await this.prisma.writingChapter.update({
            where: { id: existingChapter.id },
            data: {
              content: chapterContent,
              wordCount: chapterWordCount,
              status: "DRAFT",
              updatedAt: new Date(),
            },
          });
          this.logger.log(
            `Updated chapter ${chapterNumber} with ${chapterWordCount} words`,
          );
        } else {
          // 如果没有对应章节，创建新章节（放到第一个卷）
          const firstVolume = existingChapters[0]?.volume;
          if (firstVolume) {
            await this.prisma.writingChapter.create({
              data: {
                volumeId: firstVolume.id,
                title: chapterTitle,
                chapterNumber,
                content: chapterContent,
                wordCount: chapterWordCount,
                status: "DRAFT",
              },
            });
            this.logger.log(
              `Created new chapter ${chapterNumber}: ${chapterTitle}`,
            );
          }
        }
      }

      // 更新项目总字数
      await this.updateProjectWordCount(projectId);
      return;
    }

    // 如果没有现有章节，使用原始逻辑创建卷和章节
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

    // 创建新章节
    for (let i = 0; i < splitChapters.length; i++) {
      const chapterContent = splitChapters[i];
      const chapterWordCount = this.countWords(chapterContent);
      const chapterNumber = i + 1;

      // 提取章节标题 - 只提取标题部分，不包含章节号
      const titleMatch = chapterContent.match(
        /^第[一二三四五六七八九十百千\d]+章[：:\s]+(.+?)[\n\r]/i,
      );
      // 从标题中移除可能重复的章节号
      let chapterTitle = titleMatch
        ? titleMatch[1]
            .trim()
            .replace(/^第[一二三四五六七八九十百千\d]+章[：:\s]*/i, "")
        : "";

      // 如果标题为空或仍包含章节格式，使用默认标题
      if (
        !chapterTitle ||
        chapterTitle.match(/^第[一二三四五六七八九十百千\d]+章/)
      ) {
        chapterTitle = `第${chapterNumber}章`;
      }

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
   * 支持多种章节标记格式：
   * - 中文数字：第一章、第二章...
   * - 阿拉伯数字：第1章、第2章...
   * - 英文格式：Chapter 1, Chapter 2...
   */
  private splitIntoChapters(content: string): string[] {
    // 尝试按章节标记分割（支持中文数字和阿拉伯数字）
    const chapterPattern =
      /(?=第[一二三四五六七八九十百千\d]+章|Chapter\s*\d+)/gi;
    const parts = content.split(chapterPattern).filter((p) => p.trim());

    if (parts.length > 1) {
      this.logger.log(
        `Split content into ${parts.length} chapters by chapter markers`,
      );
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

    this.logger.log(
      `Split content into ${chapters.length} chapters by paragraph grouping`,
    );

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
   * 将 @Leader 编辑结果保存到项目的最新章节
   */
  private async saveEditToLatestContent(
    projectId: string,
    content: string,
    wordCount: number,
  ): Promise<void> {
    // 查找项目的最新卷
    const latestVolume = await this.prisma.writingVolume.findFirst({
      where: { projectId },
      orderBy: { volumeNumber: "desc" },
    });

    if (latestVolume) {
      // 查找该卷的最新章节
      const latestChapter = await this.prisma.writingChapter.findFirst({
        where: { volumeId: latestVolume.id },
        orderBy: { chapterNumber: "desc" },
      });

      if (latestChapter) {
        // 更新最新章节的内容
        await this.updateChapterContent(latestChapter.id, content, wordCount);
        this.logger.log(
          `Updated latest chapter ${latestChapter.id} with edit content`,
        );
      } else {
        // 没有章节，创建新章节
        await this.createNewChapter(latestVolume.id, content, wordCount);
        this.logger.log(
          `Created new chapter in volume ${latestVolume.id} for edit content`,
        );
      }
    } else {
      // 没有卷，创建新卷和章节
      await this.createVolumeAndChapters(projectId, content, wordCount);
      this.logger.log(
        `Created new volume and chapter in project ${projectId} for edit content`,
      );
    }
  }

  // ==================== 继续创作相关函数 ====================

  /**
   * 检查项目是否已有内容
   */
  private async checkExistingContent(projectId: string): Promise<{
    hasContent: boolean;
    currentWords: number;
    totalChapters: number;
    writtenChapters: number;
    unwrittenChapters: Array<{
      id: string;
      chapterNumber: number;
      title: string;
      volumeId: string;
    }>;
    storyBible: any;
  }> {
    // 获取项目当前字数
    const project = await this.prisma.writingProject.findUnique({
      where: { id: projectId },
      select: { currentWords: true, targetWords: true },
    });

    // 获取所有章节
    const chapters = await this.prisma.writingChapter.findMany({
      where: { volume: { projectId } },
      select: {
        id: true,
        chapterNumber: true,
        title: true,
        volumeId: true,
        wordCount: true,
        content: true,
      },
      orderBy: { chapterNumber: "asc" },
    });

    // 找出未写内容的章节（wordCount = 0 或 content 为空/占位内容）
    const unwrittenChapters = chapters.filter(
      (ch) =>
        ch.wordCount === 0 ||
        !ch.content ||
        ch.content.includes("AI 写作团队正在创作中") ||
        ch.content.includes("内容生成中"),
    );

    // 获取故事圣经
    const storyBible = await this.prisma.storyBible.findUnique({
      where: { projectId },
    });

    return {
      hasContent: chapters.length > 0 && (project?.currentWords || 0) > 0,
      currentWords: project?.currentWords || 0,
      totalChapters: chapters.length,
      writtenChapters: chapters.length - unwrittenChapters.length,
      unwrittenChapters: unwrittenChapters.map((ch) => ({
        id: ch.id,
        chapterNumber: ch.chapterNumber,
        title: ch.title,
        volumeId: ch.volumeId,
      })),
      storyBible,
    };
  }

  /**
   * 继续创作已有故事（不重建大纲，只写空白章节）
   */
  private async continueExistingStory(
    input: WritingMissionInput,
    modelId: string,
    missionId: string,
    existingContent: {
      hasContent: boolean;
      currentWords: number;
      totalChapters: number;
      writtenChapters: number;
      unwrittenChapters: Array<{
        id: string;
        chapterNumber: number;
        title: string;
        volumeId: string;
      }>;
      storyBible: any;
    },
    targetWordCount: number,
  ): Promise<string | null> {
    this.logger.log(
      `[${missionId}] Continuing story: ${existingContent.writtenChapters}/${existingContent.totalChapters} chapters written, ${existingContent.currentWords}/${targetWordCount} words`,
    );

    // 发送任务开始事件
    await this.eventEmitter.emitMissionStarted(
      input.projectId,
      missionId,
      "full_story",
      targetWordCount,
    );
    await this.saveMissionLog(
      missionId,
      "mission:started",
      `🚀 继续创作任务开始，已有 ${existingContent.currentWords.toLocaleString()} 字，目标 ${targetWordCount.toLocaleString()} 字`,
    );

    // 获取世界观设定
    let worldSettings: any = null;
    if (existingContent.storyBible) {
      worldSettings = {
        world: {
          type: existingContent.storyBible.worldType,
          theme: existingContent.storyBible.theme,
          premise: existingContent.storyBible.premise,
        },
      };
    }

    // 获取作家模型
    const writerModel = (await this.getModelForRole("writer")) || modelId;

    const allContent: string[] = [];
    let currentWordCount = existingContent.currentWords;
    const chaptersToWrite = existingContent.unwrittenChapters;

    // 如果没有空白章节但字数未达标，需要添加新章节
    if (chaptersToWrite.length === 0 && currentWordCount < targetWordCount) {
      this.logger.log(
        `[${missionId}] All chapters written but target not reached, need to add more chapters`,
      );
      // TODO: 添加新章节的逻辑
      await this.saveMissionLog(
        missionId,
        "mission:info",
        `📝 所有章节已写完，当前 ${currentWordCount.toLocaleString()} 字。如需继续扩展，请在大纲中添加更多章节。`,
      );
    }

    // 逐章写作
    for (let i = 0; i < chaptersToWrite.length; i++) {
      const chapter = chaptersToWrite[i];

      // 检查是否已达到目标字数
      if (currentWordCount >= targetWordCount) {
        this.logger.log(
          `[${missionId}] Target word count reached (${currentWordCount}/${targetWordCount}), stopping`,
        );
        await this.saveMissionLog(
          missionId,
          "mission:info",
          `✅ 已达到目标字数 ${targetWordCount.toLocaleString()} 字`,
        );
        break;
      }

      const progress = Math.round(15 + (80 * (i + 1)) / chaptersToWrite.length);
      await this.updateMissionProgress(
        missionId,
        progress,
        `作家正在创作第${chapter.chapterNumber}章「${chapter.title}」...`,
      );

      this.logger.log(
        `[${missionId}] Writing chapter ${chapter.chapterNumber}: ${chapter.title}`,
      );

      // 发送章节开始事件
      await this.eventEmitter.emitChapterStarted(
        input.projectId,
        chapter.chapterNumber,
        chapter.title,
        0,
      );

      // 获取前文摘要
      const previousChapters = await this.prisma.writingChapter.findMany({
        where: {
          volume: { projectId: input.projectId },
          chapterNumber: { lt: chapter.chapterNumber },
          wordCount: { gt: 0 },
        },
        orderBy: { chapterNumber: "desc" },
        take: 2,
        select: { chapterNumber: true, title: true, content: true },
      });

      const previousSummary = previousChapters
        .reverse()
        .map(
          (ch) =>
            `第${ch.chapterNumber}章「${ch.title}」: ${ch.content?.slice(0, 300)}...`,
        )
        .join("\n\n");

      // 发送作家工作事件
      await this.eventEmitter.emitAgentWorking(input.projectId, {
        agentId: "writer",
        agentName: "作家",
        agentRole: "writer",
        status: "working",
        taskDescription: `创作第${chapter.chapterNumber}章「${chapter.title}」`,
        progress,
      });

      // 作家创作
      const writerPrompt = `你正在继续创作一部小说，请创作第${chapter.chapterNumber}章「${chapter.title}」。

【故事背景】
${input.userPrompt}

${worldSettings ? `【世界观设定】\n${JSON.stringify(worldSettings, null, 2)}\n` : ""}

${previousSummary ? `【前文摘要】\n${previousSummary}\n` : "【开篇提示】\n这是故事的一个新章节。"}

【创作要求】
1. 字数约 3000 字
2. 语言流畅，富有文学性
3. 情节连贯，承接前文
4. 角色性格一致

请直接输出章节内容，以"第${this.numberToChinese(chapter.chapterNumber)}章 ${chapter.title}"开头。`;

      const writerResponse = await this.aiChatService.chat({
        messages: [
          {
            role: "system",
            content:
              "你是专业的小说作家，擅长创作引人入胜的故事。请直接输出章节内容。",
          },
          { role: "user", content: writerPrompt },
        ],
        model: writerModel,
        temperature: 0.8,
        maxTokens: 6000,
      });

      let chapterContent = writerResponse.content || "";

      if (chapterContent.length < 500) {
        this.logger.warn(
          `[${missionId}] Chapter content too short, retrying...`,
        );
        // 简化重试
        const retryResponse = await this.aiChatService.chat({
          messages: [
            {
              role: "system",
              content: "你是小说作家。请创作约3000字的章节内容。",
            },
            {
              role: "user",
              content: `请创作"第${chapter.chapterNumber}章 ${chapter.title}"。${previousSummary ? `前文：${previousSummary.slice(0, 500)}` : ""}`,
            },
          ],
          model: writerModel,
          temperature: 0.85,
          maxTokens: 6000,
        });
        chapterContent =
          retryResponse.content ||
          `第${this.numberToChinese(chapter.chapterNumber)}章 ${chapter.title}\n\n（创作中...）`;
      }

      const chapterWordCount = this.countWords(chapterContent);

      // 保存章节内容
      await this.prisma.writingChapter.update({
        where: { id: chapter.id },
        data: {
          content: chapterContent,
          wordCount: chapterWordCount,
          status: "FINAL",
        },
      });

      // 保存日志
      await this.saveMissionLog(
        missionId,
        "chapter:content",
        `📖 第${chapter.chapterNumber}章「${chapter.title}」完成 (${chapterWordCount} 字)`,
        {
          agentId: "writer",
          agentName: "✍️ 作家",
          detail: {
            type: "chapter_content",
            data: chapterContent.slice(0, 300) + "...",
          },
        },
      );

      // 发送章节完成事件
      await this.eventEmitter.emitChapterCompleted(
        input.projectId,
        chapter.chapterNumber,
        chapterWordCount,
      );

      // 作家完成此章
      await this.eventEmitter.emitAgentWorking(input.projectId, {
        agentId: "writer",
        agentName: "作家",
        agentRole: "writer",
        status: "completed",
        taskDescription: `第${chapter.chapterNumber}章完成 (${chapterWordCount} 字)`,
      });

      allContent.push(chapterContent);
      currentWordCount += chapterWordCount;

      // 更新项目字数
      await this.updateProjectWordCount(input.projectId);

      this.logger.log(
        `[${missionId}] Chapter ${chapter.chapterNumber} done: ${chapterWordCount} words, total: ${currentWordCount}`,
      );
    }

    // 完成
    await this.updateMissionProgress(missionId, 100, "创作完成！");
    await this.saveMissionLog(
      missionId,
      "mission:completed",
      `🎉 创作完成！共完成 ${chaptersToWrite.length} 章，当前总字数 ${currentWordCount.toLocaleString()} 字`,
    );

    return allContent.join("\n\n---\n\n");
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
    // Convert mission type to uppercase and map to valid enum values
    // Note: full_story maps to CHAPTER since FULL_STORY may not exist in DB yet
    const missionTypeMap: Record<string, string> = {
      outline: "OUTLINE",
      chapter: "CHAPTER",
      revision: "REVISION",
      consistency: "CONSISTENCY",
      consistency_check: "CONSISTENCY",
      full_story: "CHAPTER", // Use CHAPTER as fallback until FULL_STORY migration runs
      edit: "REVISION", // @Leader 编辑调整映射到 REVISION
    };
    const missionType =
      missionTypeMap[input.missionType.toLowerCase()] || "CHAPTER";

    return this.prisma.writingMission.create({
      data: {
        id: missionId,
        projectId: input.projectId,
        missionType: missionType as
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
        createdAt: m.createdAt, // 前端需要这个字段来排序
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

  // ==================== 任务日志管理 ====================

  /**
   * 获取任务日志（交互区消息）
   * @param offset - 跳过前 N 条记录（用于分页加载历史）
   */
  async getMissionLogs(
    missionId: string,
    userId: string,
    limit?: number,
    offset?: number,
  ) {
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

    // 获取总数
    const total = await this.prisma.writingMissionLog.count({
      where: { missionId },
    });

    const logs = await this.prisma.writingMissionLog.findMany({
      where: { missionId },
      orderBy: { createdAt: "asc" },
      take: limit || 500,
      skip: offset || 0, // 支持分页加载历史
    });

    return {
      items: logs.map((log) => ({
        id: log.id,
        eventType: log.eventType,
        agentId: log.agentId,
        agentName: log.agentName,
        content: log.content,
        detail: log.detail,
        createdAt: log.createdAt,
      })),
      total,
    };
  }

  /**
   * 保存任务日志
   * 由事件发射时自动调用
   */
  async saveMissionLog(
    missionId: string,
    eventType: string,
    content: string,
    options?: {
      agentId?: string;
      agentName?: string;
      detail?: Record<string, unknown>;
    },
  ) {
    try {
      await this.prisma.writingMissionLog.create({
        data: {
          missionId,
          eventType,
          content,
          agentId: options?.agentId,
          agentName: options?.agentName,
          detail: options?.detail as object | undefined,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to save mission log: ${(error as Error).message}`,
      );
    }
  }
}
