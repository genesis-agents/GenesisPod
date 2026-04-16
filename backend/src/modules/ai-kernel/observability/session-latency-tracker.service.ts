import { Injectable, Logger, Optional } from "@nestjs/common";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { LruMap } from "@/common/utils/lru-map";
import type {
  LatencySession,
  LatencyPhase,
  LLMLatencyRecord,
  LatencySessionSummary,
  LatencyPercentileStats,
  PhaseDurationSummary,
  StartSessionInput,
  StartPhaseInput,
  RecordLLMLatencyInput,
  ListSessionsFilter,
} from "./session-latency.types";

/**
 * Session Latency Tracker Service
 *
 * 会话级端到端时延跟踪基础能力（L2 AI Kernel）。
 *
 * 职责：
 * - 管理时延会话的完整生命周期（start → phase → checkpoint → end）
 * - 收集每个 LLM 调用的 TTFT / TTLT / 吞吐量
 * - 自动计算会话摘要（阶段分解、LLM 占比、百分位统计）
 * - 内存 LRU 缓存 + endSession 时 DB 持久化
 *
 * 使用方式：
 * ```typescript
 * const sessionId = tracker.startSession({ type: "topic_insights_refresh", entityId: topicId });
 * const phaseId = tracker.startPhase(sessionId, { name: "leader_planning" });
 * tracker.recordLLMCall(sessionId, { phaseId, model: "gpt-4o", ttftMs: 320, ttltMs: 4500, ... });
 * tracker.endPhase(sessionId, phaseId);
 * const summary = tracker.endSession(sessionId);
 * ```
 */
@Injectable()
export class SessionLatencyTrackerService {
  private readonly logger = new Logger(SessionLatencyTrackerService.name);

  /** 活跃会话 LRU 缓存 */
  private readonly sessions = new LruMap<string, LatencySession>(500);

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  // ==================== Session Lifecycle ====================

  /**
   * 开始一个新的时延跟踪会话
   */
  startSession(input: StartSessionInput): string {
    const sessionId = randomUUID();
    const now = Date.now();

    const session: LatencySession = {
      id: sessionId,
      type: input.type,
      status: "running",
      userId: input.userId,
      entityId: input.entityId,
      metadata: input.metadata || {},
      startTime: now,
      phases: [],
      llmCalls: [],
    };

    this.sessions.set(sessionId, session);

    this.logger.debug(
      `[Session] Started: ${input.type} [${sessionId}] entity=${input.entityId ?? "N/A"}`,
    );

    return sessionId;
  }

