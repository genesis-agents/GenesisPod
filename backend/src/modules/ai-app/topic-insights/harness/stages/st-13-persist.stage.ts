/**
 * ST-13-PERSIST · 最终持久化（Enhancement Tier）
 *
 * 依赖 ST-11-ASM（或 ST-12-LATEX 若将来接入）的最终 markdown。
 * 职责：
 * - 从 DB 聚合 totalSources / totalTokens / totalDimensions
 * - 更新 ResearchMission.totalTasks / completedTasks / progressPercent=100
 * - 把 qualityTrace（含 ST-08 结果）写到 TopicReport.qualityTrace
 * - 标记 mission COMPLETED 已在 mission-execution.runWithHarness 外层做；
 *   此处只负责 report 级的指标补全
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { toPrismaJson } from "@/common/utils/prisma-json.utils";
import type {
  PipelineIdentityContext,
  Stage,
  StageResults,
} from "../pipeline/types";
import type {
  AssemblyStageOutput,
  PersistStageOutput,
  QualityGateStageOutput,
} from "./stage-context";

export interface PersistStageInput {
  readonly assembly: AssemblyStageOutput;
  readonly qualityGate?: QualityGateStageOutput;
  readonly startedAt: number;
}

@Injectable()
export class PersistStage implements Stage<
  PersistStageInput,
  PersistStageOutput
> {
  private readonly logger = new Logger(PersistStage.name);
  readonly id = "ST-13-PERSIST" as const;
  readonly name = "Final persistence";
  readonly dependsOn = ["ST-11-ASM" as const];
  readonly runsWhen = "always" as const;
  readonly slo = { p95Ms: 5_000, tokenBudget: 0, targetSuccessRate: 0.99 };
  readonly emitsEvents = ["persist:completed"];

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async prepare(
    _identity: PipelineIdentityContext,
    upstream: StageResults,
  ): Promise<PersistStageInput> {
    const assembly = upstream.get<AssemblyStageOutput>("ST-11-ASM");
    const qualityGate = upstream.has("ST-08-QGATE")
      ? upstream.get<QualityGateStageOutput>("ST-08-QGATE")
      : undefined;
    return {
      assembly,
      qualityGate,
      startedAt: Date.now(), // 近似值；无 ST-00-INIT 时间戳可用
    };
  }

  async execute(
    identity: PipelineIdentityContext,
    input: PersistStageInput,
    _signal: AbortSignal,
  ): Promise<PersistStageOutput> {
    if (!this.prisma) {
      // 测试模式
      return {
        reportId: identity.reportId,
        totalTokens: identity.budget.snapshot().tokensUsed,
        totalSources: 0,
        totalDimensions: input.assembly.sectionCount,
        generationTimeMs: Date.now() - input.startedAt,
      };
    }

    // 聚合来源数量（TopicEvidence 表 count）
    const totalSources = await this.prisma.topicEvidence.count({
      where: { reportId: identity.reportId },
    });

    const totalTokens = identity.budget.snapshot().tokensUsed;

    // 更新 TopicReport 指标 + qualityTrace
    await this.prisma.topicReport
      .update({
        where: { id: identity.reportId },
        data: {
          totalSources,
          totalTokens,
          totalDimensions: input.assembly.sectionCount,
          generationTimeMs: Date.now() - input.startedAt,
          qualityTrace: toPrismaJson({
            gate: input.qualityGate ?? null,
            budget: identity.budget.snapshot(),
            degradationMode: identity.degradationMode,
          }),
        },
      })
      .catch((err: unknown) =>
        this.logger.warn(
          `TopicReport update failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );

    // 更新 ResearchMission 进度
    await this.prisma.researchMission
      .update({
        where: { id: identity.missionId },
        data: {
          completedTasks: input.assembly.sectionCount,
          progressPercent: 100,
        },
      })
      .catch((err: unknown) =>
        this.logger.warn(
          `ResearchMission update failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );

    return {
      reportId: identity.reportId,
      totalTokens,
      totalSources,
      totalDimensions: input.assembly.sectionCount,
      generationTimeMs: Date.now() - input.startedAt,
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async persist(
    _identity: PipelineIdentityContext,
    _output: PersistStageOutput,
  ): Promise<void> {
    // 已在 execute 内部做真实写入，此处保持幂等契约
  }
}
