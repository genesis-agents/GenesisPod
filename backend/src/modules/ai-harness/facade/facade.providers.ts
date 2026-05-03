/**
 * AI Engine Facade Providers
 * Facade ä¾èµ–æ³¨å…¥é…ç½®
 *
 * å°†å¤šä¸ªæœåŠ¡åˆ†ç»„ä¸º Feature æ¨¡å—ï¼Œç®€åŒ– Facade çš„æž„é€ å‡½æ•°
 */

import { Logger, Provider } from "@nestjs/common";
import { ShortTermMemoryService } from "../../ai-harness/memory/stores/short-term-memory.service";
import { LongTermMemoryService } from "../../ai-harness/memory/stores/long-term-memory.service";
import { ToolRegistry } from "../../ai-engine/tools/registry/tool.registry";
import { ToolPipeline } from "../../ai-engine/tools/middleware/tool-pipeline";
import { FunctionCallingExecutor } from "../../ai-harness/runner/executor/function-calling-executor";
import { FunctionCallingLLMAdapter } from "../../ai-engine/llm/adapters/function-calling-llm.adapter";
import { CircuitBreakerService } from "../../ai-engine/safety/resilience/circuit-breaker.service";
import { AgentExecutorService } from "../runner/executor/agent-executor.service";
import { SkillLoaderService } from "../../ai-engine/skills/loader/loading/skill-loader.service";
import { SkillPromptBuilder } from "../../ai-engine/skills/builder/skill-prompt-builder.service";
// â˜… P2 èƒ½åŠ›ä¸‹æ²‰ï¼šRealtime Feature ä¾èµ–
import { EventBusService as EngineEventEmitterService } from "../protocols/ipc/event-bus.service";
import { ProgressTrackerService } from "../protocols/ipc/progress-tracker.service";
// â˜… Constraint Feature ä¾èµ–
import { RateLimiter } from "../guardrails/resources/rate-limiter";
import { CostController } from "../guardrails/resources/cost-controller";
// â˜… Orchestration æ‰©å±•ä¾èµ–
// TaskDecomposerService å·²åˆ  (2026-04-30)
import { IntentDetectionService } from "../../ai-engine/planning/intent/intent-detection.service";
import { ProcessSupervisorService as ExecutionStateManager } from "../lifecycle/supervisor/process-supervisor.service";
import { OutputReviewerService } from "../evaluation/critique/output-reviewer.service";
import { ContextEvolutionService } from "../../ai-engine/knowledge/extraction/context-evolution.service";
import { QueryLoopService } from "../../ai-harness/runner/executor/query-loop.service";
import { TokenTrackerService } from "../../ai-harness/runner/executor/token-tracker.service";
// â˜… Skill æ‰©å±•ä¾èµ–
import { AiChatLLMAdapter } from "../../ai-engine/llm/adapters/ai-chat-llm.adapter";
import { InputBindingResolver } from "../../ai-engine/skills/runtime/binding/skill-input-binding-resolver.service";
import { SkillContentService } from "../../ai-engine/skills/content/skill-content.service";
import { PrismaService } from "../../../common/prisma/prisma.service";
// â˜… Tool æ‰©å±•ä¾èµ–
import { AICapabilityResolver } from "../../ai-harness/runner/capabilities/ai-capability-resolver.service";
// â˜… Teams Feature ä¾èµ–
import { TeamsService } from "../teams/services/teams.service";
import { TeamFactory } from "../teams/factory/team-factory";
import { ContextInitializationService } from "../../ai-engine/knowledge/world-building/context-initialization.service";
import { TeamsMissionOrchestrator as MissionOrchestrator } from "../teams/orchestrator/teams-mission-orchestrator";
// â˜… Content Feature ä¾èµ–
// â˜… Phase 3â†’Phase 7: replaced L4 type imports with L2 abstractions (audit E-1)
import type {
  ILongContentEngine,
  IContinuationProtocol,
} from "../../ai-engine/content/abstractions/content-engine.interface";
import { ContentFetchService } from "../../ai-engine/content/fetch/content-fetch.service";
// â˜… Knowledge Feature ä¾èµ–
import { EmbeddingService } from "@/modules/ai-engine/rag/embedding";
import { VectorService } from "@/modules/ai-engine/rag/vector";
// â˜… Intelligence Feature ä¾èµ– (IntentRouter å·²åˆ  2026-04-30)
import { ReflectionService } from "../../ai-engine/planning/reflection/reflection.service";
import { ContextCompressionService } from "../../ai-engine/planning/context/context-compression.service";
// â˜… Phase 3â†’Phase 7: replaced L4 type import with L2 abstraction (audit E-2)
import type { IReportSynthesisEngine } from "../../ai-engine/content/abstractions/content-engine.interface";
// â˜… Collaboration Feature ä¾èµ–
import { EvidenceManagerService } from "../../ai-engine/knowledge/evidence/services/evidence-manager.service";
import { VotingManager } from "../teams/collaboration/patterns/voting-pattern";
import { MessageBusService as A2AMessageBusService } from "../protocols/ipc/message-bus.service";
// â˜… Observability Feature ä¾èµ–
import { TraceCollectorService } from "../tracing/observability/trace-collector.service";
import { MemoryCoordinatorService } from "../../ai-harness/memory/coordinator/memory-coordinator.service";
// â˜… Registry Feature ä¾èµ–
import { AgentRegistry } from "../agents/registry/plan-based-agent-registry";
import { TeamRegistry } from "../teams/registry/team-registry";
import { RoleRegistry } from "../teams/registry/role-registry";
import { SkillRegistry } from "../../ai-engine/skills/registry/skill.registry";

