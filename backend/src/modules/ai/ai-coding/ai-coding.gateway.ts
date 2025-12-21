/**
 * AI Coding WebSocket Gateway
 *
 * 提供项目执行进度的实时推送
 */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Logger } from "@nestjs/common";
import { ProjectEventEmitterService } from "./services/project-event-emitter.service";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  currentProjectId?: string;
}

@WebSocketGateway({
  namespace: "/ai-coding",
  cors: {
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://deepdive-engine.up.railway.app",
      "https://deepdive-frontend.up.railway.app",
      ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
    ].filter(Boolean),
    credentials: true,
  },
  transports: ["websocket", "polling"],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
})
export class AiCodingGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer()
  server!: Server;

  private logger = new Logger("AiCodingGateway");
  private userSockets = new Map<string, Set<string>>(); // userId -> Set<socketId>
  private socketUsers = new Map<string, string>(); // socketId -> userId
  private projectSockets = new Map<string, Set<string>>(); // projectId -> Set<socketId>

  constructor(
    private readonly projectEventEmitter: ProjectEventEmitterService,
  ) {}

  afterInit() {
    // Register the emit handler with ProjectEventEmitterService
    this.projectEventEmitter.registerEmitHandler(
      async (projectId: string, event: string, data: unknown) => {
        await this.emitToProject(projectId, event, data);
      },
    );
    this.logger.log("AiCodingGateway initialized and emit handler registered");
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const userId =
        client.handshake.auth?.userId || client.handshake.query?.userId;

      if (!userId || typeof userId !== "string") {
        this.logger.warn(`Connection rejected: no userId provided`);
        client.disconnect();
        return;
      }

      client.userId = userId;
      this.socketUsers.set(client.id, userId);

      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)?.add(client.id);

      this.logger.log(`Client connected: ${client.id}, userId: ${userId}`);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Connection error: ${errorMessage}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const userId = this.socketUsers.get(client.id);

    // Clean up user socket mapping
    if (userId) {
      this.userSockets.get(userId)?.delete(client.id);
      if (this.userSockets.get(userId)?.size === 0) {
        this.userSockets.delete(userId);
      }
    }

    // Clean up project socket mapping
    if (client.currentProjectId) {
      this.projectSockets.get(client.currentProjectId)?.delete(client.id);
      if (this.projectSockets.get(client.currentProjectId)?.size === 0) {
        this.projectSockets.delete(client.currentProjectId);
      }
    }

    this.socketUsers.delete(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * 加入项目房间以接收进度更新
   */
  @SubscribeMessage("project:join")
  async handleJoinProject(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { projectId: string },
  ) {
    const { projectId } = data;
    const userId = client.userId;

    if (!userId) {
      return { error: "Not authenticated" };
    }

    try {
      // Leave previous project room
      if (client.currentProjectId) {
        client.leave(`project:${client.currentProjectId}`);
        this.projectSockets.get(client.currentProjectId)?.delete(client.id);
      }

      // Join new project room
      const roomName = `project:${projectId}`;
      client.join(roomName);
      client.currentProjectId = projectId;

      // Track socket in project
      if (!this.projectSockets.has(projectId)) {
        this.projectSockets.set(projectId, new Set());
      }
      this.projectSockets.get(projectId)?.add(client.id);

      this.logger.log(`User ${userId} joined project ${projectId} for updates`);

      return { success: true };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Join project error: ${errorMessage}`);
      return { error: errorMessage };
    }
  }

  /**
   * 离开项目房间
   */
  @SubscribeMessage("project:leave")
  async handleLeaveProject(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { projectId: string },
  ) {
    const { projectId } = data;
    const userId = client.userId;

    if (client.currentProjectId === projectId) {
      client.leave(`project:${projectId}`);
      client.currentProjectId = undefined;

      this.projectSockets.get(projectId)?.delete(client.id);
      if (this.projectSockets.get(projectId)?.size === 0) {
        this.projectSockets.delete(projectId);
      }

      this.logger.log(`User ${userId} left project ${projectId}`);
    }

    return { success: true };
  }

  /**
   * 请求当前项目状态
   */
  @SubscribeMessage("project:status")
  async handleProjectStatus(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { projectId: string },
  ) {
    const { projectId } = data;
    const userId = client.userId;

    if (!userId) {
      return { error: "Not authenticated" };
    }

    // The actual status will be fetched through HTTP API
    // This is just to acknowledge the request
    return { success: true, projectId };
  }

  // ==================== Helper Methods ====================

  /**
   * 广播消息给指定项目的所有订阅者
   */
  async emitToProject(
    projectId: string,
    event: string,
    data: unknown,
  ): Promise<void> {
    const roomName = `project:${projectId}`;
    const sockets = await this.server.in(roomName).fetchSockets();

    this.logger.debug(
      `emitToProject: room=${roomName}, event=${event}, sockets=${sockets.length}`,
    );

    this.server.to(roomName).emit(event, data);
  }

  /**
   * 广播消息给指定用户
   */
  emitToUser(userId: string, event: string, data: unknown): void {
    const socketIds = this.userSockets.get(userId);
    if (socketIds) {
      socketIds.forEach((socketId) => {
        this.server.to(socketId).emit(event, data);
      });
    }
  }

  /**
   * 获取项目的在线用户数
   */
  async getProjectSubscriberCount(projectId: string): Promise<number> {
    const sockets = await this.server.in(`project:${projectId}`).fetchSockets();
    return sockets.length;
  }
}
