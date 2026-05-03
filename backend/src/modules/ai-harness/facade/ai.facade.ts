/**
 * AI Engine Facade
 * AI å¼•æ“Žç»Ÿä¸€å…¥å£
 *
 * è®¾è®¡åŽŸåˆ™ï¼š
 * 1. å•ä¸€å…¥å£ï¼šæ‰€æœ‰ AI Apps é€šè¿‡æ­¤ Facade æ¶ˆè´¹ AI èƒ½åŠ›
 * 2. è¯­ä¹‰åŒ–é…ç½®ï¼šä½¿ç”¨ TaskProfile æè¿°ä»»åŠ¡ï¼Œè€Œéžç¡¬ç¼–ç å‚æ•°
 * 3. èƒ½åŠ›èšåˆï¼šæ•´åˆ LLMã€Searchã€Agentã€Teamã€Context ç­‰æ ¸å¿ƒèƒ½åŠ›
 * 4. å‘ä¸‹å§”æ‰˜ï¼šFacade åªåšè·¯ç”±å’Œé€‚é…ï¼Œå…·ä½“å®žçŽ°å§”æ‰˜ç»™å†…éƒ¨æœåŠ¡
 */

import {
  Injectable,
  Logger,
  Optional,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { AiChatService } from "../../ai-engine/llm/services/ai-chat.service";
import { AiModelConfigService } from "../../ai-engine/llm/services/ai-model-config.service";
// IntentRouterService / TaskPlanner å·²åˆ  (2026-04-30) â€” suggestedActions å‰ç«¯ 0 æ¶ˆè´¹
import type {
  A2AMessageType,
  A2APriority,
  A2AMessage,
} from "../protocols/ipc/abstractions/a2a-message.types";
// â˜… æž¶æž„é‡æž„ï¼šé€šè¿‡ ToolRegistry è°ƒç”¨æœç´¢å·¥å…·
import type { ToolContext } from "../../ai-engine/tools/abstractions/tool.interface";
import type { ToolPipeline } from "../../ai-engine/tools/middleware/tool-pipeline";
import {
  TeamsService,
  MissionStatus,
  CreateMissionDto,
} from "../teams/services/teams.service";
import type { MissionEvent } from "../agents/abstractions/mission.types";
import { TaskCompletionType } from "../../ai-engine/safety/resilience/circuit-breaker.service";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ModelFallbackService } from "../../ai-engine/llm/selection/model-fallback.service";
import {
  AICapabilityResolver,
  AICapabilityContext,
} from "../../ai-harness/runner/capabilities/ai-capability-resolver.service";
import { CreditsService, BillingContext } from "../../ai-infra/facade";
import { RequestContext } from "../../../common/context/request-context";
import type { CreditBillingInfo } from "./types/facade.types";
import type {
  AgentEvent,
  ExecutionConfig,
} from "../../ai-harness/runner/executor/function-calling-executor";

// â˜… P1 é‡æž„ï¼šä½¿ç”¨åˆ†ç»„çš„ Feature Providers
import {
  MemoryFeature,
  ToolFeature,
  OrchestrationFeature,
  SkillFeature,
  MEMORY_FEATURE,
  TOOL_FEATURE,
  ORCHESTRATION_FEATURE,
  SKILL_FEATURE,
  // â˜… P2 èƒ½åŠ›ä¸‹æ²‰ï¼šRealtime Feature
  RealtimeFeature,
  REALTIME_FEATURE,
  // Constraint Feature
  ConstraintFeature,
  CONSTRAINT_FEATURE,
  // â˜… Phase 2ï¼šæ–°å¢ž Feature Token ç±»åž‹å’Œæ³¨å…¥ Token
  TeamsFeature,
  TEAMS_FEATURE,
  ContentFeature,
  CONTENT_FEATURE,
  KnowledgeFeature,
  KNOWLEDGE_FEATURE,
  IntelligenceFeature,
  INTELLIGENCE_FEATURE,
  CollaborationFeature,
  COLLABORATION_FEATURE,
  ObservabilityFeature,
  OBSERVABILITY_FEATURE,
  RegistryFeature,
  REGISTRY_FEATURE,
} from "./facade.providers";
// â˜… P2 èƒ½åŠ›ä¸‹æ²‰ï¼šRealtime ç±»åž‹å¯¼å…¥
import type {
  RoomConfig,
  ProgressEvent,
} from "../protocols/realtime/abstractions/event-emitter.interface";
import { CapabilitySummary } from "../../ai-harness/runner/capabilities/types";
import type {
  ChatWithSkillsRequest,
  ChatWithSkillsResponse,
} from "../../ai-engine/skills/types/skill-md.types";
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
  DirectResearchParams,
  DirectResearchResult,
  IDirectResearchExecutor,
} from "./types";
// â˜… Skill execution helpers
import type {
  ISkill,
  SkillContext,
  SkillResult,
} from "../../ai-engine/skills/abstractions/skill.interface";
import type { BindingContext } from "../../ai-engine/skills/runtime/binding/skill-input-binding-resolver.service";
// Use import type to avoid circular: PromptSkillAdapter â†’ AIFacade â†’ PromptSkillAdapter
import type { PromptSkillAdapter } from "../../ai-engine/skills/runtime/adapters/prompt-skill.adapter";
import { AiChatLLMAdapter } from "../../ai-engine/llm/adapters/ai-chat-llm.adapter";
import type {
  CreateTraceInput,
  CreateSpanInput,
  EndSpanInput,
  EndTraceInput,
} from "../tracing/observability/trace.interface";
import type {
  MemoryEvent,
  MemoryQuery,
  MemoryContext,
} from "../../ai-harness/memory/coordinator/memory-coordinator.service";
import type {
  ReflectionInput,
  ReflectionResult,
  ReflectionConfig,
} from "../../ai-engine/planning/reflection/reflection.service";
import type {
  CompressionOptions,
  CompressionResult,
} from "../../ai-harness/runner/executor/executor.types";
import type { SaveEvidenceRequest } from "../../ai-engine/knowledge/evidence/abstractions/evidence.interface";
import type { VotingSession } from "../teams/collaboration/patterns/voting-pattern";
import type {
  VoteRequest,
  VoteResult,
} from "../teams/collaboration/abstractions/collaborator.interface";
import { EmbeddingService } from "@/modules/ai-engine/rag/embedding";
import type { EmbeddingResult } from "@/modules/ai-engine/rag/embedding";
import { VectorService } from "@/modules/ai-engine/rag/vector";
import type {
  SimilaritySearchOptions,
  SimilarityResult,
} from "@/modules/ai-engine/rag/vector/vector.service";
import { MCPManager } from "../../ai-engine/tools/adapters/mcp/manager/mcp-manager";
import type {
  SkillPromptBundle,
  SkillPromptOptions,
} from "../../ai-harness/runner/capabilities/types";
import type { SkillMdDefinition } from "../../ai-engine/skills/types/skill-md.types";
import { CircuitBreakerService } from "../../ai-engine/safety/resilience/circuit-breaker.service";
import { AgentExecutorService } from "../runner/executor/agent-executor.service";
// TaskDecomposerService å·²åˆ  (2026-04-30)
import { IntentDetectionService } from "../../ai-engine/planning/intent/intent-detection.service";
import { ProcessSupervisorService as ExecutionStateManager } from "../lifecycle/supervisor/process-supervisor.service";
import { FunctionCallingLLMAdapter } from "../../ai-engine/llm/adapters/function-calling-llm.adapter";
import { FunctionCallingExecutor } from "../../ai-harness/runner/executor/function-calling-executor";
import { ContextInitializationService } from "../../ai-engine/knowledge/world-building/context-initialization.service";
import { TeamFactory } from "../teams/factory/team-factory";
import { TeamsMissionOrchestrator as MissionOrchestrator } from "../teams/orchestrator/teams-mission-orchestrator";
import { OutputReviewerService } from "../evaluation/critique/output-reviewer.service";
import { ContextEvolutionService } from "../../ai-engine/knowledge/extraction/context-evolution.service";
import { ContentFetchService } from "../../ai-engine/content/fetch/content-fetch.service";
import { AgentRegistry } from "../agents/registry/plan-based-agent-registry";
import { TeamRegistry } from "../teams/registry/team-registry";
import { RoleRegistry } from "../teams/registry/role-registry";
import { SkillRegistry } from "../../ai-engine/skills/registry/skill.registry";

