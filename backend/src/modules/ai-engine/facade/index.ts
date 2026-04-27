/**
 * AI Engine Facade
 * 统一入口模块
 *
 * ★ 所有 AI App 模块必须从此文件导入，禁止直接访问 ai-engine 内部路径
 */

export { AIEngineFacade } from "./ai-engine.facade";
export * from "./types";
export { PromptSkillBridge } from "../skills/runtime";
// ★ Re-export Engine types so AI App modules can import from facade instead of engine internals
// RoomConfig / EngineEvent — 迁移至 ai-harness/facade
export type { SaveEvidenceRequest } from "../knowledge/evidence/abstractions/evidence.interface";
export type { AICapabilityContext } from "../orchestration/capabilities/ai-capability-resolver.service";
export type {
  SkillPromptBundle,
  SkillPromptOptions,
} from "../orchestration/capabilities/types";
export type { SkillMdDefinition } from "../skills/types/skill-md.types";
export type { EmbeddingResult } from "../knowledge/rag/embedding";
export type {
  SimilaritySearchOptions,
  SimilarityResult,
} from "../knowledge/rag/vector/vector.service";
// TaskCompletionType — 迁移至 ai-harness/facade
export { UserIntent } from "../orchestration/services/interfaces";
export type { TeamInfo } from "../../ai-harness/runtime/teams/services/teams.service";

// ★ Registry classes — AI App 模块可直接注入，但 import 路径必须来自此文件
export { ToolRegistry } from "../tools/registry/tool-registry";
export { AgentRegistry } from "../agents/registry";
export { TeamRegistry } from "../../ai-harness/runtime/teams/registry/team-registry";
export { RoleRegistry } from "../../ai-harness/runtime/teams/registry/role-registry";
export { SkillRegistry } from "../skills/registry/skill-registry";
// ── Harness symbols 已不再从 ai-engine/facade 导出 ──
// PR-H6b 后所有 ai-app 直接 import from "@/modules/ai-harness/facade"。
// ai-engine/facade 严格只暴露 ai-engine 自身能力（LLM / tools / RAG / knowledge / mcp / safety）。

// ★ High-frequency types used across AI App modules
export type {
  TaskProfile,
  CreativityLevel,
  OutputLengthLevel,
  ReasoningDepth,
  ContentPart,
  TextContentPart,
  ImageUrlContentPart,
} from "../llm/types";

// Model classification by id pattern (STRONG/STANDARD/BASIC) — cross-app utility
export { classifyModelTier, ModelTier } from "../llm/types/model-tier";

// ★ Stream timing types (for TTFT/TTLT tracking)
export type {
  StreamTiming,
  StreamChunk,
} from "../llm/services/ai-stream-handler.service";
export type { TeamConfig, ITeam } from "../../ai-harness/runtime/teams/abstractions/team.interface";
export { BUILTIN_TEAMS } from "../../ai-harness/runtime/teams/abstractions/team.interface";
export type { WorkflowConfig } from "../../ai-harness/runtime/teams/abstractions/workflow.interface";
export type { ConstraintProfile } from "../../ai-harness/runtime/teams/constraints/constraint-profile";
export { BUILTIN_ROLES } from "../../ai-harness/runtime/teams/abstractions/role.interface";
export { BUILTIN_TOOLS } from "../core/types/agent.types";
export type {
  BuiltinToolId,
  PlanStep,
  AgentInput,
  AgentPlan,
  AgentEvent as PlanAgentEvent,
  AgentTemplate,
  ToolId,
  AgentConfig,
} from "../core/types/agent.types";
export { BUILTIN_AGENTS } from "../core/types/agent.types";
export type { ExecutionMode } from "../core/types/context.types";
export type { TaskPlan } from "../orchestration/services/task-planner.service";
export { createConstraintProfile } from "../../ai-harness/runtime/teams/constraints/constraint-profile";
export type {
  MissionEvent,
  MissionInput,
  MissionResult,
} from "../../ai-harness/runtime/teams/abstractions/mission.interface";
export type {
  ToolContext,
  ITool,
  JSONSchema,
} from "../tools/abstractions/tool.interface";

// ★ Batch 1 补充导出 — 所有 AI App 模块所需的额外符号

