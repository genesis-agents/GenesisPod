/**
 * AI Harness Facade —— ai-app 唯一入口
 *
 * 当前顶层聚合：agents / evaluation / facade / guardrails / handoffs /
 * lifecycle / memory / protocols / runner / teams / tracing
 *
 * ★ 单向依赖：ai-app → ai-harness → ai-engine。
 * ★ ai-app 任何 harness 符号必须从这里 import，禁止穿透 harness 内部路径。
 */

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Kernel：abstractions + core + dx
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export * from "../agents/abstractions";
// v3 R0-A1-a: BUILTIN_AGENTS / AGENT_CONFIGS / BuiltinAgentId 已删除（业务名下推到各 ai-app *.constants.ts）
export { AgentFactory } from "../agents/core/agent-factory";
export { SpecAgentRegistry } from "../agents/core/spec-agent-registry";
export {
  BuiltinSkillCatalog,
  BuiltInReActSkillRegistry,
} from "../agents/skill-runtime/skill-registry";
export { EXTRA_SKILL_DIRS } from "../agents/skill-runtime/skill-loader";
export {
  AgentRunner,
  AgentSpec,
  DefineAgent,
  FixtureStore,
} from "../agents/dev-tools";
export type { RunResult } from "../agents/dev-tools";

// Service facade
export { HarnessFacade } from "./harness.facade";

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// AIFacade + Domain Facades (moved from ai-engine/facade — PR-X13)
// ai-app 模块通过 "@/modules/ai-harness/facade" 统一导入
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export { AIFacade } from "./ai.facade";
export * from "./domain";
export { RAGPipelineService } from "../../ai-engine/rag/pipeline/rag-pipeline.service";
export { PromptSkillBridge } from "../../ai-engine/skills/runtime";
export { ToolRegistry } from "../../ai-engine/tools/registry/tool.registry";
export { FederalRegisterTool } from "../../ai-engine/tools/categories/information/policy/federal-register.tool";
export { CongressGovTool } from "../../ai-engine/tools/categories/information/policy/congress-gov.tool";
export { WhiteHouseNewsTool } from "../../ai-engine/tools/categories/information/policy/whitehouse-news.tool";
export type {
  ITool,
  ToolContext,
  BuiltinToolId,
  ToolId,
} from "../../ai-engine/tools/abstractions/tool.interface";
export type {
  ImageSearchResult,
  ImageSearchOutput,
} from "../../ai-engine/tools/categories/information/image-search/image-search.types";
export { ConcurrencyPlanner } from "../guardrails/resources/concurrency-planner.service";
export type {
  ConcurrencyPlanOptions,
  ConcurrencyPlan,
} from "../guardrails/resources/concurrency-planner.service";
export { YoutubeService } from "../../ai-engine/content/fetch/youtube.service";
export type { TranscriptSegment } from "../../ai-engine/content/fetch/youtube.service";
export {
  IMAGE_GENERATION_SERVICE,
  TTS_SERVICE,
} from "../../ai-engine/tools/abstractions/generation-services.interface";
export type { IImageGenerationService } from "../../ai-engine/tools/abstractions/generation-services.interface";
export { IMAGE_GENERATION_SERVICE_TOKEN } from "../../ai-engine/content/abstractions/image.interface";

// ★ LLM 输出后处理（白名单清理 + 修复函数）
export {
  sanitizeSectionOutput,
  stripLeadingBulletLists,
  stripAnalyticalInlineBullets,
  stripSectionOpeningShortLines,
  stripCitationStacking,
  replaceMarketingLanguage,
  repairBrokenBoldPairs,
  normalizeTransitionHeadings,
  normalizeBoldStyle,
  convertOrdinalBulletsToParagraphs,
  fixOrdinalBoldPosition,
  convertLongListItemsToParagraphs,
  removeOrphanCitations,
  stripChartJsonFromContent,
  extractMarkdownFromJsonString,
} from "../../ai-engine/llm/output-parsing";

