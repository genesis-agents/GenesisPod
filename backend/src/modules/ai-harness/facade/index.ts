/**
 * AI Harness Facade —— ai-app 唯一入口
 *
 * 7 大聚合：kernel / execution / process / memory / protocol / governance / runtime
 *
 * ★ 单向依赖：ai-app → ai-harness → ai-engine。
 * ★ ai-app 任何 harness 符号必须从这里 import，禁止穿透 harness 内部路径。
 */

// ════════════════════════════════════════════════════════════════════
// Kernel：abstractions + core + dx
// ════════════════════════════════════════════════════════════════════
export * from "../kernel/abstractions";
export { AgentFactory } from "../kernel/core/agent-factory";
export { SpecAgentRegistry } from "../kernel/core/spec-agent-registry";
export { BuiltInReActSkillRegistry } from "../kernel/builtin-skills/skill-registry";
export {
  AgentRunner,
  AgentSpec,
  DefineAgent,
  FixtureStore,
} from "../kernel/dev-tools";
export type { RunResult } from "../kernel/dev-tools";

// Service facade
export { HarnessFacade } from "./harness.facade";

// ════════════════════════════════════════════════════════════════════
// AIFacade + Domain Facades (moved from ai-engine/facade — PR-X13)
// ai-app 模块通过 "@/modules/ai-harness/facade" 统一导入
// ════════════════════════════════════════════════════════════════════
export { AIFacade } from "./ai.facade";
export { ChatFacade } from "./domain/chat.facade";
export { RAGFacade } from "./domain/rag.facade";
export { AgentFacade } from "./domain/agent.facade";
export { TeamFacade } from "./domain/team.facade";
export { ToolFacade } from "./domain/tool.facade";
export { ConcurrencyPlanner } from "../guardrails/concurrency-planner.service";
export type {
  ConcurrencyPlanOptions,
  ConcurrencyPlan,
} from "../guardrails/concurrency-planner.service";
// ★ 2026-05-01 (PR-G iter8 + iter9): 集中所有 review pass/attempt 阈值 + agent budget cap
export {
  REVIEW_PASS_THRESHOLD,
  CHAPTER_MAX_REVISION_ATTEMPTS,
  MISSION_WRITER_MAX_ATTEMPTS,
  MAX_CONSECUTIVE_REVIEWER_FAILURES,
  CHAPTER_WRITER_INTERNAL_MAX_ITERATIONS,
  CHAPTER_REVIEWER_INTERNAL_MAX_ITERATIONS,
  RESEARCHER_MAX_ITERATIONS,
  RESEARCHER_MAX_ITERATIONS_HARD_CAP,
  RESEARCHER_MAX_WALL_TIME_MS,
} from "../evaluation/thresholds.constants";
export { ModelResolverService } from "./model-resolver.service";
export {
  FACADE_FEATURE_PROVIDERS,
  MEMORY_FEATURE,
  TOOL_FEATURE,
  ORCHESTRATION_FEATURE,
  SKILL_FEATURE,
  REALTIME_FEATURE,
  CONSTRAINT_FEATURE,
  TEAMS_FEATURE,
  CONTENT_FEATURE,
  KNOWLEDGE_FEATURE,
  INTELLIGENCE_FEATURE,
  COLLABORATION_FEATURE,
  OBSERVABILITY_FEATURE,
  REGISTRY_FEATURE,
  LONG_CONTENT_ENGINE_TOKEN,
  CONTINUATION_PROTOCOL_TOKEN,
  REPORT_SYNTHESIS_ENGINE_TOKEN,
} from "./facade.providers";
export type {
  MemoryFeature,
  ToolFeature,
  OrchestrationFeature,
  SkillFeature,
  RealtimeFeature,
  ConstraintFeature,
  TeamsFeature,
  ContentFeature,
  KnowledgeFeature,
  IntelligenceFeature,
  CollaborationFeature,
  ObservabilityFeature,
  RegistryFeature,
  SkillUsageLogParams,
} from "./facade.providers";

