/**
 * RerunGuardService —— 唯一 in-flight 判定单元
 *
 * 设计来源：rerun-overhaul-design-v1.md §3.1 / §3.2 / §3.7
 *
 * 触发事件：mission c195035f 用户连点重跑被拒，错误"is in-flight (heartbeat 1s ago,
 * event 1s ago)"，但 DB status=failed。真因 = 因果倒置（用户行为 emit 的 lifecycle
 * 事件被自己当 mission 活迹读 → 拒绝用户）。
 *
 * 核心机制：
 *   1. checkInFlight：纯读判定，9-cell 决策矩阵（heartbeat 三态 × event 三态 × status）
 *   2. ensureRerunable：入站强校验。in-flight 抛 BadRequest；zombie 主动 cleanup 后放行
 *   3. 业务事件 vs lifecycle 二分（见 event-categories.ts），lifecycle 不算活迹
 *   4. zombieCleanup 走 store.markFailed + store.clearHeartbeat（唯一写源，不裸 UPDATE）
 *
 * 4 路 R1+R2 共识（design v1.1 §11）：
 *   - architect 9.0/10 / reviewer 9/10 / tester 9.2/10 / security YES (medium 残留)
 *   - P0-3: markReopened 不写 heartbeat_at（PR-2 修），保 RerunGuard heartbeat null/stale 永不 inFlight
 *   - P0-4: zombieCleanup 必传 userId，三元 WHERE 防跨用户穿透
 *   - 反向证据 RV-1~RV-9 spec 锚定
 */

import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../../../common/prisma/prisma.service";
import { MissionStore } from "../lifecycle/mission-store.service";
// Note: categorizeEvent 通过 SQL LIKE 字面前缀直接对应（design §3.3 同源约定）；
//   helper 在 spec 层用，service 层不直接 import，避免误用。

/** heartbeat fresh 阈值：< 60s 视为 pod 心跳新鲜 */
const HEARTBEAT_FRESH_THRESHOLD_MS = 60_000;
/** business event fresh 阈值：< 5min 视为业务真活迹（最长 stage 间正常空隙） */
const BUSINESS_EVENT_FRESH_THRESHOLD_MS = 5 * 60_000;

export type MissionStatus =
  | "running"
  | "completed"
  | "failed"
  | "quality-failed"
  | "cancelled";

export interface RerunGuardResult {
  /** mission 当前是否真在跑（语义：拒重跑） */
  inFlight: boolean;
  /** 检测到 zombie（heartbeat 新但 BUSINESS 事件 STALE） */
  zombieDetected: boolean;
  /** mission 当前 status */
  status: MissionStatus;
  /** heartbeat 距今 ms（null = heartbeat_at IS NULL） */
  heartbeatAgeMs: number | null;
  /** 最近 BUSINESS 事件距今 ms（null = 0 业务事件，刚创建/刚 reopen） */
  latestBusinessEventAgeMs: number | null;
  /** 给前端展示的 reason（仅 inFlight=true 时填） */
  reason?: string;
}

@Injectable()
export class RerunGuardService {
  private readonly log = new Logger(RerunGuardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly store: MissionStore,
  ) {}

  /**
   * 唯一 in-flight 判定（**纯读，无副作用** —— RV-6 不变量）。
   *
   * 直接调 checkInFlight 的调用方只能用于观测 / 决策，不能假设它会修复任何状态。
   * 写操作只在 ensureRerunable 中（zombieCleanup）。
   */
  async checkInFlight(
    missionId: string,
    userId: string,
  ): Promise<RerunGuardResult> {
    const detail = await this.store.getById(missionId, userId);
    if (!detail) {
      // userId 隔离：不存在 / 非本人 mission 视为可放行（外层会再 NotFoundException）
      return {
        inFlight: false,
        zombieDetected: false,
        status: "failed",
        heartbeatAgeMs: null,
        latestBusinessEventAgeMs: null,
      };
    }

    const status = detail.status as MissionStatus;
    // status 短路：终态直接放过（与 heartbeat / event 无关）
    if (status !== "running") {
      return {
        inFlight: false,
        zombieDetected: false,
        status,
        heartbeatAgeMs: null,
        latestBusinessEventAgeMs: null,
      };
    }

    const now = Date.now();
    const hbAt = detail.heartbeatAt;
    const heartbeatAgeMs = hbAt ? now - hbAt.getTime() : null;
    const latestBusinessTs = await this.getLatestBusinessEventTs(missionId);
    const latestBusinessEventAgeMs =
      latestBusinessTs != null ? now - latestBusinessTs : null;

    // 9-cell 决策矩阵（design §3.1.1）
    const heartbeatFresh =
      heartbeatAgeMs != null && heartbeatAgeMs < HEARTBEAT_FRESH_THRESHOLD_MS;
    const businessFresh =
      latestBusinessEventAgeMs != null &&
      latestBusinessEventAgeMs < BUSINESS_EVENT_FRESH_THRESHOLD_MS;

    if (heartbeatFresh && businessFresh) {
      // 真在跑
      return {
        inFlight: true,
        zombieDetected: false,
        status,
        heartbeatAgeMs,
        latestBusinessEventAgeMs,
        reason: `heartbeat ${Math.round((heartbeatAgeMs ?? 0) / 1000)}s ago + business event ${Math.round((latestBusinessEventAgeMs ?? 0) / 1000)}s ago`,
      };
    }

    if (heartbeatFresh && !businessFresh) {
      // zombie pod：heartbeat 新但业务停了（含 latestBusinessEventAgeMs=null 的 0 事件场景）
      return {
        inFlight: false,
        zombieDetected: true,
        status,
        heartbeatAgeMs,
        latestBusinessEventAgeMs,
      };
    }

    // heartbeat stale 或 null → 永不 inFlight=true（design §3.5.2 RV-7 不变量）
    return {
      inFlight: false,
      zombieDetected: false,
      status,
      heartbeatAgeMs,
      latestBusinessEventAgeMs,
    };
  }

