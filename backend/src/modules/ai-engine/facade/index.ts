/**
 * AI Engine Facade — engine-only capability exports
 *
 * Only ai-engine internal symbols are exported here.
 * Harness symbols (AIFacade / ChatFacade / RAGFacade / AgentFacade /
 * TeamFacade / ToolFacade / ModelResolverService / FACADE_FEATURE_PROVIDERS /
 * AgentRegistry / TeamRegistry / RoleRegistry / mission types / team types /
 * constraint types / PlanBasedAgent / BaseAgent / MCPManager / etc.)
 * must be imported from "@/modules/ai-harness/facade".
 */

export { PromptSkillBridge } from "../skills/runtime";

/**
 * Minimal interface matching MCPManager for ai-engine internal use.
 * ai-engine executor/capability files inject MCPManager at runtime via harness DI;
 * this interface avoids a direct ai-engine → ai-harness type import.
 */
/**
 * Minimal interface for legacy AgentRegistry used by ai-engine executor internals.
 * ai-engine executors inject AgentRegistry at runtime via harness DI;
 * this interface avoids a direct ai-engine → ai-harness type import.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface IAgentRegistryCompat {
  tryGet(agentId: string): any;
  getAll(): any[];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface IMCPProvider {
  getClient(serverId: string):
    | {
        connected?: boolean;
        listTools(): Promise<
          Array<{ name: string; description?: string; inputSchema?: unknown }>
        >;
        getServerInfo?(): { name: string; version: string } | undefined;
      }
    | undefined;
  getAllClients(): Array<unknown>;
  getConnectedServers?(): Array<{
    serverId: string;
    serverName: string;
    tools: unknown[];
  }>;
  callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{
    content: Array<{ text?: string; data?: string }>;
    isError?: boolean;
  }>;
}

/**
 * Minimal interface matching ChatFacade.chat() for ai-engine internal use.
 * ai-engine cannot import ChatFacade directly (would violate unidirectional dependency).
 * Internal services that need LLM access should use AiChatService; for services that
 * are injected ChatFacade at runtime via forwardRef DI, use this type for the constructor param.
 */
export interface IChatProvider {
  chat(request: {
    messages: Array<{ role: string; content: string }>;
    modelType?: import("@prisma/client").AIModelType;
    taskProfile?: import("../llm/types").TaskProfile;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    skipGuardrails?: boolean;
    [key: string]: unknown;
  }): Promise<{
    content: string;
    model: string;
    tokensUsed: number;
    inputTokens?: number;
    outputTokens?: number;
    finishReason?: string;
    [key: string]: unknown;
  }>;
}

// ★ Engine internal types used across AI App modules
export type { SaveEvidenceRequest } from "../knowledge/evidence/abstractions/evidence.interface";
export type { AICapabilityContext } from "../planning/capabilities/ai-capability-resolver.service";
export type {
  SkillPromptBundle,
  SkillPromptOptions,
} from "../planning/capabilities/types";
export type { SkillMdDefinition } from "../skills/types/skill-md.types";
export type { EmbeddingResult } from "../knowledge/rag/embedding";
export type {
  SimilaritySearchOptions,
  SimilarityResult,
} from "../knowledge/rag/vector/vector.service";
export { UserIntent } from "../planning/services/interfaces";

// ★ Registry classes — engine-owned registries only
export { ToolRegistry } from "../tools/registry/tool-registry";
export { SkillRegistry } from "../skills/registry/skill-registry";

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

export { BUILTIN_TOOLS } from "../core/types/agent.types";
export type {
  BuiltinToolId,
  PlanStep,
  AgentInput,
  AgentPlan,
  AgentEvent as PlanAgentEvent,
  AgentEvent,
  AgentTemplate,
  ToolId,
  AgentConfig,
} from "../core/types/agent.types";
export { BUILTIN_AGENTS } from "../core/types/agent.types";
export type { ExecutionMode } from "../core/types/context.types";
export type { TaskPlan } from "../planning/services/task-planner.service";
export type {
  ToolContext,
  ITool,
  JSONSchema,
} from "../tools/abstractions/tool.interface";

// ★ Batch 1 supplemental exports