// ════════════════════════════════════════════════════════════════════
// Governance: verify + resource + observability + security
// ════════════════════════════════════════════════════════════════════
export { JudgeService } from "../evaluation/verify";
export type { BuiltInVerifierId } from "../evaluation/verify";
// ★ 沉淀（2026-04-29）: figure 相关性判断（来自 topic-insights, TI 暂不切换）
export { FigureRelevanceService } from "../evaluation/figure";
// ★ 沉淀（2026-04-29）: Reflexion critique-refine + section-self-eval + defect-scanner
//   v3 (同日): quality-gate / section-remediation / report-evaluation / quality-trace-compute
export {
  CritiqueRefineService,
  SectionSelfEvalService,
  CritiqueCategory,
  CritiqueSeverity,
  type CritiqueItem,
  type CritiqueResult,
  type CritiqueRefineRequest,
  type CritiqueRefineLoopResult,
  type CritiqueRefineConfig,
  type SelfEvalDimension,
  type SectionSelfEvalResult,
  type RemediationAction,
  type RemediationActionType,
  type RemediationResult,
  type RemediationTrace,
  type ContentDefectScan,
  type DefectDetail,
  type DefectDetails,
  scanContentDefects,
  createEmptyScan,
  extractDefectDetails,
  DEFAULT_CRITIQUE_REFINE_CONFIG,
  // v3
  ReportQualityGateService,
  type QualityViolation,
  type QualityCheckResult,
  SectionRemediationService,
  ReportEvaluationService,
  type EvaluationDimension,
  type ChapterEvaluation,
  type EvaluationResult,
  type ModelComparisonEntry,
  type ChapterInput,
  QualityTraceComputeService,
  type QualityTraceContext,
  type QualityTrace,
  type QualityTraceEvidence,
  type EvidenceQualityProbe,
  type DimensionOutputProbe,
  type PostProcessingProbe,
  type SynthesisOutputProbe,
  type FinalAssessmentProbe,
  type OutputReviewProbe,
  type PromptMetadata,
  // ★ 沉淀 Phase 3 (2026-04-29): 字数中位数归一化
  balanceTargetWords,
  type BalancerOptions,
  type BalancerResult,
} from "../evaluation/critique";

// ★ 沉淀 Phase 3 (2026-04-29): 通用并发信号量
export { ConcurrencyLimiter } from "../execution/concurrency";

// ★ Phase 9 (2026-04-30): Mission 运行时状态外置 + Orphan 检测（harness 无状态化）
export {
  MissionRuntimeStateStore,
  type MissionHeartbeat,
  HEARTBEAT_INTERVAL_MS,
} from "../teams/orchestrator/mission-runtime-state.store";
export {
  MissionOrphanDetectorService,
  type OrphanDetectorCallbacks,
} from "../teams/orchestrator/mission-orphan-detector.service";

// ★ 2026-04-30: AdaptiveReplannerService 从 ai-engine/planning 搬来（跨层迁移）
export {
  AdaptiveReplannerService,
  type ReplanTrigger,
  type ReplanTriggerType,
  type ReplanResult,
  type StepExecutionResult,
  type ReplanStep,
  type ReplanContext,
} from "../teams/orchestrator/adaptive-replanner.service";

// ★ 2026-04-30: AgentExecutorService 从 ai-engine/planning 搬来（跨层迁移）
export { AgentExecutorService } from "../execution/executor/agent-executor.service";

