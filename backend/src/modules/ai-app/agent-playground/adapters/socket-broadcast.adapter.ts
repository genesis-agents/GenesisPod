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
    // ★ P1-NEW-E (round 2) + P1-R3-B (round 3):
    //   小事件直接 emit（socket.io 内部一次 stringify 即可，避免双 stringify CPU 浪费）；
    //   仅在 payload 看起来"可能大"时才做尺寸预检。
    const envelope = {
      type: event.type,
      payload: event.payload,
      agentId: event.agentId,
      traceId: event.traceId,
      timestamp: event.timestamp,
    };
    if (this.isPotentiallyLarge(event.payload)) {
      let serializedSize = 0;
      try {
        serializedSize = JSON.stringify(envelope).length;
      } catch (err) {
        this.log.error(
          `event ${event.type} payload serialize failed (circular ref?): ${err instanceof Error ? err.message : String(err)} — emitting placeholder`,
        );
        // ★ P1-R3-D (round 3): 降级用独立 type 让前端能按类型分流处理，
        // 而不是与原 type 混淆破坏 schema 期望
        const droppedType = "agent-playground.event:dropped";
        this.io.to(`playground:${missionId}`).emit(droppedType, {
          type: droppedType,
          payload: {
            originalType: event.type,
            reason: "serialize_failed",
          },
          agentId: event.agentId,
          traceId: event.traceId,
          timestamp: event.timestamp,
        });
        return;
      }
      const SOFT_CAP_BYTES = 256 * 1024;
      if (serializedSize > SOFT_CAP_BYTES) {
        this.log.warn(
          `event ${event.type} size ${serializedSize}B > ${SOFT_CAP_BYTES}B — emitting metadata only, client should pull replay`,
        );
        // ★ P1-R3-D (round 3): 降级独立 type
        const oversizedType = "agent-playground.event:oversized";
        this.io.to(`playground:${missionId}`).emit(oversizedType, {
          type: oversizedType,
          payload: {
            originalType: event.type,
            sizeBytes: serializedSize,
            hint: "fetch via GET /replay/:missionId for full payload",
          },
          agentId: event.agentId,
          traceId: event.traceId,
          timestamp: event.timestamp,
        });
        return;
      }
    }
    this.io.to(`playground:${missionId}`).emit(event.type, envelope);
  }

  /**
   * 启发式：含已知大字段 / 大字符串 / 长数组 / 多 key 对象时才做完整 size 预检。
   * 纯标量与小事件直接 fast-path 避免双 stringify。
   */
  private isPotentiallyLarge(payload: unknown): boolean {
    if (payload == null) return false;
    if (typeof payload === "string") return payload.length > 8 * 1024;
    if (Array.isArray(payload)) return payload.length > 50;
    if (typeof payload === "object") {
      const obj = payload as Record<string, unknown>;
      const heavyKeys = [
        "fullMarkdown",
        "sections",
        "chapters",
        "reportArtifact",
        "reportFull",
        "content",
        "report",
      ];
      if (heavyKeys.some((k) => k in obj)) return true;
      return Object.keys(obj).length > 5;
    }
    return false;
  }
}