// Orchestration services（for teams re-export shims）
export { ContextCompressionService } from "../orchestration/services/context-compression.service";
export type {
  DataChunk,
  SummaryChunk,
  CompressionResult,
  CompressionOptions,
} from "../orchestration/services/interfaces";
export { ContextStrategy } from "../orchestration/services/interfaces";
// ConstraintEnforcementService — 迁移至 ai-harness/facade
export type {
  ConstraintSeverity,
  ExtractedConstraint,
  ConstraintViolation,
  OutputValidationResult,
  AiCallerFn,
  ReviewRequest,
  ReviewResult,
  ReviewCriteria,
} from "../orchestration/services/interfaces";
export { TokenBudgetService } from "../orchestration/services";
export type {
  ModelConfig as TokenBudgetModelConfig,
  TokenBudget,
  ContentPriority,
  BudgetAllocation,
} from "../orchestration/services/token-budget.service";
export { OutputReviewerService } from "../orchestration/services/output-reviewer.service";
export { ContextEvolutionService } from "../orchestration/services/context-evolution.service";
// ★ Batch 2 Topic Insights — ContextEvolution types
export type {
  FactExtractionRequest,
  FactExtractionResult,
  ContextEvolutionConfig,
} from "../orchestration/services/interfaces";
export { AgentExecutorService } from "../orchestration/services/agent-executor.service";
// CircuitBreakerService — 迁移至 ai-harness/facade
export { ContextInitializationService } from "../orchestration/services/context-initialization.service";
export { TaskDecomposerService } from "../orchestration/services/task-decomposer.service";
export { ModelFallbackService } from "../llm/model-fallback/model-fallback.service";
// ProcessSupervisorService / ExecutionStateManager / StateCategory /
// ExecutionStateStats — 迁移至 ai-harness/facade

// MCP abstraction types（for social/mcp-client.service.ts）
export type {
  MCPServerConfig,
  MCPToolResult,
  MCPServerInfo,
  MCPTool,
} from "../mcp/abstractions/mcp.interface";

// Content feature types（for ai-app/office/content-analysis/）
export {
  ContentComplexity,
  ContentCategory,
  DataDensity,
  TemporalDimension,
  HierarchyType,
} from "../content/types/content-features.types";
export type {
  ContentFeatures,
  ExtractedEntity,
  VisualizationOpportunity,
  ParagraphFeatures,
  SectionFeatures,
} from "../content/types/content-features.types";

// Content-fetch tokens & utilities（for ai-social.module.ts + content-fetcher.service.ts）
// Direct imports to avoid loading ContentFetchModule barrel (prevents circular dep chain)
export { YOUTUBE_SERVICE_TOKEN } from "../content/fetch/content-fetch.service";
export {
  sanitizeForDb,
  sanitizeJson,
} from "../content/fetch/content-fetch.types";

// LLM Adapter（for ask/adapters/index.ts）
export { FunctionCallingLLMAdapter } from "../llm/adapters/function-calling-llm-adapter";

// Image generation interface & tokens（for image module）
export {
  IMAGE_GENERATION_SERVICE,
  TTS_SERVICE,
} from "../tools/abstractions/generation-services.interface";
export type { IImageGenerationService } from "../tools/abstractions/generation-services.interface";
export { IMAGE_GENERATION_SERVICE_TOKEN } from "../core/interfaces/image.interface";
export type { IResearchService } from "../core/interfaces/research.interface";
export { RESEARCH_SERVICE_TOKEN } from "../core/interfaces/research.interface";
export type { ISimulationService } from "../core/interfaces/simulation.interface";
export { SIMULATION_SERVICE_TOKEN } from "../core/interfaces/simulation.interface";
export type { IRAGPipelineService } from "../core/interfaces/rag.interface";
export { RAG_PIPELINE_SERVICE_TOKEN } from "../core/interfaces/rag.interface";

// LLM model fallback types（for teams/leader-model.service.ts）
export type { ModelFallbackOptions } from "../llm/model-fallback/model-fallback.service";
export type { AIModelConfig } from "../llm/services/ai-model-config.service";

// Orchestration interfaces（for teams/task-breakdown.service.ts）
export type { TeamMemberInfo } from "../orchestration/services/interfaces";

// Mission context types（for teams and writing modules）
export type {
  MissionContextPackage,
  HardConstraint,
  CoreEntity,
  Prohibition,
  QualityStandard,
  EstablishedFact,
  TaskUnderstanding,
} from "../../ai-harness/runtime/teams/abstractions/mission-context.interface";
export {
  createEmptyContextPackage,
  validateContextPackage,
  mergeContextPackages,
} from "../../ai-harness/runtime/teams/abstractions/mission-context.interface";

