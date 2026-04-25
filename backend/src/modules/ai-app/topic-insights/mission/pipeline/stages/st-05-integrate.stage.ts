/**
 * ST-05-INTEGRATE · Dimension 合并 + meta 提取
 *
 * 每个维度：把 section 正文拼接 + 调 AG-05-ME 出 DimensionMeta。
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { toPrismaJson } from "@/common/utils/prisma-json.utils";
import { SpecAgentRegistry } from "@/modules/ai-engine/facade";
import type { MetaExtractorInput } from "@/modules/ai-app/topic-insights/agents/specs";
import type { DimensionMeta } from "@/modules/ai-app/topic-insights/agents/specs/schemas";
import { assembleSectionsWithPromotedConclusion } from "@/modules/ai-app/topic-insights/shared/utils/promote-opening-conclusion.utils";
import type { PipelineIdentityContext, Stage, StageResults } from "../types";
import type {
  IntegrateStageOutput,
  ResearchStageOutput,
  ReviewStageOutput,
  WriteStageOutput,
} from "./stage-context";

export interface IntegrateStageInput {
  readonly write: WriteStageOutput;
  readonly research: ResearchStageOutput;
}

@Injectable()
export class IntegrateStage implements Stage<
  IntegrateStageInput,
  IntegrateStageOutput
> {
  readonly id = "ST-05-INTEGRATE" as const;
  readonly name = "Dimension integrate + meta";
  // ST-04-REVIEW 可能产出 remediatedSections，ST-05 消费的是 remediated content
  readonly dependsOn = ["ST-04-REVIEW" as const];
  readonly runsWhen = "always" as const;
  readonly slo = {
    p95Ms: 60_000,
    tokenBudget: 10_000,
    targetSuccessRate: 0.95,
  };
  readonly emitsEvents = ["dimension:integrated"];

  private readonly logger = new Logger(IntegrateStage.name);

  constructor(
    private readonly agentRegistry: SpecAgentRegistry,
    private readonly prisma: PrismaService,
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async prepare(
    _identity: PipelineIdentityContext,
    upstream: StageResults,
  ): Promise<IntegrateStageInput> {
    const write = upstream.get<WriteStageOutput>("ST-03-WRITE");
    const review = this.tryGetReview(upstream);

    // ★ 如果 ST-04-REVIEW 产出了 remediatedSections，按 sectionId 覆盖原 section
    //   content，让 INTEGRATE 消费修订后的内容。baseline section-writer QC loop 对齐。
    const sections =
      review && review.remediatedSections.length > 0
        ? this.mergeRemediated(write.sections, review.remediatedSections)
        : write.sections;

    return {
      write: { sections },
      research: upstream.get<ResearchStageOutput>("ST-02-RESEARCH"),
    };
  }

  private tryGetReview(upstream: StageResults): ReviewStageOutput | null {
    try {
      return upstream.get<ReviewStageOutput>("ST-04-REVIEW");
    } catch {
      return null;
    }
  }

  private mergeRemediated(
    original: WriteStageOutput["sections"],
    remediated: ReviewStageOutput["remediatedSections"],
  ): WriteStageOutput["sections"] {
    const byId = new Map(remediated.map((s) => [s.sectionId, s]));
    return original.map((s) => byId.get(s.sectionId) ?? s);
  }

  async execute(
    identity: PipelineIdentityContext,
    input: IntegrateStageInput,
    signal: AbortSignal,
  ): Promise<IntegrateStageOutput> {
    const runner = this.agentRegistry.get<MetaExtractorInput, DimensionMeta>(
      "AG-05-ME",
    );
    if (!runner)
      throw new Error("AG-05-ME not registered in SpecAgentRegistry");

    // 按维度聚合 section（保留 title + content 以支持 "开篇即结论" 提升）
    const sectionsByDim = new Map<
      string,
      Array<{ title: string; content: string }>
    >();
    for (const s of input.write.sections) {
      let arr = sectionsByDim.get(s.dimensionId);
      if (!arr) {
        arr = [];
        sectionsByDim.set(s.dimensionId, arr);
      }
      arr.push({ title: s.title, content: s.content });
    }

    const evidenceCountByDim = new Map(
      input.research.byDimension.map((d) => [d.dimensionId, d.evidenceCount]),
    );

    const metas: DimensionMeta[] = [];
    for (const [dimensionId, sections] of sectionsByDim.entries()) {
      if (signal.aborted) {
        throw new DOMException(`[${this.id}] aborted`, "AbortError");
      }
      const dim = input.research.byDimension.find(
        (d) => d.dimensionId === dimensionId,
      );
      // ★ baseline Direction B：首节 > **核心判断** 提升到 ### 标题前
      const integratedMarkdown =
        assembleSectionsWithPromotedConclusion(sections);
      const res = await runner.executeSpec(
        {
          dimensionId,
          dimensionName: dim?.dimensionName ?? dimensionId,
          integratedSections: integratedMarkdown,
          evidenceCount: evidenceCountByDim.get(dimensionId) ?? 0,
        },
        identity.capabilities?.env,
      );
      if (res.state !== "completed") {
        // ★ P0 修复：MetaExtractor 失败不阻断 pipeline，产占位 meta 保留 ST-07 可跑
        this.logger.warn(
          `[${identity.missionId}] AG-05-ME failed at ${dimensionId}: ${res.errors?.join("; ") ?? "unknown"} — inserting placeholder meta`,
        );
        metas.push({
          dimensionId,
          dimensionName: dim?.dimensionName ?? dimensionId,
          summary: `本维度元数据提取失败（${res.errors?.[0] ?? "unknown"}）。内容已采集但未能提炼关键发现。`,
          keyFindings: ["维度元数据提取失败"],
          trends: [],
          challenges: [],
          opportunities: [],
          evidenceCount: evidenceCountByDim.get(dimensionId) ?? 0,
        });
        continue;
      }
      metas.push(res.output);
    }

    return { dimensionMetas: metas };
  }

  async persist(
    identity: PipelineIdentityContext,
    output: IntegrateStageOutput,
  ): Promise<void> {
    // ★ Group G-1 起，meta.dimensionId 是真 TopicDimension.id（ST-01-PLAN
    // persist 已回写），FK 不再违约。
    for (const meta of output.dimensionMetas) {
      await this.prisma.dimensionAnalysis.create({
        data: {
          dimensionId: meta.dimensionId,
          reportId: identity.reportId,
          summary: meta.summary,
          keyFindings: toPrismaJson(meta.keyFindings),
          sourcesUsed: meta.evidenceCount,
          modelUsed: null,
        },
      });
    }
  }
}