// â˜… Planning & Knowledge services
export { TokenBudgetService } from "../../ai-engine/planning/budget/token-budget.service";
export { ContextCompressionService } from "../../ai-engine/planning/context/context-compression.service";
export { ContextEvolutionService } from "../../ai-engine/knowledge/extraction/context-evolution.service";
export { CrossCuttingSynthesisService } from "../../ai-engine/knowledge/synthesis/cross-cutting-synthesis.service";
export type { SynthesisResult } from "../../ai-engine/knowledge/synthesis/cross-cutting-synthesis.service";
export { PromptCacheCoordinatorService } from "../../ai-engine/llm/services/prompt-cache-coordinator.service";
export type { SaveEvidenceRequest } from "../../ai-engine/knowledge/evidence/abstractions/evidence.interface";
export { inferIsReasoning } from "../../ai-engine/llm/types/model.utils";
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Governance: verify + resource + observability + security
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export { JudgeService } from "../evaluation/verify";
export type { BuiltInVerifierId } from "../evaluation/verify";
// ★ 沉淀（2026-04-29）: figure 相关性判断（来自 {app}, TI 暂不切换）
export { FigureRelevanceService } from "../evaluation/figure";
// ★ 沉淀（2026-04-29）: Reflexion critique-refine + section-self-eval + defect-scanner
//   v3 (åŒæ—¥): quality-gate / section-remediation / report-evaluation / quality-trace-compute
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
export { ConcurrencyLimiter } from "../runner/concurrency";

// ★ Phase 9 (2026-04-30): Mission 运行时状态外置 + Orphan 检测（harness 无状态化）
export {
  MissionRuntimeStateStore,
  type MissionHeartbeat,
  HEARTBEAT_INTERVAL_MS,
} from "../lifecycle/mission-lifecycle/runtime-state-store";
// ★ 2026-05-05 unified harness liveness guard（替代 4 个旧 detector 的归并）
//   MissionOrphanDetectorService 已删除（Redis-based 不可靠 + 长期 disabled）
export {
  MissionLivenessGuard,
  type MissionLivenessAdapter,
  type MissionLivenessConfig,
  type MissionLivenessRow,
  type MissionLivenessScanResult,
} from "../lifecycle/mission-lifecycle";

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
export { AgentExecutorService } from "../runner/executor/agent-executor.service";

// ★ 2026-05-01 (PR-X-L): runner/executor/interfaces.ts 类型从 ai-engine/facade
//   下沉过来 — 它们是 L2.5 ai-harness/runner 层 owned，原 engine facade 反向
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
} from "../runner/executor/executor.types";
export { DEFAULT_CONTEXT_EVOLUTION_CONFIG } from "../runner/executor/executor.types";
// ★ 2026-05-01 (PR-X-M): UserIntent / ContextStrategy 是 L2 LLM 能力概念，
// owner 是 ai-engine/llm/intent；harness facade 仅 re-export 让 ai-app 透明
export {
  UserIntent,
  ContextStrategy,
} from "../../ai-engine/planning/intent/intent.types";

// ★ 2026-05-01 (PR-X-L): runner/capabilities 类型同上下沉
export type { AICapabilityContext } from "../runner/capabilities/ai-capability-resolver.service";
export type {
  SkillPromptBundle,
  SkillPromptOptions,
} from "../runner/capabilities/types";

// ★ 2026-05-01 (PR-X-L): ExecutionCheckpointService 也是 L2.5 ai-harness 概念
export {
  ExecutionCheckpointService,
  type ExecutionCheckpoint,
} from "../runner/executor/execution-checkpoint.service";

// ★ 2026-05-01 (PR-X-M2): 一组 L2.5 runtime 类型从 ai-engine/facade 反向 re-export 下沉过来
export type { TeamMemberInfo } from "../runner/executor/executor.types";
export type { IConstraintEnforcementService } from "../runner/executor/executor.types";
export { AICapabilityResolver } from "../runner/capabilities/ai-capability-resolver.service";
export {
  QueryLoopService,
  type QueryLoopConfig,
  type QueryLoopResult,
  type QueryLoopStopReason,
} from "../runner/executor/query-loop.service";
export {
  TokenTrackerService,
  type TokenUsageSnapshot,
  type TokenUsageEntry,
} from "../runner/executor/token-tracker.service";
export {
  SessionMemorySidecarService,
  type SidecarCategory,
  type SidecarEntry,
  type SidecarConfig,
} from "../runner/executor/session-memory-sidecar.service";
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
} from "../teams/orchestrator/workflow-orchestrator.interface";

// ★ 2026-04-30: OutputReviewerService 从 ai-engine/planning 搬来（跨层迁移）
// â˜… 2026-05-02 (#1 MECE): runtime/quality → evaluation/critique æ”¶æ•›
export { OutputReviewerService } from "../evaluation/critique/output-reviewer.service";

// ★ 2026-05-01: ReportArtifactAssembler 从 ai-app/{app} 上提（跨 app 复用）
//   consumer v2 ReportArtifact (sections/citations/figures/quickView) 装配纯函数
export {
  ReportArtifactAssembler,
  lengthTargetFor,
} from "../evaluation/critique/report-artifact/report-artifact-assembler.service";

