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
// p-limit v5 is ESM-only; use dynamic import to stay CommonJS-compatible
type LimitFn = <T>(fn: () => Promise<T>) => Promise<T>;
let pLimitModule: ((concurrency: number) => LimitFn) | null = null;
async function getPLimit(): Promise<(concurrency: number) => LimitFn> {
  if (!pLimitModule) {
    const mod = (await import("p-limit")) as {
      default: (concurrency: number) => LimitFn;
    };
    pLimitModule = mod.default;
  }
  return pLimitModule;
}
import type { PipelineIdentityContext, Stage, StageResults } from "../types";
import type {
  DimensionResearchOutcome,
  PlanStageOutput,
  ResearchStageOutput,
} from "./stage-context";
import { SearchOrchestratorService } from "@/modules/ai-app/topic-insights/knowledge/search/orchestrator.service";

/** 并发上限（同时查询的维度数），防压垮上游搜索 API */
const DIMENSION_CONCURRENCY = 3;

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

    // ★ Group L-2: 维度并行（有限并发）执行搜索 + evidence 写入
    const pLimitFactory = await getPLimit();
    const limit = pLimitFactory(DIMENSION_CONCURRENCY);
    const tasks = input.plan.dimensions.map((planDim) =>
      limit(() => this.researchOneDimension(identity, topic, planDim, signal)),
    );
    const outcomes = await Promise.all(tasks);

    return { byDimension: outcomes };
  }

  /**
   * 研究单个维度：DB findUnique → search → evidence 写入。
   * 返回 DimensionResearchOutcome（失败 / 不存在都返回 0 evidence，不抛）。
   */
  private async researchOneDimension(
    identity: PipelineIdentityContext,
    topic: TopicLite,
    planDim: PlanStageOutput["plan"]["dimensions"][number],
    signal: AbortSignal,
  ): Promise<DimensionResearchOutcome> {
    if (signal.aborted) {
      throw new DOMException(`[${this.id}] aborted mid-dim`, "AbortError");
    }
    if (!this.prisma || !this.searchOrchestrator) {
      return {
        dimensionId: planDim.id,
        dimensionName: planDim.name,
        evidenceIds: [],
        evidenceCount: 0,
      };
    }

    const dimRow = (await this.prisma.topicDimension.findUnique({
      where: { id: planDim.id },
    })) as TopicDimensionLite | null;
    if (!dimRow) {
      this.logger.warn(
        `[${this.id}] dimension ${planDim.id} not in DB — skipping search`,
      );
      return {
        dimensionId: planDim.id,
        dimensionName: planDim.name,
        evidenceIds: [],
        evidenceCount: 0,
      };
    }

    // F-2 · ResearchTask 状态流转：PENDING → EXECUTING（前端任务列表进度条）
    await this.markDimensionTask(identity.missionId, planDim.id, "EXECUTING");

    const searchResult = await this.searchOrchestrator
      .search(dimRow as never, topic as never)
      .catch((err: unknown) => {
        this.logger.warn(
          `[${this.id}] search failed for dim=${planDim.name}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      });

    if (!searchResult) {
      return {
        dimensionId: planDim.id,
        dimensionName: planDim.name,
        evidenceIds: [],
        evidenceCount: 0,
      };
    }

    const items = searchResult.scoredItems
      ? searchResult.scoredItems.map((s) => ({
          item: s.item,
          credibilityScore: Math.round(s.credibilityScore * 100),
        }))
      : searchResult.items.map((item) => ({ item, credibilityScore: 50 }));

    // ★ baseline dimension-mission.executeSearchPhase：
    //   citationIndex 必须从 aggregate(max, reportId) + 1 起始，
    //   否则增量模式（追加新维度）会与已有 evidence 的 citationIndex 撞号，
    //   导致前端引用锚点错乱（严重 P0 bug）。
    const existingMax = await this.prisma.topicEvidence
      .aggregate({
        where: { reportId: identity.reportId },
        _max: { citationIndex: true },
      })
      .catch(() => ({ _max: { citationIndex: 0 as number | null } }));
    let citationIndex = (existingMax._max.citationIndex ?? 0) + 1;

    const evidenceIds: string[] = [];
    for (const { item, credibilityScore } of items) {
      if (signal.aborted) break;
      const created = await this.prisma.topicEvidence
        .create({
          data: {
            reportId: identity.reportId,
            analysisId: null,
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

    // F-2 · 完成或失败转 COMPLETED（0 证据也算完成 — 下游 WriteStage 会处理缺证据）
    await this.markDimensionTask(identity.missionId, planDim.id, "COMPLETED", {
      resultSummary: `evidence=${evidenceIds.length}`,
      progress: 100,
    });

    return {
      dimensionId: planDim.id,
      dimensionName: planDim.name,
      evidenceIds,
      evidenceCount: evidenceIds.length,
    };
  }

  /**
   * F-2 · 更新 dimension_research task 的状态 / 进度 / 摘要。
   * 幂等：按 (missionId, dimensionId, taskType) 定位，updateMany 可接受 0 行。
   * 失败不抛 — task 行丢失不影响 search 产出，只影响前端显示。
   */
  private async markDimensionTask(
    missionId: string,
    dimensionId: string,
    status: "EXECUTING" | "COMPLETED" | "FAILED",
    extras?: { resultSummary?: string; progress?: number },
  ): Promise<void> {
    if (!this.prisma) return;
    try {
      const now = new Date();
      const data: Record<string, unknown> = {
        status,
        progress:
          extras?.progress ??
          (status === "EXECUTING" ? 10 : status === "COMPLETED" ? 100 : 0),
      };
      if (status === "EXECUTING") data.startedAt = now;
      if (status === "COMPLETED" || status === "FAILED") data.completedAt = now;
      if (extras?.resultSummary) data.resultSummary = extras.resultSummary;

      await this.prisma.researchTask.updateMany({
        where: { missionId, dimensionId, taskType: "dimension_research" },
        data,
      });
    } catch (err) {
      this.logger.warn(
        `[${this.id}] markDimensionTask dim=${dimensionId} → ${status} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
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