// ★ 2026-05-01 (PR-X-L): execution/executor/interfaces.ts 类型从 ai-engine/facade
//   下沉过来 — 它们是 L2.5 ai-harness/execution 层 owned，原 engine facade 反向
//   re-export 违反单向规则
//   注：EstablishedFact 已由下方 mission-context.interface re-export，故此处不再重复
export type {
  AiCallerFn,
  ExecutionConfig,
  ExecutionResult,
  ReviewRequest,
  ReviewCriteria,
  ReviewResult,
  RevisionRequest,
  IterationRequest,
  IterationResult,
  IterationRequestType,
  ResearchContext,
  ContextEvolutionConfig,
  FactExtractionRequest,
  FactExtractionResult,
  ConstraintSeverity,
  ExtractedConstraint,
  ConstraintViolation,
  OutputValidationResult,
  DataChunk,
  SummaryChunk,
  CompressionResult,
  CompressionOptions,
} from "../execution/executor/interfaces";
export { DEFAULT_CONTEXT_EVOLUTION_CONFIG } from "../execution/executor/interfaces";
// ★ 2026-05-01 (PR-X-M): UserIntent / ContextStrategy 是 L2 LLM 能力概念，
// owner 是 ai-engine/llm/intent；harness facade 仅 re-export 让 ai-app 透明
export {
  UserIntent,
  ContextStrategy,
} from "../../ai-engine/llm/intent/intent.types";

// ★ 2026-05-01 (PR-X-L): execution/capabilities 类型同上下沉
export type { AICapabilityContext } from "../execution/capabilities/ai-capability-resolver.service";
export type {
  SkillPromptBundle,
  SkillPromptOptions,
} from "../execution/capabilities/types";

// ★ 2026-05-01 (PR-X-L): ExecutionCheckpointService 也是 L2.5 ai-harness 概念
export {
  ExecutionCheckpointService,
  type ExecutionCheckpoint,
} from "../execution/executor/execution-checkpoint.service";

// ★ 2026-05-01 (PR-X-M2): 一组 L2.5 runtime 类型从 ai-engine/facade 反向 re-export 下沉过来
export type { TeamMemberInfo } from "../execution/executor/interfaces";
export type { IConstraintEnforcementService } from "../execution/executor/interfaces";
export { AICapabilityResolver } from "../execution/capabilities/ai-capability-resolver.service";
export {
  QueryLoopService,
  type QueryLoopConfig,
  type QueryLoopResult,
  type QueryLoopStopReason,
} from "../execution/executor/query-loop.service";
export {
  TokenTrackerService,
  type TokenUsageSnapshot,
  type TokenUsageEntry,
} from "../execution/executor/token-tracker.service";
export {
  SessionMemorySidecarService,
  type SidecarCategory,
  type SidecarEntry,
  type SidecarConfig,
} from "../execution/executor/session-memory-sidecar.service";
export type {
  Checkpoint,
  ExecutionContext as OrchestrationExecutionContext,
  Workflow,
  WorkflowStep,
  WorkflowMode,
  StepType,
  StepInput,
  StepOutput,
  StepCondition,
  RetryConfig,
  ErrorHandler,
  ExecutionEvent,
  ExecutionResult as OrchestrationExecutionResult,
  StepResult,
  StepStatus,
  WorkflowConfig as OrchestrationWorkflowConfig,
} from "../runtime/abstractions/orchestrator.interface";

// ★ 2026-04-30: OutputReviewerService 从 ai-engine/planning 搬来（跨层迁移）
// ★ 2026-05-02 (#1 MECE): runtime/quality → evaluation/critique 收敛
export { OutputReviewerService } from "../evaluation/critique/output-reviewer.service";

// ★ 2026-05-01: ReportArtifactAssembler 从 ai-app/agent-playground 上提（跨 app 复用）
//   playground v2 ReportArtifact (sections/citations/figures/quickView) 装配纯函数
export {
  ReportArtifactAssembler,
  lengthTargetFor,
} from "../evaluation/critique/report-artifact/report-artifact-assembler.service";

// ★ 2026-05-01: FailureLearnerService 从 ai-app/agent-playground 上提
// ★ 2026-05-02 (W1 MECE): governance/learning → lifecycle/learning（失败学习是生命周期闭环）
//   跨 mission 失败模式记忆（harness_failure_patterns 表），供 BillingRuntimeEnvAdapter 等消费
export { FailureLearnerService } from "../lifecycle/learning/failure-learner.service";