// ★ PR-A0 (2026-05-06 v1.4 报告装配重构):
//   ReportSegments / ReportTemplate Slot 抽象 + 默认模板 + 不变量辅助函数
export {
  MULTI_DIMENSION_REPORT_TEMPLATE,
  SINGLE_AGENT_FREEFORM_TEMPLATE,
  expectedSectionCount,
} from "../evaluation/critique/report-artifact/report-segments.dto";
export type {
  ReportSegments,
  ReportTemplate,
  ReportTemplateSlot,
  SlotBodySource,
} from "../evaluation/critique/report-artifact/report-segments.dto";

// ★ PR-A2 (2026-05-06 v1.4 报告装配重构):
//   StructuralReportAssembler — 接收 ReportSegments → 拼装 ReportArtifact
//   stateless / 0 LLM call / offset 一次性确定 / template-aware
export {
  StructuralReportAssembler,
  defaultStructuralReportAssembler,
  assembleStructuralReport,
} from "../evaluation/critique/report-artifact/structural-report-assembler.service";

// ★ PR-R0 (2026-05-07 per-task rerun + cascade):
//   ReportArtifactZodSchema 运行期校验 + parseReportArtifact helper
//   用途：ctx-hydrator 从 mission.report_full 读出后必须 zod parse；防 historic 数据污染
export {
  ReportArtifactZodSchema,
  parseReportArtifact,
} from "../evaluation/critique/report-artifact/report-artifact-zod.schema";
export type {
  ValidatedReportArtifact,
  ParseReportArtifactResult,
} from "../evaluation/critique/report-artifact/report-artifact-zod.schema";

export {
  MissionElectionTracker,
  ModelElectionService,
} from "../../ai-engine/llm/selection";
export type { MissionElectionReservation } from "../../ai-engine/llm/selection";

// ★ PR-R1 (2026-05-07 per-task rerun + cascade):
//   Stage 静态依赖图元数据（每 stage 声明 successors / ctxReads / dbWrites / resetFields）
//   用途：cascade 执行器调度；ctx-hydrator 校验完整性；mission-store reset 范围
export {
  validateStageDag,
  computeCascadeChain,
  collectResetFieldsForCascade,
} from "../runner/dag";
export type { StageDagMeta, MissionColumnKey } from "../runner/dag";

// ★ 2026-05-01: FailureLearnerService 从 ai-app/{app} 上提
// ★ 2026-05-02 (W1 MECE): governance/learning → lifecycle/learning（失败学习是生命周期闭环）
//   跨 mission 失败模式记忆（harness_failure_patterns 表），供 BillingRuntimeEnvAdapter 等消费
export { FailureLearnerService } from "../lifecycle/learning/failure-learner.service";

// ★ 2026-05-04 (PR-2 standardize): PostmortemClassifierService 从
//   ai-app/{app}/services/postmortem 上提到 lifecycle/learning（与
//   FailureLearner 同包，纯函数事件流→FailureMode 分类，跨 ai-app 复用）
// ★ 2026-05-04 (R0-A4): 加 PostmortemPatterns + GENERIC_POSTMORTEM_PATTERNS export，
//   substring patterns 由 caller (ai-app) 注入，base layer 不含业务概念
export {
  PostmortemClassifierService,
  GENERIC_POSTMORTEM_PATTERNS,
  type FailureMode as PostmortemFailureMode,
  type ClassifyInput as PostmortemClassifyInput,
  type ClassifyResult as PostmortemClassifyResult,
  type PostmortemPatterns,
} from "../lifecycle/learning/postmortem-classifier.service";

// ★ 2026-05-01: SocketBroadcastAdapter 从 ai-app/{app}/adapters/ 上提
//   参数化 prefix 后跨 ai-app 通用（DomainEvent → Socket.IO room），任何带 socket relay
//   的 ai-app 都可复用
export {
  SocketBroadcastAdapter,
  type SocketBroadcastAdapterOptions,
} from "../protocols/realtime/socket-broadcast.adapter";