// â˜… Sub-facades (plain classes, NOT @Injectable)
import type { ModelResolverService } from "./model-resolver.service";
import { ModelSubFacade } from "./sub-facades/model.sub-facade";
import { TeamSubFacade } from "./sub-facades/team.sub-facade";
import { MemorySubFacade } from "./sub-facades/memory.sub-facade";
import { AgentSubFacade } from "./sub-facades/agent.sub-facade";
import { ToolExecSubFacade } from "./sub-facades/tool-exec.sub-facade";

// â˜… Phase 5: Domain Facades (@Injectable, thin wrappers injected into the God Facade)
import { ChatFacade } from "./domain/chat.facade";
import { RAGFacade } from "./domain/rag.facade";
import { AgentFacade } from "./domain/agent.facade";
import { TeamFacade } from "./domain/team.facade";
import { ToolFacade } from "./domain/tool.facade";

/** Skills ç³»ç»Ÿæç¤ºè¯ Token é¢„ç®—ï¼ˆå¯¹åº” TaskProfile outputLength="medium" çš„ 4000 tokensï¼‰ */
const SKILLS_PROMPT_TOKEN_BUDGET = 4000;

/** æ•æ„Ÿè¯è¿‡æ»¤åˆ—è¡¨ï¼ˆåŸºç¡€ç‰ˆï¼‰ */
const SENSITIVE_PATTERNS = [
  /password\s*[:=]\s*\S+/gi,
  /api[_-]?key\s*[:=]\s*\S+/gi,
  /secret\s*[:=]\s*\S+/gi,
  /token\s*[:=]\s*\S+/gi,
  /bearer\s+\S+/gi,
];

/**
 * AI Engine ç»Ÿä¸€å…¥å£ (Legacy â€” é€æ­¥è¿ç§»åˆ° Domain Facades)
 *
 * @deprecated Use domain-specific facades instead:
 *   - ChatFacade  for LLM chat/streaming/model selection
 *   - AgentFacade for agent execution, observability, and intent routing
 *   - TeamFacade  for team missions, A2A, voting, and evidence
 *   - RAGFacade   for search, context building, memory, and vector ops
 *   - ToolFacade  for tool execution, capability listing, and MCP tools
 *
 * Migration guide:
 *   1. Replace `import { AIFacade } from "@/modules/ai-engine/facade"` with
 *      the specific domain facade(s) you need, e.g.:
 *        import { ChatFacade } from "@/modules/ai-engine/facade"
 *   2. Update constructor injection:
 *        private readonly facade: AIFacade  =>  private readonly chatFacade: ChatFacade
 *   3. Update call sites:
 *        this.facade.chat(...)  =>  this.chatFacade.chat(...)
 *
 * Remaining uses of AIFacade should only be for methods not yet extracted
 * to a domain facade (e.g. registerResearchExecutor, executeDirectResearch).
 * Those will be migrated in a future PR once a ResearchFacade or AgentFacade
 * extension is added.
 *
 * This facade is preserved for backwards compatibility; all methods delegate
 * to the corresponding domain facade. New code MUST use domain facades directly.
 *
 * ============================================================================
 * P1 æž¶æž„ä¼˜åŒ–ï¼šä¾èµ–åˆ†ç»„
 * ============================================================================
 * Feature æ¨¡å—ï¼ˆé€šè¿‡ Injection Token æ³¨å…¥ï¼‰ï¼š
 * - MEMORY_FEATURE, TOOL_FEATURE, ORCHESTRATION_FEATURE, SKILL_FEATURE
 * - REALTIME_FEATURE, CONSTRAINT_FEATURE, TEAMS_FEATURE, etc.
 * ============================================================================
 */
@Injectable()
export class AIFacade {
  private readonly logger = new Logger(AIFacade.name);

  // â˜… Sub-facades â€” instantiated at the end of the constructor
  // These are kept for backward-compat internal usage while domain facades are primary
  private readonly modelSub!: ModelSubFacade;
  private readonly teamSub!: TeamSubFacade;
  private readonly memorySub!: MemorySubFacade;
  private readonly agentSub!: AgentSubFacade;
  private readonly toolExecSub!: ToolExecSubFacade;

  // â˜… Late-registered executors â€” set by AI App modules via onModuleInit
  private _researchExecutor?: IDirectResearchExecutor;

  constructor(
    // ==================== æ ¸å¿ƒæœåŠ¡ï¼ˆå¿…éœ€ï¼‰====================
    private readonly aiChatService: AiChatService,
    modelConfigService: AiModelConfigService,

    // ==================== ç‰¹æ€§æ¨¡å—ï¼ˆå¯é€‰ï¼Œé€šè¿‡ Token æ³¨å…¥ï¼‰====================
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

    // ==================== P2 èƒ½åŠ›ä¸‹æ²‰ï¼šRealtime ç‰¹æ€§æ¨¡å— ====================
    @Optional()
    @Inject(REALTIME_FEATURE)
    private readonly realtime?: RealtimeFeature,

    // ==================== Constraint ç‰¹æ€§æ¨¡å— ====================
    @Optional()
    @Inject(CONSTRAINT_FEATURE)
    private readonly constraint?: ConstraintFeature,

    // ==================== Phase 2ï¼šæ–°å¢ž Feature Token æ³¨å…¥ ====================
    @Optional()
    @Inject(TEAMS_FEATURE)
    private readonly teamsFeature?: TeamsFeature,

    @Optional()
    @Inject(CONTENT_FEATURE)
    private readonly content?: ContentFeature,

    @Optional()
    @Inject(KNOWLEDGE_FEATURE)
    private readonly knowledge?: KnowledgeFeature,

    @Optional()
    @Inject(INTELLIGENCE_FEATURE)
    private readonly intelligence?: IntelligenceFeature,

    @Optional()
    @Inject(COLLABORATION_FEATURE)
    private readonly collaboration?: CollaborationFeature,

    @Optional()
    @Inject(OBSERVABILITY_FEATURE)
    private readonly observability?: ObservabilityFeature,

    @Optional()
    @Inject(REGISTRY_FEATURE)
    private readonly registry?: RegistryFeature,

    // ==================== ç›´æŽ¥æ³¨å…¥æœåŠ¡ï¼ˆä¸é€‚åˆèµ° Tokenï¼‰ ====================
    @Optional() private readonly prisma?: PrismaService,
    @Optional()
    @Inject(forwardRef(() => CreditsService))
    private readonly creditsService?: CreditsService,
    @Optional() private readonly modelFallbackService?: ModelFallbackService,
    @Optional()
    modelResolver?: ModelResolverService,
    @Optional() private readonly mcpManagerSvc?: MCPManager,

    // ==================== Phase 5: Domain Facades ====================
    // These are published as public getters for AI App direct consumption
    @Optional() readonly chatDomain?: ChatFacade,
    @Optional() readonly ragDomain?: RAGFacade,
    @Optional() readonly agentDomain?: AgentFacade,
    @Optional() readonly teamDomain?: TeamFacade,
    @Optional() readonly toolDomain?: ToolFacade,
  ) {
    this.logger.log("AIFacade initialized");
    this.logFeatureAvailability();

    // â˜… Instantiate sub-facades after all dependencies are ready
    // Sub-facades remain as a fallback when domain facades are not available
    this.modelSub = new ModelSubFacade(
      aiChatService,
      modelConfigService,
      modelFallbackService,
      orchestration,
      modelResolver,
    );
    this.teamSub = new TeamSubFacade(this.teamsFeature?.teamsService);
    this.memorySub = new MemorySubFacade(memory);
    this.agentSub = new AgentSubFacade(orchestration);
    this.toolExecSub = new ToolExecSubFacade(
      tools,
      tools?.capabilityResolver,
      (req) => this.chat(req),
    );

    // â˜… Wire the chat function into ToolFacade (breaks circular dep at construction time)
    if (toolDomain) {
      toolDomain.setChatFn((req) => this.chat(req));
    }
  }

