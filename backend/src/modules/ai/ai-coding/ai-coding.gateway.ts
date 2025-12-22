/**
 * AI Coding WebSocket Gateway
 *
 * 提供项目执行进度的实时推送
 * 支持团队协作消息、Agent状态更新、Mission进度等
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
import { CodingTeamService } from "./services/coding-team.service";
import { CodingMissionService } from "./services/coding-mission.service";
import {
  CodingAgentRole,
  CodingAgentMemberStatus,
  CodingMessageType,
} from "@prisma/client";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  currentProjectId?: string;
}

/**
 * WebSocket 事件类型
 */
export enum CodingSocketEvent {
  // 项目事件
  PROJECT_PROGRESS = "project:progress",
  PROJECT_COMPLETE = "project:complete",
  PROJECT_ERROR = "project:error",

  // 团队事件
  TEAM_INITIALIZED = "team:initialized",
  TEAM_MESSAGE = "team:message",
  TEAM_STATUS = "team:status",

  // Agent 事件
  AGENT_STATUS = "agent:status",
  AGENT_OUTPUT = "agent:output",
  AGENT_THINKING = "agent:thinking",

  // Mission 事件
  MISSION_STARTED = "mission:started",
  MISSION_PROGRESS = "mission:progress",
  MISSION_COMPLETED = "mission:completed",
  MISSION_FAILED = "mission:failed",

  // 任务事件
  TASK_STARTED = "task:started",
  TASK_COMPLETED = "task:completed",
  TASK_FAILED = "task:failed",
  TASK_REVIEW = "task:review",
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
    private readonly teamService: CodingTeamService,
    private readonly missionService: CodingMissionService,
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

  // ==================== 团队协作事件处理 ====================