// ============================================================================
// Feature Interfaces (re-export from facade)
// ============================================================================

/**
 * è®°å¿†èƒ½åŠ›ç‰¹æ€§
 */
export interface MemoryFeature {
  shortTerm: ShortTermMemoryService;
  longTerm: LongTermMemoryService;
}

/**
 * å·¥å…·æ‰§è¡Œç‰¹æ€§ï¼ˆå« AI èƒ½åŠ›è§£æžï¼‰
 */
export interface ToolFeature {
  registry: ToolRegistry;
  executor?: FunctionCallingExecutor;
  llmAdapter?: FunctionCallingLLMAdapter;
  capabilityResolver?: AICapabilityResolver;
}

/**
 * ç¼–æŽ’èƒ½åŠ›ç‰¹æ€§ï¼ˆæ‰©å±•ï¼šå«ä»»åŠ¡åˆ†è§£ã€æ„å›¾æ£€æµ‹ç­‰ï¼‰
 */
export interface OrchestrationFeature {
  circuitBreaker: CircuitBreakerService;
  agentExecutor: AgentExecutorService;
  // taskDecomposer å·²åˆ  (2026-04-30)
  intentDetector?: IntentDetectionService;
  execStateManager?: ExecutionStateManager;
  outputReviewer?: OutputReviewerService;
  contextEvolution?: ContextEvolutionService;
  queryLoop?: QueryLoopService;
  tokenTracker?: TokenTrackerService;
}

/** Parameters for fire-and-forget skill usage logging */
export interface SkillUsageLogParams {
  skillIds: string[];
  success: boolean;
  duration: number;
  tokensUsed?: number;
  model?: string;
  domain?: string;
  userId?: string;
}

/**
 * æŠ€èƒ½ç‰¹æ€§ï¼ˆæ‰©å±•ï¼šå« LLM é€‚é…å™¨å’Œè¾“å…¥ç»‘å®šè§£æžå™¨ï¼‰
 */
export interface SkillFeature {
  loader: SkillLoaderService;
  promptBuilder: SkillPromptBuilder;
  llmAdapter?: AiChatLLMAdapter;
  inputBindingResolver?: InputBindingResolver;
  /** 2026-05-01 (PR-X-R): æ³¨å…¥åˆ°å®žçŽ° setToolPipeline() çš„ skill å®žä¾‹ */
  toolPipeline?: ToolPipeline;
  /** Fire-and-forget log skill usage for analytics dashboard */
  logUsage?: (params: SkillUsageLogParams) => void;
}

