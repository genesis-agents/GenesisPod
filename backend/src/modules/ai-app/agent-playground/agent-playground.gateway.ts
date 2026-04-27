/**
 * AgentPlaygroundGateway —— Socket.IO 入口
 *
 * 必修 #4/#7:
 *   - SocketBroadcastAdapter 注册移到 afterInit（onModuleInit 时 io 还没绑定）
 *   - join 加 ownership 鉴权（防越权偷看他人 mission 流）
 *   - JWT 在 handshake.auth 解析；缺失/不匹配 → 拒绝
 */

import { Logger, UnauthorizedException } from "@nestjs/common";
import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayInit,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { JwtService } from "@nestjs/jwt";
// 必修 #8: 走 facade
import { DomainEventBus } from "../../ai-harness/facade";
import { SocketBroadcastAdapter } from "./adapters/socket-broadcast.adapter";
import { MissionOwnershipRegistry } from "./services/mission/lifecycle/mission-ownership.registry";

interface JwtPayload {
  sub?: string;
  id?: string;
  userId?: string;
}

@WebSocketGateway({
  namespace: "agent-playground",
  cors: { origin: "*", credentials: true },
})
export class AgentPlaygroundGateway implements OnGatewayInit {
  @WebSocketServer() io!: Server;
  private readonly log = new Logger(AgentPlaygroundGateway.name);

  constructor(
    private readonly eventBus: DomainEventBus,
    private readonly ownership: MissionOwnershipRegistry,
    private readonly jwt: JwtService,
  ) {}

  afterInit(): void {
    // 必修 #7: 必须在 afterInit 注册（io 此时已绑定）；onModuleInit 时 io 是 undefined
    this.eventBus.registerAdapter(new SocketBroadcastAdapter(this.io));
    this.log.log(
      "AgentPlaygroundGateway initialized (namespace=agent-playground)",
    );
  }

  @SubscribeMessage("join")
  handleJoin(
    client: Socket,
    payload: { missionId: string },
  ): { ok: boolean; error?: string } {
    if (!payload?.missionId) return { ok: false, error: "missionId required" };
    let userId: string;
    try {
      userId = this.extractUserId(client);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "auth failed",
      };
    }
    const owner = this.ownership.getOwner(payload.missionId);
    if (!owner) return { ok: false, error: "mission not found" };
    if (owner !== userId) {
      this.log.warn(
        `client ${client.id} (user=${userId}) tried to join mission=${payload.missionId} owned by ${owner}`,
      );
      return { ok: false, error: "forbidden" };
    }
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

  private extractUserId(client: Socket): string {
    const auth = client.handshake.auth as {
      token?: string;
      Authorization?: string;
    };
    const authToken =
      auth?.token ?? auth?.Authorization?.replace(/^Bearer\s+/i, "");
    if (!authToken) throw new UnauthorizedException("no auth token");
    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(authToken);
    } catch {
      throw new UnauthorizedException("invalid token");
    }
    const userId = payload.sub ?? payload.id ?? payload.userId;
    if (!userId) throw new UnauthorizedException("no user in token");
    return userId;
  }
}
