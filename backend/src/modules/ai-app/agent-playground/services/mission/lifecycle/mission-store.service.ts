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
    await this.prisma.agentPlaygroundMission
      .create({
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
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[create] failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  /**
   * 启动恢复：把所有 status='running' 但已经超过 maxAgeMinutes 的 mission
   * 标记为 failed（Railway 重启后 in-memory orchestrator 已死，但 DB 还停在 running）
   */
  async recoverOrphanedRunning(maxAgeMinutes = 30): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60_000);
    const result = await this.prisma.agentPlaygroundMission
      .updateMany({
        where: {
          status: "running",
          startedAt: { lt: cutoff },
        },
        data: {
          status: "failed",
          completedAt: new Date(),
          errorMessage:
            "Mission orphaned - service recycled during execution; in-memory state lost.",
        },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[recoverOrphanedRunning] failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return { count: 0 };
      });
    if (result.count > 0) {
      this.log.warn(
        `[recoverOrphanedRunning] marked ${result.count} orphaned running missions as failed`,
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
          content?: { fullMarkdown?: string; fullReportSize?: number };
        };
        if (
          r.content?.fullMarkdown &&
          r.content.fullMarkdown.length > 100_000
        ) {
          r.content.fullMarkdown =
            r.content.fullMarkdown.slice(0, 100_000) +
            `\n\n... (truncated, ${size} bytes total)`;
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
    await this.prisma.agentPlaygroundMission
      .update({
        where: { id },
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
    if (isLeadRefusal) {
      // Lead 拒签时连同最终产物一起存（前端能展示，便于用户复盘）
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
        update.userProfile = (data.userProfile ??
          null) as Prisma.InputJsonValue;
      if (data.reconciliationReport !== undefined)
        update.reconciliationReport = (data.reconciliationReport ??
          null) as Prisma.InputJsonValue;
      if (data.leaderOverallScore != null)
        update.leaderOverallScore = data.leaderOverallScore;
      if (data.leaderSigned != null) update.leaderSigned = data.leaderSigned;
      if (data.leaderVerdict != null) update.leaderVerdict = data.leaderVerdict;
    }
    await this.prisma.agentPlaygroundMission
      .update({ where: { id }, data: update })
      .catch((err: unknown) => {
        this.log.warn(
          `[markFailed ${id}] failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
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
    const rows = await this.prisma.harnessVectorMemory
      .findMany({
        where: {
          namespace: userId,
          tags: { has: "mission-postmortem" },
        },
        orderBy: { createdAt: "desc" },
        take: Math.min(Math.max(limit, 1), 10),
      })
      .catch(() => []);
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
    };
  }
}
