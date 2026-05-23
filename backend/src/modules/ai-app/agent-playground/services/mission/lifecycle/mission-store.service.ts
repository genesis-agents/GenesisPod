/**
 * MissionStore — agent-playground mission 持久化（委托入口）
 *
 * ★ 2026-05-08 PR-E2: satisfies IBusinessTeamMissionStore（structural typing）
 * ★ PR-D-2 (2026-05-15): god-class 拆分到 4 helper，本文件仅保留
 *   constructor / 核心 CRUD / heartbeat / stage / query + thin delegation。
 *   Helper 均为普通 class（非 @Injectable），constructor 内 new，外部接口零变化。
 */

import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  PayloadTooLargeException,
} from "@nestjs/common";
import type { ContentVisibility, Prisma } from "@prisma/client";
import { PrismaService } from "../../../../../../common/prisma/prisma.service";
import { EmbeddingService } from "@/modules/ai-engine/facade";
import {
  MissionAbortRegistry,
  MissionAbortReason,
  outcomeFromStatus,
  type MissionTerminalOutcome,
  type MissionTerminalArbiter,
  type MissionTerminalIntent,
} from "@/modules/ai-harness/facade";
import type { PlaygroundConfigSnapshot } from "../rerun/playground-mission-input-rebuilder.service";
import { MissionLifecycleHelper } from "./mission-lifecycle.helper";
import { CHECKPOINT_KEY } from "./prisma-mission-checkpoint.store";

/**
 * ★ C5/G7 S4b:userProfile 退化为 configSnapshot 的**读时投影**(单一真源=snapshot,
 * 不再独立写 userProfile)。前端 Mission 设置弹窗读此 shape 不变;legacy 无 snapshot → null。
 */
function projectUserProfileView(
  configSnapshot: unknown,
): Record<string, unknown> | null {
  const snap = configSnapshot as PlaygroundConfigSnapshot | null;
  if (snap?.schemaVersion == null) return null;
  const b = snap.businessInput;
  return {
    depth: b.depth,
    language: snap.language,
    budgetProfile: b.budgetProfile,
    styleProfile: b.styleProfile,
    lengthProfile: b.lengthProfile,
    audienceProfile: b.audienceProfile,
    withFigures: b.withFigures,
    auditLayers: b.auditLayers,
    concurrency: b.concurrency,
    viewMode: b.viewMode,
    searchTimeRange: b.searchTimeRange,
    knowledgeBaseIds: b.knowledgeBaseIds,
    inheritFromMissionId: b.inheritFromMissionId,
    maxCredits: snap.budget.maxCredits,
    budgetMultiplierOverride: snap.budget.budgetMultiplier,
    wallTimeCapMs: snap.runtimeLimits.wallTimeCapMs,
  };
}
import { MissionUpdateHelper } from "./mission-update.helper";
import { MissionPostmortemHelper } from "./mission-postmortem.helper";
import { MissionReportHelper } from "./mission-report.helper";

export interface MissionListItem {
  id: string;
  topic: string;
  depth: string;
  language: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  elapsedWallTimeMs: number | null;
  finalScore: number | null;
  tokensUsed: number | null;
  costUsd: number | null;
  reportTitle: string | null;
  reportSummary: string | null;
  errorMessage: string | null;
  visibility: ContentVisibility;
}

export interface MissionDetail extends MissionListItem {
  /** ★ C7:平台终态 outcome(status 投影,非终态 null)。 */
  terminalOutcome: MissionTerminalOutcome | null;
  /** ★ C2:canonical failure code(失败时)。 */
  failureCode: string | null;
  /** ★ C5/G7:typed MissionConfigSnapshot(单一 config 真源;rerun/hydrate 读它)。NULL=legacy。 */
  configSnapshot: unknown;
  maxCredits: number;
  themeSummary: string | null;
  dimensions: unknown;
  reportFull: unknown;
  verdicts: unknown;
  trajectoryStored: number | null;
  reportArtifactVersion: number | null;
  userProfile: unknown;
  reconciliationReport: unknown;
  leaderJournal: unknown;
  leaderOverallScore: number | null;
  leaderSigned: boolean | null;
  leaderVerdict: string | null;
  lastCompletedStage?: number | null;
  outlinePlan?: unknown;
  analystOutput?: unknown;
  heartbeatAt?: Date | null;
}

// Re-export for existing importers that depend on this symbol from this module path.
export { PayloadTooLargeException };

