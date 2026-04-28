/**
 * AI Engine Orchestration Services
 * AI 引擎编排服务导出
 *
 * 这些服务是从 AI Teams 下沉到 AI Engine 的核心能力
 */

// 接口定义
export * from "./interfaces";

// 服务实现
export { TaskDecomposerService } from "./task-decomposer.service";
export { AgentExecutorService } from "./agent-executor.service";
export { OutputReviewerService } from "./output-reviewer.service";
export { IterationManagerService } from "./iteration-manager.service";

// 上下文演进服务
export { ContextEvolutionService } from "./context-evolution.service";

// 上下文初始化服务（世界观设定）
export { ContextInitializationService } from "./context-initialization.service";

// 约束强制服务 — migrated to ai-harness/runtime
// export { ConstraintEnforcementService } from "./constraint-enforcement.service";

// 上下文压缩服务
export { ContextCompressionService } from "./context-compression.service";

// 意图检测服务
export { IntentDetectionService } from "./intent-detection.service";

// 熔断器服务 — migrated to ai-harness/runtime
// export { CircuitBreakerService, TaskCompletionType } from "./circuit-breaker.service";

// Token 预算服务
export {
  TokenBudgetService,
  type ModelConfig,
  type TokenBudget,
  type ContentPriority,
  type BudgetAllocation,
} from "./token-budget.service";

// 反思服务 (★ P0 沉淀: 从 Deep Research 提取的通用反思能力)
export {
  ReflectionService,
  type ReflectionDecision,
  type ReflectionInput,
  type ReflectionResult,
  type ReflectionConfig,
} from "./reflection.service";

// 支柱四：智能模型路由
export {
  ComplexityAnalyzerService,
  type ComplexityLevel,
  type TaskDescriptor,
  type TaskComplexity,
} from "./complexity-analyzer.service";

export {
  IntelligentModelRouterService,
  type RoutingStrategy,
  type RoutingResult,
  type QualityFeedback,
  type QualityStats,
} from "./intelligent-model-router.service";

// 支柱二：GenesisAgent 编排层
export {
  TaskPlannerService,
  type TaskPlan,
  type TaskStep,
  type AppModule,
  type CapabilityRequirement,
} from "./task-planner.service";

export {
  IntentRouterService,
  type AgentContext,
  type RouteResult,
} from "./intent-router.service";

// Query Loop 自动续写引擎
export {
  QueryLoopService,
  type QueryLoopConfig,
  type QueryLoopResult,
  type QueryLoopStopReason,
  type ChatFn,
  type ChatFnResult,
  type ChatMessage as QueryLoopMessage,
} from "./query-loop.service";

// Token 追踪服务
export {
  TokenTrackerService,
  type TokenUsageSnapshot,
  type TokenUsageEntry,
} from "./token-tracker.service";

// 上下文压缩管线
export {
  ContextCompactionPipelineService,
  type CompactionConfig,
  type CompactionResult,
  type CompactionLevel,
  type LLMMessage,
  type SummarizeFn,
} from "./context-compaction-pipeline.service";

// 执行断点服务
export {
  ExecutionCheckpointService,
  type ExecutionCheckpoint,
} from "./execution-checkpoint.service";

// 自适应重规划服务
export {
  AdaptiveReplannerService,
  type ReplanTrigger,
  type ReplanTriggerType,
  type ReplanResult,
  type StepExecutionResult,
  type ExecutionStep,
  type MissionExecutionPlan,
} from "./adaptive-replanner.service";

// 跨维度综合服务 (Phase 10 — Coordinator Synthesize-Before-Delegate)
export {
  CrossCuttingSynthesisService,
  type DimensionResult,
  type CrossCuttingTheme,
  type Contradiction,
  type ResearchGap,
  type SynthesisResult,
} from "./cross-cutting-synthesis.service";

// Phase 7: 会话记忆旁路服务
export {
  SessionMemorySidecarService,
  type SidecarCategory,
  type SidecarEntry,
  type SidecarConfig,
} from "./session-memory-sidecar.service";

// Phase 9: 后台自主 Agent
export {
  AutoDreamService,
  type DreamPhase,
  type AutoDreamConfig,
  type DreamStatus,
  type DreamResult,
} from "./auto-dream.service";

export {
  AutoDreamSchedulerService,
  type SchedulerConfig,
  type ScheduledScope,
  type SchedulerStats,
} from "./auto-dream-scheduler.service";