// ★ 2026-05-01: SocketBroadcastAdapter 从 ai-app/agent-playground/adapters/ 上提
//   参数化 prefix 后跨 ai-app 通用（DomainEvent → Socket.IO room），任何带 socket relay
//   的 ai-app 都可复用
export {
  SocketBroadcastAdapter,
  type SocketBroadcastAdapterOptions,
} from "../protocol/realtime/socket-broadcast.adapter";

// ★ 2026-05-01: MissionAbortRegistry / MissionOwnershipRegistry 从 ai-app/agent-playground 上提
//   两个纯通用 in-memory registry primitive（abort signal 管理 / mission→user ownership LRU），
//   跨 ai-app 复用（research / writing / teams 任何长任务编排都需要）
export { MissionAbortRegistry } from "../teams/orchestrator/mission-abort.registry";
export { MissionOwnershipRegistry } from "../teams/orchestrator/mission-ownership.registry";

// ★ 2026-05-01: stage-emit util 从 ai-app/agent-playground 上提
//   通用 stage:completed 事件封装，含 durationMs / tokensUsed / agentInvocations 等度量
export {
  startStageTimer,
  type StageTimer,
  type StageTimerEmitOptions,
  type EmitFn,
} from "../protocol/ipc/stage-emit.util";

// ★ 2026-05-01 (PR-X-N): 让 ai-app 走 facade，不需穿透 harness 内部路径
export {
  extractTokenSpend,
  estimateUsdFromTokens,
} from "../tracing/token-spend.util";
export {
  extractAgentFailureDiagnostic,
  extractFailureMessage,
} from "../tracing/failure-extraction.util";
export {
  clampScore,
  scaleScore,
} from "../evaluation/critique/quality-score.util";
// FunctionCallingExecutor.AgentEvent — 给 teams 服务用作 event 类型
export type { AgentEvent as FunctionCallingAgentEvent } from "../execution/executor/function-calling-executor";
export type {
  ArtifactCitation,
  ArtifactFactTriple,
  ArtifactFigure,
  ArtifactHighlight,
  ArtifactMetadata,
  ArtifactQualityVerdicts,
  ArtifactQuickView,
  ArtifactSection,
  ReportArtifact,
} from "../evaluation/critique/report-artifact/report-artifact.dto";

// ★ C2-step1 (2026-04-30): AutoDream（后台 memory 整合）从 ai-engine 搬入 harness
export {
  AutoDreamService,
  type DreamPhase,
  type AutoDreamConfig,
  type DreamStatus,
  type DreamResult,
} from "../memory/dream/auto-dream.service";
export {
  AutoDreamSchedulerService,
  type SchedulerConfig as AutoDreamSchedulerConfig,
  type ScheduledScope as AutoDreamScheduledScope,
  type SchedulerStats as AutoDreamSchedulerStats,
} from "../memory/dream/auto-dream-scheduler.service";

// ★ 沉淀 Phase 4 (2026-04-29): Checkpoint / Health / DAG 三件套
export {
  MissionCheckpointService,
  type MissionCheckpointSnapshot,
  type MissionCheckpointStore,
  type MissionResumeDecision,
  InMemoryMissionCheckpointStore,
} from "../memory/state-checkpoint";
export {
  MissionHealthMonitor,
  type MissionHealthSnapshot,
  type HealthCheckConfig,
  type HealthVerdict,
  type HealthCheckResult,
  type MissionHealthMonitorOptions,
} from "../teams/orchestrator/mission-health.monitor";
export {
  DAGExecutor,
  type DAGTask,
  type DAGAdapter,
  type DAGSchedulerConfig,
  type DAGExecutionResult,
} from "../execution/dag";

