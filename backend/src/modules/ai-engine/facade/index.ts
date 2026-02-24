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
} from "../realtime/abstractions/event-emitter.interface";
export type { SaveEvidenceRequest } from "../evidence/abstractions/evidence.interface";
export type { AICapabilityContext } from "../capabilities/ai-capability-resolver.service";
export type {
  SkillPromptBundle,
  SkillPromptOptions,
} from "../capabilities/types";
export type { SkillMdDefinition } from "../skills/types/skill-md.types";
export type { EmbeddingResult } from "../rag/embedding";
export type {
  SimilaritySearchOptions,
  SimilarityResult,
} from "../rag/vector/vector.service";
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
export type { TaskProfile, CreativityLevel, OutputLengthLevel } from "../llm/types";
export type { TeamConfig, ITeam } from "../teams/abstractions/team.interface";
export { BUILTIN_TEAMS } from "../teams/abstractions/team.interface";
export type { WorkflowConfig } from "../teams/abstractions/workflow.interface";
export type { ConstraintProfile } from "../teams/constraints/constraint-profile";
export { BUILTIN_ROLES } from "../teams/abstractions/role.interface";
export { BUILTIN_TOOLS } from "../core/types/agent.types";
export { createConstraintProfile } from "../teams/constraints/constraint-profile";
export type { MissionEvent, MissionInput, MissionResult } from "../teams/abstractions/mission.interface";
export type { ToolContext, ITool } from "../tools/abstractions/tool.interface";

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
export { YOUTUBE_SERVICE_TOKEN } from "../content-fetch/content-fetch.service";
export { sanitizeForDb, sanitizeJson } from "../content-fetch/content-fetch.types";

// LLM Adapter（for ask/adapters/index.ts）
export { FunctionCallingLLMAdapter } from "../llm/adapters/function-calling-llm-adapter";

// Image generation interface & tokens（for image module）
export {
  IMAGE_GENERATION_SERVICE,
  TTS_SERVICE,
} from "../tools/abstractions/generation-services.interface";
export type { IImageGenerationService } from "../tools/abstractions/generation-services.interface";
export { IMAGE_GENERATION_SERVICE_TOKEN } from "../interfaces/image.interface";

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

// Agent interface types（non-conflicting — AgentEvent/AgentOutput NOT re-exported to avoid conflict）
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

// Image matching types（for office/template-selection.types.ts）
export type {
  ImageMatchingRule,
  ImageRequirement,
} from "../image/matching/image-matching.types";
export {
  ImageType,
  ImagePlacement,
  IMAGE_MATCHING_RULES,
} from "../image/matching/image-matching.types";

// RAG types & services（for ai-app/rag module re-exports）
export { EmbeddingService } from "../rag/embedding";
export type { EmbeddingModelConfig, EmbeddingBatch } from "../rag/embedding";
export { VectorService } from "../rag/vector";
export type { VectorSearchResult } from "../rag/vector";
export { DocumentChunker } from "../rag/chunking";
export type {
  ChunkingConfig,
  ChildChunkData,
  ParentChunkData,
  ChunkedDocument,
} from "../rag/chunking";
export { DEFAULT_CHUNKING_CONFIG } from "../rag/chunking";
export { RAGPipelineService } from "../rag/pipeline";
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
} from "../rag/pipeline/rag-pipeline.interfaces";

// Policy research tools（for topic-insights module DI）
export {
  FederalRegisterTool,
  CongressGovTool,
  WhiteHouseNewsTool,
  PolicyDataService,
} from "../tools/categories/information/policy";

// Long-content types（for writing and teams modules）
export type {
  LongContentProjectConfig,
  TaskExecutionContext,
  GranularityLevel,
  TaskCompletionResult,
  TaskEstimate,
  TaskDecomposition,
  DecompositionValidation,
  ContinuationState,
  ExpectedOutput,
  QualityDashboard,
} from "../long-content";