// Error detection utilities（for teams/retry.utils.ts）
export type { ErrorDetectionRetryConfig } from "../orchestration/utils/error-detection.utils";
export {
  DEFAULT_RETRY_CONFIG,
  isRetryableError,
  isRateLimitError,
  isPermanentError,
  withRetry,
  calculateBackoffDelay,
  sleep,
  isApiErrorContent,
  parseErrorType,
} from "../orchestration/utils/error-detection.utils";

// Agent interface types
// AgentOutput/AgentEvent are aliased to avoid collision with facade.types.ts AgentOutput
// and function-calling-executor.ts AgentEvent
export type {
  IAgent,
  AgentContext,
  AgentResult,
  AgentCapability,
  ExecutionPlan,
  AgentMessage,
  AgentMemory,
  AgentArtifact,
  ToolCallRecord,
  SkillCallRecord,
  AgentResultError,
  AgentResultMetadata,
  AgentDefinition,
  ReActPlanStep,
  AgentEventType,
  AgentOutput as AgentIfaceOutput,
  AgentEvent as AgentIfaceEvent,
} from "../agents/abstractions/agent.interface";

// Skills interfaces（for office slides module）
export type { ISkillOutputManager } from "../skills/output-manager/skill-output-manager.interface";
export { createSkillOutputManager } from "../skills/output-manager/skill-output-manager";
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
} from "../skills/abstractions/skill.interface";
export { SKILL_LAYERS } from "../skills/abstractions/skill.interface";

// Image matching types（for office/template-selection.types.ts）
export type {
  ImageMatchingRule,
  ImageRequirement,
} from "../content/image/matching/image-matching.types";
export {
  ImageType,
  ImagePlacement,
  IMAGE_MATCHING_RULES,
} from "../content/image/matching/image-matching.types";

// RAG types & services（for ai-app/rag module re-exports）
export { EmbeddingService } from "../knowledge/rag/embedding";
export type {
  EmbeddingModelConfig,
  EmbeddingBatch,
} from "../knowledge/rag/embedding";
export { VectorService } from "../knowledge/rag/vector";
export type { VectorSearchResult } from "../knowledge/rag/vector";
export { DocumentChunker } from "../knowledge/rag/chunking";
export type {
  ChunkingConfig,
  ChildChunkData,
  ParentChunkData,
  ChunkedDocument,
} from "../knowledge/rag/chunking";
export { DEFAULT_CHUNKING_CONFIG } from "../knowledge/rag/chunking";
export { RAGPipelineService } from "../knowledge/rag/pipeline";
export type {
  RAGQuery,
  RAGOptions,
  RAGResponse,
  RAGContext,
  SearchResult,
  HybridSearchParams,
  ProcessedDocument,
  DocumentMetadata,
  KnowledgeBaseStats,
  SyncResult,
  GoogleDriveFile,
} from "../knowledge/rag/pipeline/rag-pipeline.interfaces";

// Policy research tools（for topic-insights module DI）
export {
  FederalRegisterTool,
  CongressGovTool,
  WhiteHouseNewsTool,
  PolicyDataService,
} from "../tools/categories/information/policy";

// ★ Phase 3: long-form moved to ai-app/writing/content-engine/
// All re-exports removed (barrel triggers circular dep at runtime).
// Consumers should import directly from ai-app/writing/content-engine/.

// ★ Agent/Tool base classes live in facade/base-classes.ts (轻量子模块，零循环依赖)
// 用法: import { PlanBasedAgent } from "../../../ai-engine/facade/base-classes";
// 原因: 本文件(index.ts) 加载 70+ 模块会形成循环链，base-classes.ts 不拉入服务层
export type { IPlanBasedAgent } from "../agents/base/plan-based-agent";

// ★ BaseTool moved to facade/base-classes.ts（与 BaseAgent/PlanBasedAgent 同理）

// ★ Batch 2 — Core services（for admin, mcp-server, and cross-cutting concerns）
export { AiChatService } from "../llm/services/ai-chat.service";
export type {
  ChatObserver,
  ChatObserverEvent,
  ChatOptions,
  ChatResult,
} from "../llm/services/ai-chat.service";
export type { ChatMessage } from "../llm/types";
export { inferIsReasoning, getKnownModelLimit } from "../llm/types/model-utils";