// ── Resource ──
export { ResourceManagerService } from "../guardrails/resource-manager.service";
// PR-X15: 通过 engine/facade barrel 转发，不穿透 engine 私有路径
export {
  CircuitBreakerService,
  TaskCompletionType,
} from "../../ai-engine/facade";
export type {
  CircuitState,
  CircuitBreakerConfig,
  HealthMetrics,
} from "../../ai-engine/facade";
export { ConstraintEngine } from "../guardrails/constraint-engine";
export { ConstraintEnforcementService } from "../guardrails/constraint-enforcement.service";
export { CostController } from "../guardrails/cost-controller";
export type {
  CostRecord,
  CostCategory,
  CostBudget,
  CostCheckResult,
  BudgetPeriod,
  ModelPricing,
} from "../guardrails/cost-controller";
export { RateLimiter, TokenBucket } from "../guardrails/rate-limiter";
export type {
  RateLimitResult,
  RateLimitConfig,
} from "../guardrails/rate-limiter";
// 注：harness 内部有一个 generic TokenBudgetService（mission-level token tracker），
// 与 ai-engine/llm/budget/token-budget.service.ts 同名但语义不同
// （后者带 smartTruncate 用于上下文窗口分配）。为避免 DI / import 歧义，
// 不在 facade 导出 harness 版本；ai-app 需要 token 预算请用 ai-engine/facade 的 TokenBudgetService。
export { HealthCheckRunner } from "../guardrails/health-check-runner";
export type { HealthCheckRunnerConfig } from "../guardrails/health-check-runner";
export { RuntimeEnvironmentService } from "../guardrails/runtime-environment.service";
export type {
  EnvironmentSnapshot,
  EnvironmentSnapshotParams,
  RuntimeModelCapability,
  RuntimeModelType,
  RuntimeToolCapability,
  RuntimeDepHealth,
  RuntimeUserKeyState,
} from "../guardrails/runtime-environment.types";

// ── Observability ──
export { TraceCollectorService } from "../tracing/trace-collector.service";
export { AiObservabilityService } from "../tracing/ai-observability.service";
export { CostAttributionService } from "../tracing/cost-attribution.service";
export { SessionLatencyTrackerService } from "../tracing/session-latency-tracker.service";
export { LlmTracingService } from "../tracing/llm-tracing.service";
export { EvalPipelineService } from "../tracing/eval-pipeline.service";
export type { EvalResult } from "../tracing/eval-pipeline.service";
export { EvalHarnessService } from "../tracing/eval-harness.service";
export { EvalExperimentService } from "../tracing/eval-experiment.service";
export {
  EVAL_RUN_STORE,
  InMemoryEvalRunStore,
  PrismaEvalRunStore,
} from "../tracing/eval-run.store";
export type { EvalRunStore } from "../tracing/eval-run.store";
export type {
  EvalCaseDefinition,
  EvalDataset,
  EvalRunnerContext,
  EvalCaseExecution,
  EvalCaseRunner,
  EvalMetric,
  EvalScorer,
  EvalHarnessRunRequest,
  EvalCaseResult,
  EvalRunSummary,
  EvalRunResult,
  EvalCaseStatus,
  EvalRunStatus,
  EvalRunComparison,
  EvalExperimentStatus,
  EvalExperimentPolicy,
  EvalExperimentViolation,
  EvalExperimentRunRequest,
  EvalExperimentResult,
} from "../tracing/eval-harness.types";
export type { TraceType } from "../tracing/trace.interface";
export type {
  SpanType,
  ExecutionStatus,
  SpanData,
  TraceData,
  TraceSummary,
  CreateTraceInput,
  CreateSpanInput,
  EndSpanInput,
  EndTraceInput,
  ListTracesOptions,
} from "../tracing/trace.interface";
export type {
  LatencySession,
  LatencyPhase,
  LatencyCheckpoint,
  LLMLatencyRecord,
  LatencySessionSummary,
  TTFTStats,
  LatencyPercentileStats,
  PhaseDurationSummary,
  LatencySessionType,
  LatencySessionStatus,
  StartSessionInput,
  StartPhaseInput,
  RecordLLMLatencyInput,
  ListSessionsFilter,
} from "../tracing/session-latency.types";

