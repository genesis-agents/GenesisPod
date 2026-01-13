/**
 * Topic Research WebSocket Gateway
 *
 * 参考 AI Writing Gateway 设计
 * 提供实时推送能力，支持：
 * - Leader 思考过程实时推送
 * - 任务状态实时推送
 * - Agent 工作状态广播
 * - 研究进度更新
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
import { ResearchEventEmitterService } from "./services/research-event-emitter.service";

@Injectable()
@WebSocketGateway({
  namespace: "/topic-research",
  cors: {
    origin: "*",
    credentials: true,
  },
})
export class TopicResearchGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(TopicResearchGateway.name);

  constructor(private readonly eventEmitter: ResearchEventEmitterService) {}

  afterInit() {
    this.logger.log("Topic Research WebSocket Gateway initialized");

    // 注册事件发射处理器
    this.eventEmitter.registerEmitHandler(
      async (topicId: string, event: string, data: unknown) => {
        await this.emitToTopic(topicId, event, data);
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
   * 客户端加入专题房间
   */
  @SubscribeMessage("join:topic")
  handleJoinTopic(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { topicId: string },
  ) {
    const roomName = `research:${data.topicId}`;
    client.join(roomName);
    this.logger.log(`Client ${client.id} joined room ${roomName}`);
    return { success: true, room: roomName };
  }

  /**
   * 客户端离开专题房间
   */
  @SubscribeMessage("leave:topic")
  handleLeaveTopic(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { topicId: string },
  ) {
    const roomName = `research:${data.topicId}`;
    client.leave(roomName);
    this.logger.log(`Client ${client.id} left room ${roomName}`);
    return { success: true };
  }

  /**
   * 向专题房间广播事件
   */
  async emitToTopic(topicId: string, event: string, data: unknown) {
    const roomName = `research:${topicId}`;
    const sockets = await this.server.in(roomName).fetchSockets();

    if (sockets.length > 0) {
      this.server.to(roomName).emit(event, data);
      this.logger.debug(
        `Emitted ${event} to room ${roomName} (${sockets.length} clients)`,
      );
    }
  }
}
