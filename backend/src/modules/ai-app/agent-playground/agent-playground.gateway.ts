/**
 * AgentPlaygroundGateway —— Socket.IO 入口
 *
 * 客户端 emit 'join' { missionId } 加入 room，
 * 服务端事件由 SocketBroadcastAdapter 推送到 room=`playground:${missionId}`
 */

import { Logger, OnModuleInit } from "@nestjs/common";
import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayInit,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { DomainEventBus } from "../../ai-engine/harness/events";
import { SocketBroadcastAdapter } from "./adapters/socket-broadcast.adapter";

@WebSocketGateway({
  namespace: "agent-playground",
  cors: { origin: "*", credentials: true },
})
export class AgentPlaygroundGateway implements OnGatewayInit, OnModuleInit {
  @WebSocketServer() io!: Server;
  private readonly log = new Logger(AgentPlaygroundGateway.name);

  constructor(private readonly eventBus: DomainEventBus) {}

  afterInit(): void {
    this.log.log(
      "AgentPlaygroundGateway initialized (namespace=agent-playground)",
    );
  }

  onModuleInit(): void {
    // 把 SocketBroadcastAdapter 注册到 EventBus —— DomainEvent 自动推送
    if (this.io) {
      this.eventBus.registerAdapter(new SocketBroadcastAdapter(this.io));
    }
  }

  @SubscribeMessage("join")
  handleJoin(client: Socket, payload: { missionId: string }): { ok: boolean } {
    if (!payload?.missionId) return { ok: false };
    void client.join(`playground:${payload.missionId}`);
    this.log.debug(
      `client ${client.id} joined playground:${payload.missionId}`,
    );
    return { ok: true };
  }

  @SubscribeMessage("leave")
  handleLeave(client: Socket, payload: { missionId: string }): { ok: boolean } {
    if (!payload?.missionId) return { ok: false };
    void client.leave(`playground:${payload.missionId}`);
    return { ok: true };
  }
}
