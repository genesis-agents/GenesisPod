/**
 * CheckpointService — Agent 执行快照与恢复
 *
 * 职责：
 *   - snapshot()：把当前 agent 状态打包成一条 checkpoint
 *   - load()：按 id 读回 checkpoint
 *   - latestForAgent()：取 agent 最新快照（resume 默认选这个）
 *
 * 重建 agent 的逻辑在 HarnessFacade.resume() 里（下一步实现）。
 */

import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import type {
  AgentId,
  AgentState,
  IAgentIdentity,
  IContextEnvelope,
} from "../../kernel/abstractions";
import type {
  CheckpointReason,
  ICheckpoint,
  ICheckpointService,
  ICheckpointStore,
} from "./checkpoint.types";
import { InMemoryCheckpointStore } from "./in-memory-checkpoint-store";

@Injectable()
export class CheckpointService implements ICheckpointService {
  private readonly logger = new Logger(CheckpointService.name);

  constructor(
    private readonly store: ICheckpointStore = new InMemoryCheckpointStore(),
  ) {}

  async snapshot(params: {
    agentId: AgentId;
    agentState: AgentState;
    envelope: IContextEnvelope;
    identity: IAgentIdentity;
    eventsEmitted: number;
    reason: CheckpointReason;
    taskSnapshot?: ICheckpoint["taskSnapshot"];
  }): Promise<ICheckpoint> {
    const checkpoint: ICheckpoint = {
      id: randomUUID(),
      agentId: params.agentId,
      takenAt: Date.now(),
      reason: params.reason,
      agentState: params.agentState,
      envelope: params.envelope,
      identity: params.identity,
      eventsEmitted: params.eventsEmitted,
      taskSnapshot: params.taskSnapshot,
    };
    await this.store.save(checkpoint);
    this.logger.debug(
      `[snapshot] agent=${params.agentId} reason=${params.reason} events=${params.eventsEmitted}`,
    );
    return checkpoint;
  }

  async load(id: string): Promise<ICheckpoint | null> {
    return this.store.load(id);
  }

  async latestForAgent(agentId: AgentId): Promise<ICheckpoint | null> {
    const list = await this.store.listByAgent(agentId);
    if (list.length === 0) return null;
    return list.reduce((latest, cur) =>
      cur.takenAt > latest.takenAt ? cur : latest,
    );
  }

  async listForAgent(agentId: AgentId): Promise<readonly ICheckpoint[]> {
    return this.store.listByAgent(agentId);
  }
}
