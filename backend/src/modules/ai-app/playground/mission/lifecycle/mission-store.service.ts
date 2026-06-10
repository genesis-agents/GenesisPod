/**
 * MissionStore — playground mission 持久化（委托入口）
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
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { EmbeddingService } from "@/modules/ai-engine/facade";
import {
  BusinessTeamMissionStoreFramework,
  MissionAbortRegistry,
  MissionAbortReason,
  outcomeFromStatus,
  type MissionStoreHooks,
  type MissionTerminalOutcome,
  type MissionTerminalArbiter,
  type MissionTerminalIntent,
  type MissionLifecycleManager,
} from "@/modules/ai-harness/facade";
import type { PlaygroundConfigSnapshot } from "../../runtime/playground.input-rebuilder";
import { MissionLifecycleHelper } from "./mission-lifecycle.helper";
import {
  CHECKPOINT_KEY,
  PrismaMissionCheckpointStore,
} from "./prisma-mission-checkpoint.store";
import type {
  MissionPersistencePort,
  MissionTerminalDetails,
} from "../../../marketplace/capability";
import {
  MissionFailureCode,
  PrismaVectorStore,
  FailureLearnerService,
} from "@/modules/ai-harness/facade";

/**
 * 每用户最多并发 running mission 数。
 * 单一源：controller 预检（快速 400 UX）+ createMission 原子兜底（堵 TOCTOU race）共用。
 */
export const MAX_CONCURRENT_RUNNING_MISSIONS = 3;

/**
 * createMission 在 advisory-lock 事务内复核仍超并发上限时抛此错误。
 * H4/E9 (2026-05-25)：controller 的 count→create 隔着 async 边界有 TOCTOU race，
 * 两个并发请求可双双过预检 → 绕过限制。此错误是 DB 层原子兜底命中的信号。
 */
export class MissionConcurrencyLimitError extends Error {
  constructor(public readonly running: number) {
    super(
      `已有 ${running} 个 mission 正在运行，最多同时运行 ${MAX_CONCURRENT_RUNNING_MISSIONS} 个`,
    );
    this.name = "MissionConcurrencyLimitError";
  }
}

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
    description: b.description,
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
import {
  CostLedgerStore,
  type CostLedgerEntry,
  type CostLedgerRow,
  type CostLedgerSummary,
} from "./cost-ledger.store";

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

/** Mission create input shape（playground 业务字段）。 */
interface PlaygroundMissionCreateInput {
  readonly id: string;
  readonly userId: string;
  readonly workspaceId?: string;
  readonly topic: string;
  readonly depth: string;
  readonly language: string;
  readonly maxCredits: number;
  readonly userProfile?: Record<string, unknown>;
  readonly configSnapshot?: PlaygroundConfigSnapshot;
}

