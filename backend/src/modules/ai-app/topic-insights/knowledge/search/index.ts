/**
 * Search Pipeline — Barrel Exports
 *
 * Modular search pipeline that replaces the fetchDataForDimension() flow.
 * Entry point: SearchOrchestratorService.search()
 */

// Core
export { SearchOrchestratorService } from "./orchestrator.service";
export { GlobalSourceThrottleService } from "./global-source-throttle.service";
export { SearchExecutorService } from "./executor.service";

// Query
export { QueryStrategyService } from "./query";

// Fusion
export { ResultFusionService, QualityGateService } from "./fusion";

// Rerank
export { LlmRerankerAdapter } from "./rerank/llm-reranker.adapter";
export type {
  RerankAdapter,
  RerankCandidate,
  RerankRequest,
  RerankedItem,
  RerankConfig,
} from "./rerank/rerank.types";

// Adapters
export {
  WebSearchAdapter,
  AcademicSearchAdapter,
  GithubSearchAdapter,
  HackernewsSearchAdapter,
  SocialSearchAdapter,
  PolicySearchAdapter,
  FinanceSearchAdapter,
  WeatherSearchAdapter,
  LocalSearchAdapter,
  IndustryReportSearchAdapter,
  SearchAdapterBase,
} from "./adapters";

// Types
export * from "./types";