// Orchestration services
export { ContextCompressionService } from "../planning/services/context-compression.service";
export type {
  DataChunk,
  SummaryChunk,
  CompressionResult,
  CompressionOptions,
} from "../planning/services/interfaces";
export { ContextStrategy } from "../planning/services/interfaces";
export type {
  ConstraintSeverity,
  ExtractedConstraint,
  ConstraintViolation,
  OutputValidationResult,
  AiCallerFn,
  ReviewRequest,
  ReviewResult,
  ReviewCriteria,
} from "../planning/services/interfaces";
export { TokenBudgetService } from "../planning/services";
export type {
  ModelConfig as TokenBudgetModelConfig,
  TokenBudget,
  ContentPriority,
  BudgetAllocation,
} from "../planning/services/token-budget.service";
export type {
  EstablishedFact,
  ExecutionConfig,
} from "../planning/services/interfaces";
export { OutputReviewerService } from "../planning/services/output-reviewer.service";
export { ContextEvolutionService } from "../planning/services/context-evolution.service";
export type {
  FactExtractionRequest,
  FactExtractionResult,
  ContextEvolutionConfig,
} from "../planning/services/interfaces";
export { AgentExecutorService } from "../planning/services/agent-executor.service";
export { ContextInitializationService } from "../planning/services/context-initialization.service";
export { TaskDecomposerService } from "../planning/services/task-decomposer.service";
export { ModelFallbackService } from "../llm/model-fallback/model-fallback.service";

// Content feature types
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

// Content-fetch tokens & utilities
export { YOUTUBE_SERVICE_TOKEN } from "../content/fetch/content-fetch.service";
export {
  sanitizeForDb,
  sanitizeJson,
} from "../content/fetch/content-fetch.types";

// LLM Adapter
export { FunctionCallingLLMAdapter } from "../llm/adapters/function-calling-llm-adapter";

// Image generation interface & tokens
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

// LLM model fallback types
export type { ModelFallbackOptions } from "../llm/model-fallback/model-fallback.service";
export type { AIModelConfig } from "../llm/services/ai-model-config.service";

// Orchestration interfaces
export type { TeamMemberInfo } from "../planning/services/interfaces";

// Error detection utilities
export type { ErrorDetectionRetryConfig } from "../planning/utils/error-detection.utils";
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
} from "../planning/utils/error-detection.utils";

// Skills interfaces
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

// Image matching types
export type {
  ImageMatchingRule,
  ImageRequirement,
} from "../content/image/matching/image-matching.types";
export {
  ImageType,
  ImagePlacement,
  IMAGE_MATCHING_RULES,
} from "../content/image/matching/image-matching.types";

// RAG types & services
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
  ContextSource,
  SearchResult,
  HybridSearchParams,
  ProcessedDocument,
  DocumentMetadata,
  KnowledgeBaseStats,
  SyncResult,
  GoogleDriveFile,
} from "../knowledge/rag/pipeline/rag-pipeline.interfaces";

// Policy research tools
export {
  FederalRegisterTool,
  CongressGovTool,
  WhiteHouseNewsTool,
  PolicyDataService,
} from "../tools/categories/information/policy";

// ★ Batch 2 — Core services
export { AiChatService } from "../llm/services/ai-chat.service";
export type {
  ChatObserver,
  ChatObserverEvent,
  ChatOptions,
  ChatResult,
} from "../llm/services/ai-chat.service";
export type { ChatMessage } from "../llm/types";
export { inferIsReasoning, getKnownModelLimit } from "../llm/types/model-utils";

// ★ Model Election
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
export { SkillLoaderService } from "../skills/loader/skill-loader.service";
export { SkillContentService } from "../skills/content/skill-content.service";
export type {
  SkillVersionRecord,
  FullSkillDefinition,
} from "../skills/content/skill-content.service";
export { SkillSandboxService } from "../skills/sandbox/skill-sandbox.service";
export { MultiKeyRegistry } from "../core/utils/multi-key-manager";
export type { KeyHealthStatus } from "../core/utils/multi-key-manager";
export { AICapabilityResolver } from "../planning/capabilities/ai-capability-resolver.service";
export { IntentRouterService } from "../planning/services/intent-router.service";
export type {
  RouteResult,
  AgentContext as IntentAgentContext,
} from "../planning/services/intent-router.service";

// ★ Batch 2 — Safety
export { GuardrailsPipelineService } from "../safety/guardrails/guardrails-pipeline.service";
export type {
  GuardrailInput,
  GuardrailOutput,
  GuardrailsPipelineResult,
} from "../safety/guardrails/guardrails.interface";

// ★ Content services
export { ImageMatchingService } from "../content/image/matching/image-matching.service";
export type {
  ImagePrompt,
  ImageMatchingResult,
} from "../content/image/matching";

