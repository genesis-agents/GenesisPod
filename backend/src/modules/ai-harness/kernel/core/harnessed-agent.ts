/**
 * HarnessedAgent — IAgent 的默认实现（Phase 2）
 *
 * Phase 2 变更：
 *   - execute() 不再是骨架；若注入了 Loop（e.g. ReActLoop）则走真实循环
 *   - 如果没注入 loop（用于单测），回退到 Phase 1 骨架行为
 *   - 新增 MemoryBridge preExecute 钩子：注入召回记忆
 */

import { randomUUID } from "crypto";
import type {
  AgentId,
  AgentState,
  IAgent,
  IAgentEvent,
  IAgentIdentity,
  IAgentLoop,
  IAgentTask,
  IContextEnvelope,
  ILoopTerminationCriteria,
  ISubagentHandle,
  ISubagentSpec,
} from "../../kernel/abstractions";
import { AgentIdentity } from "./agent-identity";
import { ContextEnvelope } from "./context-envelope";
import type { MemoryBridge } from "../../memory/auto-index/memory-bridge.service";
import type { SkillActivator } from "../../kernel/skills/skill-activator";
import type { ISubagentSpawner } from "../../kernel/abstractions";
import type { CheckpointService } from "../../memory/checkpoint/checkpoint.service";
import type { AgentEventStore } from "../../memory/checkpoint/agent-event-store";
import { BudgetAccountant } from "../../runtime/budget-accountant";
import type { AgentRegistry } from "../../process/handoff/agent-registry";

export interface HarnessedAgentInit {
  identity: IAgentIdentity;
  envelope: ContextEnvelope;
  loop?: IAgentLoop;
  memoryBridge?: MemoryBridge;
  skillActivator?: SkillActivator;
  subagentSpawner?: ISubagentSpawner;
  checkpointService?: CheckpointService;
  /** 每 N 个 action_executed 事件自动 snapshot（默认 0 = 关闭） */
  checkpointEveryNActions?: number;
  /**
   * v2: BudgetAccountant — Loop 内强制 token/cost 预算 + 自动 tier 降级。
   * 不提供时退回 identity.constraints 软约束。
   */
  budget?: BudgetAccountant;
  /**
   * PR-C: AgentEventStore — 事件溯源持久化。
   * 不提供时事件只在 stream yield 给 caller，不入库（向后兼容）。
   */
  eventStore?: AgentEventStore;
  /**
   * PR-R: AgentRegistry — 注册到中心目录后，其它 agent 可 handoff 给本 agent。
   * 不提供时 handoff 系统看不见此 agent，但本 agent 仍可作为 handoff 源。
   */
  agentRegistry?: AgentRegistry;
  /**
   * Spec 声明的 TaskProfile —— 让 ReActLoop / ReflexionLoop / PlanActLoop
   * 内部每次 chat() 都用 agent 的真实意图（researcher 要 long output，
   * leader 要 medium）。不传则各 loop 走自己的硬编码默认。
   */
  taskProfile?: import("../../../ai-engine/llm/types/task-profile").TaskProfile;
  /**
   * ★ 内容驱动退出闸 —— 由 agent-runner 根据 spec.outputSchema 包装后注入。
   * Loop 在 finalize action 时调它校验 LLM 输出，不达标就让 LLM 原地补缺
   * （而不是机械限轮次或让 LLM 瞎搜瞎退）。
   */
  outputSchemaValidator?: (
    output: unknown,
  ) => { ok: true } | { ok: false; issues: string };
  /**
   * 业务级 sanity check（spec.validateBusinessRules 包装），与 outputSchema
   * 互补的语义校验。
   */
  validateBusinessRules?: (output: unknown) => string | null | undefined;
}

export class HarnessedAgent implements IAgent {
  readonly id: AgentId;
  readonly identity: IAgentIdentity;
  state: AgentState;

  private envelope: ContextEnvelope;
  private readonly loop?: IAgentLoop;
  private readonly memoryBridge?: MemoryBridge;
  private readonly skillActivator?: SkillActivator;
  private readonly subagentSpawner?: ISubagentSpawner;
  private readonly checkpointService?: CheckpointService;
  private readonly checkpointEveryNActions: number;
  private readonly budget?: BudgetAccountant;
  private readonly eventStore?: AgentEventStore;
  private readonly agentRegistry?: AgentRegistry;
  private readonly taskProfile?: import("../../../ai-engine/llm/types/task-profile").TaskProfile;
  private readonly outputSchemaValidator?: HarnessedAgentInit["outputSchemaValidator"];
  private readonly validateBusinessRules?: HarnessedAgentInit["validateBusinessRules"];
  /** Persistent AbortController — lives from construction. cancel() before execute() still aborts. */
  private readonly abortController = new AbortController();

