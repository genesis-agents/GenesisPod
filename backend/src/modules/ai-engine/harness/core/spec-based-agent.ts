/**
 * SpecBasedAgent — 声明式 spec 驱动的 IAgent 实现
 *
 * 目标架构 v2（docs/design/topic-insights-harness-redesign/11-target-architecture.md）：
 * L3 App 只写 IAgentSpec，本类把 spec 转成可执行的 IAgent：
 *   - buildSystemPrompt / buildUserPrompt → 构造 LLM 输入
 *   - LlmExecutor.execute → Zod 校验 + error-fed retry + stub 模式
 *   - validateBusinessRules → 业务规则校验
 *   - forbiddenTools → access matrix 强校验（通过 agentIdentity 透出给 ToolInvoker）
 *
 * 为什么新建类而不扩展 HarnessedAgent：
 *   HarnessedAgent 设计为 ReActLoop 多步 agent（tool calling / multi-iteration）。
 *   spec-based agent 是 single-shot LLM call with schema — 语义不同，继承关系牵强。
 *
 * 对外暴露两种调用方式：
 *   - executeSpec(input) → Promise<IAgentResult<TOutput>>（推荐：pipeline stage 用这个，拿 typed output）
 *   - execute(task) → AsyncIterable<IAgentEvent>（兼容 IAgent 接口，yields thinking + finalize event pair）
 */

import { Logger } from "@nestjs/common";
import { KernelContext } from "@/modules/ai-engine/facade";
import type {
  IAgent,
  IAgentEvent,
  IAgentIdentity,
  IAgentSpec,
  IAgentTask,
  AgentId,
  AgentState,
  IContextEnvelope,
  ISubagentHandle,
  ISubagentSpec,
} from "../abstractions";
import { AgentIdentity } from "./agent-identity";
import { ContextEnvelope } from "./context-envelope";
import { LlmExecutor } from "../executor/llm-executor";

/**
 * SpecBasedAgent 的强类型结果（与 IAgentResult 相似但带泛型 TOutput）
 */
export interface SpecAgentResult<TOutput> {
  readonly output: TOutput;
  readonly state: "completed" | "failed" | "cancelled";
  readonly iterations: number;
  readonly tokensUsed: number;
  readonly costUsd: number;
  readonly model: string;
  readonly wallTimeMs: number;
  readonly errors?: readonly string[];
}

export class SpecBasedAgent<
  TInput = unknown,
  TOutput = unknown,
> implements IAgent {
  private readonly logger: Logger;
  private _state: AgentState = "idle";
  private readonly abortController = new AbortController();
  private readonly _identity: AgentIdentity;
  private envelope: ContextEnvelope;

  constructor(
    public readonly id: AgentId,
    private readonly spec: IAgentSpec<TInput, TOutput>,
    private readonly llmExecutor: LlmExecutor,
  ) {
    this.logger = new Logger(`SpecBasedAgent:${id}`);
    this._identity =
      spec.identity instanceof AgentIdentity
        ? spec.identity
        : new AgentIdentity(spec.identity);
    this.envelope = new ContextEnvelope({
      system: spec.systemPrompt ?? this._identity.toSystemPrompt(),
      messages: [],
      reminders: [],
      tools: [...this._identity.tools],
      memory: { sessionId: spec.sessionId ?? id, userId: spec.userId },
      budget: {
        tokensUsed: 0,
        tokensRemaining: this._identity.constraints?.maxTokens ?? 50_000,
        iterationsUsed: 0,
        iterationsRemaining: this._identity.constraints?.maxIterations ?? 5,
        wallTimeStartMs: Date.now(),
      },
    });
  }

  get identity(): IAgentIdentity {
    return this._identity;
  }

  get state(): AgentState {
    return this._state;
  }

  /**
   * ★ 目标架构主入口：spec → LLM → typed output
   * Pipeline stages 用这个方法，得到强类型结果。
   */
  async executeSpec(input: TInput): Promise<SpecAgentResult<TOutput>> {
    this._state = "running";
    const startMs = Date.now();
    const ctx = { input, identity: this._identity };

    const systemPrompt = this.spec.buildSystemPrompt
      ? this.spec.buildSystemPrompt(ctx)
      : (this.spec.systemPrompt ?? this._identity.toSystemPrompt());
    const userPrompt = this.spec.buildUserPrompt
      ? this.spec.buildUserPrompt(ctx)
      : typeof input === "string"
        ? input
        : JSON.stringify(input);

    const kctx = KernelContext.get();

    try {
      const result = await this.llmExecutor.execute<TOutput>({
        agentId: this.id,
        systemPrompt,
        userPrompt,
        outputSchema: this.spec.outputSchema,
        validateBusinessRules: this.spec.validateBusinessRules
          ? (output) => this.spec.validateBusinessRules!(output, ctx)
          : undefined,
        taskProfile: this.spec.taskProfile ?? {
          creativity: "low",
          outputLength: "medium",
        },
        signal: this.abortController.signal,
        userId: this.spec.userId ?? kctx?.userId,
        operationName: this.id,
        stubFn: this.spec.stubFn ? () => this.spec.stubFn!(ctx) : undefined,
      });
      this._state = "completed";
      return {
        output: result.output,
        state: "completed",
        iterations: result.retries + 1,
        tokensUsed: result.tokensUsed,
        costUsd: result.costUsd,
        model: result.model,
        wallTimeMs: Date.now() - startMs,
      };
    } catch (err) {
      this._state = "failed";
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`executeSpec failed: ${msg}`);
      return {
        output: undefined as unknown as TOutput,
        state: "failed",
        iterations: 0,
        tokensUsed: 0,
        costUsd: 0,
        model: "",
        wallTimeMs: Date.now() - startMs,
        errors: [msg],
      };
    }
  }

  /**
   * 兼容 IAgent 接口的流式 execute。
   * spec-based agent 是 single-shot：yield 一条 "thinking" + 一条 "output" 事件。
   */
  async *execute(task: IAgentTask): AsyncIterable<IAgentEvent> {
    const input = task.input as TInput;
    yield {
      type: "thinking",
      payload: { text: `spec agent ${this.id} starting`, tokenCount: 0 },
    } as IAgentEvent;

    const result = await this.executeSpec(input);

    if (result.state === "completed") {
      yield {
        type: "output",
        payload: {
          output: result.output as string | Record<string, unknown>,
        },
      } as IAgentEvent;
    } else {
      yield {
        type: "error",
        payload: {
          message: result.errors?.join("; ") ?? "spec agent failed",
          recoverable: false,
        },
      } as IAgentEvent;
    }
  }

  spawnSubagent(_spec: ISubagentSpec): Promise<ISubagentHandle> {
    return Promise.reject(
      new Error(
        `[${this.id}] SpecBasedAgent does not support subagent spawning`,
      ),
    );
  }

  getEnvelope(): IContextEnvelope {
    return this.envelope;
  }

  cancel(reason?: string): Promise<void> {
    this.abortController.abort(reason);
    this._state = "cancelled";
    return Promise.resolve();
  }
}
