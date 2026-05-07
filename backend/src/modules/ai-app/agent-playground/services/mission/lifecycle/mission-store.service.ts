/**
 * MissionStore — agent-playground mission 持久化
 *
 * 启动 mission 时插入 record (status=running)，完成/失败时 update。
 * 列表页 / detail 页查询用。
 */

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  PayloadTooLargeException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../../../common/prisma/prisma.service";
import { EmbeddingService } from "@/modules/ai-engine/facade";

export interface MissionListItem {
  id: string;
  topic: string;
  depth: string;
  language: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  wallTimeMs: number | null;
  finalScore: number | null;
  tokensUsed: number | null;
  costUsd: number | null;
  reportTitle: string | null;
  reportSummary: string | null;
  errorMessage: string | null;
}

export interface MissionDetail extends MissionListItem {
  maxCredits: number;
  themeSummary: string | null;
  dimensions: unknown;
  reportFull: unknown;
  verdicts: unknown;
  trajectoryStored: number | null;
  // Phase P3-19: v2 字段
  reportArtifactVersion: number | null;
  userProfile: unknown;
  reconciliationReport: unknown;
  // ★ Phase Lead-1+: Leader-Replanner-Lite 字段
  leaderJournal: unknown;
  leaderOverallScore: number | null;
  leaderSigned: boolean | null;
  leaderVerdict: string | null;
  lastCompletedStage?: number | null;
  // ★ PR-R0/R2 (2026-05-07 per-task rerun + cascade): cascade rerun 中间产物字段
  outlinePlan?: unknown;
  analystOutput?: unknown;
  heartbeatAt?: Date | null;
}

@Injectable()
export class MissionStore {
  private readonly log = new Logger(MissionStore.name);

  constructor(
    private readonly prisma: PrismaService,
    /** C4 (2026-05-05): postmortem 真 embedding 闭环
     *  Optional 注入：DI 没接通时 fall back 到 tag 召回（无回归） */
    @Optional() private readonly embeddingService?: EmbeddingService,
  ) {}