@Injectable()
export class MissionStore
  extends BusinessTeamMissionStoreFramework<PlaygroundMissionCreateInput>
  implements MissionTerminalArbiter<PlaygroundTerminalExtra>
{
  private readonly storeLog = new Logger(MissionStore.name);

  private readonly lifecycle: MissionLifecycleHelper;
  private readonly update: MissionUpdateHelper;
  private readonly postmortem: MissionPostmortemHelper;
  private readonly report: MissionReportHelper;
  private readonly costLedger: CostLedgerStore;
  /**
   * ★ W3 能力轨：checkpoint 端口落库委托。复用既有 PrismaMissionCheckpointStore
   *   （写 leader_journal.__checkpoint，与 OFF 路同一 framework 实现），仅 ON 路
   *   能力 runner 经 MissionStorePersistenceAdapter 调用。
   */
  private readonly checkpointStore: PrismaMissionCheckpointStore;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() embeddingService?: EmbeddingService,
    @Optional() abortRegistry?: MissionAbortRegistry,
    @Optional() vectorStore?: PrismaVectorStore,
    // S12 失败学习（leader 拒签等 mission 级失败模式）；缺省时端口降级为 no-op。
    @Optional() private readonly failureLearner?: FailureLearnerService,
  ) {
    // Forward references — defined methods on class instance; safe at hook-call time.
    const isMissionRowMissing = (err: unknown): boolean => {
      if (!err || typeof err !== "object") return false;
      const code = (err as { code?: string }).code;
      return code === "P2003" || code === "P2025";
    };
    const emergencyAbort = (missionId: string): void => {
      abortRegistry?.abort(missionId, MissionAbortReason.mission_row_missing);
    };
    const hooks: MissionStoreHooks<PlaygroundMissionCreateInput> = {
      loggerNamespace: MissionStore.name,
      isMissionRowMissing,
      emergencyAbort,
      createMission: async (input) => {
        // ★ H4/E9 (2026-05-25): count + insert 必须原子，否则两个并发请求都过
        //   controller 预检 → 双双建行 → 绕过 <3 限制。用 per-user Postgres
        //   advisory xact lock 串行化同一用户建行：拿锁 → tx 内 count（看得到
        //   已提交行）→ 超限抛 MissionConcurrencyLimitError → 否则 insert。
        //   advisory_xact_lock 随事务结束自动释放；不同用户 hash key 不同不互阻。
        await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`apmission:${input.userId}`}))`;
          const running = await tx.agentPlaygroundMission.count({
            where: { userId: input.userId, status: "running" },
          });
          if (running >= MAX_CONCURRENT_RUNNING_MISSIONS) {
            throw new MissionConcurrencyLimitError(running);
          }
          await tx.agentPlaygroundMission.create({
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
        });
      },
      writeHeartbeat: async (missionId, podId) => {
        await prisma.agentPlaygroundMission.update({
          where: { id: missionId },
          data: { heartbeatAt: new Date(), podId },
        });
      },
      resetHeartbeat: async (missionId, userId) => {
        await prisma.agentPlaygroundMission.updateMany({
          where: { id: missionId, userId },
          data: { heartbeatAt: null },
        });
      },
      findOrphanRunning: async (cutoff, limit) => {
        const orphans = await prisma.agentPlaygroundMission.findMany({
          where: { status: "running", heartbeatAt: { lt: cutoff } },
          select: { id: true, userId: true },
          take: limit,
        });
        return orphans;
      },
      // ★ P-DUR2 (2026-05-30): 多 pod 安全的原子认领单个 orphan。条件写
      //   WHERE id + status='running'：DB 保证 N pod 并发只有一个命中 1 行（赢家），
      //   其余命中 0 行。只有 count===1 的 pod 被授权续跑（rerun），消除重复烧 credit。
      claimOrphanFailed: async (missionId) => {
        const { count } = await prisma.agentPlaygroundMission.updateMany({
          where: { id: missionId, status: "running" },
          data: {
            status: "failed",
            completedAt: new Date(),
            failureCode: "runtime_crashed",
            errorMessage:
              "Mission 在执行中遇到后端重启或异常退出（dispatcher 内存丢失）。" +
              "已自动标记为失败，建议使用顶部「重新运行」按钮重启相同主题。",
          },
        });
        return count === 1;
      },
      writeStageProgress: async (missionId, stageNumber) => {
        await prisma.agentPlaygroundMission.updateMany({
          where: { id: missionId, status: "running" },
          data: { lastCompletedStage: stageNumber, heartbeatAt: new Date() },
        });
      },
      countRunning: async (userId) =>
        prisma.agentPlaygroundMission.count({
          where: { userId, status: "running" },
        }),
    };
    super(hooks);

    this.lifecycle = new MissionLifecycleHelper(
      prisma,
      isMissionRowMissing,
      (missionId, reason) => this.triggerEmergencyAbort(missionId, reason),
      this.clearCheckpointJsonbKey.bind(this),
    );
    this.update = new MissionUpdateHelper(prisma);
    this.postmortem = new MissionPostmortemHelper(
      prisma,
      embeddingService,
      vectorStore,
    );
    this.report = new MissionReportHelper(
      prisma,
      isMissionRowMissing,
      (missionId, reason) => this.triggerEmergencyAbort(missionId, reason),
    );
    this.costLedger = new CostLedgerStore(prisma);
    this.checkpointStore = new PrismaMissionCheckpointStore(prisma);
  }

  /**
   * ★ W3 能力轨：返回 MissionPersistencePort 视图（薄封装本 store + 注入的
   *   lifecycleManager）。ON 路 dispatcher 把它注入 ICapabilityRunner.run 的
   *   ctx.persistence，让能力内核经端口落 playground 库（checkpoint/resume +
   *   终态仲裁），不见任何具体 store 类型。
   *
   * 为何不让 MissionStore 直接 implements MissionPersistencePort：本 store 已实现
   *   harness MissionTerminalArbiter 的 `applyTerminalIfRunning(missionId, intent)`
   *   （2 参 intent 对象签名），与端口的 `applyTerminalIfRunning(missionId, outcome,
   *   details)`（3 参）**同名不同签**，无法在同一 class 共存。故用独立 adapter
   *   隔离两套契约（store 保留 arbiter 视图，adapter 提供端口视图），二者都走同一
   *   lifecycleManager.finalize 仲裁，行为一致。
   */
  asPersistencePort(
    lifecycleManager: MissionLifecycleManager,
  ): MissionPersistencePort {
    return new MissionStorePersistenceAdapter(
      this,
      this.checkpointStore,
      lifecycleManager,
      this.postmortem,
      this.failureLearner,
    );
  }

  /** mission → userId（FailureLearner 记录归属用），无行返回 null。 */
  async findMissionUserId(missionId: string): Promise<string | null> {
    const row = await this.prisma.agentPlaygroundMission.findUnique({
      where: { id: missionId },
      select: { userId: true },
    });
    return row?.userId ?? null;
  }

  /**
   * 当前用户最旧的 running mission id（createdAt 升序首个），无则 null。
   * auto-supersede 用：撞并发上限时顶替最旧，让用户新建不被 400 卡死。
   */
  async findOldestRunningMissionId(userId: string): Promise<string | null> {
    const row = await this.prisma.agentPlaygroundMission.findFirst({
      where: { userId, status: "running" },
      orderBy: { startedAt: "asc" },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  private async clearCheckpointJsonbKey(missionId: string): Promise<void> {
    await this.prisma.$executeRaw`
        UPDATE agent_playground_missions
        SET leader_journal = COALESCE(leader_journal, '{}'::jsonb) - ${CHECKPOINT_KEY}
        WHERE id = ${missionId}
          AND leader_journal ? ${CHECKPOINT_KEY}
      `.catch((err: unknown) => {
      this.storeLog.error(
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
          await this.reconcileTerminalCost(missionId, extra.detail),
          extra.userId,
        );
      case "failed":
        return this.lifecycle.writeFailed(
          missionId,
          await this.reconcileTerminalCost(missionId, extra.detail),
          extra.userId,
        );
      case "cancelled":
        return this.lifecycle.writeCancelled(missionId, extra.userId);
    }
  }

  /**
   * ★ Wire-Cost (2026-05-30)：终态 costUsd/tokensUsed 改取成本台账 SUM（DB 端权威值），
   * 替代 budget pool 标量快照漂移。台账有行 → 覆盖；无行（legacy / 无 LLM 结算）→
   * 保留调用方传入的标量，保证向后兼容不丢值。
   */
  private async reconcileTerminalCost<
    T extends { tokensUsed?: number; costUsd?: number },
  >(missionId: string, detail: T): Promise<T> {
    const summary = await this.costLedger.sumByMission(missionId);
    if (summary.entryCount === 0) return detail; // 无台账留痕：回退标量，不覆盖
    return {
      ...detail,
      tokensUsed: summary.totalTokens,
      costUsd: summary.costUsd,
    };
  }

  // ── Cost ledger delegates (Wire-Cost) ─────────────────────────────────────

  /** stage / role 结算点追加一行成本台账（fire-and-forget；失败结构化 warn 不吞错）。 */
  appendCostEntry(entry: CostLedgerEntry): Promise<boolean> {
    return this.costLedger.appendCostEntry(entry);
  }

  /** 单 mission 成本求和（终态 costUsd/tokensUsed 取此值）。 */
  sumCostByMission(missionId: string): Promise<CostLedgerSummary> {
    return this.costLedger.sumByMission(missionId);
  }

  /** 单 mission 成本明细（per-stage/role/model 列行，供审计 / 成本面板）。 */
  listCostByMission(missionId: string): Promise<CostLedgerRow[]> {
    return this.costLedger.listByMission(missionId);
  }

  // ── CRUD / heartbeat / stage / orphan: framework 已提供
  //    refreshHeartbeat / clearHeartbeat / markStageComplete /
  //    cleanupOrphanRunningMissionsAtomic / countRunningByUser / create
  // ──────────────────────────────────────────────────────────────────────────

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
  // countRunningByUser: framework 已提供

  async deleteByUser(id: string, userId: string): Promise<void> {
    await this.prisma.agentPlaygroundMission
      .deleteMany({ where: { id, userId } })
      .catch((err: unknown) => {
        this.storeLog.warn(
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
          this.storeLog.warn(
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

  /**
   * ★ 任务分解可见（2026-06-09）：能力轨 s2 plan 产出维度后，把规划维度落到 dimensions 列，
   *   让前端"任务分解"面板**运行中即可见**（前端读 row.dimensions）。OFF 路是 s2 stage 直接
   *   写；能力轨经 MissionStorePersistenceAdapter.saveCheckpoint（s2 完成后）调本方法。
   *   仅当列尚空时写（首写赢，不 clobber 用户后续 appendDimensions 的维度）。
   */
  async savePlanDimensions(
    missionId: string,
    dims: ReadonlyArray<{ id?: string; name: string; rationale?: string }>,
  ): Promise<void> {
    if (dims.length === 0) return;
    try {
      const row = await this.prisma.agentPlaygroundMission.findUnique({
        where: { id: missionId },
        select: { status: true, dimensions: true },
      });
      if (!row || row.status !== "running") return;
      const existing = (row.dimensions ?? []) as unknown[];
      if (existing.length > 0) return; // 已有（plan 已写 / user 已加）→ 不覆盖
      const normalized = dims
        .filter((d) => typeof d?.name === "string" && d.name.length > 0)
        .map((d, i) => ({
          id: typeof d.id === "string" ? d.id : `dim-${i + 1}`,
          name: String(d.name)
            .replace(/[\r\n]/g, " ")
            .trim()
            .slice(0, 200),
          rationale:
            typeof d.rationale === "string"
              ? d.rationale
                  .replace(/[\r\n]/g, " ")
                  .trim()
                  .slice(0, 500)
              : "",
          source: "plan" as const,
        }));
      if (normalized.length === 0) return;
      await this.prisma.agentPlaygroundMission.update({
        where: { id: missionId },
        data: { dimensions: normalized as never },
      });
    } catch (err: unknown) {
      this.storeLog.warn(
        `[savePlanDimensions ${missionId}] failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
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

  /**
   * 仅取 mission 的 notify 元信息（userId + topic），按 id 查（无需 userId）。
   * 用于 liveness 回收路径发 MISSION_FAILED 通知 —— 那里只有 missionId，
   * mission:failed 事件的 userId 是空串，需从 DB 反查真实 owner。
   */
  async getMetaForNotify(
    missionId: string,
  ): Promise<{ userId: string; topic: string } | null> {
    const row = await this.prisma.agentPlaygroundMission.findUnique({
      where: { id: missionId },
      select: { userId: true, topic: true },
    });
    return row ? { userId: row.userId, topic: row.topic } : null;
  }

  /**
   * ★ P-IDOR2：按 id 查 mission 的读访问元信息（owner + visibility），**不**带
   * userId 过滤。供 `BaseMissionController.assertReadAccess` 判定 own ∨ PUBLIC ∨
   * SHARED+TopicMember —— `getById(id, userId)` 按 (id, userId) 过滤，非所有者
   * 永远 miss，无法支撑 PUBLIC/SHARED 放行，故需本方法暴露真实 owner/visibility。
   *
   * AgentPlaygroundMission 多租户走 workspaceId，无 topicId，故 topicId 恒为 null
   * （SHARED+TopicMember 在 mission 落地 topicId 前不放行，不杜撰）。查不到 → null。
   */
  async getAccessMetaById(missionId: string): Promise<{
    userId: string;
    visibility: ContentVisibility;
    topicId: string | null;
  } | null> {
    const row = await this.prisma.agentPlaygroundMission.findUnique({
      where: { id: missionId },
      select: { userId: true, visibility: true },
    });
    return row
      ? { userId: row.userId, visibility: row.visibility, topicId: null }
      : null;
  }
}

