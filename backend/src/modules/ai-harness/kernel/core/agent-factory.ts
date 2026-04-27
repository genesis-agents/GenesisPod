/**
 * AgentFactory — 从 IAgentSpec 构造 HarnessedAgent
 *
 * 循环依赖处理：AgentFactory ↔ SubagentSpawner。
 * 采用 setter injection：HarnessModule onApplicationBootstrap 时把 spawner wire 进来。
 * 这比 forwardRef + @Inject(class) 更稳，测试里也可直接 factory.setSubagentSpawner(mock)。
 */

import { Injectable, Optional } from "@nestjs/common";
import { randomUUID } from "crypto";
// ★ type-only import — ModelElectionService is wired via setter injection
// (HarnessModule.onApplicationBootstrap) to avoid NestJS v10 forwardRef+Optional
// timing issues on sibling providers (LlmExecutor was losing AiChatService
// resolution in prod when this was a constructor @Optional inject).
import type { ModelElectionService } from "../../../ai-engine/llm/election";
import type { EnvironmentSnapshot } from "../../../ai-harness/governance/resource/runtime-environment.types";
import type {
  IAgent,
  IAgentLoop,
  IAgentSpec,
  IBudgetSnapshot,
  IContextEnvelope,
  IMemoryBinding,
  ISubagentSpawner,
} from "../../kernel/abstractions";
import { AgentIdentity } from "./agent-identity";
import { ContextEnvelope } from "./context-envelope";
import { HarnessedAgent } from "./harnessed-agent";
import { SpecBasedAgent } from "./spec-based-agent";
import { ReActLoop } from "../../execution/loop/react-loop";
import { LoopRegistry } from "../../execution/loop/loop-registry";
import { MemoryBridge } from "../../memory/auto-index/memory-bridge.service";
import { SkillActivator } from "../../kernel/skills/skill-activator";
import { CheckpointService } from "../../memory/checkpoint/checkpoint.service";
import { AgentEventStore } from "../../memory/checkpoint/agent-event-store";
import { LlmExecutor } from "../../execution/executor/llm-executor";
import { AgentRegistry } from "../../process/handoff/agent-registry";

@Injectable()
export class AgentFactory {
  private readonly defaultLoop?: IAgentLoop;
  private subagentSpawner?: ISubagentSpawner;
  /**
   * Model election service — wired via setter by HarnessModule.onApplicationBootstrap.
   * Same pattern as `subagentSpawner` above. Not using @Optional constructor inject
   * because in Nest v10 that combo with a forwardRef-provided dependency reliably
   * destabilised resolution of sibling providers (LlmExecutor lost AiChatService
   * in prod). Setter injection runs after all constructors, so no timing risk.
   */
  private electionService?: ModelElectionService;

  constructor(
    @Optional() reactLoop?: ReActLoop,
    @Optional() private readonly memoryBridge?: MemoryBridge,
    @Optional() private readonly skillActivator?: SkillActivator,
    @Optional() private readonly checkpointService?: CheckpointService,
    @Optional() private readonly llmExecutor?: LlmExecutor,
    /**
     * v2: LoopRegistry — 按 spec.loop 选择 loop 实现。
     * 缺省时退回 reactLoop（默认 ReActLoop）。
     */
    @Optional() private readonly loopRegistry?: LoopRegistry,
    /**
     * PR-C: AgentEventStore — 事件溯源持久化。
     * 不提供时事件不入库（向后兼容）。
     */
    @Optional() private readonly eventStore?: AgentEventStore,
    /**
     * PR-R: AgentRegistry — agent 实例中央目录，handoff 必需。
     */
    @Optional() private readonly agentRegistry?: AgentRegistry,
  ) {
    this.defaultLoop = reactLoop;
  }

  /**
   * 按 spec.loop 字段从 LoopRegistry 取实现；缺省 react。
   * 没有 LoopRegistry 时退回 defaultLoop（向后兼容）。
   */
  private pickLoop(spec: IAgentSpec): IAgentLoop | undefined {
    if (this.loopRegistry) {
      const kind = spec.loop ?? "react";
      if (this.loopRegistry.has(kind)) {
        return this.loopRegistry.get(kind);
      }
      // 未注册时静默 fallback 到 react
      if (this.loopRegistry.has("react")) {
        return this.loopRegistry.get("react");
      }
    }
    return this.defaultLoop;
  }

