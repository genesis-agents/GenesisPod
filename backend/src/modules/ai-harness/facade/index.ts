/**
 * AI Harness Facade â€”â€” ai-app å”¯ä¸€å…¥å£
 *
 * å½“å‰é¡¶å±‚èšåˆï¼šagents / evaluation / facade / guardrails / handoffs /
 * lifecycle / memory / protocols / runner / teams / tracing
 *
 * â˜… å•å‘ä¾èµ–ï¼šai-app â†’ ai-harness â†’ ai-engineã€‚
 * â˜… ai-app ä»»ä½• harness ç¬¦å·å¿…é¡»ä»Žè¿™é‡Œ importï¼Œç¦æ­¢ç©¿é€ harness å†…éƒ¨è·¯å¾„ã€‚
 */

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Kernelï¼šabstractions + core + dx
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export * from "../agents/abstractions";
export {
  BUILTIN_AGENTS,
  AGENT_CONFIGS,
  type BuiltinAgentId,
} from "../agents/domain";
export { AgentFactory } from "../agents/core/agent-factory";
export { SpecAgentRegistry } from "../agents/core/spec-agent-registry";
export {
  BuiltinSkillCatalog,
  BuiltInReActSkillRegistry,
} from "../agents/builtin-skills/skill-registry";
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
// AIFacade + Domain Facades (moved from ai-engine/facade â€” PR-X13)
// ai-app æ¨¡å—é€šè¿‡ "@/modules/ai-harness/facade" ç»Ÿä¸€å¯¼å…¥
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

// â˜… LLM è¾“å‡ºåŽå¤„ç†ï¼ˆç™½åå•æ¸…ç† + ä¿®å¤å‡½æ•°ï¼‰
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
// â˜… 2026-05-01 (PR-G iter8 + iter9): é›†ä¸­æ‰€æœ‰ review pass/attempt é˜ˆå€¼ + agent budget cap
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
// â˜… æ²‰æ·€ï¼ˆ2026-04-29ï¼‰: figure ç›¸å…³æ€§åˆ¤æ–­ï¼ˆæ¥è‡ª topic-insights, TI æš‚ä¸åˆ‡æ¢ï¼‰
export { FigureRelevanceService } from "../evaluation/figure";
// â˜… æ²‰æ·€ï¼ˆ2026-04-29ï¼‰: Reflexion critique-refine + section-self-eval + defect-scanner
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
  // â˜… æ²‰æ·€ Phase 3 (2026-04-29): å­—æ•°ä¸­ä½æ•°å½’ä¸€åŒ–
  balanceTargetWords,
  type BalancerOptions,
  type BalancerResult,
} from "../evaluation/critique";

// â˜… æ²‰æ·€ Phase 3 (2026-04-29): é€šç”¨å¹¶å‘ä¿¡å·é‡
export { ConcurrencyLimiter } from "../runner/concurrency";

// â˜… Phase 9 (2026-04-30): Mission è¿è¡Œæ—¶çŠ¶æ€å¤–ç½® + Orphan æ£€æµ‹ï¼ˆharness æ— çŠ¶æ€åŒ–ï¼‰
export {
  MissionRuntimeStateStore,
  type MissionHeartbeat,
  HEARTBEAT_INTERVAL_MS,
} from "../lifecycle/mission-lifecycle/runtime-state-store";
export {
  MissionOrphanDetectorService,
  type OrphanDetectorCallbacks,
} from "../lifecycle/mission-lifecycle/orphan-detector.service";

// â˜… 2026-04-30: AdaptiveReplannerService ä»Ž ai-engine/planning æ¬æ¥ï¼ˆè·¨å±‚è¿ç§»ï¼‰
export {
  AdaptiveReplannerService,
  type ReplanTrigger,
  type ReplanTriggerType,
  type ReplanResult,
  type StepExecutionResult,
  type ReplanStep,
  type ReplanContext,
} from "../teams/orchestrator/adaptive-replanner.service";

// â˜… 2026-04-30: AgentExecutorService ä»Ž ai-engine/planning æ¬æ¥ï¼ˆè·¨å±‚è¿ç§»ï¼‰
export { AgentExecutorService } from "../runner/executor/agent-executor.service";