// ★ 沉淀（2026-04-29）: figure 抽取（来自 topic-insights, TI 暂不切换）
export {
  FigureExtractorService,
  type ExtractedFigure,
} from "../content/figure";

// ★ 沉淀（2026-04-29）: LLM 注入防御三件套（OWASP LLM01）
export {
  createSecurityLogger,
  SecurityAuditLogger,
  SecurityEventType,
  SecuritySeverity,
  type SecurityLogEntry,
  sanitize,
  sanitizePromptInput,
  sanitizeExternalContent,
  containsDangerousContent,
  escapeForPrompt,
  type SanitizeOptions,
  type SanitizeResult,
  wrapExternalContent,
  wrapExternalContentBatch,
  type WrapExternalContentOptions,
} from "../safety/security/llm-injection";

// ★ 沉淀（2026-04-29）: LLM Reranker（来自 topic-insights, 用 AiChatService 内层调用）
export {
  LlmRerankerAdapter,
  type RerankableItem,
  type RerankCandidate,
  type RerankedItem,
  type RerankResult,
  type RerankRequest,
  type RerankAdapter,
  type RerankConfig,
  DEFAULT_RERANK_CONFIG,
} from "../knowledge/rerank";

// ★ 沉淀（2026-04-29）: LLM 输出后处理（白名单清理 + 13 个正交修复函数）
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
  // ★ 沉淀（2026-04-29）: 图表 JSON 块清理（LLM 泄漏 metadata 修复）
  stripChartJsonFromContent,
  extractMarkdownFromJsonString,
} from "../llm/output-utils";

// ★ 沉淀（2026-04-29）: figure URL 有效性校验
export { isValidFigureUrl } from "../safety/security/url-sanitizer.utils";

// ★ 沉淀（2026-04-29）: Report Template — 13 类格式化标准（沉淀自 ai-app/contracts/report-template）
export * from "../content/report-template";

// ★ 沉淀（2026-04-29）: 引用工具（纯 utility，零 DI）
export {
  type CitationWithContext,
  type EvidenceFingerprint,
  type CitationVerifyResult,
  type VerificationStats,
  type VerifyCitationsResult,
  type EvidenceForVerification,
  type LocalToGlobalMap,
  extractCitationsWithContext,
  buildEvidenceFingerprint,
  scoreCitationMatch,
  verifyCitations,
  buildContiguousMapping,
  restoreGlobalIndices,
  // ★ Phase 9 沉淀 (2026-04-29): 5 种学术引用格式
  type CitationStyle,
  type SourceCategory as CitationSourceCategory,
  type CitationAuthor,
  type CitationMetadata,
  type FormattedCitation,
  type Bibliography,
  type RawEvidence as CitationRawEvidence,
  buildCitationMetadata,
  formatCitation,
  generateBibliography,
} from "../content/citation";

// ★ Phase 7: Content engine abstractions
export type {
  ILongContentEngine,
  IContinuationProtocol,
  IReportSynthesisEngine,
} from "../content/abstractions/content-engine.interfaces";

// Agent types
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
} from "../planning/abstractions/orchestrator.interface";

// Workflow Handlers
export type {
  WorkflowNodeHandler,
  MapStepConfig,
} from "../planning/handlers/workflow-node-handler.interface";
export { WorkflowHandlerRegistry } from "../planning/handlers/handler-registry";

// Executors
export { DAGExecutor } from "../planning/executors/dag-executor";

// Orchestration interfaces
export type { IConstraintEnforcementService } from "../planning/services/interfaces";

// Memory abstractions 已移除（2026-04-30）—— Memory 整体迁到 ai-harness/memory，
// 请从 "@/modules/ai-harness/memory/abstractions/memory.interface" 或
// "@/modules/ai-harness/facade" 导入 IMemoryStore / MemoryEntry 等类型。
// engine facade 不能 re-export ai-harness 类型（ESLint 单向依赖规则）。

// ★ Image Search tool types
export type {
  ImageSearchInput,
  ImageSearchResult,
  ImageSearchOutput,
} from "../tools/categories/information/image-search/image-search.types";

// Query Loop auto-continuation engine
export {
  QueryLoopService,
  type QueryLoopConfig,
  type QueryLoopResult,
  type QueryLoopStopReason,
} from "../planning/services";

// Token usage tracker
export {
  TokenTrackerService,
  type TokenUsageSnapshot,
  type TokenUsageEntry,
} from "../planning/services";

