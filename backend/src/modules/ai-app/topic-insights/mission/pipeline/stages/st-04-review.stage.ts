/**
 * ST-04-REVIEW · Section 级审核（含 claims 抽取）
 *
 * 每个 section 调 AG-04-SR，产出 SectionReview。
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { SpecAgentRegistry } from "@/modules/ai-engine/facade";
import type { SectionReviewerInput } from "@/modules/ai-app/topic-insights/agents/specs";
import type { SectionReview } from "@/modules/ai-app/topic-insights/agents/specs/schemas";
import {
  parseRevisionRound,
  determineRevisionTargets,
  scoreDeterministically,
  type DimensionReviewLite,
} from "@/modules/ai-app/topic-insights/shared/config";
import type { PipelineIdentityContext, Stage, StageResults } from "../types";
import type { ReviewStageOutput, WriteStageOutput } from "./stage-context";

@Injectable()
export class ReviewStage implements Stage<WriteStageOutput, ReviewStageOutput> {
  readonly id = "ST-04-REVIEW" as const;
  readonly name = "Section review";
  readonly dependsOn = ["ST-03-WRITE" as const];
  readonly runsWhen = "always" as const;
  readonly slo = {
    p95Ms: 120_000,
    tokenBudget: 15_000,
    targetSuccessRate: 0.9,
  };
  readonly emitsEvents = ["section:review_started", "section:review_completed"];

  private readonly logger = new Logger(ReviewStage.name);

  constructor(
    private readonly agentRegistry: SpecAgentRegistry,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async prepare(
    _identity: PipelineIdentityContext,
    upstream: StageResults,
  ): Promise<WriteStageOutput> {
    return upstream.get<WriteStageOutput>("ST-03-WRITE");
  }

  async execute(
    identity: PipelineIdentityContext,
    input: WriteStageOutput,
    signal: AbortSignal,
  ): Promise<ReviewStageOutput> {
    const runner = this.agentRegistry.get<SectionReviewerInput, SectionReview>(
      "AG-04-SR",
    );
    if (!runner)
      throw new Error("AG-04-SR not registered in SpecAgentRegistry");

    // ★ baseline: revisionRound 从 dimension_research task.description 读取 [revision:N]
    //   所有 dim task 同轮次（orchestrator 重跑时整批 +1），取任一 task 即可
    const revisionRound = await this.readRevisionRound(identity.missionId);

    const reviews: SectionReview[] = [];
    for (const section of input.sections) {
      if (signal.aborted) {
        throw new DOMException(`[${this.id}] aborted`, "AbortError");
      }
      const res = await runner.executeSpec(
        {
          sectionResult: {
            sectionId: section.sectionId,
            dimensionId: section.dimensionId,
            title: section.title,
            content: section.content,
            wordCount: section.wordCount,
            keyFindings: section.keyFindings,
          },
          // SectionReviewerInput 接 1|2；> 2 也只 review 一次（兼容 hard cap 语义）
          revisionRound: revisionRound >= 2 ? 2 : 1,
        },
        identity.capabilities?.env,
      );
      if (res.state !== "completed") {
        // ★ baseline L442-L580 确定性审核模式：LLM 失败时 fallback 启发式打分，
        //   不让整条 pipeline 因 Reviewer LLM 失效崩溃。
        this.logger.warn(
          `[${identity.missionId}] AG-04-SR failed at ${section.sectionId}: ${res.errors?.join("; ") ?? "unknown"} — fallback to deterministic scoring`,
        );
        reviews.push(this.buildDeterministicReview(section));
        continue;
      }
      reviews.push(res.output);
    }

    // ★ baseline determineRevisionTargets：把 section review 分数聚合到 dim 级，
    //   应用硬阈值（overall<60, evidence<40, depth<35, breadth<35, coherence<30），
    //   round >= 2 直接不 revise（硬上限）
    const dimReviews = this.aggregateReviewsByDimension(reviews);
    const completedTasks = await this.loadDimensionResearchTasks(
      identity.missionId,
    );
    const decision = determineRevisionTargets(
      dimReviews,
      completedTasks,
      revisionRound,
    );
    if (decision.needsRevision) {
      this.logger.log(
        `[${identity.missionId}] Round ${revisionRound}: ${decision.targets.length} dim(s) need revision`,
      );
    }

    return {
      reviews,
      revisionTargets: decision.targets,
      revisionRound,
    };
  }

  /**
   * 按 dimensionId 聚合 section 级 review，产出 dim 级 DimensionReviewLite。
   * scores 做平均（避免单个 section 低分拖整 dim；单个极差 section 由 remediation 处理）。
   */
  private aggregateReviewsByDimension(
    reviews: ReadonlyArray<SectionReview>,
  ): DimensionReviewLite[] {
    const byDim = new Map<
      string,
      {
        overallSum: number;
        evidenceSum: number;
        depthSum: number;
        coherenceSum: number;
        accuracySum: number;
        completenessSum: number;
        count: number;
        suggestions: string[];
      }
    >();

    for (const r of reviews) {
      // sectionId 前缀 "<dimId>-s-N" — 从 sectionId 反查 dimensionId 不稳，
      // 我们借 SectionReview schema 没带 dimensionId 的事实：直接跳过聚合退化场景
      // （stub 场景或上游丢字段）→ 后续 orchestrator 可自己跑 re-research decision。
      const dimId = this.extractDimensionId(r.sectionId);
      if (!dimId) continue;

      let acc = byDim.get(dimId);
      if (!acc) {
        acc = {
          overallSum: 0,
          evidenceSum: 0,
          depthSum: 0,
          coherenceSum: 0,
          accuracySum: 0,
          completenessSum: 0,
          count: 0,
          suggestions: [],
        };
        byDim.set(dimId, acc);
      }
      acc.overallSum += r.overallScore * 10; // SectionReview 打分 0-10，转 0-100
      acc.evidenceSum += r.scores.evidenceQuality * 10;
      acc.depthSum += r.scores.depth * 10;
      acc.coherenceSum += r.scores.coherence * 10;
      acc.accuracySum += r.scores.accuracy * 10;
      acc.completenessSum += r.scores.completeness * 10;
      acc.count += 1;
      acc.suggestions.push(...r.revisionInstructions);
    }

    const result: DimensionReviewLite[] = [];
    for (const [dimensionId, acc] of byDim.entries()) {
      const n = Math.max(1, acc.count);
      result.push({
        dimensionId,
        overallScore: acc.overallSum / n,
        scores: {
          evidence: acc.evidenceSum / n,
          depth: acc.depthSum / n,
          breadth: acc.completenessSum / n, // completeness → breadth
          coherence: acc.coherenceSum / n,
        },
        suggestions: acc.suggestions.slice(0, 10),
      });
    }
    return result;
  }

  /**
   * baseline L442-L580 确定性 fallback。把 section 的 content/keyFindings 喂给
   * scoreDeterministically，构造符合 SectionReviewSchema 的记录。
   */
  private buildDeterministicReview(section: {
    sectionId: string;
    dimensionId: string;
    content: string;
    wordCount: number;
    keyFindings: ReadonlyArray<{
      statement: string;
      evidenceRefs: ReadonlyArray<string>;
    }>;
  }): SectionReview {
    const res = scoreDeterministically({
      contentLength: section.content.length,
      keyFindingsCount: section.keyFindings.length,
      evidenceCount: section.keyFindings.reduce(
        (sum, k) => sum + k.evidenceRefs.length,
        0,
      ),
      hasSummary: section.content.length > 0,
      hasConfidenceLevel: false,
    });
    // SectionReview scores 是 0-10 量纲；confidentScore 是 0-100 量纲 → /10
    const to10 = (n: number) => Math.round((n / 10) * 10) / 10;
    return {
      sectionId: section.sectionId,
      overallScore: to10(res.overallScore),
      scores: {
        accuracy: to10(res.scores.coherence),
        completeness: to10(res.scores.breadth),
        coherence: to10(res.scores.coherence),
        evidenceQuality: to10(res.scores.evidence),
        depth: to10(res.scores.depth),
      },
      needsRevision:
        res.qualityLevel === "needs_revision" ||
        res.qualityLevel === "rejected",
      revisionInstructions: res.issues.map((i) => i.description),
      issues: res.issues.map((i) => i.description),
      claims: section.keyFindings.map((f, idx) => ({
        id: `${section.sectionId}-c-${idx}`,
        statement: f.statement,
        evidenceRefs: [...f.evidenceRefs],
      })),
    };
  }

  private extractDimensionId(sectionId: string): string | null {
    // st-03 生成格式 `${dim.id}-s-${n}`；反向提取
    const m = /^(.+?)-s-\d+$/.exec(sectionId);
    return m ? m[1] : null;
  }

  private async readRevisionRound(missionId: string): Promise<number> {
    if (!this.prisma) return 1;
    try {
      const task = await this.prisma.researchTask.findFirst({
        where: { missionId, taskType: "dimension_research" },
        select: { description: true },
      });
      return parseRevisionRound(task?.description);
    } catch {
      return 1;
    }
  }

  private async loadDimensionResearchTasks(
    missionId: string,
  ): Promise<Array<{ id: string; dimensionId: string | null }>> {
    if (!this.prisma) return [];
    try {
      return await this.prisma.researchTask.findMany({
        where: { missionId, taskType: "dimension_research" },
        select: { id: true, dimensionId: true },
      });
    } catch {
      return [];
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async persist(
    _identity: PipelineIdentityContext,
    _output: ReviewStageOutput,
  ): Promise<void> {
    // Group E: 写 SectionReview 表（如有），或合并进 TopicReportSection.review
  }
}
