/**
 * AI Engine Facade Providers
 * Facade 依赖注入配置
 *
 * 将多个服务分组为 Feature 模块，简化 Facade 的构造函数
 */

import { Provider } from "@nestjs/common";
import { ShortTermMemoryService } from "../knowledge/memory/stores/short-term-memory.service";
import { LongTermMemoryService } from "../knowledge/memory/stores/long-term-memory.service";
import { ToolRegistry } from "../tools/registry/tool-registry";
import { FunctionCallingExecutor } from "../orchestration/executors/function-calling-executor";
import { FunctionCallingLLMAdapter } from "../llm/adapters/function-calling-llm-adapter";
import { CircuitBreakerService } from "../orchestration/services/circuit-breaker.service";
import { AgentExecutorService } from "../orchestration/services/agent-executor.service";
import { SkillLoaderService } from "../skills/loader/skill-loader.service";
import { SkillPromptBuilder } from "../skills/builder/skill-prompt-builder.service";
// ★ P2 能力下沉：Realtime Feature 依赖
import { EngineEventEmitterService } from "../infra/realtime/services/engine-event-emitter.service";
import { ProgressTrackerService } from "../infra/realtime/services/progress-tracker.service";
// ★ Constraint Feature 依赖
import { RateLimiter } from "../safety/constraint/guardrails/rate-limiter";
import { CostController } from "../safety/constraint/guardrails/cost-controller";
// ★ Orchestration 扩展依赖
import { TaskDecomposerService } from "../orchestration/services/task-decomposer.service";
import { IntentDetectionService } from "../orchestration/services/intent-detection.service";
import { ExecutionStateManager } from "../orchestration/state-machine/execution-state.manager";
import { OutputReviewerService } from "../orchestration/services/output-reviewer.service";
import { ContextEvolutionService } from "../orchestration/services/context-evolution.service";
// ★ Skill 扩展依赖
import { AiChatLLMAdapter } from "../llm/adapters/ai-chat-llm-adapter";
import { InputBindingResolver } from "../skills/runtime/input-binding-resolver";
// ★ Tool 扩展依赖
import { AICapabilityResolver } from "../orchestration/capabilities/ai-capability-resolver.service";
// ★ Teams Feature 依赖
import { TeamsService } from "../teams/services/teams.service";
import { TeamFactory } from "../teams/factory/team-factory";
import { ContextInitializationService } from "../orchestration/services/context-initialization.service";
import { MissionOrchestrator } from "../teams/orchestrator/mission-orchestrator";
// ★ Content Feature 依赖
import { LongContentEngineService } from "../content/long-form/services/long-content-engine.service";
import { ContinuationProtocolService } from "../content/long-form/services/continuation-protocol.service";
import { ContentFetchService } from "../content/fetch/content-fetch.service";
// ★ Knowledge Feature 依赖
import { EmbeddingService } from "../knowledge/rag/embedding";
import { VectorService } from "../knowledge/rag/vector";
// ★ Intelligence Feature 依赖
import { IntentRouterService } from "../orchestration/services/intent-router.service";
import { ReflectionService } from "../orchestration/services/reflection.service";
import { ContextCompressionService } from "../orchestration/services/context-compression.service";
import { ReportSynthesisEngine } from "../content/synthesis/report-synthesis.service";
// ★ Collaboration Feature 依赖
import { EvidenceManagerService } from "../knowledge/evidence/services/evidence-manager.service";
import { VotingManager } from "../agents/collaboration/patterns/voting-pattern";
import { A2AMessageBusService } from "../teams/services/a2a-message-bus.service";
// ★ Observability Feature 依赖
import { TraceCollectorService } from "../infra/observability/trace-collector.service";
import { MemoryCoordinatorService } from "../knowledge/memory/memory-coordinator.service";
// ★ Registry Feature 依赖
import { AgentRegistry } from "../agents/registry";
import { TeamRegistry } from "../teams/registry/team-registry";
import { RoleRegistry } from "../teams/registry/role-registry";
import { SkillRegistry } from "../skills/registry/skill-registry";

// ============================================================================
// Feature Interfaces (re-export from facade)
// ============================================================================

/**
 * 记忆能力特性
 */
export interface MemoryFeature {
  shortTerm: ShortTermMemoryService;
  longTerm: LongTermMemoryService;
}

/**
 * 工具执行特性（含 AI 能力解析）
 */
export interface ToolFeature {
  registry: ToolRegistry;
  executor?: FunctionCallingExecutor;
  llmAdapter?: FunctionCallingLLMAdapter;
  capabilityResolver?: AICapabilityResolver;
}

/**
 * 编排能力特性（扩展：含任务分解、意图检测等）
 */
export interface OrchestrationFeature {
  circuitBreaker: CircuitBreakerService;
  agentExecutor: AgentExecutorService;
  taskDecomposer?: TaskDecomposerService;
  intentDetector?: IntentDetectionService;
  execStateManager?: ExecutionStateManager;
  outputReviewer?: OutputReviewerService;
  contextEvolution?: ContextEvolutionService;
}

/**
 * 技能特性（扩展：含 LLM 适配器和输入绑定解析器）
 */
export interface SkillFeature {
  loader: SkillLoaderService;
  promptBuilder: SkillPromptBuilder;
  llmAdapter?: AiChatLLMAdapter;
  inputBindingResolver?: InputBindingResolver;
}

// ============================================================================
// ★ P2 能力下沉：Realtime Feature Interface
// ============================================================================

/**
 * 实时推送特性
 */
export interface RealtimeFeature {
  eventEmitter: EngineEventEmitterService;
  progressTracker: ProgressTrackerService;
}

// ============================================================================
// Constraint Feature Interface
// ============================================================================

/**
 * 约束控制特性
 */
