/**
 * CompanyMissionService — W3 团队 Mission 持久化 + 执行
 *
 * Responsibilities:
 *   - createMission(): 落库 company_missions 行，fire-and-forget 异步执行。
 *   - listMissions(): 按 userId / teamId 查询列表。
 *
 * 执行流程（最小化实现）：
 *   1. status → 'running'，emit company.mission:started
 *   2. 推进进度 progress 0 → 33 → 66 → 100，emit company.stage:lifecycle
 *   3. status → 'done' / 'failed'，emit company.mission:completed / mission:failed
 *
 * 无可用 LLM Key 时优雅降级——只走 emit 阶段事件驱动的 mock 流，不抛异常。
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { EventBus } from "@/modules/ai-harness/facade";
import type { CompanyMission, Prisma } from "@prisma/client";

// ── 常量 ─────────────────────────────────────────────────────────────────────

const MOCK_STAGES = [
  { id: "planning", label: "规划", progressEnd: 33 },
  { id: "execution", label: "执行", progressEnd: 66 },
  { id: "review", label: "评审", progressEnd: 100 },
];

// ── service ───────────────────────────────────────────────────────────────────

@Injectable()
export class CompanyMissionService {
  private readonly log = new Logger(CompanyMissionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBus,
  ) {}

  // ── create + dispatch ──────────────────────────────────────────────────────

  async createMission(
    userId: string,
    teamId: string,
    title: string,
  ): Promise<CompanyMission> {
    const mission = await this.prisma.companyMission.create({
      data: { userId, teamId, title, status: "queued", progress: 0 },
    });

    // fire-and-forget: 异步执行，不等待，异常由 runMission 内部处理
    void this.runMission(mission.id, userId).catch((err: unknown) => {
      this.log.error(
        `CompanyMission ${mission.id} run failed (outer catch): ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return mission;
  }

  // ── list ───────────────────────────────────────────────────────────────────

  async listMissions(
    userId: string,
    teamId?: string,
  ): Promise<CompanyMission[]> {
    return this.prisma.companyMission.findMany({
      where: { userId, ...(teamId ? { teamId } : {}) },
      orderBy: { createdAt: "desc" },
    });
  }

  // ── internal runner ────────────────────────────────────────────────────────

  /**
   * 最小执行流：
   *   queued → running → emit started
   *   逐 stage emit lifecycle + 更新 progress
   *   running → done/failed + emit completed/failed
   *
   * 无 LLM Key 时优雅降级 —— mock 阶段 emit 只推进状态，不实际调用 LLM。
   */
  private async runMission(missionId: string, userId: string): Promise<void> {
    // 1. 状态 running
    await this.updateMission(missionId, { status: "running", progress: 0 });
    await this.emit("company.mission:started", missionId, userId, {
      missionId,
    });

    try {
      // 2. 逐阶段推进
      for (const stage of MOCK_STAGES) {
        await this.emit("company.stage:lifecycle", missionId, userId, {
          stage: stage.id,
          status: "started",
        });

        // 模拟阶段工作（轻量 mock — 无 LLM 调用）
        await this.updateMission(missionId, {
          progress: Math.floor(stage.progressEnd * 0.5),
        });

        await this.emit("company.stage:lifecycle", missionId, userId, {
          stage: stage.id,
          status: "completed",
        });
        await this.updateMission(missionId, {
          progress: stage.progressEnd,
        });
      }

      // 3. 完成
      await this.updateMission(missionId, {
        status: "done",
        progress: 100,
        result: {
          summary: `Mission "${missionId}" completed (W3 mock run).`,
          completedAt: new Date().toISOString(),
        },
      });
      await this.emit("company.mission:completed", missionId, userId, {
        missionId,
      });

      this.log.log(`CompanyMission ${missionId} completed`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "unknown error";
      this.log.error(`CompanyMission ${missionId} failed: ${message}`);

      await this.updateMission(missionId, {
        status: "failed",
        result: { error: message, failedAt: new Date().toISOString() },
      }).catch((dbErr: unknown) => {
        this.log.error(
          `Failed to persist failed status for ${missionId}: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`,
        );
      });

      await this.emit("company.mission:failed", missionId, userId, {
        missionId,
        message,
      });
    }
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async updateMission(
    id: string,
    data: Partial<
      Pick<CompanyMission, "status" | "progress"> & {
        result: Prisma.InputJsonValue;
      }
    >,
  ): Promise<void> {
    await this.prisma.companyMission
      .update({ where: { id }, data })
      .catch((err: unknown) => {
        this.log.warn(
          `updateMission ${id} db error: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  private async emit(
    type: string,
    missionId: string,
    userId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.eventBus
      .emit({
        type,
        scope: { missionId, userId },
        payload,
        timestamp: Date.now(),
      })
      .catch((err: unknown) => {
        this.log.warn(
          `emit ${type} for ${missionId} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }
}