// â˜… 2026-05-01 (PR-X-L): runner/executor/interfaces.ts ç±»åž‹ä»Ž ai-engine/facade
//   ä¸‹æ²‰è¿‡æ¥ â€” å®ƒä»¬æ˜¯ L2.5 ai-harness/runner å±‚ ownedï¼ŒåŽŸ engine facade åå‘
//   re-export è¿åå•å‘è§„åˆ™
//   æ³¨ï¼šEstablishedFact å·²ç”±ä¸‹æ–¹ mission-context.interface re-exportï¼Œæ•…æ­¤å¤„ä¸å†é‡å¤
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
// â˜… 2026-05-01 (PR-X-M): UserIntent / ContextStrategy æ˜¯ L2 LLM èƒ½åŠ›æ¦‚å¿µï¼Œ
// owner æ˜¯ ai-engine/llm/intentï¼›harness facade ä»… re-export è®© ai-app é€æ˜Ž
export {
  UserIntent,
  ContextStrategy,
} from "../../ai-engine/planning/intent/intent.types";

// â˜… 2026-05-01 (PR-X-L): runner/capabilities ç±»åž‹åŒä¸Šä¸‹æ²‰
export type { AICapabilityContext } from "../runner/capabilities/ai-capability-resolver.service";
export type {
  SkillPromptBundle,
  SkillPromptOptions,
} from "../runner/capabilities/types";

// â˜… 2026-05-01 (PR-X-L): ExecutionCheckpointService ä¹Ÿæ˜¯ L2.5 ai-harness æ¦‚å¿µ
export {
  ExecutionCheckpointService,
  type ExecutionCheckpoint,
} from "../runner/executor/execution-checkpoint.service";

// â˜… 2026-05-01 (PR-X-M2): ä¸€ç»„ L2.5 runtime ç±»åž‹ä»Ž ai-engine/facade åå‘ re-export ä¸‹æ²‰è¿‡æ¥
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

// â˜… 2026-04-30: OutputReviewerService ä»Ž ai-engine/planning æ¬æ¥ï¼ˆè·¨å±‚è¿ç§»ï¼‰
// â˜… 2026-05-02 (#1 MECE): runtime/quality â†’ evaluation/critique æ”¶æ•›
export { OutputReviewerService } from "../evaluation/critique/output-reviewer.service";

// â˜… 2026-05-01: ReportArtifactAssembler ä»Ž ai-app/agent-playground ä¸Šæï¼ˆè·¨ app å¤ç”¨ï¼‰
//   playground v2 ReportArtifact (sections/citations/figures/quickView) è£…é…çº¯å‡½æ•°
export {
  ReportArtifactAssembler,
  lengthTargetFor,
} from "../evaluation/critique/report-artifact/report-artifact-assembler.service";

// â˜… 2026-05-01: FailureLearnerService ä»Ž ai-app/agent-playground ä¸Šæ
// â˜… 2026-05-02 (W1 MECE): governance/learning â†’ lifecycle/learningï¼ˆå¤±è´¥å­¦ä¹ æ˜¯ç”Ÿå‘½å‘¨æœŸé—­çŽ¯ï¼‰
//   è·¨ mission å¤±è´¥æ¨¡å¼è®°å¿†ï¼ˆharness_failure_patterns è¡¨ï¼‰ï¼Œä¾› BillingRuntimeEnvAdapter ç­‰æ¶ˆè´¹
export { FailureLearnerService } from "../lifecycle/learning/failure-learner.service";

// ★ 2026-05-04 (PR-2 standardize): PostmortemClassifierService 从
//   ai-app/agent-playground/services/postmortem 上提到 lifecycle/learning（与
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

// â˜… 2026-05-01: SocketBroadcastAdapter ä»Ž ai-app/agent-playground/adapters/ ä¸Šæ
//   å‚æ•°åŒ– prefix åŽè·¨ ai-app é€šç”¨ï¼ˆDomainEvent â†’ Socket.IO roomï¼‰ï¼Œä»»ä½•å¸¦ socket relay
//   çš„ ai-app éƒ½å¯å¤ç”¨
export {
  SocketBroadcastAdapter,
  type SocketBroadcastAdapterOptions,
} from "../protocols/realtime/socket-broadcast.adapter";

// â˜… 2026-05-01: MissionAbortRegistry / MissionOwnershipRegistry ä»Ž ai-app/agent-playground ä¸Šæ
//   ä¸¤ä¸ªçº¯é€šç”¨ in-memory registry primitiveï¼ˆabort signal ç®¡ç† / missionâ†’user ownership LRUï¼‰ï¼Œ
//   è·¨ ai-app å¤ç”¨ï¼ˆresearch / writing / teams ä»»ä½•é•¿ä»»åŠ¡ç¼–æŽ’éƒ½éœ€è¦ï¼‰
export { MissionAbortRegistry } from "../lifecycle/mission-lifecycle/abort-registry";
export { MissionOwnershipRegistry } from "../lifecycle/mission-lifecycle/ownership-registry";
// ★ 2026-05-04 (PR-3 standardize playground)
export { RerunLockRegistry } from "../lifecycle/mission-lifecycle/rerun-lock.registry";