  /** Called by HarnessModule.onApplicationBootstrap to avoid forwardRef timing. */
  setElectionService(election: ModelElectionService): void {
    this.electionService = election;
  }

  /**
   * ★ 目标架构 v2：从声明式 IAgentSpec 创建 SpecBasedAgent。
   * Spec 必须包含 outputSchema 或 stubFn 之一（否则使用 createAgent 走 ReActLoop）。
   *
   * @param envSnapshot 环境快照——pipeline stage 从 identity.capabilities.env
   *   拿到后传进来，驱动 SpecBasedAgent 的环境感知选举。
   */
  createSpecAgent<TInput, TOutput>(
    spec: IAgentSpec<TInput, TOutput>,
    envSnapshot?: EnvironmentSnapshot,
  ): SpecBasedAgent<TInput, TOutput> {
    if (!this.llmExecutor) {
      throw new Error(
        "LlmExecutor not available — cannot create spec agent. Ensure AiEngineHarnessModule is imported.",
      );
    }
    const id = spec.identity.role.id;
    // ★ Lazy accessor (closure) — NOT this.electionService directly.
    // createSpecAgent is called during OnModuleInit (topic-insights.module.ts:346)
    // but setElectionService runs at OnApplicationBootstrap (HarnessModule).
    // Capturing the field ref here would freeze `undefined` forever; the closure
    // defers the read until runtime (executeSpec), by which point the setter has
    // wired the real service. This is the fix for Railway "AG-01-LD chat failed:
    // DEFAULT_AI_MODEL 未设置" that persisted after DI was fixed.
    return new SpecBasedAgent<TInput, TOutput>(
      id,
      spec,
      this.llmExecutor,
      () => this.electionService,
      envSnapshot,
    );
  }

  /**
   * 供 HarnessModule onApplicationBootstrap 调用，打破循环依赖。
   * 不提供 spawner 时，agent.spawnSubagent() 会抛错。
   */
  setSubagentSpawner(spawner: ISubagentSpawner): void {
    this.subagentSpawner = spawner;
  }