  /**
   * 请求团队成员列表
   */
  @SubscribeMessage("team:getMembers")
  async handleGetTeamMembers(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { projectId: string },
  ) {
    const { projectId } = data;
    const userId = client.userId;

    if (!userId) {
      return { error: "Not authenticated" };
    }

    try {
      const members = await this.teamService.getTeamMembers(projectId);
      return { success: true, members };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Get team members error: ${errorMessage}`);
      return { error: errorMessage };
    }
  }

  /**
   * 请求团队消息历史
   */
  @SubscribeMessage("team:getMessages")
  async handleGetTeamMessages(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { projectId: string; limit?: number },
  ) {
    const { projectId, limit = 50 } = data;
    const userId = client.userId;

    if (!userId) {
      return { error: "Not authenticated" };
    }

    try {
      const messages = await this.teamService.getTeamMessages(projectId, {
        limit,
      });
      return { success: true, messages };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Get team messages error: ${errorMessage}`);
      return { error: errorMessage };
    }
  }

  /**
   * 请求 Mission 进度
   */
  @SubscribeMessage("mission:getProgress")
  async handleGetMissionProgress(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { missionId: string },
  ) {
    const { missionId } = data;
    const userId = client.userId;

    if (!userId) {
      return { error: "Not authenticated" };
    }

    try {
      const progress = await this.missionService.getMissionProgress(missionId);
      return { success: true, progress };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Get mission progress error: ${errorMessage}`);
      return { error: errorMessage };
    }
  }

  /**
   * 请求团队统计
   */
  @SubscribeMessage("team:getStats")
  async handleGetTeamStats(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { projectId: string },
  ) {
    const { projectId } = data;
    const userId = client.userId;

    if (!userId) {
      return { error: "Not authenticated" };
    }

    try {
      const stats = await this.teamService.getTeamStats(projectId);
      return { success: true, stats };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Get team stats error: ${errorMessage}`);
      return { error: errorMessage };
    }
  }

  // ==================== 事件广播方法 ====================

  /**
   * 广播团队初始化事件
   */
  emitTeamInitialized(
    projectId: string,
    members: Array<{
      id: string;
      role: CodingAgentRole;
      displayName: string;
      avatar: string;
      status: CodingAgentMemberStatus;
    }>,
  ): void {
    this.emitToProject(projectId, CodingSocketEvent.TEAM_INITIALIZED, {
      projectId,
      members,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 广播团队消息
   */
  emitTeamMessage(
    projectId: string,
    message: {
      id: string;
      senderId?: string;
      senderRole?: CodingAgentRole;
      content: string;
      messageType: CodingMessageType;
      metadata?: Record<string, unknown>;
      createdAt: Date;
    },
  ): void {
    this.emitToProject(projectId, CodingSocketEvent.TEAM_MESSAGE, {
      projectId,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 广播 Agent 状态更新
   */
  emitAgentStatus(
    projectId: string,
    data: {
      memberId: string;
      role: CodingAgentRole;
      status: CodingAgentMemberStatus;
      currentTask?: string;
      lastError?: string;
    },
  ): void {
    this.emitToProject(projectId, CodingSocketEvent.AGENT_STATUS, {
      projectId,
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 广播 Agent 思考过程
   */
  emitAgentThinking(
    projectId: string,
    data: {
      memberId: string;
      role: CodingAgentRole;
      content: string;
    },
  ): void {
    this.emitToProject(projectId, CodingSocketEvent.AGENT_THINKING, {
      projectId,
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 广播 Agent 输出
   */
  emitAgentOutput(
    projectId: string,
    data: {
      memberId: string;
      role: CodingAgentRole;
      taskId: string;
      output: Record<string, unknown>;
    },
  ): void {
    this.emitToProject(projectId, CodingSocketEvent.AGENT_OUTPUT, {
      projectId,
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 广播 Mission 开始
   */
  emitMissionStarted(
    projectId: string,
    data: {
      missionId: string;
      title: string;
      totalTasks: number;
    },
  ): void {
    this.emitToProject(projectId, CodingSocketEvent.MISSION_STARTED, {
      projectId,
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 广播 Mission 进度
   */
  emitMissionProgress(
    projectId: string,
    data: {
      missionId: string;
      progress: number;
      completedTasks: number;
      totalTasks: number;
      currentTask?: string;
    },
  ): void {
    this.emitToProject(projectId, CodingSocketEvent.MISSION_PROGRESS, {
      projectId,
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 广播 Mission 完成
   */
  emitMissionCompleted(
    projectId: string,
    data: {
      missionId: string;
      totalTasks: number;
      outputs: Record<string, unknown>;
    },
  ): void {
    this.emitToProject(projectId, CodingSocketEvent.MISSION_COMPLETED, {
      projectId,
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 广播 Mission 失败
   */
  emitMissionFailed(
    projectId: string,
    data: {
      missionId: string;
      error: string;
      failedTask?: string;
    },
  ): void {
    this.emitToProject(projectId, CodingSocketEvent.MISSION_FAILED, {
      projectId,
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 广播任务开始
   */
  emitTaskStarted(
    projectId: string,
    data: {
      taskId: string;
      title: string;
      assigneeRole: CodingAgentRole;
      assigneeName: string;
    },
  ): void {
    this.emitToProject(projectId, CodingSocketEvent.TASK_STARTED, {
      projectId,
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 广播任务完成
   */
  emitTaskCompleted(
    projectId: string,
    data: {
      taskId: string;
      title: string;
      output?: Record<string, unknown>;
    },
  ): void {
    this.emitToProject(projectId, CodingSocketEvent.TASK_COMPLETED, {
      projectId,
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 广播任务失败
   */
  emitTaskFailed(
    projectId: string,
    data: {
      taskId: string;
      title: string;
      error: string;
      retryCount: number;
    },
  ): void {
    this.emitToProject(projectId, CodingSocketEvent.TASK_FAILED, {
      projectId,
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 广播任务审查
   */
  emitTaskReview(
    projectId: string,
    data: {
      taskId: string;
      title: string;
      approved: boolean;
      feedback: string;
      issues: string[];
    },
  ): void {
    this.emitToProject(projectId, CodingSocketEvent.TASK_REVIEW, {
      projectId,
      ...data,
      timestamp: new Date().toISOString(),
    });
  }
}
