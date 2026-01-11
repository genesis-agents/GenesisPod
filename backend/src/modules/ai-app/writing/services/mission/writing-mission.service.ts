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

import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
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
import { ExpressionMemoryService } from "../quality/expression-memory.service";
import { QualityGateService } from "../quality/quality-gate.service";
import { ProfessionalVoiceService } from "../quality/professional-voice.service";
import { SensoryImmersionService } from "../quality/sensory-immersion.service";
import { OpeningHookService } from "../quality/opening-hook.service";
import { NarrativeCraftService } from "../quality/narrative-craft.service";
import { PacingControlService } from "../quality/pacing-control.service";

// World Building Enhancement - 世界观知识库增强
import { WorldBuildingEnhancerService } from "../bible/world-building-enhancer.service";

// Event Emitter for real-time updates
import { WritingEventEmitterService } from "../events/writing-event-emitter.service";

// Writing Style Presets
import {
  generateStylePrompt,
  recommendStyleByGenre,
} from "../../constants/writing-style-presets";

// Style Template Service (Three-layer style configuration)
import { StyleTemplateService } from "../style/style-template.service";

/**
 * 写作任务类型
 */
export type WritingMissionType =
  | "outline" // 大纲创作
  | "chapter" // 章节写作
  | "revision" // 修订
  | "consistency_check" // 一致性检查
  | "full_story" // 完整故事创作
  | "edit"; // 编辑调整（@Leader 触发）

/**
 * 对话消息（多轮对话）
 */