// ★ 2026-05-01: MissionAbortRegistry / MissionOwnershipRegistry 从 ai-app/{app} 上提
//   两个纯通用 in-memory registry primitive（abort signal 管理 / mission→user ownership LRU），
//   跨 ai-app 复用（research / writing / teams 任何长任务编排都需要）
export { MissionAbortRegistry } from "../lifecycle/mission-lifecycle/abort-registry";
export { MissionOwnershipRegistry } from "../lifecycle/mission-lifecycle/ownership-registry";
// ★ 2026-05-08 PR-E0: BusinessAgentTeam mission runtime shell 框架
export { MissionRuntimeShellFramework } from "../teams/business-team/lifecycle/mission-runtime-shell.framework";
export type {
  IMissionRuntimeAdapter,
  MissionRuntimeSession,
} from "../teams/business-team/abstractions/mission-runtime-shell.interface";
// ★ 2026-05-08 PR-E1: BusinessAgentTeam event relay 框架（namespace-aware）
export {
  EventRelayFramework,
  type EventRelayContext,
} from "../teams/business-team/relay/event-relay.framework";
// ★ 2026-05-08 PR-E2: BusinessAgentTeam mission store 抽象接口
//   注意：rename 为 IBusinessTeamMissionStore 避免与 line 1103 已有 IMissionStore 冲突
//   （后者是 harness/teams/abstractions 下的 generic InMemoryMissionStore 契约）
export type { IBusinessTeamMissionStore } from "../teams/business-team/abstractions/mission-store.interface";
// ★ 2026-05-08 PR-E3: BusinessAgentTeam rerun guard 9-cell 决策矩阵纯函数框架
//   ctx-hydrator / stage-rerun-dispatcher 接口暂不上提（YAGNI，等第二个业务方来）
export {
  decideMissionInFlight,
  HEARTBEAT_FRESH_THRESHOLD_MS_DEFAULT,
  BUSINESS_EVENT_FRESH_THRESHOLD_MS_DEFAULT,
  type HeartbeatDecisionInput,
  type HeartbeatDecision,
} from "../teams/business-team/rerun/heartbeat-decision";
export type { IBusinessRerunGuard } from "../teams/business-team/abstractions/rerun-guard.interface";
// ★ 2026-05-08 PR-E4: BusinessAgentTeam 一站装配规约（聚合 E0/E1/E2/E3 4 个 adapter）
//   YAGNI: 真 BusinessAgentTeamFactory 类等 2nd consumer (research / writing / TI 反向迁移)
//   出现时再抽。当前阶段 NestJS DI 完成装配，业务模块只需实现本规约的 4 个字段。
export type { BusinessAgentTeamSpec } from "../teams/business-team/abstractions/business-team-spec.interface";
// ★ 2026-05-04 (PR-3 standardize consumer)
export { RerunLockRegistry } from "../lifecycle/mission-lifecycle/rerun-lock.registry";

// ★ 2026-05-04 (PR-6 standardize consumer): jaccardSimilarity engine 转发
export { jaccardSimilarity } from "../../ai-engine/facade";

// ★ 2026-05-04 (PR-10b standardize consumer): JSON-fence parser engine 转发
export {
  parseJsonFence,
  extractJsonFenceContent,
  type JsonFenceParseResult,
} from "../../ai-engine/facade";

// ★ 2026-05-04 (PR-5 standardize consumer): handoff token estimate + compress
export { HandoffCompactorService } from "../memory/working/handoff-compactor.service";

// ★ 2026-05-01: stage-emit util 从 ai-app/{app} 上提
//   通用 stage:completed 事件封装，含 durationMs / tokensUsed / agentInvocations 等度量
export {
  startStageTimer,
  type StageTimer,
  type StageTimerEmitOptions,
  type EmitFn,
} from "../protocols/ipc/stage-emit.utils";

// 通用 stage instrumentation wrapper（消除 ai-app stage 文件的 50% boilerplate）
export {
  runWithStageInstrumentation,
  type StageInstrumentationCtx,
  type StageInstrumentationDeps,
  type StageInstrumentationConfig,
  type NarrateFn,
} from "../protocols/ipc/stage-instrumentation.helper";

// ★ 2026-05-01 (PR-X-N): 让 ai-app 走 facade，不需穿透 harness 内部路径
export {
  extractTokenSpend,
  estimateUsdFromTokens,
} from "../tracing/observability/token-spend.utils";
export {
  extractAgentFailureDiagnostic,
  extractFailureMessage,
} from "../tracing/observability/failure-extraction.utils";
export {
  clampScore,
  scaleScore,
} from "../evaluation/critique/quality-score.utils";
// FunctionCallingExecutor.AgentEvent — 给 teams 服务用作 event 类型
export type { AgentEvent as FunctionCallingAgentEvent } from "../runner/executor/function-calling-executor";
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
} from "../memory/consolidation/memory-consolidation.service";
export {
  AutoDreamSchedulerService,
  type SchedulerConfig as AutoDreamSchedulerConfig,
  type ScheduledScope as AutoDreamScheduledScope,
  type SchedulerStats as AutoDreamSchedulerStats,
} from "../memory/consolidation/memory-consolidation-scheduler.service";

