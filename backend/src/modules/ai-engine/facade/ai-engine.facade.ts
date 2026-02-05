/**
 * AI Engine Facade
 * AI 引擎统一入口
 *
 * 设计原则：
 * 1. 单一入口：所有 AI Apps 通过此 Facade 消费 AI 能力
 * 2. 语义化配置：使用 TaskProfile 描述任务，而非硬编码参数
 * 3. 能力聚合：整合 LLM、Search、Agent、Team、Context 等核心能力
 * 4. 向下委托：Facade 只做路由和适配，具体实现委托给内部服务
 */

import {
  Injectable,
  Logger,
  Optional,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { AiChatService } from "../llm/services/ai-chat.service";
import { AiModelConfigService } from "../llm/services/ai-model-config.service";
// ★ 架构重构：通过 ToolRegistry 调用搜索工具
import type { ToolContext } from "../tools/abstractions/tool.interface";
import {
  TeamsService,
  CreateMissionDto,
  MissionStatus,
} from "../teams/services/teams.service";
import { TaskCompletionType } from "../orchestration/services/circuit-breaker.service";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ModelFallbackService } from "../llm/model-fallback/model-fallback.service";
import {
  AICapabilityResolver,
  AICapabilityContext,
} from "../capabilities/ai-capability-resolver.service";
import { CreditsService } from "../../credits/credits.service";
import { BillingContext } from "../../credits/billing-context";
import { RequestContext } from "../../../common/context/request-context";
import type { CreditBillingInfo } from "./types/facade.types";

// ★ P1 重构：使用分组的 Feature Providers
import {
  MemoryFeature,
  ToolFeature,
  OrchestrationFeature,
  SkillFeature,
  MEMORY_FEATURE,
  TOOL_FEATURE,
  ORCHESTRATION_FEATURE,
  SKILL_FEATURE,
  // ★ P2 能力下沉：Realtime Feature
  RealtimeFeature,
  REALTIME_FEATURE,
} from "./facade.providers";
// ★ P2 能力下沉：Realtime 类型导入
import type {
  RoomConfig,
  ProgressEvent,
} from "../realtime/abstractions/event-emitter.interface";
import { CapabilitySummary } from "../capabilities/types";
import type {
  ChatWithSkillsRequest,
  ChatWithSkillsResponse,
} from "../skills/types/skill-md.types";
import type {
  ChatRequest,
  ChatResponse,
  SearchRequest,
  SearchResponse,
  SearchResultItem,
  MissionInput,
  MissionResult,
  ProgressCallback,
  TeamType,
  TeamConfig,
  BuildContextRequest,
  StoreMemoryRequest,
  RetrieveMemoryRequest,
  MemoryItem,
  ConstraintConfig,
  ConstraintResult,
  ModelInfo,
  ModelSelectionOptions,
  AgentExecutionRequest,
  AgentExecutionResult,
  ToolExecutionRequest,
  ToolExecutionResult,
  ToolInfo,
  ToolCategory,
} from "./types";
import { TeamId } from "../teams/abstractions/team.interface";

/** 敏感词过滤列表（基础版） */
const SENSITIVE_PATTERNS = [
  /password\s*[:=]\s*\S+/gi,
  /api[_-]?key\s*[:=]\s*\S+/gi,
  /secret\s*[:=]\s*\S+/gi,
  /token\s*[:=]\s*\S+/gi,
  /bearer\s+\S+/gi,
];

/**
 * AI Engine 统一入口
 *
 * 所有 AI Apps 应该通过此 Facade 消费 AI 能力，而不是直接依赖内部服务。
 *
 * ============================================================================
 * P1 架构优化：依赖分组
 * ============================================================================
 * 将 12 个可选依赖分组为 4 个特性模块 + 3 个独立服务：
 *
 * Feature 模块（通过 Injection Token 注入）：
 * - MEMORY_FEATURE: 短期记忆 + 长期记忆
 * - TOOL_FEATURE: 工具注册表 + 函数调用执行器
 * - ORCHESTRATION_FEATURE: 熔断器 + Agent 执行器
 * - SKILL_FEATURE: 技能加载器 + 提示词构建器
 *
 * 独立服务（直接注入）：
 * - PrismaService: 数据库访问
 * - TeamsService: 团队协作
 * - AICapabilityResolver: 能力解析
 *
 * 这种设计的优点：
 * 1. 构造函数更清晰（从 9 个参数减少到语义化的分组）
 * 2. 特性可选降级（缺少某个特性时自动禁用相关功能）
 * 3. 便于测试（可以 mock 整个特性模块）
 * ============================================================================
 */
@Injectable()
export class AIEngineFacade {
  private readonly logger = new Logger(AIEngineFacade.name);

  constructor(
    // ==================== 核心服务（必需）====================
    private readonly aiChatService: AiChatService,
    private readonly modelConfigService: AiModelConfigService,

    // ==================== 特性模块（可选，通过 Token 注入）====================
    @Optional()
    @Inject(MEMORY_FEATURE)
    private readonly memory?: MemoryFeature,

    @Optional()
    @Inject(TOOL_FEATURE)
    private readonly tools?: ToolFeature,

    @Optional()
    @Inject(ORCHESTRATION_FEATURE)
    private readonly orchestration?: OrchestrationFeature,

    @Optional()
    @Inject(SKILL_FEATURE)
    private readonly skills?: SkillFeature,

    // ==================== P2 能力下沉：Realtime 特性模块 ====================
    @Optional()
    @Inject(REALTIME_FEATURE)
    private readonly realtime?: RealtimeFeature,

    // ==================== 独立服务（可选）====================
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly teamsService?: TeamsService,
    @Optional() private readonly capabilityResolver?: AICapabilityResolver,
    @Optional()
    @Inject(forwardRef(() => CreditsService))
    private readonly creditsService?: CreditsService,
    @Optional() private readonly modelFallbackService?: ModelFallbackService,
  ) {
    this.logger.log("AIEngineFacade initialized");
    this.logFeatureAvailability();
  }

  /**
   * 记录可用特性
   */
  private logFeatureAvailability(): void {
    const features = {
      memory: !!this.memory,
      tools: !!this.tools,
      orchestration: !!this.orchestration,
      skills: !!this.skills,
      realtime: !!this.realtime,
      database: !!this.prisma,
      teams: !!this.teamsService,
      capabilities: !!this.capabilityResolver,
      credits: !!this.creditsService,
    };

    this.logger.log(
      `Available features: ${Object.entries(features)
        .filter(([_, enabled]) => enabled)
        .map(([name]) => name)
        .join(", ")}`,
    );
  }

  // ==================== LLM 能力 ====================

