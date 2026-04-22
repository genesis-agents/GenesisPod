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
} from "../abstractions";
import { AgentIdentity } from "./agent-identity";
import { ContextEnvelope } from "./context-envelope";
import type { MemoryBridge } from "../memory-bridge/memory-bridge.service";
import type { SkillActivator } from "../skills/skill-activator";
import type { ISubagentSpawner } from "../abstractions";
import type { CheckpointService } from "../checkpoint/checkpoint.service";

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
  private abortController: AbortController | null = null;

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
    this.state = "idle";
  }

  async *execute(task: IAgentTask): AsyncIterable<IAgentEvent> {
    this.state = "running";
    this.abortController = new AbortController();

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
          options?: { agentId?: string; signal?: AbortSignal },
        ) => AsyncIterable<IAgentEvent>;

        for await (const ev of runFn(this.envelope, criteria, {
          agentId: this.id,
          signal: this.abortController.signal,
        })) {
          yield ev;
          eventCount += 1;

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
    this.abortController?.abort();
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
