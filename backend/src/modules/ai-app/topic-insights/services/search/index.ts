/**
 * Search Pipeline — Barrel Exports
 *
 * Modular search pipeline that replaces the fetchDataForDimension() flow.
 * Entry point: SearchOrchestratorService.search()
 */

// Core
export { SearchOrchestratorService } from "./search-orchestrator.service";
export { GlobalSourceThrottleService } from "./global-source-throttle.service";
export { SearchExecutorService } from "./search-executor.service";

// Query
export { QueryStrategyService } from "./query";

// Fusion
export { ResultFusionService, QualityGateService } from "./fusion";

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
  SearchAdapterBase,
} from "./adapters";

// Types
export * from "./search.types";