// ★ Environment-aware Model Election — harness / AI App 通过 facade 调 elect()
export { ModelElectionService } from "../llm/election";
export {
  NoEligibleModelError,
  type ElectionCandidate,
  type ElectionRequest,
  type ElectionResult,
  type ElectionRoleHint,
  type ElectionScore,
  type ElectionCostBias,
} from "../llm/election";
export { SearchService } from "../knowledge/search/search.service";
export { MCPManager } from "../mcp/manager/mcp-manager";
export { SkillLoaderService } from "../skills/loader/skill-loader.service";
export { SkillContentService } from "../skills/content/skill-content.service";
export type {
  SkillVersionRecord,
  FullSkillDefinition,
} from "../skills/content/skill-content.service";
export { SkillSandboxService } from "../skills/sandbox/skill-sandbox.service";
export { AgentConfigService } from "../agents/config/agent-config.service";
export { MCPExternalAdminController } from "../mcp/admin/mcp-external-admin.controller";
export { MultiKeyRegistry } from "../core/utils/multi-key-manager";
export type { KeyHealthStatus } from "../core/utils/multi-key-manager";
export { AICapabilityResolver } from "../orchestration/capabilities/ai-capability-resolver.service";
export { IntentRouterService } from "../orchestration/services/intent-router.service";
export type {
  RouteResult,
  AgentContext as IntentAgentContext,
} from "../orchestration/services/intent-router.service";

// ★ Batch 2 — Safety（for mcp-server guardrails integration）
export { GuardrailsPipelineService } from "../safety/guardrails/guardrails-pipeline.service";
// ★ Batch 2 Topic Insights — Guardrails types
export type {
  GuardrailInput,
  GuardrailOutput,
  GuardrailsPipelineResult,
} from "../safety/guardrails/guardrails.interface";

// Observability + Realtime 相关符号全部迁移至 ai-harness/facade
// (TraceCollectorService / AiObservabilityService / CostAttributionService /
//  EvalPipelineService / EvalResult / TraceType /
//  EngineEventEmitterService / ProgressTrackerService)

// ★ Batch 2 — Content services（for office re-exports）
export { ImageMatchingService } from "../content/image/matching/image-matching.service";
export type {
  ImagePrompt,
  ImageMatchingResult,
} from "../content/image/matching";
// ★ Phase 3: analysis moved to ai-app/office/content-analysis/
// ContentAnalysisService removed from facade re-exports (circular dep prevention).
// Consumers should import from ai-app/office/content-analysis/ directly.

// ★ Feature Token constants & interfaces（for DI consumers and module wiring）
export {
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
  FACADE_FEATURE_PROVIDERS,
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
} from "./facade.providers";

// ★ Phase 7: Content engine abstractions (replaces L4 type imports — audit E-1/E-2)
export type {
  ILongContentEngine,
  IContinuationProtocol,
  IReportSynthesisEngine,
} from "../content/abstractions/content-engine.interfaces";

// Phase 8 / Kernel integration types — 迁移至 ai-harness/facade
// (IEngineEventEmitter / ProgressEvent / RoomType / IProgressTracker /
//  TrackedTask / CreateTrackedTaskRequest / TaskPhase /
//  calculateOverallProgress / SpanType + 8 个 trace 类型)

// A2A messaging
export type {
  A2AMessage,
  A2AMessageType,
  A2APriority,
  A2AMessageHandler,
} from "../../ai-harness/runtime/teams/abstractions/a2a-message.interface";

// Team member
export type {
  ITeamMember,
  TeamMemberId,
  MemberStatus,
} from "../../ai-harness/runtime/teams/abstractions/member.interface";

// Role (expand existing BUILTIN_ROLES re-export)
export type { IRole, WorkStyle } from "../../ai-harness/runtime/teams/abstractions/role.interface";

// Team (expand existing ITeam/TeamConfig re-export)
export type { TeamId } from "../../ai-harness/runtime/teams/abstractions/team.interface";

// Agent types (expand existing ToolId re-export)
export type { SkillId } from "../core/types/agent.types";

// Common types
export type { JsonObject, JsonValue } from "../core/types/common.types";

// Orchestrator abstractions
export type {
  Checkpoint,
  ExecutionContext,
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
  ExecutionResult,
  StepResult,
  StepStatus,
  WorkflowConfig as OrchestrationWorkflowConfig,
} from "../orchestration/abstractions/orchestrator.interface";

// Workflow Handlers
export type {
  WorkflowNodeHandler,
  MapStepConfig,
} from "../orchestration/handlers/workflow-node-handler.interface";
export { WorkflowHandlerRegistry } from "../orchestration/handlers/handler-registry";

