/**
 * Agents Service
 * 任务管理和持久化服务
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Subject, Observable } from "rxjs";
import { filter, map } from "rxjs/operators";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  OfficeAgentType,
  OfficeTaskStatus,
  OfficeArtifactType,
  Prisma,
} from "@prisma/client";
import {
  AgentId,
  AgentInput,
  AgentPlan,
  AgentResult,
  AgentEvent,
  Artifact,
  AgentTaskStatus,
  ArtifactType,
} from "@/modules/ai-harness/agents/abstractions/agent.types";
import { BUILTIN_AGENTS } from "@/modules/ai-harness/agents/domain/builtin-agent-catalog";

/**
 * 创建任务输入
 */
interface CreateTaskInput {
  userId?: string;
  agentId?: AgentId;
  input: AgentInput;
}

/**
 * 任务事件（带 taskId）
 */
interface TaskEvent {
  taskId: string;
  event: AgentEvent;
}

/**
 * 类型映射：AgentId -> Prisma OfficeAgentType
 */
function toOfficeAgentType(agentId?: AgentId): OfficeAgentType {
  switch (agentId) {
    case BUILTIN_AGENTS.SLIDES:
      return OfficeAgentType.SLIDES;
    case BUILTIN_AGENTS.DOCS:
      return OfficeAgentType.DOCS;
    case BUILTIN_AGENTS.DESIGNER:
      return OfficeAgentType.DESIGNER;
    default:
      return OfficeAgentType.DOCS; // 默认
  }
}

/**
 * 类型映射：前端 AgentTaskStatus -> Prisma OfficeTaskStatus
 */
function toOfficeTaskStatus(status: string): OfficeTaskStatus {
  switch (status) {
    case "PENDING":
      return OfficeTaskStatus.PENDING;
    case "PLANNING":
      return OfficeTaskStatus.PLANNING;
    case "EXECUTING":
      return OfficeTaskStatus.EXECUTING;
    case "COMPLETED":
      return OfficeTaskStatus.COMPLETED;
    case "FAILED":
      return OfficeTaskStatus.FAILED;
    case "CANCELLED":
      return OfficeTaskStatus.CANCELLED;
    default:
      return OfficeTaskStatus.PENDING;
  }
}

/**
 * 类型映射：ArtifactType -> Prisma OfficeArtifactType
 */