// ── Security ──
// PR-X15: 通过 engine/facade barrel，不穿透 engine 私有路径
export { CapabilityGuardService } from "../../ai-engine/facade";
export type { CapabilityCheckResult } from "../../ai-engine/facade";

// ════════════════════════════════════════════════════════════════════
// Protocol: events + ipc + journal + realtime
// ════════════════════════════════════════════════════════════════════
export {
  DomainEventBus,
  DomainEventRegistry,
  LoggerBroadcastAdapter,
} from "../protocol/events";
export type {
  DomainEvent,
  IBroadcastAdapter,
  DomainEventTypeSpec,
} from "../protocol/events";

// ── IPC ──
export { EventBusService } from "../protocol/ipc/event-bus.service";
export { EventBusService as EngineEventEmitterService } from "../protocol/ipc/event-bus.service";
export { ProgressTrackerService } from "../protocol/ipc/progress-tracker.service";
export { MessageBusService } from "../protocol/ipc/message-bus.service";
export type {
  A2AMessage,
  A2AMessageType,
} from "../protocol/ipc/message-bus.service";
export { MessagePersistenceService } from "../protocol/ipc/message-persistence.service";
export type { PersistedMessage } from "../protocol/ipc/message-persistence.service";
export { AgentLifecycleProtocolService } from "../protocol/ipc/agent-lifecycle-protocol.service";
export type {
  LifecycleMessageType,
  ShutdownRequestPayload,
  PlanApprovalPayload,
  TaskNotificationPayload,
} from "../protocol/ipc/agent-lifecycle-protocol.service";

// ── Journal ──
export { EventJournalService } from "../protocol/journal/event-journal.service";
export {
  CheckpointManager,
  InMemoryCheckpointStore,
} from "../protocol/journal/checkpoint-manager";
export type {
  ICheckpointStore,
  CheckpointManagerConfig,
} from "../protocol/journal/checkpoint-manager";

// ── Realtime ──
export type {
  RoomConfig,
  EngineEvent,
  IEngineEventEmitter,
  RoomType,
} from "../protocol/realtime/abstractions/event-emitter.interface";
export type {
  IProgressTracker,
  TrackedTask,
  CreateTrackedTaskRequest,
  TaskPhase,
} from "../protocol/realtime/abstractions/progress-tracker.interface";
export { calculateOverallProgress } from "../protocol/realtime/abstractions/progress-tracker.interface";

// ════════════════════════════════════════════════════════════════════
// Memory: auto-index + checkpoint + working
// ════════════════════════════════════════════════════════════════════
export { MemoryAutoIndexer } from "../memory/auto-index/memory-auto-indexer";
export { AgentEventStore, CheckpointService } from "../memory/checkpoint";
export type { ICheckpoint, AgentEventRecord } from "../memory/checkpoint";

// ── Working memory ──
export { ProcessMemoryManagerService } from "../memory/working/process-memory-manager.service";
export { HierarchicalMemoryCascadeService } from "../memory/working/hierarchical-memory-cascade.service";
export type {
  MemoryScope,
  MemoryCascadeQuery,
  MemoryCascadeResult,
  MemoryWriteOptions,
} from "../memory/working/hierarchical-memory-cascade.service";
export { SCOPE_PRIORITY } from "../memory/working/hierarchical-memory-cascade.service";

// ════════════════════════════════════════════════════════════════════
// Process: manager + scheduler + supervisor
// ════════════════════════════════════════════════════════════════════
export { ProcessManagerService } from "../lifecycle/manager/process-manager.service";
export type {
  ProcessId,
  SpawnOptions,
  ProcessSnapshot,
  ProcessTree,
  ProcessCapabilities,
} from "../lifecycle/manager/process.types";
export {
  VALID_TRANSITIONS,
  TERMINAL_STATES,
} from "../lifecycle/manager/process.types";
export {
  StateTransitionValidator,
  InvalidTransitionError,
} from "../lifecycle/manager/state-transition-validator";
export type { StateTransitionMap } from "../lifecycle/manager/state-transition-validator";
export { ProcessSupervisorService } from "../lifecycle/supervisor/process-supervisor.service";
// Backwards-compatible alias for legacy imports
export { ProcessSupervisorService as ExecutionStateManager } from "../lifecycle/supervisor/process-supervisor.service";
export {
  StateCategory,
  type StateEntry,
  type ExecutionStateStats,
  type ExecutionStateConfig,
} from "../lifecycle/supervisor/process-supervisor.service";
export { KernelSchedulerService } from "../runner/scheduler/kernel-scheduler.service";

