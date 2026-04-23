/**
 * Base class for harness agent runners
 *
 * 提供：
 * - signal.aborted 前置检查
 * - Zod 输出校验（失败抛 StageSchemaError）
 * - 可选 business rule 校验钩子
 * - Budget charge
 * - stub 模式支持（HARNESS_AGENTS_STUB=1）
 *
 * 子类必须实现 `executeImpl`（真实执行路径）和 `stubOutput`（stub 模式输出）。
 * 真实执行可能涉及 LLM 调用；base 不强制 LLM，允许子类自行决定如何拿到 output。
 */

import { Logger } from "@nestjs/common";
import type { z } from "zod";
import { StageSchemaError } from "../pipeline/types";
import {
  type AccessToolId,
  type AgentRunContext,
  type AgentRunResult,
  type AgentRunner,
  isStubMode,
} from "./types";

export abstract class BaseAgentRunner<TInput, TOutput> implements AgentRunner<
  TInput,
  TOutput
> {
  protected readonly logger = new Logger(this.constructor.name);

  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly tools: ReadonlyArray<AccessToolId>;
  readonly forbiddenTools?: ReadonlyArray<AccessToolId>;
  abstract readonly outputSchema: z.ZodType<TOutput>;

  async run(ctx: AgentRunContext<TInput>): Promise<AgentRunResult<TOutput>> {
    if (ctx.signal.aborted) {
      throw new DOMException(`[${this.id}] Aborted before run`, "AbortError");
    }

    const stub = isStubMode();
    const started = Date.now();

    const raw = stub ? await this.stubOutput(ctx) : await this.executeImpl(ctx);

    if (ctx.signal.aborted) {
      throw new DOMException(`[${this.id}] Aborted during run`, "AbortError");
    }

    // Zod 解析
    const parsed = this.outputSchema.safeParse(raw.output);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      );
      throw new StageSchemaError(this.id, issues);
    }

    // Business rule hook
    this.validateBusinessRules(parsed.data, ctx);

    ctx.identity.budget.charge({
      tokens: raw.tokensUsed,
      costUsd: raw.costUsd,
    });

    const elapsed = Date.now() - started;
    this.logger.debug(
      `[${this.id}] run OK (stub=${stub}, tokens=${raw.tokensUsed}, cost=$${raw.costUsd.toFixed(4)}, elapsed=${elapsed}ms)`,
    );

    return {
      agentId: this.id,
      output: parsed.data,
      tokensUsed: raw.tokensUsed,
      costUsd: raw.costUsd,
      stub,
    };
  }

  /**
   * 子类覆盖：真实执行路径（可能调 LLM）
   * 当前 Tier Core 阶段：子类直接抛 "not implemented"，因为 Group E 集成才接入 LLM
   */
  protected abstract executeImpl(
    ctx: AgentRunContext<TInput>,
  ): Promise<{ output: unknown; tokensUsed: number; costUsd: number }>;

  /**
   * 子类覆盖：stub 模式输出（必须 Zod schema-valid）
   */
  protected abstract stubOutput(
    ctx: AgentRunContext<TInput>,
  ): Promise<{ output: unknown; tokensUsed: number; costUsd: number }>;

  /**
   * 业务规则校验（Zod 之外的 invariants）。
   * 默认无操作；子类按需覆盖。抛 StageSchemaError 报错。
   */
  protected validateBusinessRules(
    _output: TOutput,
    _ctx: AgentRunContext<TInput>,
  ): void {
    // no-op by default
  }
}
