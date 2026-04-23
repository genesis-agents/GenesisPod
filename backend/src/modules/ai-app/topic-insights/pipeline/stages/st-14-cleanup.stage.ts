/**
 * ST-14-CLEANUP · 清理与回填（Enhancement Tier）
 *
 * 职责（H-3 合并完成）：
 * - TopicEvidence.analysisId 回填：ST-02 写入 evidence 时 analysisId=null，
 *   ST-05 创建 DimensionAnalysis 后，通过 (reportId, dimensionId) 匹配回填
 * - Prompt cache 释放（当前 no-op，真实 PromptCacheCoordinator 接入时补）
 * - 审计日志（已由 ResearchEventEmitter 的 stage:completed 事件覆盖）
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import type { PipelineIdentityContext, Stage, StageResults } from "../types";
import type {
  CleanupStageOutput,
  IntegrateStageOutput,
  ResearchStageOutput,
} from "./stage-context";

export interface CleanupStageInput {
  readonly integrate: IntegrateStageOutput;
  readonly research: ResearchStageOutput;
}

@Injectable()
export class CleanupStage implements Stage<
  CleanupStageInput,
  CleanupStageOutput
> {
  private readonly logger = new Logger(CleanupStage.name);
  readonly id = "ST-14-CLEANUP" as const;
  readonly name = "Cleanup + evidence analysisId backfill";
  readonly dependsOn = ["ST-13-PERSIST" as const];
  readonly runsWhen = "always" as const;
  readonly slo = { p95Ms: 2_000, tokenBudget: 0, targetSuccessRate: 0.99 };
  readonly emitsEvents = ["cleanup:completed"];

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async prepare(
    _identity: PipelineIdentityContext,
    upstream: StageResults,
  ): Promise<CleanupStageInput> {
    return {
      integrate: upstream.get<IntegrateStageOutput>("ST-05-INTEGRATE"),
      research: upstream.get<ResearchStageOutput>("ST-02-RESEARCH"),
    };
  }

  async execute(
    identity: PipelineIdentityContext,
    input: CleanupStageInput,
    _signal: AbortSignal,
  ): Promise<CleanupStageOutput> {
    if (!this.prisma) {
      return { analysisIdBackfilled: 0, cacheReleased: true };
    }

    // 构造 dimensionId → analysisId 映射（ST-05 刚创建的 DimensionAnalysis）
    const analyses = await this.prisma.dimensionAnalysis
      .findMany({
        where: {
          reportId: identity.reportId,
          dimensionId: {
            in: input.integrate.dimensionMetas.map((m) => m.dimensionId),
          },
        },
        select: { id: true, dimensionId: true },
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `dimensionAnalysis.findMany failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return [] as Array<{ id: string; dimensionId: string }>;
      });

    const analysisByDim = new Map(analyses.map((a) => [a.dimensionId, a.id]));

    let totalBackfilled = 0;
    for (const outcome of input.research.byDimension) {
      const analysisId = analysisByDim.get(outcome.dimensionId);
      if (!analysisId || outcome.evidenceIds.length === 0) continue;
      try {
        const res = await this.prisma.topicEvidence.updateMany({
          where: {
            id: { in: [...outcome.evidenceIds] },
            analysisId: null, // 只回填尚未挂的
          },
          data: { analysisId },
        });
        totalBackfilled += res.count;
      } catch (err) {
        this.logger.warn(
          `analysisId backfill dim=${outcome.dimensionId} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.logger.log(
      `cleanup done: analysisId backfilled=${totalBackfilled} evidence row(s)`,
    );

    return {
      analysisIdBackfilled: totalBackfilled,
      cacheReleased: true, // 真实 cache release 接 PromptCacheCoordinator 时补
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async persist(
    _identity: PipelineIdentityContext,
    _output: CleanupStageOutput,
  ): Promise<void> {
    // 幂等契约占位（cleanup 本身就是副作用操作）
  }
}
