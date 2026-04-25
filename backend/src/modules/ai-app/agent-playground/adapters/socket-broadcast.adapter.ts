/**
 * SocketBroadcastAdapter — DomainEvent → Socket.IO room
 *
 * 业务方实现 IBroadcastAdapter 的参考。
 * 把 DomainEventBus 的事件按 scope.missionId 分发到对应 room。
 */

import { Logger } from "@nestjs/common";
import type { Server as IoServer } from "socket.io";
import type { DomainEvent } from "../../../ai-engine/harness/events/domain-event.types";
import type { IBroadcastAdapter } from "../../../ai-engine/harness/events/broadcast-adapter";

export class SocketBroadcastAdapter implements IBroadcastAdapter {
  readonly id = "agent-playground.socket";
  private readonly log = new Logger(SocketBroadcastAdapter.name);

  constructor(private readonly io: IoServer) {}

  accepts(event: DomainEvent): boolean {
    return event.type.startsWith("agent-playground.");
  }

  async broadcast(event: DomainEvent): Promise<void> {
    const missionId = (event.scope.missionId ?? event.scope.userId) as string;
    if (!missionId) {
      this.log.warn(`event ${event.type} missing scope.missionId — dropping`);
      return;
    }
    this.io.to(`playground:${missionId}`).emit(event.type, {
      type: event.type,
      payload: event.payload,
      agentId: event.agentId,
      traceId: event.traceId,
      timestamp: event.timestamp,
    });
  }
}
