/**
 * AnalystService —— 跨 dim 综合分析的统一入口
 *
 * 责任:
 *   - 从 reconciler.factTable / conflicts / gaps + researcher findings 综合
 *   - 输出 insights[] / contradictions[] / strategicRecommendations 等
 *   - schema 由 AnalystAgent.outputSchema 决定（orchestrator 传 input 时按需裁剪）
 */

import { Injectable } from "@nestjs/common";
import { AnalystAgent } from "../../agents/analyst/analyst.agent";
import { AgentInvoker, type InvocationContext } from "./agent-invoker.service";
import type { IAgentEvent } from "@/modules/ai-harness/facade";
import { normalizeRunnerState } from "./runner-state.util";

@Injectable()
export class AnalystService {
  constructor(private readonly invoker: AgentInvoker) {}

  async analyze<TIn, TOut>(
    input: TIn,
    ctx: InvocationContext,
  ): Promise<{
    // degraded: reflexion verifier 评分 < passThreshold 但 outputSchema 合法的次优产物
    state: "completed" | "degraded" | "failed" | "cancelled";
    output?: TOut;
    events: readonly IAgentEvent[];
    iterations: number;
    wallTimeMs: number;
  }> {
    const r = await this.invoker.invoke(
      AnalystAgent,
      input as Parameters<AgentInvoker["invoke"]>[1],
      ctx,
    );
    return {
      state: normalizeRunnerState(r.state),
      output: r.output as TOut | undefined,
      events: r.events,
      iterations: r.iterations,
      wallTimeMs: r.wallTimeMs,
    };
  }
}