// ============================================================================
// â˜… P2 èƒ½åŠ›ä¸‹æ²‰ï¼šRealtime Feature Interface
// ============================================================================

/**
 * å®žæ—¶æŽ¨é€ç‰¹æ€§
 */
export interface RealtimeFeature {
  eventEmitter: EngineEventEmitterService;
  progressTracker: ProgressTrackerService;
}

// ============================================================================
// Constraint Feature Interface
// ============================================================================

/**
 * çº¦æŸæŽ§åˆ¶ç‰¹æ€§
 */
export interface ConstraintFeature {
  rateLimiter: RateLimiter;
  costController: CostController;
}

// ============================================================================
// â˜… Phase 2 æ–°å¢ž Feature Interfaces
// ============================================================================

/**
 * å›¢é˜Ÿåä½œç‰¹æ€§
 */
export interface TeamsFeature {
  teamsService?: TeamsService;
  teamFactory?: TeamFactory;
  contextInit?: ContextInitializationService;
  missionOrchestrator?: MissionOrchestrator;
}

/**
 * å†…å®¹ç”Ÿäº§ç‰¹æ€§
 */
export interface ContentFeature {
  longContentEngine?: ILongContentEngine;
  continuationProtocol?: IContinuationProtocol;
  contentFetch?: ContentFetchService;
}

/**
 * çŸ¥è¯†èƒ½åŠ›ç‰¹æ€§
 */
export interface KnowledgeFeature {
  embedding?: EmbeddingService;
  vector?: VectorService;
}

/**
 * æ™ºèƒ½åˆ†æžç‰¹æ€§
 */
export interface IntelligenceFeature {
  reflection?: ReflectionService;
  contextCompression?: ContextCompressionService;
  synthesisEngine?: IReportSynthesisEngine;
}

/**
 * åä½œèƒ½åŠ›ç‰¹æ€§
 */
export interface CollaborationFeature {
  evidenceManager?: EvidenceManagerService;
  votingManager?: VotingManager;
  a2aBus?: A2AMessageBusService;
}

/**
 * å¯è§‚æµ‹æ€§ç‰¹æ€§
 */
export interface ObservabilityFeature {
  traceCollector?: TraceCollectorService;
  memoryCoordinator?: MemoryCoordinatorService;
}

/**
 * æ³¨å†Œè¡¨ç‰¹æ€§
 */
export interface RegistryFeature {
  agent?: AgentRegistry;
  team?: TeamRegistry;
  role?: RoleRegistry;
  skill?: SkillRegistry;
}

// ============================================================================
// Injection Tokens
// ============================================================================

export const MEMORY_FEATURE = "MEMORY_FEATURE";
export const TOOL_FEATURE = "TOOL_FEATURE";
export const ORCHESTRATION_FEATURE = "ORCHESTRATION_FEATURE";
export const SKILL_FEATURE = "SKILL_FEATURE";
// â˜… P2 èƒ½åŠ›ä¸‹æ²‰ï¼šRealtime Injection Token
export const REALTIME_FEATURE = "REALTIME_FEATURE";
export const CONSTRAINT_FEATURE = "CONSTRAINT_FEATURE";
// â˜… Phase 2 æ–°å¢ž Injection Token
export const TEAMS_FEATURE = "TEAMS_FEATURE";
export const CONTENT_FEATURE = "CONTENT_FEATURE";
export const KNOWLEDGE_FEATURE = "KNOWLEDGE_FEATURE";
export const INTELLIGENCE_FEATURE = "INTELLIGENCE_FEATURE";
export const COLLABORATION_FEATURE = "COLLABORATION_FEATURE";
export const OBSERVABILITY_FEATURE = "OBSERVABILITY_FEATURE";
export const REGISTRY_FEATURE = "REGISTRY_FEATURE";

// ============================================================================
// Factory Providers
// ============================================================================

/**
 * Memory Feature Provider
 * èšåˆçŸ­æœŸå’Œé•¿æœŸè®°å¿†æœåŠ¡
 */