/**
 * recipe stepId → playground DB stageNumber 映射（与
 * PlaygroundBusinessOrchestrator.STAGE_NUMBER 同表）。adapter 自持一份避免反向依赖
 * dispatcher（business-orchestrator）造成模块环。deep-insight recipe 的 stepId 与
 * playground 私有 14 步一一对齐（s1-budget … s11-persist），故同表可复用。
 */
const STEP_ID_TO_STAGE_NUMBER: Readonly<Record<string, number>> = {
  "s1-budget": 1,
  "s2-leader-plan": 2,
  "s3-researcher-collect": 3,
  "s4-leader-assess": 4,
  "s5-reconciler": 5,
  "s6-analyst": 6,
  "s7-writer-outline": 7,
  "s8-writer": 8,
  "s8b-quality-enhancement": 8,
  "s9-critic": 9,
  "s9b-objective-eval": 9,
  "s10-leader-foreword-signoff": 10,
  "s11-persist": 11,
};

/**
 * MissionStorePersistenceAdapter —— MissionStore 的 MissionPersistencePort 视图。
 *
 * 薄封装：checkpoint 委托 PrismaMissionCheckpointStore、stage 进度委托
 * store.markStageComplete、终态委托 lifecycleManager.finalize（经 store 这个 arbiter
 * 条件写 WHERE status='running'，首写赢终态语义）。
 *
 * ★ #16b（2026-06-09）：能力轨是 playground 唯一执行轨，本适配器经 ICapabilityRunner.run
 * 的 ctx.persistence 承载全部 mission 的 checkpoint / 进度 / 终态写。
 * ★ Fix 4 (2026-06-09)：saveResearchResult / saveReportVersion 已实现，委托 MissionStore
 * 的同名方法（MissionReportHelper），使成功 run 后版本历史有记录、"更新"基线不为空。
 * leaderSigned 补充写入 completed/failed intent（从 leaderSignOff.signed 提取）。
 * 发射端现状：deep-insight runner 当前不调用 saveResearchResult/saveReportVersion（见 grep
 * marketplace/capabilities/deep-insight，0 命中），实现完成但"待发射端接线"。
 */
