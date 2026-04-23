/**
 * AgentRegistry — harness 内部注册表
 *
 * 与 ai-engine 的 AgentRegistry 不同：这里注册的是 topic-insights
 * 专用的 harness agent runners。Stage 层通过 id 查询并调用 `run()`。
 */

import { Injectable, Logger } from "@nestjs/common";
import type { AgentRunner } from "./types";

@Injectable()
export class HarnessAgentRegistry {
  private readonly logger = new Logger(HarnessAgentRegistry.name);
  private readonly runners = new Map<string, AgentRunner<unknown, unknown>>();

  register<TI, TO>(runner: AgentRunner<TI, TO>): void {
    if (this.runners.has(runner.id)) {
      this.logger.warn(
        `Agent ${runner.id} already registered; overwriting with "${runner.name}"`,
      );
    }
    this.runners.set(runner.id, runner as AgentRunner<unknown, unknown>);
  }

  get<TI = unknown, TO = unknown>(id: string): AgentRunner<TI, TO> | undefined {
    return this.runners.get(id) as AgentRunner<TI, TO> | undefined;
  }

  mustGet<TI = unknown, TO = unknown>(id: string): AgentRunner<TI, TO> {
    const r = this.runners.get(id);
    if (!r) throw new Error(`HarnessAgentRegistry: agent ${id} not found`);
    return r as AgentRunner<TI, TO>;
  }

  listIds(): string[] {
    return Array.from(this.runners.keys());
  }

  /** 测试辅助 */
  clear(): void {
    this.runners.clear();
  }
}