export const memoryFeatureProvider: Provider = {
  provide: MEMORY_FEATURE,
  useFactory: (
    shortTerm?: ShortTermMemoryService,
    longTerm?: LongTermMemoryService,
  ): MemoryFeature | undefined => {
    if (!shortTerm || !longTerm) return undefined;
    return { shortTerm, longTerm };
  },
  inject: [
    { token: ShortTermMemoryService, optional: true },
    { token: LongTermMemoryService, optional: true },
  ],
};

/**
 * Tool Feature Provider
 * èšåˆå·¥å…·æ³¨å†Œè¡¨ã€æ‰§è¡Œå™¨å’Œèƒ½åŠ›è§£æžå™¨
 */
export const toolFeatureProvider: Provider = {
  provide: TOOL_FEATURE,
  useFactory: (
    registry?: ToolRegistry,
    executor?: FunctionCallingExecutor,
    llmAdapter?: FunctionCallingLLMAdapter,
    capabilityResolver?: AICapabilityResolver,
  ): ToolFeature | undefined => {
    if (!registry) return undefined;
    return { registry, executor, llmAdapter, capabilityResolver };
  },
  inject: [
    { token: ToolRegistry, optional: true },
    { token: FunctionCallingExecutor, optional: true },
    { token: FunctionCallingLLMAdapter, optional: true },
    { token: AICapabilityResolver, optional: true },
  ],
};

/**
 * Orchestration Feature Provider
 * èšåˆç†”æ–­å™¨ã€Agent æ‰§è¡Œå™¨åŠæ‰©å±•ç¼–æŽ’æœåŠ¡
 */
export const orchestrationFeatureProvider: Provider = {
  provide: ORCHESTRATION_FEATURE,
  useFactory: (
    circuitBreaker?: CircuitBreakerService,
    agentExecutor?: AgentExecutorService,
    intentDetector?: IntentDetectionService,
    execStateManager?: ExecutionStateManager,
    outputReviewer?: OutputReviewerService,
    contextEvolution?: ContextEvolutionService,
    queryLoop?: QueryLoopService,
    tokenTracker?: TokenTrackerService,
  ): OrchestrationFeature | undefined => {
    if (!circuitBreaker || !agentExecutor) return undefined;
    return {
      circuitBreaker,
      agentExecutor,
      intentDetector,
      execStateManager,
      outputReviewer,
      contextEvolution,
      queryLoop,
      tokenTracker,
    };
  },
  inject: [
    { token: CircuitBreakerService, optional: true },
    { token: AgentExecutorService, optional: true },
    { token: IntentDetectionService, optional: true },
    { token: ExecutionStateManager, optional: true },
    { token: OutputReviewerService, optional: true },
    { token: ContextEvolutionService, optional: true },
    { token: QueryLoopService, optional: true },
    { token: TokenTrackerService, optional: true },
  ],
};

/**
 * Skill Feature Provider
 * èšåˆæŠ€èƒ½åŠ è½½å™¨ã€æç¤ºè¯æž„å»ºå™¨åŠæ‰©å±•æœåŠ¡
 */
export const skillFeatureProvider: Provider = {
  provide: SKILL_FEATURE,
  useFactory: (
    loader?: SkillLoaderService,
    promptBuilder?: SkillPromptBuilder,
    llmAdapter?: AiChatLLMAdapter,
    inputBindingResolver?: InputBindingResolver,
    prisma?: PrismaService,
    skillContentService?: SkillContentService,
    toolPipeline?: ToolPipeline,
  ): SkillFeature | undefined => {
    if (!loader || !promptBuilder) return undefined;

    // Create fire-and-forget skill usage logger for analytics
    const skillLogger = new Logger("SkillUsageLogger");
    const logUsage = prisma
      ? (params: SkillUsageLogParams): void => {
          const skillCount = params.skillIds.length;
          if (skillCount === 0) return;

          for (const skillId of params.skillIds) {
            // Distribute tokens evenly across used skills
            const tokensPerSkill = params.tokensUsed
              ? Math.ceil(params.tokensUsed / skillCount)
              : null;

            void prisma.aIUsageLog
              .create({
                data: {
                  capabilityType: "skill",
                  capabilityId: skillId,
                  success: params.success,
                  duration: params.duration,
                  tokensUsed: tokensPerSkill,
                  modelUsed: params.model ?? null,
                  domain: params.domain ?? null,
                  userId: params.userId ?? null,
                },
              })
              .catch((err: Error) =>
                skillLogger.debug(
                  `Skill usage log failed for "${skillId}": ${err.message}`,
                ),
              );

            // Update SkillConfig counter (lastUsedAt + usageCount)
            if (skillContentService) {
              void skillContentService.recordUsage(skillId);
            }
          }
        }
      : undefined;

    return {
      loader,
      promptBuilder,
      llmAdapter,
      inputBindingResolver,
      toolPipeline,
      logUsage,
    };
  },
  inject: [
    { token: SkillLoaderService, optional: true },
    { token: SkillPromptBuilder, optional: true },
    { token: AiChatLLMAdapter, optional: true },
    { token: InputBindingResolver, optional: true },
    { token: PrismaService, optional: true },
    { token: SkillContentService, optional: true },
    { token: ToolPipeline, optional: true },
  ],
};

