/**
 * ReviewerService —— 主观质量评审角色统一入口
 *
 * 暴露 3 个方法对应 3 个 reviewer agent class:
 *   reviewMission()  → MissionReviewerAgent      （5-axis verifier 兜底，可选）
 *   criticL4()       → MissionCriticAgent        L4 元评审（blindspots/biases）
 *   judgeDimension() → DimensionQualityJudgeAgent dim-level 质量打分
 */

import { Injectable } from "@nestjs/common";
import { MissionReviewerAgent } from "../../agents/reviewer/mission-reviewer.agent";
import { MissionCriticAgent } from "../../agents/reviewer/mission-critic.agent";
import { DimensionQualityJudgeAgent } from "../../agents/reviewer/dimension-quality-judge.agent";
import { AgentInvoker, type InvocationContext } from "./agent-invoker.service";
import type { HarnessIAgentEvent as IAgentEvent } from "../../../../ai-engine/facade";

interface InvokeResult<TOut> {
  state: "completed" | "failed" | "cancelled";
  output?: TOut;
  events: readonly IAgentEvent[];
  iterations: number;
  wallTimeMs: number;
}

@Injectable()
export class ReviewerService {
  constructor(private readonly invoker: AgentInvoker) {}

  async reviewMission<TIn, TOut>(
    input: TIn,
    ctx: InvocationContext,
  ): Promise<InvokeResult<TOut>> {
    return this.invokeReviewer(MissionReviewerAgent, input, ctx);
  }

  async criticL4<TIn, TOut>(
    input: TIn,
    ctx: InvocationContext,
  ): Promise<InvokeResult<TOut>> {
    return this.invokeReviewer(MissionCriticAgent, input, ctx);
  }

  async judgeDimension<TIn, TOut>(
    input: TIn,
    ctx: InvocationContext,
  ): Promise<InvokeResult<TOut>> {
    return this.invokeReviewer(DimensionQualityJudgeAgent, input, ctx);
  }

  private async invokeReviewer<TSpec, TIn, TOut>(
    spec: TSpec,
    input: TIn,
    ctx: InvocationContext,
  ): Promise<InvokeResult<TOut>> {
    const r = await this.invoker.invoke(
      spec as Parameters<AgentInvoker["invoke"]>[0],
      input as Parameters<AgentInvoker["invoke"]>[1],
      ctx,
    );
    return {
      state:
        r.state === "completed"
          ? "completed"
          : r.state === "cancelled"
            ? "cancelled"
            : "failed",
      output: r.output as TOut | undefined,
      events: r.events,
      iterations: r.iterations,
      wallTimeMs: r.wallTimeMs,
    };
  }
}
