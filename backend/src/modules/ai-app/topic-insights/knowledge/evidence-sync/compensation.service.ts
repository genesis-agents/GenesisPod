/**
 * EvidenceSyncCompensationService (F5)
 *
 * Keeps TopicEvidence persistence in lockstep with pipeline checkpoints so a
 * resume-from-checkpoint doesn't re-use stale or duplicated rows.
 *
 * Usage:
 *   1. snapshot(reportId) — call right before PipelineCheckpointService.saveStage
 *      to capture evidence ids tied to the draft report.
 *   2. reconcile(reportId) — call on resume to delete evidence rows created
 *      AFTER the snapshot (post-checkpoint orphans) so the resumed run starts
 *      from a coherent state.
 *
 * The snapshots live in-process; this is fine for single-instance deployments.
 * A DB-backed snapshot table is a follow-up (out of F5 scope).
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";

export interface EvidenceSnapshot {
  readonly reportId: string;
  readonly missionId?: string;
  /** Evidence ids attributed to this report at snapshot time. */
  readonly evidenceIds: readonly string[];
  readonly capturedAt: Date;
}

export interface ReconcileResult {
  readonly reportId: string;
  readonly removedOrphans: number;
  readonly missingEvidence: readonly string[];
}

@Injectable()
export class EvidenceSyncCompensationService {
  private readonly logger = new Logger(EvidenceSyncCompensationService.name);
  private readonly snapshots = new Map<string, EvidenceSnapshot>();

  constructor(private readonly prisma: PrismaService) {}

  async snapshot(
    reportId: string,
    missionId?: string,
  ): Promise<EvidenceSnapshot> {
    const rows = await this.prisma.topicEvidence.findMany({
      where: { reportId },
      select: { id: true },
    });
    const snap: EvidenceSnapshot = {
      reportId,
      missionId,
      evidenceIds: rows.map((r) => r.id),
      capturedAt: new Date(),
    };
    this.snapshots.set(reportId, snap);
    this.logger.debug(
      `[snapshot] report=${reportId} evidence=${snap.evidenceIds.length}`,
    );
    return snap;
  }

  getSnapshot(reportId: string): EvidenceSnapshot | undefined {
    return this.snapshots.get(reportId);
  }

  async reconcile(reportId: string): Promise<ReconcileResult> {
    const snap = this.snapshots.get(reportId);
    if (!snap) {
      return { reportId, removedOrphans: 0, missingEvidence: [] };
    }

    const currentRows = await this.prisma.topicEvidence.findMany({
      where: { reportId },
      select: { id: true },
    });
    const currentIds = new Set(currentRows.map((r) => r.id));
    const snapshotIds = new Set(snap.evidenceIds);

    const orphans = currentRows
      .map((r) => r.id)
      .filter((id) => !snapshotIds.has(id));
    const missing = snap.evidenceIds.filter((id) => !currentIds.has(id));

    let removedOrphans = 0;
    if (orphans.length > 0) {
      const res = await this.prisma.topicEvidence.deleteMany({
        where: { id: { in: orphans } },
      });
      removedOrphans = res.count;
      this.logger.log(
        `[reconcile] report=${reportId} removed ${removedOrphans} post-checkpoint orphans`,
      );
    }

    return { reportId, removedOrphans, missingEvidence: missing };
  }

  clear(reportId: string): void {
    this.snapshots.delete(reportId);
  }
}