// ★ 2026-05-15 PR-I: Dreaming（主动反思）— ReflectionMissionScheduler + RuleBase
export {
  ReflectionMissionScheduler,
  DEFAULT_DREAMING_CONFIG,
  type DreamingRule,
  type DreamingRunResult,
  type DreamingSample,
  type DreamingSchedulerConfig,
  type DreamingTrigger,
  type DreamingTriggerKind,
  type InjectedRuleSet,
} from "../evaluation/dreaming";

// ★ 沉淀 Phase 4 (2026-04-29): Checkpoint / Health / DAG 三件套
export {
  MissionCheckpointService,
  type MissionCheckpointSnapshot,
  type MissionCheckpointStore,
  type MissionResumeDecision,
  InMemoryMissionCheckpointStore,
} from "../memory/mission-checkpoint";
export {
  MissionHealthMonitor,
  type MissionHealthSnapshot,
  type HealthCheckConfig,
  type HealthVerdict,
  type HealthCheckResult,
  type MissionHealthMonitorOptions,
} from "../lifecycle/mission-lifecycle/health-monitor";
export {
  DAGExecutor,
  type DAGTask,
  type DAGAdapter,
  type DAGSchedulerConfig,
  type DAGExecutionResult,
} from "../runner/dag";

// â”€â”€ Resource â”€â”€
export { ResourceManagerService } from "../guardrails/resources/resource-manager.service";
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
export { ConstraintEngine } from "../guardrails/constraints/constraint-engine";
export { ConstraintEnforcementService } from "../guardrails/constraints/constraint-enforcement.service";
export { CostController } from "../guardrails/resources/cost-controller";
export type {
  CostRecord,
  CostCategory,
  CostBudget,
  CostCheckResult,
  BudgetPeriod,
  ModelPricing,
} from "../guardrails/resources/cost-controller";
export { RateLimiter, TokenBucket } from "../guardrails/resources/rate-limiter";
export type {
  RateLimitResult,
  RateLimitConfig,
} from "../guardrails/resources/rate-limiter";
// 注：harness 内部有一个 generic TokenBudgetService（mission-level token tracker），
// 与 ai-engine/llm/budget/token-budget.service.ts 同名但语义不同
// （后者带 smartTruncate 用于上下文窗口分配）。为避免 DI / import 歧义，
// 不在 facade 导出 harness 版本；ai-app 需要 token 预算请用 ai-engine/facade 的 TokenBudgetService。
export { HealthCheckRunner } from "../guardrails/resources/health-check-runner";
export type { HealthCheckRunnerConfig } from "../guardrails/resources/health-check-runner";
export { RuntimeEnvironmentService } from "../guardrails/runtime/runtime-environment.service";
export type {
  EnvironmentSnapshot,
  EnvironmentSnapshotParams,
  RuntimeModelCapability,
  RuntimeModelType,
  RuntimeToolCapability,
  RuntimeDepHealth,
  RuntimeUserKeyState,
} from "../guardrails/runtime/runtime-environment.types";

// â”€â”€ Observability â”€â”€
export { TraceCollectorService } from "../tracing/observability/trace-collector.service";
export { AiObservabilityService } from "../tracing/observability/ai-observability.service";
export { CostAttributionService } from "../tracing/observability/cost-attribution.service";
export { SessionLatencyTrackerService } from "../tracing/latency/session-latency-tracker.service";
export { LlmTracingService } from "../tracing/observability/llm-tracing.service";
export { EvalPipelineService } from "../tracing/evaluation/eval-pipeline.service";
export type { EvalResult } from "../tracing/evaluation/eval-pipeline.service";
export { EvalHarnessService } from "../tracing/evaluation/eval-harness.service";
export { EvalExperimentService } from "../tracing/evaluation/eval-experiment.service";
export {
  EVAL_RUN_STORE,
  InMemoryEvalRunStore,
  PrismaEvalRunStore,
} from "../tracing/evaluation/eval-run.store";
export type { EvalRunStore } from "../tracing/evaluation/eval-run.store";
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
} from "../tracing/evaluation/eval-harness.types";
export type { TraceType } from "../tracing/observability/trace.interface";
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
} from "../tracing/observability/trace.interface";
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
} from "../tracing/latency/session-latency.types";