// ════════════════════════════════════════════════════════════════════
// Teams: registry + factory + orchestrator + service (PR-X4)
// ════════════════════════════════════════════════════════════════════
export { TeamRegistry } from "../teams/registry/team-registry";
export { RoleRegistry } from "../teams/registry/role-registry";
export { TeamFactory } from "../teams/factory/team-factory";
export { TeamsMissionOrchestrator as MissionOrchestrator } from "../teams/orchestrator/teams-mission-orchestrator";
export { TeamsService } from "../teams/services/teams.service";
export type {
  TeamInfo,
  CreateMissionDto,
  MissionStatus,
} from "../teams/services/teams.service";
export type {
  ITeam,
  TeamConfig,
  TeamId,
  TeamType,
} from "../teams/abstractions/team.interface";
export { BUILTIN_TEAMS } from "../teams/abstractions/team.interface";
export type {
  IRole,
  RoleId,
  WorkStyle,
} from "../teams/abstractions/role.interface";
export { BUILTIN_ROLES } from "../teams/abstractions/role.interface";
export type {
  ITeamMember,
  TeamMemberId,
  MemberStatus,
} from "../teams/abstractions/member.interface";
export type { WorkflowConfig } from "../teams/abstractions/workflow.interface";
export type {
  MissionInput,
  MissionResult,
  MissionEvent,
} from "../teams/abstractions/mission.interface";
export type {
  MissionContextPackage,
  HardConstraint,
  CoreEntity,
  Prohibition,
  QualityStandard,
  EstablishedFact,
  TaskUnderstanding,
} from "../teams/abstractions/mission-context.interface";
export {
  createEmptyContextPackage,
  validateContextPackage,
  mergeContextPackages,
} from "../teams/abstractions/mission-context.interface";
export type {
  A2AMessage as TeamA2AMessage,
  A2AMessageType as TeamA2AMessageType,
  A2APriority,
  A2AMessageHandler,
} from "../teams/abstractions/a2a-message.interface";
export type { ConstraintProfile } from "../teams/constraints/constraint-profile";
export { createConstraintProfile } from "../teams/constraints/constraint-profile";
export type {
  IConstraintEngine,
  ConstraintEvaluation,
  ConstraintViolation as ConstraintEngineViolation,
} from "../teams/constraints/constraint-engine.interface";

// ════════════════════════════════════════════════════════════════════
// Runtime: mission + budget + billing + kernel-api
// ════════════════════════════════════════════════════════════════════
export { MissionBudgetPool } from "../runtime/mission/mission-budget-pool";
export { BillingRuntimeEnvAdapter } from "../guardrails/billing/billing-adapter";
export { MissionExecutorService } from "../runtime/mission/mission-executor.service";
export type {
  IMissionExecutor,
  MissionExecuteOptions,
  MissionExecuteResult,
} from "../runtime/mission/mission-executor.interface";
export { KernelApiService } from "../runtime/api/kernel-api.service";

// ════════════════════════════════════════════════════════════════════
// Common context (KernelContext lives in common/, surfaced here for ai-app DX)
// ════════════════════════════════════════════════════════════════════
export {
  KernelContext,
  type KernelContextData,
} from "../../../common/context/kernel-context";

// ════════════════════════════════════════════════════════════════════
// Kernel (Legacy) — PR-X5
// ════════════════════════════════════════════════════════════════════

