import { Logger } from "@nestjs/common";
import {
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
} from "@nestjs/websockets";
import { OnEvent } from "@nestjs/event-emitter";
import type { Server, Socket } from "socket.io";
import { JwtService } from "@nestjs/jwt";

interface JwtPayload {
  sub?: string;
  id?: string;
  userId?: string;
}

interface NotificationCreatedEvent {
  notificationId?: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  /** quiet hours 窗口内为 true — 前端应只更新 badge，不弹 toast */
  silent?: boolean;
}

interface NotificationBroadcastEvent {
  type: string;
  title: string;
  message: string;
  sentCount?: number;
}

/**
 * NotificationGateway —— 通知系统 Socket.IO 入口
 *
 * 职责：
 *   - 监听 NotificationService 发出的 `notification.created` (单用户) /
 *     `notification.broadcast` (admin 广播) EventEmitter2 事件
 *   - 把单用户事件推到 `user:${userId}` 房间；广播事件用 io.emit 全频道
 *
 * 房间模型：
 *   - 每个连接握手时 join 自己的 user 房间，名字 `user:${userId}`
 *   - 不需 ownership registry —— 用户只看自己
 *
 * 失败模式：
 *   - JWT 校验失败 → disconnect
 *   - emit 失败 → logger.warn，不抛错（拉模式兜底，下次刷新仍能拿到通知）
 *
 * 与 ai-harness DomainEventBus 的关系：
 *   - 不复用 SocketBroadcastAdapter（它走 mission/topic scope 房间）
 *   - 通知是 user-scope，独立 namespace + 独立房间策略
 */
@WebSocketGateway({
  namespace: "notifications",
  cors: { origin: "*", credentials: true },
})
export class NotificationGateway implements OnGatewayConnection {
  @WebSocketServer() io!: Server;
  private readonly log = new Logger(NotificationGateway.name);

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(client: Socket): Promise<void> {
    let userId: string;
    try {
      userId = this.extractUserId(client);
    } catch (err) {
      this.log.debug(
        `Rejecting notification socket: ${err instanceof Error ? err.message : "auth failed"}`,
      );
      client.disconnect(true);
      return;
    }

    await client.join(`user:${userId}`);
    // 缓存到 socket 数据，便于断连诊断
    client.data.userId = userId;
  }

  @OnEvent("notification.created")
  handleNotificationCreated(event: NotificationCreatedEvent): void {
    if (!this.io || !event?.userId) return;
    try {
      this.io.to(`user:${event.userId}`).emit("notification:new", {
        notificationId: event.notificationId,
        userId: event.userId,
        type: event.type,
        title: event.title,
        message: event.message,
        silent: event.silent === true,
      });
    } catch (err) {
      this.log.warn(
        `Failed to push notification:new for user=${event.userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  @OnEvent("notification.broadcast")
  handleBroadcast(event: NotificationBroadcastEvent): void {
    if (!this.io) return;
    try {
      this.io.emit("notification:broadcast", {
        type: event.type,
        title: event.title,
        message: event.message,
        sentCount: event.sentCount,
      });
    } catch (err) {
      this.log.warn(
        `Failed to broadcast notification: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private extractUserId(client: Socket): string {
    const auth = client.handshake.auth as {
      token?: string;
      Authorization?: string;
    };
    const authToken =
      auth?.token ?? auth?.Authorization?.replace(/^Bearer\s+/i, "");
    if (!authToken) throw new Error("no auth token");
    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(authToken);
    } catch {
      throw new Error("invalid token");
    }
    const userId = payload.sub ?? payload.id ?? payload.userId;
    if (!userId) throw new Error("no user in token");
    return userId;
  }
}
