/**
 * ResearcherService —— researcher 角色统一入口
 *
 * 责任 (Phase Lead-Services):
 *   • 单 dim ResearcherAgent 的派发、self-heal 重试、cost / lifecycle 上报
 *   • Lead M1 dispatch 落地（retry-with-critique / replace-spec / abort / extend）
 *   • orchestrator 不再直接 runAndRelay(ResearcherAgent, ...)，统一走本服务方法
 *
 * orchestrator 与本服务的边界：
 *   - 拓扑/并发分发由 orchestrator 决定（DAG vs 全并行）
 *   - failureLearner / preDisable / chapter pipeline 等横切关注 orchestrator 仍持有
 *     （pipeline 跨 writer 域，迁出留作 PR-S4）
 */

import { Injectable } from "@nestjs/common";
import { ResearcherAgent } from "../../agents/researcher/researcher.agent";
import { AgentInvoker, type InvocationContext } from "./agent-invoker.service";
import { MissionBudgetPool } from "../../../../ai-engine/facade";

export interface ResearcherDimSpec {
  id: string;
  name: string;
  rationale: string;
  toolHint?: {
    categories: readonly string[];
    preferIds?: readonly string[];
  };
  dependsOn?: readonly string[];
}

export interface ResearcherFinding {
  claim: string;
  evidence: string;
  source: string;
}

export interface ResearcherOutput {
  dimension: string;
  findings: ResearcherFinding[];
  summary: string;
  figureCandidates?: unknown[];
}

@Injectable()
export class ResearcherService {
  constructor(private readonly invoker: AgentInvoker) {}

  /**
   * 跑单个 dim 的 ResearcherAgent。
   * 调用方负责 lifecycle started/completed/failed event（典型在 orchestrator 的
   * researcher dispatch 闭包内已经做了，本方法不会重复 emit lifecycle —— 只 emit cost）。
   */
  async runDimension(args: {
    topic: string;
    dimension: string;
    language: "zh-CN" | "en-US";
    /** Lead M1 给的 critique，注入到 researcher prompt */
    critique?: string;
    ctx: InvocationContext;
    pool?: MissionBudgetPool;
  }): Promise<{
    state: "completed" | "failed" | "cancelled";
    output?: ResearcherOutput;
    events: ReturnType<AgentInvoker["invoke"]> extends Promise<infer R>
      ? R extends { events: infer E }
        ? E
        : never
      : never;
    iterations: number;
    wallTimeMs: number;
  }> {
    const r = await this.invoker.invoke(
      ResearcherAgent,
      {
        topic: args.topic,
        dimension: args.dimension,
        language: args.language,
        critique: args.critique,
      },
      args.ctx,
    );
    if (args.pool) {
      await this.invoker.tickCost(
        args.ctx.missionId,
        args.ctx.userId,
        "researchers",
        args.pool,
        extractTokenSpend(r.events),
      );
    }
    return {
      state:
        r.state === "completed"
          ? "completed"
          : r.state === "cancelled"
            ? "cancelled"
            : "failed",
      output: r.output as ResearcherOutput | undefined,
      events: r.events as never,
      iterations: r.iterations,
      wallTimeMs: r.wallTimeMs,
    };
  }
}

/** 局部复制 —— orchestrator 同名工具函数；后续 invoker 可吸纳 */
function extractTokenSpend(
  events: readonly { type: string; payload: unknown }[],
): number {
  let total = 0;
  let lastBudgetTokens = 0;
  for (const ev of events) {
    if (ev.type === "action_executed") {
      const p = ev.payload as { tokensUsed?: number } | null;
      if (p && typeof p.tokensUsed === "number") total += p.tokensUsed;
    } else if (ev.type === "budget_warning") {
      const p = ev.payload as { tokensUsed?: number } | null;
      if (p && typeof p.tokensUsed === "number") {
        lastBudgetTokens = Math.max(lastBudgetTokens, p.tokensUsed);
      }
    }
  }
  return Math.max(total, lastBudgetTokens);
}