// Legacy registry (IPlanBasedAgent plan→execute model)
// Note: Different from handoffs/agent-registry (IAgent runtime model)
export {
  AgentRegistry,
  type AgentRegistryStats,
} from "../kernel/registry/plan-based-agent-registry";
export {
  AgentOrchestrator,
  type AgentStatusReport,
} from "../kernel/registry/agent-orchestrator";

// Agent config (DB-stored runtime overrides)
export { AgentConfigService } from "../kernel/config/agent-config.service";

// Legacy base classes
// @deprecated — use HarnessedAgent / SpecBasedAgent for new agents
export { BaseAgent, createAgent } from "../kernel/base/base-agent";
export { ReactiveAgent } from "../kernel/base/reactive-agent";
export { PlanAgent } from "../kernel/base/plan-agent";
export {
  PlanBasedAgent,
  type IPlanBasedAgent,
} from "../kernel/base/plan-based-agent";

// ════════════════════════════════════════════════════════════════════
// Process (Collaboration) — PR-X5
// ════════════════════════════════════════════════════════════════════
export { CollaborationModule } from "../teams/collaboration/collaboration.module";
export { ReviewWorkflowService } from "../teams/collaboration/review/review-workflow.service";
export { TodoService } from "../teams/collaboration/todo/todo.service";
export { VotingManager } from "../teams/collaboration/patterns/voting-pattern";
export {
  HandoffCoordinator,
  HandoffContextBuilder,
} from "../teams/collaboration/patterns/handoff-pattern";
export type {
  CollaborationMessage,
  ICollaborator,
} from "../teams/collaboration/abstractions/collaborator.interface";

// ════════════════════════════════════════════════════════════════════
// MCP Protocol (PR-X14: migrated from ai-engine/facade shims)
// ════════════════════════════════════════════════════════════════════
export { MCPManager } from "../protocol/mcp/manager/mcp-manager";
export type {
  MCPServerConfig,
  MCPToolResult,
  MCPServerInfo,
  MCPTool,
} from "../protocol/mcp/abstractions/mcp.interface";

// ════════════════════════════════════════════════════════════════════
// Engine type forwards (PR-X14: harness 是 ai-app 的统一入口，
// 转发常用 engine 类型避免 ai-app 同时 import 两个 facade)
// ════════════════════════════════════════════════════════════════════
export type {
  TaskProfile,
  ChatMessage,
  CreativityLevel,
  OutputLengthLevel,
  ReasoningDepth,
  ContentPart,
  TextContentPart,
  ImageUrlContentPart,
} from "../../ai-engine/llm/types";

export type {
  ISkill,
  SkillContext,
  SkillResult,
  SkillPermissions,
  SkillLayer,
  SkillResultError,
  SkillResultMetadata,
  SkillDefinition,
  SkillConfig,
} from "../../ai-engine/skills/abstractions/skill.interface";

// 2026-05-01 (PR-X-R): Harness Kernel SKILL.md-style 端口，供 ai-engine 适配器
// 实现 ISkillProvider 把 DB-backed PromptSkill 透给 SkillActivator。
// 与上面的 ISkill (engine CRUD-style) 区分：kernel 这个是 frontmatter+instructions。
export type {
  ISkill as IKernelSkill,
  ISkillFrontmatter,
  ISkillProvider,
  ISkillLoader,
  ISkillActivationContext,
} from "../kernel/abstractions/skill.interface";
export { SKILL_PROVIDERS } from "../kernel/abstractions/skill.interface";

// Engine LLM service classes (PR-X14: harness facade 转发常用 engine 服务)
export { AiChatService } from "../../ai-engine/llm/services/ai-chat.service";
export { ModelFallbackService } from "../../ai-engine/llm/selection/model-fallback.service";
export type { ModelFallbackOptions } from "../../ai-engine/llm/selection/model-fallback.service";
export type { AIModelConfig } from "../../ai-engine/llm/services/ai-model-config.service";

// Engine content/fetch helpers used by ai-app/social
export {
  sanitizeForDb,
  sanitizeJson,
} from "../../ai-engine/content/fetch/content-fetch.types";
