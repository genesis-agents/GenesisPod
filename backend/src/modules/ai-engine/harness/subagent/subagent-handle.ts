/**
 * SubagentHandle — 父 Agent 持有的子 Agent 运行句柄
 *
 * 提供：
 *   - events: 子 agent 事件的 async stream
 *   - waitForResult(): 等待子 agent 的 final output
 *   - abort(): 中止子 agent 执行
 */

import { randomUUID } from "crypto";
import type {
  IAgent,
  IAgentEvent,
  ISubagentHandle,
  ISubagentSpec,
} from "../abstractions";

export class SubagentHandle implements ISubagentHandle {
  readonly id: string;
  readonly name: string;
  readonly parent: IAgent;
  readonly spec: ISubagentSpec;
  readonly events: AsyncIterable<IAgentEvent>;

  private resultPromise: Promise<string | Record<string, unknown>>;
  private resolveResult!: (
    value: string | Record<string, unknown>,
  ) => void;
  private rejectResult!: (err: Error) => void;
  private aborted = false;

  constructor(params: {
    name: string;
    parent: IAgent;
    spec: ISubagentSpec;
    child: IAgent;
  }) {
    this.id = randomUUID();
    this.name = params.name;
    this.parent = params.parent;
    this.spec = params.spec;

    this.resultPromise = new Promise((resolve, reject) => {
      this.resolveResult = resolve;
      this.rejectResult = reject;
    });

    this.events = this.consume(params.child);
  }

  private async *consume(child: IAgent): AsyncIterable<IAgentEvent> {
    try {
      for await (const ev of child.execute({
        goal: this.spec.prompt,
      })) {
        yield ev;

        if (ev.type === "output") {
          const payload = ev.payload as { output: string | Record<string, unknown> };
          this.resolveResult(payload.output);
        } else if (ev.type === "error") {
          const payload = ev.payload as { message: string };
          this.rejectResult(new Error(payload.message));
        } else if (ev.type === "terminated" && this.aborted) {
          this.rejectResult(new Error("Subagent aborted"));
        }
      }
    } catch (err) {
      this.rejectResult(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async waitForResult(): Promise<string | Record<string, unknown>> {
    return this.resultPromise;
  }

  async abort(_reason?: string): Promise<void> {
    this.aborted = true;
    // The child agent's cancel() will propagate through AbortController in loop
    await Promise.resolve();
  }
}