// ★ 2026-05-04 (PR-6 standardize playground): jaccardSimilarity engine 转发
export { jaccardSimilarity } from "../../ai-engine/facade";

// ★ 2026-05-04 (PR-10b standardize playground): JSON-fence parser engine 转发
export {
  parseJsonFence,
  extractJsonFenceContent,
  type JsonFenceParseResult,
} from "../../ai-engine/facade";

// ★ 2026-05-04 (PR-5 standardize playground): handoff token estimate + compress
export { HandoffCompactorService } from "../memory/working/handoff-compactor.service";

// â˜… 2026-05-01: stage-emit util ä»Ž ai-app/agent-playground ä¸Šæ
//   é€šç”¨ stage:completed äº‹ä»¶å°è£…ï¼Œå« durationMs / tokensUsed / agentInvocations ç­‰åº¦é‡
export {
  startStageTimer,
  type StageTimer,
  type StageTimerEmitOptions,
  type EmitFn,
} from "../protocols/ipc/stage-emit.utils";

// â˜… 2026-05-01 (PR-X-N): è®© ai-app èµ° facadeï¼Œä¸éœ€ç©¿é€ harness å†…éƒ¨è·¯å¾„
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
// FunctionCallingExecutor.AgentEvent â€” ç»™ teams æœåŠ¡ç”¨ä½œ event ç±»åž‹
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

// â˜… C2-step1 (2026-04-30): AutoDreamï¼ˆåŽå° memory æ•´åˆï¼‰ä»Ž ai-engine æ¬å…¥ harness
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

// â˜… æ²‰æ·€ Phase 4 (2026-04-29): Checkpoint / Health / DAG ä¸‰ä»¶å¥—
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
// PR-X15: é€šè¿‡ engine/facade barrel è½¬å‘ï¼Œä¸ç©¿é€ engine ç§æœ‰è·¯å¾„
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
// æ³¨ï¼šharness å†…éƒ¨æœ‰ä¸€ä¸ª generic TokenBudgetServiceï¼ˆmission-level token trackerï¼‰ï¼Œ
// ä¸Ž ai-engine/llm/budget/token-budget.service.ts åŒåä½†è¯­ä¹‰ä¸åŒ
// ï¼ˆåŽè€…å¸¦ smartTruncate ç”¨äºŽä¸Šä¸‹æ–‡çª—å£åˆ†é…ï¼‰ã€‚ä¸ºé¿å… DI / import æ­§ä¹‰ï¼Œ
// ä¸åœ¨ facade å¯¼å‡º harness ç‰ˆæœ¬ï¼›ai-app éœ€è¦ token é¢„ç®—è¯·ç”¨ ai-engine/facade çš„ TokenBudgetServiceã€‚
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
// PR-X15: é€šè¿‡ engine/facade barrelï¼Œä¸ç©¿é€ engine ç§æœ‰è·¯å¾„
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
export { AgentEventStore, CheckpointService } from "../memory/checkpoint";
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
// Kernel (Legacy) â€” PR-X5
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// Legacy registry (IPlanBasedAgent planâ†’execute model)
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
// @deprecated â€” use HarnessedAgent / SpecBasedAgent for new agents
export { BaseAgent, createAgent } from "../agents/base/base-agent";
export { ReactiveAgent } from "../agents/base/reactive-agent";
export { PlanAgent } from "../agents/base/plan-agent";
export {
  PlanBasedAgent,
  type IPlanBasedAgent,
} from "../agents/base/plan-based-agent";

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Process (Collaboration) â€” PR-X5
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
// Engine type forwards (PR-X14: harness æ˜¯ ai-app çš„ç»Ÿä¸€å…¥å£ï¼Œ
// è½¬å‘å¸¸ç”¨ engine ç±»åž‹é¿å… ai-app åŒæ—¶ import ä¸¤ä¸ª facade)
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

// 2026-05-01 (PR-X-R): Harness Kernel SKILL.md-style ç«¯å£ï¼Œä¾› ai-engine é€‚é…å™¨
// å®žçŽ° ISkillProvider æŠŠ DB-backed PromptSkill é€ç»™ SkillActivatorã€‚
// ä¸Žä¸Šé¢çš„ ISkill (engine CRUD-style) åŒºåˆ†ï¼škernel è¿™ä¸ªæ˜¯ frontmatter+instructionsã€‚
export type {
  ISkill as IKernelSkill,
  ISkillFrontmatter,
  ISkillProvider,
  ISkillLoader,
  ISkillActivationContext,
} from "../agents/abstractions/skill.interface";
export { SKILL_PROVIDERS } from "../agents/abstractions/skill.interface";

// Engine LLM service classes (PR-X14: harness facade è½¬å‘å¸¸ç”¨ engine æœåŠ¡)
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
