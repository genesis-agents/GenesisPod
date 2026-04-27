/**
 * VerifierService —— 客观事实核验统一入口（多 mode）
 *
 * 当前 orchestrator 暂未接入 VerifierAgent；建本服务为 PR-S5 接入做准备。
 * VerifierAgent 是 multi-mode discriminated union：
 *   - citation-audit  引用核验（findings 是否真出现在 source）
 *   - number-check    数字一致性（claim 中的数字 vs evidence 中的数字）
 *   - claim-grounding 主张接地度（每个 claim 是否有可信 source 支撑）
 *   - source-tier     来源分级（一手 / 权威媒体 / 非权威 / 不可信）
 */

import { Injectable } from "@nestjs/common";
import { VerifierAgent } from "../../agents/verifier/verifier.agent";
import { AgentInvoker, type InvocationContext } from "./agent-invoker.service";

interface InvokeResult<TOut> {
  state: "completed" | "failed" | "cancelled";
  output?: TOut;
  events: unknown[];
  iterations: number;
  wallTimeMs: number;
}

@Injectable()
export class VerifierService {
  constructor(private readonly invoker: AgentInvoker) {}

  async auditCitation<TIn, TOut>(
    input: TIn,
    ctx: InvocationContext,
  ): Promise<InvokeResult<TOut>> {
    return this.invokeVerifier(
      { ...(input as object), mode: "citation-audit" } as TIn,
      ctx,
    );
  }

  async checkNumber<TIn, TOut>(
    input: TIn,
    ctx: InvocationContext,
  ): Promise<InvokeResult<TOut>> {
    return this.invokeVerifier(
      { ...(input as object), mode: "number-check" } as TIn,
      ctx,
    );
  }

  async groundClaim<TIn, TOut>(
    input: TIn,
    ctx: InvocationContext,
  ): Promise<InvokeResult<TOut>> {
    return this.invokeVerifier(
      { ...(input as object), mode: "claim-grounding" } as TIn,
      ctx,
    );
  }

  async tierSource<TIn, TOut>(
    input: TIn,
    ctx: InvocationContext,
  ): Promise<InvokeResult<TOut>> {
    return this.invokeVerifier(
      { ...(input as object), mode: "source-tier" } as TIn,
      ctx,
    );
  }

  private async invokeVerifier<TIn, TOut>(
    input: TIn,
    ctx: InvocationContext,
  ): Promise<InvokeResult<TOut>> {
    const r = await this.invoker.invoke(
      VerifierAgent,
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