  /**
   * 统一对话入口（带熔断器保护）
   *
   * ★ P0 增强：内置熔断器，自动处理模型故障和限速
   * ★ K3 Fix: 支持自动注入 Skills（当 domain/taskType 参数存在时）
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    // K3 Fix: 如果提供了 domain 或 taskType，自动委托给 chatWithSkills
    if ((request.domain || request.taskType) && this.skills) {
      this.logger.debug(
        `[chat] K3 Fix: Auto-delegating to chatWithSkills (domain=${request.domain}, taskType=${request.taskType})`,
      );
      const skillResponse = await this.chatWithSkills({
        messages: request.messages,
        modelType: request.modelType,
        model: request.model,
        taskProfile: request.taskProfile || {
          creativity: "medium",
          outputLength: "standard",
        },
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        strictMode: request.strictMode,
        domain: request.domain || "common",
        taskType: request.taskType || "general",
        additionalSkills: request.additionalSkills,
        skillContext: request.skillContext,
      });
      return {
        content: skillResponse.content,
        model: skillResponse.model,
        tokensUsed: skillResponse.tokensUsed,
        isError: skillResponse.isError,
      };
    }

    const modelId = request.model || request.modelType || "default";
    const entityId = `chat:${modelId}`;

    this.logger.debug(
      `[chat] modelType=${request.modelType}, messages=${request.messages.length}`,
    );

    // ★ 自动模型 fallback：使用 ModelFallbackService 自动切换失败模型
    if (this.modelFallbackService) {
      return this.chatWithFallback(request, modelId);
    }

    // Fallback 不可用时，使用单模型调用（保持向后兼容）
    return this.chatSingleModel(request, modelId, entityId);
  }

  /**
   * ★ 核心改进：通过 ModelFallbackService 自动切换模型
   * 当模型返回 INVALID_API_KEY、QUOTA_EXCEEDED 等不可恢复错误时，自动尝试下一个可用模型
   */
  private async chatWithFallback(
    request: ChatRequest,
    preferredModelId: string,
  ): Promise<ChatResponse> {
    const startTime = Date.now();

    const fallbackResult = await this.modelFallbackService!.executeWithFallback(
      preferredModelId,
      async (modelConfig) => {
        // 使用 fallback 提供的 modelConfig 调用 chat
        const result = await this.aiChatService.chat({
          messages: request.messages,
          systemPrompt: request.systemPrompt,
          modelType: request.modelType || AIModelType.CHAT,
          taskProfile: request.taskProfile,
          model: modelConfig.modelId,
          maxTokens: request.maxTokens,
          temperature: request.temperature,
          strictMode: true, // fallback 模式下使用严格模式，让错误冒泡给 fallback 处理
          userId: request.billing?.userId ?? RequestContext.getUserId(), // ★ BYOK: 传递 userId 用于 Key 优先级解析
        });

        if (result.isError) {
          throw new Error(result.content);
        }

        return result;
      },
      {
        modelType: request.modelType || AIModelType.CHAT,
        operation: "facade_chat",
        maxRetries: 1,
        maxModelSwitches: 3,
      },
    );

    const duration = Date.now() - startTime;

    if (fallbackResult.fallbackUsed) {
      this.logger.warn(
        `[chat] Model fallback used: ${fallbackResult.attemptedModels.join(" → ")} (${fallbackResult.attempts} attempts, ${duration}ms)`,
      );
    }

    if (fallbackResult.success && fallbackResult.data) {
      const result = fallbackResult.data;
      const tokensUsed = result.usage?.totalTokens || 0;

      // 熔断器记录成功
      const entityId = `chat:${result.model}`;
      this.orchestration?.circuitBreaker?.recordSuccess(entityId, duration);

      // ★ 自动积分扣除（BYOK: 用户自用 Key 不扣积分）
      await this.handleBilling(
        request,
        result.apiKeySource,
        tokensUsed,
        result.model,
      );

      this.logger.log(
        `[chat] Completed in ${duration}ms, model=${result.model}, tokens=${tokensUsed}${fallbackResult.fallbackUsed ? " (fallback)" : ""}`,
      );

      return {
        content: result.content,
        model: result.model,
        tokensUsed,
        isError: false,
      };
    }

    // 所有模型都失败
    const errorMsg = fallbackResult.error?.message || "All models failed";
    this.logger.error(
      `[chat] All models failed after ${duration}ms (tried: ${fallbackResult.attemptedModels.join(", ")}): ${errorMsg}`,
    );

    if (request.strictMode) {
      throw new Error(errorMsg);
    }

    return {
      content: `Error: ${errorMsg}`,
      model: fallbackResult.modelUsed || preferredModelId,
      tokensUsed: 0,
      isError: true,
    };
  }