export class MissionStorePersistenceAdapter implements MissionPersistencePort {
  /** checkpoint payload 形状（与 ON 路自洽；OFF 路 payload 用 lastStage 字段，互不混用）。 */
  private readonly log = new Logger(MissionStorePersistenceAdapter.name);

  constructor(
    private readonly store: MissionStore,
    private readonly checkpointStore: PrismaMissionCheckpointStore,
    private readonly lifecycleManager: MissionLifecycleManager,
    private readonly postmortem: MissionPostmortemHelper,
    private readonly failureLearner?: FailureLearnerService,
  ) {}

  // ── 核心：crash-resume ──

  async markStageProgress(missionId: string, stepId: string): Promise<void> {
    const stageNumber = STEP_ID_TO_STAGE_NUMBER[stepId];
    if (stageNumber == null) return; // 未知 stepId（如 s12）不计进度，静默跳过。
    await this.store.markStageComplete(missionId, stageNumber);
  }

  async saveCheckpoint(
    missionId: string,
    snapshot: {
      lastStepId: string;
      topic: string;
      crossState: Readonly<Record<string, unknown>>;
    },
  ): Promise<boolean> {
    // payload 自洽：ON 路 resume 由 loadCheckpoint 读回同形状（lastStepId + crossState
    // 为能力核 CrossStageState.toJSON()，含 deep-insight.* 前缀键，与 OFF 路字段空间隔离）。
    // completedKeys 取该 step 及之前所有 step id（按 stageNumber 升序），供 framework
    // 推导可跳过步骤集合。
    const stageNumber = STEP_ID_TO_STAGE_NUMBER[snapshot.lastStepId] ?? 0;
    const completedKeys = Object.keys(STEP_ID_TO_STAGE_NUMBER).filter(
      (k) => (STEP_ID_TO_STAGE_NUMBER[k] ?? Infinity) <= stageNumber,
    );
    await this.checkpointStore.save({
      missionId,
      savedAt: new Date(),
      payload: {
        lastStepId: snapshot.lastStepId,
        topic: snapshot.topic,
        crossState: snapshot.crossState,
      },
      completedKeys,
      status: "running",
    });
    return true;
  }