// ============================================================================
// â˜… P2 èƒ½åŠ›ä¸‹æ²‰ï¼šRealtime Feature Provider
// ============================================================================

/**
 * Realtime Feature Provider
 * èšåˆäº‹ä»¶å‘å°„å’Œè¿›åº¦è¿½è¸ªæœåŠ¡
 */
export const realtimeFeatureProvider: Provider = {
  provide: REALTIME_FEATURE,
  useFactory: (
    eventEmitter?: EngineEventEmitterService,
    progressTracker?: ProgressTrackerService,
  ): RealtimeFeature | undefined => {
    if (!eventEmitter || !progressTracker) return undefined;
    return { eventEmitter, progressTracker };
  },
  inject: [
    { token: EngineEventEmitterService, optional: true },
    { token: ProgressTrackerService, optional: true },
  ],
};

// ============================================================================
// Constraint Feature Provider
// ============================================================================

/**
 * Constraint Feature Provider
 * èšåˆé€ŸçŽ‡é™åˆ¶å™¨å’Œæˆæœ¬æŽ§åˆ¶å™¨
 */
export const constraintFeatureProvider: Provider = {
  provide: CONSTRAINT_FEATURE,
  useFactory: (
    rateLimiter?: RateLimiter,
    costController?: CostController,
  ): ConstraintFeature | undefined => {
    if (!rateLimiter || !costController) return undefined;
    return { rateLimiter, costController };
  },
  inject: [
    { token: RateLimiter, optional: true },
    { token: CostController, optional: true },
  ],
};

// ============================================================================
// â˜… Phase 2 æ–°å¢ž Feature Providers
// ============================================================================

export const teamsFeatureProvider: Provider = {
  provide: TEAMS_FEATURE,
  useFactory: (
    teamsService?: TeamsService,
    teamFactory?: TeamFactory,
    contextInit?: ContextInitializationService,
    missionOrchestrator?: MissionOrchestrator,
  ): TeamsFeature | undefined => {
    if (!teamsService) return undefined;
    return { teamsService, teamFactory, contextInit, missionOrchestrator };
  },
  inject: [
    { token: TeamsService, optional: true },
    { token: TeamFactory, optional: true },
    { token: ContextInitializationService, optional: true },
    { token: MissionOrchestrator, optional: true },
  ],
};

// â˜… String tokens for cross-layer DI (breaks circular dep: facade â†’ content-engine â†’ facade)
export const LONG_CONTENT_ENGINE_TOKEN = "LongContentEngineService";
export const CONTINUATION_PROTOCOL_TOKEN = "ContinuationProtocolService";
export const REPORT_SYNTHESIS_ENGINE_TOKEN = "ReportSynthesisEngine";

export const contentFeatureProvider: Provider = {
  provide: CONTENT_FEATURE,
  useFactory: (
    longContentEngine?: ILongContentEngine,
    continuationProtocol?: IContinuationProtocol,
    contentFetch?: ContentFetchService,
  ): ContentFeature | undefined => {
    if (!longContentEngine && !continuationProtocol && !contentFetch)
      return undefined;
    return { longContentEngine, continuationProtocol, contentFetch };
  },
  inject: [
    { token: LONG_CONTENT_ENGINE_TOKEN, optional: true },
    { token: CONTINUATION_PROTOCOL_TOKEN, optional: true },
    { token: ContentFetchService, optional: true },
  ],
};

