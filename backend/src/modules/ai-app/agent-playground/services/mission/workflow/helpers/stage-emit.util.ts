/**
 * stage-emit util — stage:started / stage:completed 事件统一封装
 *
 * ★ OBSERVABILITY (2026-04-30): 之前各 stage 自己手写 emit stage:completed，
 *   payload 字段五花八门、缺 durationMs / tokensUsed / agentInvocations 等共用度量。
 *   新建 emitStageCompleted helper 统一注入这些字段，让 UI 时间线 / monitoring
 *   能在一个地方拿到 stage 性能数据。stage 自己的业务字段仍可叠加。
 *
 * 用法：
 *   const stage = startStageTimer();
 *   await emit({ type: "stage:started", missionId, userId, payload: { stage: "leader" }});
 *   ... 业务代码 ...
 *   await stage.emitCompleted(emit, missionId, userId, {
 *     stage: "leader",
 *     custom: { dimensions: 5 },
 *   });
 */

import type { EmitFn } from "../mission-deps";

export interface StageTimerEmitOptions {
  /** stage 业务名（leader / researchers / analyst 等） */
  stage: string;
  /** stage 自己的业务 payload，会与公共字段合并 */
  custom?: Record<string, unknown>;
  /** 该 stage 累积调用 agent 次数（researcher 多 dim 时 > 1） */
  agentInvocations?: number;
  /** 该 stage 累积消耗 tokens（来自 pool 增量） */
  tokensUsed?: number;
  /** 该 stage 累积成本 USD */
  costUsd?: number;
  /** 该 stage 状态：completed / degraded / failed */
  status?: "completed" | "degraded" | "failed";
}

export interface StageTimer {
  startedAtMs: number;
  emitCompleted(
    emit: EmitFn,
    missionId: string,
    userId: string,
    opts: StageTimerEmitOptions,
  ): Promise<void>;
}

export function startStageTimer(): StageTimer {
  const startedAtMs = Date.now();
  return {
    startedAtMs,
    async emitCompleted(emit, missionId, userId, opts) {
      const durationMs = Date.now() - startedAtMs;
      await emit({
        type: "agent-playground.stage:completed",
        missionId,
        userId,
        payload: {
          stage: opts.stage,
          durationMs,
          status: opts.status ?? "completed",
          agentInvocations: opts.agentInvocations,
          tokensUsed: opts.tokensUsed,
          costUsd: opts.costUsd,
          ...(opts.custom ?? {}),
        },
      }).catch(() => {});
    },
  };
}