export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

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
  /** 目标 Agent（@mention 指定） */
  targetAgent?: string;
  /** 多轮对话历史 */
  conversationHistory?: ConversationMessage[];
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
    // Expression Memory - 表达冷却服务
    private readonly expressionMemory: ExpressionMemoryService,
    // Style Template - 三层风格配置服务
    private readonly styleTemplateService: StyleTemplateService,
    // Quality Gate - 质量门禁服务（强制执行表达冷却）
    private readonly qualityGate: QualityGateService,
    // v3 新增：专业声音、五感沉浸、开篇钩子服务
    private readonly professionalVoice: ProfessionalVoiceService,
    private readonly sensoryImmersion: SensoryImmersionService,
    private readonly openingHook: OpeningHookService,
    // 叙事工艺服务 - 用于结尾检测和自动重写
    private readonly narrativeCraft: NarrativeCraftService,
    // 世界观知识库增强服务
    private readonly worldBuildingEnhancer: WorldBuildingEnhancerService,
    // 节奏控制服务 - 用于控制章节节奏变化
    private readonly pacingControl: PacingControlService,
  ) {
    // 注册角色和团队配置（不需要 LLM）
    this.registerWritingRoles();
    this.registerWritingTeamConfig();
    void this.contextBuilder;
    void this.storyBibleService;
    void this.eventEmitter; // Used in generateFullStory
    // v3 质量服务 - 用于 generateQualityConstraints
    void this.professionalVoice;
    void this.sensoryImmersion;
    void this.openingHook;
    void this.pacingControl;
  }

  /**
   * 生成章节质量约束提示词（v3 新增）
   * 整合专业声音、五感沉浸、开篇钩子、节奏控制等服务
   */
  private generateQualityConstraints(
    chapterNumber: number,
    chapterOutline?: string,
    characters?: Array<{ name: string; role?: string; background?: string }>,
    projectId?: string,
  ): string {
    const constraints: string[] = [];

    this.logger.debug(
      `[QualityConstraints] Generating for chapter ${chapterNumber}, outline: ${chapterOutline?.slice(0, 50) || "none"}, characters: ${characters?.length || 0}`,
    );

    // ★★★ 0. 叙事工艺约束（最高优先级，必须首先注入）★★★
    // 这是修复"AI味"问题的核心：禁止说教式写法、总结式结尾等
    try {
      const narrativeConstraints =
        this.narrativeCraft.generateNarrativeCraftConstraints();
      if (narrativeConstraints) {
        constraints.push(narrativeConstraints);
        this.logger.debug(
          `[QualityConstraints] Added narrative craft constraints (${narrativeConstraints.length} chars)`,
        );
      }
    } catch (e) {
      this.logger.warn(`[QualityConstraints] Narrative craft failed: ${e}`);
    }

    try {
      // 1. 开篇钩子约束（第一章特别强调）
      const openingConstraints = this.openingHook.generateOpeningConstraints(
        chapterNumber,
        chapterOutline,
      );
      if (openingConstraints) {
        constraints.push(openingConstraints);
      }
    } catch (e) {
      this.logger.warn(`[QualityConstraints] Opening hook failed: ${e}`);
    }

    try {
      // 2. 五感沉浸约束
      const immersionConstraints =
        this.sensoryImmersion.generateImmersionConstraints(
          chapterNumber,
          chapterOutline,
        );
      if (immersionConstraints) {
        constraints.push(immersionConstraints);
      }
    } catch (e) {
      this.logger.warn(`[QualityConstraints] Sensory immersion failed: ${e}`);
    }

    try {
      // 3. 专业声音约束（如果有角色职业信息）
      if (characters && characters.length > 0) {
        // ★ 智能提取职业：优先从 background 文本中提取，否则使用 role
        const charactersWithProfession = characters.map((c) => {
          // 尝试从背景描述中智能提取职业
          const extractedProfession = c.background
            ? this.professionalVoice.extractProfessionFromBackground(
                c.background,
              )
            : null;
          return {
            name: c.name,
            profession: extractedProfession || c.role || c.background,
            background: c.background,
          };
        });

        const voiceConstraints =
          this.professionalVoice.generateChapterVoiceConstraints(
            charactersWithProfession,
          );
        if (voiceConstraints) {
          constraints.push(voiceConstraints);
        }
      }
    } catch (e) {
      this.logger.warn(`[QualityConstraints] Professional voice failed: ${e}`);
    }

    try {
      // 4. 节奏控制约束（需要 projectId 追踪历史节奏）
      if (projectId) {
        const pacingConstraints = this.pacingControl.generatePacingConstraints(
          projectId,
          chapterNumber,
          undefined, // chapterType - 让服务从大纲自动推断
          chapterOutline,
        );
        if (pacingConstraints) {
          constraints.push(pacingConstraints);
          this.logger.debug(
            `[QualityConstraints] Added pacing control constraints for chapter ${chapterNumber}`,
          );
        }
      }
    } catch (e) {
      this.logger.warn(`[QualityConstraints] Pacing control failed: ${e}`);
    }

    if (constraints.length > 0) {
      this.logger.log(
        `[QualityConstraints] Generated ${constraints.length} constraint sections for chapter ${chapterNumber}`,
      );
    }

    // ★★★ 尾部强化检查清单（LLM注意力机制：尾部权重高）★★★
    const FINAL_CHECK_FOOTER = `
## ⚠️ 【写作完成前必须检查】最终核验清单

在输出章节内容前，必须逐项确认：

1. □ 章节最后一段是【具体场景/动作/对话】，而非抽象感慨
2. □ 结尾没有出现"这只是开始"、"风暴即将来临"等预告式语句
3. □ 结尾没有出现"她决定"、"他下定决心"、"心中燃起"等决心式语句
4. □ 结尾没有出现"她明白了"、"他终于懂得"等感悟式语句
5. □ 全文没有"她知道，XXX是XXX的象征"等说教式句子
6. □ 情绪通过动作/生理反应展示，而非直接描述

【如果任何一项未通过，必须修改后再输出】
`;

    constraints.push(FINAL_CHECK_FOOTER);

    return constraints.join("\n\n");
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

  // ==================== 降级策略 ====================

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

    // 检查是否有正在运行的任务（防止并发任务）
    const runningMission = await this.prisma.writingMission.findFirst({
      where: {
        projectId: input.projectId,
        status: "IN_PROGRESS",
      },
    });

    if (runningMission) {
      this.logger.warn(
        `Project ${input.projectId} already has a running mission ${runningMission.id}, rejecting new mission`,
      );
      throw new ConflictException(
        "当前项目已有正在执行的任务，请等待完成或取消后再试。",
      );
    }

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

        // 检查 @Leader 是否委托给 full_story 任务
        if (generatedContent === "[DELEGATE_FULL_STORY_INTERNAL]") {
          this.logger.log(
            `[${missionId}] @Leader delegated to full_story, starting chapter generation...`,
          );
          // 切换到 full_story 模式继续创作
          generatedContent = await this.generateFullStory(
            { ...input, missionType: "full_story" },
            modelToUse,
            missionId,
          );
        }
      }

      if (generatedContent) {
        totalWordCount = this.countWords(generatedContent);
        this.logger.log(
          `Generated ${totalWordCount} words for mission ${missionId}`,
        );

        // 验证生成的内容是否有效（不是错误消息）
        // edit 和 consistency_check 类型不强制最小字数（用于继续任务、状态检查等）
        // [ALL_CHAPTERS_COMPLETED] 标记表示所有章节已完成，也跳过验证
        // [CONTINUATION_COMPLETE] 标记表示续写完成，内容已保存，也跳过验证
        const isCompletionMarker =
          generatedContent.startsWith("[ALL_CHAPTERS_COMPLETED]") ||
          generatedContent.startsWith("[CONTINUATION_COMPLETE]");
        const skipWordCountCheck =
          input.missionType === "edit" ||
          input.missionType === "consistency_check" ||
          isCompletionMarker;
        const minWordCount = input.missionType === "outline" ? 50 : 200;
        const isErrorContent =
          !isCompletionMarker &&
          (generatedContent.includes("API Error") ||
            generatedContent.includes("rate limit") ||
            generatedContent.includes("429") ||
            generatedContent.includes("quota") ||
            generatedContent.includes("ECONNREFUSED") ||
            generatedContent.includes("Request failed") ||
            generatedContent.length < 100);

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
          missionId,
          modelToUse,
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
   * Phase 1: 设定守护者建立世界观和角色设定（先定义"游戏规则"）
   * Phase 2: 故事架构师基于世界观生成整体大纲（卷 + 章节结构）
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

    // ==================== Phase 1: 设定守护者 - 世界观建设（先定义"游戏规则"）====================
    this.logger.log(`[${missionId}] Phase 1: Bible Keeper building world...`);

    await this.updateMissionProgress(
      missionId,
      5,
      "设定守护者正在建立世界观...",
    );

    // 更新 orchestrator 状态 - world-building 阶段开始
    this.missionOrchestrator.updateState(missionId, {
      phase: "executing",
      currentSteps: ["world-building"],
      completedSteps: [],
      progress: 5,
    });

    // 发送设定守护者工作事件
    await this.eventEmitter.emitAgentWorking(input.projectId, {
      agentId: "bible-keeper",
      agentName: "设定守护者",
      agentRole: "keeper",
      status: "working",
      taskDescription: "建立世界观和角色设定",
    });

    await this.eventEmitter.emitWorldBuilding(input.projectId, "started");

    // 使用 LongContentEngine 初始化项目
    await this.initializeLongContentProject(missionId, input);

    const keeperModel = (await this.getModelForRole("bible-keeper")) || modelId;

    // ★ 使用知识库增强世界观构建
    const worldEnhancement =
      this.worldBuildingEnhancer.enhanceWorldBuildingPrompt(input.userPrompt);
    const hasHistoricalContext = worldEnhancement.detectedEra !== null;
    if (hasHistoricalContext) {
      this.logger.log(
        `[${missionId}] Historical knowledge detected (${worldEnhancement.detectedEra}), enhancing world building with domain knowledge`,
      );
    }

    // ★ 设定守护者独立建立世界观（不依赖大纲，让世界观成为"游戏规则"）
    // 如果检测到历史背景，使用增强的提示词（包含朝代知识库信息）
    const storyCreativitySection = hasHistoricalContext
      ? worldEnhancement.enhancedPrompt
      : `【故事创意】\n${input.userPrompt}`;

    const worldBuildingPrompt = `作为设定守护者，请根据以下故事创意独立建立完整的世界观设定。

【重要】世界观是故事的"游戏规则"，后续的章节大纲和内容创作都必须遵守这些规则。

${storyCreativitySection}

【规模信息】
- 目标字数：约 ${targetWordCount.toLocaleString()} 字
- 预计分卷：${totalVolumes} 卷
- 预计章节：${totalChapters} 章

请建立以下设定（JSON 格式）：
{
  "core": {
    "summary": "一句话概括故事核心",
    "genre": "故事类型（如：架空历史/玄幻/都市/科幻）",
    "theme": "主题思想（故事要传达的核心理念）",
    "tone": "基调风格（如：轻松幽默/严肃深沉/热血励志）"
  },
  "world": {
    "type": "世界类型",
    "era": "时代背景（具体到朝代/年代/时期）",
    "geography": "地理环境（主要场景和地点）",
    "society": "社会结构（阶层、制度、文化特点）",
    "rules": ["世界规则1（如：魔法/科技/政治规则）", "规则2", "规则3"]
  },
  "characters": [
    {
      "name": "角色名（含字号等）",
      "role": "protagonist/antagonist/supporting",
      "appearance": "外貌描述",
      "personality": ["性格特点1", "性格特点2"],
      "background": "背景故事",
      "motivation": "行动动机",
      "arc": "角色发展弧（从开始到结束的变化）"
    }
  ],
  "factions": [
    { "name": "势力/组织名", "description": "描述", "relations": "与其他势力的关系" }
  ],
  "terminology": [
    { "term": "专有名词/术语", "definition": "定义和解释" }
  ]
}

【要求】
1. 世界观设定要自洽、有内在逻辑
2. 角色设定要立体、有成长空间
3. 规则设定要明确，便于后续故事遵守
4. 至少创建 3 个主要角色和 2 个势力`;

    // ★ 世界观生成带降级策略
    let worldSettings: Record<string, unknown> = {};

    try {
      // ★ 不传 maxTokens，让 AI Engine 自动使用数据库配置
      const worldResponse = await this.aiChatService.chat({
        messages: [
          {
            role: "system",
            content:
              this.bibleKeeper.description +
              "\n\n你是专业的设定守护者，负责建立和维护世界观一致性。你建立的世界观将成为整个故事的基础框架，后续所有创作都必须遵守。请以 JSON 格式输出。",
          },
          { role: "user", content: worldBuildingPrompt },
        ],
        model: keeperModel,
        temperature: 0.7,
        // maxTokens: 由 AI Engine 自动从数据库获取
        strictMode: true, // ★ 严格模式：API失败直接抛异常，进入 catch 降级逻辑
      });

      worldSettings = this.parseWorldSettings(worldResponse.content || "{}");

      // ★ 验证世界观有效性：必须有 core 和至少一个角色
      const characters = worldSettings.characters as Array<unknown> | undefined;
      const core = worldSettings.core as Record<string, unknown> | undefined;

      if (!core || !characters || characters.length === 0) {
        this.logger.warn(
          `[${missionId}] World settings validation warning: core=${!!core}, characters=${characters?.length || 0}`,
        );
      } else {
        this.logger.log(
          `[${missionId}] World settings validated: ${characters.length} characters, core theme: ${(core as Record<string, string>).theme || "unknown"}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `[${missionId}] World building failed: ${(error as Error).message}`,
      );
      // 使用空的默认设定继续
      worldSettings = {
        core: {
          summary: input.userPrompt.slice(0, 100),
          genre: "通用",
          theme: "待定",
        },
        characters: [],
        world: {},
      };
    }
    const charactersArray = worldSettings.characters as
      | Array<unknown>
      | undefined;
    const worldCore = worldSettings.core as
      | { summary?: string; genre?: string; theme?: string; tone?: string }
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

    // ★ 保存世界观到数据库 StoryBible（在 Phase 1 就保存，确保世界观优先）
    const worldInfo = worldSettings.world as
      | {
          type?: string;
          era?: string;
          geography?: string;
          society?: string;
          rules?: string[];
        }
      | undefined;
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

    // ★ 清理字段值中可能存在的标签前缀（AI 有时会返回带标签的值）
    const cleanFieldValue = (
      value: string | undefined,
      prefixes: string[],
    ): string => {
      if (!value) return "";
      let cleaned = value.trim();
      for (const prefix of prefixes) {
        if (cleaned.toLowerCase().startsWith(prefix.toLowerCase())) {
          cleaned = cleaned.substring(prefix.length).trim();
          // 移除可能的冒号和空格
          if (cleaned.startsWith(":") || cleaned.startsWith("：")) {
            cleaned = cleaned.substring(1).trim();
          }
        }
      }
      return cleaned;
    };

    const cleanedTone = cleanFieldValue(
      worldCore?.tone || worldInfo?.era || "",
      ["tone", "基调", "基调风格", "风格"],
    );
    const cleanedTheme = cleanFieldValue(worldCore?.theme || "", [
      "theme",
      "主题",
      "主题思想",
    ]);

    try {
      // 使用事务确保数据一致性
      await this.prisma.$transaction(async (tx) => {
        // 1. 保存/更新 StoryBible
        const bible = await tx.storyBible.upsert({
          where: { projectId: input.projectId },
          create: {
            projectId: input.projectId,
            premise: `${input.userPrompt}\n\n${worldDescription}`,
            theme: cleanedTheme,
            tone: cleanedTone,
            worldType: worldInfo?.type || "现代",
            version: 1,
            lastSyncAt: new Date(),
          },
          update: {
            premise: `${input.userPrompt}\n\n${worldDescription}`,
            theme: cleanedTheme,
            tone: cleanedTone,
            worldType: worldInfo?.type || "现代",
            version: { increment: 1 },
            lastSyncAt: new Date(),
          },
        });
        this.logger.log(`[${missionId}] StoryBible saved to database`);

        // 2. 同步角色到 WritingCharacter 表
        let savedCharactersCount = 0;
        if (charactersArray && charactersArray.length > 0) {
          // 先删除旧角色
          await tx.writingCharacter.deleteMany({
            where: { bibleId: bible.id },
          });

          // 批量创建新角色
          for (const char of charactersArray) {
            const c = char as Record<string, unknown>;

            // 映射角色类型到枚举
            const roleStr = String(c.role || "supporting").toLowerCase();
            const roleEnum =
              roleStr === "protagonist"
                ? "PROTAGONIST"
                : roleStr === "antagonist"
                  ? "ANTAGONIST"
                  : "SUPPORTING";

            await tx.writingCharacter.create({
              data: {
                bibleId: bible.id,
                name: String(c.name || "未命名"),
                role: roleEnum,
                appearance: { description: String(c.appearance || "") },
                personality: {
                  traits: Array.isArray(c.personality) ? c.personality : [],
                  motivation: String(c.motivation || ""),
                  arc: String(c.arc || ""),
                },
                background: String(c.background || ""),
              },
            });
            savedCharactersCount++;
          }
          this.logger.log(
            `[${missionId}] Saved ${savedCharactersCount} characters to database`,
          );
        }

        // 3. 同步世界设定到 WorldSetting 表
        let savedSettingsCount = 0;
        if (worldInfo) {
          // 先删除旧设定
          await tx.worldSetting.deleteMany({
            where: { bibleId: bible.id },
          });

          // 构建要保存的设定列表
          const settingsToSave = [
            {
              category: "时代",
              name: "时代背景",
              description: worldInfo.era || "",
            },
            {
              category: "地理",
              name: "地理环境",
              description: worldInfo.geography || "",
            },
            {
              category: "社会",
              name: "社会结构",
              description: worldInfo.society || "",
            },
            {
              category: "类型",
              name: "世界类型",
              description: worldInfo.type || "",
            },
          ].filter((s) => s.description);

          // 批量创建新设定
          for (const setting of settingsToSave) {
            await tx.worldSetting.create({
              data: {
                bibleId: bible.id,
                category: setting.category,
                name: setting.name,
                description: setting.description,
                rules: Array.isArray(worldInfo.rules)
                  ? worldInfo.rules.map(String)
                  : [],
              },
            });
            savedSettingsCount++;
          }
          this.logger.log(
            `[${missionId}] Saved ${savedSettingsCount} world settings to database`,
          );
        }

        // 记录事务完成日志
        this.logger.log(
          `[${missionId}] Transaction completed: StoryBible + ${savedCharactersCount} characters + ${savedSettingsCount} settings`,
        );
      });
    } catch (e) {
      this.logger.error(
        `[${missionId}] Failed to save StoryBible/Characters/Settings: ${(e as Error).message}`,
      );
      // 重新抛出错误以便上层处理
      throw new Error(`世界观数据保存失败: ${(e as Error).message}`);
    }

    // 更新 orchestrator 状态 - world-building 完成, plan 开始
    this.missionOrchestrator.updateState(missionId, {
      phase: "executing",
      currentSteps: ["plan"],
      completedSteps: ["world-building"],
      progress: 10,
    });

    // ==================== Phase 2: 故事架构师 - 基于世界观规划章节 ====================
    this.logger.log(
      `[${missionId}] Phase 2: Story Architect planning based on world settings...`,
    );

    await this.updateMissionProgress(
      missionId,
      10,
      "故事架构师正在基于世界观规划章节...",
    );

    // 发送架构师工作事件
    await this.eventEmitter.emitAgentWorking(input.projectId, {
      agentId: "story-architect",
      agentName: "故事架构师",
      agentRole: "architect",
      status: "working",
      taskDescription: "基于世界观规划故事结构和章节大纲",
    });

    // ★ 架构师基于世界观生成大纲（确保章节符合世界规则）
    // 简化世界观信息，避免提示词过长导致超时
    const worldSummary = {
      core: worldCore,
      world: worldInfo,
      characters: (charactersArray || []).slice(0, 5).map((c) => {
        const char = c as Record<string, unknown>;
        return {
          name: char.name,
          role: char.role,
          motivation: char.motivation,
        };
      }),
    };

    // ★ 根据故事类型推荐写作风格（用于后续章节写作）
    const genre = worldCore?.genre || "";
    const recommendedStyles = recommendStyleByGenre(genre);
    const primaryStyleId = recommendedStyles[0] || "modern_realistic";

    this.logger.log(
      `[${missionId}] Detected genre: ${genre}, recommended style: ${primaryStyleId}`,
    );

    const outlinePrompt = `作为故事架构师，请基于以下【已建立的世界观】规划详细的章节结构。

【重要】你的章节规划必须严格遵守世界观设定，不能违反已建立的规则！

【故事创意】
${input.userPrompt}

【已建立的世界观（摘要）】
${JSON.stringify(worldSummary, null, 2)}

【规模要求】
- 总字数：约 ${targetWordCount.toLocaleString()} 字
- 分卷数：${totalVolumes} 卷
- 每卷章节数：约 ${chaptersPerVolume} 章
- 总章节数：${totalChapters} 章

【节奏与质量要求 - 极其重要】
1. ⚡ 快速进入核心冲突：第1-3章必须建立核心矛盾，不要过度铺垫
2. 🎭 场景多样性：连续2章不能在同一场景发生相同类型事件
3. 📈 节奏起伏：每5章左右需要有一个小高潮，每卷末尾需要有大高潮
4. 🔄 避免重复：不同章节的情节类型要多样化（对话、行动、冲突、发现、转折等）
5. 👥 角色轮换：避免连续多章只有相同角色组合出场

【请输出以下内容】

## 零、书名
请根据故事主题和世界观创作一个精炼、有吸引力的书名（2-8个字），如：《琅琊榜》《甄嬛传》《庆余年》《三体》

## 一、卷结构
${Array.from(
  { length: totalVolumes },
  (_, i) => `
### 第${this.numberToChinese(i + 1)}卷
- 卷名：
- 核心冲突：
- 主要情节：
- 情感走向：`,
).join("\n")}

## 二、章节大纲
请为全部 ${totalChapters} 章列出以下内容（必须符合世界观设定）：
- 章节标题：必须是有意义的标题（如"暗流涌动"、"命运交汇"），不是"第X章"这样的序号
- 主要情节：50字内概括本章核心剧情
- 关键转折：本章的关键情节点
- 涉及角色：本章出场的主要角色（必须是世界观中已定义的角色）
- 场景类型：本章主要场景（如：宫殿、街市、战场、密室等）

【重要 - 必须遵守】
1. 必须输出完整的 ${totalChapters} 个章节，一个都不能少！
2. 每个章节的 title 字段必须是具体的章节名（不含"第X章"前缀），不能为空！
3. 情节发展必须符合世界观中的规则设定
4. 角色行为必须符合其性格和动机设定
5. 章节数量不足将被拒绝，请确保输出完整的 ${totalChapters} 章
6. 连续章节不能使用相同场景发生相似事件（如连续两章都是"被召见"）

输出格式：JSON
{
  "bookTitle": "书名（2-8字，不含书名号）",
  "volumes": [{ "title": "卷名（如：风云际会）", "conflict": "核心冲突", "plot": "主要情节", "emotion": "情感走向" }],
  "chapters": [
    { "volumeIndex": 0, "title": "暗流涌动", "plot": "主角初入江湖，遭遇神秘势力", "keyPoint": "发现隐藏身世", "characters": ["主角名", "配角名"], "sceneType": "江湖客栈" },
    { "volumeIndex": 0, "title": "命运交汇", "plot": "与未来盟友相遇", "keyPoint": "获得关键线索", "characters": ["主角名", "新角色"], "sceneType": "山间小路" }
  ]
}`;

    const architectModel =
      (await this.getModelForRole("story-architect")) || modelId;
    // ★ 备用模型：使用 writer 或 keeper 的模型（确保在数据库中存在）
    const outlineFallbackWriterModel = await this.getModelForRole("writer");
    const outlineFallbackKeeperModel =
      await this.getModelForRole("bible-keeper");
    const fallbackModel =
      outlineFallbackWriterModel || outlineFallbackKeeperModel || modelId;

    // ★ 大纲生成带重试机制
    let outline: {
      bookTitle: string;
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
    } | null = null;
    let retryCount = 0;
    const maxRetries = 2;

    while (!outline && retryCount <= maxRetries) {
      const currentModel = retryCount === 0 ? architectModel : fallbackModel;
      retryCount++;

      this.logger.log(
        `[${missionId}] Generating outline (attempt ${retryCount}/${maxRetries + 1}) with model: ${currentModel}`,
      );

      try {
        // ★ 不传 maxTokens，让 AI Engine 自动使用数据库配置
        const outlineResponse = await this.aiChatService.chat({
          messages: [
            {
              role: "system",
              content:
                this.storyArchitect.description +
                "\n\n你是专业的故事架构师，擅长在既定世界观框架内规划长篇小说结构。你的规划必须严格遵守世界观设定。请以 JSON 格式输出。",
            },
            { role: "user", content: outlinePrompt },
          ],
          model: currentModel,
          temperature: 0.7,
          // maxTokens: 由 AI Engine 自动从数据库获取
          strictMode: true, // ★ 严格模式：API失败直接抛异常进入 catch 重试
        });

        if (!outlineResponse.content) {
          this.logger.warn(
            `[${missionId}] Outline generation returned empty content (attempt ${retryCount})`,
          );
          continue;
        }

        // 解析大纲
        const parsedOutline = this.parseOutlineJSON(
          outlineResponse.content,
          totalVolumes,
          totalChapters,
        );

        // ★ 验证大纲有效性：至少10%的章节有实际标题
        const titledChapters = parsedOutline.chapters.filter(
          (c) => c.title && c.title.length > 0,
        );
        const titleRatio =
          titledChapters.length / parsedOutline.chapters.length;

        if (titleRatio < 0.1) {
          this.logger.warn(
            `[${missionId}] Outline validation failed: only ${titledChapters.length}/${parsedOutline.chapters.length} chapters have titles (${(titleRatio * 100).toFixed(1)}%). Retrying...`,
          );
          // 如果是最后一次重试，仍然使用这个结果
          if (retryCount > maxRetries) {
            this.logger.warn(
              `[${missionId}] Max retries reached, using incomplete outline`,
            );
            outline = parsedOutline;
          }
          continue;
        }

        outline = parsedOutline;
        this.logger.log(
          `[${missionId}] Outline validated: ${titledChapters.length}/${parsedOutline.chapters.length} chapters have titles`,
        );
      } catch (error) {
        this.logger.warn(
          `[${missionId}] Outline generation error (attempt ${retryCount}): ${(error as Error).message}`,
        );
        if (retryCount > maxRetries) {
          throw new Error(
            `故事架构规划失败 (已重试${maxRetries}次): ${(error as Error).message}`,
          );
        }
      }
    }

    if (!outline) {
      throw new Error("故事架构规划失败：无法生成有效的章节大纲");
    }
    // ★ 如果大纲没有 core，使用世界观的 core
    if (!outline.core || !outline.core.theme) {
      outline.core = {
        summary: worldCore?.summary || input.userPrompt.slice(0, 100),
        genre: worldCore?.genre || "通用",
        theme: worldCore?.theme || "待定",
      };
    }
    this.logger.log(
      `[${missionId}] Outline generated: ${outline.chapters.length} chapters planned`,
    );

    // ★ 第二轮：填充缺失的章节标题
    const missingTitleChapters = outline.chapters
      .map((c, i) => ({ index: i, chapter: c }))
      .filter((item) => !item.chapter.title || item.chapter.title.length === 0);

    if (missingTitleChapters.length > 0) {
      this.logger.log(
        `[${missionId}] Filling ${missingTitleChapters.length} missing chapter titles...`,
      );

      try {
        const fillPrompt = `请为以下章节生成具体的章节标题（不含"第X章"前缀，如"暗流涌动"、"命运交汇"）：

【故事主题】
${input.userPrompt.slice(0, 200)}

【需要标题的章节】
${missingTitleChapters.map((item) => `第${item.index + 1}章：情节 - ${item.chapter.plot || "待定"}`).join("\n")}

请以JSON数组格式输出，每个元素是章节标题字符串：
["标题1", "标题2", ...]`;

        const fillResponse = await this.aiChatService.chat({
          messages: [
            {
              role: "system",
              content:
                "你是专业的小说创作者。请为章节生成有意境、有吸引力的标题。",
            },
            { role: "user", content: fillPrompt },
          ],
          model: architectModel,
          temperature: 0.8,
          maxTokens: 4000,
          strictMode: true,
        });

        // 解析填充的标题
        const fillContent = fillResponse.content || "[]";
        const firstBracket = fillContent.indexOf("[");
        const lastBracket = fillContent.lastIndexOf("]");
        if (firstBracket !== -1 && lastBracket !== -1) {
          const titlesJson = fillContent.substring(
            firstBracket,
            lastBracket + 1,
          );
          const titles = JSON.parse(titlesJson) as string[];

          // 填充标题
          let filledCount = 0;
          missingTitleChapters.forEach((item, i) => {
            if (titles[i]) {
              outline.chapters[item.index].title = titles[i]
                .replace(/^第[一二三四五六七八九十百千\d]+[章回][：:\s]*/i, "")
                .trim();
              filledCount++;
            }
          });

          this.logger.log(
            `[${missionId}] Filled ${filledCount}/${missingTitleChapters.length} chapter titles`,
          );

          // ★ 处理仍然缺失标题的章节（AI返回的标题数量不足时）
          const stillMissing = missingTitleChapters.filter(
            (item) =>
              !outline.chapters[item.index].title ||
              outline.chapters[item.index].title.length === 0,
          );
          if (stillMissing.length > 0) {
            this.logger.warn(
              `[${missionId}] ${stillMissing.length} chapters still missing titles, using fallback`,
            );
            stillMissing.forEach((item) => {
              const chapterNum = item.index + 1;
              outline.chapters[item.index].title = `篇章${chapterNum}`;
            });
          }
        }
      } catch (fillError) {
        this.logger.warn(
          `[${missionId}] Failed to fill missing titles: ${(fillError as Error).message}`,
        );
        // 使用默认标题作为降级
        missingTitleChapters.forEach((item) => {
          const chapterNum = item.index + 1;
          outline.chapters[item.index].title = `篇章${chapterNum}`;
        });
      }
    }

    // ★ 如果生成了书名，更新项目名称
    if (outline.bookTitle) {
      try {
        await this.prisma.writingProject.update({
          where: { id: input.projectId },
          data: { name: outline.bookTitle },
        });
        this.logger.log(
          `[${missionId}] Project name updated to: ${outline.bookTitle}`,
        );
      } catch (e) {
        this.logger.warn(
          `Failed to update project name: ${(e as Error).message}`,
        );
      }
    }

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

    // 更新 orchestrator 状态 - plan 完成, write 开始
    this.missionOrchestrator.updateState(missionId, {
      phase: "executing",
      currentSteps: ["write"],
      completedSteps: ["world-building", "plan"],
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
      // ★ 获取表达冷却约束
      const avoidancePrompt =
        await this.expressionMemory.generateAvoidancePrompt(
          input.projectId,
          chapterNumber,
        );
      if (avoidancePrompt) {
        this.logger.log(
          `[${missionId}] Expression avoidance prompt generated for chapter ${chapterNumber}`,
        );
      }

      // ★ 获取模板风格提示词（如果项目配置了风格模板）
      const templateStylePrompt = await this.getTemplateStylePrompt(
        input.projectId,
      );
      if (templateStylePrompt) {
        this.logger.log(
          `[${missionId}] Using template-based style for chapter ${chapterNumber}`,
        );
      }

      const writerPrompt = this.buildChapterWriterPrompt(
        chapterNumber,
        chapterInfo,
        outline,
        worldSettings,
        previousChapterSummary,
        input.userPrompt,
        keeperContext,
        undefined, // styleId (ignored when templateStylePrompt is provided)
        avoidancePrompt,
        templateStylePrompt, // ★ 传递模板风格提示词
      );

      let chapterContent = "";

      // ★★★ 质量约束必须在 try 块外定义，以便重试时也能使用
      const characters =
        (worldSettings?.characters as Array<{
          name: string;
          role?: string;
          background?: string;
        }>) || [];
      const qualityConstraints = this.generateQualityConstraints(
        chapterNumber,
        chapterInfo.plot,
        characters,
        input.projectId,
      );

      try {
        // ★ 使用完整的写作原则系统提示词（v3 增强）
        const writerSystemPrompt = `你是一位专业的创意写作专家，负责创作第${chapterNumber}章。

${WriterAgent.CORE_WRITING_PRINCIPLES}

${qualityConstraints ? `${qualityConstraints}\n` : ""}
## 输出要求
- 直接输出章节正文，无需额外标记
- 保持叙事流畅，情节连贯
- 对话要符合角色性格
- 描写要符合世界观设定`;

        const writerResponse = await this.aiChatService.chat({
          messages: [
            {
              role: "system",
              content: writerSystemPrompt,
            },
            { role: "user", content: writerPrompt },
          ],
          model: writerModel,
          temperature: 0.8,
          maxTokens: 6000,
          strictMode: true, // ★ 严格模式：API失败抛异常进入 catch 重试
        });
        chapterContent = writerResponse.content || "";
      } catch (error) {
        this.logger.warn(
          `[${missionId}] Chapter ${chapterNumber} API error: ${(error as Error).message}, retrying...`,
        );
        chapterContent = ""; // 触发重试逻辑
      }

      if (!chapterContent || chapterContent.length < 500) {
        this.logger.warn(
          `[${missionId}] Chapter ${chapterNumber} content too short or empty, retrying...`,
        );
        try {
          // 重试一次 - ★ 包含表达约束防止重复
          const retryPrompt = `请创作"第${this.numberToChinese(chapterNumber)}章 ${chapterInfo.title}"的内容。

情节要点：${chapterInfo.plot}

${previousChapterSummary ? `前文摘要：${previousChapterSummary}` : "这是故事的开始。"}
${avoidancePrompt ? `\n【表达约束 - 禁止使用以下表达】\n${avoidancePrompt}` : ""}`;

          // ★★★ 重试时也必须包含完整质量约束（修复：之前遗漏了 qualityConstraints）
          const retrySystemPrompt = `你是专业的小说作家。请直接创作故事内容，约3000字。

${WriterAgent.CORE_WRITING_PRINCIPLES}

${qualityConstraints ? `${qualityConstraints}\n` : ""}`;

          const retryResponse = await this.aiChatService.chat({
            messages: [
              {
                role: "system",
                content: retrySystemPrompt,
              },
              {
                role: "user",
                content: retryPrompt,
              },
            ],
            model: writerModel,
            temperature: 0.85,
            maxTokens: 6000,
            strictMode: true,
          });
          chapterContent =
            retryResponse.content ||
            `第${this.numberToChinese(chapterNumber)}章 ${chapterInfo.title}\n\n（内容生成中...）`;
        } catch (retryError) {
          this.logger.warn(
            `[${missionId}] Chapter ${chapterNumber} retry also failed: ${(retryError as Error).message}`,
          );
          chapterContent = `第${this.numberToChinese(chapterNumber)}章 ${chapterInfo.title}\n\n（内容生成中...）`;
        }
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

      // ★ v3 增强：Agent多轮交互闭环修复
      // 如果有问题，进入 修复→验证→再修复 循环，直到问题解决或达到上限
      const MAX_FIX_ATTEMPTS = 3;
      let currentIssues = checkResult.issues;
      let fixAttempt = 0;
      let totalFixedCount = 0;

      while (currentIssues.length > 0 && fixAttempt < MAX_FIX_ATTEMPTS) {
        fixAttempt++;
        this.logger.warn(
          `[${missionId}] Chapter ${chapterNumber}: Fix attempt ${fixAttempt}/${MAX_FIX_ATTEMPTS}, ${currentIssues.length} issues remaining`,
        );

        // 发送修复开始事件
        await this.eventEmitter.emitConsistencyFix(
          input.projectId,
          chapterNumber,
          currentIssues.length,
          "started",
        );

        // 发送编辑工作事件
        await this.eventEmitter.emitAgentWorking(input.projectId, {
          agentId: "editor",
          agentName: "润色编辑",
          agentRole: "editor",
          status: "working",
          taskDescription: `第${fixAttempt}轮修复：处理${currentIssues.length}个问题`,
        });

        // 编辑修复
        const fixPrompt = `请修复以下章节内容中的一致性问题：

【原始内容】
${chapterContent}

【需要修复的问题】（共${currentIssues.length}个）
${currentIssues.map((issue, i) => `${i + 1}. [${issue.severity}] ${issue.description}\n   位置：${issue.location}\n   建议修复方式：${issue.fix}`).join("\n\n")}

【世界观设定参考】
${JSON.stringify(worldSettings, null, 2).slice(0, 1500)}

【修复要求】
1. 必须修复上述所有问题，每个问题都要处理
2. 保持故事的流畅性和可读性
3. 不改变主要情节和人物关系
4. 直接输出修复后的完整内容，不要加任何解释`;

        const fixResponse = await this.aiChatService.chat({
          messages: [
            {
              role: "system",
              content:
                "你是专业的小说编辑，擅长修复一致性问题同时保持故事质量。请务必处理每一个指出的问题。",
            },
            { role: "user", content: fixPrompt },
          ],
          model: writerModel,
          temperature: 0.3, // 降低温度以提高修复准确性
          maxTokens: 6000,
        });

        if (
          !fixResponse.content ||
          fixResponse.content.length < chapterContent.length * 0.7
        ) {
          this.logger.warn(
            `[${missionId}] Fix attempt ${fixAttempt} failed: response too short or empty`,
          );
          break;
        }

        chapterContent = fixResponse.content;
        this.logger.log(
          `[${missionId}] Chapter ${chapterNumber} fix attempt ${fixAttempt} completed`,
        );

        // 检查员验证修复结果
        await this.eventEmitter.emitAgentWorking(input.projectId, {
          agentId: "consistency-checker",
          agentName: "一致性检查员",
          agentRole: "checker",
          status: "working",
          taskDescription: `验证第${fixAttempt}轮修复结果`,
        });

        // 构建针对性验证提示词
        const issueVerificationList = currentIssues
          .map(
            (issue, i) =>
              `问题${i + 1}: ${issue.description}\n位置: ${issue.location}\n修复建议: ${issue.fix}`,
          )
          .join("\n\n");

        const reCheckResponse = await this.aiChatService.chat({
          messages: [
            {
              role: "system",
              content: `你是严格的一致性校验员。请逐条检查以下问题在修复后的内容中是否已被正确解决。

对每个问题，仔细检查内容并输出：
- fixed: true（已修复）或 false（未修复）
- evidence: 具体说明修复证据或指出仍然存在的问题

输出JSON格式：
{
  "allFixed": true/false,
  "verifications": [
    {"issueIndex": 1, "fixed": true, "evidence": "已将'你'改为'汝'"},
    {"issueIndex": 2, "fixed": false, "evidence": "时间线仍然矛盾：第三段提到'三年前'但上下文显示应为'五年前'"}
  ]
}`,
            },
            {
              role: "user",
              content: `【待验证的问题列表】
${issueVerificationList}

【修复后的章节内容】
${chapterContent.slice(0, 4000)}

请严格逐条验证每个问题是否已被正确修复，不要放过任何细节。`,
            },
          ],
          model: checkerModel,
          temperature: 0.1,
          maxTokens: 1500,
        });

        // 解析验证结果
        const verificationResult = this.parseVerificationResult(
          reCheckResponse.content || '{"allFixed": true, "verifications": []}',
        );

        // 统计本轮修复结果
        const fixedThisRound = verificationResult.verifications.filter(
          (v) => v.fixed,
        ).length;
        totalFixedCount += fixedThisRound;

        // 找出未修复的问题，用于下一轮
        const unfixedVerifications = verificationResult.verifications.filter(
          (v) => !v.fixed,
        );

        if (unfixedVerifications.length === 0) {
          // 所有问题都已修复，退出循环
          this.logger.log(
            `[${missionId}] Chapter ${chapterNumber}: All issues fixed after ${fixAttempt} attempt(s) ✓`,
          );

          await this.eventEmitter.emitAgentWorking(input.projectId, {
            agentId: "consistency-checker",
            agentName: "一致性检查员",
            agentRole: "checker",
            status: "completed",
            taskDescription: `✓ 全部${currentIssues.length}个问题已修复`,
          });

          currentIssues = [];
          break;
        }

        // 构建下一轮需要修复的问题列表
        const remainingIssues = unfixedVerifications.map((v) => {
          const originalIssue = currentIssues[v.issueIndex - 1];
          return {
            ...originalIssue,
            description: `${originalIssue?.description || "未知问题"} [上轮未修复: ${v.evidence}]`,
          };
        });

        this.logger.log(
          `[${missionId}] Chapter ${chapterNumber}: ${fixedThisRound}/${currentIssues.length} fixed, ${remainingIssues.length} remaining`,
        );

        // 发送本轮验证结果事件
        await this.eventEmitter.emitConsistencyCheck(input.projectId, {
          chapterNumber,
          passed: false,
          issues: remainingIssues.map((issue) => ({
            type: issue.type || "unfixed",
            severity: "warning" as "error" | "warning" | "info",
            description: `[第${fixAttempt}轮后仍存在] ${issue.description}`,
            suggestion: issue.fix || "",
          })),
        });

        currentIssues = remainingIssues;
      }

      // 发送修复完成事件
      await this.eventEmitter.emitConsistencyFix(
        input.projectId,
        chapterNumber,
        checkResult.issues.length,
        "completed",
      );

      // 最终状态报告
      const finalStatus =
        currentIssues.length === 0
          ? `检查通过（${totalFixedCount > 0 ? `修复了${totalFixedCount}个问题` : "无问题"}）`
          : `已修复${totalFixedCount}个问题，${currentIssues.length}个无法自动修复`;

      // 检查员完成
      await this.eventEmitter.emitAgentWorking(input.projectId, {
        agentId: "consistency-checker",
        agentName: "一致性检查员",
        agentRole: "checker",
        status: "completed",
        taskDescription: finalStatus,
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

        // ★★★ 编辑润色时也需要叙事约束，防止润色时引入总结式结尾
        const editNarrativeConstraints =
          this.narrativeCraft.generateNarrativeCraftConstraints();
        const editSystemPrompt = `${this.editor.description}

${editNarrativeConstraints}`;

        const editResponse = await this.aiChatService.chat({
          messages: [
            { role: "system", content: editSystemPrompt },
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

      // ★★★ 第一章开篇质量强化：必须有强钩子 ★★★
      if (chapterNumber === 1) {
        // 提取开篇（跳过章节标题，取正文前300字）
        const contentWithoutTitle = chapterContent
          .replace(/^第[一二三四五六七八九十百千万]+章.*?\n+/, "")
          .trim();
        const opening = contentWithoutTitle.slice(0, 300);

        const openingQuality = this.openingHook.analyzeOpeningQuality(opening);
        this.logger.log(
          `[${missionId}] Chapter 1 opening quality: score=${openingQuality.score}, hasHook=${openingQuality.hasHook}, type=${openingQuality.hookType || "none"}`,
        );

        // 开篇评分低于70，需要重写开篇
        const OPENING_QUALITY_THRESHOLD = 70;
        if (openingQuality.score < OPENING_QUALITY_THRESHOLD) {
          this.logger.warn(
            `[${missionId}] Chapter 1 opening below threshold (${openingQuality.score}/${OPENING_QUALITY_THRESHOLD}), rewriting opening...`,
          );

          await this.eventEmitter.emitAgentWorking(input.projectId, {
            agentId: "opening-enhancer",
            agentName: "开篇强化师",
            agentRole: "writer",
            status: "working",
            taskDescription: `开篇钩子评分${openingQuality.score}分，正在重写以增强吸引力`,
          });

          // 获取第一章专属的强化开篇约束
          const firstChapterGuidance =
            this.openingHook.generateOpeningConstraints(1, undefined);

          const openingRewritePrompt = `请重写以下第一章的开篇部分（前3-5段），使其具有更强的吸引力。

【当前开篇】
${opening}

【问题诊断】
${openingQuality.issues.map((i) => `- ${i}`).join("\n")}

【强化要求】
${firstChapterGuidance}

【示例开篇】
- "斗之力，三段！" —— 冲突对话，直接揭示困境
- 那种冷，不是空调房里的凉意，而是一种湿冷，像无数条冰冷的小蛇顺着骨缝往里钻 —— 感官沉浸
- 他睁开眼，看到的是一把架在脖子上的刀 —— 极端困境

【输出要求】
1. 只输出重写后的开篇（前3-5段），不要输出完整章节
2. 第一句必须有钩子：冲突对话、危机情境、或强烈感官体验
3. 不要以世界观介绍或环境描写开头
4. 让读者立刻关心主角的处境`;

          try {
            const openingRewriteResponse = await this.aiChatService.chat({
              messages: [
                {
                  role: "system",
                  content: `你是专业的网文开篇优化专家。你的任务是将平淡的开篇重写为有强烈吸引力的版本。

参考经典开篇技巧：
1. 冲突对话式：以揭示主角困境的对话开始（如《斗破苍穹》）
2. 感官沉浸式：用强烈的触觉/嗅觉/听觉体验开场
3. 极端困境式：开篇即是生死危机

绝对禁止：
- 用"在一个XX的世界里"开头
- 用"故事要从XX说起"开头
- 用大段世界观介绍开头
- 用"突然"、"忽然"等词汇`,
                },
                { role: "user", content: openingRewritePrompt },
              ],
              model: writerModel,
              temperature: 0.85,
              maxTokens: 2000,
            });

            if (
              openingRewriteResponse.content &&
              openingRewriteResponse.content.length > 100
            ) {
              // 替换原开篇
              const newOpening = openingRewriteResponse.content.trim();
              // 找到原开篇结束位置（大约300字后的句号）
              const openingEndMatch = contentWithoutTitle
                .slice(0, 500)
                .match(/[。！？\n]{1,2}/g);
              let openingEndIndex = 300;
              if (openingEndMatch && openingEndMatch.length >= 3) {
                // 找第3个句子结束的位置
                let count = 0;
                for (
                  let i = 0;
                  i < contentWithoutTitle.length && count < 3;
                  i++
                ) {
                  if (
                    contentWithoutTitle[i] === "。" ||
                    contentWithoutTitle[i] === "！" ||
                    contentWithoutTitle[i] === "？"
                  ) {
                    count++;
                    if (count === 3) {
                      openingEndIndex = i + 1;
                      break;
                    }
                  }
                }
              }

              const restOfContent = contentWithoutTitle.slice(openingEndIndex);
              chapterContent = `第${this.numberToChinese(chapterNumber)}章 ${chapterInfo.title}\n\n${newOpening}\n\n${restOfContent}`;

              // 验证重写后的开篇质量
              const newOpeningQuality =
                this.openingHook.analyzeOpeningQuality(newOpening);
              this.logger.log(
                `[${missionId}] Chapter 1 opening rewritten: ${openingQuality.score} → ${newOpeningQuality.score}`,
              );

              await this.eventEmitter.emitAgentWorking(input.projectId, {
                agentId: "opening-enhancer",
                agentName: "开篇强化师",
                agentRole: "writer",
                status: "completed",
                taskDescription: `开篇强化完成：${openingQuality.score}→${newOpeningQuality.score}分`,
              });
            }
          } catch (openingError) {
            this.logger.warn(
              `[${missionId}] Opening rewrite failed: ${(openingError as Error).message}`,
            );
          }
        } else {
          this.logger.log(
            `[${missionId}] Chapter 1 opening quality passed (${openingQuality.score})`,
          );
        }
      }

      // ★★★ 质量门禁：强制执行表达冷却，违规过多则重写 ★★★
      const chapterId = `${input.projectId}-chapter-${chapterNumber}`;
      let rewriteAttempts = 0;
      // ★ 最大重写次数由 QualityGate 配置控制，这里只做备用保护
      const safetyMaxRewriteAttempts = 5;

      // ★ 用 try-catch 包裹质量检查，防止异常导致整个任务失败
      try {
        while (rewriteAttempts < safetyMaxRewriteAttempts) {
          const qualityResult = await this.qualityGate.checkQualityGate(
            input.projectId,
            chapterId,
            chapterNumber,
            chapterContent,
            rewriteAttempts,
          );

          if (qualityResult.passed) {
            // 质量达标，跳出循环
            break;
          }

          // 质量不达标，需要重写
          rewriteAttempts++;
          this.logger.warn(
            `[${missionId}] Chapter ${chapterNumber} failed quality gate (attempt ${rewriteAttempts}): diversity=${qualityResult.scores.diversityScore.toFixed(2)}`,
          );

          if (!qualityResult.requiresRewrite) {
            // 已达到最大重写次数，强制通过
            break;
          }

          // ★★★ 优先尝试结尾自动重写（比完整重写更高效）
          const endingIssues = qualityResult.issues.filter(
            (issue) =>
              issue.type === "style_issue" &&
              issue.description.includes("[ending]"),
          );

          if (endingIssues.length > 0) {
            this.logger.log(
              `[${missionId}] Chapter ${chapterNumber} has ending issues, attempting targeted rewrite`,
            );

            // 使用 NarrativeCraftService 进行结尾重写
            const report = this.narrativeCraft.analyzeContent(chapterContent);
            const rewrittenContent = await this.narrativeCraft.rewriteEnding(
              chapterContent,
              report.issues,
            );

            if (rewrittenContent !== chapterContent) {
              chapterContent = rewrittenContent;
              this.logger.log(
                `[${missionId}] Chapter ${chapterNumber} ending rewritten successfully`,
              );
              // 重新进入循环检查，不增加重写计数（因为这是轻量修复）
              continue;
            }
          }

          // 构建重写提示，包含需要避免的表达
          const rewriteHints =
            qualityResult.rewriteSuggestions?.join("\n") || "";

          // ★ 直接分析当前内容获取违规表达（不依赖 issues，issues 只有章内重复）
          const currentAnalysis =
            await this.expressionMemory.analyzeExpressionsOnly(
              input.projectId,
              chapterContent,
            );
          const violatedExprs = currentAnalysis.violatedExpressions
            .map((v) => `"${v.expression}"(已用${v.useCount}次)`)
            .join("、");

          // 同时获取章内高频重复
          const repetitionIssues = qualityResult.issues
            .filter((issue) => issue.type === "repetition")
            .map((issue) => issue.description)
            .join("、");

          // 合并所有需要避免的表达
          const allAvoidExprs = [violatedExprs, repetitionIssues]
            .filter(Boolean)
            .join("；");

          const rewritePrompt = `请重写以下章节内容，**必须避免**使用这些重复表达：${allAvoidExprs || "无具体列表，请增加表达多样性"}

${rewriteHints ? `改进建议：\n${rewriteHints}\n` : ""}
原文内容：
${chapterContent}

要求：
1. 保持故事情节不变
2. 用完全不同的表达方式重写
3. 避免任何形式的重复表达
4. 保持文字流畅自然`;

          try {
            // ★★★ 重写时也必须包含叙事工艺约束（修复：之前遗漏了）
            const narrativeConstraints =
              this.narrativeCraft.generateNarrativeCraftConstraints();
            const rewriteSystemPrompt = `你是专业的小说编辑，擅长用丰富多样的表达方式重写内容。严禁使用重复的表达。

${narrativeConstraints}`;

            const rewriteResponse = await this.aiChatService.chat({
              messages: [
                {
                  role: "system",
                  content: rewriteSystemPrompt,
                },
                { role: "user", content: rewritePrompt },
              ],
              model: writerModel,
              temperature: 0.9, // 高温度增加多样性
              maxTokens: 6000,
            });

            if (
              rewriteResponse.content &&
              rewriteResponse.content.length > chapterContent.length * 0.7
            ) {
              chapterContent = rewriteResponse.content;
              this.logger.log(
                `[${missionId}] Chapter ${chapterNumber} rewritten (attempt ${rewriteAttempts})`,
              );
            }
          } catch (e) {
            this.logger.warn(
              `[${missionId}] Chapter ${chapterNumber} rewrite failed: ${(e as Error).message}`,
            );
            break;
          }
        }
      } catch (qualityError) {
        // 质量检查失败不应阻止章节生成，记录警告并继续
        this.logger.warn(
          `[${missionId}] Chapter ${chapterNumber} quality gate error: ${(qualityError as Error).message}`,
        );
      }

      allChapters.push(chapterContent);

      // ★ 分析并记录本章使用的表达（更新冷却状态）
      try {
        const chapterId = `${input.projectId}-chapter-${chapterNumber}`;
        const analysisResult =
          await this.expressionMemory.analyzeAndRecordExpressions(
            input.projectId,
            chapterId,
            chapterNumber,
            chapterContent,
          );
        if (analysisResult.violatedExpressions.length > 0) {
          this.logger.warn(
            `[${missionId}] Chapter ${chapterNumber} used ${analysisResult.violatedExpressions.length} cooling expressions`,
          );
        }
      } catch (e) {
        this.logger.warn(
          `[${missionId}] Expression analysis failed: ${(e as Error).message}`,
        );
      }

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

      // 生成前文摘要（使用 AI 增强版本）
      previousChapterSummary = await this.generateChapterSummaryWithAI(
        chapterContent,
        chapterNumber,
        chapterInfo.title,
        writerModel,
      );

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
    bookTitle: string;
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
      bookTitle?: string;
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
      // 1. 先移除 markdown 代码块包装 (```json ... ``` 或 ``` ... ```)
      let cleanContent = content
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();

      // 2. 尝试找到 JSON 对象（从第一个 { 到最后一个 }）
      const firstBrace = cleanContent.indexOf("{");
      const lastBrace = cleanContent.lastIndexOf("}");

      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const jsonStr = cleanContent.substring(firstBrace, lastBrace + 1);
        parsed = JSON.parse(jsonStr);
        this.logger.log(
          `[parseOutlineJSON] Successfully parsed JSON, bookTitle: ${parsed?.bookTitle || "(none)"}, chapters: ${parsed?.chapters?.length || 0}`,
        );
      } else {
        this.logger.warn(
          `[parseOutlineJSON] No valid JSON structure found in response (length: ${content.length})`,
        );
        // ★ 也打印内容预览帮助诊断
        this.logger.warn(
          `[parseOutlineJSON] Content preview (no JSON): ${content.slice(0, 500)}`,
        );
      }
    } catch (e) {
      this.logger.warn(
        `[parseOutlineJSON] Failed to parse outline JSON: ${(e as Error).message}`,
      );
      // 打印前500字符帮助诊断
      this.logger.warn(
        `[parseOutlineJSON] Content preview (parse error): ${content.slice(0, 500)}`,
      );
    }

    // 生成默认卷结构
    const chaptersPerVolume = Math.ceil(totalChapters / totalVolumes);
    const defaultVolumes = Array.from({ length: totalVolumes }, (_, i) => ({
      title: `第${this.numberToChinese(i + 1)}卷`,
      conflict: "待定",
      plot: "待定",
      emotion: "待定",
    }));

    // 生成默认章节结构（使用空标题，让前端显示"第X章"）
    const defaultChapters = Array.from({ length: totalChapters }, (_, i) => ({
      volumeIndex: Math.floor(i / chaptersPerVolume),
      title: "", // 空标题，前端会只显示"第X章"
      plot: "", // 空大纲
      keyPoint: "",
    }));

    // 如果没有解析到任何内容，返回默认结构
    if (!parsed) {
      return {
        bookTitle: "",
        core: { summary: "待定", genre: "待定", theme: "待定" },
        volumes: defaultVolumes,
        chapters: defaultChapters,
      };
    }

    // 提取书名（清理书名号）
    let bookTitle = parsed.bookTitle || "";
    bookTitle = bookTitle
      .replace(/^[《【「『]/, "")
      .replace(/[》】」』]$/, "")
      .trim();

    // 合并解析结果和默认结构
    const core = {
      summary: parsed.core?.summary || "待定",
      genre: parsed.core?.genre || "待定",
      theme: parsed.core?.theme || "待定",
    };

    // 日志：记录核心字段解析结果
    this.logger.log(
      `[parseOutlineJSON] Core parsed - theme: "${core.theme}", genre: "${core.genre}", summary: "${core.summary?.slice(0, 50)}..."`,
    );

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
    const parsedChapters = (parsed.chapters || []).map((c, i) => {
      // 清理标题 - 如果标题只是"第X章"格式，视为无效
      let title = c.title || "";
      const originalTitle = title; // 保存原始标题用于调试

      if (title.match(/^第[一二三四五六七八九十百千\d]+[章回]$/)) {
        title = ""; // 纯章节号视为空标题
      }
      // 从标题中提取实际内容（如"第一章：暗流涌动" -> "暗流涌动"）
      title = title
        .replace(/^第[一二三四五六七八九十百千\d]+[章回][：:\s]*/i, "")
        .trim();

      // 调试：如果原始标题非空但清理后为空，记录日志
      if (originalTitle && !title && i < 5) {
        this.logger.warn(
          `[parseOutlineJSON] Chapter ${i + 1} title cleaned to empty: "${originalTitle}"`,
        );
      }

      return {
        volumeIndex: c.volumeIndex ?? Math.floor(i / chaptersPerVolume),
        title: title, // 可能为空，前端会只显示"第X章"
        plot: c.plot || "",
        keyPoint: c.keyPoint || "",
      };
    });

    // 检查是否所有章节标题都为空（可能是解析问题）
    const titledChapters = parsedChapters.filter((c) => c.title);
    if (parsedChapters.length > 0 && titledChapters.length === 0) {
      this.logger.warn(
        `[parseOutlineJSON] WARNING: All ${parsedChapters.length} chapter titles are empty! Raw chapters: ${JSON.stringify(parsed.chapters?.slice(0, 3))}`,
      );
    } else {
      this.logger.log(
        `[parseOutlineJSON] ${titledChapters.length}/${parsedChapters.length} chapters have titles`,
      );
    }

    // ★ 关键：确保章节数量至少达到 totalChapters
    let chapters = parsedChapters;
    if (parsedChapters.length < totalChapters) {
      this.logger.warn(
        `Parsed chapters (${parsedChapters.length}) < expected (${totalChapters}), supplementing...`,
      );
      // 补充缺少的章节（使用空值，让前端只显示"第X章"）
      const supplementChapters = defaultChapters
        .slice(parsedChapters.length)
        .map((_, i) => {
          const actualIndex = parsedChapters.length + i;
          return {
            volumeIndex: Math.floor(actualIndex / chaptersPerVolume),
            title: "", // 空标题
            plot: "", // 空大纲
            keyPoint: "",
          };
        });
      chapters = [...parsedChapters, ...supplementChapters];
    }

    this.logger.log(
      `Outline parsed: ${chapters.length} chapters (expected: ${totalChapters}), bookTitle: ${bookTitle || "(none)"}`,
    );

    return { bookTitle, core, volumes, chapters };
  }

  /**
   * 解析世界观设定
   */
  private parseWorldSettings(content: string): Record<string, unknown> {
    try {
      // 1. 先移除 markdown 代码块包装
      let cleanContent = content
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();

      // 2. 尝试找到 JSON 对象
      const firstBrace = cleanContent.indexOf("{");
      const lastBrace = cleanContent.lastIndexOf("}");

      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const jsonStr = cleanContent.substring(firstBrace, lastBrace + 1);
        const parsed = JSON.parse(jsonStr);
        this.logger.log(
          `[parseWorldSettings] Successfully parsed, characters: ${(parsed.characters as unknown[])?.length || 0}`,
        );
        return parsed;
      }
      this.logger.warn(
        `[parseWorldSettings] No valid JSON structure found (length: ${content.length})`,
      );
    } catch (e) {
      this.logger.warn(
        `[parseWorldSettings] Failed to parse: ${(e as Error).message}`,
      );
      this.logger.warn(
        `[parseWorldSettings] Content preview: ${content.slice(0, 300)}`,
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
      // 1. 清理 markdown 代码块
      let cleaned = content.trim();
      if (cleaned.startsWith("```json")) {
        cleaned = cleaned.slice(7);
      } else if (cleaned.startsWith("```")) {
        cleaned = cleaned.slice(3);
      }
      if (cleaned.endsWith("```")) {
        cleaned = cleaned.slice(0, -3);
      }
      cleaned = cleaned.trim();

      // 2. 尝试直接解析（如果整体是有效 JSON）
      try {
        const directParsed = JSON.parse(cleaned);
        if (typeof directParsed === "object" && directParsed !== null) {
          return this.normalizeConsistencyResult(directParsed);
        }
      } catch {
        // 继续尝试其他方法
      }

      // 3. 提取第一个完整的 JSON 对象（使用括号匹配）
      const jsonStr = this.extractFirstJsonObject(cleaned);
      if (jsonStr) {
        const parsed = JSON.parse(jsonStr);
        return this.normalizeConsistencyResult(parsed);
      }
    } catch (e) {
      this.logger.warn(
        `Failed to parse consistency check result: ${(e as Error).message}`,
      );
      // 输出内容预览以便调试
      this.logger.debug(`Content preview: ${content.slice(0, 500)}...`);
    }
    return { passed: true, score: 100, issues: [] };
  }

  /**
   * 提取第一个完整的 JSON 对象
   */
  private extractFirstJsonObject(content: string): string | null {
    const firstBrace = content.indexOf("{");
    if (firstBrace === -1) return null;

    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = firstBrace; i < content.length; i++) {
      const char = content[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === "\\") {
        escape = true;
        continue;
      }

      if (char === '"' && !escape) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === "{") {
          depth++;
        } else if (char === "}") {
          depth--;
          if (depth === 0) {
            return content.substring(firstBrace, i + 1);
          }
        }
      }
    }

    return null;
  }

  /**
   * 标准化一致性检查结果
   */
  private normalizeConsistencyResult(parsed: Record<string, unknown>): {
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
    const issues = Array.isArray(parsed.issues) ? parsed.issues : [];
    return {
      passed: typeof parsed.passed === "boolean" ? parsed.passed : true,
      score: typeof parsed.score === "number" ? parsed.score : 100,
      issues: issues.map((issue: Record<string, unknown>) => ({
        type: String(issue.type || "unknown"),
        severity: String(issue.severity || "warning"),
        description: String(issue.description || ""),
        location: String(issue.location || ""),
        fix: String(issue.fix || ""),
      })),
    };
  }

  /**
   * 解析修复验证结果
   */
  private parseVerificationResult(content: string): {
    allFixed: boolean;
    verifications: Array<{
      issueIndex: number;
      fixed: boolean;
      evidence: string;
    }>;
  } {
    try {
      // 清理 markdown 代码块
      let cleaned = content.trim();
      if (cleaned.startsWith("```json")) {
        cleaned = cleaned.slice(7);
      } else if (cleaned.startsWith("```")) {
        cleaned = cleaned.slice(3);
      }
      if (cleaned.endsWith("```")) {
        cleaned = cleaned.slice(0, -3);
      }
      cleaned = cleaned.trim();

      // 尝试直接解析
      try {
        const directParsed = JSON.parse(cleaned);
        if (typeof directParsed === "object" && directParsed !== null) {
          return this.normalizeVerificationResult(directParsed);
        }
      } catch {
        // 继续尝试其他方法
      }

      // 提取第一个完整的 JSON 对象
      const jsonStr = this.extractFirstJsonObject(cleaned);
      if (jsonStr) {
        const parsed = JSON.parse(jsonStr);
        return this.normalizeVerificationResult(parsed);
      }
    } catch (e) {
      this.logger.warn(
        `Failed to parse verification result: ${(e as Error).message}`,
      );
    }
    return { allFixed: true, verifications: [] };
  }

  /**
   * 标准化验证结果
   */
  private normalizeVerificationResult(parsed: Record<string, unknown>): {
    allFixed: boolean;
    verifications: Array<{
      issueIndex: number;
      fixed: boolean;
      evidence: string;
    }>;
  } {
    const verifications = Array.isArray(parsed.verifications)
      ? parsed.verifications
      : [];
    return {
      allFixed: typeof parsed.allFixed === "boolean" ? parsed.allFixed : true,
      verifications: verifications.map((v: Record<string, unknown>) => ({
        issueIndex: typeof v.issueIndex === "number" ? v.issueIndex : 0,
        fixed: typeof v.fixed === "boolean" ? v.fixed : true,
        evidence: String(v.evidence || ""),
      })),
    };
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
    styleId?: string,
    avoidancePrompt?: string,
    templateStylePrompt?: string, // 来自数据库模板的风格提示词（优先级高于 styleId）
  ): string {
    const characters =
      (worldSettings.characters as Array<{
        name: string;
        role?: string;
        personality?: string[];
        appearance?: string;
        background?: string;
        motivation?: string;
        arc?: string;
        speechPattern?: string;
      }>) || [];

    // 生成详细的角色约束信息
    const characterInfo = characters
      .slice(0, 5)
      .map((c) => {
        const parts = [`**${c.name}**`];
        if (c.role)
          parts.push(
            `[${c.role === "protagonist" ? "主角" : c.role === "antagonist" ? "反派" : "配角"}]`,
          );
        if (c.personality?.length)
          parts.push(`性格：${c.personality.join("、")}`);
        if (c.motivation) parts.push(`动机：${c.motivation}`);
        if (c.speechPattern) parts.push(`说话风格：${c.speechPattern}`);
        return parts.join(" | ");
      })
      .join("\n");

    // 生成角色一致性约束
    const characterConstraints =
      characters.length > 0
        ? `\n【角色一致性约束 - 必须严格遵守】
${characters
  .slice(0, 5)
  .map((c) => {
    const constraints: string[] = [];
    if (c.personality?.length) {
      constraints.push(
        `- ${c.name} 必须表现出 ${c.personality.slice(0, 3).join("、")} 的性格特点`,
      );
    }
    if (c.role === "protagonist") {
      constraints.push(`- ${c.name} 作为主角，需要有成长和变化`);
    }
    if (c.motivation) {
      constraints.push(`- ${c.name} 的行动应符合其动机：${c.motivation}`);
    }
    return constraints.join("\n");
  })
  .filter(Boolean)
  .join("\n")}`
        : "";

    // 获取写作风格指南（优先使用模板风格，否则使用预设风格）
    let stylePrompt: string;
    if (templateStylePrompt) {
      // 使用数据库模板生成的风格提示词
      stylePrompt = templateStylePrompt;
    } else {
      // 根据故事类型获取预设风格
      const effectiveStyleId =
        styleId ||
        recommendStyleByGenre(outline.core.genre || "")[0] ||
        "modern_realistic";
      stylePrompt = generateStylePrompt(effectiveStyleId);
    }

    return `【创作任务】第${this.numberToChinese(chapterNumber)}章 ${chapterInfo.title}

【故事主题】${userPrompt}
【故事类型】${outline.core.genre || "通用"}
【主题思想】${outline.core.theme || "待定"}
${stylePrompt}
【本章情节要点】
${chapterInfo.plot}
${chapterInfo.keyPoint ? `关键转折：${chapterInfo.keyPoint}` : ""}

【主要角色】
${characterInfo || "待定"}
${characterConstraints}
${previousSummary ? `【前文摘要】\n${previousSummary}\n` : "【开篇说明】这是故事的开始，需要引人入胜，建立故事背景和主要人物。\n"}
${keeperContext?.contextPrompt ? `【守护者提醒】\n${keeperContext.contextPrompt}\n` : ""}${keeperContext?.warnings?.length ? `\n⚠️ 注意事项：\n${keeperContext.warnings.map((w: string) => `- ${w}`).join("\n")}\n` : ""}
${avoidancePrompt ? `【表达约束 - 禁止使用以下表达】\n${avoidancePrompt}\n` : ""}
【创作要求 - 必须遵守】
1. ⚠️ 字数要求：本章必须达到 1500 字以上，建议 2000-3000 字
2. 📖 语言质量：语言流畅自然，富有文学性，句式多样化
3. 💬 对话要求：人物对话生动，符合角色性格和身份，避免千人一面
4. 🎨 场景描写：细腻有画面感，运用多种感官描写（视觉、听觉、嗅觉等）
5. ⚡ 节奏把控：情节紧凑，避免冗余的心理描写和重复的场景
6. 🎭 叙事技巧：善用伏笔、悬念、反转等技巧增加可读性
7. 🔄 避免重复：不要与前文使用相同的开场方式、对话模式或场景设置
8. 🚫 表达多样性：严禁使用上述【表达约束】中列出的冷却期表达

请直接输出章节内容，以"第${this.numberToChinese(chapterNumber)}章 ${chapterInfo.title}"开头：`;
  }

  /**
   * 获取项目的模板风格提示词
   *
   * 如果项目配置了风格模板，返回合并后的风格提示词；
   * 否则返回 undefined，使用预设风格
   */
  async getTemplateStylePrompt(projectId: string): Promise<string | undefined> {
    try {
      // 检查项目是否配置了风格模板
      const project = await this.prisma.writingProject.findUnique({
        where: { id: projectId },
        select: { styleTemplateId: true },
      });

      if (!project?.styleTemplateId) {
        return undefined;
      }

      // 使用模板服务获取合并后的风格配置
      const mergedConfig =
        await this.styleTemplateService.getMergedStyleConfig(projectId);

      if (!mergedConfig) {
        return undefined;
      }

      return mergedConfig.fullPrompt;
    } catch (e) {
      this.logger.warn(
        `[StyleTemplate] Failed to get template prompt for project ${projectId}: ${(e as Error).message}`,
      );
      return undefined;
    }
  }

  /**
   * 生成章节摘要（简单版本 - 快速降级）
   */
  private generateChapterSummarySimple(content: string): string {
    const maxLength = 800;
    if (content.length <= maxLength) {
      return content;
    }
    // 取前 400 字和后 400 字
    const start = content.slice(0, 400);
    const end = content.slice(-400);
    return `${start}...\n...\n${end}`;
  }

  /**
   * 生成章节摘要（AI 增强版本）
   *
   * 使用 AI 生成结构化摘要，保留关键信息：
   * - 主要事件和情节转折
   * - 角色状态变化
   * - 重要对话和决定
   * - 场景和时间线信息
   */
  private async generateChapterSummaryWithAI(
    content: string,
    chapterNumber: number,
    chapterTitle: string,
    modelId: string,
  ): Promise<string> {
    // 如果内容较短，直接返回
    if (content.length <= 1000) {
      return content;
    }

    try {
      const summaryPrompt = `请为以下章节内容生成一个结构化摘要，用于后续章节创作的上下文参考。

【章节】第${chapterNumber}章 ${chapterTitle}

【内容】
${content.slice(0, 6000)}${content.length > 6000 ? "...(内容截断)" : ""}

【摘要要求】
请生成 400-600 字的摘要，包含：
1. **情节概要**：本章发生了什么（2-3 句话）
2. **关键事件**：重要转折点、冲突、决定
3. **角色状态**：主要角色的情绪、关系变化
4. **悬念/伏笔**：需要后续呼应的内容
5. **场景信息**：主要场景和时间

直接输出摘要内容，不要添加额外格式标记。`;

      const response = await this.aiChatService.chat({
        messages: [
          {
            role: "system",
            content:
              "你是专业的小说编辑，擅长提取和总结关键信息。请生成简洁但信息完整的摘要。",
          },
          { role: "user", content: summaryPrompt },
        ],
        model: modelId,
        temperature: 0.3,
        maxTokens: 1000,
      });

      if (response.content && response.content.length > 100) {
        return response.content;
      }
    } catch (e) {
      this.logger.warn(
        `AI summary generation failed for chapter ${chapterNumber}: ${(e as Error).message}`,
      );
    }

    // 降级到简单摘要
    return this.generateChapterSummarySimple(content);
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
1. 新角色（所有有名有姓的角色，包括配角、龙套，只要有名字就要记录）
2. 角色状态变化（受伤、死亡、关系变化、获得新能力等）
3. 角色关系（角色之间的关系，如"XX是XX的丫鬟"、"XX与XX是敌人"等）
4. 时间线事件（重要事件及其时间）
5. 新的地点/组织/物品等设定

【重要】新角色必须详细记录：
- name: 角色名字
- role: 角色定位（PROTAGONIST主角/ANTAGONIST反派/SUPPORTING配角/MINOR龙套）
- description: 角色描述（外貌、身份、职业等）
- firstAppearance: 首次出现章节
- relationships: 与其他角色的关系

输出 JSON：
{
  "newCharacters": [
    {
      "name": "角色名",
      "role": "SUPPORTING",
      "description": "角色的身份和特征描述",
      "firstAppearance": ${chapterNumber},
      "relationships": [{"target": "另一角色名", "relation": "关系描述"}]
    }
  ],
  "characterUpdates": [
    {"name": "角色名", "change": "发生了什么变化"}
  ],
  "newRelationships": [
    {"character1": "角色A", "character2": "角色B", "relation": "关系描述"}
  ],
  "timelineEvents": ["第X天：发生了某事件"],
  "newSettings": ["新地点/组织/物品等"]
}

务必提取所有出现的有名角色，即使只是一笔带过的角色也要记录！`;

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

      // 【调试日志】记录LLM原始响应，方便排查问题
      this.logger.log(
        `[${missionId}] Bible Keeper LLM response (first 500 chars): ${content.slice(0, 500)}`,
      );

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        // 清理 JSON 字符串中的常见问题
        let jsonStr = jsonMatch[0]
          .replace(/,\s*}/g, "}") // 移除对象末尾多余的逗号
          .replace(/,\s*]/g, "]") // 移除数组末尾多余的逗号
          .replace(/[\x00-\x1F\x7F]/g, " ") // 移除控制字符
          .replace(/\n\s*\.\.\./g, "") // 移除省略号
          .replace(/"\s*\n\s*"/g, '", "'); // 修复换行导致的字符串断开

        interface BibleUpdateParsed {
          newCharacters?: Array<{
            name: string;
            role?: string;
            description?: string;
            firstAppearance?: number;
            relationships?: Array<{ target: string; relation: string }>;
          }>;
          characterUpdates?: Array<{ name: string; change: string } | string>;
          timelineEvents?: string[];
          newSettings?: string[];
          newRelationships?: Array<{
            character1: string;
            character2: string;
            relation: string;
          }>;
        }

        let parsed: BibleUpdateParsed;
        try {
          parsed = JSON.parse(jsonStr) as BibleUpdateParsed;

          // 【关键日志】记录解析成功的数据量
          this.logger.log(
            `[${missionId}] Bible update parsed: ` +
              `newCharacters=${parsed.newCharacters?.length || 0}, ` +
              `characterUpdates=${parsed.characterUpdates?.length || 0}, ` +
              `timelineEvents=${parsed.timelineEvents?.length || 0}, ` +
              `newSettings=${parsed.newSettings?.length || 0}, ` +
              `newRelationships=${parsed.newRelationships?.length || 0}`,
          );
        } catch (parseError) {
          // 如果解析失败，记录详细错误信息
          this.logger.warn(
            `[${missionId}] JSON parse failed (attempt 1): ${(parseError as Error).message}`,
          );
          this.logger.warn(
            `[${missionId}] Failed JSON string (first 300 chars): ${jsonStr.slice(0, 300)}`,
          );

          // 【重试机制】尝试让 LLM 修复 JSON
          try {
            this.logger.log(`[${missionId}] Attempting JSON repair via LLM...`);
            const repairResponse = await this.aiChatService.chat({
              messages: [
                {
                  role: "system",
                  content:
                    "你是 JSON 修复专家。修复以下 JSON 使其可被解析，只输出有效的 JSON，不要添加任何解释。",
                },
                {
                  role: "user",
                  content: `修复以下 JSON（保持原有数据结构）：\n\n${jsonStr.slice(0, 2000)}`,
                },
              ],
              model: keeperModel,
              temperature: 0.1,
              maxTokens: 1500,
            });

            const repairedJson =
              repairResponse.content?.match(/\{[\s\S]*\}/)?.[0];
            if (repairedJson) {
              parsed = JSON.parse(repairedJson) as BibleUpdateParsed;
              this.logger.log(
                `[${missionId}] JSON repair successful: ` +
                  `newCharacters=${parsed.newCharacters?.length || 0}`,
              );
            } else {
              throw new Error("Repair response did not contain valid JSON");
            }
          } catch (repairError) {
            // 重试也失败，使用部分提取作为最后手段
            this.logger.warn(
              `[${missionId}] JSON repair failed: ${(repairError as Error).message}`,
            );

            // 【改进】尝试从文本中提取角色名（即使JSON解析失败）
            const characterNameMatches = content.match(
              /"name"\s*:\s*"([^"]+)"/g,
            );
            const extractedNames = characterNameMatches
              ? characterNameMatches
                  .map((m) => {
                    const nameMatch = m.match(/"name"\s*:\s*"([^"]+)"/);
                    return nameMatch ? nameMatch[1] : null;
                  })
                  .filter((n): n is string => n !== null)
              : [];

            if (extractedNames.length > 0) {
              this.logger.log(
                `[${missionId}] Partial extraction found ${extractedNames.length} character names: ${extractedNames.join(", ")}`,
              );
            }

            // 返回部分提取结果
            parsed = {
              newCharacters:
                extractedNames.length > 0
                  ? extractedNames.map((name) => ({
                      name,
                      role: "MINOR",
                      description: `在第${chapterNumber}章出现`,
                      firstAppearance: chapterNumber,
                    }))
                  : [],
              characterUpdates: [],
              timelineEvents: [],
              newSettings: [],
              newRelationships: [],
            };
          }
        }

        // 将 characterUpdates 统一转换为 string[]
        const characterUpdatesStr = (parsed.characterUpdates || []).map(
          (update) =>
            typeof update === "string"
              ? update
              : `${update.name}: ${update.change}`,
        );

        const updates = {
          newFacts: parsed.newSettings || [],
          characterUpdates: characterUpdatesStr,
          timelineEvents: parsed.timelineEvents || [],
          newCharacters: parsed.newCharacters || [],
          newRelationships: parsed.newRelationships || [],
        };

        // 获取 StoryBible
        const bible = await this.prisma.storyBible.findFirst({
          where: { projectId },
        });

        if (bible) {
          // ★★★ 1. 自动创建新角色到 WritingCharacter 表 ★★★
          if (updates.newCharacters.length > 0) {
            for (const newChar of updates.newCharacters) {
              try {
                // 检查角色是否已存在
                const existingChar =
                  await this.prisma.writingCharacter.findFirst({
                    where: {
                      bibleId: bible.id,
                      name: newChar.name,
                    },
                  });

                if (!existingChar) {
                  // 创建新角色
                  // 将 description 合并到 background 中（schema 没有 description 字段）
                  const backgroundText = newChar.description
                    ? `${newChar.description}\n首次出现：第${newChar.firstAppearance || chapterNumber}章`
                    : `首次出现：第${newChar.firstAppearance || chapterNumber}章`;

                  // 将字符串 role 映射到 CharacterRole 枚举
                  const roleMap: Record<
                    string,
                    "PROTAGONIST" | "ANTAGONIST" | "SUPPORTING" | "MINOR"
                  > = {
                    PROTAGONIST: "PROTAGONIST",
                    ANTAGONIST: "ANTAGONIST",
                    SUPPORTING: "SUPPORTING",
                    MINOR: "MINOR",
                  };
                  const mappedRole =
                    roleMap[newChar.role?.toUpperCase() || ""] || "MINOR";

                  await this.prisma.writingCharacter.create({
                    data: {
                      bibleId: bible.id,
                      name: newChar.name,
                      role: mappedRole,
                      background: backgroundText,
                      personality: newChar.relationships
                        ? {
                            relationships: newChar.relationships,
                            firstAppearance: chapterNumber,
                          }
                        : { firstAppearance: chapterNumber },
                      currentState: {
                        status: "active",
                        lastSeenChapter: chapterNumber,
                      },
                    },
                  });
                  this.logger.log(
                    `[${missionId}] Created new character: ${newChar.name} (${newChar.role})`,
                  );
                } else {
                  // 更新现有角色的 lastSeenChapter
                  await this.prisma.writingCharacter.update({
                    where: { id: existingChar.id },
                    data: {
                      currentState: {
                        ...((existingChar.currentState as object) || {}),
                        lastSeenChapter: chapterNumber,
                      },
                    },
                  });
                }
              } catch (charError) {
                this.logger.warn(
                  `[${missionId}] Failed to create character ${newChar.name}: ${(charError as Error).message}`,
                );
              }
            }
          }

          // ★★★ 2. 更新角色状态变化 ★★★
          if (updates.characterUpdates.length > 0) {
            for (const update of updates.characterUpdates) {
              try {
                // update 已经是 string 格式 (如 "角色名: 变化描述")
                const charName = update.split(/[：:]/)[0].trim();
                const change = update;

                const existingChar =
                  await this.prisma.writingCharacter.findFirst({
                    where: { bibleId: bible.id, name: { contains: charName } },
                  });

                if (existingChar) {
                  const currentState =
                    (existingChar.currentState as Record<string, unknown>) ||
                    {};
                  const stateHistory = (currentState.history as string[]) || [];
                  stateHistory.push(`第${chapterNumber}章: ${change}`);

                  await this.prisma.writingCharacter.update({
                    where: { id: existingChar.id },
                    data: {
                      currentState: {
                        ...currentState,
                        lastSeenChapter: chapterNumber,
                        history: stateHistory.slice(-10), // 保留最近10条变化
                      },
                    },
                  });
                }
              } catch (updateError) {
                this.logger.warn(
                  `[${missionId}] Failed to update character: ${(updateError as Error).message}`,
                );
              }
            }
          }

          // ★★★ 3. 保存其他设定更新 ★★★
          const hasUpdates =
            updates.newFacts.length > 0 ||
            updates.timelineEvents.length > 0 ||
            updates.newRelationships.length > 0;

          if (hasUpdates) {
            try {
              // WorldSetting schema: name (标题), description (内容)
              await this.prisma.worldSetting.create({
                data: {
                  bibleId: bible.id,
                  category: `第${chapterNumber}章`,
                  name: `第${chapterNumber}章设定更新`,
                  description: [
                    ...updates.newFacts.map((f: string) => `[设定] ${f}`),
                    ...updates.timelineEvents.map((e: string) => `[事件] ${e}`),
                    ...updates.newRelationships.map(
                      (r: {
                        character1: string;
                        character2: string;
                        relation: string;
                      }) =>
                        `[关系] ${r.character1} ↔ ${r.character2}: ${r.relation}`,
                    ),
                  ].join("\n"),
                },
              });
            } catch (dbError) {
              this.logger.warn(
                `[${missionId}] Failed to save settings: ${(dbError as Error).message}`,
              );
            }
          }

          this.logger.log(
            `[${missionId}] Keeper updated bible after chapter ${chapterNumber}: ` +
              `${updates.newCharacters.length} new characters, ` +
              `${updates.characterUpdates.length} updates, ` +
              `${updates.timelineEvents.length} events`,
          );
        }

        // 发送更新完成事件
        await this.eventEmitter.emitKeeperBibleUpdated(
          projectId,
          chapterNumber,
          {
            newFacts: updates.newFacts,
            characterUpdates: updates.characterUpdates,
            timelineEvents: updates.timelineEvents,
          },
        );
        await this.eventEmitter.emitAgentWorking(projectId, {
          agentId: "bible-keeper",
          agentName: "设定守护者",
          agentRole: "keeper",
          status: "completed",
          taskDescription:
            updates.newCharacters.length > 0
              ? `已添加 ${updates.newCharacters.length} 个新角色，${updates.characterUpdates.length} 项状态更新`
              : updates.characterUpdates.length > 0
                ? `已记录 ${updates.characterUpdates.length} 项角色状态变化`
                : "本章无重大设定变化",
        });

        return {
          newFacts: updates.newFacts,
          characterUpdates: updates.characterUpdates,
          timelineEvents: updates.timelineEvents,
        };
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
        // @Leader 编辑调整：智能分析用户指令并执行相应操作
        // 使用两阶段处理：先分析意图，再执行操作
        const leaderResponse = await this.executeLeaderCommand(
          input,
          userPrompt,
          modelId,
          missionId,
        );

        // 检查是否需要委托给 full_story 任务
        if (leaderResponse?.startsWith("[DELEGATE_TO_FULL_STORY]")) {
          this.logger.log(
            `[${missionId}] Leader delegating to full_story task`,
          );
          // 通知用户 Leader 正在委托任务
          await this.eventEmitter.emitLeaderResponse(
            input.projectId,
            missionId,
            "📝 收到您的请求，正在安排作家团队创作新章节...",
          );
          // 返回 null 让调用方知道需要走 full_story 流程
          // 实际的 full_story 执行会在 execute 方法中处理
          return "[DELEGATE_FULL_STORY_INTERNAL]";
        }

        // 发送 Leader 响应事件（支持多轮对话）
        if (leaderResponse) {
          await this.eventEmitter.emitLeaderResponse(
            input.projectId,
            missionId,
            leaderResponse,
          );
        }

        return leaderResponse;
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
        styleTemplate: true, // ★ 关键：获取风格模板配置
      },
    });

    if (!project?.storyBible) {
      // 创建空的 Story Bible 扩展
      const emptyStoryBible = {
        projectId: input.projectId, // ★ 关键：使用正确的 projectId
        bibleId: "",
        bibleVersion: 1,
        snapshotAt: new Date().toISOString(),
        characters: [],
        worldSettings: [],
        terminologies: [],
        timelineEvents: [],
        factions: [],
        stylePresetId: project?.styleTemplate?.baseStyle, // ★ 传递风格预设ID
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
      projectId: input.projectId, // ★ 关键：使用正确的 projectId（而非 bibleId）
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
      stylePresetId: project.styleTemplate?.baseStyle, // ★ 传递风格预设ID
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
        // 【关键修复】从 Story Bible 提取所有角色，确保 Writer Agent 能获得角色约束
        // 这解决了角色名不一致的问题（如"王皇后"被写成"卫皇后"）
        const allCharacters = storyBibleExtensions.characters;

        // 尝试从章节大纲中提取涉及的角色名
        const outlineText = chapter.outline || "";
        const involvedChars = allCharacters.filter((char) => {
          // 检查角色名是否出现在大纲中
          if (outlineText.includes(char.name)) return true;
          // 检查角色别名是否出现在大纲中
          if (char.aliases?.some((alias) => outlineText.includes(alias)))
            return true;
          return false;
        });

        // 如果大纲没有明确提到角色，则包含所有主要角色（protagonist + antagonist）
        // 这确保 Writer Agent 至少知道主角和反派的正确名字
        const finalInvolvedCharacters =
          involvedChars.length > 0
            ? involvedChars
            : allCharacters.filter(
                (c) => c.role === "protagonist" || c.role === "antagonist",
              );

        // 【关键修复】获取前文上下文，确保 Writer Agent 知道之前发生了什么
        const previousChapters = await this.prisma.writingChapter.findMany({
          where: {
            volumeId: chapter.volumeId,
            chapterNumber: { lt: chapter.chapterNumber },
            content: { not: null },
          },
          orderBy: { chapterNumber: "desc" },
          take: 5, // 最近5章
          select: {
            chapterNumber: true,
            title: true,
            content: true,
          },
        });

        // 构建前情提要（从正文提取摘要）
        const previousContext = previousChapters.reverse().map((prevChap) => ({
          chapterNumber: prevChap.chapterNumber,
          title: prevChap.title,
          summary: prevChap.content
            ? this.extractSummaryFromContent(prevChap.content)
            : "（无内容）",
        }));

        contextPackage.extensions.chapterContext = {
          chapter: {
            id: chapter.id,
            chapterNumber: chapter.chapterNumber,
            title: chapter.title,
            outline: chapter.outline || undefined,
            volumeId: chapter.volumeId,
            volumeTitle: chapter.volume?.title,
          },
          previousContext,
          involvedCharacters: finalInvolvedCharacters,
          relevantWorldSettings: storyBibleExtensions.worldSettings,
          relevantTerminology: storyBibleExtensions.terminologies,
          timelineContext: storyBibleExtensions.timelineEvents,
        };
      }
    }

    return contextPackage;
  }

  /**
   * 从章节内容中提取摘要（简单截取关键段落）
   * 用于当章节没有手动摘要时的兜底方案
   */
  private extractSummaryFromContent(content: string): string {
    // 截取前500字作为简单摘要
    const maxLength = 500;
    const cleaned = content
      .replace(/\n{2,}/g, "\n") // 合并多余换行
      .trim();

    if (cleaned.length <= maxLength) {
      return cleaned;
    }

    // 尝试在句号、问号、感叹号处截断
    const truncated = cleaned.slice(0, maxLength);
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf("。"),
      truncated.lastIndexOf("？"),
      truncated.lastIndexOf("！"),
    );

    if (lastSentenceEnd > maxLength * 0.6) {
      return truncated.slice(0, lastSentenceEnd + 1) + "...";
    }

    return truncated + "...";
  }

  /**
   * @Leader 智能任务分派执行
   * 两阶段处理：1. 分析用户意图 2. 执行具体操作
   */
  private async executeLeaderCommand(
    input: WritingMissionInput,
    userPrompt: string,
    modelId: string,
    missionId: string,
  ): Promise<string | null> {
    // 获取上下文信息
    const contextInfo = await this.getLeaderContextInfo(
      input.projectId,
      input.chapterId,
    );

    // 阶段1：分析用户意图
    const analysisPrompt = `你是故事架构师（Leader），负责分析用户指令并决定执行什么操作。

## 当前项目状态
${contextInfo}

## 用户指令
${userPrompt}

## 你的任务
分析用户指令，判断需要执行的操作类型，并输出结构化的 JSON 指令。

## 可用操作类型
1. add_character - 添加新角色到故事圣经
2. update_character - 更新现有角色信息
3. add_world_setting - 添加世界观设定
4. modify_chapter - 修改/重写章节内容
5. continue_writing - 继续创作下一章
6. consistency_check - 检查内容一致性
7. analyze - 分析项目状态并给出建议（不执行修改）

## 输出格式（必须是有效的 JSON）
{
  "action": "操作类型",
  "understanding": "对用户指令的理解（一句话）",
  "params": {
    // 根据操作类型填写参数
    // add_character: { "name": "角色名", "role": "PROTAGONIST/ANTAGONIST/SUPPORTING/MINOR", "description": "角色描述", "background": "背景故事", "abilities": ["能力1"] }
    // update_character: { "name": "角色名", "updates": { "字段": "新值" } }
    // add_world_setting: { "category": "分类", "name": "设定名", "description": "描述", "rules": ["规则1"] }
    // modify_chapter: { "chapterNumber": 章节号, "instruction": "修改指令" }
    // continue_writing: { "instruction": "创作指令" }
    // consistency_check: {}
    // analyze: {}
  },
  "explanation": "执行说明"
}

请直接输出 JSON，不要包含其他文字：`;

    this.logger.log(`[${missionId}] Analyzing user intent for @Leader command`);

    // 构建消息数组，包含对话历史
    const messages: Array<{
      role: "user" | "assistant" | "system";
      content: string;
    }> = [];

    // 添加系统提示（分析提示作为系统消息）
    messages.push({ role: "system", content: analysisPrompt });

    // 添加对话历史（如果有）
    if (input.conversationHistory && input.conversationHistory.length > 0) {
      this.logger.log(
        `[${missionId}] Including ${input.conversationHistory.length} conversation history messages`,
      );
      for (const msg of input.conversationHistory) {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    // 添加当前用户消息
    messages.push({ role: "user", content: userPrompt });

    const analysisResponse = await this.aiChatService.chat({
      messages,
      model: modelId,
      temperature: 0.3, // 低温度确保输出稳定
      maxTokens: 2000,
    });

    if (!analysisResponse.content) {
      this.logger.error(`[${missionId}] Failed to analyze user intent`);
      return "无法理解指令，请重新描述您的需求。";
    }

    // 解析 JSON 指令
    let command: {
      action: string;
      understanding: string;
      params: Record<string, unknown>;
      explanation: string;
    };

    try {
      // 尝试提取 JSON
      const jsonMatch = analysisResponse.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      command = JSON.parse(jsonMatch[0]);
    } catch (error) {
      this.logger.warn(
        `[${missionId}] Failed to parse command JSON: ${(error as Error).message}`,
      );
      // 回退：当作分析请求处理
      return `## Leader 分析\n\n${analysisResponse.content}`;
    }

    this.logger.log(
      `[${missionId}] Executing @Leader action: ${command.action}`,
    );

    // 阶段2：执行具体操作
    switch (command.action) {
      case "add_character": {
        const params = command.params as {
          name: string;
          role?: string;
          description?: string;
          background?: string;
          abilities?: string[];
        };

        if (!params.name) {
          return "错误：创建角色需要提供角色名称。";
        }

        // 获取 Story Bible ID
        const project = await this.prisma.writingProject.findUnique({
          where: { id: input.projectId },
          include: { storyBible: true },
        });

        if (!project?.storyBible) {
          return "错误：项目没有关联的故事圣经。";
        }

        // 检查角色是否已存在
        const existingChar = await this.prisma.writingCharacter.findFirst({
          where: {
            bibleId: project.storyBible.id,
            name: params.name,
          },
        });

        if (existingChar) {
          return `角色「${params.name}」已存在，如需更新请使用"修改角色"指令。`;
        }

        // 创建新角色
        const newCharacter = await this.prisma.writingCharacter.create({
          data: {
            bibleId: project.storyBible.id,
            name: params.name,
            role:
              (params.role as
                | "PROTAGONIST"
                | "ANTAGONIST"
                | "SUPPORTING"
                | "MINOR") || "SUPPORTING",
            background: params.background || params.description || "",
            abilities: params.abilities || [],
            appearance: {},
            personality: params.description
              ? { summary: params.description }
              : {},
            currentState: {},
            stateTimeline: [],
          },
        });

        this.logger.log(
          `[${missionId}] Created character: ${newCharacter.name} (${newCharacter.id})`,
        );

        return `## ✅ 角色创建成功

**角色名称**：${newCharacter.name}
**角色定位**：${newCharacter.role}
**描述**：${params.description || "（未提供）"}
**背景**：${params.background || "（未提供）"}

角色已添加到故事圣经，后续章节创作时会自动引用此角色设定。`;
      }

      case "update_character": {
        const params = command.params as {
          name: string;
          updates: Record<string, unknown>;
        };

        if (!params.name) {
          return "错误：更新角色需要提供角色名称。";
        }

        const project = await this.prisma.writingProject.findUnique({
          where: { id: input.projectId },
          include: { storyBible: true },
        });

        if (!project?.storyBible) {
          return "错误：项目没有关联的故事圣经。";
        }

        const character = await this.prisma.writingCharacter.findFirst({
          where: {
            bibleId: project.storyBible.id,
            name: params.name,
          },
        });

        if (!character) {
          return `未找到角色「${params.name}」，请检查名称是否正确。`;
        }

        // 更新角色
        const updatedChar = await this.prisma.writingCharacter.update({
          where: { id: character.id },
          data: params.updates as Record<string, string | string[]>,
        });

        return `## ✅ 角色更新成功

**角色**：${updatedChar.name}
**更新内容**：${JSON.stringify(params.updates, null, 2)}`;
      }

      case "add_world_setting": {
        const params = command.params as {
          category: string;
          name: string;
          description: string;
          rules?: string[];
        };

        if (!params.name || !params.category) {
          return "错误：添加世界观设定需要提供名称和分类。";
        }

        const project = await this.prisma.writingProject.findUnique({
          where: { id: input.projectId },
          include: { storyBible: true },
        });

        if (!project?.storyBible) {
          return "错误：项目没有关联的故事圣经。";
        }

        const newSetting = await this.prisma.worldSetting.create({
          data: {
            bibleId: project.storyBible.id,
            category: params.category,
            name: params.name,
            description: params.description || "",
            rules: params.rules || [],
          },
        });

        return `## ✅ 世界观设定添加成功

**分类**：${newSetting.category}
**名称**：${newSetting.name}
**描述**：${newSetting.description}`;
      }

      case "modify_chapter": {
        const params = command.params as {
          chapterNumber?: number;
          instruction: string;
        };

        // 需要生成新内容，转换为章节写作任务
        return this.generateChapterModification(
          input,
          params.chapterNumber,
          params.instruction,
          modelId,
          missionId,
        );
      }

      case "continue_writing": {
        // 转换为继续创作任务
        return `[DELEGATE_TO_FULL_STORY]继续创作`;
      }

      case "consistency_check":
      case "analyze":
      default: {
        // 返回分析结果
        return `## 📋 Leader 分析

**理解**：${command.understanding}

**建议**：
${command.explanation}`;
      }
    }
  }

  /**
   * 生成章节修改内容
   */
  private async generateChapterModification(
    input: WritingMissionInput,
    chapterNumber: number | undefined,
    instruction: string,
    modelId: string,
    missionId: string,
  ): Promise<string | null> {
    // 获取目标章节
    let chapter;
    if (chapterNumber) {
      const volumes = await this.prisma.writingVolume.findMany({
        where: { projectId: input.projectId },
        include: {
          chapters: {
            where: { chapterNumber },
          },
        },
      });
      chapter = volumes.flatMap((v) => v.chapters)[0];
    } else if (input.chapterId) {
      chapter = await this.prisma.writingChapter.findUnique({
        where: { id: input.chapterId },
      });
    }

    if (!chapter) {
      return "未找到指定章节，请确认章节号或选择一个章节后再试。";
    }

    // 生成修改后的内容
    const modifyPrompt = `请根据以下指令修改章节内容：

## 当前章节
**标题**：第${chapter.chapterNumber}章 ${chapter.title}
**大纲**：${chapter.outline || "无"}

**原内容**：
${chapter.content || "（空）"}

## 修改指令
${instruction}

## 要求
1. 保持故事连贯性
2. 保留原有的精彩部分
3. 按照指令进行针对性修改
4. 输出完整的修改后内容

请输出修改后的完整章节内容：`;

    const response = await this.aiChatService.chat({
      messages: [{ role: "user", content: modifyPrompt }],
      model: modelId,
      temperature: 0.8,
      maxTokens: 8000,
    });

    if (response.content && response.content.length > 200) {
      // 保存修改后的内容
      await this.prisma.writingChapter.update({
        where: { id: chapter.id },
        data: {
          content: response.content,
          wordCount: this.countWords(response.content),
          status: "WRITING",
        },
      });

      // 更新 Story Bible
      await this.updateStoryBibleAfterChapter(
        input.projectId,
        missionId,
        chapter.chapterNumber,
        response.content,
        {},
        modelId,
      );

      return response.content;
    }

    return "章节修改失败，请重试。";
  }

  /**
   * 获取 Leader 执行指令时需要的上下文信息
   * 包括项目进度、当前章节、角色信息等
   */
  private async getLeaderContextInfo(
    projectId: string,
    chapterId?: string,
  ): Promise<string> {
    const parts: string[] = [];

    try {
      // 1. 获取项目基本信息
      const project = await this.prisma.writingProject.findUnique({
        where: { id: projectId },
        include: {
          storyBible: {
            include: {
              characters: { take: 10 },
              worldSettings: { take: 5 },
            },
          },
          volumes: {
            include: {
              chapters: {
                orderBy: { chapterNumber: "asc" },
                select: {
                  id: true,
                  chapterNumber: true,
                  title: true,
                  status: true,
                  wordCount: true,
                },
              },
            },
            orderBy: { volumeNumber: "asc" },
          },
        },
      });

      if (!project) {
        return "项目信息不可用";
      }

      // 项目进度
      const totalChapters = project.volumes.reduce(
        (sum, v) => sum + v.chapters.length,
        0,
      );
      const completedChapters = project.volumes.reduce(
        (sum, v) => sum + v.chapters.filter((c) => c.status === "FINAL").length,
        0,
      );
      parts.push(
        `项目：${project.name}`,
        `进度：${completedChapters}/${totalChapters} 章已完成`,
        `总字数：${project.currentWords || 0} 字`,
      );

      // 2. 章节列表概览
      if (project.volumes.length > 0) {
        parts.push("\n### 章节列表");
        for (const volume of project.volumes) {
          parts.push(`\n**${volume.title}**`);
          for (const chapter of volume.chapters) {
            const statusIcon =
              chapter.status === "FINAL"
                ? "✅"
                : chapter.status === "WRITING"
                  ? "✍️"
                  : "📋";
            parts.push(
              `  ${statusIcon} 第${chapter.chapterNumber}章：${chapter.title} (${chapter.wordCount}字)`,
            );
          }
        }
      }

      // 3. 当前章节详情（如果有指定）
      if (chapterId) {
        const chapter = await this.prisma.writingChapter.findUnique({
          where: { id: chapterId },
          select: {
            chapterNumber: true,
            title: true,
            content: true,
            outline: true,
            status: true,
          },
        });
        if (chapter) {
          parts.push(`\n### 当前操作章节`);
          parts.push(`第${chapter.chapterNumber}章：${chapter.title}`);
          parts.push(`状态：${chapter.status}`);
          if (chapter.outline) {
            parts.push(`大纲：${chapter.outline}`);
          }
          if (chapter.content) {
            parts.push(
              `内容预览：${chapter.content.slice(0, 500)}${chapter.content.length > 500 ? "..." : ""}`,
            );
          }
        }
      }

      // 4. 主要角色
      if (
        project.storyBible?.characters &&
        project.storyBible.characters.length > 0
      ) {
        parts.push("\n### 主要角色");
        for (const char of project.storyBible.characters.slice(0, 5)) {
          parts.push(`- ${char.name}（${char.role}）`);
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to get leader context info: ${error}`);
      return "上下文信息获取失败";
    }

    return parts.join("\n");
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
   *
   * @param missionId - 任务ID，用于日志和 Story Bible 更新
   * @param modelId - 模型ID，用于 Story Bible 更新的 LLM 调用
   */
  private async saveGeneratedContent(
    input: WritingMissionInput,
    content: string,
    wordCount: number,
    missionId?: string,
    modelId?: string,
  ): Promise<void> {
    try {
      // 跳过完成标记，不需要保存
      if (content.startsWith("[ALL_CHAPTERS_COMPLETED]")) {
        this.logger.log(
          `Skipping save for completion marker: ${content.substring(0, 50)}...`,
        );
        return;
      }

      // 跳过续写完成标记，内容已经在 continueExistingStory 中逐章保存了
      if (content.startsWith("[CONTINUATION_COMPLETE]")) {
        this.logger.log(
          `Skipping save for continuation complete marker: ${content.substring(0, 80)}...`,
        );
        return;
      }

      if (
        input.missionType === "full_story" ||
        input.missionType === "outline"
      ) {
        // 完整故事或大纲: 需要创建卷和章节
        await this.createVolumeAndChapters(input.projectId, content, wordCount);
      } else if (input.missionType === "chapter" && input.chapterId) {
        // 单章节: 更新指定章节
        await this.updateChapterContent(input.chapterId, content, wordCount);
        // ★ 单章模式也需要更新 Story Bible
        if (missionId && modelId) {
          const chapter = await this.prisma.writingChapter.findUnique({
            where: { id: input.chapterId },
            select: { chapterNumber: true },
          });
          if (chapter) {
            await this.updateStoryBibleAfterChapter(
              input.projectId,
              missionId,
              chapter.chapterNumber,
              content,
              {},
              modelId,
            );
          }
        }
      } else if (input.missionType === "chapter" && input.volumeId) {
        // 新章节: 在卷中创建新章节
        await this.createNewChapter(input.volumeId, content, wordCount);
        // ★ 新章节也需要更新 Story Bible
        if (missionId && modelId) {
          const chapterCount = await this.prisma.writingChapter.count({
            where: { volumeId: input.volumeId },
          });
          await this.updateStoryBibleAfterChapter(
            input.projectId,
            missionId,
            chapterCount, // 刚创建的章节号
            content,
            {},
            modelId,
          );
        }
      } else if (input.missionType === "edit") {
        // @Leader 编辑调整：更新指定章节或创建新的修订版本
        if (input.chapterId) {
          await this.updateChapterContent(input.chapterId, content, wordCount);
          // ★ 编辑模式也需要更新 Story Bible
          if (missionId && modelId) {
            const chapter = await this.prisma.writingChapter.findUnique({
              where: { id: input.chapterId },
              select: { chapterNumber: true },
            });
            if (chapter) {
              await this.updateStoryBibleAfterChapter(
                input.projectId,
                missionId,
                chapter.chapterNumber,
                content,
                {},
                modelId,
              );
            }
          }
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
          .replace(/^第[一二三四五六七八九十百千\d]+[章回][：:\s]*/i, "")
          .replace(/^#{1,6}\s*/, "") // 移除 markdown 标题标记
          .trim();

        // 如果标题为空，尝试从大纲中提取
        if (!cleanTitle && ch.plot) {
          const plotFirstLine = ch.plot.split(/[\n\r]/)[0]?.trim() || "";
          cleanTitle = plotFirstLine
            .replace(/^第[一二三四五六七八九十百千\d]+[章回][：:\s]*/i, "")
            .replace(/^#{1,6}\s*/, "")
            .trim();
        }

        // 如果仍然为空，留空（前端会只显示"第X章"）
        if (
          !cleanTitle ||
          cleanTitle.match(/^第[一二三四五六七八九十百千\d]+[章回]$/)
        ) {
          cleanTitle = "";
        }

        // 清理大纲 - 移除章节号前缀和 markdown 标记
        let cleanOutline = ch.plot || "";
        cleanOutline = cleanOutline
          .replace(/^第[一二三四五六七八九十百千\d]+[章回][：:\s]*/i, "")
          .replace(/^#{1,6}\s*/, "")
          .trim();

        await this.prisma.writingChapter.create({
          data: {
            volumeId,
            title: cleanTitle,
            chapterNumber: i + 1,
            outline: cleanOutline, // 清理后的章节大纲
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

        // 提取章节标题 - 支持多种格式
        const titleMatch = chapterContent.match(
          /^(?:#{1,6}\s*)?第[一二三四五六七八九十百千\d]+[章回][：:\s]+(.+?)[\n\r]/i,
        );
        let chapterTitle = titleMatch
          ? titleMatch[1]
              .trim()
              .replace(/^第[一二三四五六七八九十百千\d]+[章回][：:\s]*/i, "")
              .replace(/^#{1,6}\s*/, "")
          : "";

        // 如果标题仍为空或只是章节号，留空（前端会只显示"第X章"）
        if (
          !chapterTitle ||
          chapterTitle.match(/^第[一二三四五六七八九十百千\d]+[章回]$/)
        ) {
          chapterTitle = "";
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

    // 获取故事圣经（包含角色信息）
    const storyBible = await this.prisma.storyBible.findUnique({
      where: { projectId },
      include: {
        characters: {
          select: {
            name: true,
            role: true,
            background: true,
            personality: true,
          },
        },
      },
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

    // 获取世界观设定（包含角色信息，用于质量约束生成）
    let worldSettings: any = null;
    if (existingContent.storyBible) {
      worldSettings = {
        world: {
          type: existingContent.storyBible.worldType,
          theme: existingContent.storyBible.theme,
          premise: existingContent.storyBible.premise,
        },
        // ★ 添加角色信息，用于专业声音服务
        characters: existingContent.storyBible.characters || [],
      };
    }

    // 获取作家模型
    const writerModel = (await this.getModelForRole("writer")) || modelId;

    const allContent: string[] = [];
    let currentWordCount = existingContent.currentWords;
    const chaptersToWrite = existingContent.unwrittenChapters;

    // 如果没有空白章节
    if (chaptersToWrite.length === 0) {
      // 检查是否已达到目标
      if (currentWordCount >= targetWordCount) {
        this.logger.log(
          `[${missionId}] All chapters completed, target reached (${currentWordCount}/${targetWordCount})`,
        );
        await this.saveMissionLog(
          missionId,
          "mission:complete",
          `✅ 所有章节已完成！共 ${currentWordCount.toLocaleString()} 字`,
        );
        return `[ALL_CHAPTERS_COMPLETED] 所有 ${existingContent.totalChapters} 章节已完成，共 ${currentWordCount.toLocaleString()} 字。`;
      }

      // 目标未达成，需要创建新章节继续写作
      this.logger.log(
        `[${missionId}] All chapters written but target not reached (${currentWordCount}/${targetWordCount}), creating new chapters`,
      );
      await this.saveMissionLog(
        missionId,
        "mission:info",
        `📝 已有章节写完（${currentWordCount.toLocaleString()} 字），创建新章节继续写作...`,
      );

      // 计算需要多少新章节
      const wordsPerChapter = 3000;
      const remainingWords = targetWordCount - currentWordCount;
      const newChaptersNeeded = Math.min(
        10, // 每次最多创建10章
        Math.ceil(remainingWords / wordsPerChapter),
      );

      // 获取第一个卷（用于创建新章节）
      const volume = await this.prisma.writingVolume.findFirst({
        where: { projectId: input.projectId },
        orderBy: { volumeNumber: "asc" },
        select: { id: true },
      });

      if (!volume) {
        this.logger.error(`[${missionId}] No volume found for project`);
        return `[ALL_CHAPTERS_COMPLETED] 所有章节已完成，共 ${currentWordCount.toLocaleString()} 字。`;
      }

      // 创建新的空白章节
      const startChapterNumber = existingContent.totalChapters + 1;
      const newChapters: Array<{
        id: string;
        chapterNumber: number;
        title: string;
        volumeId: string;
      }> = [];

      for (let i = 0; i < newChaptersNeeded; i++) {
        const chapterNumber = startChapterNumber + i;
        const newChapter = await this.prisma.writingChapter.create({
          data: {
            volumeId: volume.id,
            title: "待续写", // 占位标题，写作时会生成正式标题
            chapterNumber,
            content: "",
            wordCount: 0,
            status: "PLANNED",
          },
          select: {
            id: true,
            chapterNumber: true,
            title: true,
            volumeId: true,
          },
        });
        newChapters.push(newChapter);
      }

      this.logger.log(
        `[${missionId}] Created ${newChapters.length} new chapters (${startChapterNumber}-${startChapterNumber + newChaptersNeeded - 1})`,
      );
      await this.saveMissionLog(
        missionId,
        "mission:info",
        `📖 已创建第${startChapterNumber}章至第${startChapterNumber + newChaptersNeeded - 1}章，开始写作...`,
      );

      // 将新章节添加到待写列表
      chaptersToWrite.push(...newChapters);
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

      // ★ v3 增强：生成质量约束（开篇钩子、五感沉浸、专业声音）
      const characters =
        (worldSettings?.characters as Array<{
          name: string;
          role?: string;
          background?: string;
        }>) || [];
      const qualityConstraints = this.generateQualityConstraints(
        chapter.chapterNumber,
        chapter.title, // 使用章节标题作为剧情提示
        characters,
        input.projectId,
      );

      // ★ 使用完整的写作原则系统提示词（v3 增强）
      const writerSystemPrompt = `你是专业的小说作家，擅长创作引人入胜的故事。

${WriterAgent.CORE_WRITING_PRINCIPLES}

${qualityConstraints ? `${qualityConstraints}\n` : ""}
请直接输出章节内容。`;

      const writerResponse = await this.aiChatService.chat({
        messages: [
          {
            role: "system",
            content: writerSystemPrompt,
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
        // ★★★ 重试时也必须包含完整质量约束（修复：之前遗漏了 qualityConstraints）
        const retryResponse = await this.aiChatService.chat({
          messages: [
            {
              role: "system",
              content: `你是小说作家。请创作约3000字的章节内容。\n\n${WriterAgent.CORE_WRITING_PRINCIPLES}\n\n${qualityConstraints || ""}`,
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

      // ★★★ 第一章开篇质量强化（续写模式也需要）★★★
      if (chapter.chapterNumber === 1) {
        const contentWithoutTitle = chapterContent
          .replace(/^第[一二三四五六七八九十百千万]+章.*?\n+/, "")
          .trim();
        const opening = contentWithoutTitle.slice(0, 300);
        const openingQuality = this.openingHook.analyzeOpeningQuality(opening);

        this.logger.log(
          `[${missionId}] Chapter 1 opening quality: score=${openingQuality.score}`,
        );

        const OPENING_QUALITY_THRESHOLD = 70;
        if (openingQuality.score < OPENING_QUALITY_THRESHOLD) {
          this.logger.warn(
            `[${missionId}] Chapter 1 opening below threshold, rewriting...`,
          );

          const firstChapterGuidance =
            this.openingHook.generateOpeningConstraints(1, undefined);

          try {
            const openingRewriteResponse = await this.aiChatService.chat({
              messages: [
                {
                  role: "system",
                  content: `你是专业的网文开篇优化专家。重写开篇使其具有强烈吸引力。

参考技巧：冲突对话式、感官沉浸式、极端困境式

禁止：用"在一个XX的世界里"开头、世界观介绍开头`,
                },
                {
                  role: "user",
                  content: `请重写以下开篇（前3-5段）：

【当前开篇】${opening}

【问题】${openingQuality.issues.join("、")}

【要求】${firstChapterGuidance}

只输出重写后的开篇。`,
                },
              ],
              model: writerModel,
              temperature: 0.85,
              maxTokens: 2000,
            });

            if (
              openingRewriteResponse.content &&
              openingRewriteResponse.content.length > 100
            ) {
              const newOpening = openingRewriteResponse.content.trim();
              let openingEndIndex = 300;
              let count = 0;
              for (
                let i = 0;
                i < contentWithoutTitle.length && count < 3;
                i++
              ) {
                if (/[。！？]/.test(contentWithoutTitle[i])) {
                  count++;
                  if (count === 3) {
                    openingEndIndex = i + 1;
                    break;
                  }
                }
              }
              const restOfContent = contentWithoutTitle.slice(openingEndIndex);
              chapterContent = `第${this.numberToChinese(chapter.chapterNumber)}章 ${chapter.title}\n\n${newOpening}\n\n${restOfContent}`;
              this.logger.log(
                `[${missionId}] Chapter 1 opening rewritten successfully`,
              );
            }
          } catch (e) {
            this.logger.warn(
              `[${missionId}] Opening rewrite failed: ${(e as Error).message}`,
            );
          }
        }
      }

      const chapterWordCount = this.countWords(chapterContent);

      // 从生成的内容中提取标题
      const extractedTitle = this.extractChapterTitle(
        chapterContent,
        chapter.chapterNumber,
      );

      // 保存章节内容和标题
      await this.prisma.writingChapter.update({
        where: { id: chapter.id },
        data: {
          content: chapterContent,
          wordCount: chapterWordCount,
          title: extractedTitle,
          status: "FINAL",
        },
      });

      // ★★★ 守护者更新故事圣经（续写模式也需要！）★★★
      await this.updateStoryBibleAfterChapter(
        input.projectId,
        missionId,
        chapter.chapterNumber,
        chapterContent,
        worldSettings || {},
        writerModel,
      );

      // 保存日志
      await this.saveMissionLog(
        missionId,
        "chapter:content",
        `📖 第${chapter.chapterNumber}章「${extractedTitle}」完成 (${chapterWordCount} 字)`,
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

    // 返回带有 [CONTINUATION_COMPLETE] 标记的内容
    // 这会告诉 saveGeneratedContent 跳过保存步骤，因为内容已经在上面逐章保存了
    return `[CONTINUATION_COMPLETE] 续写完成 ${chaptersToWrite.length} 章，共 ${currentWordCount.toLocaleString()} 字。\n\n${allContent.join("\n\n---\n\n")}`;
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
    // Note: "consistency" is mapped to "CONSISTENCY" for backward compatibility
    const missionTypeMap: Record<string, string> = {
      outline: "OUTLINE",
      chapter: "CHAPTER",
      revision: "REVISION",
      consistency: "CONSISTENCY", // Backward compatibility - deprecated, use consistency_check
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
    const mission = await this.prisma.writingMission.update({
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

    // 更新项目状态：任务完成时设为 REVISING，任务失败时根据字数决定
    const project = await this.prisma.writingProject.findUnique({
      where: { id: mission.projectId },
      select: { currentWords: true },
    });

    if (project) {
      const newStatus = result.success
        ? "REVISING" // 任务成功完成 → 进入修订阶段
        : project.currentWords > 0
          ? "REVISING" // 任务失败但有内容 → 修订阶段
          : "PLANNING"; // 任务失败且无内容 → 规划阶段

      await this.prisma.writingProject.update({
        where: { id: mission.projectId },
        data: { status: newStatus },
      });

      this.logger.log(
        `Updated project ${mission.projectId} status to ${newStatus}`,
      );
    }

    return mission;
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
   * 从章节内容中提取标题
   * 支持多种格式:
   * - 第X章 标题
   * - 第X章：标题
   * - 第X章: 标题
   * - # 第X章 标题
   * - ### 第X章 第X回 标题
   */
  private extractChapterTitle(content: string, chapterNumber: number): string {
    // 获取第一行
    const firstLine = content.split(/[\n\r]/)[0]?.trim() || "";

    // 移除开头的 markdown 标记 (# ## ### 等)
    const cleanLine = firstLine.replace(/^#+\s*/, "");

    // 尝试多种匹配模式
    const patterns = [
      // 格式: 第X章：标题 或 第X章: 标题
      /^第[一二三四五六七八九十百千\d]+章[：:]\s*(.+)$/,
      // 格式: 第X章 第X回 标题
      /^第[一二三四五六七八九十百千\d]+章\s+第[一二三四五六七八九十百千\d]+回\s+(.+)$/,
      // 格式: 第X章 标题 (标题不以"第"开头)
      /^第[一二三四五六七八九十百千\d]+章\s+([^第].+)$/,
    ];

    for (const pattern of patterns) {
      const match = cleanLine.match(pattern);
      if (match && match[1]) {
        const title = match[1].trim();
        // 确保标题不为空且不只是章节号
        if (title && !title.match(/^第[一二三四五六七八九十百千\d]+[章回]$/)) {
          return title;
        }
      }
    }

    // 如果匹配失败但有内容，尝试提取第X章后面的所有内容作为标题
    const generalMatch = cleanLine.match(
      /^第[一二三四五六七八九十百千\d]+章\s*[：:\s]*(.+)$/,
    );
    if (generalMatch && generalMatch[1]) {
      const extracted = generalMatch[1].trim();
      // 检查是否是 "第X回 标题" 格式
      const huiWithTitle = extracted.match(
        /^(第[一二三四五六七八九十百千\d]+回)\s+(.+)$/,
      );
      if (huiWithTitle && huiWithTitle[2]) {
        // 有标题，返回标题部分
        return huiWithTitle[2].trim();
      }
      // 检查是否只有 "第X回" - 尝试从后续行找标题
      const huiOnly = extracted.match(/^第[一二三四五六七八九十百千\d]+回$/);
      if (huiOnly) {
        // 尝试从第二行或第三行获取有意义的标题
        const lines = content.split(/[\n\r]/).filter((l) => l.trim());
        for (let i = 1; i < Math.min(lines.length, 4); i++) {
          const line = lines[i].trim();
          // 跳过空行和太短的行
          if (line.length < 4) continue;
          // 跳过以特殊字符开头的行
          if (/^[#*\-\d]/.test(line)) continue;
          // 找到一个合适的标题行（取前20个字符作为标题）
          const titleCandidate = line
            .substring(0, 20)
            .replace(/[，。！？].*$/, "");
          if (titleCandidate.length >= 4) {
            return titleCandidate;
          }
        }
        // 如果找不到合适的标题，使用第X回格式
        return extracted;
      }
      // 其他情况，移除可能的"第X回"前缀
      const withoutHui = extracted.replace(
        /^第[一二三四五六七八九十百千\d]+回\s*/,
        "",
      );
      if (withoutHui && withoutHui.length > 0) {
        return withoutHui;
      }
      // 如果移除后为空但原始提取不为空，返回原始提取
      if (extracted && extracted.length > 0) {
        return extracted;
      }
    }

    // 最终回退：使用默认标题
    return `第${chapterNumber}章`;
  }

  /**
   * 重新提取并更新项目所有章节的标题
   * 用于修复已有章节缺失标题的情况
   */
  async reExtractChapterTitles(
    projectId: string,
    userId: string,
  ): Promise<{
    updated: number;
    chapters: Array<{
      id: string;
      number: number;
      oldTitle: string;
      newTitle: string;
    }>;
  }> {
    // 验证项目权限
    const project = await this.prisma.writingProject.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });

    if (!project || project.ownerId !== userId) {
      throw new Error("Access denied");
    }

    // 获取所有章节（包含outline，用于同时清理大纲）
    const chapters = await this.prisma.writingChapter.findMany({
      where: {
        volume: { projectId },
      },
      select: {
        id: true,
        chapterNumber: true,
        title: true,
        content: true,
        outline: true,
      },
      orderBy: { chapterNumber: "asc" },
    });

    const results: Array<{
      id: string;
      number: number;
      oldTitle: string;
      newTitle: string;
    }> = [];

    for (const chapter of chapters) {
      const updateData: { title?: string; outline?: string } = {};
      let needsUpdate = false;

      // === 处理标题 ===
      // 只更新那些标题是占位符或为空的章节
      const isPlaceholder =
        !chapter.title ||
        chapter.title.match(/^第[一二三四五六七八九十百千\d]+[章回]$/) ||
        chapter.title.match(/^章节\s*\d+$/) ||
        chapter.title === "待续写" ||
        chapter.title === "待创作"; // 清理旧的占位符

      if (isPlaceholder && chapter.content) {
        const newTitle = this.extractChapterTitle(
          chapter.content,
          chapter.chapterNumber,
        );

        // 清理新标题 - 移除章节号前缀和 markdown
        let cleanNewTitle = newTitle
          .replace(/^第[一二三四五六七八九十百千\d]+[章回][：:\s]*/i, "")
          .replace(/^#{1,6}\s*/, "")
          .trim();

        // 如果清理后为空或仍是占位符格式，留空
        if (
          !cleanNewTitle ||
          cleanNewTitle.match(/^第[一二三四五六七八九十百千\d]+[章回]$/) ||
          cleanNewTitle.match(/^章节\s*\d+$/)
        ) {
          cleanNewTitle = "";
        }

        updateData.title = cleanNewTitle;
        needsUpdate = true;
      }

      // === 处理大纲（同时清理所有章节的大纲）===
      if (chapter.outline) {
        const outlineNeedsCleaning =
          chapter.outline.match(/^第[一二三四五六七八九十百千\d]+[章回]/) ||
          chapter.outline.match(/^#{1,6}\s*第/) ||
          chapter.outline === "待创作"; // 清理旧的占位符

        if (outlineNeedsCleaning) {
          // 如果是"待创作"，直接置空
          if (chapter.outline === "待创作") {
            updateData.outline = "";
            needsUpdate = true;
          } else {
            let cleanOutline = chapter.outline
              .replace(/^第[一二三四五六七八九十百千\d]+[章回][：:\s]*/i, "")
              .replace(/^#{1,6}\s*/, "")
              .trim();

            // 如果清理后只剩下另一个章节号格式，继续清理
            cleanOutline = cleanOutline
              .replace(/^第[一二三四五六七八九十百千\d]+[章回][：:\s]*/i, "")
              .trim();

            updateData.outline = cleanOutline;
            needsUpdate = true;
          }
        }
      }

      // === 执行更新 ===
      if (needsUpdate) {
        await this.prisma.writingChapter.update({
          where: { id: chapter.id },
          data: updateData,
        });

        results.push({
          id: chapter.id,
          number: chapter.chapterNumber,
          oldTitle: chapter.title || "",
          newTitle: updateData.title ?? chapter.title ?? "",
        });

        this.logger.log(
          `Updated chapter ${chapter.chapterNumber}: title="${updateData.title ?? "(unchanged)"}", outline cleaned=${!!updateData.outline}`,
        );
      }
    }

    return {
      updated: results.length,
      chapters: results,
    };
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
      throw new NotFoundException("Mission not found");
    }

    if (mission.project.ownerId !== userId) {
      throw new NotFoundException("Mission not found");
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
   * 强制清理项目的卡住任务
   * 当任务状态不一致时使用（例如：任务失败但状态仍为 IN_PROGRESS）
   */
  async forceCleanupStuckMissions(projectId: string, userId: string) {
    // 查找所有状态为 IN_PROGRESS 的任务
    const stuckMissions = await this.prisma.writingMission.findMany({
      where: {
        projectId,
        status: "IN_PROGRESS",
      },
    });

    if (stuckMissions.length === 0) {
      return {
        success: true,
        message: "没有发现卡住的任务",
        cleanedCount: 0,
      };
    }

    // 批量更新为 FAILED 状态
    const result = await this.prisma.writingMission.updateMany({
      where: {
        projectId,
        status: "IN_PROGRESS",
      },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        result: {
          success: false,
          error: "Force cleaned - stuck task",
        },
      },
    });

    // 更新项目状态
    const project = await this.prisma.writingProject.findUnique({
      where: { id: projectId },
      select: { currentWords: true },
    });

    if (project) {
      const newStatus = project.currentWords > 0 ? "REVISING" : "PLANNING";
      await this.prisma.writingProject.update({
        where: { id: projectId },
        data: { status: newStatus },
      });
    }

    // 尝试取消所有相关的 orchestrator
    for (const mission of stuckMissions) {
      try {
        await this.missionOrchestrator.cancel(mission.id);
      } catch {
        // 忽略错误
      }
    }

    this.logger.log(
      `Force cleaned ${result.count} stuck missions for project ${projectId} by user ${userId}`,
    );

    return {
      success: true,
      message: `已清理 ${result.count} 个卡住的任务`,
      cleanedCount: result.count,
      missionIds: stuckMissions.map((m) => m.id),
    };
  }

  /**
   * 取消任务（强制取消）
   * 即使 mission 记录不存在或状态异常，也会清理项目状态
   */
  async cancelMission(missionId: string, userId: string) {
    const mission = await this.prisma.writingMission.findUnique({
      where: { id: missionId },
      include: {
        project: { select: { id: true, ownerId: true, currentWords: true } },
      },
    });

    // 如果 mission 不存在，尝试从 missionId 推断 projectId 或直接返回成功
    if (!mission) {
      this.logger.warn(
        `Mission ${missionId} not found, but treating as successful cancellation`,
      );
      // 尝试取消 orchestrator（可能在内存中）
      try {
        await this.missionOrchestrator.cancel(missionId);
      } catch {
        // 忽略
      }
      return {
        success: true,
        message: "Mission not found but cleanup attempted",
      };
    }

    if (mission.project.ownerId !== userId) {
      throw new Error("Access denied");
    }

    const projectId = mission.project.id;

    // 强制更新：将该项目所有 IN_PROGRESS 的任务都标记为 FAILED
    // 这样即使有多个卡住的任务也能一次性清理
    const updateResult = await this.prisma.writingMission.updateMany({
      where: {
        projectId,
        status: "IN_PROGRESS",
      },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        result: {
          success: false,
          error: "Cancelled by user",
        },
      },
    });

    this.logger.log(
      `Force cancelled ${updateResult.count} missions for project ${projectId}`,
    );

    // 更新项目状态
    const newStatus =
      mission.project.currentWords > 0 ? "REVISING" : "PLANNING";
    await this.prisma.writingProject.update({
      where: { id: projectId },
      data: { status: newStatus },
    });
    this.logger.log(
      `Updated project ${projectId} status to ${newStatus} after cancellation`,
    );

    // 尝试取消 orchestrator 执行（忽略错误）
    try {
      await this.missionOrchestrator.cancel(missionId);
    } catch (err) {
      this.logger.warn(
        `Failed to cancel orchestrator for mission ${missionId}: ${err instanceof Error ? err.message : err}`,
      );
    }

    this.logger.log(`Mission ${missionId} cancelled by user ${userId}`);
    return {
      success: true,
      message: "Mission cancelled",
      cleanedCount: updateResult.count,
    };
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
      throw new NotFoundException("Mission not found");
    }

    if (mission.project.ownerId !== userId) {
      throw new NotFoundException("Mission not found");
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