// â”€â”€ Security â”€â”€
// PR-X15: 通过 engine/facade barrel，不穿透 engine 私有路径
export { CapabilityGuardService } from "../../ai-engine/facade";
export type { CapabilityCheckResult } from "../../ai-engine/facade";

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Protocol: events + ipc + journal + realtime
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export {
  DomainEventBus,
  DomainEventRegistry,
  LoggerBroadcastAdapter,
} from "../protocols/events";
export type {
  DomainEvent,
  IBroadcastAdapter,
  DomainEventTypeSpec,
} from "../protocols/events";

// â”€â”€ IPC â”€â”€
export { EventBusService } from "../protocols/ipc/event-bus.service";
export { EventBusService as EngineEventEmitterService } from "../protocols/ipc/event-bus.service";
export { ProgressTrackerService } from "../protocols/ipc/progress-tracker.service";
export { MessageBusService } from "../protocols/ipc/message-bus.service";
export type {
  A2AMessage,
  A2AMessageType,
} from "../protocols/ipc/message-bus.service";
export { MessagePersistenceService } from "../protocols/ipc/message-persistence.service";
export type { PersistedMessage } from "../protocols/ipc/message-persistence.service";
export { AgentLifecycleProtocolService } from "../protocols/ipc/agent-lifecycle-protocol.service";
export type {
  LifecycleMessageType,
  ShutdownRequestPayload,
  PlanApprovalPayload,
  TaskNotificationPayload,
} from "../protocols/ipc/agent-lifecycle-protocol.service";

// â”€â”€ Journal â”€â”€
export { EventJournalService } from "../protocols/journal/event-journal.service";
export {
  CheckpointManager,
  InMemoryCheckpointStore,
} from "../protocols/journal/checkpoint-manager";
export type {
  ICheckpointStore,
  CheckpointManagerConfig,
} from "../protocols/journal/checkpoint-manager";

// â”€â”€ Realtime â”€â”€
export type {
  RoomConfig,
  EngineEvent,
  IEngineEventEmitter,
  RoomType,
} from "../protocols/realtime/abstractions/event-emitter.interface";
export type {
  IProgressTracker,
  TrackedTask,
  CreateTrackedTaskRequest,
  TaskPhase,
} from "../protocols/realtime/abstractions/progress-tracker.interface";
export { calculateOverallProgress } from "../protocols/realtime/abstractions/progress-tracker.interface";

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Memory: indexing + checkpoint + working
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export { MemoryAutoIndexer } from "../memory/indexing/memory-auto-indexer";
// ★ 2026-05-15 PR-C: AgentStepCheckpointService（react-loop / agent runtime 粒度，by agentId）
//   与上方 MissionCheckpointService（mission / business stage 粒度，by missionId）不同 scope，
//   名字差异化避免混淆。
export {
  AgentEventStore,
  AgentStepCheckpointService,
} from "../memory/checkpoint";
export type { ICheckpoint, AgentEventRecord } from "../memory/checkpoint";

// â”€â”€ Working memory â”€â”€
export { ProcessMemoryManagerService } from "../memory/working/process-memory-manager.service";
export { HierarchicalMemoryCascadeService } from "../memory/working/hierarchical-memory-cascade.service";
export type {
  MemoryScope,
  MemoryCascadeQuery,
  MemoryCascadeResult,
  MemoryWriteOptions,
} from "../memory/working/hierarchical-memory-cascade.service";
export { SCOPE_PRIORITY } from "../memory/working/hierarchical-memory-cascade.service";

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Process: manager + scheduler + supervisor
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Teams: registry + factory + orchestrator + service (PR-X4)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
// v3 R0-A1-c: BUILTIN_TEAMS 已删除（业务名下推到各 ai-app *.constants.ts）
export type {
  IRole,
  RoleId,
  RoleConfig,
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
} from "../agents/abstractions/mission.types";
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
} from "../protocols/ipc/abstractions/a2a-message.types";
export type { ConstraintProfile } from "../teams/constraints/constraint-profile";
export { createConstraintProfile } from "../teams/constraints/constraint-profile";
export type {
  IConstraintEngine,
  ConstraintEvaluation,
  ConstraintViolation as ConstraintEngineViolation,
} from "../teams/constraints/constraint-engine.interface";

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Runtime: mission + budget + billing + kernel-api
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export { MissionBudgetPool } from "../guardrails/budget/mission-budget-pool";
export { BillingRuntimeEnvAdapter } from "../guardrails/billing/billing-adapter";
export { MissionExecutorService } from "../lifecycle/manager/mission-executor.service";
export type {
  IMissionExecutor,
  MissionExecuteOptions,
  MissionExecuteResult,
} from "../lifecycle/manager/mission-executor.interface";
export { HarnessApiService, KernelApiService } from "./api/harness-api.service";
export { HarnessApiModule } from "./api/harness-api.module";

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Common context (KernelContext lives in common/, surfaced here for ai-app DX)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export {
  KernelContext,
  type KernelContextData,
} from "../../../common/context/kernel-context";

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Kernel (Legacy) — PR-X5
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// Legacy registry (IPlanBasedAgent plan→execute model)
// Note: Different from handoffs/agent-registry (IAgent runtime model)
export {
  AgentRegistry,
  type AgentRegistryStats,
} from "../agents/registry/plan-based-agent-registry";
export {
  AgentOrchestrator,
  type AgentStatusReport,
} from "../agents/registry/agent-orchestrator";

