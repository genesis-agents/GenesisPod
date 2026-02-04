/**
 * Topic Research WebSocket Gateway
 *
 * 参考 AI Writing Gateway 设计
 * 提供实时推送能力，支持：
 * - Leader 思考过程实时推送
 * - 任务状态实时推送
 * - Agent 工作状态广播
 * - 研究进度更新
 *
 * ★ Security: JWT 认证已启用
 * - 连接时验证 JWT token
 * - 加入房间时验证 topic 访问权限
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
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { ResearchMissionStatus } from "@prisma/client";
import { ResearchEventEmitterService } from "./services";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  createSecurityLogger,
  SecurityEventType,
} from "./utils/security-audit-logger";

// ==================== Types ====================

/**
 * ★ Security: Authenticated user data stored in socket
 */
interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
}

/**
 * ★ Security: Extended Socket with user data
 */
interface AuthenticatedSocket extends Socket {
  data: {
    user?: AuthenticatedUser;
    authenticatedAt?: Date;
  };
}

/**
 * Phase 5: Sync request payload from client
 */
interface SyncRequestPayload {
  topicId: string;
  lastKnownPhase?: string;
  lastKnownProgress?: number;
}

/**
 * Phase 5: Sync response to client
 */
interface SyncResponse {
  success: boolean;
  needsRecovery: boolean;
  currentState: {
    phase: ResearchPhase;
    progress: number;
    message: string;
    missionId?: string;
    lastActivityAt?: string;
  } | null;
  error?: string;
}

/**
 * Research phase for client display
 */
type ResearchPhase =
  | "idle"
  | "planning"
  | "researching"
  | "analyzing"
  | "synthesizing"
  | "completed"
  | "failed"
  | "recovering";

