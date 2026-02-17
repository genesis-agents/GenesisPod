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
import {
  CREATIVITY_TO_TEMPERATURE,
  OUTPUT_LENGTH_TO_TOKENS,
} from "../llm/types/task-profile";
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
import type {
  AgentEvent,
  ExecutionConfig,
} from "../orchestration/executors/function-calling-executor";

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
  // Constraint Feature
  ConstraintFeature,
  CONSTRAINT_FEATURE,
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

    // ==================== Constraint 特性模块 ====================
    @Optional()
    @Inject(CONSTRAINT_FEATURE)
    private readonly constraint?: ConstraintFeature,

    // ==================== 独立服务（可选）====================
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly teamsService?: TeamsService,
    @Optional() private readonly capabilityResolver?: AICapabilityResolver,
    @Optional()
    @Inject(forwardRef(() => CreditsService))
    private readonly creditsService?: CreditsService,
    @Optional() private readonly modelFallbackService?: ModelFallbackService,
    @Optional()
    private readonly modelResolver?: import("./model-resolver.service").ModelResolverService,
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
      constraint: !!this.constraint,
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
   * Unified chat entry point with circuit breaker protection and model fallback.
   *
   * Routes through ModelFallbackService when available for automatic model switching
   * on failures. Falls back to single-model call when fallback service is unavailable.
   * Automatically delegates to chatWithSkills when domain/taskType is provided.
   *
   * @param request - Chat request configuration
   * @param request.messages - Conversation messages
   * @param request.modelType - AI model type (CHAT, IMAGE_GENERATION, etc.)
   * @param request.taskProfile - Semantic task configuration
   * @param request.domain - Optional domain for automatic skill injection
   * @param request.taskType - Optional task type for automatic skill injection
   * @returns Chat response with content, model used, and token count
   *
   * @example
   * const result = await facade.chat({
   *   messages: [{ role: "user", content: "Hello" }],
   *   modelType: AIModelType.CHAT,
   *   taskProfile: { creativity: "medium", outputLength: "standard" },
   * });
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    // Step 1: Skill proxy — if domain/taskType provided, delegate to chatWithSkills
    const skillResult = await this.handleSkillProxy(request);
    if (skillResult !== null) {
      return skillResult;
    }

    // Step 2: Resolve the model ID to use for this request
    const modelId = await this.resolveModelId(request);
    const entityId = `chat:${modelId}`;

    this.logger.debug(
      `[chat] modelType=${request.modelType}, model=${modelId}, messages=${request.messages.length}`,
    );

    // Step 3: Enforce rate limit and budget constraints
    const constraintError = this.enforceRateLimitAndBudget(request, modelId);
    if (constraintError !== null) {
      return constraintError;
    }

    // Step 4: Route to provider — with automatic model fallback when available
    if (this.modelFallbackService) {
      return this.chatWithFallback(request, modelId);
    }

    return this.chatSingleModel(request, modelId, entityId);
  }

  /**
   * Step 1 — Skill proxy: auto-delegate to chatWithSkills when domain/taskType is present.
   * Returns a ChatResponse when delegation occurred, or null to continue normal flow.
   */
  private async handleSkillProxy(
    request: ChatRequest,
  ): Promise<ChatResponse | null> {
    if (!(request.domain || request.taskType) || !this.skills) {
      return null;
    }

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

  /**
   * Step 2 — Model resolution: resolve the preferred model ID from the request.
   * Priority: explicit request.model → default model for modelType → "default".
   */
  private async resolveModelId(request: ChatRequest): Promise<string> {
    if (request.model) {
      return request.model;
    }

    if (request.modelType) {
      const defaultModel = await this.aiChatService.getDefaultModelByType(
        request.modelType as AIModelType,
      );
      if (defaultModel) {
        return defaultModel.modelId;
      }
    }

    return "default";
  }

  /**
   * Step 3 — Rate limit and budget enforcement.
   * Returns an error ChatResponse when a constraint is violated, or null to continue.
   */
  private enforceRateLimitAndBudget(
    request: ChatRequest,
    modelId: string,
  ): ChatResponse | null {
    if (this.constraint?.rateLimiter) {
      const rateLimitKey = request.billing?.userId || "global";
      const rateLimitResult = this.constraint.rateLimiter.check(rateLimitKey);
      if (!rateLimitResult.allowed) {
        this.logger.warn(
          `[chat] Rate limited for key=${rateLimitKey}, retryAfter=${rateLimitResult.retryAfter}ms`,
        );
        return {
          content: `Rate limit exceeded. Please try again in ${Math.ceil((rateLimitResult.retryAfter || 0) / 1000)} seconds.`,
          model: modelId,
          tokensUsed: 0,
          isError: true,
        };
      }
      this.constraint.rateLimiter.consume(rateLimitKey);
    }

    if (this.constraint?.costController) {
      const budgetCheck = this.constraint.costController.checkBudget(0.01); // estimated minimum cost
      if (!budgetCheck.allowed) {
        this.logger.warn(`[chat] Budget exceeded: ${budgetCheck.reason}`);
        return {
          content: `Budget limit exceeded: ${budgetCheck.reason}`,
          model: modelId,
          tokensUsed: 0,
          isError: true,
        };
      }
    }

    return null;
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

  // ==================== 结构化输出 ====================

  /**
   * 结构化输出：LLM 响应 → 类型安全的 JSON 对象
   *
   * 自动在 system prompt 中注入 JSON Schema 约束，
   * 解析响应为类型安全对象，解析失败时自动重试。
   *
   * @example
   * interface Analysis { themes: string[]; score: number; }
   * const result = await facade.chatStructured<Analysis>({
   *   messages: [{ role: "user", content: "分析这篇文章" }],
   *   schema: {
   *     type: "object",
   *     properties: {
   *       themes: { type: "array", items: { type: "string" } },
   *       score: { type: "number" },
   *     },
   *     required: ["themes", "score"],
   *   },
   *   taskProfile: { creativity: "low", outputLength: "medium" },
   * });
   * // result.data.themes — string[]
   * // result.data.score — number
   */
  async chatStructured<T>(
    request: import("./types/facade.types").StructuredChatRequest,
  ): Promise<import("./types/facade.types").StructuredChatResponse<T>> {
    const maxRetries = request.maxRetries ?? 1;
    const throwOnParseError = request.throwOnParseError ?? true;

    const schemaInstruction = [
      "You MUST respond with ONLY valid JSON matching this schema:",
      "```json",
      JSON.stringify(request.schema, null, 2),
      "```",
      "No markdown fences, no extra text, no explanation. ONLY the JSON object.",
    ].join("\n");

    const systemPrompt = request.systemPrompt
      ? `${request.systemPrompt}\n\n${schemaInstruction}`
      : schemaInstruction;

    let lastError: Error | undefined;
    let totalTokens = 0;
    let lastModel = "";
    let lastRawContent = "";

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const chatRequest: ChatRequest = {
        ...request,
        systemPrompt:
          attempt > 0
            ? `${systemPrompt}\n\nYour previous response was not valid JSON. Return ONLY the JSON object.`
            : systemPrompt,
        taskProfile: request.taskProfile || {
          creativity: "deterministic",
          outputLength: "medium",
        },
        strictMode: true,
      };

      const response = await this.chat(chatRequest);
      totalTokens += response.tokensUsed;
      lastModel = response.model;
      lastRawContent = response.content;

      if (response.isError) {
        lastError = new Error(response.content);
        continue;
      }

      // 尝试解析 JSON
      try {
        const cleaned = this.extractJson(response.content);
        const parsed = JSON.parse(cleaned) as T;

        return {
          data: parsed,
          rawContent: response.content,
          model: response.model,
          tokensUsed: totalTokens,
          retriedParse: attempt > 0,
        };
      } catch (parseError) {
        lastError =
          parseError instanceof Error
            ? parseError
            : new Error(String(parseError));
        this.logger.warn(
          `[chatStructured] JSON parse failed (attempt ${attempt + 1}/${maxRetries + 1}): ${lastError.message}`,
        );
      }
    }

    // 所有重试都失败
    if (throwOnParseError) {
      throw new Error(
        `Structured output parse failed after ${maxRetries + 1} attempts: ${lastError?.message}`,
      );
    }

    // 非严格模式：返回空对象
    return {
      data: {} as T,
      rawContent: lastRawContent,
      model: lastModel,
      tokensUsed: totalTokens,
      retriedParse: true,
    };
  }

  /**
   * 从 LLM 响应中提取 JSON 内容
   * 处理常见的 markdown 代码块包裹
   */
  private extractJson(content: string): string {
    let cleaned = content.trim();

    // 移除 markdown 代码块
    const jsonBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (jsonBlockMatch) {
      cleaned = jsonBlockMatch[1].trim();
    }

    // 移除开头的非 JSON 文本（找到第一个 { 或 [）
    const firstBrace = cleaned.indexOf("{");
    const firstBracket = cleaned.indexOf("[");
    const start = Math.min(
      firstBrace >= 0 ? firstBrace : Infinity,
      firstBracket >= 0 ? firstBracket : Infinity,
    );

    if (start !== Infinity && start > 0) {
      cleaned = cleaned.substring(start);
    }

    // 移除末尾的非 JSON 文本
    const lastBrace = cleaned.lastIndexOf("}");
    const lastBracket = cleaned.lastIndexOf("]");
    const end = Math.max(lastBrace, lastBracket);

    if (end >= 0 && end < cleaned.length - 1) {
      cleaned = cleaned.substring(0, end + 1);
    }

    return cleaned;
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
   * Chat with automatic skill injection based on task type and domain.
   *
   * Loads relevant SKILL.md files and injects them into the system prompt,
   * optimizing token usage by loading only relevant skills (saves 60-70% tokens).
   *
   * @param request - Chat request with skill configuration
   * @param request.messages - Conversation messages
   * @param request.modelType - AI model type
   * @param request.taskProfile - Semantic task configuration
   * @param request.domain - Skill domain (e.g., "research", "writing")
   * @param request.taskType - Task type (e.g., "analysis", "summary")
   * @param request.additionalSkills - Additional skill IDs to load
   * @param request.skillContext - Context variables for skill templates
   * @returns Chat response with used skills information
   *
   * @example
   * const result = await facade.chatWithSkills({
   *   messages: [{ role: "user", content: "Analyze this topic" }],
   *   modelType: AIModelType.CHAT,
   *   taskProfile: { creativity: "low", outputLength: "medium" },
   *   domain: "research",
   *   taskType: "analysis",
   * });
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
   * Streaming chat with Server-Sent Events (SSE) support.
   *
   * Supports both OpenAI-compatible and Anthropic Claude streaming formats.
   * Yields chunks as they arrive from the LLM provider.
   *
   * @param request - Chat request configuration
   * @param request.messages - Conversation messages
   * @param request.modelType - AI model type
   * @param request.taskProfile - Semantic task configuration
   * @yields Streaming chunks with content, done flag, and optional error
   *
   * @example
   * for await (const chunk of facade.chatStream({
   *   messages: [{ role: "user", content: "Write a story" }],
   *   modelType: AIModelType.CHAT,
   * })) {
   *   console.log(chunk.content);
   *   if (chunk.done) break;
   * }
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
      let tokensUsed = 0;
      let accumulatedContentLength = 0; // 用于回退估算

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

        // ★ 捕获 usage 信息（在最终 chunk 中携带）
        if (chunk.usage) {
          tokensUsed = chunk.usage.totalTokens;
          this.logger.debug(
            `[chatStream] Received usage from stream: ${tokensUsed} tokens`,
          );
        }

        // 累积内容长度（用于回退估算）
        if (chunk.content) {
          accumulatedContentLength += chunk.content.length;
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

      // ★ 回退估算：如果 API 未返回 usage，基于内容长度估算
      if (tokensUsed === 0 && accumulatedContentLength > 0) {
        // 估算规则：约 4 字符 = 1 token
        const estimatedCompletionTokens = Math.ceil(
          accumulatedContentLength / 4,
        );
        const estimatedPromptTokens = Math.ceil(
          request.messages.reduce((sum, m) => sum + m.content.length, 0) / 4,
        );
        tokensUsed = estimatedCompletionTokens + estimatedPromptTokens;
        this.logger.debug(
          `[chatStream] Estimated tokens (fallback): ${tokensUsed} (prompt: ${estimatedPromptTokens}, completion: ${estimatedCompletionTokens})`,
        );
      }

      // 流式完成，记录成功
      this.orchestration?.circuitBreaker?.recordSuccess(entityId, 0);

      // ★ BYOK: 流式完成后积分扣除（现在会传递实际的 token 数）
      await this.handleBilling(
        request,
        streamApiKeySource,
        tokensUsed,
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
   * Intelligently selects the best available model based on criteria.
   *
   * Selection considers circuit breaker state, load balancing, reasoning requirements,
   * model blocklist, and provider preferences. Filters out unavailable models automatically.
   *
   * @param options - Selection criteria
   * @param options.modelType - Model type to filter (default: CHAT)
   * @param options.requireReasoning - Only select reasoning models (o1, o3, deepseek-r1, etc.)
   * @param options.preferredProvider - Prefer models from specific provider
   * @param options.minMaxTokens - Minimum max tokens required
   * @returns Selected model info or null if none available
   *
   * @example
   * const model = await facade.selectModel({
   *   modelType: AIModelType.CHAT,
   *   requireReasoning: true,
   *   minMaxTokens: 8000,
   * });
   */
  async selectModel(
    options: ModelSelectionOptions = {},
  ): Promise<ModelInfo | null> {
    // ★ P1-1: 委托给 ModelResolverService（渐进迁移）
    if (this.modelResolver) {
      return this.modelResolver.selectModel(options);
    }

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
   * Gets the best available reasoning model.
   *
   * Shortcut method for selecting reasoning models (o1, o3, deepseek-r1, etc.).
   * Equivalent to calling selectModel with requireReasoning: true.
   *
   * @returns Reasoning model info or null if none available
   *
   * @example
   * const model = await facade.getReasoningModel();
   */
  async getReasoningModel(): Promise<ModelInfo | null> {
    return this.selectModel({ requireReasoning: true });
  }

  /**
   * Gets extended model information including availability and reasoning capabilities.
   *
   * Returns detailed model info with circuit breaker state, blocklist status,
   * and reasoning capabilities. Used internally for intelligent model selection.
   *
   * @param modelType - Model type to filter (default: CHAT)
   * @returns Array of extended model information
   */
  async getAvailableModelsExtended(
    modelType: AIModelType = AIModelType.CHAT,
  ): Promise<ModelInfo[]> {
    // ★ P1-1: 委托给 ModelResolverService
    if (this.modelResolver) {
      return this.modelResolver.getAvailableModelsExtended(modelType);
    }

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
   * Gets simplified list of available models for UI display.
   *
   * Returns basic model information suitable for dropdown menus and model selectors.
   * Does not include internal state like circuit breaker status.
   *
   * @param modelType - Model type to filter (default: CHAT)
   * @returns Array of simplified model information for frontend
   *
   * @example
   * const models = await facade.getAvailableModels(AIModelType.CHAT);
   * // Use in UI: <select>{models.map(m => <option value={m.id}>{m.name}</option>)}</select>
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
    // ★ P1-1: 委托给 ModelResolverService
    if (this.modelResolver) {
      return this.modelResolver.getAvailableModels(modelType);
    }

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
   * Gets the default text chat model configuration.
   *
   * Returns the default CHAT model configuration without requiring direct database access.
   * API keys are managed internally via Secret Manager.
   *
   * @returns Default CHAT model config or null if none configured
   *
   * @example
   * const model = await facade.getDefaultTextModel();
   * console.log(`Using ${model.displayName}`);
   */
  async getDefaultTextModel(): Promise<{
    id: string;
    modelId: string;
    displayName: string;
    provider: string;
    maxTokens?: number;
  } | null> {
    if (this.modelResolver) {
      return this.modelResolver.getDefaultTextModel();
    }
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
   * Gets the default image generation model configuration.
   *
   * Returns the default IMAGE_GENERATION model configuration.
   * Used by AI Apps that need image generation capabilities.
   *
   * @returns Default IMAGE_GENERATION model config or null if none configured
   *
   * @example
   * const model = await facade.getDefaultImageModel();
   * // Use for image generation requests
   */
  async getDefaultImageModel(): Promise<{
    id: string;
    modelId: string;
    displayName: string;
    provider: string;
    maxTokens?: number;
  } | null> {
    if (this.modelResolver) {
      return this.modelResolver.getDefaultImageModel();
    }
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
   * Gets model configuration by model ID or database ID.
   *
   * Returns model configuration including reasoning capability flag and basic metadata.
   * API keys are managed internally and not exposed through this method.
   *
   * @param idOrModelId - Model ID (e.g., "gpt-4o") or database ID (UUID)
   * @returns Model configuration or null if not found
   *
   * @example
   * const model = await facade.getModelById("gpt-4o");
   * if (model?.isReasoning) {
   *   console.log("This is a reasoning model");
   * }
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
    if (this.modelResolver) {
      return this.modelResolver.getModelById(idOrModelId);
    }
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
   * Gets full model configuration including sensitive API keys.
   *
   * Returns complete model configuration with API keys and secrets.
   * Used by internal services (e.g., ImageGenerationService) that need direct API access.
   *
   * @param modelId - Model ID or database ID
   * @returns Full model configuration with sensitive fields or null if not found
   *
   * @throws Never throws, returns null for invalid IDs
   *
   * @example
   * const config = await facade.getFullModelConfig("dall-e-3");
   * // Internal use only - contains apiKey and secretKey
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
    if (this.modelResolver) {
      return this.modelResolver.getFullModelConfig(modelId);
    }
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
   * Gets the default model configuration for a specific type.
   *
   * Supports all model types: CHAT, IMAGE_GENERATION, EMBEDDING, etc.
   * Returns the model marked as default for the given type.
   *
   * @param modelType - Model type (CHAT, IMAGE_GENERATION, EMBEDDING, etc.)
   * @returns Default model config for the type or null if none configured
   *
   * @example
   * const embeddingModel = await facade.getDefaultModelByType(AIModelType.EMBEDDING);
   */
  async getDefaultModelByType(modelType: AIModelType): Promise<{
    id: string;
    modelId: string;
    displayName: string;
    provider: string;
    maxTokens?: number;
  } | null> {
    if (this.modelResolver) {
      return this.modelResolver.getDefaultModelByType(modelType);
    }
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
   * Performs intelligent web search via ToolRegistry.
   *
   * Unified search entry point for AI Apps. Routes through the web-search tool
   * which internally uses SearchService. Returns structured search results with
   * relevance scores and metadata.
   *
   * @param request - Search request configuration
   * @param request.query - Search query string
   * @param request.maxResults - Maximum number of results (default: 5)
   * @returns Search response with results array and success status
   *
   * @example
   * const results = await facade.search({
   *   query: "latest AI research papers",
   *   maxResults: 10,
   * });
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
   * Formats search results into LLM-friendly context string.
   *
   * Converts search result array into markdown-formatted text suitable for
   * injection into LLM prompts. Includes titles, content snippets, and sources.
   *
   * @param results - Array of search result items
   * @returns Formatted markdown string with numbered results
   *
   * @example
   * const formatted = facade.formatSearchResultsForContext(results);
   * // Use in prompt: `Context:\n${formatted}`
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
   * Starts a collaborative team mission with multiple AI agents.
   *
   * Executes a team-based task with specialized agents working together.
   * Supports research, debate, review, and report generation teams.
   * Polls for completion and returns final result.
   *
   * @param request - Team mission configuration
   * @param request.teamType - Type of team ("research", "debate", "review", "report")
   * @param request.missionInput - Mission goal and context
   * @param request.progressCallback - Optional callback for progress updates
   * @returns Mission result with output and execution metadata
   *
   * @example
   * const result = await facade.startTeamMission({
   *   teamType: "research",
   *   missionInput: {
   *     goal: "Analyze market trends",
   *     context: { domain: "tech" },
   *   },
   * });
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
   * Cancels a running team mission.
   *
   * Attempts to cancel an in-progress mission. Returns success status.
   * Cancelled missions will have status "cancelled" and cannot be resumed.
   *
   * @param missionId - Unique mission identifier
   * @returns True if cancellation succeeded, false otherwise
   *
   * @example
   * const cancelled = facade.cancelMission("mission-123");
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
   * Gets the current status of a team mission.
   *
   * Returns mission progress, phase, and completion status.
   * Useful for polling or displaying progress UI.
   *
   * @param missionId - Unique mission identifier
   * @returns Mission status with progress and phase info, or null if not found
   *
   * @example
   * const status = facade.getMissionStatus("mission-123");
   * console.log(`Phase: ${status.currentPhase}, Progress: ${status.progress}%`);
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
   * Builds rich context from multiple sources for LLM prompts.
   *
   * Aggregates context from memory, search results, topics, resources, and custom content.
   * Supports token limiting and automatic compression. Returns formatted context string.
   *
   * @param request - Context build configuration
   * @param request.sources - Array of context sources (memory, search, topic, resource, custom)
   * @param request.maxTokens - Optional token limit
   * @param request.compress - Whether to compress if exceeds maxTokens
   * @returns Formatted context string ready for LLM injection
   *
   * @example
   * const context = await facade.buildContext({
   *   sources: [
   *     { type: "search", content: "AI trends" },
   *     { type: "memory", id: "session-123" },
   *   ],
   *   maxTokens: 4000,
   *   compress: true,
   * });
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
          // ★ 架构分层：优先使用预查询的数据，避免 Engine 层依赖 App 层业务模型
          if (source.data) {
            const topic = source.data as {
              name: string;
              type: string;
              description?: string;
              dimensions?: Array<{ name: string; description?: string }>;
            };
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
          } else if (source.id && this.prisma) {
            // 兼容旧代码：直接查询（不推荐，违反架构分层）
            this.logger.warn(
              `[buildContext] Deprecated: type="topic" with id="${source.id}" should pass data via source.data instead of direct Prisma query`,
            );
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
          // ★ 架构分层：优先使用预查询的数据，避免 Engine 层依赖 App 层业务模型
          if (source.data) {
            const resource = source.data as {
              title: string;
              aiSummary?: string;
              content?: string;
            };
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
          } else if (source.id && this.prisma) {
            // 兼容旧代码：直接查询（不推荐，违反架构分层）
            this.logger.warn(
              `[buildContext] Deprecated: type="resource" with id="${source.id}" should pass data via source.data instead of direct Prisma query`,
            );
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
   * Validates content against constraints (token limits, filters, schemas).
   *
   * Checks content for token limits, sensitive information, and JSON schema compliance.
   * Returns validation result with violations and optionally adjusted content.
   *
   * @param request - Constraint check configuration
   * @param request.content - Content to validate
   * @param request.constraints - Constraint rules (maxTokens, contentFilter, jsonSchema)
   * @returns Validation result with passed flag, violations, and adjusted content
   *
   * @example
   * const result = facade.checkConstraints({
   *   content: longText,
   *   constraints: { maxTokens: 4000, contentFilter: { enabled: true } },
   * });
   * if (!result.passed) console.log(result.violations);
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
   * Stores content in short-term or long-term memory.
   *
   * Saves memory associated with a session (short-term) or user (long-term).
   * Memory can be retrieved later for context building.
   *
   * @param request - Memory storage configuration
   * @param request.sessionId - Session or user ID
   * @param request.type - Memory type ("short" or "long")
   * @param request.content - Content to store
   * @returns Promise that resolves when storage completes
   *
   * @example
   * await facade.storeMemory({
   *   sessionId: "session-123",
   *   type: "short",
   *   content: "User prefers technical explanations",
   * });
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
   * Retrieves memory items from short-term and long-term storage.
   *
   * Searches memory by session/user ID and optional query.
   * Returns ranked memory items with relevance scores.
   *
   * @param request - Memory retrieval configuration
   * @param request.sessionId - Session or user ID
   * @param request.query - Optional search query for long-term memory
   * @param request.topK - Maximum number of items to return
   * @returns Array of memory items with content and scores
   *
   * @example
   * const memories = await facade.retrieveMemory({
   *   sessionId: "session-123",
   *   query: "user preferences",
   *   topK: 5,
   * });
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
   * Clears all short-term memory for a session.
   *
   * Deletes all memory associated with the given session ID.
   * Long-term memory is not affected.
   *
   * @param sessionId - Session ID to clear
   * @returns Promise that resolves when clearing completes
   *
   * @example
   * await facade.clearMemory("session-123");
   */
  async clearMemory(sessionId: string): Promise<void> {
    this.logger.debug(`[clearMemory] sessionId=${sessionId}`);

    if (this.memory?.shortTerm) {
      await this.memory?.shortTerm.deleteWithSession(sessionId, "memory");
    }
  }

  // ==================== Session Memory (raw key-value) ====================

  /**
   * Get a value from session memory by key.
   * Unlike storeMemory/retrieveMemory (structured MemoryType data),
   * these methods expose raw key-value storage for arbitrary data (e.g. MessageWithContext[]).
   */
  async sessionMemoryGet(sessionId: string, key: string): Promise<unknown> {
    if (!this.memory?.shortTerm) return undefined;
    return this.memory.shortTerm.getWithSession(sessionId, key);
  }

  /**
   * Set a value in session memory by key with optional TTL.
   */
  async sessionMemorySet(
    sessionId: string,
    key: string,
    value: unknown,
    ttl?: number,
  ): Promise<void> {
    if (!this.memory?.shortTerm) return;
    await this.memory.shortTerm.setWithSession(sessionId, key, value, ttl);
  }

  /**
   * Clear all session memory for a given session.
   */
  async sessionMemoryClear(sessionId: string): Promise<void> {
    if (!this.memory?.shortTerm) return;
    await this.memory.shortTerm.clearSession(sessionId);
  }

  // ==================== Agent 执行能力 ====================

  /**
   * Executes a single agent task with retry and circuit breaker protection.
   *
   * Runs an agent with configurable parameters including search augmentation,
   * retry behavior, and semantic task profiles. Automatically maps taskProfile
   * to temperature and maxTokens if not specified.
   *
   * @param request - Agent execution configuration
   * @param request.agentType - Type of agent to execute
   * @param request.task - Task description/prompt
   * @param request.taskProfile - Optional semantic task configuration
   * @param request.config - Execution config (retries, timeout, search)
   * @returns Execution result with content, tokens used, and duration
   *
   * @example
   * const result = await facade.executeAgent({
   *   agentType: "analyst",
   *   task: "Summarize market trends",
   *   taskProfile: { creativity: "low", outputLength: "short" },
   *   config: { enableSearch: true, maxRetries: 3 },
   * });
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
      if (!config.temperature && request.taskProfile.creativity) {
        config.temperature =
          CREATIVITY_TO_TEMPERATURE[request.taskProfile.creativity] ?? 0.7;
      }
      if (!config.maxTokens && request.taskProfile.outputLength) {
        config.maxTokens =
          OUTPUT_LENGTH_TO_TOKENS[request.taskProfile.outputLength] ?? 4000;
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
   * Checks if an agent is available for execution.
   *
   * Validates that the agent exists and is ready to accept tasks.
   * Returns false if AgentExecutorService is not available.
   *
   * @param agentId - Agent identifier
   * @returns True if agent is available, false otherwise
   *
   * @example
   * if (facade.isAgentAvailable("analyst")) {
   *   // Execute agent task
   * }
   */
  isAgentAvailable(agentId: string): boolean {
    if (!this.orchestration?.agentExecutor) {
      return false;
    }
    return this.orchestration?.agentExecutor.isAgentAvailable(agentId);
  }

  // ==================== Tool 执行能力 ====================

  /**
   * Executes a registered tool with input validation and timeout control.
   *
   * Looks up tool in ToolRegistry, validates it's enabled, executes with provided
   * input, and returns structured result. Supports generic return type.
   *
   * @param request - Tool execution configuration
   * @param request.toolId - Tool identifier from registry
   * @param request.input - Tool-specific input parameters
   * @param request.timeout - Optional execution timeout in milliseconds
   * @param request.context - Optional execution context (userId, sessionId, etc.)
   * @returns Execution result with typed data, error info, and metadata
   *
   * @example
   * const result = await facade.executeTool<{ answer: string }>({
   *   toolId: "calculator",
   *   input: { expression: "2 + 2" },
   *   timeout: 5000,
   * });
   * console.log(result.data?.answer);
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
   * Gets list of available tools, optionally filtered by category.
   *
   * Returns metadata for all enabled tools. Useful for displaying
   * available capabilities to users or LLMs.
   *
   * @param category - Optional category filter ("search", "data", "communication", etc.)
   * @returns Array of tool metadata (id, name, description, category)
   *
   * @example
   * const searchTools = facade.getAvailableTools("search");
   * console.log(searchTools.map(t => t.name));
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
   * Checks if a specific tool is available and enabled.
   *
   * Validates that the tool exists in the registry and is enabled for use.
   * Returns false if ToolRegistry is not available.
   *
   * @param toolId - Tool identifier
   * @returns True if tool is available and enabled, false otherwise
   *
   * @example
   * if (facade.isToolAvailable("web-search")) {
   *   // Use the search tool
   * }
   */
  isToolAvailable(toolId: string): boolean {
    if (!this.tools?.registry) {
      return false;
    }
    return this.tools?.registry.isAvailable(toolId);
  }

  /**
   * Gets OpenAI-compatible function definitions for tools.
   *
   * Returns function schemas suitable for LLM function calling.
   * If toolIds not provided, returns definitions for all enabled tools.
   *
   * @param toolIds - Optional array of tool IDs to get definitions for
   * @returns Array of function definitions with name, description, and parameters schema
   *
   * @example
   * const definitions = facade.getToolFunctionDefinitions(["web-search", "calculator"]);
   * // Use with LLM: { messages, functions: definitions }
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
   * Gets all available AI capabilities based on context.
   *
   * Resolves available tools, skills, and MCP tools based on user, team, and role.
   * Returns comprehensive capability summary for building AI-powered features.
   *
   * @param context - Context for capability resolution (userId, teamId, roleId, etc.)
   * @returns Summary of available tools, skills, and MCP tools with metadata
   *
   * @example
   * const capabilities = await facade.getAvailableCapabilities({
   *   userId: "user-123",
   *   teamId: "team-456",
   * });
   * console.log(`Available: ${capabilities.tools.length} tools, ${capabilities.skills.length} skills`);
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
   * Chat with automatic tool calling based on available capabilities.
   *
   * Automatically resolves available tools based on context and enables LLM
   * to call them autonomously. Handles multi-turn tool execution.
   *
   * Note: Full implementation requires LLMAdapter. Currently degrades to plain chat.
   *
   * @param request - Chat request with tool context
   * @param request.messages - Conversation messages
   * @param request.context - Context for capability resolution
   * @param request.modelType - Optional model type
   * @param request.taskProfile - Optional semantic task configuration
   * @param request.maxIterations - Max tool calling rounds (default: 5)
   * @param request.maxToolCalls - Max total tool calls (default: 10)
   * @returns Chat response with tool call history
   *
   * @example
   * const result = await facade.chatWithTools({
   *   messages: [{ role: "user", content: "Search for AI news" }],
   *   context: { userId: "user-123" },
   * });
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

  /**
   * Stream-based tool calling: yields AgentEvent as the executor progresses.
   * Used by ai-ask for real-time tool-call streaming.
   */
  async *chatWithToolsStream(request: {
    systemPrompt: string;
    userPrompt: string;
    context: AICapabilityContext;
    modelConfig: {
      provider: string;
      modelId: string;
      apiKey?: string;
      apiEndpoint?: string;
    };
    executionConfig?: Partial<ExecutionConfig>;
  }): AsyncGenerator<AgentEvent> {
    if (!this.tools?.executor || !this.tools?.llmAdapter) {
      yield {
        type: "error",
        error: "Tool execution not available",
      } as AgentEvent;
      return;
    }

    this.tools.llmAdapter.setConfig({
      provider: request.modelConfig.provider,
      modelId: request.modelConfig.modelId,
      apiKey: request.modelConfig.apiKey,
      apiEndpoint: request.modelConfig.apiEndpoint,
    });

    yield* this.tools.executor.executeWithContext(
      this.tools.llmAdapter,
      request.systemPrompt,
      request.userPrompt,
      request.context,
      request.executionConfig,
    );
  }

  /**
   * Check if streaming tool execution is available (executor + llmAdapter).
   */
  isToolExecutionAvailable(): boolean {
    return !!(this.tools?.executor && this.tools?.llmAdapter);
  }

  // ==================== 管理功能 ====================

  /**
   * Fetches available models from a provider (admin only).
   *
   * Queries provider API to get list of available models for configuration.
   * Used by admin UI when adding new models to the system.
   *
   * @param provider - Provider name ("openai", "anthropic", etc.)
   * @param apiKey - API key for authentication
   * @param apiEndpoint - Optional custom API endpoint
   * @param modelType - Optional model type filter
   * @returns Success status and array of available models
   *
   * @example
   * const result = await facade.fetchAvailableModels(
   *   "openai",
   *   "sk-...",
   *   undefined,
   *   "CHAT"
   * );
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
   * Tests model connection with provided credentials (admin only).
   *
   * Validates that the model configuration works by sending a test request.
   * Returns success status and latency measurement.
   *
   * @param provider - Provider name
   * @param modelId - Model identifier
   * @param apiKey - API key for authentication
   * @param apiEndpoint - API endpoint URL
   * @param modelType - Optional model type
   * @returns Test result with success status, message, and latency
   *
   * @example
   * const result = await facade.testModelConnectionWithKey(
   *   "openai",
   *   "gpt-4o",
   *   "sk-...",
   *   "https://api.openai.com/v1"
   * );
   * console.log(`Latency: ${result.latency}ms`);
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
   * Gets the current progress of a running task.
   *
   * Retrieves real-time progress information tracked by the progress tracker.
   * Returns null if task not found or progress tracking unavailable.
   *
   * @param taskId - Unique task identifier
   * @returns Progress event with percentage, phase, and status, or null if not found
   *
   * @example
   * const progress = facade.getProgress("task-123");
   * console.log(`${progress.percentage}% - ${progress.phase}`);
   */
  getProgress(taskId: string): ProgressEvent | null {
    return this.realtime?.progressTracker?.getProgress(taskId) ?? null;
  }

  /**
   * Emits real-time event to a WebSocket room.
   *
   * Broadcasts event to all clients subscribed to the specified room.
   * Used for real-time updates during long-running operations.
   *
   * @param roomConfig - Room configuration (roomId, userId filters, etc.)
   * @param eventType - Event type identifier
   * @param payload - Event payload data
   *
   * @example
   * facade.emitToRoom(
   *   { roomId: "research-123", userId: "user-456" },
   *   "analysis-update",
   *   { status: "analyzing", data: results }
   * );
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
   * Emits progress update to a WebSocket room.
   *
   * Convenience method for broadcasting progress events with standardized format.
   * Automatically includes timestamp and source metadata.
   *
   * @param roomConfig - Room configuration
   * @param progress - Progress event with percentage, phase, and status
   *
   * @example
   * facade.emitProgress(
   *   { roomId: "task-123" },
   *   { taskId: "task-123", percentage: 50, phase: "analyzing", status: "in-progress" }
   * );
   */
  emitProgress(roomConfig: RoomConfig, progress: ProgressEvent): void {
    this.realtime?.eventEmitter?.emitProgress(roomConfig, progress);
  }

  /**
   * Sets the WebSocket server instance (called by Gateway on initialization).
   *
   * Injects the WebSocket server into the event emitter for real-time communication.
   * Should be called once during application bootstrap.
   *
   * @param server - WebSocket server instance (Socket.IO Server)
   *
   * @example
   * // In gateway setup:
   * facade.setWebSocketServer(io);
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