  /**
   * è®°å½•å¯ç”¨ç‰¹æ€§
   */
  private logFeatureAvailability(): void {
    const features = {
      memory: !!this.memory,
      tools: !!this.tools,
      orchestration: !!this.orchestration,
      skills: !!this.skills,
      realtime: !!this.realtime,
      constraint: !!this.constraint,
      teams: !!this.teamsFeature,
      content: !!this.content,
      knowledge: !!this.knowledge,
      intelligence: !!this.intelligence,
      collaboration: !!this.collaboration,
      observability: !!this.observability,
      registry: !!this.registry,
      database: !!this.prisma,
      credits: !!this.creditsService,
      mcp: !!this.mcpManagerSvc,
    };

    this.logger.log(
      `Available features: ${Object.entries(features)
        .filter(([_, enabled]) => enabled)
        .map(([name]) => name)
        .join(", ")}`,
    );
  }

  // ==================== LLM èƒ½åŠ› ====================

  /**
   * Unified chat entry point with circuit breaker protection and model fallback.
   *
   * Routes through ModelFallbackService when available for automatic model switching
   * on failures. Falls back to single-model call when fallback service is unavailable.
   * Automatically delegates to chatWithSkills when domain/query is provided.
   *
   * @param request - Chat request configuration
   * @param request.messages - Conversation messages
   * @param request.modelType - AI model type (CHAT, IMAGE_GENERATION, etc.)
   * @param request.taskProfile - Semantic task configuration
   * @param request.domain - Optional domain for automatic skill injection
   * @param request.query - Optional query for description-based skill matching
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
    // Step 1: Skill proxy â€” if domain/query provided, delegate to chatWithSkills
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

    // Step 4: Route to provider â€” with automatic model fallback when available
    if (this.modelFallbackService) {
      return this.chatWithFallback(request, modelId);
    }

    return this.chatSingleModel(request, modelId, entityId);
  }

  /**
   * Step 1 â€” Skill proxy: auto-delegate to chatWithSkills when domain/query is present.
   * Returns a ChatResponse when delegation occurred, or null to continue normal flow.
   */
  private async handleSkillProxy(
    request: ChatRequest,
  ): Promise<ChatResponse | null> {
    if (!(request.domain || request.query) || !this.skills) {
      return null;
    }

    this.logger.debug(
      `[chat] K3 Fix: Auto-delegating to chatWithSkills (domain=${request.domain}, query=${request.query})`,
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
      query: request.query,
      additionalSkills: request.additionalSkills,
      skillContext: request.skillContext,
      skipGuardrails: request.skipGuardrails,
    });

