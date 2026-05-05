/**
 * SpecBasedAgent — 声明式 spec 驱动的 IAgent 实现
 *
 * 目标架构 v2（docs/architecture/ai-app/topic-insights/harness-redesign/11-target-architecture.md）：
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
import { AIModelType } from "@prisma/client";
// ★ 直接相对路径导入，绕开 facade barrel。
// 原因：facade/index.ts 是 L3 AI App 的单向入口；L2 harness 内部代码
// 若也从 facade 导入，会触发 barrel → 众多子模块 → harness 的回环加载，
// 导致 TypeScript 在 module evaluation 阶段产生 `undefined` 类 reference，
// Nest DI 随后报 "Cannot resolve dependency at index [0]"。
import { KernelContext } from "../../../../common/context/kernel-context";
import {
  ModelElectionService,
  NoEligibleModelError,
  type ElectionCandidate,
  type ElectionRoleHint,
} from "../../../ai-engine/llm/selection";
import type { EnvironmentSnapshot } from "../../../ai-harness/guardrails/runtime/runtime-environment.types";
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
import { LlmExecutor } from "../../runner/executor/llm-executor";

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
    /**
     * Lazy election accessor — 由 AgentFactory 传入的闭包 `() => factory.electionService`。
     * 必须 lazy：本 agent 在 OnModuleInit 阶段创建，AgentFactory.electionService
     * 在 OnApplicationBootstrap 阶段才被 wire（setter injection 绕开 Nest v10
     * forwardRef+Optional DI 时序坑，见 docs/16-facade-barrel-rule.md）。
     * 构造时捕获 ref = 永远 undefined；必须运行时拉取。
     */
    private readonly electionProvider?: () => ModelElectionService | undefined,
    /**
     * 运行时环境快照。通常由 pipeline orchestrator 在 executeSpec 前注入（来自
     * identity.capabilities.env）。没有 snapshot 时，election 退化到 DB 全表。
     */
    private readonly envSnapshot?: EnvironmentSnapshot,
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
   *
   * @param envOverride 调用时传入的环境快照——通常来自 pipeline
   *   `identity.capabilities.env`；缺省时使用构造时注入的 envSnapshot，
   *   两者都缺就让 election 退到 DB 全表查询。
   */
  async executeSpec(
    input: TInput,
    envOverride?: EnvironmentSnapshot,
  ): Promise<SpecAgentResult<TOutput>> {
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
    const effectiveUserId = this.spec.userId ?? kctx?.userId;

    // ============================================================
    // 环境感知选举：spec 没声明显式 model → 根据 role + TaskProfile 动态选
    // ============================================================
    const taskProfile = this.spec.taskProfile ?? {
      creativity: "low",
      outputLength: "medium",
    };
    const effectiveEnv = envOverride ?? this.envSnapshot;
    const electedModelId = await this.electModelOrNull(
      taskProfile,
      effectiveUserId,
      effectiveEnv,
    );

    try {
      const result = await this.llmExecutor.execute<TOutput>({
        agentId: this.id,
        systemPrompt,
        userPrompt,
        model: electedModelId,
        outputSchema: this.spec.outputSchema,
        validateBusinessRules: this.spec.validateBusinessRules
          ? (output) => this.spec.validateBusinessRules!(output, ctx)
          : undefined,
        taskProfile,
        signal: this.abortController.signal,
        userId: effectiveUserId,
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

  /**
   * 执行环境感知选举。失败时返回 undefined（让下游 LlmExecutor 走 AiChatService
   * 的旧兜底链路，保持向后兼容）。抛 NoEligibleModelError 时 upstream 要看到
   * 清晰报错，所以这里直接 throw，让 executeSpec 的 catch 接住。
   */
  private async electModelOrNull(
    taskProfile: IAgentSpec<TInput, TOutput>["taskProfile"],
    userId: string | undefined,
    env: EnvironmentSnapshot | undefined,
  ): Promise<string | undefined> {
    // Lazy resolve — 此时 OnApplicationBootstrap 已跑过，factory.electionService 已 wire
    const electionService = this.electionProvider?.();
    if (!electionService) return undefined;

    const role = this.resolveRoleHint(this._identity.role.id);
    const requestedModelType = AIModelType.CHAT;
    const candidates = this.buildCandidatesFromSnapshot(
      env,
      requestedModelType,
    );

    try {
      const res = await electionService.elect({
        modelType: requestedModelType,
        candidates,
        taskProfile,
        role,
        userId,
      });
      this.logger.debug(
        `[electModel] ${this.id} → ${res.elected.modelId} (${res.reason})`,
      );
      return res.elected.modelId;
    } catch (err) {
      if (err instanceof NoEligibleModelError) throw err;
      this.logger.warn(
        `[electModel] ${this.id} election failed (non-fatal, falling back to AiChatService default): ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
      return undefined;
    }
  }

  /**
   * 从 spec.identity.role.id 映射到 ElectionRoleHint。
   * 规则：名字里出现 planner/leader/dispatch → leader；writer/section → writer；
   * reviewer/evaluator/checker → reviewer；extractor/miner → extractor；
   * classifier/intent → classifier；其余 default。
   */
  private resolveRoleHint(roleId: string): ElectionRoleHint {
    const lc = roleId.toLowerCase();
    if (/leader|planner|dispatch|adjust/.test(lc)) return "leader";
    if (/writer|section|synthes|editor|report/.test(lc)) return "writer";
    if (/review|evaluat|check|verif|repair/.test(lc)) return "reviewer";
    if (/extract|miner|meta/.test(lc)) return "extractor";
    if (/classif|intent/.test(lc)) return "classifier";
    return "default";
  }

  /** 从环境快照构造候选池；无 snapshot 时返回空数组（election 退到 DB 全表） */
  private buildCandidatesFromSnapshot(
    env: EnvironmentSnapshot | undefined,
    requestedType: AIModelType,
  ): ElectionCandidate[] {
    if (!env) return [];
    const rows = [
      ...env.models.CHAT,
      ...env.models.REASONING,
      ...(requestedType === AIModelType.EMBEDDING ? env.models.EMBEDDING : []),
    ];
    return rows.map((m) => ({
      modelId: m.modelId,
      provider: m.provider,
      modelType: m.modelType,
      healthy: m.healthy,
      recentErrorRate: m.recentErrorRate,
      costTier: m.costTier,
    }));
  }
}
