/**
 * AI Writing WebSocket Gateway
 *
 * 提供实时推送能力，参考 AI Teams Gateway 设计
 * 支持：
 * - 任务状态实时推送
 * - Agent 工作状态广播
 * - 章节生成进度更新
 * - 中间输出实时查看
 */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Logger, Injectable } from "@nestjs/common";
import { WritingEventEmitterService } from "./services/events/writing-event-emitter.service";
import { APP_CONFIG } from "../../../common/config/app.config";

@Injectable()
@WebSocketGateway({
  namespace: "/ai-writing",
  cors: {
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      APP_CONFIG.railway.frontendUrl,
      APP_CONFIG.railway.backendUrl,
      ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
    ].filter(Boolean),
    credentials: true,
  },
})
export class AiWritingGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AiWritingGateway.name);

  constructor(private readonly eventEmitter: WritingEventEmitterService) {}

  afterInit() {
    this.logger.log("AI Writing WebSocket Gateway initialized");

    // 注册事件发射处理器
    this.eventEmitter.registerEmitHandler(
      async (projectId: string, event: string, data: unknown) => {
        await this.emitToProject(projectId, event, data);
      },
    );
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * 客户端加入项目房间
   */
  @SubscribeMessage("join:project")
  async handleJoinProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectId: string },
  ) {
    try {
      const roomName = `writing:${data.projectId}`;
      await client.join(roomName);
      this.logger.log(`Client ${client.id} joined room ${roomName}`);
      return { success: true, room: roomName };
    } catch (error) {
      this.logger.error(`Failed to handle join:project: ${error}`);
      client.emit("error", { message: "Operation failed" });
      return { success: false };
    }
  }

  /**
   * 客户端离开项目房间
   */
  @SubscribeMessage("leave:project")
  async handleLeaveProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectId: string },
  ) {
    try {
      const roomName = `writing:${data.projectId}`;
      await client.leave(roomName);
      this.logger.log(`Client ${client.id} left room ${roomName}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to handle leave:project: ${error}`);
      client.emit("error", { message: "Operation failed" });
      return { success: false };
    }
  }

  /**
   * 向项目房间广播事件
   */
  async emitToProject(projectId: string, event: string, data: unknown) {
    const roomName = `writing:${projectId}`;
    const sockets = await this.server.in(roomName).fetchSockets();

    if (sockets.length > 0) {
      this.server.to(roomName).emit(event, data);
      this.logger.debug(
        `Emitted ${event} to room ${roomName} (${sockets.length} clients)`,
      );
    }
  }
}