/**
 * ★ C0/G1：playground 终态 arbiter 富载荷（判别式）。所有终态来源（S11、dispatcher
 * handleMissionFailure、rerun 路径、liveness 回收、controller cancel）经
 * MissionLifecycleManager.finalize 提交 intent，arbiter 据 kind 落终态。
 *
 * userId 透传给 writeX 的 ownership WHERE（WHERE status='running' AND userId=userId）。
 */
export type PlaygroundTerminalExtra =
  | {
      readonly kind: "completed";
      readonly detail: Parameters<MissionLifecycleHelper["writeCompleted"]>[1];
      readonly userId?: string;
    }
  | {
      readonly kind: "failed";
      readonly detail: Parameters<MissionLifecycleHelper["writeFailed"]>[1];
      readonly userId?: string;
    }
  | { readonly kind: "cancelled"; readonly userId?: string };

@Injectable()
export class MissionStore implements MissionTerminalArbiter<PlaygroundTerminalExtra> {
  private readonly log = new Logger(MissionStore.name);
  /** Per-instance set: prevent duplicate emergency-abort signals for the same mission. */
  private readonly emergencyAborted = new Set<string>();

  private readonly lifecycle: MissionLifecycleHelper;
  private readonly update: MissionUpdateHelper;
  private readonly postmortem: MissionPostmortemHelper;
  private readonly report: MissionReportHelper;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() embeddingService?: EmbeddingService,
    @Optional() private readonly abortRegistry?: MissionAbortRegistry,
  ) {
    this.lifecycle = new MissionLifecycleHelper(
      prisma,
      this.isMissionRowMissing.bind(this),
      this.emergencyAbortOnMissingRow.bind(this),
      this.clearCheckpointJsonbKey.bind(this),
    );
    this.update = new MissionUpdateHelper(prisma);
    this.postmortem = new MissionPostmortemHelper(prisma, embeddingService);
    this.report = new MissionReportHelper(
      prisma,
      this.isMissionRowMissing.bind(this),
      this.emergencyAbortOnMissingRow.bind(this),
    );
  }

  // ── Private helpers (used by helpers via .bind) ───────────────────────────

  private isMissionRowMissing(err: unknown): boolean {
    if (!err || typeof err !== "object") return false;
    const code = (err as { code?: string }).code;
    return code === "P2003" || code === "P2025";
  }

  private emergencyAbortOnMissingRow(missionId: string, reason: string): void {
    if (this.emergencyAborted.has(missionId)) return;
    this.emergencyAborted.add(missionId);
    this.log.error(
      `[emergency-abort] mission=${missionId} reason="${reason}" — DB row 已蒸发，` +
        `主动 abort 在跑 orchestrator 防止 FK / heartbeat 错误风暴。`,
    );
    this.abortRegistry?.abort(
      missionId,
      MissionAbortReason.mission_row_missing,
    );
  }

  private async clearCheckpointJsonbKey(missionId: string): Promise<void> {
    await this.prisma.$executeRaw`
        UPDATE agent_playground_missions
        SET leader_journal = COALESCE(leader_journal, '{}'::jsonb) - ${CHECKPOINT_KEY}
        WHERE id = ${missionId}
          AND leader_journal ? ${CHECKPOINT_KEY}
      `.catch((err: unknown) => {
      this.log.error(
        `[clearCheckpoint ${missionId}] update failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 0;
    });
  }

  // ── Arbiter (C0/G1 唯一终态写入口) ───────────────────────────────────────

  /**
   * ★ C0/G1：唯一终态写仲裁口。所有终态来源经 MissionLifecycleManager.finalize
   * 提交 intent，由此单点条件写（WHERE status='running'）首写者赢。
   * 返回 true=本次赢、false=已终态 no-op。
   */
  async applyTerminalIfRunning(
    missionId: string,
    intent: MissionTerminalIntent<PlaygroundTerminalExtra>,
  ): Promise<boolean> {
    const extra = intent.extra;
    if (!extra) return false; // 防御：playground 终态必须带 extra（理论不可达）
    switch (extra.kind) {
      case "completed":
        return this.lifecycle.writeCompleted(
          missionId,
          extra.detail,
          extra.userId,
        );
      case "failed":
        return this.lifecycle.writeFailed(
          missionId,
          extra.detail,
          extra.userId,
        );
      case "cancelled":
        return this.lifecycle.writeCancelled(missionId, extra.userId);
    }
  }

  // ── Core CRUD ─────────────────────────────────────────────────────────────

  async create(input: {
    id: string;
    userId: string;
    workspaceId?: string;
    topic: string;
    depth: string;
    language: string;
    maxCredits: number;
    userProfile?: Record<string, unknown>;
    /** ★ C5/G7：typed MissionConfigSnapshot(单一 config 真源,openSession 冻结)。 */
    configSnapshot?: unknown;
  }): Promise<void> {
    await this.prisma.agentPlaygroundMission.create({
      data: {
        id: input.id,
        userId: input.userId,
        workspaceId: input.workspaceId,
        topic: input.topic.slice(0, 500),
        depth: input.depth,
        language: input.language,
        maxCredits: input.maxCredits,
        status: "running",
        // ★ S4b:不再写 userProfile(configSnapshot 单一真源;读时投影回 userProfile shape)。
        configSnapshot: input.configSnapshot as
          | Prisma.InputJsonValue
          | undefined,
      },
    });
  }

  // ── Heartbeat ─────────────────────────────────────────────────────────────

  async refreshHeartbeat(id: string, podId: string): Promise<void> {
    await this.prisma.agentPlaygroundMission
      .update({ where: { id }, data: { heartbeatAt: new Date(), podId } })
      .catch((err: unknown) => {
        if (this.isMissionRowMissing(err)) {
          this.emergencyAbortOnMissingRow(id, "heartbeat row missing");
          return;
        }
        this.log.error(
          `[heartbeat ${id}] failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  async clearHeartbeat(id: string, userId: string): Promise<void> {
    await this.prisma.agentPlaygroundMission
      .updateMany({ where: { id, userId }, data: { heartbeatAt: null } })
      .catch((err: unknown) => {
        this.log.warn(
          `[clearHeartbeat ${id}] failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  async cleanupOrphanRunningMissions(
    thresholdMs: number,
  ): Promise<{ id: string; userId: string }[]> {
    try {
      const cutoff = new Date(Date.now() - thresholdMs);
      const orphans = await this.prisma.agentPlaygroundMission.findMany({
        where: { status: "running", heartbeatAt: { lt: cutoff } },
        select: { id: true, userId: true },
        take: 200,
      });
      if (orphans.length === 0) return [];
      await this.prisma.agentPlaygroundMission.updateMany({
        where: { id: { in: orphans.map((o) => o.id) }, status: "running" },
        data: {
          status: "failed",
          completedAt: new Date(),
          // ★ C2/MINOR-1:启动清理孤儿 running 行 = 进程崩溃,落 canonical runtime_crashed。
          failureCode: "runtime_crashed",
          errorMessage:
            "Mission 在执行中遇到后端重启或异常退出（dispatcher 内存丢失）。" +
            "已自动标记为失败，建议使用顶部「重新运行」按钮重启相同主题。",
        },
      });
      return orphans;
    } catch (err) {
      this.log.error(
        `[#88 cleanupOrphanRunningMissions] failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  // ── Stage progress ────────────────────────────────────────────────────────

  async markStageComplete(id: string, stageNumber: number): Promise<void> {
    await this.prisma.agentPlaygroundMission
      .updateMany({
        where: { id, status: "running" },
        data: { lastCompletedStage: stageNumber, heartbeatAt: new Date() },
      })
      .catch((err: unknown) => {
        if (this.isMissionRowMissing(err)) {
          this.emergencyAbortOnMissingRow(
            id,
            `markStageComplete s${stageNumber}`,
          );
          return;
        }
        this.log.error(
          `[markStageComplete ${id} s${stageNumber}] failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  // ── Lifecycle delegates ───────────────────────────────────────────────────
  // ★ C0/G1：markCompleted / markCancelled / markFailed 已折叠进 arbiter 的
  //   applyTerminalIfRunning——外部经 finalize → applyTerminalIfRunning 提交终态。

  markReopened(
    ...args: Parameters<MissionLifecycleHelper["markReopened"]>
  ): ReturnType<MissionLifecycleHelper["markReopened"]> {
    return this.lifecycle.markReopened(...args);
  }
  appendLeaderJournal(
    ...args: Parameters<MissionLifecycleHelper["appendLeaderJournal"]>
  ): ReturnType<MissionLifecycleHelper["appendLeaderJournal"]> {
    return this.lifecycle.appendLeaderJournal(...args);
  }

  // ── Update delegates ──────────────────────────────────────────────────────

  updateTopicByUser(
    ...args: Parameters<MissionUpdateHelper["updateTopicByUser"]>
  ): ReturnType<MissionUpdateHelper["updateTopicByUser"]> {
    return this.update.updateTopicByUser(...args);
  }
  updateBudgetByUser(
    ...args: Parameters<MissionUpdateHelper["updateBudgetByUser"]>
  ): ReturnType<MissionUpdateHelper["updateBudgetByUser"]> {
    return this.update.updateBudgetByUser(...args);
  }
  resetFields(
    ...args: Parameters<MissionUpdateHelper["resetFields"]>
  ): ReturnType<MissionUpdateHelper["resetFields"]> {
    return this.update.resetFields(...args);
  }
  markRerunPatch(
    ...args: Parameters<MissionUpdateHelper["markRerunPatch"]>
  ): ReturnType<MissionUpdateHelper["markRerunPatch"]> {
    return this.update.markRerunPatch(...args);
  }
  markIntermediateState(
    ...args: Parameters<MissionUpdateHelper["markIntermediateState"]>
  ): ReturnType<MissionUpdateHelper["markIntermediateState"]> {
    return this.update.markIntermediateState(...args);
  }

  // ── Postmortem delegates ──────────────────────────────────────────────────

  recordMissionPostmortem(
    ...args: Parameters<MissionPostmortemHelper["recordMissionPostmortem"]>
  ): ReturnType<MissionPostmortemHelper["recordMissionPostmortem"]> {
    return this.postmortem.recordMissionPostmortem(...args);
  }
  listRecentPostmortems(
    ...args: Parameters<MissionPostmortemHelper["listRecentPostmortems"]>
  ): ReturnType<MissionPostmortemHelper["listRecentPostmortems"]> {
    return this.postmortem.listRecentPostmortems(...args);
  }

  // ── Report delegates ──────────────────────────────────────────────────────

  saveReportVersion(
    ...args: Parameters<MissionReportHelper["saveReportVersion"]>
  ): ReturnType<MissionReportHelper["saveReportVersion"]> {
    return this.report.saveReportVersion(...args);
  }
  listReportVersions(
    ...args: Parameters<MissionReportHelper["listReportVersions"]>
  ): ReturnType<MissionReportHelper["listReportVersions"]> {
    return this.report.listReportVersions(...args);
  }
  getReportVersion(
    ...args: Parameters<MissionReportHelper["getReportVersion"]>
  ): ReturnType<MissionReportHelper["getReportVersion"]> {
    return this.report.getReportVersion(...args);
  }
  saveResearchResult(
    ...args: Parameters<MissionReportHelper["saveResearchResult"]>
  ): ReturnType<MissionReportHelper["saveResearchResult"]> {
    return this.report.saveResearchResult(...args);
  }
  loadBaselineResearchResults(
    ...args: Parameters<MissionReportHelper["loadBaselineResearchResults"]>
  ): ReturnType<MissionReportHelper["loadBaselineResearchResults"]> {
    return this.report.loadBaselineResearchResults(...args);
  }
  saveChapterDraft(
    ...args: Parameters<MissionReportHelper["saveChapterDraft"]>
  ): ReturnType<MissionReportHelper["saveChapterDraft"]> {
    return this.report.saveChapterDraft(...args);
  }
  loadQualifiedChapterDrafts(
    ...args: Parameters<MissionReportHelper["loadQualifiedChapterDrafts"]>
  ): ReturnType<MissionReportHelper["loadQualifiedChapterDrafts"]> {
    return this.report.loadQualifiedChapterDrafts(...args);
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  async countRunningByUser(userId: string): Promise<number> {
    return this.prisma.agentPlaygroundMission.count({
      where: { userId, status: "running" },
    });
  }

  async deleteByUser(id: string, userId: string): Promise<void> {
    await this.prisma.agentPlaygroundMission
      .deleteMany({ where: { id, userId } })
      .catch((err: unknown) => {
        this.log.warn(
          `[deleteByUser ${id}] failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  async appendDimensions(
    missionId: string,
    items: { name: string; rationale: string }[],
  ): Promise<string[]> {
    if (items.length === 0) return [];
    return this.prisma.$transaction(
      async (tx) => {
        const row = await tx.agentPlaygroundMission.findUnique({
          where: { id: missionId },
          select: { status: true, dimensions: true },
        });
        if (!row || row.status !== "running") {
          this.log.warn(
            `[appendDimensions ${missionId}] mission status=${row?.status ?? "missing"} — refusing append`,
          );
          return [];
        }
        const existing = (row.dimensions ?? []) as {
          id: string;
          name: string;
          rationale: string;
          source?: string;
        }[];
        const baseIdx = existing.length;
        const newDims = items.map((it, i) => ({
          id: `dim-user-${baseIdx + i + 1}`,
          name: it.name
            .replace(/[\r\n]/g, " ")
            .trim()
            .slice(0, 80),
          rationale: it.rationale
            .replace(/[\r\n]/g, " ")
            .trim()
            .slice(0, 500),
          source: "user-chat" as const,
        }));
        await tx.agentPlaygroundMission.update({
          where: { id: missionId },
          data: { dimensions: [...existing, ...newDims] as never },
        });
        return newDims.map((d) => d.id);
      },
      { isolationLevel: "Serializable" },
    );
  }

  /** 多租户可见性切换（仅所有者）。 */
  async updateVisibility(
    userId: string,
    missionId: string,
    visibility: ContentVisibility,
  ): Promise<{ id: string; visibility: ContentVisibility }> {
    const row = await this.prisma.agentPlaygroundMission.findFirst({
      where: { id: missionId },
      select: { userId: true },
    });
    if (!row) throw new NotFoundException("Mission not found");
    if (row.userId !== userId) throw new ForbiddenException("Not owner");
    return this.prisma.agentPlaygroundMission.update({
      where: { id: missionId },
      data: { visibility },
      select: { id: true, visibility: true },
    });
  }

  async listByUser(userId: string, limit = 50): Promise<MissionListItem[]> {
    const rows = await this.prisma.agentPlaygroundMission.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
      select: {
        id: true,
        topic: true,
        depth: true,
        language: true,
        status: true,
        startedAt: true,
        completedAt: true,
        elapsedWallTimeMs: true,
        finalScore: true,
        tokensUsed: true,
        costUsd: true,
        reportTitle: true,
        reportSummary: true,
        errorMessage: true,
        visibility: true,
      },
    });
    return rows.map((r) => ({
      ...r,
      tokensUsed: r.tokensUsed != null ? Number(r.tokensUsed) : null,
    }));
  }

  async listByMissionIds(
    userId: string,
    missionIds: ReadonlyArray<string>,
  ): Promise<MissionListItem[]> {
    if (missionIds.length === 0) return [];
    const rows = await this.prisma.agentPlaygroundMission.findMany({
      where: { userId, id: { in: missionIds as string[] } },
      select: {
        id: true,
        topic: true,
        depth: true,
        language: true,
        status: true,
        startedAt: true,
        completedAt: true,
        elapsedWallTimeMs: true,
        finalScore: true,
        tokensUsed: true,
        costUsd: true,
        reportTitle: true,
        reportSummary: true,
        errorMessage: true,
        visibility: true,
      },
    });
    const mapped = rows.map((r) => ({
      ...r,
      tokensUsed: r.tokensUsed != null ? Number(r.tokensUsed) : null,
    }));
    const map = new Map(mapped.map((r) => [r.id, r]));
    return missionIds
      .map((id) => map.get(id))
      .filter((r): r is MissionListItem => !!r);
  }

  async getById(id: string, userId: string): Promise<MissionDetail | null> {
    const row = await this.prisma.agentPlaygroundMission.findFirst({
      where: { id, userId },
    });
    if (!row) return null;
    return {
      id: row.id,
      topic: row.topic,
      depth: row.depth,
      language: row.language,
      status: row.status,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      elapsedWallTimeMs: row.elapsedWallTimeMs,
      finalScore: row.finalScore,
      tokensUsed: row.tokensUsed != null ? Number(row.tokensUsed) : null,
      costUsd: row.costUsd,
      reportTitle: row.reportTitle,
      reportSummary: row.reportSummary,
      errorMessage: row.errorMessage,
      terminalOutcome: outcomeFromStatus(row.status),
      failureCode: row.failureCode ?? null,
      configSnapshot: row.configSnapshot ?? null,
      maxCredits: row.maxCredits,
      themeSummary: row.themeSummary,
      dimensions: row.dimensions,
      reportFull: row.reportFull,
      verdicts: row.verdicts,
      trajectoryStored: row.trajectoryStored,
      reportArtifactVersion: row.reportArtifactVersion,
      // ★ S4b:userProfile 是 configSnapshot 的读时投影(单一真源,不再独立存)。
      userProfile: projectUserProfileView(row.configSnapshot),
      reconciliationReport: row.reconciliationReport,
      leaderJournal: row.leaderJournal,
      leaderOverallScore: row.leaderOverallScore,
      leaderSigned: row.leaderSigned,
      leaderVerdict: row.leaderVerdict,
      lastCompletedStage: row.lastCompletedStage,
      outlinePlan: row.outlinePlan,
      analystOutput: row.analystOutput,
      heartbeatAt: row.heartbeatAt,
      visibility: row.visibility,
    };
  }
}