export {
  ContextCompactionPipelineService,
  type CompactionConfig,
  type CompactionResult,
  type CompactionLevel,
} from "../planning/services";

export {
  ExecutionCheckpointService,
  type ExecutionCheckpoint,
} from "../planning/services";

export {
  AdaptiveReplannerService,
  type ReplanTrigger,
  type ReplanResult,
  type ReplanContext,
  type ReplanStep,
} from "../planning/services";

// ★ Phase 3: Tool Concurrency
export { ToolConcurrencyService } from "../tools/concurrency/tool-concurrency.service";
export type {
  ConcurrencyMetadata,
  ExecutionPartition,
} from "../tools/concurrency/tool-concurrency.service";

// ★ Phase 8 沉淀 (2026-04-29): Search 多源融合 + 质量门通用工具
export {
  type IndexedItem,
  normalizeUrl,
  dedupeByUrlAndTitle,
  tokenizeQuery,
  computeRelevanceScore,
  extractDomain as extractSearchDomain,
  enforceDomainDiversity,
  type SuggestedSearchAction,
  type QualityGateInput,
  type QualityGateContext,
  type QualityGateItem,
  type QualityVerdict,
  evaluateSearchQuality,
} from "../tools/search-fusion";

// ★ Phase 7: Session Memory Sidecar
export {
  SessionMemorySidecarService,
  type SidecarCategory,
  type SidecarEntry,
  type SidecarConfig,
} from "../planning/services";

// ★ Phase 10: Coordinator Synthesize-Before-Delegate
export { CrossCuttingSynthesisService } from "../planning/services/cross-cutting-synthesis.service";
export type {
  DimensionResult,
  CrossCuttingTheme,
  Contradiction,
  ResearchGap,
  SynthesisResult,
} from "../planning/services/cross-cutting-synthesis.service";

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
} from "../planning/services";

export {
  AutoDreamSchedulerService,
  type SchedulerConfig,
  type ScheduledScope,
  type SchedulerStats,
} from "../planning/services";

// ════════════════════════════════════════════════════════════════════
// Safety / Resilience / Security （PR-X15: engine 公开 API barrel
// 供 ai-harness/facade 转发，避免 harness 穿透 engine 私有路径）
// ════════════════════════════════════════════════════════════════════
export {
  CircuitBreakerService,
  TaskCompletionType,
} from "../safety/resilience/circuit-breaker.service";
export type {
  CircuitState,
  CircuitBreakerConfig,
  HealthMetrics,
} from "../safety/resilience/circuit-breaker.service";
export { CapabilityGuardService } from "../safety/security/capability-guard.service";
export type { CapabilityCheckResult } from "../safety/security/capability.types";

// ════════════════════════════════════════════════════════════════════
// LLM Error Classification (PR-X28: lifted from common/ai-orchestration)
// ════════════════════════════════════════════════════════════════════
export {
  AIError,
  AIErrorType,
  AIErrorClassifier,
} from "../llm/abstractions/error-classifier";

// ════════════════════════════════════════════════════════════════════
// BYOK / Credentials (PR-X30: surface for ai-app/byok controllers — they
// previously reached into ai-engine/credentials/* directly, violating the
// "ai-app accesses ai-engine only via facade" rule)
// ════════════════════════════════════════════════════════════════════
export { KeyAssignmentsService } from "../credentials/key-assignments/key-assignments.service";
export { KeyRequestsService } from "../credentials/key-requests/key-requests.service";
export { UserApiKeysService } from "../credentials/user-api-keys/user-api-keys.service";
export { KeyResolverService } from "../credentials/key-resolver/key-resolver.service";
export { UserModelConfigsService } from "../credentials/user-model-configs/user-model-configs.service";
export { CreateKeyRequestDto } from "../credentials/key-requests/dto/create-key-request.dto";
export {
  SaveUserApiKeyDto,
  ApiKeyMode,
} from "../credentials/user-api-keys/dto/save-user-api-key.dto";
export { TestApiKeyDto } from "../credentials/user-api-keys/dto/test-api-key.dto";
export {
  CreateUserModelConfigDto,
  UpdateUserModelConfigDto,
} from "../credentials/user-model-configs/dto/user-model-config.dto";
export { AiModelDiscoveryService } from "../llm/services/ai-model-discovery.service";
export { AiConnectionTestService } from "../llm/services/ai-connection-test.service";
export { AutoConfigureService } from "../llm/user-models-auto-configure.service";