    return {
      content: skillResponse.content,
      model: skillResponse.model,
      tokensUsed: skillResponse.tokensUsed,
      isError: skillResponse.isError,
    };
  }

  /**
   * Step 2 â€” Model resolution: resolve the preferred model ID from the request.
   * Priority: explicit request.model â†’ default model for modelType â†’ "default".
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

    return "";
  }

  /**
   * Step 3 â€” Rate limit and budget enforcement.
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
   * â˜… æ ¸å¿ƒæ”¹è¿›ï¼šé€šè¿‡ ModelFallbackService è‡ªåŠ¨åˆ‡æ¢æ¨¡åž‹
   * å½“æ¨¡åž‹è¿”å›ž INVALID_API_KEYã€QUOTA_EXCEEDED ç­‰ä¸å¯æ¢å¤é”™è¯¯æ—¶ï¼Œè‡ªåŠ¨å°è¯•ä¸‹ä¸€ä¸ªå¯ç”¨æ¨¡åž‹
   */
  private async chatWithFallback(
    request: ChatRequest,
    preferredModelId: string,
  ): Promise<ChatResponse> {
    const startTime = Date.now();

    const fallbackResult = await this.modelFallbackService!.executeWithFallback(
      preferredModelId,
      async (modelConfig) => {
        // ä½¿ç”¨ fallback æä¾›çš„ modelConfig è°ƒç”¨ chat
        const result = await this.aiChatService.chat({
          messages: request.messages,
          systemPrompt: request.systemPrompt,
          modelType: request.modelType || AIModelType.CHAT,
          taskProfile: request.taskProfile,
          model: modelConfig.modelId,
          maxTokens: request.maxTokens,
          temperature: request.temperature,
          strictMode: request.strictMode,
          userId: request.billing?.userId ?? RequestContext.getUserId(), // â˜… BYOK: ä¼ é€’ userId ç”¨äºŽ Key ä¼˜å…ˆçº§è§£æž
          processId: request.processId,
          skipGuardrails: request.skipGuardrails,
          sharedCachePrefix: request.sharedCachePrefix,
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
        `[chat] Model fallback used: ${fallbackResult.attemptedModels.join(" â†’ ") || fallbackResult.modelUsed} â†’ final=${fallbackResult.modelUsed} (${fallbackResult.attempts} attempts, ${duration}ms)`,
      );
    }

    if (fallbackResult.success && fallbackResult.data) {
      const result = fallbackResult.data;
      const tokensUsed = result.usage?.totalTokens || 0;

      // ç†”æ–­å™¨è®°å½•æˆåŠŸ
      const entityId = `chat:${result.model}`;
      this.orchestration?.circuitBreaker?.recordSuccess(entityId, duration);

      // â˜… è‡ªåŠ¨ç§¯åˆ†æ‰£é™¤ï¼ˆBYOK: ç”¨æˆ·è‡ªç”¨ Key ä¸æ‰£ç§¯åˆ†ï¼‰
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

    // æ‰€æœ‰æ¨¡åž‹éƒ½å¤±è´¥
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
   * å•æ¨¡åž‹è°ƒç”¨ï¼ˆfallback ä¸å¯ç”¨æ—¶çš„åŽå¤‡è·¯å¾„ï¼‰
   */
  private async chatSingleModel(
    request: ChatRequest,
    modelId: string,
    entityId: string,
  ): Promise<ChatResponse> {
    // ç†”æ–­å™¨æ£€æŸ¥
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
        userId: request.billing?.userId ?? RequestContext.getUserId(), // â˜… BYOK: ä¼ é€’ userId
        processId: request.processId,
        skipGuardrails: request.skipGuardrails,
        sharedCachePrefix: request.sharedCachePrefix,
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

      // â˜… BYOK: ç”¨æˆ·è‡ªç”¨ Key ä¸æ‰£ç§¯åˆ†
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

  // ==================== ç»“æž„åŒ–è¾“å‡º ====================

  /**
   * ç»“æž„åŒ–è¾“å‡ºï¼šLLM å“åº” â†’ ç±»åž‹å®‰å…¨çš„ JSON å¯¹è±¡
   *
   * è‡ªåŠ¨åœ¨ system prompt ä¸­æ³¨å…¥ JSON Schema çº¦æŸï¼Œ
   * è§£æžå“åº”ä¸ºç±»åž‹å®‰å…¨å¯¹è±¡ï¼Œè§£æžå¤±è´¥æ—¶è‡ªåŠ¨é‡è¯•ã€‚
   *
   * @example
   * interface Analysis { themes: string[]; score: number; }
   * const result = await facade.chatStructured<Analysis>({
   *   messages: [{ role: "user", content: "åˆ†æžè¿™ç¯‡æ–‡ç« " }],
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
   * // result.data.themes â€” string[]
   * // result.data.score â€” number
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
        strictMode: request.strictMode ?? false,
      };

      const response = await this.chat(chatRequest);
      totalTokens += response.tokensUsed;
      lastModel = response.model;
      lastRawContent = response.content;

      if (response.isError) {
        lastError = new Error(response.content);
        continue;
      }

      // å°è¯•è§£æž JSON
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

    // æ‰€æœ‰é‡è¯•éƒ½å¤±è´¥
    if (throwOnParseError) {
      throw new Error(
        `Structured output parse failed after ${maxRetries + 1} attempts: ${lastError?.message}`,
      );
    }

    // éžä¸¥æ ¼æ¨¡å¼ï¼šè¿”å›žç©ºå¯¹è±¡
    return {
      data: {} as T,
      rawContent: lastRawContent,
      model: lastModel,
      tokensUsed: totalTokens,
      retriedParse: true,
    };
  }

  /**
   * ä»Ž LLM å“åº”ä¸­æå– JSON å†…å®¹
   * å¤„ç†å¸¸è§çš„ markdown ä»£ç å—åŒ…è£¹
   */
  private extractJson(content: string): string {
    let cleaned = content.trim();

    // ç§»é™¤ markdown ä»£ç å—
    const jsonBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (jsonBlockMatch) {
      cleaned = jsonBlockMatch[1].trim();
    }

    // ç§»é™¤å¼€å¤´çš„éž JSON æ–‡æœ¬ï¼ˆæ‰¾åˆ°ç¬¬ä¸€ä¸ª { æˆ– [ï¼‰
    const firstBrace = cleaned.indexOf("{");
    const firstBracket = cleaned.indexOf("[");
    const start = Math.min(
      firstBrace >= 0 ? firstBrace : Infinity,
      firstBracket >= 0 ? firstBracket : Infinity,
    );

    if (start !== Infinity && start > 0) {
      cleaned = cleaned.substring(start);
    }

    // ç§»é™¤æœ«å°¾çš„éž JSON æ–‡æœ¬
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

    // â˜… BYOK: BillingContext ä¸ºç©ºæ—¶ï¼ˆå…¬å…±ç«¯ç‚¹ï¼‰ï¼Œä»Ž RequestContext èŽ·å– userId
    const userId = RequestContext.getUserId();
    if (!userId) return undefined;
    this.logger.warn(
      `[Billing] Fallback billing context used â€” caller did not set BillingContext. userId=${userId}`,
    );
    return {
      userId,
      moduleType: "ai-ask",
      operationType: "chat",
    };
  }

  /**
   * â˜… BYOK: ç»Ÿä¸€ç§¯åˆ†æ‰£é™¤é€»è¾‘
   * ç”¨æˆ·è‡ªç”¨ Key (personal) ä¸æ‰£ç§¯åˆ†
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
   * @param request.query - Query for description-based skill matching
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
   * });
   */
  async chatWithSkills(
    request: ChatWithSkillsRequest,
  ): Promise<ChatWithSkillsResponse> {
    this.logger.log(
      `[Skills] â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•`,
    );
    // Auto-extract query from last user message if not provided
    const query =
      request.query || this.extractQueryFromMessages(request.messages);

    this.logger.log(
      `[Skills] chatWithSkills START: query="${query?.slice(0, 60) || ""}", domain="${request.domain || ""}"`,
    );

    // æ£€æŸ¥ Skills æœåŠ¡æ˜¯å¦å¯ç”¨
    if (!this.skills?.loader || !this.skills?.promptBuilder) {
      this.logger.warn(
        "[Skills] âš ï¸ Skills services not available, falling back to plain chat",
      );
      // é™çº§åˆ°æ™®é€š chat
      const result = await this.chat({
        messages: request.messages,
        modelType: request.modelType as AIModelType,
        model: request.model,
        taskProfile: request.taskProfile,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        strictMode: request.strictMode,
        skipGuardrails: request.skipGuardrails,
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

    // 1. åŠ è½½åŒ¹é…çš„ Skills
    this.logger.log(`[Skills] Step 1: Loading skills for task...`);
    const skills = await this.skills?.loader.getSkillsForTask({
      query,
      domain: request.domain,
      additionalSkillIds: request.additionalSkills,
      maxTokenBudget: SKILLS_PROMPT_TOKEN_BUDGET,
    });

    // 2. ç»„è£… System Prompt
    this.logger.log(`[Skills] Step 2: Building System Prompt...`);
    const buildResult = this.skills?.promptBuilder.buildSystemPrompt(skills, {
      context: request.skillContext,
      maxTokens: SKILLS_PROMPT_TOKEN_BUDGET,
      includeMetadata: false,
    });

    // 3. æž„å»ºæ¶ˆæ¯åˆ—è¡¨ï¼ˆSkills System Prompt + åŽŸå§‹æ¶ˆæ¯ï¼‰
    const messagesWithSkills = [
      ...(buildResult.prompt
        ? [{ role: "system" as const, content: buildResult.prompt }]
        : []),
      ...request.messages,
    ];

    // 4. è°ƒç”¨åº•å±‚ chat æ–¹æ³•
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
      skipGuardrails: request.skipGuardrails,
    });

    // 5. è¾“å‡ºå®ŒæˆæŠ¥å‘Š
    this.logger.log(
      `[Skills] âœ… chatWithSkills COMPLETE: ${buildResult.usedSkills.length} skills, ${buildResult.estimatedTokens} skill tokens, ${result.tokensUsed} total tokens`,
    );
    this.logger.log(
      `[Skills]   â””â”€ Skills used: [${buildResult.usedSkills.join(", ")}]`,
    );
    this.logger.log(
      `[Skills] â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•`,
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

    // ç†”æ–­å™¨æ£€æŸ¥
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
      // å¢žåŠ è´Ÿè½½è®¡æ•°
      this.orchestration?.circuitBreaker?.incrementLoad(entityId);

      // ä½¿ç”¨ AiChatService çš„çœŸæ­£æµå¼è¾“å‡º
      let streamApiKeySource: string | undefined;
      let tokensUsed = 0;
      let accumulatedContentLength = 0; // ç”¨äºŽå›žé€€ä¼°ç®—

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
        userId: request.billing?.userId ?? RequestContext.getUserId(), // â˜… BYOK: ä¼ é€’ userId
        skipGuardrails: request.skipGuardrails,
      })) {
        // æ•èŽ· apiKeySourceï¼ˆåœ¨æœ€ç»ˆ chunk ä¸­æºå¸¦ï¼‰
        if (chunk.apiKeySource) {
          streamApiKeySource = chunk.apiKeySource;
        }

        // â˜… æ•èŽ· usage ä¿¡æ¯ï¼ˆåœ¨æœ€ç»ˆ chunk ä¸­æºå¸¦ï¼‰
        if (chunk.usage) {
          tokensUsed = chunk.usage.totalTokens;
          this.logger.debug(
            `[chatStream] Received usage from stream: ${tokensUsed} tokens`,
          );
        }

        // ç´¯ç§¯å†…å®¹é•¿åº¦ï¼ˆç”¨äºŽå›žé€€ä¼°ç®—ï¼‰
        if (chunk.content) {
          accumulatedContentLength += chunk.content.length;
        }

        yield { content: chunk.content, done: chunk.done, error: chunk.error };

        // å¦‚æžœæœ‰é”™è¯¯ï¼Œè®°å½•å¤±è´¥
        if (chunk.error) {
          this.orchestration?.circuitBreaker?.recordFailure(
            entityId,
            TaskCompletionType.API_ERROR,
            chunk.error,
          );
        }
      }

      // â˜… å›žé€€ä¼°ç®—ï¼šå¦‚æžœ API æœªè¿”å›ž usageï¼ŒåŸºäºŽå†…å®¹é•¿åº¦ä¼°ç®—
      if (tokensUsed === 0 && accumulatedContentLength > 0) {
        // ä¼°ç®—è§„åˆ™ï¼šçº¦ 4 å­—ç¬¦ = 1 token
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

      // æµå¼å®Œæˆï¼Œè®°å½•æˆåŠŸ
      this.orchestration?.circuitBreaker?.recordSuccess(entityId, 0);

      // â˜… BYOK: æµå¼å®ŒæˆåŽç§¯åˆ†æ‰£é™¤ï¼ˆçŽ°åœ¨ä¼šä¼ é€’å®žé™…çš„ token æ•°ï¼‰
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
      // å‡å°‘è´Ÿè½½è®¡æ•°
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
    return this.modelSub.selectModel(options);
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
    return this.modelSub.getReasoningModel();
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
    return this.modelSub.getAvailableModelsExtended(modelType);
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
    return this.modelSub.getAvailableModels(modelType);
  }

  // ==================== æ¨¡åž‹é…ç½®èŽ·å–ï¼ˆä¾› AI Apps ä½¿ç”¨ï¼‰====================

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
    return this.modelSub.getDefaultTextModel();
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
    return this.modelSub.getDefaultImageModel();
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
    // â˜… é¢å¤–å­—æ®µï¼šæ”¯æŒéž CHAT ç±»åž‹æ¨¡åž‹ï¼ˆå¦‚ IMAGE_GENERATIONï¼‰
    apiKey?: string | null;
    secretKey?: string | null;
    modelType?: string;
  } | null> {
    return this.modelSub.getModelById(idOrModelId);
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
    return this.modelSub.getFullModelConfig(modelId);
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
    return this.modelSub.getDefaultModelByType(modelType);
  }

  // ==================== æœç´¢èƒ½åŠ› ====================

  /**
   * åˆ›å»ºå·¥å…·æ‰§è¡Œä¸Šä¸‹æ–‡
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

    // â˜… ä¼˜å…ˆé€šè¿‡ ToolRegistry è°ƒç”¨ web-search å·¥å…·
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

    // â˜… ToolRegistry ä¸å¯ç”¨æ—¶è¿”å›žé”™è¯¯
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

  // ==================== å›¢é˜Ÿåä½œèƒ½åŠ› ====================

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
    return this.teamSub.startTeamMission(request);
  }

  /**
   * Executes a skill with optional LLM adapter injection.
   *
   * Sets the LLM adapter on code-based skills that expose `setLLMAdapter`,
   * then calls `skill.execute(input, context)`. PromptSkillAdapters already
   * use the facade internally and do not need adapter injection.
   *
   * @param skill - The skill instance to execute
   * @param input - Input data passed to the skill
   * @param context - Skill execution context (executionId, skillId, etc.)
   * @returns Skill execution result
   */
  async executeSkill(
    skill: ISkill,
    input: unknown,
    context: SkillContext,
  ): Promise<SkillResult> {
    const hasSetLLMAdapter =
      "setLLMAdapter" in skill &&
      typeof (skill as { setLLMAdapter: unknown }).setLLMAdapter === "function";

    if (hasSetLLMAdapter) {
      if (this.skills?.llmAdapter) {
        (
          skill as { setLLMAdapter: (a: AiChatLLMAdapter) => void }
        ).setLLMAdapter(this.skills?.llmAdapter);
      } else {
        this.logger.warn(
          `[executeSkill] Skill "${context.skillId}" expects LLM adapter (setLLMAdapter) but llmAdapterForSkills is not available â€” execution may fail`,
        );
      }
    }
    // 2026-05-01 (PR-X-R): inject ToolPipeline if skill supports it
    const hasSetToolPipeline =
      "setToolPipeline" in skill &&
      typeof (skill as { setToolPipeline: unknown }).setToolPipeline ===
        "function";
    if (hasSetToolPipeline && this.skills?.toolPipeline) {
      (skill as { setToolPipeline: (p: ToolPipeline) => void }).setToolPipeline(
        this.skills.toolPipeline,
      );
    }
    return skill.execute(input, context);
  }

  /**
   * Resolves declarative input bindings for a PromptSkillAdapter.
   *
   * Checks whether the given skill is a PromptSkillAdapter with declared
   * input bindings, and if so, resolves those bindings against the provided
   * context. Returns the resolved input map, or null if the skill is not
   * a PromptSkillAdapter or has no bindings declared.
   *
   * @param skill - Skill instance (may or may not be a PromptSkillAdapter)
   * @param bindingContext - Context for resolving binding declarations
   * @returns Resolved input map, or null if not applicable
   */
  resolveSkillInputBindings(
    skill: ISkill,
    bindingContext: BindingContext,
  ): Record<string, unknown> | null {
    const adapter = skill as PromptSkillAdapter;
    if (!adapter.isPromptSkillAdapter) {
      return null;
    }
    const bindings = adapter.getInputBindings();
    if (!bindings || !this.skills?.inputBindingResolver) {
      return null;
    }
    return this.skills?.inputBindingResolver.resolve(bindings, bindingContext);
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
    return this.teamSub.cancelMission(missionId);
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
    return this.teamSub.getMissionStatus(missionId);
  }

  /**
   * Executes a team mission and streams events as they occur.
   *
   * Yields MissionEvents (step_started, step_completed, mission_completed, etc.)
   * in real-time as the team progresses through the mission.
   *
   * @param dto - Mission creation data including teamId, goal, context, and metadata
   * @yields MissionEvent stream â€” one event per team step / lifecycle transition
   */
  async *executeMissionStream(
    dto: CreateMissionDto,
  ): AsyncGenerator<MissionEvent> {
    yield* this.teamSub.executeMissionStream(dto);
  }

  // ==================== ä¸Šä¸‹æ–‡èƒ½åŠ› ====================

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
          // â˜… æž¶æž„åˆ†å±‚ï¼šä¼˜å…ˆä½¿ç”¨é¢„æŸ¥è¯¢çš„æ•°æ®ï¼Œé¿å… Engine å±‚ä¾èµ– App å±‚ä¸šåŠ¡æ¨¡åž‹
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
            // å…¼å®¹æ—§ä»£ç ï¼šç›´æŽ¥æŸ¥è¯¢ï¼ˆä¸æŽ¨èï¼Œè¿åæž¶æž„åˆ†å±‚ï¼‰
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
          // â˜… æž¶æž„åˆ†å±‚ï¼šä¼˜å…ˆä½¿ç”¨é¢„æŸ¥è¯¢çš„æ•°æ®ï¼Œé¿å… Engine å±‚ä¾èµ– App å±‚ä¸šåŠ¡æ¨¡åž‹
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
              // æˆªå–å‰ 2000 å­—ç¬¦
              const text =
                resource.content.length > 2000
                  ? resource.content.substring(0, 2000) + "..."
                  : resource.content;
              resourceContext += `\nContent:\n${text}`;
            }
            parts.push(resourceContext);
          } else if (source.id && this.prisma) {
            // å…¼å®¹æ—§ä»£ç ï¼šç›´æŽ¥æŸ¥è¯¢ï¼ˆä¸æŽ¨èï¼Œè¿åæž¶æž„åˆ†å±‚ï¼‰
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
                // æˆªå–å‰ 2000 å­—ç¬¦
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

    // Token é™åˆ¶å¤„ç†
    if (request.maxTokens && request.compress) {
      const estimatedTokens = this.estimateTokens(context);
      if (estimatedTokens > request.maxTokens) {
        context = this.compressContext(context, request.maxTokens);
      }
    }

    return context;
  }

  /**
   * ä¼°ç®— token æ•°é‡
   */
  private estimateTokens(text: string): number {
    // ä¸­æ–‡æ¯å­—çº¦ 2 tokenï¼Œè‹±æ–‡æ¯ 4 å­—ç¬¦çº¦ 1 token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars * 2 + otherChars / 4);
  }

  /**
   * åŽ‹ç¼©ä¸Šä¸‹æ–‡åˆ°æŒ‡å®š token æ•°
   */
  private compressContext(context: string, maxTokens: number): string {
    const currentTokens = this.estimateTokens(context);
    if (currentTokens <= maxTokens) {
      return context;
    }

    // è®¡ç®—éœ€è¦ä¿ç•™çš„æ¯”ä¾‹
    const ratio = maxTokens / currentTokens;
    const targetLength = Math.floor(context.length * ratio * 0.9); // ç•™ 10% ä½™é‡

    // ä¼˜å…ˆä¿ç•™å¼€å¤´å’Œç»“å°¾
    const headLength = Math.floor(targetLength * 0.6);
    const tailLength = Math.floor(targetLength * 0.3);

    const head = context.substring(0, headLength);
    const tail = context.substring(context.length - tailLength);

    return `${head}\n\n[... content compressed ...]\n\n${tail}`;
  }

  /**
   * Extract query string from the last user message for description-based skill matching.
   */
  private extractQueryFromMessages(
    messages: Array<{ role: string; content: string }>,
  ): string {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user" && messages[i].content) {
        return messages[i].content.slice(0, 200);
      }
    }
    return "";
  }

  // ==================== çº¦æŸèƒ½åŠ› ====================

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

    // 1. æ£€æŸ¥ token é™åˆ¶
    if (request.constraints.maxTokens) {
      const estimatedTokens = this.estimateTokens(request.content);
      if (estimatedTokens > request.constraints.maxTokens) {
        violations.push({
          type: "token_limit",
          message: `Content exceeds token limit: ${estimatedTokens} > ${request.constraints.maxTokens}`,
        });
      }
    }

    // 2. å†…å®¹è¿‡æ»¤ï¼ˆæ•æ„Ÿä¿¡æ¯æ£€æµ‹ï¼‰
    if (request.constraints.contentFilter?.enabled) {
      for (const pattern of SENSITIVE_PATTERNS) {
        if (pattern.test(request.content)) {
          violations.push({
            type: "content_filter",
            message: `Content contains potentially sensitive information matching pattern: ${pattern.source}`,
          });
        }
      }

      // è‡ªå®šä¹‰è§„åˆ™
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

    // 3. JSON Schema éªŒè¯
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

    // å¦‚æžœæœ‰è¿è§„ï¼Œå°è¯•ç”Ÿæˆè°ƒæ•´åŽçš„å†…å®¹
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
   * ç®€å•çš„ JSON Schema éªŒè¯
   */
  private validateJsonSchema(data: unknown, schema: object): boolean {
    // åŸºç¡€å®žçŽ°ï¼šæ£€æŸ¥å¿…éœ€å­—æ®µå’Œç±»åž‹
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

  // ==================== è®°å¿†èƒ½åŠ› ====================

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
    return this.memorySub.storeMemory(request);
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
    return this.memorySub.retrieveMemory(request);
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
    return this.memorySub.clearMemory(sessionId);
  }

  // ==================== Session Memory (raw key-value) ====================

  /**
   * Get a value from session memory by key.
   * Unlike storeMemory/retrieveMemory (structured MemoryType data),
   * these methods expose raw key-value storage for arbitrary data (e.g. MessageWithContext[]).
   */
  async sessionMemoryGet(sessionId: string, key: string): Promise<unknown> {
    return this.memorySub.sessionMemoryGet(sessionId, key);
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
    return this.memorySub.sessionMemorySet(sessionId, key, value, ttl);
  }

  /**
   * Clear all session memory for a given session.
   */
  async sessionMemoryClear(sessionId: string): Promise<void> {
    return this.memorySub.sessionMemoryClear(sessionId);
  }

  // ==================== Agent æ‰§è¡Œèƒ½åŠ› ====================

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
    return this.agentSub.executeAgent(request);
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
    return this.agentSub.isAgentAvailable(agentId);
  }

  // ==================== Tool æ‰§è¡Œèƒ½åŠ› ====================

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
    return this.toolExecSub.executeTool<T>(request);
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
    return this.toolExecSub.getAvailableTools(category);
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
    return this.toolExecSub.isToolAvailable(toolId);
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
    return this.toolExecSub.getToolFunctionDefinitions(toolIds);
  }

  // ==================== â˜… NEW: AI Capability èƒ½åŠ› ====================

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
    return this.toolExecSub.getAvailableCapabilities(context);
  }

  // listModuleCapabilities å·²åˆ  (2026-04-30) â€” ä»…æœåŠ¡äºŽ buildSuggestedActions
  // (å‰ç«¯ 0 æ¶ˆè´¹çš„ suggestedActions å­—æ®µ)ï¼ŒIntentRouter é“¾è·¯å…¨åˆ

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
    return this.toolExecSub.chatWithTools(request);
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
    yield* this.toolExecSub.chatWithToolsStream(request);
  }

  /**
   * Check if streaming tool execution is available (executor + llmAdapter).
   */
  isToolExecutionAvailable(): boolean {
    return this.toolExecSub.isToolExecutionAvailable();
  }

  // ==================== ç®¡ç†åŠŸèƒ½ ====================

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
  // â˜… P2 èƒ½åŠ›ä¸‹æ²‰ï¼šå®žæ—¶æŽ¨é€èƒ½åŠ›
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

  // ==================== å¯è§‚æµ‹æ€§èƒ½åŠ›ï¼ˆTrace / Spanï¼‰====================

  /** å¼€å§‹ä¸€ä¸ªæ–°çš„ Traceï¼Œè¿”å›ž traceIdï¼ˆæˆ– undefined å¦‚æžœ TraceCollector ä¸å¯ç”¨ï¼‰ */
  startTrace(input: CreateTraceInput): string | undefined {
    return this.observability?.traceCollector?.startTrace(input);
  }

  /** åœ¨æŒ‡å®š Trace ä¸‹æ·»åŠ ä¸€ä¸ª Spanï¼Œè¿”å›ž spanIdï¼ˆæˆ– undefinedï¼‰ */
  addSpan(traceId: string, input: CreateSpanInput): string | undefined {
    return this.observability?.traceCollector?.addSpan(traceId, input);
  }

  /** ç»“æŸä¸€ä¸ª Span */
  endSpan(spanId: string, input: EndSpanInput): void {
    this.observability?.traceCollector?.endSpan(spanId, input);
  }

  /** ç»“æŸä¸€ä¸ª Trace */
  endTrace(traceId: string, input: EndTraceInput): void {
    this.observability?.traceCollector?.endTrace(traceId, input);
  }

  // ==================== è®°å¿†åè°ƒå™¨ï¼ˆMemoryCoordinatorï¼‰====================

  /** å†™å…¥è·¨å±‚è®°å¿†ï¼ˆfire-and-forgetï¼Œä¸é˜»å¡žä¸»æµç¨‹ï¼‰ */
  coordinatorStore(
    event: MemoryEvent,
    userId: string,
    sessionId?: string,
  ): Promise<void> | undefined {
    return this.observability?.memoryCoordinator?.store(
      event,
      userId,
      sessionId,
    );
  }

  /** å¹¶è¡Œå¬å›žè·¨å±‚è®°å¿† */
  coordinatorRecall(
    query: MemoryQuery,
    userId: string,
    sessionId?: string,
  ): Promise<MemoryContext> | undefined {
    return this.observability?.memoryCoordinator?.recall(
      query,
      userId,
      sessionId,
    );
  }

  // ==================== A2A æ¶ˆæ¯æ€»çº¿ï¼ˆA2ABusï¼‰====================

  /** å‘å¸ƒ A2A æ¶ˆæ¯ï¼ˆAgent é—´é€šä¿¡ï¼‰ */
  a2aPublish<TPayload = unknown>(params: {
    sessionId: string;
    fromAgentId: string;
    toAgentId?: string;
    type: A2AMessageType;
    payload: TPayload;
    priority?: A2APriority;
    replyToId?: string;
    correlationId?: string;
    ttlMs?: number;
  }): Promise<A2AMessage<TPayload>> | undefined {
    return this.collaboration?.a2aBus?.publish(params);
  }

  /** æ¸…ç† A2A ä¼šè¯ï¼ˆé‡Šæ”¾è®¢é˜…å’ŒåŽ†å²æ¶ˆæ¯ï¼‰ */
  a2aClearSession(sessionId: string): void {
    this.collaboration?.a2aBus?.clearSession(sessionId);
  }

  // ==================== åæ€ï¼ˆReflectionï¼‰====================

  /** å¯¹å½“å‰æ‰§è¡ŒçŠ¶æ€è¿›è¡Œè´¨é‡åæ€ï¼Œè¿”å›žè¯„åˆ†ã€ç¼ºå£å’Œå†³ç­– */
  reflect(
    input: ReflectionInput,
    config?: ReflectionConfig,
  ): Promise<ReflectionResult> | undefined {
    return this.intelligence?.reflection?.reflect(input, config);
  }

  // ==================== ä¸Šä¸‹æ–‡åŽ‹ç¼©ï¼ˆContextCompressionï¼‰====================

  /** åŽ‹ç¼©å¤§ä¸Šä¸‹æ–‡åˆ°ç›®æ ‡å¤§å°ï¼Œä¿ç•™å…³é”®ä¿¡æ¯ï¼ˆAI åˆ†å—æ‘˜è¦ï¼Œéžç®€å•æˆªæ–­ï¼‰ */
  aiCompressContext(
    content: string,
    options?: CompressionOptions,
  ): Promise<CompressionResult> | undefined {
    return this.intelligence?.contextCompression?.compress(content, options);
  }

  // ==================== æŠ¥å‘Šåˆæˆï¼ˆReportSynthesisEngineï¼‰====================

  /** æ¸…æ´—æŠ¥å‘Š Markdownï¼ˆç§»é™¤å¤šä½™ç©ºè¡Œã€æ ¼å¼è§„èŒƒåŒ–ï¼‰ï¼›æœåŠ¡ä¸å¯ç”¨æ—¶åŽŸæ ·è¿”å›ž */
  sanitizeReport(text: string): string {
    return this.intelligence?.synthesisEngine?.sanitizeReport(text) ?? text;
  }

  // ==================== è¯æ®ç®¡ç†ï¼ˆEvidenceManagerï¼‰====================

  /** ä¿å­˜è¯æ®åˆ° Engine Evidence å­˜å‚¨ */
  evidenceSave(request: SaveEvidenceRequest): Promise<void> | undefined {
    return this.collaboration?.evidenceManager
      ?.save(request)
      .then(() => undefined);
  }

  // ==================== æŠ•ç¥¨ç®¡ç†ï¼ˆVotingManagerï¼‰====================

  /** åˆ›å»ºæŠ•ç¥¨ä¼šè¯ï¼›VotingManager ä¸å¯ç”¨æ—¶è¿”å›ž undefined */
  votingCreate(request: VoteRequest): VotingSession | undefined {
    return this.collaboration?.votingManager?.createVote(request);
  }

  /** æŠ•ç¥¨ï¼ˆæŸä¸ªæŠ•ç¥¨äººä¸ºæŸä¸ªé€‰é¡¹æŠ•ç¥¨ï¼‰ */
  votingCastVote(sessionId: string, voterId: string, optionId: string): void {
    this.collaboration?.votingManager?.castVote(sessionId, voterId, optionId);
  }

  /** å…³é—­æŠ•ç¥¨å¹¶è®¡ç¥¨ï¼›VotingManager ä¸å¯ç”¨æ—¶è¿”å›ž undefined */
  votingClose(
    sessionId: string,
    totalVoters: number,
  ): VoteResult | null | undefined {
    return this.collaboration?.votingManager?.closeVote(sessionId, totalVoters);
  }

  // ==================== å®žæ—¶æŽ¨é€ï¼ˆRealtimeï¼‰ç›´æŽ¥è®¿é—® ====================

  /** èŽ·å– EngineEventEmitterService å®žä¾‹ï¼ˆç”¨äºŽé€‚é…å±‚ç›´æŽ¥è°ƒç”¨ï¼‰ */
  get realtimeEmitter() {
    return this.realtime?.eventEmitter;
  }

  /** èŽ·å– ProgressTrackerService å®žä¾‹ï¼ˆç”¨äºŽé€‚é…å±‚ç›´æŽ¥è°ƒç”¨ï¼‰ */
  get realtimeProgress() {
    return this.realtime?.progressTracker;
  }

  // ==================== èƒ½åŠ›è§£æžï¼ˆAICapabilityResolverï¼‰====================

  /** è§£æž Agent å¯ç”¨å·¥å…·åˆ—è¡¨ï¼›æœåŠ¡ä¸å¯ç”¨æ—¶è¿”å›žç©ºæ•°ç»„ */
  async capabilityResolveTools(
    context: AICapabilityContext,
  ): Promise<string[]> {
    return (
      (await this.tools?.capabilityResolver?.resolveToolsForAgent(context)) ??
      []
    );
  }

  /** èŽ·å–æŠ€èƒ½ Prompt åŒ…ï¼›æœåŠ¡ä¸å¯ç”¨æ—¶è¿”å›ž null */
  async capabilityGetSkillPrompts(
    context: AICapabilityContext,
    options?: SkillPromptOptions,
  ): Promise<SkillPromptBundle | null> {
    return (
      (await this.tools?.capabilityResolver?.getSkillPrompts(
        context,
        options,
      )) ?? null
    );
  }

  // ==================== æŠ€èƒ½åŠ è½½ï¼ˆSkillLoaderServiceï¼‰====================

  /** èŽ·å–æ‰€æœ‰å·²åŠ è½½çš„æŠ€èƒ½å®šä¹‰ï¼›æœåŠ¡ä¸å¯ç”¨æ—¶è¿”å›žç©ºæ•°ç»„ */
  skillLoaderGetAll(): SkillMdDefinition[] {
    return this.skills?.loader.getAllLoadedSkills() ?? [];
  }

  // ==================== Embeddingï¼ˆEmbeddingServiceï¼‰====================

  /** ç”Ÿæˆå•æ¡æ–‡æœ¬çš„å‘é‡åµŒå…¥ï¼›æœåŠ¡ä¸å¯ç”¨æ—¶è¿”å›ž null */
  async embeddingGenerate(text: string): Promise<EmbeddingResult | null> {
    return (await this.knowledge?.embedding?.generateEmbedding(text)) ?? null;
  }

  /** èŽ·å–å½“å‰åµŒå…¥æ¨¡åž‹æ ‡è¯†ï¼›æœåŠ¡ä¸å¯ç”¨æ—¶è¿”å›ž null */
  async embeddingGetModel(): Promise<string | null> {
    return (await this.knowledge?.embedding?.getModel()) ?? null;
  }

  // ==================== å‘é‡æ£€ç´¢ï¼ˆVectorServiceï¼‰====================

  /** ç›¸ä¼¼åº¦å‘é‡æœç´¢ï¼›æœåŠ¡ä¸å¯ç”¨æ—¶è¿”å›žç©ºæ•°ç»„ */
  async vectorSimilaritySearch(
    queryEmbedding: number[],
    options?: SimilaritySearchOptions,
  ): Promise<SimilarityResult[]> {
    return (
      (await this.knowledge?.vector?.similaritySearch(
        queryEmbedding,
        options,
      )) ?? []
    );
  }

  // ==================== MCPï¼ˆMCPManagerï¼‰ç›´æŽ¥è®¿é—® ====================

  /** èŽ·å– MCPManager å®žä¾‹ï¼ˆç”¨äºŽ MCP é€‚é…å±‚ç›´æŽ¥è°ƒç”¨ï¼‰ */
  get mcpManager(): MCPManager | undefined {
    return this.mcpManagerSvc;
  }

  // ==================== ç¼–æŽ’æœåŠ¡ï¼ˆOrchestrationï¼‰ç›´æŽ¥è®¿é—® ====================

  /** èŽ·å– CircuitBreakerServiceï¼ˆç”¨äºŽ Teams æ‰§è¡Œå±‚è´Ÿè½½æŽ§åˆ¶ï¼‰ */
  get circuitBreaker(): CircuitBreakerService | undefined {
    return this.orchestration?.circuitBreaker;
  }

  /** èŽ·å– AgentExecutorServiceï¼ˆç”¨äºŽ Teams ä»»åŠ¡æ‰§è¡Œï¼‰ */
  get agentExecutor(): AgentExecutorService | undefined {
    return this.orchestration?.agentExecutor;
  }

  // taskDecomposer getter å·²åˆ  (2026-04-30)

  /** èŽ·å– IntentDetectionServiceï¼ˆç”¨äºŽä¸Šä¸‹æ–‡æ„å›¾è¯†åˆ«ï¼‰ */
  get intentDetector(): IntentDetectionService | undefined {
    return this.orchestration?.intentDetector;
  }

  /** èŽ·å– ExecutionStateManagerï¼ˆç”¨äºŽä»»åŠ¡çŠ¶æ€è·Ÿè¸ªï¼‰ */
  get execStateManager(): ExecutionStateManager | undefined {
    return this.orchestration?.execStateManager;
  }

  /** èŽ·å– FunctionCallingLLMAdapterï¼ˆç”¨äºŽå‡½æ•°è°ƒç”¨ LLMï¼‰ */
  get functionCallingAdapter(): FunctionCallingLLMAdapter | undefined {
    return this.tools?.llmAdapter;
  }

  /** èŽ·å– FunctionCallingExecutorï¼ˆç”¨äºŽå‡½æ•°è°ƒç”¨æ‰§è¡Œï¼‰ */
  get functionCallingExecutor(): FunctionCallingExecutor | undefined {
    return this.tools?.executor;
  }

  /** èŽ·å– ModelFallbackServiceï¼ˆç”¨äºŽæ¨¡åž‹å®¹é”™åˆ‡æ¢ï¼‰ */
  get modelFallback(): ModelFallbackService | undefined {
    return this.modelFallbackService;
  }

  /** èŽ·å– TeamsService å®žä¾‹ï¼ˆç”¨äºŽ ai-teams-integration é€‚é…å±‚ï¼‰ */
  get teams(): TeamsService | undefined {
    return this.teamsFeature?.teamsService;
  }

  /** èŽ·å– ContextInitializationServiceï¼ˆç”¨äºŽ mission ä¸Šä¸‹æ–‡åˆå§‹åŒ–ï¼‰ */
  get contextInit(): ContextInitializationService | undefined {
    return this.teamsFeature?.contextInit;
  }

  /** èŽ·å– TeamFactoryï¼ˆç”¨äºŽå†™ä½œ/å›¢é˜Ÿåè°ƒå™¨ï¼‰ */
  get teamFactory(): TeamFactory | undefined {
    return this.teamsFeature?.teamFactory;
  }

  // â˜… longContentEngine and continuationProtocol getters REMOVED (Phase 6).
  // Consumers now inject LongContentEngineService / ContinuationProtocolService directly.

  /** èŽ·å– EmbeddingServiceï¼ˆä¾› RAG æ¨¡å—ç›´æŽ¥ä½¿ç”¨ï¼‰ */
  get embedding(): EmbeddingService | undefined {
    return this.knowledge?.embedding;
  }

  /** èŽ·å– VectorServiceï¼ˆä¾› RAG æ¨¡å—ç›´æŽ¥ä½¿ç”¨ï¼‰ */
  get vector(): VectorService | undefined {
    return this.knowledge?.vector;
  }

  /** èŽ·å– MissionOrchestratorï¼ˆä¾›å†™ä½œ/å›¢é˜Ÿä»»åŠ¡ç¼–æŽ’ä½¿ç”¨ï¼‰ */
  get missionOrchestrator(): MissionOrchestrator | undefined {
    return this.teamsFeature?.missionOrchestrator;
  }

  /** èŽ·å– AICapabilityResolverï¼ˆä¾›éœ€è¦ç›´æŽ¥è°ƒç”¨ logCapabilityUsage ç­‰æ–¹æ³•çš„ä½¿ç”¨ï¼‰ */
  get capabilityResolverService(): AICapabilityResolver | undefined {
    return this.tools?.capabilityResolver;
  }

  /** èŽ·å– OutputReviewerServiceï¼ˆä¾›ä»»åŠ¡å®¡æ ¸ä½¿ç”¨ï¼‰ */
  get outputReviewer(): OutputReviewerService | undefined {
    return this.orchestration?.outputReviewer;
  }

  /** èŽ·å– ContextEvolutionServiceï¼ˆä¾›ä¸Šä¸‹æ–‡æ¼”è¿›ä½¿ç”¨ï¼‰ */
  get contextEvolution(): ContextEvolutionService | undefined {
    return this.orchestration?.contextEvolution;
  }

  /** èŽ·å– ContentFetchServiceï¼ˆä¾›å†…å®¹æŠ“å–ä½¿ç”¨ï¼‰ */
  get contentFetch(): ContentFetchService | undefined {
    return this.content?.contentFetch;
  }

  // ==================== Registry Getters ====================
  // AI App æ¨¡å—é€šè¿‡è¿™äº› getter è®¿é—® Registryï¼Œæ— éœ€ç›´æŽ¥æ³¨å…¥ Engine å†…éƒ¨ç±»

  /** èŽ·å– ToolRegistryï¼ˆå·¥å…·æ³¨å†Œè¡¨ï¼‰ */
  get toolRegistry():
    | import("../../ai-engine/tools/registry/tool.registry").ToolRegistry
    | undefined {
    return this.tools?.registry;
  }

  /** èŽ·å– AgentRegistryï¼ˆAgent æ³¨å†Œè¡¨ï¼‰ */
  get agentRegistry(): AgentRegistry | undefined {
    return this.registry?.agent;
  }

  /** èŽ·å– TeamRegistryï¼ˆå›¢é˜Ÿæ³¨å†Œè¡¨ï¼‰ */
  get teamRegistry(): TeamRegistry | undefined {
    return this.registry?.team;
  }

  /** èŽ·å– RoleRegistryï¼ˆè§’è‰²æ³¨å†Œè¡¨ï¼‰ */
  get roleRegistry(): RoleRegistry | undefined {
    return this.registry?.role;
  }

  /** èŽ·å– SkillRegistryï¼ˆæŠ€èƒ½æ³¨å†Œè¡¨ï¼‰ */
  get skillRegistry(): SkillRegistry | undefined {
    return this.registry?.skill;
  }

  // ==================== Late Registration â€” ç ”ç©¶èƒ½åŠ› ====================

  /**
   * æ³¨å†Œç ”ç©¶èƒ½åŠ›æ‰§è¡Œå™¨
   * â˜… ç”± AI App å±‚çš„ DiscussionModule åœ¨ onModuleInit ä¸­è°ƒç”¨
   *   æ¶ˆé™¤ mcp-server / public-api å¯¹ ai-app çš„ç›´æŽ¥å¯¼å…¥ä¾èµ–
   */
  registerResearchExecutor(executor: IDirectResearchExecutor): void {
    this._researchExecutor = executor;
    this.logger.log("Research executor registered");
  }

  /**
   * æ‰§è¡Œç›´æŽ¥ç ”ç©¶
   * â˜… ä¾› mcp-serverã€public-api ç­‰å¤–å›´æ¨¡å—è°ƒç”¨
   */
  async executeDirectResearch(
    params: DirectResearchParams,
  ): Promise<DirectResearchResult> {
    if (!this._researchExecutor) {
      throw new Error(
        "Research executor not registered. Ensure DiscussionModule is loaded.",
      );
    }
    return this._researchExecutor.executeDirectResearch(params);
  }
}