@Injectable()
@WebSocketGateway({
  namespace: "/topic-research",
  cors: {
    origin: (
      origin: string,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // 允许所有 localhost 端口（开发环境）
      const isLocalhost =
        !origin ||
        /^http:\/\/localhost:\d+$/.test(origin) ||
        /^http:\/\/127\.0\.0\.1:\d+$/.test(origin);

      // 允许 Railway 域名（生产环境）
      const isRailway = origin?.includes(".railway.app");

      if (isLocalhost || isRailway) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  },
})
export class TopicResearchGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(TopicResearchGateway.name);
  private readonly securityLogger = createSecurityLogger("WebSocketGateway");
  private readonly jwtSecret: string;

  // ★ 修复：限制每个用户的 WebSocket 连接数
  private readonly userConnections = new Map<string, Set<string>>(); // userId -> Set<socketId>
  private readonly MAX_CONNECTIONS_PER_USER = 5;

  constructor(
    private readonly eventEmitter: ResearchEventEmitterService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    // ★ Security: Get JWT secret for token verification
    const secret = configService.get<string>("JWT_SECRET");
    if (!secret) {
      throw new Error("JWT_SECRET is required for WebSocket authentication");
    }
    this.jwtSecret = secret;
  }

  afterInit() {
    this.logger.log("Topic Research WebSocket Gateway initialized");

    // 注册事件发射处理器
    this.eventEmitter.registerEmitHandler(
      async (topicId: string, event: string, data: unknown) => {
        await this.emitToTopic(topicId, event, data);
      },
    );
  }

  /**
   * ★ Security: 验证连接时的 JWT token
   *
   * 客户端需要在 handshake.auth.token 中传递 JWT token
   * 验证失败会断开连接
   */
  async handleConnection(client: AuthenticatedSocket) {
    const clientIp = client.handshake.address;

    try {
      // 1. 从 handshake 获取 token
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace("Bearer ", "");

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        this.securityLogger.logAuthEvent({
          eventType: SecurityEventType.AUTH_FAILURE,
          clientIp,
          action: "WebSocket connection - no token",
          outcome: "FAILURE",
        });
        client.emit("auth:error", { message: "Authentication required" });
        client.disconnect(true);
        return;
      }

      // 2. 验证 JWT token
      const payload = await this.verifyToken(token);
      if (!payload) {
        this.logger.warn(`Client ${client.id} provided invalid token`);
        this.securityLogger.logAuthEvent({
          eventType: SecurityEventType.TOKEN_INVALID,
          clientIp,
          action: "WebSocket connection - invalid token",
          outcome: "FAILURE",
        });
        client.emit("auth:error", { message: "Invalid token" });
        client.disconnect(true);
        return;
      }

      // 3. 查询用户信息
      const dbUser = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, username: true },
      });

      if (!dbUser || !dbUser.email) {
        this.logger.warn(`Client ${client.id} token user not found`);
        this.securityLogger.logAuthEvent({
          eventType: SecurityEventType.AUTH_FAILURE,
          userId: payload.sub,
          clientIp,
          action: "WebSocket connection - user not found",
          outcome: "FAILURE",
        });
        client.emit("auth:error", { message: "User not found" });
        client.disconnect(true);
        return;
      }

      // 4. 存储用户信息到 socket
      const user: AuthenticatedUser = {
        id: dbUser.id,
        email: dbUser.email,
        username: dbUser.username || dbUser.email.split("@")[0],
      };
      client.data.user = user;
      client.data.authenticatedAt = new Date();

      // ★ 修复：检查并限制用户连接数
      if (!this.userConnections.has(user.id)) {
        this.userConnections.set(user.id, new Set());
      }
      const userSockets = this.userConnections.get(user.id)!;

      if (userSockets.size >= this.MAX_CONNECTIONS_PER_USER) {
        // 断开最旧的连接
        const oldestSocketId = Array.from(userSockets)[0];
        const oldestSocket = this.server.sockets.sockets.get(oldestSocketId);
        if (oldestSocket) {
          this.logger.warn(
            `User ${user.id} exceeded max connections (${this.MAX_CONNECTIONS_PER_USER}), disconnecting oldest: ${oldestSocketId}`,
          );
          oldestSocket.emit("connection:replaced", {
            message: "Connection replaced by new session",
          });
          oldestSocket.disconnect(true);
        }
        userSockets.delete(oldestSocketId);
      }

      userSockets.add(client.id);

      this.logger.log(
        `Client ${client.id} authenticated as ${user.username} (${user.id}), connections: ${userSockets.size}/${this.MAX_CONNECTIONS_PER_USER}`,
      );

      // ★ Security: 记录认证成功
      this.securityLogger.logAuthEvent({
        eventType: SecurityEventType.AUTH_SUCCESS,
        userId: user.id,
        clientIp,
        action: "WebSocket connection",
        outcome: "SUCCESS",
      });
    } catch (error) {
      this.logger.error(`Authentication error for ${client.id}:`, error);
      this.securityLogger.logAuthEvent({
        eventType: SecurityEventType.AUTH_FAILURE,
        clientIp,
        action: "WebSocket connection - error",
        outcome: "FAILURE",
        details: { error: error instanceof Error ? error.message : "Unknown" },
      });
      client.emit("auth:error", { message: "Authentication failed" });
      client.disconnect(true);
    }
  }

  /**
   * ★ Security: 验证 JWT token
   */
  private async verifyToken(
    token: string,
  ): Promise<{ sub: string; email: string } | null> {
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.jwtSecret,
      });
      return payload;
    } catch {
      return null;
    }
  }

  handleDisconnect(client: Socket) {
    // ★ 修复：清理用户连接计数
    const authClient = client as AuthenticatedSocket;
    const userId = authClient.data?.user?.id;
    if (userId) {
      const userSockets = this.userConnections.get(userId);
      if (userSockets) {
        userSockets.delete(client.id);
        if (userSockets.size === 0) {
          this.userConnections.delete(userId);
        }
      }
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * 客户端加入专题房间
   *
   * ★ Security: 验证用户是否有权访问该 topic
   */
  @SubscribeMessage("join:topic")
  async handleJoinTopic(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { topicId: string },
  ): Promise<{ success: boolean; room?: string; error?: string }> {
    // ★ Security: 检查用户是否已认证
    const user = client.data.user;
    if (!user) {
      this.logger.warn(
        `Unauthenticated client ${client.id} tried to join topic`,
      );
      return { success: false, error: "Authentication required" };
    }

    // ★ Security: 验证 topic 访问权限
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: data.topicId },
      select: { id: true, userId: true },
    });

    if (!topic) {
      this.logger.warn(`Topic ${data.topicId} not found`);
      return { success: false, error: "Topic not found" };
    }

    // ★ Security: 检查用户是否是 topic 所有者
    if (topic.userId !== user.id) {
      this.logger.warn(
        `User ${user.id} tried to access topic ${data.topicId} owned by ${topic.userId}`,
      );
      return { success: false, error: "Access denied" };
    }

    const roomName = `research:${data.topicId}`;
    client.join(roomName);
    this.logger.log(
      `Client ${client.id} (${user.username}) joined room ${roomName}`,
    );
    return { success: true, room: roomName };
  }

  /**
   * 客户端离开专题房间
   */
  @SubscribeMessage("leave:topic")
  handleLeaveTopic(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { topicId: string },
  ) {
    const roomName = `research:${data.topicId}`;
    client.leave(roomName);
    const username = client.data.user?.username || "unknown";
    this.logger.log(`Client ${client.id} (${username}) left room ${roomName}`);
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

  // ==================== Phase 5: State Sync ====================

  /**
   * ★ Phase 5: 处理客户端状态同步请求
   *
   * 场景：
   * - 页面刷新后恢复状态
   * - 网络断开重连后同步
   * - 客户端检测到状态不一致时
   */
  @SubscribeMessage("sync:request")
  async handleSyncRequest(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: SyncRequestPayload,
  ): Promise<SyncResponse> {
    const { topicId, lastKnownPhase, lastKnownProgress } = data;

    // ★ Security: 检查用户是否已认证
    const user = client.data.user;
    if (!user) {
      return {
        success: false,
        needsRecovery: false,
        currentState: null,
        error: "Authentication required",
      };
    }

    this.logger.log(
      `Client ${client.id} (${user.username}) requesting sync for topic ${topicId}`,
    );

    try {
      // 1. 查询当前 Mission 状态
      const mission = await this.prisma.researchMission.findFirst({
        where: { topicId },
        orderBy: { createdAt: "desc" },
        include: {
          tasks: {
            orderBy: { updatedAt: "desc" },
            take: 5,
          },
        },
      });

      // 2. 如果没有 Mission，返回 idle 状态
      if (!mission) {
        return {
          success: true,
          needsRecovery: false,
          currentState: {
            phase: "idle",
            progress: 0,
            message: "等待开始研究",
          },
        };
      }

      // 3. 检查是否需要恢复
      const needsRecovery = this.checkIfNeedsRecovery(
        mission,
        lastKnownPhase,
        lastKnownProgress,
      );

      // 4. 构建当前状态
      const currentPhase = this.mapStatusToPhase(mission.status);
      const currentMessage = this.buildCurrentMessage(mission, currentPhase);

      const response: SyncResponse = {
        success: true,
        needsRecovery,
        currentState: {
          phase: currentPhase,
          progress: mission.progressPercent,
          message: currentMessage,
          missionId: mission.id,
          lastActivityAt: mission.updatedAt.toISOString(),
        },
      };

      this.logger.log(
        `Sync response for ${topicId}: phase=${currentPhase}, ` +
          `progress=${mission.progressPercent}%, needsRecovery=${needsRecovery}`,
      );

      return response;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Sync request failed for topic ${topicId}: ${errorMessage}`,
      );

      return {
        success: false,
        needsRecovery: false,
        currentState: null,
        error: errorMessage,
      };
    }
  }

  /**
   * 检查是否需要恢复（状态不一致检测）
   */
  private checkIfNeedsRecovery(
    mission: {
      status: ResearchMissionStatus;
      progressPercent: number;
      updatedAt: Date;
    },
    lastKnownPhase?: string,
    lastKnownProgress?: number,
  ): boolean {
    // 如果客户端没有上次状态，不需要恢复
    if (!lastKnownPhase) return false;

    const currentPhase = this.mapStatusToPhase(mission.status);

    // 阶段不一致
    if (lastKnownPhase !== currentPhase) {
      this.logger.debug(
        `Phase mismatch: client=${lastKnownPhase}, server=${currentPhase}`,
      );
      return true;
    }

    // 进度差异超过 10%（可能错过了更新）
    if (
      lastKnownProgress !== undefined &&
      Math.abs(mission.progressPercent - lastKnownProgress) > 10
    ) {
      this.logger.debug(
        `Progress mismatch: client=${lastKnownProgress}%, server=${mission.progressPercent}%`,
      );
      return true;
    }

    // 任务超过 5 分钟没有更新（可能中断了）
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    if (
      mission.status === ResearchMissionStatus.EXECUTING &&
      mission.updatedAt.getTime() < fiveMinutesAgo
    ) {
      this.logger.debug("Mission appears stale, may need recovery");
      return true;
    }

    return false;
  }

  /**
   * 将数据库状态映射到客户端阶段
   */
  private mapStatusToPhase(status: ResearchMissionStatus): ResearchPhase {
    switch (status) {
      case ResearchMissionStatus.PLANNING:
        return "planning";
      case ResearchMissionStatus.EXECUTING:
        return "researching";
      case ResearchMissionStatus.REVIEWING:
        return "synthesizing";
      case ResearchMissionStatus.COMPLETED:
        return "completed";
      case ResearchMissionStatus.FAILED:
        return "failed";
      case ResearchMissionStatus.CANCELLED:
        return "idle";
      default:
        return "idle";
    }
  }

  /**
   * 构建当前状态消息
   */
  private buildCurrentMessage(
    mission: {
      status: ResearchMissionStatus;
      progressPercent: number;
      tasks?: Array<{ status: string }>;
    },
    phase: ResearchPhase,
  ): string {
    switch (phase) {
      case "planning":
        return "正在规划研究方案...";
      case "researching":
        return `正在进行研究 (${mission.progressPercent}%)`;
      case "analyzing":
        return "正在分析研究结果...";
      case "synthesizing":
        return "正在生成研究报告...";
      case "completed":
        return "研究已完成";
      case "failed":
        return "研究任务失败";
      case "recovering":
        return "系统正在恢复中断的任务...";
      default:
        return "等待开始研究";
    }
  }
}