export const knowledgeFeatureProvider: Provider = {
  provide: KNOWLEDGE_FEATURE,
  useFactory: (
    embedding?: EmbeddingService,
    vector?: VectorService,
  ): KnowledgeFeature | undefined => {
    if (!embedding && !vector) return undefined;
    return { embedding, vector };
  },
  inject: [
    { token: EmbeddingService, optional: true },
    { token: VectorService, optional: true },
  ],
};

export const intelligenceFeatureProvider: Provider = {
  provide: INTELLIGENCE_FEATURE,
  useFactory: (
    reflection?: ReflectionService,
    contextCompression?: ContextCompressionService,
    synthesisEngine?: IReportSynthesisEngine,
  ): IntelligenceFeature | undefined => {
    if (!reflection && !contextCompression && !synthesisEngine)
      return undefined;
    return { reflection, contextCompression, synthesisEngine };
  },
  inject: [
    { token: ReflectionService, optional: true },
    { token: ContextCompressionService, optional: true },
    { token: REPORT_SYNTHESIS_ENGINE_TOKEN, optional: true },
  ],
};

export const collaborationFeatureProvider: Provider = {
  provide: COLLABORATION_FEATURE,
  useFactory: (
    evidenceManager?: EvidenceManagerService,
    votingManager?: VotingManager,
    a2aBus?: A2AMessageBusService,
  ): CollaborationFeature | undefined => {
    if (!evidenceManager && !votingManager && !a2aBus) return undefined;
    return { evidenceManager, votingManager, a2aBus };
  },
  inject: [
    { token: EvidenceManagerService, optional: true },
    { token: VotingManager, optional: true },
    { token: A2AMessageBusService, optional: true },
  ],
};

export const observabilityFeatureProvider: Provider = {
  provide: OBSERVABILITY_FEATURE,
  useFactory: (
    traceCollector?: TraceCollectorService,
    memoryCoordinator?: MemoryCoordinatorService,
  ): ObservabilityFeature | undefined => {
    if (!traceCollector && !memoryCoordinator) return undefined;
    return { traceCollector, memoryCoordinator };
  },
  inject: [
    { token: TraceCollectorService, optional: true },
    { token: MemoryCoordinatorService, optional: true },
  ],
};

export const registryFeatureProvider: Provider = {
  provide: REGISTRY_FEATURE,
  useFactory: (
    agent?: AgentRegistry,
    team?: TeamRegistry,
    role?: RoleRegistry,
    skill?: SkillRegistry,
  ): RegistryFeature | undefined => {
    if (!agent && !team && !role && !skill) return undefined;
    return { agent, team, role, skill };
  },
  inject: [
    { token: AgentRegistry, optional: true },
    { token: TeamRegistry, optional: true },
    { token: RoleRegistry, optional: true },
    { token: SkillRegistry, optional: true },
  ],
};

// ============================================================================
// All Feature Providers
// ============================================================================

export const FACADE_FEATURE_PROVIDERS: Provider[] = [
  memoryFeatureProvider,
  toolFeatureProvider,
  orchestrationFeatureProvider,
  skillFeatureProvider,
  // â˜… P2 èƒ½åŠ›ä¸‹æ²‰ï¼šRealtime Provider
  realtimeFeatureProvider,
  constraintFeatureProvider,
  // â˜… Phase 2 æ–°å¢ž Providers
  teamsFeatureProvider,
  contentFeatureProvider,
  knowledgeFeatureProvider,
  intelligenceFeatureProvider,
  collaborationFeatureProvider,
  observabilityFeatureProvider,
  registryFeatureProvider,
];

// ============================================================================
// â˜… Phase 5: Domain Facade Providers
// Domain facades are @Injectable() NestJS providers that group related
// capabilities. The God Facade (AIFacade) delegates to them.
// Each facade is registered by its class token directly in AIEngineModule.
// ============================================================================
