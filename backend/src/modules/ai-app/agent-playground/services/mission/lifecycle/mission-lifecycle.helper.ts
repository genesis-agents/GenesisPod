/**
 * MissionLifecycleHelper — mission 终态转换（markCompleted / markCancelled /
 * markFailed / markReopened / appendLeaderJournal）。
 *
 * 普通 class（非 @Injectable），由 MissionStore 在 constructor 内 new。
 */

import {
  BadRequestException,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../../../common/prisma/prisma.service";

export class MissionLifecycleHelper {
  private readonly log = new Logger(MissionLifecycleHelper.name);

  constructor(
    private readonly prisma: PrismaService,
    // isMissionRowMissing / emergencyAbortOnMissingRow reserved for future use
    // (currently only needed by MissionReportHelper for FK storm circuit-breaker)
    _isMissionRowMissing: (err: unknown) => boolean,
    _emergencyAbortOnMissingRow: (missionId: string, reason: string) => void,
    private readonly clearCheckpointJsonbKey: (
      missionId: string,
    ) => Promise<void>,
  ) {}

  async markCompleted(
    id: string,
    data: {
      finalScore?: number;
      tokensUsed?: number;
      costUsd?: number;
      trajectoryStored?: number;
      elapsedWallTimeMs?: number;
      themeSummary?: string;
      dimensions?: unknown;
      report?: { title?: string; summary?: string; [k: string]: unknown };
      verdicts?: unknown;
      reportArtifactVersion?: number;
      userProfile?: unknown;
      reconciliationReport?: unknown;
      leaderJournal?: unknown;
      leaderOverallScore?: number;
      leaderSigned?: boolean;
      leaderVerdict?: string;
    },
    userId?: string,
  ): Promise<void> {
    const MAX_REPORT_BYTES = 5 * 1024 * 1024;
    const HARD_LIMIT_BYTES = 10 * 1024 * 1024;
    if (data.report && typeof data.report === "object") {
      const size = Buffer.byteLength(JSON.stringify(data.report), "utf8");
      if (size > HARD_LIMIT_BYTES) {
        throw new PayloadTooLargeException(
          `report_too_large: ${size} bytes exceeds ${HARD_LIMIT_BYTES} byte hard limit`,
        );
      }
      if (size > MAX_REPORT_BYTES) {
        this.log.warn(
          `[markCompleted ${id}] report size ${size} > ${MAX_REPORT_BYTES} bytes — truncating`,
        );
        const r = data.report as {
          content?: {
            fullMarkdown?: string;
            fullReportSize?: number;
            truncated?: boolean;
            originalBytes?: number;
          };
        };
        if (
          r.content?.fullMarkdown &&
          r.content.fullMarkdown.length > 100_000
        ) {
          r.content.fullMarkdown =
            r.content.fullMarkdown.slice(0, 100_000) +
            `\n\n... (truncated, ${size} bytes total)`;
          r.content.truncated = true;
          r.content.originalBytes = size;
        }
      }
    }
    const update: Prisma.AgentPlaygroundMissionUpdateInput = {
      status: "completed",
      completedAt: new Date(),
      finalScore: data.finalScore ?? null,
      tokensUsed: data.tokensUsed ?? null,
      costUsd: data.costUsd ?? null,
      trajectoryStored: data.trajectoryStored ?? null,
      elapsedWallTimeMs: data.elapsedWallTimeMs ?? null,
      themeSummary: data.themeSummary ?? null,
      dimensions: (data.dimensions ?? null) as Prisma.InputJsonValue,
      reportFull: (data.report ?? null) as Prisma.InputJsonValue,
      verdicts: (data.verdicts ?? null) as Prisma.InputJsonValue,
      reportTitle: data.report?.title?.slice(0, 500) ?? null,
      reportSummary: data.report?.summary ?? null,
      reportArtifactVersion: data.reportArtifactVersion ?? null,
      userProfile: (data.userProfile ?? null) as Prisma.InputJsonValue,
      reconciliationReport: (data.reconciliationReport ??
        null) as Prisma.InputJsonValue,
      leaderJournal:
        data.leaderJournal !== undefined
          ? ((data.leaderJournal ?? null) as Prisma.InputJsonValue)
          : undefined,
      leaderOverallScore: data.leaderOverallScore ?? null,
      leaderSigned: data.leaderSigned ?? null,
      leaderVerdict: data.leaderVerdict ?? null,
    };
    const completeWhere: Prisma.AgentPlaygroundMissionWhereInput = {
      id,
      status: "running",
      ...(userId ? { userId } : {}),
    };
    await this.prisma.agentPlaygroundMission
      .updateMany({
        where: completeWhere,
        data: update,
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[markCompleted ${id}] guarded update failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    await this.clearCheckpointJsonbKey(id);
  }

  async markCancelled(id: string): Promise<void> {
    await this.prisma.agentPlaygroundMission
      .updateMany({
        where: { id, status: "running" },
        data: {
          status: "cancelled",
          completedAt: new Date(),
          errorMessage: "Mission cancelled by user.",
        },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[markCancelled ${id}] failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    await this.clearCheckpointJsonbKey(id);
  }

  async markFailed(
    id: string,
    data: {
      errorMessage?: string;
      /** ★ C2/MAJOR-6:canonical MissionFailureCode 值,落 DB failure_code 列。 */
      failureCode?: string;
      tokensUsed?: number;
      costUsd?: number;
      elapsedWallTimeMs?: number;
      trajectoryStored?: number;
      themeSummary?: string;
      dimensions?: unknown;
      report?: { title?: string; summary?: string; [k: string]: unknown };
      verdicts?: unknown;
      reportArtifactVersion?: number;
      userProfile?: unknown;
      reconciliationReport?: unknown;
      leaderJournal?: unknown;
      leaderOverallScore?: number;
      leaderSigned?: boolean;
      leaderVerdict?: string;
    },
    userId?: string,
  ): Promise<void> {
    if (data.report && typeof data.report === "object") {
      const failSize = Buffer.byteLength(JSON.stringify(data.report), "utf8");
      if (failSize > 10 * 1024 * 1024) {
        data.errorMessage = "report_too_large";
        data.report = undefined;
      }
    }
    const isLeadRefusal = data.leaderSigned === false;
    const update: Prisma.AgentPlaygroundMissionUpdateInput = {
      status: isLeadRefusal ? "quality-failed" : "failed",
      completedAt: new Date(),
      errorMessage: data.errorMessage?.slice(0, 2000) ?? null,
      // ★ C2/MAJOR-6:落 canonical failure_code。Lead 拒签 → leader_signoff_rejected;
      //   其余由 caller 传(handleMissionFailure 映射);都没有则 null(读路径回退 errorMessage)。
      failureCode:
        data.failureCode ?? (isLeadRefusal ? "leader_signoff_rejected" : null),
      tokensUsed: data.tokensUsed ?? null,
      costUsd: data.costUsd ?? null,
      elapsedWallTimeMs: data.elapsedWallTimeMs ?? null,
    };
    if (data.trajectoryStored != null)
      update.trajectoryStored = data.trajectoryStored;
    if (data.themeSummary != null) update.themeSummary = data.themeSummary;
    if (data.dimensions !== undefined)
      update.dimensions = (data.dimensions ?? null) as Prisma.InputJsonValue;
    if (data.report !== undefined) {
      update.reportFull = (data.report ?? null) as Prisma.InputJsonValue;
      update.reportTitle = data.report?.title?.slice(0, 500) ?? null;
      update.reportSummary = data.report?.summary ?? null;
    }
    if (data.verdicts !== undefined)
      update.verdicts = (data.verdicts ?? null) as Prisma.InputJsonValue;
    if (data.reportArtifactVersion != null)
      update.reportArtifactVersion = data.reportArtifactVersion;
    if (data.userProfile !== undefined)
      update.userProfile = (data.userProfile ?? null) as Prisma.InputJsonValue;
    if (data.reconciliationReport !== undefined)
      update.reconciliationReport = (data.reconciliationReport ??
        null) as Prisma.InputJsonValue;
    if (data.leaderOverallScore !== undefined)
      update.leaderOverallScore = data.leaderOverallScore ?? null;
    if (data.leaderSigned !== undefined)
      update.leaderSigned = data.leaderSigned ?? null;
    if (data.leaderVerdict !== undefined)
      update.leaderVerdict = data.leaderVerdict ?? null;
    if (data.leaderJournal !== undefined)
      update.leaderJournal = (data.leaderJournal ??
        null) as Prisma.InputJsonValue;
    const failWhere: Prisma.AgentPlaygroundMissionWhereInput = {
      id,
      status: "running",
      ...(userId ? { userId } : {}),
    };
    await this.prisma.agentPlaygroundMission
      .updateMany({ where: failWhere, data: update })
      .catch((err: unknown) => {
        this.log.warn(
          `[markFailed ${id}] failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    await this.clearCheckpointJsonbKey(id);
  }

  async markReopened(missionId: string, userId: string): Promise<void> {
    const allowedFromStatuses = ["failed", "quality-failed"] as const;
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.agentPlaygroundMission.updateMany({
        where: {
          id: missionId,
          userId,
          status: { in: [...allowedFromStatuses] },
        },
        data: {
          status: "running",
          errorMessage: null,
          completedAt: null,
          finalScore: null,
          leaderSigned: null,
          leaderOverallScore: null,
          leaderVerdict: null,
        },
      });
      if (updated.count === 0) {
        const probe = await tx.agentPlaygroundMission.findFirst({
          where: { id: missionId, userId },
          select: { status: true },
        });
        if (!probe) {
          throw new NotFoundException(
            `mission ${missionId} not found or not owned by ${userId}`,
          );
        }
        throw new BadRequestException(
          `cannot reopen mission in status=${probe.status} (allowed: ${allowedFromStatuses.join("|")})`,
        );
      }
      await tx.agentPlaygroundMissionEvent.create({
        data: {
          missionId,
          type: "agent-playground.mission:reopened",
          payload: {
            triggeredBy: userId,
            ts: Date.now(),
          } as Prisma.InputJsonValue,
          ts: BigInt(Date.now()),
        },
      });
    });
  }

  async appendLeaderJournal(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const row = await tx.agentPlaygroundMission.findUnique({
            where: { id },
            select: { leaderJournal: true, leaderJournalUri: true },
          });
          const current =
            (row?.leaderJournal as Record<string, unknown> | null) ?? {};
          const merged = { ...current, ...patch };
          if (
            Array.isArray(current.decisions) &&
            Array.isArray((patch as { decisions?: unknown[] }).decisions)
          ) {
            merged.decisions = [
              ...(current.decisions as unknown[]),
              ...((patch as { decisions: unknown[] }).decisions ?? []),
            ];
          }
          await tx.agentPlaygroundMission.update({
            where: { id },
            data: { leaderJournal: merged as Prisma.InputJsonValue },
          });
        },
        { isolationLevel: "Serializable" },
      );
    } catch (err) {
      this.log.warn(
        `[appendLeaderJournal ${id}] failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
