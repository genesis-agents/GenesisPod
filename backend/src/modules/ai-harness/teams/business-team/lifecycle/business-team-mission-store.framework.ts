/**
 * BusinessAgentTeam — Mission Store Framework (P6 Wave 1, 2026-05-24)
 *
 * @migrated-from ai-app/agent-playground/services/mission/lifecycle/mission-store.service.ts
 *
 * 抽出 mission 表通用 CRUD / heartbeat / stage / orphan cleanup 机制。
 *
 * 机制：
 *   - refreshHeartbeat (write where id; row missing → emergencyAbort)
 *   - clearHeartbeat / countRunning / markStageComplete
 *   - cleanupOrphanRunningMissions (cutoff + batch 200)
 *
 * 业务（hooks）：
 *   - Prisma delegate IO（业务表名）
 *   - failureCode + errorMessage 文案（业务专属）
 *   - row missing 判定 + emergencyAbort 钩子
 */

import { Logger } from "@nestjs/common";
import type {
  MissionCreateBaseInput,
  MissionHeartbeatRow,
  MissionStoreHooks,
} from "./abstractions/mission-store.contract";

const DEFAULT_ORPHAN_BATCH = 200;

export abstract class BusinessTeamMissionStoreFramework<
  TCreateInput extends MissionCreateBaseInput,
> {
  protected readonly log: Logger;
  /** Per-instance set: prevent duplicate emergency-abort signals for the same mission. */
  protected readonly emergencyAborted = new Set<string>();
  private readonly orphanBatchSize: number;

  constructor(protected readonly storeHooks: MissionStoreHooks<TCreateInput>) {
    this.log = new Logger(storeHooks.loggerNamespace);
    this.orphanBatchSize = storeHooks.orphanBatchSize ?? DEFAULT_ORPHAN_BATCH;
  }

  /** 业务方暴露：mission row 创建。 */
  async create(input: TCreateInput): Promise<void> {
    await this.storeHooks.createMission(input);
  }

  /** 写 heartbeat。Row missing → emergency abort。 */
  async refreshHeartbeat(missionId: string, podId: string): Promise<void> {
    try {
      await this.storeHooks.writeHeartbeat(missionId, podId);
    } catch (err: unknown) {
      if (this.storeHooks.isMissionRowMissing(err)) {
        this.triggerEmergencyAbort(missionId, "heartbeat row missing");
        return;
      }
      this.log.error(
        `[heartbeat ${missionId}] failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async clearHeartbeat(missionId: string, userId: string): Promise<void> {
    try {
      await this.storeHooks.resetHeartbeat(missionId, userId);
    } catch (err: unknown) {
      this.log.warn(
        `[clearHeartbeat ${missionId}] failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** Stage 进度推进 (WHERE status='running')。 */
  async markStageComplete(
    missionId: string,
    stageNumber: number,
  ): Promise<void> {
    try {
      await this.storeHooks.writeStageProgress(missionId, stageNumber);
    } catch (err: unknown) {
      if (this.storeHooks.isMissionRowMissing(err)) {
        this.triggerEmergencyAbort(
          missionId,
          `markStageComplete s${stageNumber}`,
        );
        return;
      }
      this.log.error(
        `[markStageComplete ${missionId} s${stageNumber}] failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async countRunningByUser(userId: string): Promise<number> {
    return this.storeHooks.countRunning(userId);
  }

  /**
   * 清理 status='running' 且 heartbeat stale 的 mission。
   * Framework 算 cutoff + 限 batch；业务方负责具体 select + updateMany。
   */
  async cleanupOrphanRunningMissions(
    thresholdMs: number,
  ): Promise<MissionHeartbeatRow[]> {
    try {
      const cutoff = new Date(Date.now() - thresholdMs);
      const orphans = await this.storeHooks.findOrphanRunning(
        cutoff,
        this.orphanBatchSize,
      );
      if (orphans.length === 0) return [];
      await this.storeHooks.markOrphanFailed(orphans.map((o) => o.id));
      return [...orphans];
    } catch (err: unknown) {
      this.log.error(
        `[cleanupOrphanRunningMissions] failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return [];
    }
  }

  /** Emergency abort wrapper —— 防重 + log。 */
  protected triggerEmergencyAbort(missionId: string, reason: string): void {
    if (this.emergencyAborted.has(missionId)) return;
    this.emergencyAborted.add(missionId);
    this.log.error(
      `[emergency-abort] mission=${missionId} reason="${reason}" — DB row missing, ` +
        `proactively aborting in-flight orchestrator to prevent FK / heartbeat error storm.`,
    );
    this.storeHooks.emergencyAbort(missionId, reason);
  }
}