// Agent config (DB-stored runtime overrides)
export { AgentConfigService } from "../agents/config/agent-config.service";

// Legacy base classes
// @deprecated — use HarnessedAgent / SpecBasedAgent for new agents
export { BaseAgent, createAgent } from "../agents/base/base-agent";
export { ReactiveAgent } from "../agents/base/reactive-agent";
export { PlanAgent } from "../agents/base/plan-agent";
export {
  PlanBasedAgent,
  type IPlanBasedAgent,
} from "../agents/base/plan-based-agent";

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Process (Collaboration) — PR-X5
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export { CollaborationModule } from "../teams/collaboration/collaboration.module";
export { ReviewWorkflowService } from "../teams/collaboration/review/review-workflow.service";
export { TodoService } from "../teams/collaboration/todo/todo.service";
export { VotingManager } from "../teams/collaboration/patterns/voting-pattern";
export {
  HandoffCoordinator,
  HandoffContextBuilder,
} from "../teams/collaboration/patterns/handoff-pattern";
// Debate pattern (W1 PR2: 抽象编排基元，无持久化)
export {
  DebatePattern,
  buildAgentSystemPrompt,
  composeJudgeUserMessage,
  composeRoundUserMessage,
} from "../teams/collaboration/debate";
export type {
  DebatePatternConfig,
  DebateRole,
  DebateRoundResult,
  IDebateAgent,
} from "../teams/collaboration/debate";
export type {
  CollaborationMessage,
  ICollaborator,
} from "../teams/collaboration/abstractions/collaborator.interface";

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MCP Protocol (PR-X14: migrated from ai-engine/facade shims)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export { MCPManager } from "../../ai-engine/tools/adapters/mcp/manager/mcp-manager";
export type {
  MCPServerConfig,
  MCPToolResult,
  MCPServerInfo,
  MCPTool,
} from "../../ai-engine/tools/adapters/mcp/abstractions/mcp.interface";

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Engine type forwards (PR-X14: harness 是 ai-app 的统一入口，
// 转发常用 engine 类型避免 ai-app 同时 import 两个 facade)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
} from "../agents/abstractions/skill.interface";
export { SKILL_PROVIDERS } from "../agents/abstractions/skill.interface";

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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// BYOK / Credentials (re-exported from ai-infra/facade)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export {
  KeyAssignmentsService,
  KeyRequestsService,
  UserApiKeysService,
  KeyResolverService,
  UserModelConfigsService,
  CreateKeyRequestDto,
  SaveUserApiKeyDto,
  ApiKeyMode,
  TestApiKeyDto,
  CreateUserModelConfigDto,
  UpdateUserModelConfigDto,
} from "../../ai-infra/facade";

export { AiModelDiscoveryService } from "../../ai-engine/llm/services/ai-model-discovery.service";
export { AiConnectionTestService } from "../../ai-engine/llm/services/ai-connection-test.service";
export { AutoConfigureService } from "../../ai-engine/llm/user-config/user-models-auto-configure.service";

