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

export { PromptSkillRegistrationService } from "../skills/runtime";
export { CHAT_PROVIDER_PORT } from "./abstractions/runtime-deps.tokens";

// ★ 2026-05-04 (PR-6 standardize consumer): jaccardSimilarity 从
//   ai-app/<consumer> 上提到 engine/content（纯 token-set 文本相似度，
//   无 agent/mission 状态，跨 ai-app 可复用）
export { jaccardSimilarity } from "../content/text-similarity.utils";

// ★ 2026-05-04 (PR-10b standardize consumer): JSON-fence 解析基元从
//   ai-app/<consumer>/services/chat 上提到 engine/content
//   （LLM 输出 → 结构化决策的通用 fence parser，零业务 DSL；
//   consumer LeaderDecision DSL 仍留 app 作为 caller-side wrapper）
export {
  parseJsonFence,
  extractJsonFenceContent,
  type JsonFenceParseResult,
} from "../content/json-fence-parser.utils";

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
 * Internal services that need LLM access should use AiChatService; runtime adapters
 * that need harness chat access should inject CHAT_PROVIDER_PORT.
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
    /** LLM Function Calling: tool schemas to expose to the model */
    tools?: import("../tools/abstractions/tool.interface").FunctionDefinition[];
    [key: string]: unknown;
  }): Promise<{
    content: string;
    model: string;
    tokensUsed: number;
    inputTokens?: number;
    outputTokens?: number;
    finishReason?: string;
    /** LLM Function Calling: tool call requests returned by the model */
    toolCalls?: Array<{
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }>;
    [key: string]: unknown;
  }>;
}

// ★ Engine internal types used across AI App modules
export type { SaveEvidenceRequest } from "../knowledge/evidence/abstractions/evidence.interface";
// AICapabilityContext / SkillPromptBundle / SkillPromptOptions / UserIntent
// 已移至 @/modules/ai-harness/facade（属于 L2.5 execution 层，2026-05-01 PR-X-L 修反向依赖）
export type { SkillMdDefinition } from "../skills/types/skill-md.types";
export type { EmbeddingResult } from "@/modules/ai-engine/rag/embedding";
export type {
  SimilaritySearchOptions,
  SimilarityResult,
} from "@/modules/ai-engine/rag/vector/vector.service";

// ★ Registry classes — engine-owned registries only
export { ToolRegistry } from "../tools/registry/tool.registry";
export { SkillRegistry } from "../skills/registry/skill.registry";

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
export {
  classifyModelTier,
  ModelTier,
} from "@/modules/ai-engine/llm/types/model-tier.types";

// ★ Stream timing types (for TTFT/TTLT tracking)
export type {
  StreamTiming,
  StreamChunk,
} from "@/modules/ai-engine/llm/services/ai-stream-handler.service";

// TaskPlan / IntentRouter / TaskPlanner 已删 (2026-04-30) — 死代码
export type {
  ToolContext,
  ITool,
  JSONSchema,
} from "../tools/abstractions/tool.interface";

// ★ Batch 1 supplemental exports

// Orchestration services
export { ContextCompressionService } from "../planning/context/context-compression.service";
// 2026-05-01 (PR-X-L): 以下 type / class 都属于 L2.5 ai-harness/runner，
// 已下沉为 ai-harness/facade 直接导出，engine facade 不再 re-export 走反向依赖：
//   - DataChunk / SummaryChunk / CompressionResult / CompressionOptions
//   - ContextStrategy
//   - ConstraintSeverity / ExtractedConstraint / ConstraintViolation
//     / OutputValidationResult / AiCallerFn / ReviewRequest / ReviewResult / ReviewCriteria
//   - EstablishedFact / ExecutionConfig
//   - FactExtractionRequest / FactExtractionResult / ContextEvolutionConfig
// ai-app 改从 @/modules/ai-harness/facade 引入这些符号。

// TokenBudgetService 是 engine 自有（llm/budget/token-budget.service.ts），
// 修复原 reverse path（engine→harness→engine 绕一圈）为直接 engine 自身
export { TokenBudgetService } from "../planning/budget/token-budget.service";
export type {
  ModelConfig as TokenBudgetModelConfig,
  TokenBudget,
  ContentPriority,
  BudgetAllocation,
} from "../planning/budget/token-budget.service";
// OutputReviewerService 已搬到 ai-harness/evaluation/critique/ (2026-05-02)
export { ContextEvolutionService } from "../knowledge/extraction/context-evolution.service";
// AgentExecutorService 已搬到 ai-harness/runner/executor/ (2026-04-30)
export { ContextInitializationService } from "../knowledge/world-building/context-initialization.service";
// TaskDecomposerService 已删 (2026-04-30) — 死代码
export { ModelFallbackService } from "../llm/selection/model-fallback.service";

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
export { FunctionCallingLLMAdapter } from "../llm/adapters/function-calling-llm.adapter";

