/**
 * MissionUpdateHelper — 用户主动修改 mission 元数据
 * （updateTopicByUser / updateBudgetByUser / resetFields / markRerunPatch /
 *  markIntermediateState 及内部 _runMissionUpdate）。
 *
 * 普通 class（非 @Injectable），由 MissionStore 在 constructor 内 new。
 */

import { Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../../../common/prisma/prisma.service";
import { applyInputPatch } from "@/modules/ai-harness/facade";
import type { PlaygroundConfigSnapshot } from "../rerun/playground-mission-input-rebuilder.service";

export class MissionUpdateHelper {
  private readonly log = new Logger(MissionUpdateHelper.name);

  constructor(private readonly prisma: PrismaService) {}

  async updateTopicByUser(
    id: string,
    userId: string,
    topic: string,
  ): Promise<void> {
    await this.prisma.agentPlaygroundMission
      .updateMany({
        where: { id, userId },
        data: { topic: topic.slice(0, 500) },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[updateTopicByUser ${id}] failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  async updateBudgetByUser(
    id: string,
    userId: string,
    patch: {
      maxCredits?: number;
      wallTimeCapMs?: number;
      budgetMultiplierOverride?: number;
    },
  ): Promise<{ ok: boolean; reason?: string }> {
    const row = await this.prisma.agentPlaygroundMission.findFirst({
      where: { id, userId },
      select: {
        id: true,
        status: true,
        configSnapshot: true,
      },
    });
    if (!row) return { ok: false, reason: "not_found" };
    const NON_TERMINAL = new Set(["running", "queued", "pending"]);
    if (NON_TERMINAL.has(row.status)) {
      return { ok: false, reason: "non_terminal_status" };
    }
    const data: Record<string, unknown> = {};
    if (typeof patch.maxCredits === "number")
      data.maxCredits = patch.maxCredits;
    // ★ S4b:不再写 userProfile(configSnapshot 单一真源)。预算改动只更 maxCredits 列(权威显示)
    //   + 派生新 snapshot(下面)。userProfile 由 getById 读时从 snapshot 投影。
    // ★ C5/G7 S4 + G2 治理:预算改动**必须重写 versioned snapshot**,否则 rerun 读旧 snapshot
    //   预算(S3 切读 snapshot 后,只更 userProfile/列 → rerun 用不到改后预算)。走 applyInputPatch
    //   派生 settings_patch 新版本(budget 经 ResolvedBudgetCaps re-resolve,不硬编码换算)。
    const snap = row.configSnapshot as PlaygroundConfigSnapshot | null;
    if (snap?.schemaVersion != null) {
      const budgetOverride =
        typeof patch.maxCredits === "number" ||
        typeof patch.budgetMultiplierOverride === "number"
          ? {
              maxCredits: patch.maxCredits,
              budgetMultiplier: patch.budgetMultiplierOverride,
            }
          : undefined;
      const runtimeLimitsOverride =
        typeof patch.wallTimeCapMs === "number"
          ? { wallTimeCapMs: patch.wallTimeCapMs }
          : undefined;
      const next = applyInputPatch(
        snap,
        { budgetOverride, runtimeLimitsOverride },
        { snapshotId: randomUUID(), mutationReason: "settings_patch" },
      );
      data.configSnapshot = next as unknown as Prisma.InputJsonValue;
    }
    if (Object.keys(data).length === 0) {
      return { ok: false, reason: "empty_patch" };
    }
    try {
      const res = await this.prisma.agentPlaygroundMission.updateMany({
        where: { id, userId },
        data,
      });
      if (res.count === 0) {
        return { ok: false, reason: "no_row_updated" };
      }
      return { ok: true };
    } catch (err) {
      this.log.warn(
        `[updateBudgetByUser ${id}] update failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        ok: false,
        reason: `db_error: ${err instanceof Error ? err.message.slice(0, 200) : "unknown"}`,
      };
    }
  }

  async resetFields(
    missionId: string,
    fields: ReadonlyArray<string>,
    userId?: string,
  ): Promise<void> {
    if (fields.length === 0) return;
    const camelMap: Record<string, string> = {
      report_full: "reportFull",
      report_artifact_version: "reportArtifactVersion",
      completed_at: "completedAt",
      final_score: "finalScore",
      status: "status",
      error_message: "errorMessage",
      dimensions: "dimensions",
      theme_summary: "themeSummary",
      reconciliation_report: "reconciliationReport",
      verdicts: "verdicts",
      leader_journal: "leaderJournal",
      leader_signed: "leaderSigned",
      leader_overall_score: "leaderOverallScore",
      leader_verdict: "leaderVerdict",
      outline_plan: "outlinePlan",
      analyst_output: "analystOutput",
      tokens_used: "tokensUsed",
      cost_usd: "costUsd",
      trajectory_stored: "trajectoryStored",
      last_completed_stage: "lastCompletedStage",
      max_credits: "maxCredits",
    };
    const data: Record<string, null> = {};
    for (const f of fields) {
      if (f === "status") continue;
      const camel = camelMap[f];
      if (camel) data[camel] = null;
    }
    if (Object.keys(data).length === 0) return;
    await this._runMissionUpdate(
      missionId,
      userId,
      data as Prisma.AgentPlaygroundMissionUpdateInput,
      "resetFields",
    );
  }

  async markRerunPatch(
    id: string,
    patch: {
      themeSummary?: string;
      dimensions?: unknown;
      reportFull?: unknown;
      verdicts?: unknown;
      reportArtifactVersion?: number;
      reconciliationReport?: unknown;
      leaderOverallScore?: number;
      leaderSigned?: boolean;
      leaderVerdict?: string;
      finalScore?: number;
      tokensUsed?: number;
      costUsd?: number;
      reportTitle?: string;
      reportSummary?: string;
    },
    userId?: string,
  ): Promise<void> {
    const update: Prisma.AgentPlaygroundMissionUpdateInput = {};
    if (patch.themeSummary !== undefined)
      update.themeSummary = patch.themeSummary;
    if (patch.dimensions !== undefined)
      update.dimensions = (patch.dimensions ?? null) as Prisma.InputJsonValue;
    if (patch.reportFull !== undefined)
      update.reportFull = (patch.reportFull ?? null) as Prisma.InputJsonValue;
    if (patch.verdicts !== undefined)
      update.verdicts = (patch.verdicts ?? null) as Prisma.InputJsonValue;
    if (patch.reportArtifactVersion !== undefined)
      update.reportArtifactVersion = patch.reportArtifactVersion;
    if (patch.reconciliationReport !== undefined)
      update.reconciliationReport = (patch.reconciliationReport ??
        null) as Prisma.InputJsonValue;
    if (patch.leaderOverallScore !== undefined)
      update.leaderOverallScore = patch.leaderOverallScore;
    if (patch.leaderSigned !== undefined)
      update.leaderSigned = patch.leaderSigned;
    if (patch.leaderVerdict !== undefined)
      update.leaderVerdict = patch.leaderVerdict;
    if (patch.finalScore !== undefined) update.finalScore = patch.finalScore;
    if (patch.tokensUsed !== undefined) update.tokensUsed = patch.tokensUsed;
    if (patch.costUsd !== undefined) update.costUsd = patch.costUsd;
    if (patch.reportTitle !== undefined)
      update.reportTitle = patch.reportTitle.slice(0, 500);
    if (patch.reportSummary !== undefined)
      update.reportSummary = patch.reportSummary;
    await this._runMissionUpdate(id, userId, update, "markRerunPatch");
  }

  async markIntermediateState(
    id: string,
    patch: {
      reportFull?: unknown;
      reportArtifactVersion?: number;
      outlinePlan?: unknown;
      analystOutput?: unknown;
      verdicts?: unknown;
      reconciliationReport?: unknown;
      dimensions?: unknown;
      themeSummary?: string;
      leaderJournal?: unknown;
      leaderSigned?: boolean;
      leaderOverallScore?: number;
      leaderVerdict?: string;
      lastCompletedStage?: number;
    },
    userId?: string,
  ): Promise<void> {
    const update: Prisma.AgentPlaygroundMissionUpdateInput = {
      heartbeatAt: new Date(),
    };
    if (patch.reportFull !== undefined)
      update.reportFull = (patch.reportFull ?? null) as Prisma.InputJsonValue;
    if (patch.reportArtifactVersion !== undefined)
      update.reportArtifactVersion = patch.reportArtifactVersion;
    if (patch.outlinePlan !== undefined)
      update.outlinePlan = (patch.outlinePlan ?? null) as Prisma.InputJsonValue;
    if (patch.analystOutput !== undefined)
      update.analystOutput = (patch.analystOutput ??
        null) as Prisma.InputJsonValue;
    if (patch.verdicts !== undefined)
      update.verdicts = (patch.verdicts ?? null) as Prisma.InputJsonValue;
    if (patch.reconciliationReport !== undefined)
      update.reconciliationReport = (patch.reconciliationReport ??
        null) as Prisma.InputJsonValue;
    if (patch.dimensions !== undefined)
      update.dimensions = (patch.dimensions ?? null) as Prisma.InputJsonValue;
    if (patch.themeSummary !== undefined)
      update.themeSummary = patch.themeSummary;
    if (patch.leaderJournal !== undefined)
      update.leaderJournal = (patch.leaderJournal ??
        null) as Prisma.InputJsonValue;
    if (patch.leaderSigned !== undefined)
      update.leaderSigned = patch.leaderSigned;
    if (patch.leaderOverallScore !== undefined)
      update.leaderOverallScore = patch.leaderOverallScore;
    if (patch.leaderVerdict !== undefined)
      update.leaderVerdict = patch.leaderVerdict;
    if (patch.lastCompletedStage !== undefined)
      update.lastCompletedStage = patch.lastCompletedStage;
    await this._runMissionUpdate(id, userId, update, "markIntermediateState");
  }

  /**
   * 内部 helper：mission 行 update 双分支统一（PR-B3, 2026-05-08）。
   *
   * userId 传入 → updateMany + where{id, userId}（深度防御）
   * userId 缺失 → update + where{id}（兼容路径，upstream controller 已 assertOwnership）
   */
  async _runMissionUpdate(
    id: string,
    userId: string | undefined,
    data: Prisma.AgentPlaygroundMissionUpdateInput,
    label: string,
  ): Promise<void> {
    try {
      if (userId) {
        await this.prisma.agentPlaygroundMission.updateMany({
          where: { id, userId },
          data: data as Prisma.AgentPlaygroundMissionUpdateManyMutationInput,
        });
      } else {
        this.log.warn(
          `[${label} ${id}] missing userId — falling back to update where{id}; ` +
            `caller must rely on upstream controller assertOwnership`,
        );
        await this.prisma.agentPlaygroundMission.update({
          where: { id },
          data,
        });
      }
    } catch (err: unknown) {
      this.log.warn(
        `[${label} ${id}] failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
