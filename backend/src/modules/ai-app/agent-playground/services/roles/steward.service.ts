/**
 * StewardService —— 资源/合规/边界守门统一入口（多 scope）
 *
 * StewardAgent 是 multi-scope discriminated union：
 *   - budget-guard     预算/速率/超阈值告警
 *   - compliance-check 合规检查（敏感主题、机构注册要求）
 *   - data-boundary    数据边界（PII/秘密 leak 检测）
 *   - source-diversity 来源多样性（避免单一信息源）
 *
 * 当前 orchestrator 暂未接入 StewardAgent；建本服务为 PR-S5 接入做准备。
 */

import { Injectable } from "@nestjs/common";
import { StewardAgent } from "../../agents/steward/steward.agent";
import { AgentInvoker, type InvocationContext } from "./agent-invoker.service";

interface InvokeResult<TOut> {
  state: "completed" | "failed" | "cancelled";
  output?: TOut;
  events: unknown[];
  iterations: number;
  wallTimeMs: number;
}

@Injectable()
export class StewardService {
  constructor(private readonly invoker: AgentInvoker) {}

  async guardBudget<TIn, TOut>(
    input: TIn,
    ctx: InvocationContext,
  ): Promise<InvokeResult<TOut>> {
    return this.invokeSteward(
      { ...(input as object), scope: "budget-guard" } as TIn,
      ctx,
    );
  }

  async checkCompliance<TIn, TOut>(
    input: TIn,
    ctx: InvocationContext,
  ): Promise<InvokeResult<TOut>> {
    return this.invokeSteward(
      { ...(input as object), scope: "compliance-check" } as TIn,
      ctx,
    );
  }

  async checkBoundary<TIn, TOut>(
    input: TIn,
    ctx: InvocationContext,
  ): Promise<InvokeResult<TOut>> {
    return this.invokeSteward(
      { ...(input as object), scope: "data-boundary" } as TIn,
      ctx,
    );
  }

  async checkSourceDiversity<TIn, TOut>(
    input: TIn,
    ctx: InvocationContext,
  ): Promise<InvokeResult<TOut>> {
    return this.invokeSteward(
      { ...(input as object), scope: "source-diversity" } as TIn,
      ctx,
    );
  }

  private async invokeSteward<TIn, TOut>(
    input: TIn,
    ctx: InvocationContext,
  ): Promise<InvokeResult<TOut>> {
    const r = await this.invoker.invoke(
      StewardAgent,
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
      events: r.events as unknown[],
      iterations: r.iterations,
      wallTimeMs: r.wallTimeMs,
    };
  }
}
