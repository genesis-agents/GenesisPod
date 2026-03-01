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
export type {
  RoomConfig,
  EngineEvent,
} from "../infra/realtime/abstractions/event-emitter.interface";
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
export { TaskCompletionType } from "../orchestration/services/circuit-breaker.service";
export { UserIntent } from "../orchestration/services/interfaces";
export type { TeamInfo } from "../teams/services/teams.service";

// ★ Registry classes — AI App 模块可直接注入，但 import 路径必须来自此文件
export { ToolRegistry } from "../tools/registry/tool-registry";
export { AgentRegistry } from "../agents/registry";
export { TeamRegistry } from "../teams/registry/team-registry";
export { RoleRegistry } from "../teams/registry/role-registry";
export { SkillRegistry } from "../skills/registry/skill-registry";

// ★ High-frequency types used across AI App modules
export type {
  TaskProfile,
  CreativityLevel,
  OutputLengthLevel,
} from "../llm/types";
export type { TeamConfig, ITeam } from "../teams/abstractions/team.interface";
export { BUILTIN_TEAMS } from "../teams/abstractions/team.interface";
export type { WorkflowConfig } from "../teams/abstractions/workflow.interface";
export type { ConstraintProfile } from "../teams/constraints/constraint-profile";
export { BUILTIN_ROLES } from "../teams/abstractions/role.interface";
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
export { createConstraintProfile } from "../teams/constraints/constraint-profile";
export type {
  MissionEvent,
  MissionInput,
  MissionResult,
} from "../teams/abstractions/mission.interface";
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
export { ConstraintEnforcementService } from "../orchestration/services/constraint-enforcement.service";
export type {
  ConstraintSeverity,
  ExtractedConstraint,
  ConstraintViolation,
  OutputValidationResult,
  AiCallerFn,
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
export { AgentExecutorService } from "../orchestration/services/agent-executor.service";
export { CircuitBreakerService } from "../orchestration/services/circuit-breaker.service";
export { ContextInitializationService } from "../orchestration/services/context-initialization.service";
export { TaskDecomposerService } from "../orchestration/services/task-decomposer.service";
export { ModelFallbackService } from "../llm/model-fallback/model-fallback.service";
export { ExecutionStateManager } from "../orchestration/state-machine/execution-state.manager";

// State-machine types（for teams/mission-state.manager.ts）
export { StateCategory } from "../orchestration/state-machine";
export type { ExecutionStateStats } from "../orchestration/state-machine";

// MCP abstraction types（for social/mcp-client.service.ts）
export type {
  MCPServerConfig,
  MCPToolResult,
  MCPServerInfo,
  MCPTool,
} from "../mcp/abstractions/mcp.interface";

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
} from "../teams/abstractions/mission-context.interface";
export {
  createEmptyContextPackage,
  validateContextPackage,
  mergeContextPackages,
} from "../teams/abstractions/mission-context.interface";

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
export type { ChatMessage } from "../llm/types";
export { inferIsReasoning, getKnownModelLimit } from "../llm/types/model-utils";
export { SearchService } from "../knowledge/search/search.service";
export { MCPManager } from "../mcp/manager/mcp-manager";
export { SkillLoaderService } from "../skills/loader/skill-loader.service";
export { AgentConfigService } from "../agents/config/agent-config.service";
export { MCPExternalAdminController } from "../mcp/admin/mcp-external-admin.controller";
export { MultiKeyRegistry } from "../core/utils/multi-key-manager";
export type { KeyHealthStatus } from "../core/utils/multi-key-manager";
export { AICapabilityResolver } from "../orchestration/capabilities/ai-capability-resolver.service";

// ★ Batch 2 — Safety（for mcp-server guardrails integration）
export { GuardrailsPipelineService } from "../safety/guardrails/guardrails-pipeline.service";

// ★ Batch 2 — Observability（for admin monitoring and health checks）
export { TraceCollectorService } from "../infra/observability/trace-collector.service";
export { AiObservabilityService } from "../infra/observability/ai-observability.service";
export { CostAttributionService } from "../infra/observability/cost-attribution.service";
export { EvalPipelineService } from "../infra/observability/eval-pipeline.service";
export type { TraceType } from "../infra/observability/trace.interface";

// ★ Batch 2 — Realtime（for mcp-server streaming bridge）
export { EngineEventEmitterService } from "../infra/realtime/services/engine-event-emitter.service";
export { ProgressTrackerService } from "../infra/realtime/services/progress-tracker.service";

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

// ★ AI Kernel re-exports — forwarded from kernel's own facade (backward compatible)
export {
  KernelContext,
  type KernelContextData,
  ProcessManagerService,
  EventJournalService,
  CheckpointManager,
  KernelMemoryManagerService,
  WorkingMemoryStore,
  PersistentMemoryStore,
  EventBusService,
  MessageBusService,
  ResourceManagerService,
  ProcessEventLogService,
  KernelMetricsService,
  MissionExecutorService,
  type IMissionExecutor,
  type MissionExecuteOptions,
  type MissionExecuteResult,
  CapabilityGuardService,
  KernelSchedulerService,
  ProcessSupervisorService,
  KernelApiService,
  type ProcessId,
  type SpawnOptions,
  type ProcessSnapshot,
  type ProcessTree,
  type ProcessCapabilities,
  VALID_TRANSITIONS,
  TERMINAL_STATES,
} from "../../ai-kernel/facade";