  /**
   * 单模型调用（fallback 不可用时的后备路径）
   */
  private async chatSingleModel(
    request: ChatRequest,
    modelId: string,
    entityId: string,
  ): Promise<ChatResponse> {
    // 熔断器检查
    if (
      this.orchestration?.circuitBreaker &&
      !this.orchestration?.circuitBreaker.canExecute(entityId)
    ) {
      const cooldown =
        this.orchestration?.circuitBreaker.getCooldownRemaining(entityId);
      this.logger.warn(
        `[chat] Circuit breaker OPEN for ${entityId}, cooldown=${cooldown}ms`,
      );
      return {
        content: `Service temporarily unavailable. Please try again in ${Math.ceil(cooldown / 1000)} seconds.`,
        model: modelId,
        tokensUsed: 0,
        isError: true,
      };
    }

    const startTime = Date.now();

    try {
      this.orchestration?.circuitBreaker?.incrementLoad(entityId);

      const result = await this.aiChatService.chat({
        messages: request.messages,
        systemPrompt: request.systemPrompt,
        modelType: request.modelType || AIModelType.CHAT,
        taskProfile: request.taskProfile,
        model: request.model,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        strictMode: request.strictMode,
        userId: request.billing?.userId ?? RequestContext.getUserId(), // ★ BYOK: 传递 userId
      });

      const duration = Date.now() - startTime;

      if (!result.isError) {
        this.orchestration?.circuitBreaker?.recordSuccess(entityId, duration);
      } else {
        this.orchestration?.circuitBreaker?.recordFailure(
          entityId,
          TaskCompletionType.API_ERROR,
          result.content.slice(0, 100),
        );
      }

      const tokensUsed = result.usage?.totalTokens || 0;

      // ★ BYOK: 用户自用 Key 不扣积分
      if (!result.isError) {
        await this.handleBilling(
          request,
          result.apiKeySource,
          tokensUsed,
          result.model,
        );
      }

      return {
        content: result.content,
        model: result.model,
        tokensUsed,
        isError: result.isError,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      const errorType =
        this.orchestration?.circuitBreaker?.parseErrorType(errorMsg) ||
        TaskCompletionType.API_ERROR;
      this.orchestration?.circuitBreaker?.recordFailure(
        entityId,
        errorType,
        errorMsg,
      );

      this.logger.error(`[chat] Failed after ${duration}ms: ${errorMsg}`);

      if (request.strictMode) {
        throw error;
      }

      return {
        content: `Error: ${errorMsg}`,
        model: modelId,
        tokensUsed: 0,
        isError: true,
      };
    } finally {
      this.orchestration?.circuitBreaker?.decrementLoad(entityId);
    }
  }

  private resolveBillingFromContext(): CreditBillingInfo | undefined {
    const ctx = BillingContext.get();
    if (ctx) {
      return {
        userId: ctx.userId,
        moduleType: ctx.moduleType,
        operationType: ctx.operationType,
        referenceId: ctx.referenceId,
        description: ctx.description,
      };
    }

    // ★ BYOK: BillingContext 为空时（公共端点），从 RequestContext 获取 userId
    const userId = RequestContext.getUserId();
    if (!userId) return undefined;
    return {
      userId,
      moduleType: "ai-engine",
      operationType: "chat",
    };
  }

  /**
   * ★ BYOK: 统一积分扣除逻辑
   * 用户自用 Key (personal) 不扣积分
   */
  private async handleBilling(
    request: ChatRequest,
    apiKeySource: string | undefined,
    tokensUsed: number,
    modelName: string,
  ): Promise<void> {
    if (apiKeySource === "personal") {
      this.logger.debug(`[Billing] Skipped: user is using personal API key`);
      return;
    }
    const billing = request.billing ?? this.resolveBillingFromContext();
    if (!billing || !this.creditsService) return;
    try {
      await this.creditsService.consumeCredits({
        userId: billing.userId,
        moduleType: billing.moduleType,
        operationType: billing.operationType,
        tokenCount: tokensUsed,
        modelName,
        referenceId: billing.referenceId,
        description: billing.description,
      });
    } catch (creditError) {
      this.logger.warn(`[Billing] Failed to deduct credits: ${creditError}`);
    }
  }

  /**
   * ★ 新增：带 Skills 的对话
   *
   * 根据任务类型自动加载对应的 SKILL.md 文件，组装 System Prompt
   * 实现 Token 优化（按需加载，节省 60-70% System Prompt Token）
   */
  async chatWithSkills(
    request: ChatWithSkillsRequest,
  ): Promise<ChatWithSkillsResponse> {
    this.logger.log(
      `[Skills] ════════════════════════════════════════════════════════`,
    );
    this.logger.log(
      `[Skills] 🚀 chatWithSkills START: taskType="${request.taskType}", domain="${request.domain}"`,
    );

    // 检查 Skills 服务是否可用
    if (!this.skills?.loader || !this.skills?.promptBuilder) {
      this.logger.warn(
        "[Skills] ⚠️ Skills services not available, falling back to plain chat",
      );
      // 降级到普通 chat
      const result = await this.chat({
        messages: request.messages,
        modelType: request.modelType as AIModelType,
        model: request.model,
        taskProfile: request.taskProfile,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        strictMode: request.strictMode,
      });

      return {
        content: result.content,
        model: result.model,
        tokensUsed: result.tokensUsed,
        isError: result.isError,
        usedSkills: [],
        skillsTokensUsed: 0,
      };
    }

    // 1. 加载匹配的 Skills
    this.logger.log(`[Skills] Step 1: Loading skills for task...`);
    const skills = await this.skills?.loader.getSkillsForTask({
      taskType: request.taskType,
      domain: request.domain,
      additionalSkillIds: request.additionalSkills,
      maxTokenBudget: 4000, // 默认 Skills Token 预算
    });

    // 2. 组装 System Prompt
    this.logger.log(`[Skills] Step 2: Building System Prompt...`);
    const buildResult = this.skills?.promptBuilder.buildSystemPrompt(skills, {
      context: request.skillContext,
      maxTokens: 4000,
      includeMetadata: false,
    });

    // 3. 构建消息列表（Skills System Prompt + 原始消息）
    const messagesWithSkills = [
      ...(buildResult.prompt
        ? [{ role: "system" as const, content: buildResult.prompt }]
        : []),
      ...request.messages,
    ];

    // 4. 调用底层 chat 方法
    this.logger.log(
      `[Skills] Step 3: Calling LLM with ${messagesWithSkills.length} messages...`,
    );
    const result = await this.chat({
      messages: messagesWithSkills,
      modelType: request.modelType as AIModelType,
      model: request.model,
      taskProfile: request.taskProfile,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
      strictMode: request.strictMode,
    });

    // 5. 输出完成报告
    this.logger.log(
      `[Skills] ✅ chatWithSkills COMPLETE: ${buildResult.usedSkills.length} skills, ${buildResult.estimatedTokens} skill tokens, ${result.tokensUsed} total tokens`,
    );
    this.logger.log(
      `[Skills]   └─ Skills used: [${buildResult.usedSkills.join(", ")}]`,
    );
    this.logger.log(
      `[Skills] ════════════════════════════════════════════════════════`,
    );

    return {
      content: result.content,
      model: result.model,
      tokensUsed: result.tokensUsed,
      isError: result.isError,
      usedSkills: buildResult.usedSkills,
      skillsTokensUsed: buildResult.estimatedTokens,
    };
  }

  /**
   * 流式对话
   * ★ P2.1.1：实现真正的 SSE 流式输出
   *
   * 支持 OpenAI 兼容格式和 Anthropic Claude 的流式响应
   */
  async *chatStream(
    request: ChatRequest,
  ): AsyncGenerator<
    { content: string; done: boolean; error?: string },
    void,
    unknown
  > {
    this.logger.debug(
      `[chatStream] modelType=${request.modelType}, messages=${request.messages.length}`,
    );

    const modelId = request.model || request.modelType || "default";
    const entityId = `chat:${modelId}`;

    // 熔断器检查
    if (
      this.orchestration?.circuitBreaker &&
      !this.orchestration?.circuitBreaker.canExecute(entityId)
    ) {
      const cooldown =
        this.orchestration?.circuitBreaker.getCooldownRemaining(entityId);
      this.logger.warn(
        `[chatStream] Circuit breaker OPEN for ${entityId}, cooldown=${cooldown}ms`,
      );
      yield {
        content: `Service temporarily unavailable. Please try again in ${Math.ceil(cooldown / 1000)} seconds.`,
        done: true,
        error: "CIRCUIT_BREAKER_OPEN",
      };
      return;
    }

    try {
      // 增加负载计数
      this.orchestration?.circuitBreaker?.incrementLoad(entityId);

      // 使用 AiChatService 的真正流式输出
      let streamApiKeySource: string | undefined;
      for await (const chunk of this.aiChatService.chatStream({
        messages: request.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        model: request.model,
        modelType: request.modelType,
        taskProfile: request.taskProfile,
        systemPrompt: request.systemPrompt,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        userId: request.billing?.userId ?? RequestContext.getUserId(), // ★ BYOK: 传递 userId
      })) {
        // 捕获 apiKeySource（在最终 chunk 中携带）
        if (chunk.apiKeySource) {
          streamApiKeySource = chunk.apiKeySource;
        }
        yield { content: chunk.content, done: chunk.done, error: chunk.error };

        // 如果有错误，记录失败
        if (chunk.error) {
          this.orchestration?.circuitBreaker?.recordFailure(
            entityId,
            TaskCompletionType.API_ERROR,
            chunk.error,
          );
        }
      }

      // 流式完成，记录成功
      this.orchestration?.circuitBreaker?.recordSuccess(entityId, 0);

      // ★ BYOK: 流式完成后积分扣除
      await this.handleBilling(
        request,
        streamApiKeySource,
        0,
        request.model || "unknown",
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.orchestration?.circuitBreaker?.recordFailure(
        entityId,
        TaskCompletionType.API_ERROR,
        errorMsg,
      );

      this.logger.error(`[chatStream] Stream failed: ${errorMsg}`);
      yield { content: "", done: true, error: errorMsg };
    } finally {
      // 减少负载计数
      this.orchestration?.circuitBreaker?.decrementLoad(entityId);
    }
  }

  /**
   * ★ P0 新增：智能模型选择
   *
   * 根据条件选择最佳模型：
   * - 考虑熔断器状态（排除不可用模型）
   * - 考虑负载均衡（优先选择低负载模型）
   * - 考虑推理需求（自动选择推理模型）
   */
  async selectModel(
    options: ModelSelectionOptions = {},
  ): Promise<ModelInfo | null> {
    this.logger.log(
      `[selectModel] Starting selection with options=${JSON.stringify(options)}`,
    );

    const models = await this.getAvailableModelsExtended(
      options.modelType || AIModelType.CHAT,
    );

    this.logger.log(
      `[selectModel] Found ${models.length} models: ${models.map((m) => `${m.id}(reasoning=${m.isReasoning})`).join(", ")}`,
    );

    if (models.length === 0) {
      this.logger.error("[selectModel] No models available!");
      return null;
    }

    // 过滤条件
    let candidates = models;

    // 1. 过滤推理模型
    if (options.requireReasoning) {
      const reasoningModels = candidates.filter((m) => m.isReasoning);
      this.logger.log(
        `[selectModel] Reasoning filter: found ${reasoningModels.length} reasoning models`,
      );
      if (reasoningModels.length === 0) {
        this.logger.warn(
          "[selectModel] No reasoning models found, falling back to all models",
        );
        // 保持 candidates = models，不过滤
      } else {
        candidates = reasoningModels;
      }
    }

    // 2. 过滤提供商
    if (options.preferredProvider) {
      const preferred = candidates.filter(
        (m) =>
          m.provider.toLowerCase() === options.preferredProvider?.toLowerCase(),
      );
      if (preferred.length > 0) {
        candidates = preferred;
        this.logger.debug(
          `[selectModel] Provider filter: ${candidates.length} candidates for ${options.preferredProvider}`,
        );
      }
    }

    // 2.5 过滤模型黑名单（不可恢复错误如 Invalid API Key）
    if (this.modelFallbackService) {
      const unblocked = candidates.filter(
        (m) => !this.modelFallbackService!.isModelBlocked(m.id),
      );
      if (unblocked.length > 0) {
        if (unblocked.length < candidates.length) {
          const blocked = candidates
            .filter((m) => this.modelFallbackService!.isModelBlocked(m.id))
            .map((m) => m.id);
          this.logger.warn(
            `[selectModel] Filtered blocked models: ${blocked.join(", ")}`,
          );
        }
        candidates = unblocked;
      } else {
        this.logger.warn(
          "[selectModel] All candidates blocked, keeping original list as fallback",
        );
      }
    }

    // 3. 过滤 maxTokens
    if (options.minMaxTokens) {
      const filtered = candidates.filter(
        (m) => (m.maxTokens || 0) >= (options.minMaxTokens || 0),
      );
      if (filtered.length > 0) {
        candidates = filtered;
      }
    }

    // 4. 考虑熔断器状态选择最佳模型
    if (this.orchestration?.circuitBreaker) {
      const entityIds = candidates.map((m) => `chat:${m.id}`);
      const bestEntityId =
        this.orchestration?.circuitBreaker.selectBest(entityIds);

      if (bestEntityId) {
        const modelId = bestEntityId.replace("chat:", "");
        const selected = candidates.find((m) => m.id === modelId);
        if (selected) {
          this.logger.log(
            `[selectModel] Selected ${modelId} via circuit breaker`,
          );
          return selected;
        }
      }
    }

    // 5. 默认返回第一个可用的
    const selected = candidates[0] || null;
    this.logger.log(`[selectModel] Selected ${selected?.id || "NONE"}`);
    return selected;
  }

  /**
   * ★ P0 新增：获取推理模型
   *
   * 快捷方法，获取可用的推理模型（o1, o3, deepseek-r1 等）
   */
  async getReasoningModel(): Promise<ModelInfo | null> {
    return this.selectModel({ requireReasoning: true });
  }

  /**
   * ★ P0 新增：获取扩展的模型信息
   */
  async getAvailableModelsExtended(
    modelType: AIModelType = AIModelType.CHAT,
  ): Promise<ModelInfo[]> {
    this.logger.debug(
      `[getAvailableModelsExtended] Querying models with modelType=${modelType}`,
    );

    // ★ 统一委托给 AiModelConfigService
    const models =
      await this.modelConfigService.getAllEnabledModelsByType(modelType);

    this.logger.log(
      `[getAvailableModelsExtended] Found ${models.length} models`,
    );

    return models.map((m) => {
      const isReasoning =
        m.isReasoning ?? this.aiChatService.isReasoningModel(m.modelId);
      const isBlocked =
        this.modelFallbackService?.isModelBlocked(m.modelId) ?? false;
      const isAvailable =
        !isBlocked &&
        (this.orchestration?.circuitBreaker?.canExecute(`chat:${m.modelId}`) ??
          true);

      return {
        id: m.modelId,
        dbId: m.id,
        name: m.displayName || m.modelId,
        provider: m.provider,
        isReasoning,
        isAvailable,
        maxTokens: m.maxTokens,
        icon: undefined, // AiModelConfigService 不返回 icon，后续可扩展
        isDefault: m.isDefault,
      };
    });
  }

  /**
   * 获取可用模型列表
   *
   * 返回简化的模型信息，包含 UI 显示所需的字段
   */
  async getAvailableModels(modelType: AIModelType = AIModelType.CHAT): Promise<
    Array<{
      id: string;
      dbId?: string;
      name: string;
      provider: string;
      icon?: string | null;
      isDefault?: boolean;
    }>
  > {
    this.logger.debug(`[getAvailableModels] modelType=${modelType}`);

    // ★ 统一委托给 AiModelConfigService
    const models =
      await this.modelConfigService.getEnabledModelsForFrontend(modelType);

    return models.map((m) => ({
      id: m.modelId,
      dbId: m.id,
      name: m.name,
      provider: m.provider,
      icon: m.icon,
      isDefault: m.isDefault,
    }));
  }

  // ==================== 模型配置获取（供 AI Apps 使用）====================

  /**
   * ★ 获取默认文本模型配置
   *
   * 供 AI Apps 获取默认 CHAT 模型，无需直接访问 prisma.aIModel
   * 内部已处理 Secret Manager 支持
   */
  async getDefaultTextModel(): Promise<{
    id: string;
    modelId: string;
    displayName: string;
    provider: string;
    maxTokens?: number;
  } | null> {
    const config = await this.aiChatService.getDefaultModelByType(
      AIModelType.CHAT,
    );
    if (!config) return null;
    return {
      id: config.id || config.modelId,
      modelId: config.modelId,
      displayName: config.displayName || config.modelId,
      provider: config.provider,
      maxTokens: config.maxTokens,
    };
  }

  /**
   * ★ 获取默认图像生成模型配置
   *
   * 供 AI Apps 获取默认 IMAGE_GENERATION 模型
   */
  async getDefaultImageModel(): Promise<{
    id: string;
    modelId: string;
    displayName: string;
    provider: string;
    maxTokens?: number;
  } | null> {
    const config = await this.aiChatService.getDefaultModelByType(
      AIModelType.IMAGE_GENERATION,
    );
    if (!config) return null;
    return {
      id: config.id || config.modelId,
      modelId: config.modelId,
      displayName: config.displayName || config.modelId,
      provider: config.provider,
      maxTokens: config.maxTokens,
    };
  }

  /**
   * ★ 根据模型 ID 获取模型配置
   *
   * 供 AI Apps 根据 modelId 获取完整配置，无需直接访问数据库
   * API Key 由 aiChatService.chat() 内部处理，不对外暴露
   *
   * ★ 返回 isReasoning 字段，用于判断是否为推理模型（o1/o3/gpt-5 等）
   */
  async getModelById(idOrModelId: string): Promise<{
    id: string;
    modelId: string;
    displayName: string;
    provider: string;
    maxTokens?: number;
    apiEndpoint?: string;
    isReasoning?: boolean;
    // ★ 额外字段：支持非 CHAT 类型模型（如 IMAGE_GENERATION）
    apiKey?: string | null;
    secretKey?: string | null;
    modelType?: string;
  } | null> {
    // ★ 统一委托给 AiModelConfigService
    const config = await this.modelConfigService.getModelById(idOrModelId);

    if (!config) return null;

    return {
      id: config.id,
      modelId: config.modelId,
      displayName: config.displayName || config.modelId,
      provider: config.provider,
      maxTokens: config.maxTokens,
      apiEndpoint: config.apiEndpoint,
      isReasoning: config.isReasoning ?? false,
      // ★ 额外字段供 ImageGenerationService 等使用
      apiKey: config.apiKey,
      secretKey: config.secretKey,
    };
  }

  /**
   * ★ 获取完整模型配置（包含 apiKey 和 secretKey）
   *
   * 用于需要访问 API 密钥的场景（如图片生成服务）
   * 注意：此方法返回敏感信息，仅供后端服务内部使用
   */
  async getFullModelConfig(modelId: string): Promise<{
    id: string;
    modelId: string;
    displayName: string;
    name: string;
    provider: string;
    apiKey: string;
    secretKey?: string | null;
    apiEndpoint?: string | null;
    maxTokens?: number | null;
    temperature?: number | null;
    isEnabled: boolean;
    isDefault: boolean;
    isReasoning?: boolean;
    apiFormat?: string | null;
    supportsTemperature?: boolean;
    supportsStreaming?: boolean;
    supportsFunctionCalling?: boolean;
    supportsVision?: boolean;
    tokenParamName?: string | null;
    defaultTimeoutMs?: number | null;
    priceInputPerMillion?: number | null;
    priceOutputPerMillion?: number | null;
    priority?: number | null;
  } | null> {
    // ★ 统一委托给 AiModelConfigService
    const config = await this.modelConfigService.getModelById(modelId);

    if (!config) return null;

    this.logger.debug(
      `[getFullModelConfig] Found model ${config.modelId} via AiModelConfigService`,
    );
    return {
      id: config.id || config.modelId,
      modelId: config.modelId,
      displayName: config.displayName || config.modelId,
      name: config.name || config.modelId,
      provider: config.provider,
      apiKey: config.apiKey || "",
      secretKey: config.secretKey || null,
      apiEndpoint: config.apiEndpoint || null,
      maxTokens: config.maxTokens || null,
      temperature: config.temperature || null,
      isEnabled: config.isEnabled ?? true,
      isDefault: config.isDefault ?? false,
      isReasoning: config.isReasoning ?? false,
      apiFormat: config.apiFormat || null,
      supportsTemperature: config.supportsTemperature ?? true,
      supportsStreaming: config.supportsStreaming ?? false,
      supportsFunctionCalling: config.supportsFunctionCalling ?? false,
      supportsVision: config.supportsVision ?? false,
      tokenParamName: config.tokenParamName || null,
      defaultTimeoutMs: config.defaultTimeoutMs || null,
      priceInputPerMillion: config.priceInputPerMillion || null,
      priceOutputPerMillion: config.priceOutputPerMillion || null,
      priority: config.priority || null,
    };
  }

  /**
   * ★ 根据模型类型获取默认模型配置
   *
   * 支持 CHAT, IMAGE_GENERATION, EMBEDDING 等类型
   */
  async getDefaultModelByType(modelType: AIModelType): Promise<{
    id: string;
    modelId: string;
    displayName: string;
    provider: string;
    maxTokens?: number;
  } | null> {
    const config = await this.aiChatService.getDefaultModelByType(modelType);
    if (!config) return null;
    return {
      id: config.id || config.modelId,
      modelId: config.modelId,
      displayName: config.displayName || config.modelId,
      provider: config.provider,
      maxTokens: config.maxTokens,
    };
  }

  // ==================== 搜索能力 ====================

  /**
   * 创建工具执行上下文
   */
  private createToolContext(toolId: string): ToolContext {
    return {
      executionId: `${toolId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      toolId,
      createdAt: new Date(),
      callerType: "orchestrator",
    };
  }

  /**
   * 智能搜索
   *
   * ============================================================================
   * ARCHITECTURE NOTE
   * ============================================================================
   * 本方法是 AI Apps 调用搜索的统一入口。
   *
   * 实现方式：
   * - 通过 ToolRegistry 调用 web-search Tool
   * - web-search Tool 内部使用 SearchService
   *
   * 分层设计：
   *   AI Apps (Research, Ask, etc.)
   *         ↓
   *   AIEngineFacade.search()  ← 你在这里
   *         ↓
   *   web-search Tool (ToolRegistry)
   *         ↓
   *   SearchService (底层实现)
   *
   * 为什么保留 SearchService？
   * - 底层服务（如 DeepResearchAgent）需要直接访问搜索能力
   * - SearchService 提供更多底层配置选项
   * - 遵循分层架构：Facade → Tool → Service
   * ============================================================================
   */
  async search(request: SearchRequest): Promise<SearchResponse> {
    this.logger.debug(
      `[search] query="${request.query}", maxResults=${request.maxResults}`,
    );

    // ★ 优先通过 ToolRegistry 调用 web-search 工具
    const webSearchTool = this.tools?.registry?.tryGet("web-search");
    if (webSearchTool) {
      try {
        const toolResult = await webSearchTool.execute(
          { query: request.query, numResults: request.maxResults || 5 },
          this.createToolContext("web-search"),
        );

        if (toolResult.success && toolResult.data) {
          const searchData = toolResult.data as {
            results: Array<{
              title: string;
              url: string;
              content: string;
              score?: number;
              publishedDate?: string;
              domain?: string;
            }>;
            success: boolean;
            error?: string;
          };

          const items: SearchResultItem[] = (searchData.results || []).map(
            (r) => ({
              title: r.title,
              url: r.url,
              content: r.content,
              score: r.score,
              publishedDate: r.publishedDate,
              domain: r.domain,
            }),
          );

          return {
            success: searchData.success,
            results: items,
            error: searchData.error,
          };
        }
      } catch (error) {
        this.logger.warn(
          `[search] ToolRegistry search failed, falling back to SearchService: ${error}`,
        );
      }
    }

    // ★ ToolRegistry 不可用时返回错误
    return {
      success: false,
      results: [],
      error: "Search tool not available via ToolRegistry",
    };
  }

  /**
   * 格式化搜索结果为上下文
   */
  formatSearchResultsForContext(results: SearchResultItem[]): string {
    return results
      .map(
        (r, i) => `[${i + 1}] **${r.title}**\n${r.content}\nSource: ${r.url}`,
      )
      .join("\n\n");
  }

  // ==================== 团队协作能力 ====================

  /**
   * 启动团队任务
   */
  async startTeamMission(request: {
    teamType: TeamType | string;
    teamConfig?: TeamConfig;
    missionInput: MissionInput;
    progressCallback?: ProgressCallback;
  }): Promise<MissionResult> {
    if (!this.teamsService) {
      this.logger.warn("[startTeamMission] TeamsService not available");
      return {
        success: false,
        output: null,
        error: "TeamsService not available",
      };
    }

    this.logger.debug(
      `[startTeamMission] teamType=${request.teamType}, goal="${request.missionInput.goal}"`,
    );

    const teamId = this.mapTeamTypeToId(request.teamType);

    const createDto: CreateMissionDto = {
      teamId,
      goal: request.missionInput.goal,
      context: request.missionInput.context,
      userId: request.missionInput.userId,
      sessionId: request.missionInput.sessionId,
      metadata: request.missionInput.metadata,
    };

    try {
      // 执行任务
      const missionId = await this.teamsService.executeMission(createDto);

      // 轮询等待任务完成
      const result = await this.waitForMissionCompletion(
        missionId,
        request.progressCallback,
      );

      return result;
    } catch (error) {
      this.logger.error(`[startTeamMission] Failed: ${error}`);
      return {
        success: false,
        output: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 等待任务完成
   */
  private async waitForMissionCompletion(
    missionId: string,
    progressCallback?: ProgressCallback,
    timeoutMs: number = 300000, // 5 分钟超时
    pollIntervalMs: number = 1000,
  ): Promise<MissionResult> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = this.getMissionStatus(missionId);

      if (!status) {
        return {
          success: false,
          output: null,
          error: `Mission ${missionId} not found`,
        };
      }

      // 发送进度回调
      if (progressCallback) {
        progressCallback({
          missionId,
          phase: status.currentPhase || status.status,
          progress: status.progress,
          message: `Status: ${status.status}`,
        });
      }

      // 检查是否完成
      if (status.status === "completed") {
        return {
          success: true,
          output: { missionId, status: "completed" },
          summary: "Mission completed successfully",
          executionTime: Date.now() - startTime,
        };
      }

      if (status.status === "failed") {
        return {
          success: false,
          output: null,
          error: status.error || "Mission failed",
          executionTime: Date.now() - startTime,
        };
      }

      if (status.status === "cancelled") {
        return {
          success: false,
          output: null,
          error: "Mission was cancelled",
          executionTime: Date.now() - startTime,
        };
      }

      // 等待后继续轮询
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    // 超时
    return {
      success: false,
      output: null,
      error: `Mission ${missionId} timed out after ${timeoutMs}ms`,
      executionTime: timeoutMs,
    };
  }

  /**
   * 取消团队任务
   */
  cancelMission(missionId: string): boolean {
    if (!this.teamsService) {
      this.logger.warn("[cancelMission] TeamsService not available");
      return false;
    }

    this.logger.debug(`[cancelMission] missionId=${missionId}`);
    return this.teamsService.cancelMission(missionId);
  }

  /**
   * 获取任务状态
   */
  getMissionStatus(missionId: string): MissionStatus | null {
    if (!this.teamsService) {
      return null;
    }

    return this.teamsService.getMissionStatus(missionId);
  }

  /**
   * 映射团队类型到团队 ID
   */
  private mapTeamTypeToId(teamType: TeamType | string): TeamId {
    const mapping: Record<string, TeamId> = {
      research: "research-team",
      debate: "debate-team",
      review: "review-team",
      report: "report-team",
    };
    return mapping[teamType] || teamType;
  }

  // ==================== 上下文能力 ====================

  /**
   * 构建上下文
   */
  async buildContext(request: BuildContextRequest): Promise<string> {
    this.logger.debug(
      `[buildContext] sources=${request.sources.length}, maxTokens=${request.maxTokens}`,
    );

    const parts: string[] = [];

    for (const source of request.sources) {
      switch (source.type) {
        case "custom":
          if (source.content) {
            parts.push(source.content);
          }
          break;

        case "memory":
          if (source.id && this.memory?.shortTerm) {
            const memory = await this.memory?.shortTerm.getWithSession(
              source.id,
              "context",
            );
            if (memory && typeof memory === "string") {
              parts.push(`## Recent Memory\n${memory}`);
            }
          }
          break;

        case "search":
          if (source.content) {
            const searchResult = await this.search({
              query: source.content,
              maxResults: 5,
            });
            if (searchResult.success && searchResult.results.length > 0) {
              parts.push(
                this.formatSearchResultsForContext(searchResult.results),
              );
            }
          }
          break;

        case "topic":
          if (source.id && this.prisma) {
            const topic = await this.prisma.researchTopic.findUnique({
              where: { id: source.id },
              include: {
                dimensions: true,
              },
            });
            if (topic) {
              let topicContext = `## Research Topic: ${topic.name}\n`;
              topicContext += `Type: ${topic.type}\n`;
              if (topic.description) {
                topicContext += `Description: ${topic.description}\n`;
              }
              if (topic.dimensions && topic.dimensions.length > 0) {
                topicContext += `\nDimensions:\n`;
                for (const dim of topic.dimensions) {
                  topicContext += `- ${dim.name}: ${dim.description || "No description"}\n`;
                }
              }
              parts.push(topicContext);
            }
          }
          break;

        case "resource":
          if (source.id && this.prisma) {
            const resource = await this.prisma.resource.findUnique({
              where: { id: source.id },
            });
            if (resource) {
              let resourceContext = `## Resource: ${resource.title}\n`;
              if (resource.aiSummary) {
                resourceContext += `Summary: ${resource.aiSummary}\n`;
              }
              if (resource.content) {
                // 截取前 2000 字符
                const text =
                  resource.content.length > 2000
                    ? resource.content.substring(0, 2000) + "..."
                    : resource.content;
                resourceContext += `\nContent:\n${text}`;
              }
              parts.push(resourceContext);
            }
          }
          break;

        default:
          if (source.content) {
            parts.push(source.content);
          }
      }
    }

