/**
 * SocketBroadcastAdapter — DomainEvent → Socket.IO room
 *
 * 通用 IBroadcastAdapter 实现：把 DomainEventBus 的事件按 scope.missionId
 * 分发到对应 room。`eventTypePrefix` + `roomPrefix` 由调用方传入决定路由。
 *
 * 2026-05-01 上提: 原在 ai-app/agent-playground/adapters/，改用参数化 prefix
 * 后跨 ai-app 通用（research / writing / topic-insights / 任何带 socket relay
 * 的 ai-app 都可复用）。
 *
 * 用法（agent-playground 注册）:
 * ```
 * new SocketBroadcastAdapter(this.io, {
 *   id: "agent-playground.socket",
 *   eventTypePrefix: "agent-playground.",
 *   roomPrefix: "playground",
 * });
 * ```
 */

import { Logger } from "@nestjs/common";
import type { Server as IoServer } from "socket.io";
import type { DomainEvent, IBroadcastAdapter } from "../../facade";

export interface SocketBroadcastAdapterOptions {
  /** Adapter id（用于日志 / EventBus 标识） */
  id: string;
  /** 事件类型前缀过滤，如 "agent-playground." */
  eventTypePrefix: string;
  /** Socket.IO room 前缀，如 "playground" → "playground:<missionId>" */
  roomPrefix: string;
}

export class SocketBroadcastAdapter implements IBroadcastAdapter {
  readonly id: string;
  private readonly log = new Logger(SocketBroadcastAdapter.name);
  private readonly eventTypePrefix: string;
  private readonly roomPrefix: string;

  constructor(
    private readonly io: IoServer,
    options: SocketBroadcastAdapterOptions,
  ) {
    this.id = options.id;
    this.eventTypePrefix = options.eventTypePrefix;
    this.roomPrefix = options.roomPrefix;
  }

  accepts(event: DomainEvent): boolean {
    return event.type.startsWith(this.eventTypePrefix);
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
        const droppedType = `${this.eventTypePrefix}event:dropped`;
        this.io.to(`${this.roomPrefix}:${missionId}`).emit(droppedType, {
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
        const oversizedType = `${this.eventTypePrefix}event:oversized`;
        this.io.to(`${this.roomPrefix}:${missionId}`).emit(oversizedType, {
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
    this.io.to(`${this.roomPrefix}:${missionId}`).emit(event.type, envelope);
  }

  /**
   * 启发式：含已知大字段 / 大字符串 / 长数组 时才做完整 size 预检。
   * ★ P1-R4-I (round 4): 精确化 —— 检查字段实际大小而非仅 key 存在 / 字段数；
   * 避免 lifecycle 等多 key 但内容小的事件被误判触发预检。
   */
  private isPotentiallyLarge(payload: unknown): boolean {
    if (payload == null) return false;
    if (typeof payload === "string") return payload.length > 8 * 1024;
    if (Array.isArray(payload)) return payload.length > 100;
    if (typeof payload === "object") {
      const obj = payload as Record<string, unknown>;
      // 检查已知大字段的实际尺寸，仅"真大"才触发预检
      const heavyKeys = [
        "fullMarkdown",
        "sections",
        "chapters",
        "reportArtifact",
        "reportFull",
        "content",
        "report",
        "body",
      ];
      for (const k of heavyKeys) {
        const v = obj[k];
        if (typeof v === "string" && v.length > 8 * 1024) return true;
        if (Array.isArray(v) && v.length > 50) return true;
        if (v && typeof v === "object" && Object.keys(v).length > 5)
          return true;
      }
      return false;
    }
    return false;
  }
}
