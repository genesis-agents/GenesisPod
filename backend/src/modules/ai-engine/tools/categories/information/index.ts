/**
 * Information Retrieval Tools
 * 信息获取工具集 - 按分类组织
 *
 * 子目录：
 * - web/       网络搜索和内容抓取 (WebSearch, WebScraper, DataFetch)
 * - academic/  学术论文搜索 (ArXiv, SemanticScholar, PubMed)
 * - community/ 技术社区搜索 (HackerNews, GitHub)
 * - data/      数据接口 (Finance, Weather)
 * - knowledge/ 内部知识检索 (RAG, Database, KnowledgeGraph)
 * - policy/    政策研究 (FederalRegister, CongressGov, WhiteHouseNews)
 */

// Web Tools
export { WebSearchTool, WebScraperTool, DataFetchTool } from "./web";
export type {
  WebSearchInput,
  WebSearchOutput,
  WebScraperInput,
  WebScraperOutput,
  DataFetchInput,
  DataFetchOutput,
} from "./web";

// Academic Research Tools
export {
  ArxivSearchTool,
  SemanticScholarSearchTool,
  PubMedSearchTool,
  OpenAlexSearchTool,
} from "./academic";
export type {
  ArxivSearchInput,
  ArxivSearchOutput,
  ArxivPaper,
  ArxivSortBy,
  SemanticScholarSearchInput,
  SemanticScholarSearchOutput,
  SemanticScholarPaper,
  PubMedSearchInput,
  PubMedSearchOutput,
  PubMedArticle,
  OpenAlexSearchInput,
  OpenAlexSearchOutput,
  OpenAlexPaper,
} from "./academic";

// Community Tools
export { HackerNewsSearchTool, GithubSearchTool } from "./community";
export type {
  HackerNewsSearchInput,
  HackerNewsSearchOutput,
  HackerNewsSearchResult,
  HackerNewsTagType,
  GithubSearchInput,
  GithubSearchOutput,
  GithubRepository,
  GithubSortType,
} from "./community";

// Data Tools
export { FinanceApiTool, WeatherApiTool } from "./data";
export type {
  FinanceApiInput,
  FinanceApiOutput,
  FinanceDataPoint,
  WeatherApiInput,
  WeatherApiOutput,
  WeatherData,
} from "./data";

// Knowledge Tools
export {
  RAGSearchTool,
  DatabaseQueryTool,
  KnowledgeGraphTool,
} from "./knowledge";
export type {
  RAGSearchInput,
  RAGSearchResultItem,
  RAGSearchOutput,
  DatabaseQueryInput,
  ColumnInfo,
  DatabaseQueryOutput,
  QueryType,
  KnowledgeGraphInput,
  GraphNode,
  GraphEdge,
  GraphPath,
  KnowledgeGraphOutput,
} from "./knowledge";

// Policy Research Tools
export * from "./policy";