  /**
   * 入站强校验。所有 rerun entrypoint 调此处。
   *
   * - inFlight=true → 抛 BadRequest，调用方拒绝用户操作
   * - zombieDetected=true → 主动 cleanup（markFailed + clearHeartbeat），用户行为优先
   * - 其余 → 正常返回
   *
   * DB 异常 fail-closed（design §3.1.1 R11）：抛 BadRequest "rerun guard 服务异常"。
   */
  async ensureRerunable(missionId: string, userId: string): Promise<void> {
    let guard: RerunGuardResult;
    try {
      guard = await this.checkInFlight(missionId, userId);
    } catch (err) {
      this.log.warn(
        `[rerun-guard ${missionId}] checkInFlight threw, fail-closed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new BadRequestException("rerun guard 服务异常，请稍后重试");
    }

    if (guard.inFlight) {
      throw new BadRequestException(
        `mission ${missionId} is in-flight (${guard.reason ?? "running"})`,
      );
    }

    if (guard.zombieDetected) {
      await this.zombieCleanup(missionId, userId);
    }
  }

  /**
   * 取 mission 最近一条 BUSINESS 事件的 ts（毫秒）。
   *
   * SQL 用全限定前缀 LIKE，与 event-categories.ts BUSINESS_PREFIXES 字面同源
   * （PR review 必查同步性）。索引：(mission_id, ts) 已存在，2238 行最大
   * mission EXPLAIN 0.056ms，足够。
   */
  private async getLatestBusinessEventTs(
    missionId: string,
  ): Promise<number | null> {
    const rows = await this.prisma.$queryRawUnsafe<{ ts: bigint }[]>(
      `SELECT ts FROM agent_playground_mission_events
       WHERE mission_id = $1
         AND (type LIKE 'agent-playground.dimension:%'
              OR type LIKE 'agent-playground.chapter:%'
              OR type LIKE 'agent-playground.stage:%'
              OR type LIKE 'agent-playground.agent:narrative%'
              OR type LIKE 'agent-playground.tool:%')
       ORDER BY ts DESC LIMIT 1`,
      missionId,
    );
    if (rows.length === 0) return null;
    const tsMs = Number(rows[0].ts);
    return Number.isFinite(tsMs) ? tsMs : null;
  }

  /**
   * 主动清理 zombie mission（design §3.2）。
   *
   * 安全要点（R1 security P0 + R2 medium）：
   *   1. 先 store.getById(missionId, userId)：跨用户 missionId 返回 null → 跳过 cleanup
   *      （防 R2 medium：markFailed userId optional 时 affectedRows=0 但 clearHeartbeat 仍跑）
   *   2. status 已非 running（race 间已变 final）→ 跳过 cleanup
   *   3. 走 store.markFailed(userId) + store.clearHeartbeat(userId)，唯一写源不裸 UPDATE
   *      （feedback_no_dual_sources）
   *   4. errorMessage="zombie-heartbeat-cleanup" 标识与 cascade-aborted 区分（审计追踪）
   */
  private async zombieCleanup(
    missionId: string,
    userId: string,
  ): Promise<void> {
    const detail = await this.store.getById(missionId, userId);
    if (!detail) {
      // 跨用户 missionId / 不存在 → cleanup skip（深度防御）
      this.log.warn(
        `[rerun-guard ${missionId}] zombieCleanup skip: mission not owned by user ${userId}`,
      );
      return;
    }
    if (detail.status !== "running") {
      // race 间已变 final → cleanup skip
      this.log.warn(
        `[rerun-guard ${missionId}] zombieCleanup skip: status=${detail.status} (race resolved)`,
      );
      return;
    }

    await this.store.markFailed(
      missionId,
      { errorMessage: "zombie-heartbeat-cleanup" },
      userId,
    );
    await this.store.clearHeartbeat(missionId, userId).catch((err: unknown) => {
      // best-effort：clearHeartbeat 失败不影响主流程，记 warn 由 prod 观察
      this.log.warn(
        `[rerun-guard ${missionId}] clearHeartbeat threw (best-effort): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
    await this.prisma.agentPlaygroundMissionEvent
      .create({
        data: {
          missionId,
          type: "agent-playground.mission:zombie-cleanup",
          payload: {
            triggeredBy: userId,
            ts: Date.now(),
            reason: "heartbeat fresh but no BUSINESS event ≥ 5min",
          },
          ts: BigInt(Date.now()),
        },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[rerun-guard ${missionId}] emit zombie-cleanup event threw: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
    this.log.warn(
      `[rerun-guard ${missionId}] zombie cleanup performed (user ${userId})`,
    );
  }

  /**
   * 测试钩子：暴露常量给 spec 用（不在生产路径调用）。
   */
  static readonly THRESHOLDS = {
    HEARTBEAT_FRESH_MS: HEARTBEAT_FRESH_THRESHOLD_MS,
    BUSINESS_EVENT_FRESH_MS: BUSINESS_EVENT_FRESH_THRESHOLD_MS,
  };

  /** 测试钩子：注入测试也不需穿层 prisma —— 但 spec 走 mock prisma 即可 */
}

/** 类型导出，给上游调用方用（不用 import 类） */
export type { RerunGuardService as RerunGuardServiceType };