  /**
   * 结束会话，计算摘要并持久化
   */
  endSession(
    sessionId: string,
    status: "completed" | "failed" = "completed",
  ): LatencySessionSummary | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn(`[Session] Not found: ${sessionId}`);
      return undefined;
    }

    const now = Date.now();
    session.endTime = now;
    session.status = status;

    // 自动关闭未结束的阶段
    for (const phase of session.phases) {
      if (!phase.endTime) {
        phase.endTime = now;
        phase.durationMs = phase.endTime - phase.startTime;
      }
    }

    const summary = this.computeSummary(session);

    // DB 持久化（fire-and-forget）
    this.persistSession(session, summary).catch((e) =>
      this.logger.debug(`[Session] Persist failed: ${e}`),
    );

    this.logger.log(
      `[Session] Ended: ${session.type} [${sessionId}] ` +
        `total=${summary.totalDurationMs}ms llm=${summary.llmTotalTimeMs}ms(${summary.llmTimePercent.toFixed(1)}%) ` +
        `calls=${summary.llmCallCount} ttft_avg=${summary.ttft?.avgMs?.toFixed(0) ?? "N/A"}ms`,
    );

    return summary;
  }

  /**
   * 获取会话（含当前状态）
   */
  getSession(sessionId: string): LatencySession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 按 entityId 查找内存中活跃的 session（用于研究进行中的实时展示）
   * 返回实时计算的 summary（不含持久化）
   */
  getActiveSessionSummary(
    entityId: string,
    type?: string,
  ): LatencySessionSummary | undefined {
    for (const session of this.sessions.values()) {
      if (
        session.entityId === entityId &&
        session.status === "running" &&
        (!type || session.type === type)
      ) {
        return this.computeSummary(session);
      }
    }
    return undefined;
  }

  // ==================== Phase Management ====================

  /**
   * 开始一个阶段
   */
  startPhase(sessionId: string, input: StartPhaseInput): string {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn(
        `[Phase] Session not found: ${sessionId}, phase: ${input.name}`,
      );
      return "";
    }

    const phaseId = randomUUID();
    const phase: LatencyPhase = {
      id: phaseId,
      name: input.name,
      parentPhaseId: input.parentPhaseId,
      startTime: Date.now(),
      parallel: input.parallel,
      parallelCount: input.parallelCount,
      metadata: input.metadata,
      checkpoints: [],
    };

    session.phases.push(phase);

    this.logger.debug(
      `[Phase] Started: ${input.name} [${phaseId}] session=${sessionId}` +
        (input.parallel ? ` parallel=${input.parallelCount}` : ""),
    );

    return phaseId;
  }

  /**
   * 结束一个阶段
   */
  endPhase(
    sessionId: string,
    phaseId: string,
    metadata?: Record<string, unknown>,
  ): number | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    const phase = session.phases.find((p) => p.id === phaseId);
    if (!phase) {
      this.logger.warn(`[Phase] Not found: ${phaseId} in session ${sessionId}`);
      return undefined;
    }

    const now = Date.now();
    phase.endTime = now;
    phase.durationMs = now - phase.startTime;
    if (metadata) {
      phase.metadata = { ...phase.metadata, ...metadata };
    }

    this.logger.debug(
      `[Phase] Ended: ${phase.name} [${phaseId}] duration=${phase.durationMs}ms`,
    );

    return phase.durationMs;
  }

  /**
   * 按名称结束阶段（便捷方法，用于不想跟踪 phaseId 的场景）
   */
  endPhaseByName(
    sessionId: string,
    phaseName: string,
    metadata?: Record<string, unknown>,
  ): number | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    // 找到最后一个未结束的同名阶段
    const phase = [...session.phases]
      .reverse()
      .find((p) => p.name === phaseName && !p.endTime);

    if (!phase) {
      this.logger.warn(
        `[Phase] No open phase named "${phaseName}" in session ${sessionId}`,
      );
      return undefined;
    }

    return this.endPhase(sessionId, phase.id, metadata);
  }

  // ==================== Checkpoints ====================

  /**
   * 在当前活跃阶段添加检查点
   */
  addCheckpoint(
    sessionId: string,
    phaseId: string,
    name: string,
    metadata?: Record<string, unknown>,
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const phase = session.phases.find((p) => p.id === phaseId);
    if (!phase) return;

    phase.checkpoints.push({
      name,
      timestamp: Date.now(),
      metadata,
    });
  }

  // ==================== LLM Call Recording ====================

  /**
   * 获取当前最后一个未结束的阶段 ID（供自动归属 LLM 调用）
   */
  getActivePhaseId(sessionId: string): string | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    const openPhase = [...session.phases].reverse().find((p) => !p.endTime);
    return openPhase?.id;
  }

  /**
   * 记录一次 LLM 调用的时延数据
   */
  recordLLMCall(sessionId: string, input: RecordLLMLatencyInput): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // 计算吞吐量
    let tokenThroughputPerSec = 0;
    if (
      input.streaming &&
      input.ttftMs != null &&
      input.ttltMs > input.ttftMs
    ) {
      const generationTimeMs = input.ttltMs - input.ttftMs;
      tokenThroughputPerSec =
        generationTimeMs > 0
          ? (input.outputTokens / generationTimeMs) * 1000
          : 0;
    } else if (input.totalDurationMs > 0) {
      tokenThroughputPerSec =
        (input.outputTokens / input.totalDurationMs) * 1000;
    }

    const record: LLMLatencyRecord = {
      id: randomUUID(),
      sessionId,
      phaseId: input.phaseId,
      stepName: input.stepName,
      model: input.model,
      provider: input.provider,
      streaming: input.streaming,
      ttftMs: input.ttftMs,
      ttltMs: input.ttltMs,
      totalDurationMs: input.totalDurationMs,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      tokenThroughputPerSec: Math.round(tokenThroughputPerSec * 10) / 10,
      timestamp: Date.now(),
    };

    session.llmCalls.push(record);
  }

  // ==================== Query ====================

  /**
   * 查询历史会话（从 DB）
   */
  async listSessions(
    filter: ListSessionsFilter,
  ): Promise<LatencySessionSummary[]> {
    if (!this.prisma) return [];

    const where: Prisma.LatencySessionWhereInput = {};
    if (filter.type) where.type = filter.type;
    if (filter.userId) where.userId = filter.userId;
    if (filter.entityId) where.entityId = filter.entityId;
    if (filter.status) where.status = filter.status;
    if (filter.since) {
      where.startTime = { gte: new Date(filter.since) };
    }

    try {
      const rows = await this.prisma.latencySession.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: filter.limit ?? 50,
        select: { summary: true },
      });

      return rows
        .map((r) => r.summary as unknown as LatencySessionSummary)
        .filter(Boolean);
    } catch (e) {
      this.logger.debug(`[Query] listSessions failed: ${e}`);
      return [];
    }
  }

  /**
   * 根据实体 ID 获取最近会话摘要
   */
  async getLatestSummary(
    entityId: string,
    type?: string,
  ): Promise<LatencySessionSummary | undefined> {
    if (!this.prisma) return undefined;

    try {
      const where: Prisma.LatencySessionWhereInput = { entityId };
      if (type) where.type = type;

      const row = await this.prisma.latencySession.findFirst({
        where,
        orderBy: { createdAt: "desc" },
        select: { summary: true },
      });

      return (row?.summary as unknown as LatencySessionSummary) ?? undefined;
    } catch (e) {
      this.logger.debug(`[Query] getLatestSummary failed: ${e}`);
      return undefined;
    }
  }

  // ==================== Summary Computation ====================

  /**
   * 计算会话摘要
   */
  private computeSummary(session: LatencySession): LatencySessionSummary {
    const totalDurationMs = (session.endTime ?? Date.now()) - session.startTime;
    const llmCalls = session.llmCalls;

    // 阶段分解（只取顶层阶段），含每阶段 LLM 调用统计
    const topLevelPhases = session.phases.filter((p) => !p.parentPhaseId);
    const phases: PhaseDurationSummary[] = topLevelPhases.map((p) => {
      const dur = p.durationMs ?? (p.endTime ? p.endTime - p.startTime : 0);
      const phaseLlmCalls = llmCalls.filter((c) => c.phaseId === p.id);
      const ttltValues = phaseLlmCalls
        .map((c) => c.ttltMs)
        .filter((v) => v > 0);
      return {
        name: p.name,
        durationMs: dur,
        percentOfTotal: totalDurationMs > 0 ? (dur / totalDurationMs) * 100 : 0,
        llmCallCount: phaseLlmCalls.length,
        avgTtltMs:
          ttltValues.length > 0
            ? Math.round(
                ttltValues.reduce((s, v) => s + v, 0) / ttltValues.length,
              )
            : undefined,
      };
    });

    // LLM 聚合
    const llmCallCount = llmCalls.length;
    const llmTotalTimeMs = llmCalls.reduce(
      (sum, c) => sum + c.totalDurationMs,
      0,
    );
    // Note: 并行 LLM 调用的总时间可能超过 wall-clock 时间，所以不 cap 到 100%
    const llmTimePercent =
      totalDurationMs > 0 ? (llmTotalTimeMs / totalDurationMs) * 100 : 0;
    const overheadMs = Math.max(0, totalDurationMs - llmTotalTimeMs);

    // TTFT 统计（仅流式调用）
    const ttft = this.computePercentileStats(
      llmCalls
        .filter((c) => c.streaming && c.ttftMs != null)
        .map((c) => c.ttftMs!),
    );

    // TTLT 统计（所有 LLM 调用）
    const ttlt = this.computePercentileStats(
      llmCalls.map((c) => c.ttltMs).filter((v) => v > 0),
    );

    // Token 统计
    const totalInputTokens = llmCalls.reduce(
      (sum, c) => sum + c.inputTokens,
      0,
    );
    const totalOutputTokens = llmCalls.reduce(
      (sum, c) => sum + c.outputTokens,
      0,
    );
    const throughputs = llmCalls
      .map((c) => c.tokenThroughputPerSec)
      .filter((t) => t > 0);
    const avgTokenThroughput =
      throughputs.length > 0
        ? Math.round(
            (throughputs.reduce((s, v) => s + v, 0) / throughputs.length) * 10,
          ) / 10
        : 0;

    return {
      sessionId: session.id,
      type: session.type,
      status: session.status,
      totalDurationMs,
      phases,
      llmCallCount,
      llmTotalTimeMs,
      llmTimePercent: Math.round(llmTimePercent * 10) / 10,
      overheadMs,
      ttft,
      ttlt,
      totalInputTokens,
      totalOutputTokens,
      avgTokenThroughput,
    };
  }

  /** 计算百分位统计 */
  private computePercentileStats(
    values: number[],
  ): LatencyPercentileStats | undefined {
    if (values.length === 0) return undefined;
    const sorted = [...values].sort((a, b) => a - b);
    return {
      avgMs:
        Math.round((sorted.reduce((s, v) => s + v, 0) / sorted.length) * 10) /
        10,
      p50Ms: this.percentile(sorted, 50),
      p95Ms: this.percentile(sorted, 95),
      minMs: sorted[0],
      maxMs: sorted[sorted.length - 1],
    };
  }

  /** 百分位计算（数组已排序） */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  // ==================== Persistence ====================

  private async persistSession(
    session: LatencySession,
    summary: LatencySessionSummary,
  ): Promise<void> {
    if (!this.prisma) return;

    try {
      await this.prisma.latencySession.create({
        data: {
          id: session.id,
          type: session.type,
          status: session.status,
          userId: session.userId,
          entityId: session.entityId,
          startTime: new Date(session.startTime),
          endTime: session.endTime ? new Date(session.endTime) : null,
          durationMs: summary.totalDurationMs,
          summary: JSON.parse(JSON.stringify(summary)) as Prisma.InputJsonValue,
          phases: JSON.parse(
            JSON.stringify(session.phases),
          ) as Prisma.InputJsonValue,
          llmCalls: JSON.parse(
            JSON.stringify(session.llmCalls),
          ) as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      this.logger.warn(`[Persist] Failed to save session ${session.id}: ${e}`);
    }
  }
}