    let context = parts.join("\n\n---\n\n");

    // Token 限制处理
    if (request.maxTokens && request.compress) {
      const estimatedTokens = this.estimateTokens(context);
      if (estimatedTokens > request.maxTokens) {
        context = this.compressContext(context, request.maxTokens);
      }
    }

    return context;
  }

  /**
   * 估算 token 数量
   */
  private estimateTokens(text: string): number {
    // 中文每字约 2 token，英文每 4 字符约 1 token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars * 2 + otherChars / 4);
  }

  /**
   * 压缩上下文到指定 token 数
   */
  private compressContext(context: string, maxTokens: number): string {
    const currentTokens = this.estimateTokens(context);
    if (currentTokens <= maxTokens) {
      return context;
    }

    // 计算需要保留的比例
    const ratio = maxTokens / currentTokens;
    const targetLength = Math.floor(context.length * ratio * 0.9); // 留 10% 余量

    // 优先保留开头和结尾
    const headLength = Math.floor(targetLength * 0.6);
    const tailLength = Math.floor(targetLength * 0.3);

    const head = context.substring(0, headLength);
    const tail = context.substring(context.length - tailLength);

    return `${head}\n\n[... content compressed ...]\n\n${tail}`;
  }

  // ==================== 约束能力 ====================

  /**
   * 检查约束
   */
  checkConstraints(request: {
    content: string;
    constraints: ConstraintConfig;
  }): ConstraintResult {
    this.logger.debug(
      `[checkConstraints] contentLength=${request.content.length}`,
    );

    const violations: Array<{
      type: "token_limit" | "content_filter" | "json_schema";
      message: string;
    }> = [];

    // 1. 检查 token 限制
    if (request.constraints.maxTokens) {
      const estimatedTokens = this.estimateTokens(request.content);
      if (estimatedTokens > request.constraints.maxTokens) {
        violations.push({
          type: "token_limit",
          message: `Content exceeds token limit: ${estimatedTokens} > ${request.constraints.maxTokens}`,
        });
      }
    }

    // 2. 内容过滤（敏感信息检测）
    if (request.constraints.contentFilter?.enabled) {
      for (const pattern of SENSITIVE_PATTERNS) {
        if (pattern.test(request.content)) {
          violations.push({
            type: "content_filter",
            message: `Content contains potentially sensitive information matching pattern: ${pattern.source}`,
          });
        }
      }

      // 自定义规则
      if (request.constraints.contentFilter.rules) {
        for (const rule of request.constraints.contentFilter.rules) {
          try {
            const regex = new RegExp(rule, "gi");
            if (regex.test(request.content)) {
              violations.push({
                type: "content_filter",
                message: `Content matches custom filter rule: ${rule}`,
              });
            }
          } catch {
            this.logger.warn(`Invalid regex rule: ${rule}`);
          }
        }
      }
    }

    // 3. JSON Schema 验证
    if (request.constraints.jsonSchema) {
      try {
        const parsed = JSON.parse(request.content);
        const schemaValid = this.validateJsonSchema(
          parsed,
          request.constraints.jsonSchema,
        );
        if (!schemaValid) {
          violations.push({
            type: "json_schema",
            message: "Content does not match the required JSON schema",
          });
        }
      } catch {
        violations.push({
          type: "json_schema",
          message: "Content is not valid JSON",
        });
      }
    }

    // 如果有违规，尝试生成调整后的内容
    let adjustedContent: string | undefined;
    if (violations.some((v) => v.type === "token_limit")) {
      adjustedContent = this.compressContext(
        request.content,
        request.constraints.maxTokens || 4000,
      );
    }

    return {
      passed: violations.length === 0,
      violations: violations.length > 0 ? violations : undefined,
      adjustedContent,
    };
  }

  /**
   * 简单的 JSON Schema 验证
   */
  private validateJsonSchema(data: unknown, schema: object): boolean {
    // 基础实现：检查必需字段和类型
    const schemaObj = schema as {
      type?: string;
      required?: string[];
      properties?: Record<string, { type?: string }>;
    };

    if (schemaObj.type === "object" && typeof data !== "object") {
      return false;
    }

    if (schemaObj.type === "array" && !Array.isArray(data)) {
      return false;
    }

    if (schemaObj.required && typeof data === "object" && data !== null) {
      const dataObj = data as Record<string, unknown>;
      for (const field of schemaObj.required) {
        if (!(field in dataObj)) {
          return false;
        }
      }
    }

    return true;
  }

  // ==================== 记忆能力 ====================

  /**
   * 存储记忆
   */
  async storeMemory(request: StoreMemoryRequest): Promise<void> {
    this.logger.debug(
      `[storeMemory] sessionId=${request.sessionId}, type=${request.type}`,
    );

    if (request.type === "short" && this.memory?.shortTerm) {
      await this.memory?.shortTerm.setWithSession(
        request.sessionId,
        "memory",
        request.content,
      );
    } else if (request.type === "long" && this.memory?.longTerm) {
      await this.memory?.longTerm.setWithUser(
        request.sessionId,
        "memory",
        request.content,
      );
    } else {
      this.logger.warn(
        `[storeMemory] Memory service not available for type=${request.type}`,
      );
    }
  }

  /**
   * 检索记忆
   */
  async retrieveMemory(request: RetrieveMemoryRequest): Promise<MemoryItem[]> {
    this.logger.debug(
      `[retrieveMemory] sessionId=${request.sessionId}, topK=${request.topK}`,
    );

    const items: MemoryItem[] = [];

    // 从短期记忆检索
    if (this.memory?.shortTerm) {
      const memory = await this.memory?.shortTerm.getWithSession(
        request.sessionId,
        "memory",
      );
      if (memory) {
        items.push({
          id: `short-${request.sessionId}`,
          content: typeof memory === "string" ? memory : JSON.stringify(memory),
          type: "short",
          createdAt: new Date(),
        });
      }
    }

    // 从长期记忆检索
    if (this.memory?.longTerm && request.query) {
      const results = await this.memory?.longTerm.search(request.query, {
        userId: request.sessionId,
        limit: request.topK,
      });
      for (const result of results) {
        items.push({
          id: result.key,
          content:
            typeof result.value === "string"
              ? result.value
              : JSON.stringify(result.value),
          type: "long",
          score: result.score,
          createdAt: new Date(),
        });
      }
    }

    return items;
  }

  /**
   * 清除记忆
   */
  async clearMemory(sessionId: string): Promise<void> {
    this.logger.debug(`[clearMemory] sessionId=${sessionId}`);

    if (this.memory?.shortTerm) {
      await this.memory?.shortTerm.deleteWithSession(sessionId, "memory");
    }
  }

  // ==================== Agent 执行能力 ====================

  /**
   * ★ P1 新增：执行 Agent 任务
   *
   * 统一的 Agent 执行入口，支持：
   * - 自动重试和熔断器保护
   * - 搜索增强
   * - 任务画像配置
   */
  async executeAgent(
    request: AgentExecutionRequest,
  ): Promise<AgentExecutionResult> {
    this.logger.debug(
      `[executeAgent] agentType=${request.agentType}, task="${request.task.slice(0, 50)}..."`,
    );

    if (!this.orchestration?.agentExecutor) {
      return {
        success: false,
        content: "",
        tokensUsed: 0,
        duration: 0,
        error: "AgentExecutorService not available",
        retryable: false,
      };
    }

    const startTime = Date.now();

    // 构建执行上下文
    const executionContext = {
      missionId:
        (request.metadata?.missionId as string) || `agent-${Date.now()}`,
      topicId: (request.metadata?.topicId as string) || "default",
      task: {
        id: `task-${Date.now()}`,
        title: request.task.slice(0, 100),
        description: request.task,
        assigneeId: request.agentType,
      },
      executor: {
        id: request.agentType,
        agentName: request.agentType,
        displayName: request.agentType,
        aiModel: request.model || "gpt-4o",
        isLeader: false,
        systemPrompt: request.systemPrompt,
      },
      systemPrompt: request.systemPrompt || "You are a helpful AI assistant.",
      userPrompt: request.task,
      searchContext: request.context,
    };

    // 映射 taskProfile 到参数
    const config = {
      maxTokens: request.config?.maxTokens,
      temperature: request.config?.temperature,
      enableSearch: request.config?.enableSearch ?? false,
      maxRetries: request.config?.maxRetries ?? 3,
      timeout: request.config?.timeout,
    };

    // 根据 taskProfile 设置参数
    if (request.taskProfile) {
      const creativityMap: Record<string, number> = {
        deterministic: 0.1,
        low: 0.3,
        medium: 0.7,
        high: 0.9,
      };
      const outputLengthMap: Record<string, number> = {
        minimal: 500,
        short: 1500,
        medium: 4000,
        standard: 6000,
        long: 8000,
        extended: 16000,
      };

      if (!config.temperature && request.taskProfile.creativity) {
        config.temperature =
          creativityMap[request.taskProfile.creativity] || 0.7;
      }
      if (!config.maxTokens && request.taskProfile.outputLength) {
        config.maxTokens =
          outputLengthMap[request.taskProfile.outputLength] || 4000;
      }
    }

    try {
      const result = await this.orchestration?.agentExecutor.executeTask(
        executionContext,
        config,
      );

      return {
        success: result.success,
        content: result.content,
        tokensUsed: result.tokensUsed,
        duration: result.duration,
        error: result.error,
        retryable: result.retryable,
        searchResults: result.searchResults,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `[executeAgent] Failed after ${duration}ms: ${errorMsg}`,
      );

      return {
        success: false,
        content: "",
        tokensUsed: 0,
        duration,
        error: errorMsg,
        retryable: true,
      };
    }
  }

  /**
   * 检查 Agent 是否可用
   */
  isAgentAvailable(agentId: string): boolean {
    if (!this.orchestration?.agentExecutor) {
      return false;
    }
    return this.orchestration?.agentExecutor.isAgentAvailable(agentId);
  }

  // ==================== Tool 执行能力 ====================

  /**
   * ★ P1 新增：执行工具
   *
   * 统一的工具执行入口，支持：
   * - 工具注册表查找
   * - 输入验证
   * - 超时控制
   */
  async executeTool<T = unknown>(
    request: ToolExecutionRequest,
  ): Promise<ToolExecutionResult<T>> {
    const executionId = `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();

    this.logger.debug(
      `[executeTool] toolId=${request.toolId}, executionId=${executionId}`,
    );

    if (!this.tools?.registry) {
      return {
        success: false,
        error: {
          code: "TOOL_REGISTRY_NOT_AVAILABLE",
          message: "ToolRegistry not available",
          retryable: false,
        },
        metadata: {
          executionId,
          duration: Date.now() - startTime,
        },
      };
    }

    // 查找工具
    const tool = this.tools?.registry.tryGet(request.toolId);
    if (!tool) {
      return {
        success: false,
        error: {
          code: "TOOL_NOT_FOUND",
          message: `Tool "${request.toolId}" not found in registry`,
          retryable: false,
        },
        metadata: {
          executionId,
          duration: Date.now() - startTime,
        },
      };
    }

    // 检查工具是否启用
    if (tool.enabled === false) {
      return {
        success: false,
        error: {
          code: "TOOL_DISABLED",
          message: `Tool "${request.toolId}" is disabled`,
          retryable: false,
        },
        metadata: {
          executionId,
          duration: Date.now() - startTime,
        },
      };
    }

    // 构建执行上下文
    const toolContext = {
      executionId,
      toolId: request.toolId,
      userId: request.context?.userId,
      sessionId: request.context?.sessionId,
      workspaceId: request.context?.workspaceId,
      timeout: request.timeout || tool.defaultTimeout || 30000,
      createdAt: new Date(),
    };

    try {
      // 执行工具
      const result = await tool.execute(request.input, toolContext);
      const duration = Date.now() - startTime;

      return {
        success: result.success,
        data: result.data as T,
        error: result.error
          ? {
              code: result.error.code,
              message: result.error.message,
              retryable: result.error.retryable,
            }
          : undefined,
        metadata: {
          executionId,
          duration,
          tokensUsed: result.metadata.tokensUsed,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `[executeTool] Tool ${request.toolId} failed after ${duration}ms: ${errorMsg}`,
      );

      return {
        success: false,
        error: {
          code: "TOOL_EXECUTION_ERROR",
          message: errorMsg,
          retryable: true,
        },
        metadata: {
          executionId,
          duration,
        },
      };
    }
  }

  /**
   * 获取可用工具列表
   */
  getAvailableTools(category?: ToolCategory): ToolInfo[] {
    if (!this.tools?.registry) {
      return [];
    }

    const tools = category
      ? this.tools?.registry.getByCategory(category)
      : this.tools?.registry.getEnabled();

    return tools.map((tool) => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      category: tool.category,
      enabled: tool.enabled !== false,
      tags: tool.tags,
    }));
  }

  /**
   * 检查工具是否可用
   */
  isToolAvailable(toolId: string): boolean {
    if (!this.tools?.registry) {
      return false;
    }
    return this.tools?.registry.isAvailable(toolId);
  }

  /**
   * 获取工具的 Function Definition（用于 LLM Function Calling）
   */
  getToolFunctionDefinitions(toolIds?: string[]): Array<{
    name: string;
    description: string;
    parameters: object;
  }> {
    if (!this.tools?.registry) {
      return [];
    }

    const definitions = toolIds
      ? this.tools?.registry.getFunctionDefinitions(toolIds)
      : this.tools?.registry.getAllFunctionDefinitions();

    return definitions;
  }

  // ==================== ★ NEW: AI Capability 能力 ====================

  /**
   * ★ NEW: 获取可用的能力（Tools、Skills、MCP Tools）
   *
   * 根据上下文（用户、团队、角色）获取所有可用的 AI 能力
   */
  async getAvailableCapabilities(
    context: AICapabilityContext,
  ): Promise<CapabilitySummary> {
    if (!this.capabilityResolver) {
      this.logger.warn(
        "[getAvailableCapabilities] AICapabilityResolver not available",
      );
      return { tools: [], skills: [], mcpTools: [] };
    }

    this.logger.debug(
      `[getAvailableCapabilities] Resolving capabilities for context: ${JSON.stringify(context)}`,
    );

    // 解析所有能力
    const { tools, skills, mcpTools } =
      await this.capabilityResolver.resolveAllCapabilities(context);

    // 构建工具摘要
    const toolSummaries = tools.map((toolId) => {
      const tool = this.tools?.registry?.tryGet(toolId);
      return {
        id: toolId,
        name: tool?.name || toolId,
        description: tool?.description || "",
        category: tool?.category || ("information" as const),
        enabled: tool?.enabled !== false,
        functionDefinition: tool?.toFunctionDefinition() || {
          name: toolId,
          description: "",
          parameters: { type: "object", properties: {} },
        },
      };
    });

    // 构建技能摘要
    const skillSummaries = skills.map((skillId) => {
      // Skills 需要通过 SkillRegistry 获取详细信息
      return {
        id: skillId,
        name: skillId,
        description: "",
        domain: "common",
        layer: "domain" as const,
        enabled: true,
      };
    });

    // 构建 MCP 工具摘要
    const mcpToolSummaries = mcpTools.map((mcp) => ({
      serverId: mcp.serverId,
      toolName: mcp.toolName,
      description: mcp.description,
    }));

    this.logger.log(
      `[getAvailableCapabilities] Found ${toolSummaries.length} tools, ${skillSummaries.length} skills, ${mcpToolSummaries.length} MCP tools`,
    );

    return {
      tools: toolSummaries,
      skills: skillSummaries,
      mcpTools: mcpToolSummaries,
    };
  }

  /**
   * ★ NEW: 使用 Function Calling 的聊天
   *
   * 自动解析可用工具并让 LLM 自主调用
   *
   * 注意：此方法需要实现 LLMAdapter，当前返回占位符响应
   */
  async chatWithTools(request: {
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    context: AICapabilityContext;
    modelType?: AIModelType;
    model?: string;
    taskProfile?: import("./types").TaskProfile;
    maxIterations?: number;
    maxToolCalls?: number;
  }): Promise<{
    content: string;
    model: string;
    tokensUsed: number;
    toolCalls: Array<{
      toolId: string;
      input: unknown;
      output: unknown;
      success: boolean;
      duration: number;
    }>;
    isError?: boolean;
  }> {
    this.logger.log(
      `[chatWithTools] Starting with context: ${JSON.stringify(request.context)}`,
    );

    if (!this.capabilityResolver || !this.tools?.executor) {
      this.logger.warn(
        "[chatWithTools] AICapabilityResolver or FunctionCallingExecutor not available",
      );
      // 降级到普通 chat
      const result = await this.chat({
        messages: request.messages,
        modelType: request.modelType,
        model: request.model,
        taskProfile: request.taskProfile,
      });

      return {
        content: result.content,
        model: result.model,
        tokensUsed: result.tokensUsed,
        toolCalls: [],
        isError: result.isError,
      };
    }

    // TODO: 完整实现需要创建 LLMAdapter
    // 当前返回占位符响应
    this.logger.warn(
      "[chatWithTools] Full implementation requires LLMAdapter - returning placeholder",
    );

    const result = await this.chat({
      messages: request.messages,
      modelType: request.modelType,
      model: request.model,
      taskProfile: request.taskProfile,
    });

    return {
      content: result.content,
      model: result.model,
      tokensUsed: result.tokensUsed,
      toolCalls: [],
      isError: result.isError,
    };
  }

  // ==================== 管理功能 ====================

  /**
   * ★ 管理功能：获取提供商可用的模型列表
   *
   * 供管理后台使用，用于配置新模型时获取可用模型列表
   */
  async fetchAvailableModels(
    provider: string,
    apiKey: string,
    apiEndpoint?: string,
    modelType?: string,
  ): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string; description?: string }>;
    error?: string;
  }> {
    this.logger.log(
      `[fetchAvailableModels] provider=${provider}, modelType=${modelType}`,
    );
    return this.aiChatService.fetchAvailableModels(
      provider,
      apiKey,
      apiEndpoint,
      modelType,
    );
  }

  /**
   * ★ 管理功能：测试模型连接
   *
   * 供管理后台使用，验证模型配置是否正确
   */
  async testModelConnectionWithKey(
    provider: string,
    modelId: string,
    apiKey: string,
    apiEndpoint: string,
    modelType?: string,
  ): Promise<{ success: boolean; message: string; latency?: number }> {
    this.logger.log(
      `[testModelConnectionWithKey] provider=${provider}, modelId=${modelId}`,
    );
    return this.aiChatService.testModelConnectionWithKey(
      provider,
      modelId,
      apiKey,
      apiEndpoint,
      modelType,
    );
  }

  // ============================================================================
  // ★ P2 能力下沉：实时推送能力
  // ============================================================================

  /**
   * 获取当前进度
   */
  getProgress(taskId: string): ProgressEvent | null {
    return this.realtime?.progressTracker?.getProgress(taskId) ?? null;
  }

  /**
   * 发射实时事件到指定房间
   *
   * 通过 WebSocket 推送事件给订阅的客户端
   */
  emitToRoom<T>(roomConfig: RoomConfig, eventType: string, payload: T): void {
    if (!this.realtime?.eventEmitter) {
      this.logger.warn("[emitToRoom] EventEmitter not available");
      return;
    }

    this.realtime.eventEmitter.emitToRoom(roomConfig, {
      type: eventType,
      payload,
      metadata: {
        timestamp: new Date(),
        source: "facade",
      },
    });
  }

  /**
   * 发射进度事件
   */
  emitProgress(roomConfig: RoomConfig, progress: ProgressEvent): void {
    this.realtime?.eventEmitter?.emitProgress(roomConfig, progress);
  }

  /**
   * 设置 WebSocket 服务器（由 Gateway 调用）
   */
  setWebSocketServer(server: unknown): void {
    if (
      this.realtime?.eventEmitter &&
      typeof (
        this.realtime.eventEmitter as { setServer?: (s: unknown) => void }
      ).setServer === "function"
    ) {
      (
        this.realtime.eventEmitter as { setServer: (s: unknown) => void }
      ).setServer(server);
    }
  }
}
