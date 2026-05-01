/**
 * CtxHydratorService — 从 DB 重建 MissionContext 给单 stage 局部重跑用
 *
 * 局部重跑不跑 S1-S2-S3 等上游 stage，但下游 stage 需要 ctx 里的 plan / researcherResults /
 * reconciliationReport / reportArtifact / verdicts 等已经存在的产物。
 *
 * 本服务从 agent_playground_missions 行读出这些字段，重新组装成 MissionContext
 * 让 stage 函数看上去和正常 mission 流程没差别。
 *
 * 限制：
 *   - 装配阶段的 leader / billing / pool / abortRegistry / budgetMultiplier 不能从 DB 重建
 *   - 调用方需要自己 supply 这些 ctx 字段（通常是 minimal stub 或 mission 子集）
 *   - userProfile 必须存在（mission create 时就写了），用于重建 input
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { MissionContext } from "../workflow/mission-context";
import { MissionStore } from "../lifecycle/mission-store.service";
import type {
  RunMissionInput,
  ResearchReport,
} from "../../../dto/run-mission.dto";
import type { ReportArtifact } from "@/modules/ai-harness/facade";

/**
 * Hydrated ctx 提供给 stage 函数 —— 缺装配期纯 runtime 字段（leader/billing/pool 等），
 * 那些由调用方按需补 stub。stage 函数若实际访问这些字段会运行时 throw（提示设计错误）。
 */
export type HydratedMissionContext = Omit<
  MissionContext,
  "billing" | "pool" | "leader" | "budgetMultiplier" | "t0"
> & {
  /** 重跑场景下 t0 重置为 rerun 启动时间 */
  readonly t0: number;
  /** 标识此 ctx 来自 hydrate 而非装配 —— 调用方决策时可读 */
  readonly __hydrated: true;
};

@Injectable()
export class CtxHydratorService {
  private readonly log = new Logger(CtxHydratorService.name);

  constructor(private readonly store: MissionStore) {}

  async hydrate(
    missionId: string,
    userId: string,
  ): Promise<HydratedMissionContext> {
    const detail = await this.store.getById(missionId, userId);
    if (!detail) {
      throw new NotFoundException(
        `mission ${missionId} not found or not owned by ${userId}`,
      );
    }
    if (detail.status === "running") {
      throw new Error(
        `mission ${missionId} is still running — cannot rerun while in flight`,
      );
    }

    const userProfile =
      (detail.userProfile as Partial<RunMissionInput> | null) ?? {};

    // 重建 input（local-rerun 必须沿用原 mission 配置，不允许调用方自定义档位）
    const input: RunMissionInput = {
      topic: detail.topic,
      depth: (userProfile.depth ??
        (["quick", "standard", "deep"].includes(detail.depth)
          ? detail.depth
          : "deep")) as RunMissionInput["depth"],
      language: (userProfile.language ??
        (detail.language === "en-US"
          ? "en-US"
          : "zh-CN")) as RunMissionInput["language"],
      budgetProfile: userProfile.budgetProfile ?? "medium",
      styleProfile: userProfile.styleProfile ?? "executive",
      lengthProfile: userProfile.lengthProfile ?? "standard",
      audienceProfile: userProfile.audienceProfile ?? "domain-expert",
      withFigures: userProfile.withFigures ?? true,
      auditLayers: userProfile.auditLayers ?? "default",
      concurrency: userProfile.concurrency ?? 3,
      viewMode: userProfile.viewMode ?? "continuous",
      maxCredits: 100, // 局部重跑 credit 上限（远小于 fresh mission）
    };

    const reportFull = detail.reportFull as Record<string, unknown> | null;
    let reportArtifact: ReportArtifact | undefined;
    let report: ResearchReport | undefined;
    if (detail.reportArtifactVersion === 2 && reportFull) {
      reportArtifact = reportFull as unknown as ReportArtifact;
    } else if (reportFull) {
      report = reportFull as unknown as ResearchReport;
    }

    const dimensions =
      (detail.dimensions as
        | NonNullable<MissionContext["plan"]>["dimensions"]
        | null) ?? [];
    const themeSummary = detail.themeSummary ?? "";

    type LeaderVerdict = "excellent" | "good" | "acceptable" | "failed";
    const leaderVerdict =
      (detail.leaderVerdict as LeaderVerdict | null) ?? null;

    const ctx: HydratedMissionContext = {
      __hydrated: true,
      missionId,
      userId,
      input,
      t0: Date.now(),
      plan: {
        themeSummary,
        dimensions,
        // 局部重跑不需要重新规划 goals/risks —— cast undefined（plan 仅给 stage 看 dim/themeSummary）
        goals: undefined as unknown as NonNullable<
          MissionContext["plan"]
        >["goals"],
        initialRisks: undefined as unknown as NonNullable<
          MissionContext["plan"]
        >["initialRisks"],
      },
      // researcherResults 没单独存 DB 字段（融在 reportArtifact.sections 里）
      researcherResults: undefined,
      reconciliationReport:
        detail.reconciliationReport as MissionContext["reconciliationReport"],
      report,
      reportArtifact,
      reviewScore:
        typeof detail.finalScore === "number" ? detail.finalScore : undefined,
      verifierVerdicts: (detail.verdicts as unknown[] | null) ?? undefined,
      leaderSignOff:
        detail.leaderSigned !== null && leaderVerdict !== null
          ? {
              phase: "signoff",
              signed: detail.leaderSigned ?? false,
              leaderOverallScore: detail.leaderOverallScore ?? 0,
              leaderVerdict,
              accountabilityNote: "",
            }
          : undefined,
      trajectoryStored: detail.trajectoryStored ?? undefined,
    };

    this.log.log(
      `[hydrate ${missionId}] artifactVersion=${detail.reportArtifactVersion} sections=${reportArtifact?.sections.length ?? 0} dimensions=${dimensions.length} verdicts=${(detail.verdicts as unknown[] | null)?.length ?? 0}`,
    );
    return ctx;
  }
}
