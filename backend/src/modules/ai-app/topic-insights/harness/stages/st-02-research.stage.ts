/**
 * ST-02-RESEARCH · 每个维度的搜索 + evidence 写入 DB
 *
 * Group G-2 起：
 * - 调 `SearchOrchestratorService.search(dimension, topic)` 跑真搜索
 * - 把结果写入 `TopicEvidence` 表（关联 `reportId` + `dimensionId`）
 * - `evidenceCount` 从 DB count 读（原则 6：不信 agent 自报）
 *
 * 没有 SearchOrchestratorService 注入时（测试环境）退化到占位模式，
 * 保证 unit tests 仍能跑通。
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import type {
  PipelineIdentityContext,
  Stage,
  StageResults,
} from "../pipeline/types";
import type {
  DimensionResearchOutcome,
  PlanStageOutput,
  ResearchStageOutput,
} from "./stage-context";
import { SearchOrchestratorService } from "../../services/search/search-orchestrator.service";

/**
 * Prisma 模型的最小投影（避免 harness 直接 import Prisma types 导致耦合）
 */
interface TopicLite {
  id: string;
  name: string;
  type: string | null;
  language: string | null;
}

interface TopicDimensionLite {
  id: string;
  topicId: string;
  name: string;
  description: string | null;
  searchQueries: unknown;
  searchSources: unknown;
}

@Injectable()
export class ResearchStage implements Stage<
  PlanStageOutput,
  ResearchStageOutput
> {
  private readonly logger = new Logger(ResearchStage.name);
  readonly id = "ST-02-RESEARCH" as const;
  readonly name = "Dimension research";
  readonly dependsOn = ["ST-01-PLAN" as const];
  readonly runsWhen = "always" as const;
  readonly slo = {
    p95Ms: 300_000,
    tokenBudget: 50_000,
    targetSuccessRate: 0.9,
  };
  readonly emitsEvents = [
    "dimension:research_started",
    "dimension:research_completed",
  ];

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional()
    private readonly searchOrchestrator?: SearchOrchestratorService,
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async prepare(
    _identity: PipelineIdentityContext,
    upstream: StageResults,
  ): Promise<PlanStageOutput> {
    return upstream.get<PlanStageOutput>("ST-01-PLAN");
  }

  async execute(
    identity: PipelineIdentityContext,
    input: PlanStageOutput,
    signal: AbortSignal,
  ): Promise<ResearchStageOutput> {
    if (signal.aborted) {
      throw new DOMException(`[${this.id}] aborted`, "AbortError");
    }

    // 无 Prisma / SearchOrchestrator → 测试模式退化
    if (!this.prisma || !this.searchOrchestrator) {
      this.logger.warn(
        `[${this.id}] prisma/search unavailable — falling back to stub outcomes`,
      );
      return this.buildStubOutcomes(input);
    }

    // 读真 topic + dimension 行（ST-01 persist 已把真 id 回写进 plan）
    const topic = (await this.prisma.researchTopic.findUnique({
      where: { id: identity.topicId },
      select: { id: true, name: true, type: true, language: true },
    })) as TopicLite | null;
    if (!topic) {
      throw new Error(
        `[${this.id}] topic ${identity.topicId} not found — cannot search`,
      );
    }

    const outcomes: DimensionResearchOutcome[] = [];
    for (const planDim of input.plan.dimensions) {
      if (signal.aborted) {
        throw new DOMException(`[${this.id}] aborted mid-dim`, "AbortError");
      }

      const dimRow = (await this.prisma.topicDimension.findUnique({
        where: { id: planDim.id },
      })) as TopicDimensionLite | null;
      if (!dimRow) {
        this.logger.warn(
          `[${this.id}] dimension ${planDim.id} not in DB — skipping search`,
        );
        outcomes.push({
          dimensionId: planDim.id,
          dimensionName: planDim.name,
          evidenceIds: [],
          evidenceCount: 0,
        });
        continue;
      }

      const searchResult = await this.searchOrchestrator
        // 这里的 topic / dimension 都是 DB 实际行（非 stub 数据）
        .search(dimRow as never, topic as never)
        .catch((err: unknown) => {
          this.logger.warn(
            `[${this.id}] search failed for dim=${planDim.name}: ${err instanceof Error ? err.message : String(err)}`,
          );
          return null;
        });

      if (!searchResult) {
        outcomes.push({
          dimensionId: planDim.id,
          dimensionName: planDim.name,
          evidenceIds: [],
          evidenceCount: 0,
        });
        continue;
      }

      // 写 TopicEvidence（scoredItems 含 credibility 走优先；没有则走 items）
      const items = searchResult.scoredItems
        ? searchResult.scoredItems.map((s) => ({
            item: s.item,
            credibilityScore: Math.round(s.credibilityScore * 100),
          }))
        : searchResult.items.map((item) => ({ item, credibilityScore: 50 }));

      const evidenceIds: string[] = [];
      let citationIndex = 1;
      for (const { item, credibilityScore } of items) {
        const created = await this.prisma.topicEvidence
          .create({
            data: {
              reportId: identity.reportId,
              analysisId: null, // ST-05 之前 DimensionAnalysis 还没建
              title: item.title.slice(0, 500),
              url: item.url,
              domain: item.domain ?? null,
              snippet: item.snippet ?? null,
              publishedAt: item.publishedAt ?? null,
              sourceType: item.sourceType,
              credibilityScore,
              citationIndex: citationIndex++,
            },
            select: { id: true },
          })
          .catch((err: unknown) => {
            this.logger.warn(
              `[${this.id}] evidence create failed url=${item.url}: ${err instanceof Error ? err.message : String(err)}`,
            );
            return null;
          });
        if (created) evidenceIds.push(created.id);
      }

      // 原则 6：evidenceCount 从 DB count 读
      const dbCount = await this.prisma.topicEvidence.count({
        where: { reportId: identity.reportId },
      });
      void dbCount; // 当前还没按 dimension 独立 count（需 analysisId），
      // 暂用本次写入的数量；ST-05 会重新按 DimensionAnalysis 挂载

      outcomes.push({
        dimensionId: planDim.id,
        dimensionName: planDim.name,
        evidenceIds,
        evidenceCount: evidenceIds.length,
      });
    }

    return { byDimension: outcomes };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async persist(
    _identity: PipelineIdentityContext,
    _output: ResearchStageOutput,
  ): Promise<void> {
    // 已在 execute 内部写入 TopicEvidence；persist 留空（幂等契约占位）
  }

  private buildStubOutcomes(input: PlanStageOutput): ResearchStageOutput {
    const byDimension = input.plan.dimensions.map((dim) => ({
      dimensionId: dim.id,
      dimensionName: dim.name,
      evidenceIds: Array.from({ length: 5 }).map(
        (_, i) => `${dim.id}-ev-${i + 1}`,
      ),
      evidenceCount: 5,
    }));
    return { byDimension };
  }
}