  async loadCheckpoint(missionId: string): Promise<{
    lastStepId: string;
    topic: string;
    crossState: Readonly<Record<string, unknown>>;
  } | null> {
    const snap = await this.checkpointStore.load(missionId);
    if (!snap || snap.status !== "running") return null;
    const payload = snap.payload as {
      lastStepId?: string;
      topic?: string;
      crossState?: Record<string, unknown>;
    } | null;
    // 仅认 ON 路写入的 payload（带 lastStepId）；OFF 路 payload（lastStage 字段、
    // 无 lastStepId）→ 不在 ON 路 resume，返回 null（不混用，与 §3 兼容结论一致）。
    if (!payload?.lastStepId || !payload.crossState) return null;
    return {
      lastStepId: payload.lastStepId,
      topic: payload.topic ?? "",
      crossState: payload.crossState,
    };
  }

  async clearCheckpoint(missionId: string): Promise<void> {
    await this.checkpointStore.clear(missionId);
  }

  // ── 可选端口：维度持久化（能力核 s2 plan 完成后 fire-and-forget 调）──

  async recordPlanDimensions(
    missionId: string,
    dims: ReadonlyArray<{ id?: string; name: string; rationale?: string }>,
  ): Promise<void> {
    await this.store
      .savePlanDimensions(missionId, dims)
      .catch((err: unknown) => {
        this.log.warn(
          `[recordPlanDimensions ${missionId}] non-fatal: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  // ── 可选端口：S12 postmortem 写（能力核 fire-and-forget 调）──

  async recordPostmortem(args: {
    readonly missionId: string;
    readonly userId: string;
    readonly topic: string;
    readonly summary: string;
    readonly recommendations: readonly string[];
    readonly leaderSigned: boolean | null;
    readonly qualityScore: number | null;
    readonly tokensUsed: number;
    readonly costUsd: number;
    readonly source: string;
    readonly tags: readonly string[];
    readonly failureClassification?: {
      readonly mode: string;
      readonly signals: readonly string[];
      readonly confidence: number;
    };
  }): Promise<void> {
    await this.postmortem
      .recordMissionPostmortem({
        missionId: args.missionId,
        userId: args.userId,
        topic: args.topic,
        summary: args.summary,
        recommendations: args.recommendations as string[],
        leaderSigned: args.leaderSigned,
        qualityScore: args.qualityScore,
        tokensUsed: args.tokensUsed,
        costUsd: args.costUsd,
        ...(args.failureClassification
          ? {
              failureClassification: {
                mode: args.failureClassification.mode,
                signals: args.failureClassification.signals as string[],
                confidence: args.failureClassification.confidence,
              },
            }
          : {}),
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[recordPostmortem ${args.missionId}] non-fatal: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  // ── 可选端口：S12 postmortem recall（能力核 run() 开始前调）──

  async recallPostmortems(args: {
    userId: string;
    topic: string;
    limit?: number;
  }): Promise<
    ReadonlyArray<{
      missionId: string;
      topic: string;
      summary: string;
      recommendations: string[];
      leaderSigned: boolean | null;
      qualityScore: number | null;
      createdAt: string;
    }>
  > {
    try {
      const rows = await this.postmortem.listRecentPostmortems(
        args.userId,
        args.limit ?? 3,
        args.topic,
      );
      return rows.map((r) => ({
        missionId: r.missionId,
        topic: r.topic,
        summary: r.summary,
        recommendations: r.recommendations,
        leaderSigned: r.leaderSigned,
        qualityScore: r.qualityScore,
        createdAt:
          r.createdAt instanceof Date
            ? r.createdAt.toISOString()
            : String(r.createdAt),
      }));
    } catch (err: unknown) {
      this.log.warn(
        `[recallPostmortems userId=${args.userId}] non-fatal: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  // ── 可选端口：S12 失败模式记录（能力核 fire-and-forget 调）──
  // 委托 FailureLearnerService（MissionStore 注入后经构造参数透传）；key 形状与
  // 旧 s12-self-evolution.stage.ts:194-201 完全一致，保证历史 pattern 行继续累加。
  async recordFailurePattern(input: {
    missionId: string;
    topic: string;
    failureCode: string;
    model?: string;
  }): Promise<void> {
    if (!this.failureLearner) return;
    const userId = await this.store.findMissionUserId(input.missionId);
    if (!userId) {
      this.log.warn(
        `[recordFailurePattern ${input.missionId}] mission row missing, skip`,
      );
      return;
    }
    await this.failureLearner.recordFailure({
      key: {
        agentSpecId: "playground.mission",
        modelId: input.model ?? "(mission-level)",
        systemPrompt: input.topic || input.missionId,
        failureCode: input.failureCode,
      },
      missionId: input.missionId,
      userId,
      diagnostic: { topic: input.topic },
    });
  }

  // ── 可选端口：trajectory（UI 展示 / 重跑复用）── Fix 4 (2026-06-09)

  /**
   * 维度研究结果持久化（能力核 s3/s4 fire-and-forget 调）。
   * 委托 MissionStore → MissionReportHelper.saveResearchResult（upsert agentPlaygroundResearchResult）。
   * findings 类型从端口 ReadonlyArray<unknown> 安全转换（mission-report.helper 内部 Prisma 会
   * 把整个 array 存为 JSONB，强转不影响 DB 写入；读回路 loadBaselineResearchResults 返回原形）。
   */
  async saveResearchResult(args: {
    missionId: string;
    dimension: string;
    findings: ReadonlyArray<unknown>;
    summary: string;
    state: "completed" | "failed";
  }): Promise<boolean> {
    await this.store
      .saveResearchResult({
        missionId: args.missionId,
        dimension: args.dimension,
        findings: args.findings as {
          claim: string;
          evidence: string;
          source: string;
        }[],
        summary: args.summary,
        state: args.state,
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[saveResearchResult ${args.missionId}] dim=${args.dimension} failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    return true;
  }

  /**
   * 报告版本持久化（能力核 s11 fire-and-forget 调）。
   * 委托 MissionStore → MissionReportHelper.saveReportVersion（upsert missionReportVersion）。
   * port triggerType "initial"/"rerun-fresh" 透传给 helper（helper 接受 string）。
   */
  async saveReportVersion(args: {
    missionId: string;
    triggerType: "initial" | "rerun-fresh";
    reportFull?: unknown;
    reportTitle?: string;
    reportSummary?: string;
    finalScore?: number;
    leaderSigned?: boolean;
  }): Promise<number> {
    // 组装 report 对象（helper 期望 { title?, summary?, ... }）。
    const report =
      args.reportFull && typeof args.reportFull === "object"
        ? {
            ...(args.reportFull as Record<string, unknown>),
            ...(args.reportTitle != null ? { title: args.reportTitle } : {}),
            ...(args.reportSummary != null
              ? { summary: args.reportSummary }
              : {}),
          }
        : args.reportTitle != null || args.reportSummary != null
          ? {
              ...(args.reportTitle != null ? { title: args.reportTitle } : {}),
              ...(args.reportSummary != null
                ? { summary: args.reportSummary }
                : {}),
            }
          : undefined;
    return this.store
      .saveReportVersion({
        missionId: args.missionId,
        triggerType: args.triggerType,
        report,
        finalScore: args.finalScore,
        leaderSigned: args.leaderSigned,
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[saveReportVersion ${args.missionId}] failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
        );
        return 0;
      });
  }

  // ── 终态：条件写仲裁（经 lifecycleManager.finalize → store arbiter）──

  async applyTerminalIfRunning(
    missionId: string,
    outcome: "completed" | "failed" | "cancelled",
    details: MissionTerminalDetails,
  ): Promise<boolean> {
    const intent = this.buildTerminalIntent(outcome, details);
    try {
      const { won } =
        await this.lifecycleManager.finalize<PlaygroundTerminalExtra>({
          missionId,
          intent,
          arbiter: this.store,
        });
      return won;
    } catch (err) {
      this.log.warn(
        `[asPersistencePort ${missionId}] finalize(${outcome}) failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }
  }

  /** MissionTerminalDetails（能力端口）→ playground arbiter intent（含富载荷）。 */
  private buildTerminalIntent(
    outcome: "completed" | "failed" | "cancelled",
    details: MissionTerminalDetails,
  ): MissionTerminalIntent<PlaygroundTerminalExtra> {
    const costUsd =
      typeof details.costCents === "number"
        ? details.costCents / 100
        : undefined;
    // report：端口为 unknown，arbiter detail 期望 { title?, summary?, ... } 形状；
    // 仅当是 object 时透传，否则忽略（不杜撰）。
    const report =
      details.report && typeof details.report === "object"
        ? (details.report as {
            title?: string;
            summary?: string;
            [k: string]: unknown;
          })
        : undefined;
    // ★ Fix 4 (2026-06-09)：leaderSigned 从 details.leaderSignOff.signed 提取（能力端口把
    //   leader signoff 整体放 leaderSignOff，signed 布尔在其中）。确认 schema 有 leader_signed 列。
    const leaderSignedFromSignOff =
      details.leaderSignOff &&
      typeof details.leaderSignOff === "object" &&
      typeof (details.leaderSignOff as Record<string, unknown>).signed ===
        "boolean"
        ? ((details.leaderSignOff as Record<string, unknown>).signed as boolean)
        : undefined;

    if (outcome === "cancelled") {
      return { status: "failed", extra: { kind: "cancelled" } };
    }
    if (outcome === "failed") {
      return {
        status: "failed",
        extra: {
          kind: "failed",
          detail: {
            ...(details.errorMessage != null
              ? { errorMessage: details.errorMessage }
              : {}),
            ...(details.failureCode != null
              ? { failureCode: details.failureCode as MissionFailureCode }
              : {}),
            ...(typeof details.tokensUsed === "number"
              ? { tokensUsed: details.tokensUsed }
              : {}),
            ...(costUsd != null ? { costUsd } : {}),
            ...(typeof details.elapsedWallTimeMs === "number"
              ? { elapsedWallTimeMs: details.elapsedWallTimeMs }
              : {}),
            ...(details.themeSummary != null
              ? { themeSummary: details.themeSummary }
              : {}),
            ...(details.dimensions !== undefined
              ? { dimensions: details.dimensions }
              : {}),
            ...(report !== undefined ? { report } : {}),
            ...(details.verdicts !== undefined
              ? { verdicts: details.verdicts }
              : {}),
            // leaderSigned=false が仲裁側で quality-failed に昇格（既存ロジック）。
            ...(leaderSignedFromSignOff !== undefined
              ? { leaderSigned: leaderSignedFromSignOff }
              : {}),
          },
        },
      };
    }
    // completed
    return {
      status: "completed",
      extra: {
        kind: "completed",
        detail: {
          ...(typeof details.finalScore === "number"
            ? { finalScore: details.finalScore }
            : {}),
          ...(typeof details.tokensUsed === "number"
            ? { tokensUsed: details.tokensUsed }
            : {}),
          ...(costUsd != null ? { costUsd } : {}),
          ...(typeof details.elapsedWallTimeMs === "number"
            ? { elapsedWallTimeMs: details.elapsedWallTimeMs }
            : {}),
          ...(details.themeSummary != null
            ? { themeSummary: details.themeSummary }
            : {}),
          ...(details.dimensions !== undefined
            ? { dimensions: details.dimensions }
            : {}),
          ...(report !== undefined ? { report } : {}),
          ...(details.verdicts !== undefined
            ? { verdicts: details.verdicts }
            : {}),
          // ★ Fix 4 (2026-06-09)：completed 分支补 leaderSigned（从 leaderSignOff.signed 提取）。
          ...(leaderSignedFromSignOff !== undefined
            ? { leaderSigned: leaderSignedFromSignOff }
            : {}),
        },
      },
    };
  }
}