export interface ConstraintFeature {
  rateLimiter: RateLimiter;
  costController: CostController;
}

// ============================================================================
// ★ Phase 2 新增 Feature Interfaces
// ============================================================================

/**
 * 团队协作特性
 */
export interface TeamsFeature {
  teamsService?: TeamsService;
  teamFactory?: TeamFactory;
  contextInit?: ContextInitializationService;
  missionOrchestrator?: MissionOrchestrator;
}

/**
 * 内容生产特性
 */
export interface ContentFeature {
  longContentEngine?: LongContentEngineService;
  continuationProtocol?: ContinuationProtocolService;
  contentFetch?: ContentFetchService;
}

/**
 * 知识能力特性
 */
export interface KnowledgeFeature {
  embedding?: EmbeddingService;
  vector?: VectorService;
}

/**
 * 智能分析特性
 */
export interface IntelligenceFeature {
  intentRouter?: IntentRouterService;
  reflection?: ReflectionService;
  contextCompression?: ContextCompressionService;
  synthesisEngine?: ReportSynthesisEngine;
}

/**
 * 协作能力特性
 */
export interface CollaborationFeature {
  evidenceManager?: EvidenceManagerService;
  votingManager?: VotingManager;
  a2aBus?: A2AMessageBusService;
}

/**
 * 可观测性特性
 */
export interface ObservabilityFeature {
  traceCollector?: TraceCollectorService;
  memoryCoordinator?: MemoryCoordinatorService;
}

/**
 * 注册表特性
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
// ★ P2 能力下沉：Realtime Injection Token
export const REALTIME_FEATURE = "REALTIME_FEATURE";
export const CONSTRAINT_FEATURE = "CONSTRAINT_FEATURE";
// ★ Phase 2 新增 Injection Token
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
 * 聚合短期和长期记忆服务
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
 * 聚合工具注册表、执行器和能力解析器
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
 * 聚合熔断器、Agent 执行器及扩展编排服务
 */
export const orchestrationFeatureProvider: Provider = {
  provide: ORCHESTRATION_FEATURE,
  useFactory: (
    circuitBreaker?: CircuitBreakerService,
    agentExecutor?: AgentExecutorService,
    taskDecomposer?: TaskDecomposerService,
    intentDetector?: IntentDetectionService,
    execStateManager?: ExecutionStateManager,
    outputReviewer?: OutputReviewerService,
    contextEvolution?: ContextEvolutionService,
  ): OrchestrationFeature | undefined => {
    if (!circuitBreaker || !agentExecutor) return undefined;
    return {
      circuitBreaker,
      agentExecutor,
      taskDecomposer,
      intentDetector,
      execStateManager,
      outputReviewer,
      contextEvolution,
    };
  },
  inject: [
    { token: CircuitBreakerService, optional: true },
    { token: AgentExecutorService, optional: true },
    { token: TaskDecomposerService, optional: true },
    { token: IntentDetectionService, optional: true },
    { token: ExecutionStateManager, optional: true },
    { token: OutputReviewerService, optional: true },
    { token: ContextEvolutionService, optional: true },
  ],
};

/**
 * Skill Feature Provider
 * 聚合技能加载器、提示词构建器及扩展服务
 */
export const skillFeatureProvider: Provider = {
  provide: SKILL_FEATURE,
  useFactory: (
    loader?: SkillLoaderService,
    promptBuilder?: SkillPromptBuilder,
    llmAdapter?: AiChatLLMAdapter,
    inputBindingResolver?: InputBindingResolver,
  ): SkillFeature | undefined => {
    if (!loader || !promptBuilder) return undefined;
    return { loader, promptBuilder, llmAdapter, inputBindingResolver };
  },
  inject: [
    { token: SkillLoaderService, optional: true },
    { token: SkillPromptBuilder, optional: true },
    { token: AiChatLLMAdapter, optional: true },
    { token: InputBindingResolver, optional: true },
  ],
};

// ============================================================================
// ★ P2 能力下沉：Realtime Feature Provider
// ============================================================================

/**
 * Realtime Feature Provider
 * 聚合事件发射和进度追踪服务
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
 * 聚合速率限制器和成本控制器
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
// ★ Phase 2 新增 Feature Providers
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

export const contentFeatureProvider: Provider = {
  provide: CONTENT_FEATURE,
  useFactory: (
    longContentEngine?: LongContentEngineService,
    continuationProtocol?: ContinuationProtocolService,
    contentFetch?: ContentFetchService,
  ): ContentFeature | undefined => {
    if (!longContentEngine && !continuationProtocol && !contentFetch)
      return undefined;
    return { longContentEngine, continuationProtocol, contentFetch };
  },
  inject: [
    { token: LongContentEngineService, optional: true },
    { token: ContinuationProtocolService, optional: true },
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
    intentRouter?: IntentRouterService,
    reflection?: ReflectionService,
    contextCompression?: ContextCompressionService,
    synthesisEngine?: ReportSynthesisEngine,
  ): IntelligenceFeature | undefined => {
    if (!intentRouter && !reflection && !contextCompression && !synthesisEngine)
      return undefined;
    return { intentRouter, reflection, contextCompression, synthesisEngine };
  },
  inject: [
    { token: IntentRouterService, optional: true },
    { token: ReflectionService, optional: true },
    { token: ContextCompressionService, optional: true },
    { token: ReportSynthesisEngine, optional: true },
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
  // ★ P2 能力下沉：Realtime Provider
  realtimeFeatureProvider,
  constraintFeatureProvider,
  // ★ Phase 2 新增 Providers
  teamsFeatureProvider,
  contentFeatureProvider,
  knowledgeFeatureProvider,
  intelligenceFeatureProvider,
  collaborationFeatureProvider,
  observabilityFeatureProvider,
  registryFeatureProvider,
];
