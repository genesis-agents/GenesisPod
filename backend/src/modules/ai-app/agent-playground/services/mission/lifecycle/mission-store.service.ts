/**
 * MissionStore — agent-playground mission 持久化
 *
 * 启动 mission 时插入 record (status=running)，完成/失败时 update。
 * 列表页 / detail 页查询用。
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
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
        // ★ 全覆盖审计修 (2026-05-06): markStageComplete 失败改为 log.error 让 Railway 可见（不阻断主流程）
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
    const map = new Map(rows.map((r) => [r.id, r]));
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
        const text = `${input.topic}\n\n${input.summary}`.slice(0, 2000);
        const result = await this.embeddingService.generateEmbedding(text);
        if (Array.isArray(result?.embedding)) {
          embedding = result.embedding;
        }
      } catch (err) {
        this.log.warn(
          `[recordMissionPostmortem] embedding failed (degrade to tag-only recall): ${
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
            retryLabel: (args.retryLabel ?? null) as never,
          },
        },
        create: {
          missionId: args.missionId,
          dimension: args.dimension.slice(0, 200),
          retryLabel: args.retryLabel ?? null,
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
        where: { missionId, retryLabel: null },
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