  async create(input: {
    id: string;
    userId: string;
    workspaceId?: string;
    topic: string;
    depth: string;
    language: string;
    maxCredits: number;
    /** 用户档位快照 —— 在创建时就写入，避免 cancelled/failed 时丢失配置可见性 */
    userProfile?: Record<string, unknown>;
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
        userProfile: (input.userProfile ?? null) as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * 启动恢复：把所有 status='running' 但已经超过 maxAgeMinutes 的 mission
   * 标记为 failed（Railway 重启后 in-memory orchestrator 已死，但 DB 还停在 running）
   */
  /**
   * ★ P0-R5-1 (2026-04-30): 终态化 mission 时一并清掉 leaderJournal.__checkpoint
   *   避免 quality-failed / orphaned mission 的 checkpoint 残留导致后续 listResumable
   *   误显示"可恢复"。用 PostgreSQL 内建的 jsonb `-` 算子原子删除 key。
   */
  private async clearCheckpointJsonbKey(missionId: string): Promise<void> {
    // ★ 2026-04-30 fix: raw SQL 必须用 DB 实际表/列名（@@map / @map 后的 snake_case），
    // 不能用 Prisma model 名（PascalCase），否则 relation/column does not exist。
    await this.prisma.$executeRaw`
        UPDATE agent_playground_missions
        SET leader_journal = COALESCE(leader_journal, '{}'::jsonb) - '__checkpoint'
        WHERE id = ${missionId}
          AND leader_journal ? '__checkpoint'
      `.catch((err: unknown) => {
      // ★ 全覆盖审计修 (2026-05-06): 改为 log.error 让 Railway 可见，不再静默吞错
      this.log.error(
        `[clearCheckpoint ${missionId}] update failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 0;
    });
  }

  // ★ 2026-05-05 unified MissionLivenessGuard 接管 ——
  // recoverOrphanedRunning + recoverPodCrashedRunning 已下线（之前两个 detector 误杀
  // 5 mission 100% 的根因），归并到 ai-harness/lifecycle/mission-liveness-guard.service.ts，
  // playground module 通过 livenessGuard.registerAdapter('agent-playground', ...) 接入。
  //
  // 当前 store 仅保留 mission 写路径（refreshHeartbeat / markStageComplete /
  // clearCheckpointJsonbKey）；adapter callback 在 module 内联实现，不再有 store-level
  // recovery 函数（防止其他 ai-app 复制粘贴老逻辑）。

  /**
   * ★ PR-H v1 (2026-05-01): pod-aware heartbeat 刷新
   *
   * runMission 主循环每 30s 调一次。pod 死后 heartbeatAt 不再刷新，
   * recovery 服务扫到 stale 90s + status=running → 标记 failed。
   *
   * 静默吞 catch —— 心跳失败不能挂掉主流程。
   */
  async refreshHeartbeat(id: string, podId: string): Promise<void> {
    await this.prisma.agentPlaygroundMission
      .update({
        where: { id },
        data: { heartbeatAt: new Date(), podId },
      })
      .catch((err: unknown) => {
        // ★ 全覆盖审计修 (2026-05-06): heartbeat 失败改为 log.error 让 Railway 可见（不阻断主流程）
        this.log.error(
          `[heartbeat ${id}] failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  /**
   * ★ #88 (2026-05-06): pod restart 时 dispatcher 内存丢失所有 active session，
   * 但 DB status='running' 不会自动改。本方法扫所有 heartbeat 已停 ≥ thresholdMs
   * 的 'running' mission，主动 mark failed，让用户立即看到状态而非等 15 min
   * Liveness Guard 兜底。
   *
   * 返回被清理的 mission 列表（id + userId），让 dispatcher 可以 emit mission:failed event。
   *
   * 静默吞 catch — cleanup 失败不能阻断 dispatcher boot。
   */
  async cleanupOrphanRunningMissions(
    thresholdMs: number,
  ): Promise<{ id: string; userId: string }[]> {
    try {
      const cutoff = new Date(Date.now() - thresholdMs);
      // 找 orphan: status='running' 且 heartbeatAt < cutoff
      const orphans = await this.prisma.agentPlaygroundMission.findMany({
        where: {
          status: "running",
          heartbeatAt: { lt: cutoff },
        },
        select: { id: true, userId: true },
        take: 200,
      });
      if (orphans.length === 0) return [];
      // 批量 mark failed（updateMany 防误改 status='completed' 的 race）
      await this.prisma.agentPlaygroundMission.updateMany({
        where: {
          id: { in: orphans.map((o) => o.id) },
          status: "running",
        },
        data: {
          status: "failed",
          completedAt: new Date(),
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

  /**
   * ★ PR-H v1: stage 完成进度（单调递增）
   *
   * 每个 stage 完成后调用，写 last_completed_stage 字段。
   * 当前只是观测用；PR-H v2 将基于此字段做 resume from checkpoint。
   */
  async markStageComplete(id: string, stageNumber: number): Promise<void> {
    // ★ P0-9 (audit 2026-05-06): 加 status='running' guard，防止 mission 已 cancelled
    //   后 stage 仍写 lastCompletedStage 混淆 resume 逻辑。updateMany 返回 count=0
    //   时静默跳过（已终态的 mission 不该接收新 stage 完成信号）。
    await this.prisma.agentPlaygroundMission
      .updateMany({
        where: { id, status: "running" },
        data: { lastCompletedStage: stageNumber, heartbeatAt: new Date() },
      })
      .catch((err: unknown) => {
        this.log.error(
          `[markStageComplete ${id} s${stageNumber}] failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  async markCompleted(
    id: string,
    data: {
      finalScore?: number;
      tokensUsed?: number;
      costUsd?: number;
      trajectoryStored?: number;
      wallTimeMs?: number;
      themeSummary?: string;
      dimensions?: unknown;
      report?: { title?: string; summary?: string; [k: string]: unknown };
      verdicts?: unknown;
      // ★ Phase P0-3 / P0-4：v2 持久化字段
      reportArtifactVersion?: number;
      userProfile?: unknown;
      reconciliationReport?: unknown;
      // ★ Phase Lead-1+: Leader-Replanner-Lite
      leaderJournal?: unknown;
      leaderOverallScore?: number;
      leaderSigned?: boolean;
      leaderVerdict?: string;
    },
  ): Promise<void> {
    // Phase P17-2: report JSONB 大小 guard（PostgreSQL JSONB 默认 max ~1GB，
    // 但 Prisma 序列化中间步会爆内存；超 10MB 时硬拒，超 5MB 时截断 fullMarkdown）
    const MAX_REPORT_BYTES = 5 * 1024 * 1024;
    const HARD_LIMIT_BYTES = 10 * 1024 * 1024;
    if (data.report && typeof data.report === "object") {
      const size = Buffer.byteLength(JSON.stringify(data.report), "utf8");
      if (size > HARD_LIMIT_BYTES) {
        // P2: 硬拒超大 report，让 mission 标 failed(report_too_large) 而非写入 OOM
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
          // ★ P1-B (2026-04-29): 落 flag 让下游 postmortem learner / 前端 stats
          // 知道 fullMarkdown 已被截断，避免按完整长度计算引用密度等指标
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
      wallTimeMs: data.wallTimeMs ?? null,
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
      // Leader-Replanner-Lite 字段（仅在新方案启用时写入）
      leaderJournal:
        data.leaderJournal !== undefined
          ? ((data.leaderJournal ?? null) as Prisma.InputJsonValue)
          : undefined,
      leaderOverallScore: data.leaderOverallScore ?? null,
      leaderSigned: data.leaderSigned ?? null,
      leaderVerdict: data.leaderVerdict ?? null,
    };
    // 防止覆盖用户已取消的 mission（updateMany 带 status='running' guard，
    // 已 cancelled / failed 的不会被改写为 completed）
    await this.prisma.agentPlaygroundMission
      .updateMany({
        where: { id, status: "running" },
        data: update,
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[markCompleted ${id}] guarded update failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    // ★ P0-R5-1: 成功完成也清 checkpoint，避免 listResumable 把已 completed 的视作可恢复
    await this.clearCheckpointJsonbKey(id);
  }

  /**
   * ★ Phase Lead-1+: Leader-Replanner-Lite —— 增量写 leader_journal
   *
   * 每个 milestone（M0 plan / M1 research-fail / M4 weak-report / M6 foreword）
   * 完成后调用，把当前 milestone 的产物 merge 进 leader_journal jsonb。
   *
   * 不依赖 status='running' guard —— 即使 mission 已 cancelled 也允许写入决策记录，
   * 方便事后审计 / 复盘 Leader 在 mission 失败前的判断。
   *
   * ★ P0 并发安全 (2026-05-06): 原 read→merge→write 三步无原子性，并发调用会造成
   * 后写覆盖先写。现在用 serializable $transaction 包裹整个 read+write，DB 层防冲突。
   * decisions 数组合并保留：tx 内 select + concat + update。
   */
  async appendLeaderJournal(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const row = await tx.agentPlaygroundMission.findUnique({
            where: { id },
            select: { leaderJournal: true },
          });
          const current =
            (row?.leaderJournal as Record<string, unknown> | null) ?? {};
          const merged = { ...current, ...patch };
          // decisions 是数组，要 concat 而不是 replace
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

  /**
   * ★ P0 并发限制 (2026-05-06): 查询某 user 当前 running mission 数量，
   * 给 controller runTeam 做启动前 gate check 用。
   */
  async countRunningByUser(userId: string): Promise<number> {
    return this.prisma.agentPlaygroundMission.count({
      where: { userId, status: "running" },
    });
  }

  /**
   * 用户删除自己的 mission（带 userId guard 防越权）。
   * 关联的 trace events / leader chat 由数据库 onDelete: Cascade 自动清理。
   */
  async deleteByUser(id: string, userId: string): Promise<void> {
    await this.prisma.agentPlaygroundMission
      .deleteMany({
        where: { id, userId },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[deleteByUser ${id}] failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  /**
   * 用户重命名 mission topic（带 userId guard）。
   */
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

  async markCancelled(id: string): Promise<void> {
    // ★ P0-1: 仅在 status='running' 时改为 cancelled —— 防止 race 时把已 completed/failed 的 mission 错误覆盖
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
    // ★ P0-R5-1: cancel 也清 checkpoint，否则 listResumable 仍会显示"可恢复"
    await this.clearCheckpointJsonbKey(id);
  }

  async markFailed(
    id: string,
    data: {
      errorMessage?: string;
      tokensUsed?: number;
      costUsd?: number;
      wallTimeMs?: number;
      // ★ Phase Lead-3: Lead 拒签时同时持久化部分产物 + 标 quality-failed 状态
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
  ): Promise<void> {
    // P2: markFailed 路径同样做 10MB 硬限检查（避免 quality-failed 路径写入超大 report）
    if (data.report && typeof data.report === "object") {
      const failSize = Buffer.byteLength(JSON.stringify(data.report), "utf8");
      if (failSize > 10 * 1024 * 1024) {
        data.errorMessage = "report_too_large";
        data.report = undefined;
      }
    }
    // ★ P0-10 (audit 2026-05-06): isLeadRefusal 只看 leaderSigned === false，
    //   语义上 quality-failed = "Leader 走完 sign-off 流程并明确拒签"，
    //   leaderOverallScore 仅作分档信号不是分类条件。修复前 `|| leaderOverallScore != null`
    //   会让 mission 中途异常失败（leader 已评分但没走完 sign-off）误标 quality-failed。
    const isLeadRefusal = data.leaderSigned === false;
    const update: Prisma.AgentPlaygroundMissionUpdateInput = {
      status: isLeadRefusal ? "quality-failed" : "failed",
      completedAt: new Date(),
      errorMessage: data.errorMessage?.slice(0, 2000) ?? null,
      tokensUsed: data.tokensUsed ?? null,
      costUsd: data.costUsd ?? null,
      wallTimeMs: data.wallTimeMs ?? null,
    };
    // ★ 2026-04-30: 之前 isLeadRefusal=false 时所有产物丢失（用户看到空白报告）。
    //   现在改为：传了什么产物就存什么产物，不分 isLeadRefusal 路径。
    //   Lead 拒签状态语义靠 status=quality-failed 区分，跟产物存储解耦。
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
    // ★ P0 (2026-05-06): 统一用 !== undefined 与 leaderJournal 对齐，让 caller
    //   显式传 null 也能写入。原 != null 会把 leaderSigned=false 误判为 falsy 跳过
    //   写入，导致 Lead 拒签路径（leaderSigned=false）永远不落表。
    if (data.leaderOverallScore !== undefined)
      update.leaderOverallScore = data.leaderOverallScore ?? null;
    if (data.leaderSigned !== undefined)
      update.leaderSigned = data.leaderSigned ?? null;
    if (data.leaderVerdict !== undefined)
      update.leaderVerdict = data.leaderVerdict ?? null;
    // ★ 全覆盖审计修 (2026-05-06): leaderJournal 漏赋值 — 签名收了字段但 update 对象未包含
    if (data.leaderJournal !== undefined)
      update.leaderJournal = (data.leaderJournal ??
        null) as Prisma.InputJsonValue;
    // ★ P0-1: 仅 status='running' 才能转为终态 —— 否则 race 中 markFailed 会覆盖 completed/cancelled
    await this.prisma.agentPlaygroundMission
      .updateMany({ where: { id, status: "running" }, data: update })
      .catch((err: unknown) => {
        this.log.warn(
          `[markFailed ${id}] failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    // ★ P0-R5-1: 失败也清 checkpoint（包括 quality-failed 拒签路径）
    await this.clearCheckpointJsonbKey(id);
  }

  /**
   * 追加 dimension（leader chat CREATE_TODO 触发）。
   * 仅 mission running 时合法 — 其他状态返回 [] 不抛错。
   * 返回新追加的 dimension ids（用于 orchestrator 派 researcher）。
   *
   * ★ P1 TOCTOU fix (2026-05-06): 原 findUnique→push→update 三步无事务保护，
   * 并发两个 CREATE_TODO 会造成 baseIdx 相同导致 dim id 碰撞 + 最后写覆盖前写。
   * 现在用 serializable $transaction 包裹整个 read+write。
   */
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
          // ★ v1.5 安全评审 (B9 收尾): 用户聊天追加的 dim.name 可能含
          //   \r/\n（多行注入），写入 DB 后会经 segment-extractors 进入
          //   StructuralReportAssembler.sanitizePlan() 兜底，但事件
          //   emit / Redis 状态会泄露原始 CRLF。源头剥离让全链路干净。
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
        const merged = [...existing, ...newDims];
        await tx.agentPlaygroundMission.update({
          where: { id: missionId },
          data: { dimensions: merged as never },
        });
        return newDims.map((d) => d.id);
      },
      { isolationLevel: "Serializable" },
    );
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
        wallTimeMs: true,
        finalScore: true,
        tokensUsed: true,
        costUsd: true,
        reportTitle: true,
        reportSummary: true,
        errorMessage: true,
      },
    });
    // tokensUsed is BigInt in DB; convert to number for API boundary
    return rows.map((r) => ({
      ...r,
      tokensUsed: r.tokensUsed != null ? Number(r.tokensUsed) : null,
    }));
  }

  /**
   * ★ 2026-05-05 R-CA: 按 missionId 列表批量拉 mission 卡片数据。
   * 给 custom-agents 主页用 —— 上层（CustomAgentLaunchesService）拿到该 agent
   * 启动过的 missionId[]，再回调本方法拿完整渲染信息。
   *
   * 顺序保留入参顺序（DB IN 不保证顺序，业务期望按 launches 表 startedAt 已排序）。
   * 已删除的 mission（DB 不存在）静默跳过。
   */
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
        wallTimeMs: true,
        finalScore: true,
        tokensUsed: true,
        costUsd: true,
        reportTitle: true,
        reportSummary: true,
        errorMessage: true,
      },
    });
    // tokensUsed is BigInt in DB; convert to number for API boundary
    const mapped = rows.map((r) => ({
      ...r,
      tokensUsed: r.tokensUsed != null ? Number(r.tokensUsed) : null,
    }));
    const map = new Map(mapped.map((r) => [r.id, r]));
    return missionIds
      .map((id) => map.get(id))
      .filter((r): r is MissionListItem => !!r);
  }

  /**
   * S12 真沉淀 —— 把 mission postmortem 写到 harness_vector_memory，
   * namespace=userId，tags=['agent-playground', 'mission-postmortem']。
   *
   * C4 (2026-05-05): Anthropic P0-1 闭合 —— embed summary 作为 vector，
   * 让下次 leader plan 阶段能用语义召回（cosine similarity）找类似主题的
   * 历史教训。embedding 失败时 fall back 到空数组（tag-only 召回退化模式）。
   */
  async recordMissionPostmortem(input: {
    missionId: string;
    userId: string;
    topic: string;
    summary: string;
    recommendations: string[];
    leaderSigned: boolean | null;
    qualityScore: number | null;
    tokensUsed: number;
    costUsd: number;
    /** S12 postmortem classifier result — stored in metadata JSONB, no schema change */
    failureClassification?: {
      mode: string;
      signals: string[];
      confidence: number;
    };
  }): Promise<void> {
    // C4: 真 embedding 调用 — 用 topic + summary 拼接作为语义索引
    //   失败不阻塞 postmortem 写入（degrade 到 tag 召回）
    let embedding: number[] = [];
    if (this.embeddingService) {
      try {
        // ★ P1 (2026-05-06): userId 已存在于 input，embed 文本前缀携带 userId 作为命名空间
        //   隔离信号，让 cooldown 熔断按用户而非全局触发。
        //   EmbeddingService.generateEmbedding 当前仅接受 text，userId 通过
        //   namespace 列（harness_vector_memory.namespace = input.userId）隔离存储，
        //   待 EmbeddingService 支持 options.userId 时可在此直接传入。
        const text = `${input.topic}\n\n${input.summary}`.slice(0, 2000);
        const result = await this.embeddingService.generateEmbedding(text);
        if (Array.isArray(result?.embedding)) {
          embedding = result.embedding;
        }
      } catch (err) {
        this.log.warn(
          `[recordMissionPostmortem userId=${input.userId}] embedding failed (degrade to tag-only recall): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    try {
      await this.prisma.harnessVectorMemory.create({
        data: {
          namespace: input.userId,
          source: "agent-playground:mission",
          entryKey: `mission-postmortem:${input.missionId}`,
          content: input.summary.slice(0, 2000),
          embedding,
          confidence: 1.0,
          tags: [
            "agent-playground",
            "mission-postmortem",
            input.leaderSigned === true ? "signed" : "unsigned",
          ],
          metadata: {
            missionId: input.missionId,
            topic: input.topic,
            recommendations: input.recommendations,
            qualityScore: input.qualityScore,
            tokensUsed: input.tokensUsed,
            costUsd: input.costUsd,
            ...(input.failureClassification
              ? { failureClassification: input.failureClassification }
              : {}),
          },
        },
      });
    } catch (err) {
      this.log.warn(
        `recordMissionPostmortem failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * 召回某 user 最近 N 条 mission postmortem（用于 leader plan 阶段）。
   * 返回精简内容，给 plan duty.md 模板渲染。
   */
  async listRecentPostmortems(
    userId: string,
    limit = 3,
  ): Promise<
    {
      missionId: string;
      topic: string;
      summary: string;
      recommendations: string[];
      leaderSigned: boolean | null;
      qualityScore: number | null;
      createdAt: Date;
    }[]
  > {
    // ★ P1-R5-D (2026-04-30): S12 fire-and-forget vs S2 召回竞态修复
    //   如果用户最近 5min 内有 mission 已 completed 但 postmortem 还没落表（S12 在跑），
    //   等最多 3s 让 S12 写完，避免 S2 取到旧 postmortem 漏掉最近教训。
    const recentMissionExists = await this.prisma.agentPlaygroundMission
      .findFirst({
        where: {
          userId,
          status: { in: ["completed", "quality-failed"] },
          completedAt: { gte: new Date(Date.now() - 5 * 60_000) },
        },
        select: { id: true, completedAt: true },
        orderBy: { completedAt: "desc" },
      })
      .catch(() => null);

    const fetchPostmortems = async () =>
      this.prisma.harnessVectorMemory
        .findMany({
          where: {
            namespace: userId,
            tags: { has: "mission-postmortem" },
          },
          orderBy: { createdAt: "desc" },
          take: Math.min(Math.max(limit, 1), 10),
        })
        .catch(() => []);

    let rows = await fetchPostmortems();

    if (recentMissionExists) {
      // 检查是否包含该 mission 的 postmortem；不包含则短暂等待 S12 写入
      const recentMissionId = recentMissionExists.id;
      const hasRecent = rows.some(
        (r) =>
          ((r.metadata as Record<string, unknown> | null)?.missionId ??
            null) === recentMissionId,
      );
      if (!hasRecent) {
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 300));
          rows = await fetchPostmortems();
          if (
            rows.some(
              (r) =>
                ((r.metadata as Record<string, unknown> | null)?.missionId ??
                  null) === recentMissionId,
            )
          ) {
            this.log.debug(
              `[listRecentPostmortems ${userId}] S12 caught up for mission ${recentMissionId}`,
            );
            break;
          }
        }
      }
    }
    return rows.map((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      return {
        missionId: String(meta.missionId ?? ""),
        topic: String(meta.topic ?? ""),
        summary: r.content,
        recommendations: Array.isArray(meta.recommendations)
          ? (meta.recommendations as string[])
          : [],
        leaderSigned: r.tags.includes("signed")
          ? true
          : r.tags.includes("unsigned")
            ? false
            : null,
        qualityScore:
          typeof meta.qualityScore === "number" ? meta.qualityScore : null,
        createdAt: r.createdAt,
      };
    });
  }

  /**
   * ★ 2026-04-30 (B5): markRerunPatch —— 单 stage 局部重跑后只 update 受影响字段
   *
   * 不动 status / completedAt（mission 已 completed 不应回退到 running）。
   * 不接受 PascalCase 字段名（用 Prisma model 的 camelCase）。
   * 调用方传什么字段就 update 什么，undefined 字段保持原值。
   *
   * 典型用例：
   *   - dimension 重跑 → 传 dimensions / report / reportFull / verdicts
   *   - chapter 重跑 → 只传 reportFull (含新 fullMarkdown + sections)
   *   - s9b/s10 重跑 → 传 verdicts / leaderSigned / leaderVerdict / leaderOverallScore
   */
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
      // tokens/costs 这里是"重跑产生的增量"，调用方需自己 read 当前值再加
      reportTitle?: string;
      reportSummary?: string;
    },
    // ★ 收尾评审 P0-S2 (2026-05-07): 可选 userId 参数 — 与 markReopened 一致的深度防御。
    //   传入时用 updateMany + count 检查；不传时退化为旧行为（保持向后兼容）。
    //   生产路径（dispatcher）应一律传 userId 走严格路径。
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
    if (userId) {
      // 严格路径：updateMany + userId 隔离（防 depth-defense bypass）
      await this.prisma.agentPlaygroundMission
        .updateMany({
          where: { id, userId },
          data: update as Prisma.AgentPlaygroundMissionUpdateManyMutationInput,
        })
        .catch((err: unknown) => {
          this.log.warn(
            `[markRerunPatch ${id}] failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    } else {
      // 兼容路径（旧 caller，无 userId 上下文）
      await this.prisma.agentPlaygroundMission
        .update({ where: { id }, data: update })
        .catch((err: unknown) => {
          this.log.warn(
            `[markRerunPatch ${id}] failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }
  }

  // ── ★ PR-R3 (2026-05-07 per-task rerun + cascade) ──────────────────────
  //
  // 上游：docs/architecture/ai-harness/runner/per-task-rerun-with-cascade.md v1.2 §3.5
  //
  // 三个新方法：
  //   - markIntermediateState：stage 中间产物落盘（任何 status 都允许）
  //   - markReopened：failed/quality-failed → running（乐观锁防 TOCTOU）
  //   - resetFields：cascade 起点前 reset 列（防 stale 残留）

  /**
   * v1.2 类别 A1：stage 中间产物落盘，不动 status。
   *
   * 任何 stage 都可调用，让 ctx-hydrator 永远从 DB 读到最新中间状态。
   * 与 markRerunPatch 的区别：本方法不限定 rerun 路径，正常 mission 跑期 + 重跑期都可用。
   *
   * 典型用例：
   *   - S6 analyst 输出后调 markIntermediateState({ analystOutput, ... })
   *   - S7 outline 输出后调 markIntermediateState({ outlinePlan, ... })
   *   - S8 writer 装配 reportArtifact 后调 markIntermediateState({ reportFull, reportArtifactVersion: 2 })
   */
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
    await this.prisma.agentPlaygroundMission
      .update({ where: { id }, data: update })
      .catch((err: unknown) => {
        this.log.warn(
          `[markIntermediateState ${id}] failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  /**
   * v1.2 类别 B+E2：把 failed / quality-failed mission 反向 transition 回 running。
   *
   * 用乐观锁（updateMany where status in [...]） + 检查 affectedRows，避免
   * v1.0 findFirst+update 的 TOCTOU race（双 reopen 都通过 status 检查再都写入）。
   *
   * 完整 reset 字段集（v1.2 类别 B1）：status/completedAt/errorMessage/finalScore/
   * leaderSigned/leaderOverallScore/leaderVerdict/heartbeatAt 全清；
   * leader_journal 保留（含 __checkpoint key 已在 markCompleted 时删除）。
   *
   * 5×5 状态转移矩阵（spec 见 ctx-hydrator.service.spec / mission-store.markReopened.spec）：
   *   from=failed         → running ✅
   *   from=quality-failed → running ✅
   *   from=cancelled      → BadRequest（用户主动 cancel 不允许 reopen）
   *   from=completed      → BadRequest（已成功 mission 不允许反向）
   *   from=running        → BadRequest（in-flight mission 不允许并发 reopen）
   */
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
          heartbeatAt: new Date(),
        },
      });
      if (updated.count === 0) {
        // 探测原因：mission 不存在 / userId 不匹配 / status 不在白名单
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
      // 审计事件（同一事务内）
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

  /**
   * v1.2 cascade 用：reset 受影响列（cascade 起点前一次性清，避免 stale 残留）。
   *
   * MissionColumnKey 类型严格（在 ai-harness/runner/dag/stage-dag-meta.types.ts），
   * 调用方只能传该 union 内的列名；非法列名 TypeScript 编译期拒。
   *
   * 注意：本方法**不动 status**（rerun 期间 status 变更由 markReopened 控制）。
   */
  async resetFields(
    missionId: string,
    fields: ReadonlyArray<string>,
    // ★ 收尾评审 P0-S2 (2026-05-07): 可选 userId — 与 markReopened 一致的深度防御
    userId?: string,
  ): Promise<void> {
    if (fields.length === 0) return;
    // 把 snake_case 列名转成 prisma model 的 camelCase 字段名
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
      // status 不允许在这里被 null 化（status 由 markReopened/markCompleted 等专属方法管理）
      if (f === "status") continue;
      const camel = camelMap[f];
      if (camel) data[camel] = null;
    }
    if (Object.keys(data).length === 0) return;
    if (userId) {
      await this.prisma.agentPlaygroundMission
        .updateMany({ where: { id: missionId, userId }, data })
        .catch((err: unknown) => {
          this.log.warn(
            `[resetFields ${missionId}] failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    } else {
      await this.prisma.agentPlaygroundMission
        .update({ where: { id: missionId }, data })
        .catch((err: unknown) => {
          this.log.warn(
            `[resetFields ${missionId}] failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }
  }

  // ── ★ 报告版本化 (2026-05-06) ────────────────────────────────────────────
  //
  // rerun 每次调 saveReportVersion，version 自动 MAX+1（Serializable tx 防并发）。
  // mission.report_full 保持向后兼容不删，版本历史在 mission_report_versions 查询。

  /**
   * 保存一个新报告版本（version = MAX(version)+1，幂等原子）。
   *
   * 调用方：s11-persist 成功路径 + handleMissionFailure 有 report 时。
   * triggerType: 'initial' | 'rerun-fresh' | 'rerun-incremental' | 'todo-rerun'
   */
  async saveReportVersion(args: {
    missionId: string;
    triggerType: string;
    report?: { title?: string; summary?: string; [k: string]: unknown };
    finalScore?: number;
    leaderSigned?: boolean;
    versionLabel?: string;
  }): Promise<number> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // 原子取 MAX(version)，不存在时 = 0
          const agg = await tx.missionReportVersion.aggregate({
            where: { missionId: args.missionId },
            _max: { version: true },
          });
          const nextVersion = (agg._max.version ?? 0) + 1;

          const reportTitle = args.report?.title?.slice(0, 500) ?? null;
          const reportSummary = args.report?.summary ?? null;

          await tx.missionReportVersion.create({
            data: {
              missionId: args.missionId,
              version: nextVersion,
              versionLabel:
                args.versionLabel ??
                `${args.triggerType}-${new Date().toISOString().slice(0, 10)}`,
              reportFull: (args.report ?? null) as Prisma.InputJsonValue,
              reportTitle,
              reportSummary,
              finalScore: args.finalScore ?? null,
              leaderSigned: args.leaderSigned ?? null,
              triggerType: args.triggerType.slice(0, 40),
            },
          });
          return nextVersion;
        },
        { isolationLevel: "Serializable" },
      );
    } catch (err) {
      this.log.warn(
        `[saveReportVersion ${args.missionId}] failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 0;
    }
  }

  /**
   * 列出某 mission 所有报告版本（按 generatedAt DESC，最新在前）。
   */
  async listReportVersions(missionId: string): Promise<
    Array<{
      id: string;
      version: number;
      versionLabel: string | null;
      reportTitle: string | null;
      reportSummary: string | null;
      finalScore: number | null;
      leaderSigned: boolean | null;
      triggerType: string;
      generatedAt: Date;
    }>
  > {
    const rows = await this.prisma.missionReportVersion
      .findMany({
        where: { missionId },
        orderBy: { generatedAt: "desc" },
        select: {
          id: true,
          version: true,
          versionLabel: true,
          reportTitle: true,
          reportSummary: true,
          finalScore: true,
          leaderSigned: true,
          triggerType: true,
          generatedAt: true,
        },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[listReportVersions ${missionId}] failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return [];
      });
    return rows;
  }

  /**
   * 获取某 mission 的指定版本（含完整 reportFull）。
   * 不存在时返回 null。
   */
  async getReportVersion(
    missionId: string,
    version: number,
  ): Promise<{
    id: string;
    version: number;
    versionLabel: string | null;
    reportFull: unknown;
    reportTitle: string | null;
    reportSummary: string | null;
    finalScore: number | null;
    leaderSigned: boolean | null;
    triggerType: string;
    changesFromPrev: unknown;
    generatedAt: Date;
  } | null> {
    const row = await this.prisma.missionReportVersion
      .findUnique({
        where: { missionId_version: { missionId, version } },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[getReportVersion ${missionId} v${version}] failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      });
    if (!row) return null;
    return {
      id: row.id,
      version: row.version,
      versionLabel: row.versionLabel,
      reportFull: row.reportFull,
      reportTitle: row.reportTitle,
      reportSummary: row.reportSummary,
      finalScore: row.finalScore,
      leaderSigned: row.leaderSigned,
      triggerType: row.triggerType,
      changesFromPrev: row.changesFromPrev,
      generatedAt: row.generatedAt,
    };
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
      wallTimeMs: row.wallTimeMs,
      finalScore: row.finalScore,
      tokensUsed: row.tokensUsed != null ? Number(row.tokensUsed) : null,
      costUsd: row.costUsd,
      reportTitle: row.reportTitle,
      reportSummary: row.reportSummary,
      errorMessage: row.errorMessage,
      maxCredits: row.maxCredits,
      themeSummary: row.themeSummary,
      dimensions: row.dimensions,
      reportFull: row.reportFull,
      verdicts: row.verdicts,
      trajectoryStored: row.trajectoryStored,
      // ★ Phase P3-19: v2 字段
      reportArtifactVersion: row.reportArtifactVersion,
      userProfile: row.userProfile,
      reconciliationReport: row.reconciliationReport,
      // ★ Phase Lead-1+
      leaderJournal: row.leaderJournal,
      leaderOverallScore: row.leaderOverallScore,
      leaderSigned: row.leaderSigned,
      leaderVerdict: row.leaderVerdict,
      lastCompletedStage: row.lastCompletedStage,
      // ★ PR-R0/R2 (per-task rerun + cascade)：cascade rerun ctx 中间产物
      outlinePlan: row.outlinePlan,
      analystOutput: row.analystOutput,
      heartbeatAt: row.heartbeatAt,
    };
  }

  // ── ★ P0-D 完整版 (2026-05-06): trajectory 持久化 ──────────────────────
  // rerun incremental 模式下从这俩表 hydrate 让 dispatcher 跳过 S3 / 章节重做。

  /**
   * 持久化单 dim researcher 完整产物（findings 数组 + summary）。
   * upsert：(missionId, dimension, retryLabel) 唯一，重复调幂等更新。
   */
  async saveResearchResult(args: {
    missionId: string;
    dimension: string;
    retryLabel?: string;
    findings: { claim: string; evidence: string; source: string }[];
    summary: string;
    state: "completed" | "degraded" | "failed";
    iterations?: number;
    wallTimeMs?: number;
  }): Promise<void> {
    await this.prisma.agentPlaygroundResearchResult
      .upsert({
        where: {
          missionId_dimension_retryLabel: {
            missionId: args.missionId,
            dimension: args.dimension.slice(0, 200),
            retryLabel: args.retryLabel ?? "",
          },
        },
        create: {
          missionId: args.missionId,
          dimension: args.dimension.slice(0, 200),
          retryLabel: args.retryLabel ?? "",
          findings: args.findings as unknown as object,
          summary: args.summary.slice(0, 50_000),
          state: args.state,
          iterations: args.iterations,
          wallTimeMs: args.wallTimeMs,
        },
        update: {
          findings: args.findings as unknown as object,
          summary: args.summary.slice(0, 50_000),
          state: args.state,
          iterations: args.iterations,
          wallTimeMs: args.wallTimeMs,
        },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[saveResearchResult] mission=${args.missionId} dim=${args.dimension} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  /**
   * 加载某 mission 的所有 researcher 产物（用于 rerun hydrate）。
   * 仅返回 retryLabel === null 的 baseline 产物（retry 走独立 pipelineKey 不复用）。
   */
  async loadBaselineResearchResults(missionId: string): Promise<
    Array<{
      dimension: string;
      findings: { claim: string; evidence: string; source: string }[];
      summary: string;
    }>
  > {
    const rows = await this.prisma.agentPlaygroundResearchResult
      .findMany({
        where: { missionId, retryLabel: "" },
      })
      .catch(() => []);
    return rows
      .filter((r) => r.state === "completed" || r.state === "degraded")
      .map((r) => ({
        dimension: r.dimension,
        findings: r.findings as unknown as {
          claim: string;
          evidence: string;
          source: string;
        }[],
        summary: r.summary,
      }));
  }

  /**
   * 持久化单 chapter 完整产物（content + status + score）。
   * upsert：(missionId, dimension, chapterIndex) 唯一。
   */
  async saveChapterDraft(args: {
    missionId: string;
    dimension: string;
    chapterIndex: number;
    heading: string;
    thesis?: string;
    content: string;
    status:
      | "writing"
      | "reviewing"
      | "passed"
      | "done"
      | "failed-finalized"
      | "failed";
    score?: number;
    critique?: string;
    attempts?: number;
    wordCount?: number;
  }): Promise<void> {
    await this.prisma.agentPlaygroundChapterDraft
      .upsert({
        where: {
          missionId_dimension_chapterIndex: {
            missionId: args.missionId,
            dimension: args.dimension.slice(0, 200),
            chapterIndex: args.chapterIndex,
          },
        },
        create: {
          missionId: args.missionId,
          dimension: args.dimension.slice(0, 200),
          chapterIndex: args.chapterIndex,
          heading: args.heading.slice(0, 500),
          thesis: args.thesis,
          content: args.content,
          status: args.status,
          score: args.score,
          critique: args.critique,
          attempts: args.attempts ?? 1,
          wordCount: args.wordCount,
        },
        update: {
          heading: args.heading.slice(0, 500),
          thesis: args.thesis,
          content: args.content,
          status: args.status,
          score: args.score,
          critique: args.critique,
          attempts: args.attempts ?? 1,
          wordCount: args.wordCount,
        },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[saveChapterDraft] mission=${args.missionId} dim=${args.dimension} ch=${args.chapterIndex} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  /**
   * 加载某 mission 的所有 chapter drafts（用于 rerun hydrate dimensionPipelines）。
   * 仅返回 status='passed' / 'done' 的合格 chapter（degraded 失败不复用）。
   */
  async loadQualifiedChapterDrafts(missionId: string): Promise<
    Array<{
      dimension: string;
      chapterIndex: number;
      heading: string;
      thesis?: string;
      content: string;
      score?: number;
      attempts: number;
      wordCount?: number;
    }>
  > {
    const rows = await this.prisma.agentPlaygroundChapterDraft
      .findMany({
        where: {
          missionId,
          status: { in: ["passed", "done"] },
        },
        orderBy: [{ dimension: "asc" }, { chapterIndex: "asc" }],
      })
      .catch(() => []);
    return rows.map((r) => ({
      dimension: r.dimension,
      chapterIndex: r.chapterIndex,
      heading: r.heading,
      thesis: r.thesis ?? undefined,
      content: r.content,
      score: r.score ?? undefined,
      attempts: r.attempts,
      wordCount: r.wordCount ?? undefined,
    }));
  }
}
