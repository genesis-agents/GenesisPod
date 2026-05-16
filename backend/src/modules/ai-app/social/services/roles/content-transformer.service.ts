/**
 * ContentTransformerService — S3 跨平台内容适配派发
 *
 * 多平台时 stage 层用 ConcurrencyLimiter 并发调本 service 的 run()，每个平台
 * 一份独立 LLM 调用。
 */

import { Injectable } from "@nestjs/common";
import {
  ContentTransformerAgent,
  type ContentTransformerInput,
  type ContentTransformerOutput,
} from "../../agents/content-transformer";
import {
  SocialAgentInvoker,
  extractTokenSpend,
  type SocialInvocationContext,
} from "./social-agent-invoker.service";
import {
  MissionBudgetPool,
  type IAgentEvent,
} from "@/modules/ai-harness/facade";
import { normalizeRunnerState } from "./runner-state.util";

export interface ContentTransformerInvocationResult {
  state: "completed" | "degraded" | "failed" | "cancelled";
  output?: ContentTransformerOutput;
  events: readonly IAgentEvent[];
  iterations: number;
  wallTimeMs: number;
}

@Injectable()
export class ContentTransformerService {
  constructor(private readonly invoker: SocialAgentInvoker) {}

  async run(args: {
    input: ContentTransformerInput;
    ctx: SocialInvocationContext;
    pool?: MissionBudgetPool;
  }): Promise<ContentTransformerInvocationResult> {
    const r = await this.invoker.invoke(
      ContentTransformerAgent,
      args.input,
      args.ctx,
    );
    if (args.pool) {
      await this.invoker.tickCost(
        args.ctx.missionId,
        args.ctx.userId,
        `content-transform-${args.input.platform}`,
        args.pool,
        extractTokenSpend(r.events),
      );
    }
    return {
      state: normalizeRunnerState(r.state),
      output: r.output as ContentTransformerOutput | undefined,
      events: r.events,
      iterations: r.iterations,
      wallTimeMs: r.wallTimeMs,
    };
  }
}