function toOfficeArtifactType(type: ArtifactType): OfficeArtifactType {
  switch (type) {
    case "pptx":
      return OfficeArtifactType.PPTX;
    case "docx":
      return OfficeArtifactType.DOCX;
    case "pdf":
      return OfficeArtifactType.PDF;
    case "image":
      return OfficeArtifactType.IMAGE;
    case "code":
      return OfficeArtifactType.CODE;
    case "data":
      return OfficeArtifactType.DATA;
    default:
      return OfficeArtifactType.DATA;
  }
}

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);
  private readonly eventSubject = new Subject<TaskEvent>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建任务
   */
  async createTask(input: CreateTaskInput): Promise<{ id: string }> {
    const task = await this.prisma.officeAgentTask.create({
      data: {
        userId: input.userId,
        agentType: toOfficeAgentType(input.agentId),
        status: OfficeTaskStatus.PENDING,
        input: input.input as unknown as Prisma.InputJsonValue,
      },
    });

    this.logger.log(`Task created: ${task.id}`);
    return { id: task.id };
  }

  /**
   * 获取任务
   */
  async getTask(taskId: string) {
    const task = await this.prisma.officeAgentTask.findUnique({
      where: { id: taskId },
      include: {
        artifacts: true,
      },
    });
    return task;
  }

  /**
   * 更新任务状态
   */
  async updateTaskStatus(
    taskId: string,
    status: string,
    error?: string,
  ): Promise<void> {
    const updateData: {
      status: OfficeTaskStatus;
      error?: string;
      startedAt?: Date;
      completedAt?: Date;
      duration?: number;
    } = {
      status: toOfficeTaskStatus(status),
      error,
    };

    if (status === "EXECUTING") {
      const task = await this.prisma.officeAgentTask.findUnique({
        where: { id: taskId },
      });
      if (task && !task.startedAt) {
        updateData.startedAt = new Date();
      }
    }

    if (status === "COMPLETED" || status === "FAILED") {
      updateData.completedAt = new Date();
      const task = await this.prisma.officeAgentTask.findUnique({
        where: { id: taskId },
      });
      if (task?.startedAt) {
        updateData.duration = Date.now() - task.startedAt.getTime();
      }
    }

    await this.prisma.officeAgentTask.update({
      where: { id: taskId },
      data: updateData,
    });
  }

  /**
   * 更新任务计划
   */
  async updateTaskPlan(taskId: string, plan: AgentPlan): Promise<void> {
    await this.prisma.officeAgentTask.update({
      where: { id: taskId },
      data: {
        plan: plan as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * 更新任务结果
   */
  async updateTaskResult(taskId: string, result: AgentResult): Promise<void> {
    await this.prisma.officeAgentTask.update({
      where: { id: taskId },
      data: {
        result: result as unknown as Prisma.InputJsonValue,
        tokensUsed: result.tokensUsed,
      },
    });
  }

  /**
   * 保存产出物
   */
  async saveArtifact(taskId: string, artifact: Artifact): Promise<void> {
    await this.prisma.officeAgentArtifact.create({
      data: {
        taskId,
        type: toOfficeArtifactType(artifact.type),
        name: artifact.name,
        mimeType: artifact.mimeType,
        size: artifact.size,
        url: artifact.url,
        content: artifact.content as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * 获取任务产出物
   */
  async getArtifacts(taskId: string): Promise<Artifact[]> {
    const artifacts = await this.prisma.officeAgentArtifact.findMany({
      where: { taskId },
    });
    return artifacts.map((a) => ({
      id: a.id,
      type: a.type.toLowerCase() as ArtifactType,
      name: a.name,
      mimeType: a.mimeType,
      size: a.size,
      url: a.url || undefined,
      content: a.content as Prisma.JsonValue,
    }));
  }

  /**
   * 获取产出物下载
   */
  async getArtifactDownload(artifactId: string): Promise<{
    url: string | null;
    name: string;
    mimeType: string;
  }> {
    const artifact = await this.prisma.officeAgentArtifact.findUnique({
      where: { id: artifactId },
    });
    if (!artifact) {
      throw new NotFoundException("Artifact not found");
    }
    return {
      url: artifact.url,
      name: artifact.name,
      mimeType: artifact.mimeType,
    };
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId: string): Promise<boolean> {
    const task = await this.prisma.officeAgentTask.findUnique({
      where: { id: taskId },
    });
    if (task && task.status === OfficeTaskStatus.EXECUTING) {
      await this.prisma.officeAgentTask.update({
        where: { id: taskId },
        data: { status: OfficeTaskStatus.CANCELLED },
      });
      this.publishEvent(taskId, { type: "error", error: "Task cancelled" });
      return true;
    }
    return false;
  }

  /**
   * 发布事件
   */
  publishEvent(taskId: string, event: AgentEvent): void {
    this.eventSubject.next({ taskId, event });
  }

  /**
   * 获取任务事件流
   */
  getTaskStream(taskId: string): Observable<AgentEvent> {
    return this.eventSubject.pipe(
      filter((te) => te.taskId === taskId),
      filter((te) => !!te.event),
      map((te) => te.event),
    );
  }

  /**
   * 获取用户的任务列表
   */
  async getUserTasks(
    userId: string,
    options?: {
      agentId?: AgentId;
      status?: AgentTaskStatus;
      limit?: number;
      offset?: number;
    },
  ) {
    return this.prisma.officeAgentTask.findMany({
      where: {
        userId,
        ...(options?.agentId && {
          agentType: toOfficeAgentType(options.agentId),
        }),
        ...(options?.status && {
          status: toOfficeTaskStatus(options.status),
        }),
      },
      orderBy: { createdAt: "desc" },
      take: options?.limit || 20,
      skip: options?.offset || 0,
      include: {
        artifacts: true,
      },
    });
  }

  /**
   * 清理过期任务
   */
  async cleanupExpiredTasks(
    maxAge: number = 24 * 60 * 60 * 1000,
  ): Promise<number> {
    const expiredDate = new Date(Date.now() - maxAge);

    const result = await this.prisma.officeAgentTask.deleteMany({
      where: {
        createdAt: { lt: expiredDate },
        status: { in: [OfficeTaskStatus.COMPLETED, OfficeTaskStatus.FAILED] },
      },
    });

    this.logger.log(`Cleaned up ${result.count} expired tasks`);
    return result.count;
  }
}