  create(spec: IAgentSpec): IAgent {
    const identity =
      spec.identity instanceof AgentIdentity
        ? spec.identity
        : new AgentIdentity(spec.identity);

    const sessionId = spec.sessionId ?? randomUUID();
    const memory: IMemoryBinding = {
      sessionId,
      userId: spec.userId,
      workspaceId: spec.workspaceId,
    };

    const budget: IBudgetSnapshot = {
      tokensUsed: 0,
      tokensRemaining: identity.constraints?.maxTokens ?? 50_000,
      iterationsUsed: 0,
      iterationsRemaining: identity.constraints?.maxIterations ?? 20,
      wallTimeStartMs: Date.now(),
    };

    const systemPrompt = spec.systemPrompt ?? identity.toSystemPrompt();

    const envelope = new ContextEnvelope({
      system: systemPrompt,
      messages: [],
      reminders: [],
      tools: [...identity.tools],
      memory,
      budget,
      runtimeEnv: spec.runtimeEnv, // PR-J
    });

    // ★ 包装 spec.outputSchema + validateBusinessRules 成 ReActLoop 期望的
    // validator 形态（{ok}|{ok:false, issues}），驱动 finalize 时的内容校验闸：
    // 不达标 → critique reminder → continue loop → LLM 直接补缺。
    const outputSchemaValidator = spec.outputSchema
      ? (output: unknown) => {
          // ReActLoop.finalize 经常把 LLM 输出原样塞进 output；如果是 string
          // 形式的 JSON，先尝试 parse 再校验
          let candidate: unknown = output;
          if (typeof candidate === "string") {
            const trimmed = candidate.trim();
            if (
              (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
              (trimmed.startsWith("[") && trimmed.endsWith("]"))
            ) {
              try {
                candidate = JSON.parse(trimmed);
              } catch {
                /* keep string; schema parse will fail */
              }
            }
          }
          const result = spec.outputSchema!.safeParse(candidate);
          if (result.success) return { ok: true as const };
          const issues = result.error.issues
            .map(
              (iss) =>
                `${iss.path.join(".") || "<root>"}: ${iss.message} (code=${iss.code})`,
            )
            .join("; ");
          return { ok: false as const, issues };
        }
      : undefined;
    const validateBusinessRulesWrapper = spec.validateBusinessRules
      ? (output: unknown) => {
          try {
            // ★ outputSchema 存在时，先 schema-parse 出结构化值再校验业务规则。
            //   ReActLoop.finalize 可能直接塞进 LLM 的字符串/部分对象，没有这一步
            //   validateBusinessRules 会拿到 raw 值（如 string），常见报错
            //   "X is not iterable"。
            let typed: unknown = output;
            if (spec.outputSchema) {
              let candidate: unknown = output;
              if (typeof candidate === "string") {
                const trimmed = candidate.trim();
                if (
                  (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
                  (trimmed.startsWith("[") && trimmed.endsWith("]"))
                ) {
                  try {
                    candidate = JSON.parse(trimmed);
                  } catch {
                    /* schema 校验闸会先拦下，这里直接返回 null */
                    return null;
                  }
                }
              }
              const parsed = spec.outputSchema.safeParse(candidate);
              if (!parsed.success) {
                // schema 闸已经拒绝了，business 闸不再重复报错
                return null;
              }
              typed = parsed.data;
            }
            spec.validateBusinessRules!(typed as never, {
              input: undefined as never,
              identity,
            });
            return null;
          } catch (err) {
            return err instanceof Error ? err.message : String(err);
          }
        }
      : undefined;

    return new HarnessedAgent({
      identity,
      envelope,
      loop: this.pickLoop(spec),
      memoryBridge: this.memoryBridge,
      skillActivator: this.skillActivator,
      subagentSpawner: this.subagentSpawner,
      checkpointService: this.checkpointService,
      checkpointEveryNActions: this.checkpointService ? 3 : 0,
      eventStore: this.eventStore,
      agentRegistry: this.agentRegistry,
      // 透传 spec.taskProfile —— Loop 内 chat() 用 agent 真实意图
      taskProfile: spec.taskProfile,
      // ★ 内容驱动退出闸 validator
      outputSchemaValidator,
      validateBusinessRules: validateBusinessRulesWrapper,
    });
  }

  /**
   * 供 SubagentSpawner 使用：在已派生的 envelope 上创建 agent，
   * 不重新计算 memory/budget（isolation policy 已经准备好了）。
   */
  createWithEnvelope(spec: IAgentSpec, envelope: IContextEnvelope): IAgent {
    const identity =
      spec.identity instanceof AgentIdentity
        ? spec.identity
        : new AgentIdentity(spec.identity);

    const env =
      envelope instanceof ContextEnvelope
        ? envelope
        : new ContextEnvelope({
            system: envelope.system,
            messages: [...envelope.messages],
            reminders: [...envelope.reminders],
            tools: [...envelope.tools],
            memory: envelope.memory,
            budget: envelope.budget,
            // PR-J 必修：plain envelope 重建时不能丢 runtimeEnv，
            // 否则 subagent 失去环境感知 → credit/quota 检查全 noop
            runtimeEnv: envelope.runtimeEnv,
            metadata: envelope.metadata,
          });

    return new HarnessedAgent({
      identity,
      envelope: env,
      loop: this.pickLoop(spec),
      memoryBridge: this.memoryBridge,
      skillActivator: this.skillActivator,
      subagentSpawner: this.subagentSpawner,
      checkpointService: this.checkpointService,
      checkpointEveryNActions: this.checkpointService ? 3 : 0,
      eventStore: this.eventStore,
      agentRegistry: this.agentRegistry,
    });
  }

  /**
   * Resume：从 checkpoint 重建 agent（envelope + identity 还原）。
   * 适合长任务失败/中断后续跑。
   */
  createFromCheckpoint(checkpoint: {
    identity: IAgentSpec["identity"];
    envelope: IContextEnvelope;
    sessionId?: string;
  }): IAgent {
    return this.createWithEnvelope(
      {
        identity: checkpoint.identity,
        sessionId: checkpoint.sessionId,
      },
      checkpoint.envelope,
    );
  }
}