// Executors
export { DAGExecutor } from "../orchestration/executors/dag-executor";

// Constraint engine
export type {
  IConstraintEngine,
  ConstraintEvaluation,
  CostEvaluation,
  QualityEvaluation,
  EfficiencyEvaluation,
  ConstraintWarning,
  ConstraintViolation as ConstraintEngineViolation,
  ConstraintSuggestion,
  ResourceRequirement,
  ResourceAllocation,
  ResourceUsage,
  CostEstimate,
  CostBreakdown,
  DegradationStrategy,
} from "../../ai-harness/runtime/teams/constraints/constraint-engine.interface";

// Orchestration interfaces (expand existing — add IConstraintEnforcementService)
export type { IConstraintEnforcementService } from "../orchestration/services/interfaces";

// Memory abstractions
export type {
  IMemoryStore,
  IConversationMemory,
  IWorkingMemory,
  MemoryEntry,
  MemoryType,
  MemorySearchOptions,
  MemorySearchResult,
  ConversationMessage,
} from "../knowledge/memory/abstractions/memory.interface";

// ★ Phase 5: Domain Facades — focused APIs that replace the monolithic AIEngineFacade
// Consumers should gradually migrate from AIEngineFacade to the domain facade they need.
export { ChatFacade } from "./domain/chat.facade";
export { RAGFacade } from "./domain/rag.facade";
export { AgentFacade } from "./domain/agent.facade";
export { TeamFacade } from "./domain/team.facade";
export { ToolFacade } from "./domain/tool.facade";

// ★ Image Search tool types（for topic-insights figure pipeline）
export type {
  ImageSearchInput,
  ImageSearchResult,
  ImageSearchOutput,
} from "../tools/categories/information/image-search/image-search.types";

// ★ Phase 8: Kernel re-exports REMOVED — all AI App consumers now import from "@/modules/ai-engine/facade" directly.

// Query Loop auto-continuation engine
export {
  QueryLoopService,
  type QueryLoopConfig,
  type QueryLoopResult,
  type QueryLoopStopReason,
} from "../orchestration/services";

// Token usage tracker
export {
  TokenTrackerService,
  type TokenUsageSnapshot,
  type TokenUsageEntry,
} from "../orchestration/services";

export {
  ContextCompactionPipelineService,
  type CompactionConfig,
  type CompactionResult,
  type CompactionLevel,
} from "../orchestration/services";

export {
  ExecutionCheckpointService,
  type ExecutionCheckpoint,
} from "../orchestration/services";

export {
  AdaptiveReplannerService,
  type ReplanTrigger,
  type ReplanResult,
  type MissionExecutionPlan,
} from "../orchestration/services";

// ★ Phase 3: Tool Concurrency
export { ToolConcurrencyService } from "../tools/concurrency/tool-concurrency.service";
export type {
  ConcurrencyMetadata,
  ExecutionPartition,
} from "../tools/concurrency/tool-concurrency.service";

// ★ Phase 7: Session Memory Sidecar
export {
  SessionMemorySidecarService,
  type SidecarCategory,
  type SidecarEntry,
  type SidecarConfig,
} from "../orchestration/services";

// ★ Phase 10: Coordinator Synthesize-Before-Delegate
export { CrossCuttingSynthesisService } from "../orchestration/services/cross-cutting-synthesis.service";
export type {
  DimensionResult,
  CrossCuttingTheme,
  Contradiction,
  ResearchGap,
  SynthesisResult,
} from "../orchestration/services/cross-cutting-synthesis.service";

// ★ Phase 5: Prompt Cache Coordination
export { PromptCacheCoordinatorService } from "../llm/services/prompt-cache-coordinator.service";
export type { CachePrefix } from "../llm/services/prompt-cache-coordinator.service";

// ★ Phase 9: Background Autonomous Agents
export {
  AutoDreamService,
  type DreamPhase,
  type AutoDreamConfig,
  type DreamStatus,
  type DreamResult,
} from "../orchestration/services";

export {
  AutoDreamSchedulerService,
  type SchedulerConfig,
  type ScheduledScope,
  type SchedulerStats,
} from "../orchestration/services";

// Session Latency Tracking — 迁移至 ai-harness/facade
// (SessionLatencyTrackerService + 14 个 latency 类型)

// ★ Runtime exports (formerly ai-engine/facade, PR 7)
export * from "./exports/runtime";
