/**
 * MissionStore — agent-playground mission 持久化
 *
 * 启动 mission 时插入 record (status=running)，完成/失败时 update。
 * 列表页 / detail 页查询用。
 */

import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../../../common/prisma/prisma.service";

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
}

@Injectable()
export class MissionStore {
  private readonly log = new Logger(MissionStore.name);

  constructor(private readonly prisma: PrismaService) {}

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
      this.log.warn(
        `[clearCheckpoint ${missionId}] update failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 0;
    });
  }

  /**
   * ★ 2026-04-30 重构：之前 maxAgeMinutes=30 太紧 —— mission 跑 deep/thorough 档
   * 60min 是常态，正在跑的 mission 撞上 Railway deploy 重启就被误标 failed。
   *
   * 新策略（多重门槛过滤）：
   *   1. startedAt < now - maxAgeMinutes（默认 90min）才算"超龄"
   *   2. 但若 lastActivityAt 在最近 ACTIVITY_GRACE_MINUTES（默认 5min）内有事件
   *      → 进程可能刚重启就 resume 了 / scheduler 还没扫到，跳过本轮，留给 health
   *      monitor 5min 后基于 lastActivityAt 做精准判断
   *   3. errorMessage 给用户可操作的提示而非裸技术消息
   */
  async recoverOrphanedRunning(maxAgeMinutes = 90): Promise<number> {
    const ACTIVITY_GRACE_MINUTES = 5;
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60_000);
    const activityCutoff = new Date(
      Date.now() - ACTIVITY_GRACE_MINUTES * 60_000,
    );
    // 1. 拉所有 startedAt 超龄的 running mission
    const candidates = await this.prisma.agentPlaygroundMission
      .findMany({
        where: { status: "running", startedAt: { lt: cutoff } },
        select: { id: true },
      })
      .catch((): { id: string }[] => []);
    if (candidates.length === 0) return 0;
    // 2. 用最近事件 ts 过滤掉"刚才还在动"的 mission
    const candidateIds = candidates.map((c) => c.id);
    const recentActivities = await this.prisma.agentPlaygroundMissionEvent
      .groupBy({
        by: ["missionId"],
        where: { missionId: { in: candidateIds } },
        _max: { ts: true },
      })
      .catch(() => [] as { missionId: string; _max: { ts: bigint | null } }[]);
    const activeIds = new Set<string>();
    for (const a of recentActivities) {
      const ts = a._max.ts;
      if (ts != null) {
        const tsMs = Number(ts);
        if (Number.isFinite(tsMs) && tsMs > activityCutoff.getTime()) {
          activeIds.add(a.missionId);
        }
      }
    }
    const trueOrphanIds = candidateIds.filter((id) => !activeIds.has(id));
    if (trueOrphanIds.length === 0) {
      this.log.log(
        `[recoverOrphanedRunning] ${candidateIds.length} candidates super-aged, but ${activeIds.size} have recent activity (< ${ACTIVITY_GRACE_MINUTES}min) — sparing them this round`,
      );
      return 0;
    }
    // 3. 真正 orphan 的才 markFailed
    const result = await this.prisma.agentPlaygroundMission
      .updateMany({
        where: { id: { in: trueOrphanIds }, status: "running" },
        data: {
          status: "failed",
          completedAt: new Date(),
          errorMessage:
            `Mission 进程在执行过程中被回收（Railway deploy 或服务重启导致内存状态丢失，运行超过 ${maxAgeMinutes} 分钟无新事件）。\n\n` +
            "建议：使用顶部「重新运行」按钮重启相同主题，或微调档位（depth / lengthProfile）后重新发起。",
        },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[recoverOrphanedRunning] failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return { count: 0 };
      });
    await Promise.all(
      trueOrphanIds.map((id) => this.clearCheckpointJsonbKey(id)),
    );
    if (result.count > 0) {
      this.log.warn(
        `[recoverOrphanedRunning] marked ${result.count} truly orphaned missions as failed (super-aged > ${maxAgeMinutes}min, no activity in ${ACTIVITY_GRACE_MINUTES}min)`,
      );
    }
    return result.count;
  }

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
        this.log.debug(
          `[heartbeat ${id}] silent: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  /**
   * ★ PR-H v1: stage 完成进度（单调递增）
   *
   * 每个 stage 完成后调用，写 last_completed_stage 字段。
   * 当前只是观测用；PR-H v2 将基于此字段做 resume from checkpoint。
   */
  async markStageComplete(id: string, stageNumber: number): Promise<void> {
    await this.prisma.agentPlaygroundMission
      .update({
        where: { id },
        data: { lastCompletedStage: stageNumber, heartbeatAt: new Date() },
      })
      .catch((err: unknown) => {
        this.log.debug(
          `[markStageComplete ${id} s${stageNumber}] silent: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  /**
   * ★ PR-H v1 (2026-05-01): 心跳驱动的 pod 重启 recovery（替代旧的 event-flush 检测）
   *
   * 旧 recoverOrphanedRunning 用最近事件 ts 判断"是否还在跑"，但事件 flush 链
   * 不可靠（mission 可能正在跑长 LLM call 没 emit 事件）—— 误杀 long mission。
   *
   * 新逻辑：基于 DB heartbeatAt 字段（runMission 每 30s 主动刷新）。
   *   - heartbeatAt = null AND startedAt > GRACE_MINUTES → 可能是旧版没 heartbeat
   *     的 mission（PR-H 部署前启动）；保守跳过，等老 recovery 处理
   *   - heartbeatAt < now - STALE_MINUTES → pod 真的死了 → markFailed
   *
   * 默认 stale 阈值 = 300s（heartbeat 30s 一次；Railway redeploy 通常 60-120s
   * 部署 + 30s 启动，旧 90s 阈值在每次 push 都误杀进行中 mission ——
   * 2026-05-04 实测确认）。300s 兜住 redeploy 窗口；真死 pod 检测延迟 5min
   * 内可接受。
   */
  async recoverPodCrashedRunning(staleSeconds = 300): Promise<number> {
    const cutoff = new Date(Date.now() - staleSeconds * 1000);
    const orphans = await this.prisma.agentPlaygroundMission
      .findMany({
        where: {
          status: "running",
          heartbeatAt: { lt: cutoff },
        },
        select: { id: true, heartbeatAt: true, startedAt: true, podId: true },
      })
      .catch(
        (): {
          id: string;
          heartbeatAt: Date | null;
          startedAt: Date;
          podId: string | null;
        }[] => [],
      );
    if (orphans.length === 0) return 0;
    const result = await this.prisma.agentPlaygroundMission
      .updateMany({
        where: {
          id: { in: orphans.map((o) => o.id) },
          status: "running",
          heartbeatAt: { lt: cutoff },
        },
        data: {
          status: "failed",
          completedAt: new Date(),
          errorMessage:
            `Mission 在 pod 重启 / Railway redeploy 时丢失（DB 心跳停 ≥ ${staleSeconds} 秒）。\n\n` +
            "PR-H v1 检测窗口：当前是清理悬挂 mission，让 UI 看到明确失败状态。\n" +
            "PR-H v2 将支持从最近 stage checkpoint 自动续跑（开发中）。\n\n" +
            "建议：使用顶部「重新运行」按钮重启相同主题。",
        },
      })
      .catch(() => ({ count: 0 }));
    await Promise.all(orphans.map((o) => this.clearCheckpointJsonbKey(o.id)));
    if (result.count > 0) {
      this.log.warn(
        `[recoverPodCrashed] marked ${result.count} pod-crashed missions as failed (heartbeat stale > ${staleSeconds}s)`,
      );
    }
    return result.count;
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
    // 但 Prisma 序列化中间步会爆内存；超 5MB 时记 warning 并截断 fullMarkdown）
    const MAX_REPORT_BYTES = 5 * 1024 * 1024;
    if (data.report && typeof data.report === "object") {
      const size = Buffer.byteLength(JSON.stringify(data.report), "utf8");
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
   */
  async appendLeaderJournal(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    try {
      const row = await this.prisma.agentPlaygroundMission.findUnique({
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
      await this.prisma.agentPlaygroundMission.update({
        where: { id },
        data: { leaderJournal: merged as Prisma.InputJsonValue },
      });
    } catch (err) {
      this.log.warn(
        `[appendLeaderJournal ${id}] failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
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
    // 仅当带 Lead 数据时才区分 quality-failed；老调用路径行为不变（status=failed）
    const isLeadRefusal =
      data.leaderSigned === false || data.leaderOverallScore != null;
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
    if (data.leaderOverallScore != null)
      update.leaderOverallScore = data.leaderOverallScore;
    if (data.leaderSigned != null) update.leaderSigned = data.leaderSigned;
    if (data.leaderVerdict != null) update.leaderVerdict = data.leaderVerdict;
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
   */
  async appendDimensions(
    missionId: string,
    items: { name: string; rationale: string }[],
  ): Promise<string[]> {
    if (items.length === 0) return [];
    const row = await this.prisma.agentPlaygroundMission.findUnique({
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
      name: it.name.slice(0, 80),
      rationale: it.rationale.slice(0, 500),
      source: "user-chat" as const,
    }));
    const merged = [...existing, ...newDims];
    await this.prisma.agentPlaygroundMission.update({
      where: { id: missionId },
      data: { dimensions: merged as never },
    });
    return newDims.map((d) => d.id);
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
    return rows;
  }

  /**
   * S12 真沉淀 —— 把 mission postmortem 写到 harness_vector_memory，
   * namespace=userId，tags=['agent-playground', 'mission-postmortem']，
   * 让下次 leader plan 阶段能召回同 user 历史教训作为 prior knowledge。
   *
   * 不算 embedding（s12 在 best-effort 路径 + 异步运行，不烧 LLM token），
   * 召回靠 namespace + tags 过滤即可。
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
    try {
      await this.prisma.harnessVectorMemory.create({
        data: {
          namespace: input.userId,
          source: "agent-playground:mission",
          entryKey: `mission-postmortem:${input.missionId}`,
          content: input.summary.slice(0, 2000),
          embedding: [],
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
    await this.prisma.agentPlaygroundMission
      .update({ where: { id }, data: update })
      .catch((err: unknown) => {
        this.log.warn(
          `[markRerunPatch ${id}] failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
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
      tokensUsed: row.tokensUsed,
      costUsd: row.costUsd,
      reportTitle: row.reportTitle,
      reportSummary: row.reportSummary,
      errorMessage: row.errorMessage,
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
    };
  }
}