// Image generation interface & tokens
export {
  IMAGE_GENERATION_SERVICE,
  TTS_SERVICE,
} from "../tools/abstractions/generation-services.interface";
export type { IImageGenerationService } from "../tools/abstractions/generation-services.interface";
export { IMAGE_GENERATION_SERVICE_TOKEN } from "@/modules/ai-engine/content/abstractions/image.interface";
export type { IRAGPipelineService } from "@/modules/ai-engine/rag/abstractions/rag.interface";
export { RAG_PIPELINE_SERVICE_TOKEN } from "@/modules/ai-engine/rag/abstractions/rag.interface";

// LLM model fallback types
export type { ModelFallbackOptions } from "../llm/selection/model-fallback.service";
export type { AIModelConfig } from "@/modules/ai-engine/llm/services/ai-model-config.service";

// TeamMemberInfo 是 L2.5 ai-harness/runner 类型，2026-05-01 PR-X-M2 下沉为
// ai-harness/facade export，engine 不再 re-export

// Error detection utilities
export type { ErrorDetectionRetryConfig } from "@/modules/ai-engine/safety/utils/error-detection.utils";
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
} from "@/modules/ai-engine/safety/utils/error-detection.utils";

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
export { EmbeddingService } from "@/modules/ai-engine/rag/embedding";
export type {
  EmbeddingModelConfig,
  EmbeddingBatch,
} from "@/modules/ai-engine/rag/embedding";
export { VectorService } from "@/modules/ai-engine/rag/vector";
export type { VectorSearchResult } from "@/modules/ai-engine/rag/vector";
export { DocumentChunker } from "@/modules/ai-engine/rag/chunking";
export type {
  ChunkingConfig,
  ChildChunkData,
  ParentChunkData,
  ChunkedDocument,
} from "@/modules/ai-engine/rag/chunking";
export { DEFAULT_CHUNKING_CONFIG } from "@/modules/ai-engine/rag/chunking";
export { RAGPipelineService } from "@/modules/ai-engine/rag/pipeline";
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
} from "@/modules/ai-engine/rag/pipeline/rag-pipeline.interface";

// Policy research tools
export {
  FederalRegisterTool,
  CongressGovTool,
  WhiteHouseNewsTool,
  PolicyDataService,
} from "../tools/categories/information/policy";

// ★ Batch 2 — Core services
export { AiChatService } from "@/modules/ai-engine/llm/services/ai-chat.service";
export type {
  ChatObserver,
  ChatObserverEvent,
  ChatOptions,
  ChatResult,
} from "@/modules/ai-engine/llm/services/ai-chat.service";
export type { ChatMessage } from "../llm/types";
export {
  inferIsReasoning,
  getKnownModelLimit,
} from "@/modules/ai-engine/llm/types/model.utils";

// ★ Model Election
export { ModelElectionService } from "../llm/selection";
export {
  NoEligibleModelError,
  type ElectionCandidate,
  type ElectionRequest,
  type ElectionResult,
  type ElectionRoleHint,
  type ElectionScore,
  type ElectionCostBias,
} from "../llm/selection";
export { SearchService } from "../knowledge/search/search.service";
export { SkillLoaderService } from "../skills/loader/loading/skill-loader.service";
export { SkillContentService } from "../skills/content/skill-content.service";
export type {
  SkillVersionRecord,
  FullSkillDefinition,
} from "../skills/content/skill-content.service";
export { SkillSandboxService } from "../skills/sandbox/skill-sandbox.service";
export { MultiKeyRegistry } from "@/modules/ai-engine/llm/key-health/multi-key.manager";
export type { KeyHealthStatus } from "@/modules/ai-engine/llm/key-health/multi-key.manager";
// AICapabilityResolver 是 L2.5 ai-harness/runner 服务，2026-05-01 PR-X-M2
// 下沉为 ai-harness/facade export
// IntentRouterService / RouteResult / AgentContext 已删 (2026-04-30) — 死代码

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

// ★ 沉淀（2026-04-29）: figure 抽取（来自 <consumer>, TI 暂不切换）
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

// ★ 沉淀（2026-04-29）: LLM Reranker（来自 <consumer>, 用 AiChatService 内层调用）
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
} from "../llm/output-parsing";

// ★ 沉淀（2026-04-29）: figure URL 有效性校验
export { isValidFigureUrl } from "../safety/utils/figure-url-sanitizer.utils";

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
} from "../content/abstractions/content-engine.interface";

// Agent types

