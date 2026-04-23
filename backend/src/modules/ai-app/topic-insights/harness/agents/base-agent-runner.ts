/**
 * Base class for harness agent runners
 *
 * 提供：
 * - signal.aborted 前置检查
 * - Zod 输出校验（失败抛 StageSchemaError）
 * - 可选 business rule 校验钩子
 * - Budget charge（真实 tokens + cost）
 * - stub 模式（HARNESS_AGENTS_STUB=1）：返回 schemaValid 占位数据
 * - real 模式（stub=0）：委托 `LlmInvokerService.invoke(schema + system prompt + user prompt)`
 *
 * 子类契约：
 * - `stubOutput(ctx)`：stub 模式输出
 * - `buildSystemPrompt(ctx)` + `buildUserPrompt(ctx)` + `taskProfile`：real 模式调用
 */

import { Logger } from "@nestjs/common";
import type { z } from "zod";
import type { TaskProfile } from "@/modules/ai-engine/facade";
import { StageSchemaError } from "../../pipeline/types";
import {
  type AccessToolId,
  type AgentRunContext,
  type AgentRunResult,
  type AgentRunner,
  isStubMode,
} from "./types";
import type { LlmInvokerService } from "../llm";

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

  /** Real LLM 模式的 TaskProfile（agent 自身配置） */
  protected abstract readonly taskProfile: TaskProfile;

  constructor(protected readonly llmInvoker?: LlmInvokerService) {}

  async run(ctx: AgentRunContext<TInput>): Promise<AgentRunResult<TOutput>> {
    if (ctx.signal.aborted) {
      throw new DOMException(`[${this.id}] Aborted before run`, "AbortError");
    }

    const stub = isStubMode();
    const started = Date.now();

    const raw = stub ? await this.stubOutput(ctx) : await this.executeReal(ctx);

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
   * Real LLM 执行路径：默认走 LlmInvokerService。
   * 子类可覆盖以做更复杂的 orchestration（多轮 tool call 等）。
   */
  protected async executeReal(
    ctx: AgentRunContext<TInput>,
  ): Promise<{ output: unknown; tokensUsed: number; costUsd: number }> {
    if (!this.llmInvoker) {
      throw new Error(
        `[${this.id}] Real LLM mode requested but LlmInvokerService not injected. ` +
          `Either set HARNESS_AGENTS_STUB=1 or provide LlmInvokerService at construction.`,
      );
    }

    const systemPrompt = this.buildSystemPrompt(ctx);
    const userPrompt = this.buildUserPrompt(ctx);

    const res = await this.llmInvoker.invoke({
      agentId: this.id,
      systemPrompt,
      userPrompt,
      schema: this.outputSchema,
      taskProfile: this.taskProfile,
      signal: ctx.signal,
      userId: ctx.identity.userId,
      operationName: this.id,
    });

    return {
      output: res.output,
      tokensUsed: res.tokensUsed,
      costUsd: res.costUsd,
    };
  }

  /** 子类覆盖：stub 模式输出 */
  protected abstract stubOutput(
    ctx: AgentRunContext<TInput>,
  ): Promise<{ output: unknown; tokensUsed: number; costUsd: number }>;

  /** 子类覆盖：real 模式 system prompt */
  protected abstract buildSystemPrompt(ctx: AgentRunContext<TInput>): string;

  /** 子类覆盖：real 模式 user prompt */
  protected abstract buildUserPrompt(ctx: AgentRunContext<TInput>): string;

  /**
   * 业务规则校验（Zod 之外的 invariants）。
   * 默认无操作；子类按需覆盖。抛错以中止 pipeline。
   */
  protected validateBusinessRules(
    _output: TOutput,
    _ctx: AgentRunContext<TInput>,
  ): void {
    // no-op by default
  }
}
