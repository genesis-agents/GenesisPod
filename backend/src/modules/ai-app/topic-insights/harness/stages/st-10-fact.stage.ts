/**
 * ST-10-FACT · 事实核查（thorough+ only）
 *
 * 调 AG-07-FC 对 synthesis 产物 + claims + evidence summaries 做事实核查。
 * 并行于 ST-08-QGATE 与 ST-09-EVAL（都依赖 ST-07-SYNTH）。
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  HarnessAgentRegistry,
  type FactCheckerInput,
  type FactCheckReport,
} from "../agents";
import type {
  PipelineIdentityContext,
  Stage,
  StageResults,
} from "../pipeline/types";
import type {
  FactCheckStageOutput,
  ReviewStageOutput,
  SynthStageOutput,
} from "./stage-context";

export interface FactCheckStageInput {
  readonly synthesis: SynthStageOutput["synthesis"];
  readonly reviews: ReviewStageOutput["reviews"];
}

@Injectable()
export class FactCheckStage implements Stage<
  FactCheckStageInput,
  FactCheckStageOutput
> {
  private readonly logger = new Logger(FactCheckStage.name);
  readonly id = "ST-10-FACT" as const;
  readonly name = "Fact check";
  readonly dependsOn = ["ST-07-SYNTH" as const];
  readonly runsWhen = "thoroughOrDeep" as const;
  readonly slo = {
    p95Ms: 180_000,
    tokenBudget: 30_000,
    targetSuccessRate: 0.9,
  };
  readonly emitsEvents = ["fact:check_completed"];

  constructor(
    private readonly agentRegistry: HarnessAgentRegistry,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async prepare(
    _identity: PipelineIdentityContext,
    upstream: StageResults,
  ): Promise<FactCheckStageInput> {
    const synth = upstream.get<SynthStageOutput>("ST-07-SYNTH");
    const reviews = upstream.get<ReviewStageOutput>("ST-04-REVIEW");
    return { synthesis: synth.synthesis, reviews: reviews.reviews };
  }

  async execute(
    identity: PipelineIdentityContext,
    input: FactCheckStageInput,
    signal: AbortSignal,
  ): Promise<FactCheckStageOutput> {
    const runner = this.agentRegistry.mustGet<
      FactCheckerInput,
      FactCheckReport
    >("AG-07-FC");

    // 汇总所有 section reviews 的 claims
    const allClaims = input.reviews.flatMap((r) =>
      r.claims.map((c) => ({
        id: c.id,
        statement: c.statement,
        evidenceIds: c.evidenceRefs,
      })),
    );

    // 拉 evidence summaries（真 DB 读）
    let evidenceSummaries: Array<{
      id: string;
      title: string;
      snippet: string;
    }> = [];
    if (this.prisma) {
      try {
        const rows = await this.prisma.topicEvidence.findMany({
          where: { reportId: identity.reportId },
          select: { id: true, title: true, snippet: true },
          take: 20,
        });
        evidenceSummaries = rows.map((r) => ({
          id: r.id,
          title: r.title,
          snippet: r.snippet ?? "",
        }));
      } catch (err) {
        this.logger.warn(
          `evidence lookup failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (allClaims.length === 0) {
      return {
        accuracyScore: 10,
        issueCount: 0,
        overallAssessment: "no claims extracted — fact check skipped",
      };
    }

    const res = await runner.run({
      input: {
        missionId: identity.missionId,
        reportContent: input.synthesis.fullMarkdown,
        allClaims,
        evidenceSummaries,
      },
      identity,
      signal,
    });

    return {
      accuracyScore: res.output.accuracyScore,
      issueCount: res.output.issuesByClaim.length,
      overallAssessment: res.output.overallAssessment,
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async persist(
    _identity: PipelineIdentityContext,
    _output: FactCheckStageOutput,
  ): Promise<void> {
    // 合并到 qualityTrace（由 ST-13 写入）
  }
}
