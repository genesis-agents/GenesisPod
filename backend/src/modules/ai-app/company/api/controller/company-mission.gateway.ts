/**
 * CompanyMissionGateway —— Socket.IO 入口（namespace: 'company'）
 *
 * 照 playground.gateway.ts 实现：
 *   - JWT 鉴权 (handshake.auth.token 或 Authorization header)
 *   - Redis blocklist 检查（fail-open on cache error）
 *   - join {missionId|teamId} 订阅房间（company:<missionId>）
 *   - EventBus + SocketBroadcastAdapter 注册（afterInit 时注册，eventTypePrefix='company.'）
 *   - emit company.* 前缀事件
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
import { EventBus, SocketBroadcastAdapter } from "@/modules/ai-harness/facade";
import { wsCorsOrigin } from "@/common/config/ws-cors";
import { CacheService } from "@/common/cache/cache.service";
import { BLOCKLIST_PREFIX } from "@/modules/platform/auth/strategies/jwt.strategy";

interface JwtPayload {
  sub?: string;
  id?: string;
  userId?: string;
}

@WebSocketGateway({
  namespace: "company",
  cors: { origin: wsCorsOrigin, credentials: true },
})
export class CompanyMissionGateway implements OnGatewayInit {
  @WebSocketServer() io!: Server;
  private readonly log = new Logger(CompanyMissionGateway.name);

  constructor(
    private readonly eventBus: EventBus,
    private readonly jwt: JwtService,
    private readonly cache: CacheService,
  ) {}

  afterInit(): void {
    // SocketBroadcastAdapter 必须在 afterInit 注册（io 此时已绑定）
    this.eventBus.registerAdapter(
      new SocketBroadcastAdapter(this.io, {
        id: "company.socket",
        eventTypePrefix: "company.",
        roomPrefix: "company",
      }),
    );
    this.log.log("CompanyMissionGateway initialized (namespace=company)");
  }

  @SubscribeMessage("join")
  async handleJoin(
    client: Socket,
    payload: { missionId: string },
  ): Promise<{ ok: boolean; error?: string; errorCode?: string }> {
    if (!payload?.missionId) {
      return { ok: false, error: "missionId required" };
    }

    let userId: string;
    try {
      userId = await this.extractUserId(client);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "auth failed",
      };
    }

    // join room company:<missionId>
    // socket.join 是异步必须 await，否则后续 emit 时 room 未生效会丢事件
    await client.join(`company:${payload.missionId}`);
    this.log.debug(
      `client ${client.id} (user=${userId}) joined company:${payload.missionId}`,
    );
    return { ok: true };
  }

  @SubscribeMessage("leave")
  async handleLeave(
    client: Socket,
    payload: { missionId: string },
  ): Promise<{ ok: boolean }> {
    if (!payload?.missionId) return { ok: false };
    await client.leave(`company:${payload.missionId}`);
    return { ok: true };
  }

  // ── private helpers ────────────────────────────────────────────────────────

  private async extractUserId(client: Socket): Promise<string> {
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

    // Redis blocklist 检查 —— fail-open on cache error（同 playground gateway）
    let isBlocked: string | undefined | null = null;
    try {
      isBlocked = await this.cache.get<string>(`${BLOCKLIST_PREFIX}${userId}`);
    } catch (err) {
      this.log.warn(
        `[ws-auth] blocklist check failed for user=${userId} — fail-open: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    if (isBlocked) throw new UnauthorizedException("User account is disabled");
    return userId;
  }
}