// Common types
export type {
  JsonObject,
  JsonValue,
  ValidationResult,
  ValidationIssue,
  ExecutionResult,
  ExecutionMetadata,
  ExecutionError,
  BaseContext,
  RetryConfig,
  TimeoutConfig,
  PaginationParams,
  PaginatedResult,
  DeepPartial,
  Nullable,
  Optional,
  MaybePromise,
} from "@/modules/ai-engine/facade/abstractions/common.types";

export { EngineExecutionMode } from "@/modules/ai-engine/facade/abstractions/common.types";

export {
  EngineError,
  ValidationError,
  TimeoutError,
  CancelledError,
  NotFoundError,
  RetryExhaustedError,
  PreconditionError,
  DependencyError,
  RateLimitError,
} from "./abstractions/engine.error";

export {
  CommonErrorCode,
  ToolErrorCode,
  SkillErrorCode,
  AgentErrorCode,
} from "./abstractions/error-codes.constants";

export {
  type IRegisterable,
  type IRegistry,
  BaseRegistry,
  type RegistryStats,
} from "./abstractions/registry.interface";

export { type IExecutable } from "./abstractions/executable.interface";

export { ToolError } from "../tools/abstractions/tool.error";
export { SkillError } from "../skills/abstractions/skill.error";

// Orchestrator abstractions — 2026-05-01 PR-X-M2: 16 个类型下沉到 ai-harness/facade
// 因为 orchestrator.interface 是 L2.5 ai-harness 概念，engine facade 不
// 再 re-export。ai-app 已改 from "@/modules/ai-harness/facade" 引入。

// Workflow Handlers / Executors —— 2026-04-30 (C2-step2) 删除死代码:
//   - WorkflowHandlerRegistry / WorkflowNodeHandler / MapStepConfig (仅被 BaseExecutor 用，BaseExecutor 死)
//   - DAGExecutor (engine 728行重型版，被 ai-harness/runner/dag/ 165行轻量版取代)
//   保留: FunctionCallingExecutor (从 ai-engine/index.ts 单独 export)

// IConstraintEnforcementService 已下沉为 ai-harness/facade export (PR-X-M2)

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

// QueryLoopService / TokenTrackerService 已下沉为 ai-harness/facade export (PR-X-M2)

// 2026-05-01 (PR-X-L): ContextCompactionPipelineService 是 engine 自有，从源头直接 import
export {
  ContextCompactionPipelineService,
  type CompactionConfig,
  type CompactionResult,
  type CompactionLevel,
} from "../planning/context/context-compaction-pipeline.service";

// ExecutionCheckpointService 是 L2.5 ai-harness/runner 概念，
// 已下沉为 ai-harness/facade 直接 export，engine facade 不再 re-export

// AdaptiveReplannerService / ReplanTrigger / ... 已搬到 ai-harness (2026-04-30)
//   消费方改 import "@/modules/ai-harness/facade"

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

// SessionMemorySidecarService 已下沉为 ai-harness/facade export (PR-X-M2)

// ★ Phase 10: Coordinator Synthesize-Before-Delegate
export { CrossCuttingSynthesisService } from "../knowledge/synthesis/cross-cutting-synthesis.service";
export type {
  DimensionResult,
  CrossCuttingTheme,
  Contradiction,
  ResearchGap,
  SynthesisResult,
} from "../knowledge/synthesis/cross-cutting-synthesis.service";

// ★ Phase 5: Prompt Cache Coordination
export { PromptCacheCoordinatorService } from "@/modules/ai-engine/llm/services/prompt-cache-coordinator.service";
export type { CachePrefix } from "@/modules/ai-engine/llm/services/prompt-cache-coordinator.service";

// ★ Phase 9: Background Autonomous Agents
//   2026-04-30 (C2-step1): AutoDream 已搬到 ai-harness/memory/consolidation/，
//   ai-app 调用方应改 from "@/modules/ai-harness/facade"

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
// BYOK / Credentials — 2026-05-01 已下沉到 ai-infra/credentials/
// Engine 仅保留 LLM 配置探测与多 Key 健康管理，统一挂在 llm/*
//   ai-app/byok controllers 应改从 "@/modules/ai-infra/facade" 导入。
//   本处的 re-export 保留是为向后兼容；新代码请直接走 ai-infra/facade。
// ════════════════════════════════════════════════════════════════════
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
export { AiModelDiscoveryService } from "@/modules/ai-engine/llm/services/ai-model-discovery.service";
export { AiConnectionTestService } from "@/modules/ai-engine/llm/services/ai-connection-test.service";
export { AutoConfigureService } from "@/modules/ai-engine/llm/user-config/user-models-auto-configure.service";