  constructor(init: HarnessedAgentInit, id?: string) {
    this.id = id ?? randomUUID();
    this.identity =
      init.identity instanceof AgentIdentity
        ? init.identity
        : new AgentIdentity(init.identity);
    this.envelope = init.envelope;
    this.loop = init.loop;
    this.memoryBridge = init.memoryBridge;
    this.skillActivator = init.skillActivator;
    this.subagentSpawner = init.subagentSpawner;
    this.checkpointService = init.checkpointService;
    this.checkpointEveryNActions = init.checkpointEveryNActions ?? 0;
    this.budget = init.budget;
    this.eventStore = init.eventStore;
    this.agentRegistry = init.agentRegistry;
    this.taskProfile = init.taskProfile;
    this.outputSchemaValidator = init.outputSchemaValidator;
    this.validateBusinessRules = init.validateBusinessRules;
    this.state = "idle";
  }

  async *execute(task: IAgentTask): AsyncIterable<IAgentEvent> {
    // ★ Phase P13-1: 外部 task.signal 触发本 agent 的 abortController.abort()
    // 这样 mission 级 cancel 能链到 ReActLoop 内的 chat / tool call
    if (task.signal) {
      if (task.signal.aborted) {
        this.abortController.abort();
      } else {
        const onAbort = () => this.abortController.abort();
        task.signal.addEventListener("abort", onAbort, { once: true });
      }
    }
    // If already cancelled before execute started, emit terminated immediately
    if (this.state === "cancelled" || this.abortController.signal.aborted) {
      this.state = "cancelled";
      yield {
        type: "terminated",
        agentId: this.id,
        timestamp: Date.now(),
        payload: { reason: "cancelled" as const },
      };
      return;
    }
    this.state = "running";
    // PR-R: 注册到 AgentRegistry，让其它 agent 可 handoff 给本 agent
    this.agentRegistry?.register(this);

    let actionCount = 0;
    let eventCount = 0;
    const taskSnapshot = { goal: task.goal, input: task.input };

    const userMsg = {
      role: "user" as const,
      content: task.input
        ? `${task.goal}\n\n${typeof task.input === "string" ? task.input : JSON.stringify(task.input)}`
        : task.goal,
      timestamp: Date.now(),
    };
    this.envelope = this.envelope.append([userMsg]).envelope as ContextEnvelope;

    // Skill activation (optional) — before memory so skills can see memory later
    let skillCleanup: (() => void) | null = null;
    if (this.skillActivator) {
      const result = await this.skillActivator.activate(
        this.identity,
        this.envelope,
      );
      if (result.envelope instanceof ContextEnvelope) {
        this.envelope = result.envelope;
      }
      skillCleanup = result.cleanup;
    }

    // Memory recall (optional)
    if (this.memoryBridge) {
      const withMemory = await this.memoryBridge.preExecute(this.envelope, {
        query: task.goal,
      });
      if (withMemory instanceof ContextEnvelope) {
        this.envelope = withMemory;
      }
    }

    if (this.loop) {
      const constraints = this.identity.constraints;
      const criteria: ILoopTerminationCriteria = {
        maxIterations: constraints?.maxIterations ?? 20,
        maxTokens: constraints?.maxTokens,
        maxWallTimeMs: constraints?.maxWallTimeMs,
        terminateOn: ["finalize"],
      };
      try {
        // The loop is typed IAgentLoop (run returns AsyncIterable<IAgentEvent>);
        // Phase 2 implementations (ReActLoop) optionally accept a 3rd options arg.
        const runFn = this.loop.run.bind(this.loop) as (
          envelope: IContextEnvelope,
          criteria: ILoopTerminationCriteria,
          options?: {
            agentId?: string;
            signal?: AbortSignal;
            allowedTools?: readonly string[];
            forbiddenTools?: readonly string[];
            budget?: BudgetAccountant;
            parent?: IAgent;
            spawner?: ISubagentSpawner;
            taskProfile?: import("../../../ai-engine/llm/types/task-profile").TaskProfile;
            outputSchemaValidator?: (
              output: unknown,
            ) => { ok: true } | { ok: false; issues: string };
            validateBusinessRules?: (
              output: unknown,
            ) => string | null | undefined;
          },
        ) => AsyncIterable<IAgentEvent>;

        // PR-I 修复 #2: 事件 batch buffer，避免 N+1 写库
        const eventBuffer: IAgentEvent[] = [];
        const FLUSH_THRESHOLD = 10;
        const flushBuffer = () => {
          if (!this.eventStore || eventBuffer.length === 0) return;
          const batch = eventBuffer.splice(0);
          void this.eventStore.appendBatch(batch).catch(() => {
            /* never block agent on event-store failure */
          });
        };

        for await (const ev of runFn(this.envelope, criteria, {
          agentId: this.id,
          signal: this.abortController.signal,
          allowedTools: this.identity.tools,
          forbiddenTools: this.identity.forbiddenTools,
          budget: this.budget,
          // PR-D: 让 ReActLoop 能调度 subagent_spawn action
          parent: this,
          spawner: this.subagentSpawner,
          // 透传 spec 声明的 TaskProfile —— Loop 内每次 chat() 用 agent 真实意图
          // (researcher='long' / leader='medium')，不再被 Loop 硬编码 'short' 卡死
          taskProfile: this.taskProfile,
          // ★ 内容驱动退出闸：finalize 时框架用 spec.outputSchema +
          // validateBusinessRules 校验，不达标就 reject + critique reminder + continue
          outputSchemaValidator: this.outputSchemaValidator,
          validateBusinessRules: this.validateBusinessRules,
        })) {
          yield ev;
          eventCount += 1;

          // PR-I 修复 #2: 入 buffer 而非每事件单独写
          if (this.eventStore) {
            eventBuffer.push(ev);
            if (
              eventBuffer.length >= FLUSH_THRESHOLD ||
              ev.type === "terminated"
            ) {
              flushBuffer();
            }
          }

          if (ev.type === "action_executed") {
            actionCount += 1;
            // Auto-checkpoint every N actions
            if (
              this.checkpointService &&
              this.checkpointEveryNActions > 0 &&
              actionCount % this.checkpointEveryNActions === 0
            ) {
              void this.checkpointService
                .snapshot({
                  agentId: this.id,
                  agentState: this.state,
                  envelope: this.envelope,
                  identity: this.identity,
                  eventsEmitted: eventCount,
                  reason: "auto-interval",
                  taskSnapshot,
                })
                .catch(() => {
                  /* fire-and-forget; never break loop */
                });
            }
          }

          if (ev.type === "terminated") {
            this.updateStateFromTerminated(ev);
            // Final snapshot before actual termination
            if (this.checkpointService) {
              await this.checkpointService
                .snapshot({
                  agentId: this.id,
                  agentState: this.state,
                  envelope: this.envelope,
                  identity: this.identity,
                  eventsEmitted: eventCount,
                  reason: "pre-terminate",
                  taskSnapshot,
                })
                .catch(() => {
                  /* ignore */
                });
            }
          }
        }
      } catch (err) {
        this.state = "failed";
        yield {
          type: "error",
          agentId: this.id,
          timestamp: Date.now(),
          payload: {
            message: err instanceof Error ? err.message : String(err),
            recoverable: false,
          },
        };
        yield {
          type: "terminated",
          agentId: this.id,
          timestamp: Date.now(),
          payload: { reason: "error" as const },
        };
      } finally {
        skillCleanup?.();
        // PR-R: 终止时自动注销，防止 registry 持有死引用
        this.agentRegistry?.unregister(this.id);
      }
      return;
    }

    // Skeleton fallback (unit tests without loop)
    yield {
      type: "thinking",
      agentId: this.id,
      timestamp: Date.now(),
      payload: { text: "[skeleton] no loop injected", tokenCount: 0 },
    };
    yield {
      type: "output",
      agentId: this.id,
      timestamp: Date.now(),
      payload: {
        output: {
          ok: true,
          stub: true,
          agent: this.identity.role.id,
          goal: task.goal,
          message:
            "HarnessedAgent skeleton — inject a loop (e.g. ReActLoop) via factory for real execution.",
        },
      },
    };
    this.state = "completed";
    yield {
      type: "terminated",
      agentId: this.id,
      timestamp: Date.now(),
      payload: { reason: "completed" as const },
    };
    skillCleanup?.();
  }

  spawnSubagent(spec: ISubagentSpec): Promise<ISubagentHandle> {
    if (!this.subagentSpawner) {
      return Promise.reject(
        new Error(
          "HarnessedAgent.spawnSubagent: SubagentSpawner not wired — construct via AgentFactory in HarnessModule.",
        ),
      );
    }
    return this.subagentSpawner.spawn(this, spec);
  }

  getEnvelope(): IContextEnvelope {
    return this.envelope;
  }

  async cancel(_reason = "cancelled by caller"): Promise<void> {
    this.state = "cancelled";
    this.abortController.abort();
    return Promise.resolve();
  }

  private updateStateFromTerminated(event: IAgentEvent): void {
    const reason =
      typeof event.payload === "object" && event.payload !== null
        ? (event.payload as { reason?: string }).reason
        : undefined;
    if (reason === "error") this.state = "failed";
    else if (reason === "cancelled") this.state = "cancelled";
    else this.state = "completed";
  }
}
