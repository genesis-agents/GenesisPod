/**
 * SearchModule — topic-insights 搜索管道打包
 *
 * 起因（2026-04-24）：PipelineModule 里 ResearchStage 需要 SearchOrchestrator
 * 但跨不到 topic-insights.module 的 scope。生产表现为 "prisma/search
 * unavailable — falling back to stub outcomes"，导致整条 pipeline 降级到
 * 桩证据，AG-03-SW 写不出 citation[N]，retry 耗尽失败。
 *
 * 根因：@Optional 注入 cross-module 查不到就 undefined 落入 stub。
 *
 * 修：把 knowledge/search/ 下所有 provider 打包到本 module，export 关键服务。
 * PipelineModule 和 topic-insights.module 都 imports 它。
 */

import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { PrismaModule } from "@/common/prisma/prisma.module";
import { AiEngineModule } from "@/modules/ai-engine/ai-engine.module";
import { SecretsModule } from "@/modules/ai-infra/secrets/secrets.module";
import { SearchOrchestratorService } from "./orchestrator.service";
import { SearchExecutorService } from "./executor.service";
import { GlobalSourceThrottleService } from "./global-source-throttle.service";
import { QueryStrategyService } from "./query";
import {
  ResultFusionService,
  QualityGateService,
  UrlValidationService,
  ContentEnrichmentService,
  ContentFetcherService,
  EvidenceEvaluationService,
  ResultFilterService,
} from "./fusion";
import {
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
} from "./adapters";
import { LlmRerankerAdapter } from "./rerank/llm-reranker.adapter";
import { RAGFusionService } from "./rag-fusion.service";
import { LeaderToolService } from "../leader-tools/leader-tool.service";

@Module({
  imports: [PrismaModule, HttpModule, SecretsModule, AiEngineModule],
  providers: [
    // Orchestrator
    SearchOrchestratorService,
    // Executor / throttle / query
    SearchExecutorService,
    GlobalSourceThrottleService,
    QueryStrategyService,
    // Fusion
    ResultFusionService,
    QualityGateService,
    UrlValidationService,
    ContentEnrichmentService,
    ContentFetcherService,
    EvidenceEvaluationService,
    ResultFilterService,
    // Adapters
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
    // Rerank
    LlmRerankerAdapter,
    // Fusion/RAG
    RAGFusionService,
    // F-7 · Leader proactive tools
    LeaderToolService,
  ],
  exports: [
    SearchOrchestratorService,
    SearchExecutorService,
    GlobalSourceThrottleService,
    QueryStrategyService,
    ResultFusionService,
    QualityGateService,
    UrlValidationService,
    ContentEnrichmentService,
    ContentFetcherService,
    EvidenceEvaluationService,
    ResultFilterService,
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
    LlmRerankerAdapter,
    RAGFusionService,
    LeaderToolService,
  ],
})
export class SearchModule {}