// Compatibility forwards for ai-app imports that still use the harness facade
// as the single public entrypoint while their implementations remain engine-owned.
export {
  wrapExternalContent,
  wrapExternalContentBatch,
  HEADING_HIERARCHY,
  NARRATIVE_STRUCTURE,
  PROFESSIONAL_TONE,
  FORMATTING_LIMITS,
  CITATION_STANDARDS,
  ANALYSIS_DEPTH,
  CHART_STANDARDS,
  TABLE_STANDARDS,
  QUALITY_CHECKLIST,
  HEADING_HIERARCHY_EN,
  NARRATIVE_STRUCTURE_EN,
  PROFESSIONAL_TONE_EN,
  FORMATTING_LIMITS_EN,
  EXECUTIVE_SUMMARY_FORMAT_EN,
  restoreGlobalIndices,
  FunctionCallingLLMAdapter,
  EmbeddingService,
  VectorService,
  DocumentChunker,
  DEFAULT_CHUNKING_CONFIG,
  ImageMatchingService,
  SKILL_LAYERS,
  ImageType,
  ImagePlacement,
  IMAGE_MATCHING_RULES,
  ContentComplexity,
  ContentCategory,
  DataDensity,
  TemporalDimension,
  HierarchyType,
  AIError,
  AIErrorType,
  AIErrorClassifier,
  createSkillOutputManager,
  isRetryableError,
  isRateLimitError,
  isPermanentError,
  isApiErrorContent,
  parseErrorType,
  calculateBackoffDelay,
  sleep,
  withRetry,
  DEFAULT_RETRY_CONFIG,
} from "../../ai-engine/facade";
export type {
  ProcessedDocument,
  EmbeddingResult,
  EmbeddingBatch,
  SimilaritySearchOptions,
  SimilarityResult,
  VectorSearchResult,
  ChildChunkData,
  ParentChunkData,
  ChunkedDocument,
  EmbeddingModelConfig,
  ChunkingConfig,
  KnowledgeBaseStats,
  SyncResult,
  GoogleDriveFile,
  ImagePrompt,
  ImageMatchingResult,
  ImageMatchingRule,
  ImageRequirement,
  ContentFeatures,
  ExtractedEntity,
  VisualizationOpportunity,
  ParagraphFeatures,
  SectionFeatures,
  ISkillOutputManager,
  TokenBudgetModelConfig,
  TokenBudget,
  ContentPriority,
  BudgetAllocation,
  ErrorDetectionRetryConfig,
} from "../../ai-engine/facade";
export { SkillRegistry } from "../../ai-engine/skills/registry/skill.registry";

// ╔════════════════════════════════════════════════════════════════════════
// v5.1 R1 — Mission pipeline framework（generic primitive 框架）
// ai-app（writing-team / consumer 等）通过本 facade import 框架符号
// ╚════════════════════════════════════════════════════════════════════════

// R1-A primitives + cross-stage state
export {
  CrossStageState,
  StageAbortError,
  type IStagePrimitive,
  type StagePrimitiveId,
  type StageStepConfig,
  type StageRunArgs,
  type ResolvedRole,
  type ResolvedStageHooks,
  type StageHookFn,
  type MissionContext,
  type RoleState,
  type PastDecision as StagePastDecision,
} from "../teams/services/stages/abstractions";
export {
  PLAN_PRIMITIVE,
  RESEARCH_PRIMITIVE,
  ASSESS_PRIMITIVE,
  SYNTHESIZE_PRIMITIVE,
  DRAFT_PRIMITIVE,
  REVIEW_PRIMITIVE,
  SIGNOFF_PRIMITIVE,
  PERSIST_PRIMITIVE,
  LEARN_PRIMITIVE,
  ALL_STAGE_PRIMITIVES,
} from "../teams/services/stages";

// R1-B pipeline orchestrator + config + registry
export {
  defineMissionPipeline,
  validatePipelineConfig,
  type MissionPipelineConfig,
  type PipelineStepConfig,
  type PipelineRoleConfig,
} from "../teams/orchestrator/pipeline/mission-pipeline-config";
export { MissionPipelineRegistry } from "../teams/orchestrator/pipeline/mission-pipeline-registry.service";
export {
  MissionPipelineOrchestrator,
  type MissionEvent as PipelineMissionEvent,
  type MissionResult as PipelineMissionResult,
  type RunPipelineArgs,
} from "../teams/orchestrator/pipeline/mission-pipeline-orchestrator.service";

// R1-C mission store ports + in-memory adapters
export {
  type IMissionStore,
  type IMissionEventStore,
  type MissionRecord,
  type MissionCreateInput,
  type MissionStatusUpdate,
  type MissionEventRecord,
  type PastDecision,
} from "../lifecycle/mission-lifecycle/abstractions";
export {
  InMemoryMissionStore,
  InMemoryMissionEventStore,
} from "../lifecycle/mission-lifecycle/in-memory";

// R1-D generic rerun orchestrator
export {
  MissionRerunOrchestrator,
  type MissionRerunOrchestratorOptions,
  type IMissionRerunPolicy,
  type IMissionRunner,
  type IMissionCheckpointCloner,
  type IMissionOwnershipAssigner,
  type IMissionRerunLogger,
  type RerunFullArgs,
  type RerunTodoArgs,
  type RerunResult,
  type RerunInputOverrides,
  RerunNotAllowedError,
  SourceMissionNotFoundError,
} from "../lifecycle/mission-lifecycle/rerun";
