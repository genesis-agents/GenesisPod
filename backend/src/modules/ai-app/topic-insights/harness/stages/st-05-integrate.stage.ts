/**
 * ST-05-INTEGRATE · Dimension 合并 + meta 提取
 *
 * 每个维度：把 section 正文拼接 + 调 AG-05-ME 出 DimensionMeta。
 */

import { Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { toPrismaJson } from "@/common/utils/prisma-json.utils";
import {
  HarnessAgentRegistry,
  type DimensionMeta,
  type MetaExtractorInput,
} from "../agents";
import type {
  PipelineIdentityContext,
  Stage,
  StageResults,
} from "../pipeline/types";
import type {
  IntegrateStageOutput,
  ResearchStageOutput,
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
  readonly dependsOn = ["ST-04-REVIEW" as const];
  readonly runsWhen = "always" as const;
  readonly slo = {
    p95Ms: 60_000,
    tokenBudget: 10_000,
    targetSuccessRate: 0.95,
  };
  readonly emitsEvents = ["dimension:integrated"];

  constructor(
    private readonly agentRegistry: HarnessAgentRegistry,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async prepare(
    _identity: PipelineIdentityContext,
    upstream: StageResults,
  ): Promise<IntegrateStageInput> {
    return {
      write: upstream.get<WriteStageOutput>("ST-03-WRITE"),
      research: upstream.get<ResearchStageOutput>("ST-02-RESEARCH"),
    };
  }

  async execute(
    identity: PipelineIdentityContext,
    input: IntegrateStageInput,
    signal: AbortSignal,
  ): Promise<IntegrateStageOutput> {
    const runner = this.agentRegistry.mustGet<
      MetaExtractorInput,
      DimensionMeta
    >("AG-05-ME");

    // 按维度聚合 section 正文
    const sectionsByDim = new Map<string, string[]>();
    for (const s of input.write.sections) {
      let arr = sectionsByDim.get(s.dimensionId);
      if (!arr) {
        arr = [];
        sectionsByDim.set(s.dimensionId, arr);
      }
      arr.push(s.content);
    }

    const evidenceCountByDim = new Map(
      input.research.byDimension.map((d) => [d.dimensionId, d.evidenceCount]),
    );

    const metas: DimensionMeta[] = [];
    for (const [dimensionId, contents] of sectionsByDim.entries()) {
      if (signal.aborted) {
        throw new DOMException(`[${this.id}] aborted`, "AbortError");
      }
      const dim = input.research.byDimension.find(
        (d) => d.dimensionId === dimensionId,
      );
      const res = await runner.run({
        input: {
          dimensionId,
          dimensionName: dim?.dimensionName ?? dimensionId,
          integratedSections: contents.join("\n\n---\n\n"),
          evidenceCount: evidenceCountByDim.get(dimensionId) ?? 0,
        },
        identity,
        signal,
      });
      metas.push(res.output);
    }

    return { dimensionMetas: metas };
  }

  async persist(
    identity: PipelineIdentityContext,
    output: IntegrateStageOutput,
  ): Promise<void> {
    if (!this.prisma) return;

    // 每个 dimensionMeta 写一条 DimensionAnalysis。
    // dimensionId 当前是 harness 内部 id（`${missionId}-dim-N`），真 prod
    // 应该映射到 TopicDimension 表的 id — 这里先 upsert 按 harness id 存，
    // Enhancement Tier 后续统一做 ID mapping。
    for (const meta of output.dimensionMetas) {
      await this.prisma.dimensionAnalysis
        .create({
          data: {
            dimensionId: meta.dimensionId,
            reportId: identity.reportId,
            summary: meta.summary,
            keyFindings: toPrismaJson(meta.keyFindings),
            sourcesUsed: meta.evidenceCount,
            modelUsed: null,
          },
        })
        .catch((err: unknown) => {
          // dimensionId 不在 TopicDimension 表时会 FK 违约 — 当前骨架
          // 允许 skip，Enhancement Tier 接 ID mapping 后去掉 catch
          void err;
        });
    }
  }
}
