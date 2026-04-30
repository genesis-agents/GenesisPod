/**
 * SocketBroadcastAdapter — DomainEvent → Socket.IO room
 *
 * 业务方实现 IBroadcastAdapter 的参考。
 * 把 DomainEventBus 的事件按 scope.missionId 分发到对应 room。
 */

import { Logger } from "@nestjs/common";
import type { Server as IoServer } from "socket.io";
// 必修 #8: 走 facade，不穿透 harness/events 子路径
import type {
  DomainEvent,
  IBroadcastAdapter,
} from "../../../ai-harness/facade";

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
    // ★ P1-NEW-E (round 2): 大体积 / 循环引用 payload 序列化失败时静默丢失事件，
    // 这里预检 + 失败时降级 emit 元数据通知前端拉 replay
    const envelope = {
      type: event.type,
      payload: event.payload,
      agentId: event.agentId,
      traceId: event.traceId,
      timestamp: event.timestamp,
    };
    let serializedSize = 0;
    try {
      serializedSize = JSON.stringify(envelope).length;
    } catch (err) {
      this.log.error(
        `event ${event.type} payload serialize failed (circular ref?): ${err instanceof Error ? err.message : String(err)} — emitting placeholder`,
      );
      this.io.to(`playground:${missionId}`).emit(event.type, {
        type: event.type,
        payload: { __droppedReason: "serialize_failed" },
        agentId: event.agentId,
        traceId: event.traceId,
        timestamp: event.timestamp,
      });
      return;
    }
    // 单条事件 >256KB 时降级 emit 元数据 + 提示客户端拉 /replay
    const SOFT_CAP_BYTES = 256 * 1024;
    if (serializedSize > SOFT_CAP_BYTES) {
      this.log.warn(
        `event ${event.type} size ${serializedSize}B > ${SOFT_CAP_BYTES}B — emitting metadata only, client should pull replay`,
      );
      this.io.to(`playground:${missionId}`).emit(event.type, {
        type: event.type,
        payload: {
          __oversized: true,
          __sizeBytes: serializedSize,
          __hint: "fetch via GET /replay/:missionId for full payload",
        },
        agentId: event.agentId,
        traceId: event.traceId,
        timestamp: event.timestamp,
      });
      return;
    }
    this.io.to(`playground:${missionId}`).emit(event.type, envelope);
  }
}
