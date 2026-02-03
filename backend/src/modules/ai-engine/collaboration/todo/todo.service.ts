/**
 * Todo Service
 * 待办管理服务
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";

// TODO: Phase 4.1 - 需要创建 EngineTodo Prisma 模型
// 临时使用 any 类型以允许编译，待数据库迁移后移除
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getPrismaEngineTodo = (prisma: PrismaService): any =>
  (prisma as any).engineTodo;
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  ITodoService,
  Todo,
  CreateTodoRequest,
  UpdateTodoRequest,
  TodoQuery,
  TodoStats,
  TodoStatus,
} from "./todo.interface";

/**
 * 待办管理服务
 */
@Injectable()
export class TodoService implements ITodoService {
  private readonly logger = new Logger(TodoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * 创建待办
   */
  async create(request: CreateTodoRequest): Promise<Todo> {
    this.logger.debug(`Creating todo: ${request.title}`);

    const todo = await getPrismaEngineTodo(this.prisma).create({
      data: {
        type: request.type,
        title: request.title,
        description: request.description,
        entityType: request.entityType,
        entityId: request.entityId,
        assigneeId: request.assigneeId,
        priority: request.priority ?? "medium",
        dueDate: request.dueDate,
        parentId: request.parentId,
        labels: request.labels ?? [],
        metadata: request.metadata as Record<string, unknown>,
        createdBy: request.createdBy,
        status: "pending",
        progress: 0,
      },
    });

    const result = this.mapToTodo(todo);

    this.eventEmitter.emit("todo.created", {
      todoId: result.id,
      entityType: request.entityType,
      entityId: request.entityId,
    });

    return result;
  }

  /**
   * 批量创建
   */
  async createBatch(requests: CreateTodoRequest[]): Promise<Todo[]> {
    this.logger.debug(`Batch creating ${requests.length} todos`);

    const todos = await this.prisma.$transaction(
      requests.map((request) =>
        getPrismaEngineTodo(this.prisma).create({
          data: {
            type: request.type,
            title: request.title,
            description: request.description,
            entityType: request.entityType,
            entityId: request.entityId,
            assigneeId: request.assigneeId,
            priority: request.priority ?? "medium",
            dueDate: request.dueDate,
            parentId: request.parentId,
            labels: request.labels ?? [],
            metadata: request.metadata as Record<string, unknown>,
            createdBy: request.createdBy,
            status: "pending",
            progress: 0,
          },
        }),
      ),
    );

    return todos.map((t: Record<string, unknown>) => this.mapToTodo(t));
  }

  /**
   * 获取待办
   */
  async getById(id: string): Promise<Todo | null> {
    const todo = await getPrismaEngineTodo(this.prisma).findUnique({
      where: { id },
    });
    return todo ? this.mapToTodo(todo) : null;
  }

  /**
   * 查询待办
   */
  async query(query: TodoQuery): Promise<Todo[]> {
    const where: Record<string, unknown> = {};

    if (query.entityType) where.entityType = query.entityType;
    if (query.entityId) where.entityId = query.entityId;
    if (query.assigneeId) where.assigneeId = query.assigneeId;
    if (query.parentId !== undefined) {
      where.parentId = query.parentId === null ? null : query.parentId;
    }

    if (query.status) {
      where.status = Array.isArray(query.status)
        ? { in: query.status }
        : query.status;
    }
    if (query.type) {
      where.type = Array.isArray(query.type) ? { in: query.type } : query.type;
    }
    if (query.priority) {
      where.priority = Array.isArray(query.priority)
        ? { in: query.priority }
        : query.priority;
    }
    if (query.labels?.length) {
      where.labels = { hasSome: query.labels };
    }
    // ★ 使用类型安全的日期过滤器构建
    const dateFilter: { lte?: Date; gte?: Date } = {};
    if (query.dueBefore) {
      dateFilter.lte = query.dueBefore;
    }
    if (query.dueAfter) {
      dateFilter.gte = query.dueAfter;
    }
    if (Object.keys(dateFilter).length > 0) {
      where.dueDate = dateFilter;
    }

    const orderBy: Record<string, string> = {};
    if (query.sortBy) {
      orderBy[query.sortBy] = query.sortOrder ?? "desc";
    } else {
      orderBy.createdAt = "desc";
    }

    const todos = await getPrismaEngineTodo(this.prisma).findMany({
      where,
      orderBy,
      take: query.limit ?? 50,
      skip: query.offset ?? 0,
    });

    return todos.map((t: Record<string, unknown>) => this.mapToTodo(t));
  }

  /**
   * 更新待办
   */
  async update(
    id: string,
    request: UpdateTodoRequest,
    _updatedBy: string,
  ): Promise<Todo> {
    const existing = await getPrismaEngineTodo(this.prisma).findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Todo ${id} not found`);
    }

    const data: Record<string, unknown> = {};
    if (request.title !== undefined) data.title = request.title;
    if (request.description !== undefined)
      data.description = request.description;
    if (request.status !== undefined) data.status = request.status;
    if (request.priority !== undefined) data.priority = request.priority;
    if (request.assigneeId !== undefined) data.assigneeId = request.assigneeId;
    if (request.dueDate !== undefined) data.dueDate = request.dueDate;
    if (request.labels !== undefined) data.labels = request.labels;
    if (request.progress !== undefined) data.progress = request.progress;
    if (request.blockedBy !== undefined) data.blockedBy = request.blockedBy;
    if (request.metadata !== undefined) {
      data.metadata = {
        ...(existing.metadata as Record<string, unknown>),
        ...request.metadata,
      };
    }

    const todo = await getPrismaEngineTodo(this.prisma).update({
      where: { id },
      data,
    });

    return this.mapToTodo(todo);
  }

  /**
   * 完成待办
   */
  async complete(id: string, completedBy: string): Promise<Todo> {
    const todo = await getPrismaEngineTodo(this.prisma).update({
      where: { id },
      data: {
        status: "completed",
        progress: 100,
        completedAt: new Date(),
      },
    });

    this.eventEmitter.emit("todo.completed", {
      todoId: id,
      completedBy,
    });

    return this.mapToTodo(todo);
  }

  /**
   * 取消待办
   */
  async cancel(
    id: string,
    cancelledBy: string,
    reason?: string,
  ): Promise<Todo> {
    const existing = await getPrismaEngineTodo(this.prisma).findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Todo ${id} not found`);
    }

    const todo = await getPrismaEngineTodo(this.prisma).update({
      where: { id },
      data: {
        status: "cancelled",
        metadata: {
          ...(existing.metadata as Record<string, unknown>),
          cancelledBy,
          cancelReason: reason,
          cancelledAt: new Date().toISOString(),
        },
      },
    });

    return this.mapToTodo(todo);
  }

  /**
   * 删除待办
   */
  async delete(id: string): Promise<void> {
    await getPrismaEngineTodo(this.prisma).delete({ where: { id } });
    this.logger.debug(`Deleted todo ${id}`);
  }

  /**
   * 获取统计
   */
  async getStats(filters?: {
    entityType?: string;
    entityId?: string;
    assigneeId?: string;
  }): Promise<TodoStats> {
    const where: Record<string, unknown> = {};
    if (filters?.entityType) where.entityType = filters.entityType;
    if (filters?.entityId) where.entityId = filters.entityId;
    if (filters?.assigneeId) where.assigneeId = filters.assigneeId;

    const todos = await getPrismaEngineTodo(this.prisma).findMany({
      where,
      select: {
        status: true,
        priority: true,
        dueDate: true,
        completedAt: true,
      },
    });

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const stats: TodoStats = {
      total: todos.length,
      byStatus: {
        pending: 0,
        in_progress: 0,
        completed: 0,
        cancelled: 0,
        blocked: 0,
      },
      byPriority: {
        low: 0,
        medium: 0,
        high: 0,
        urgent: 0,
      },
      overdue: 0,
      completedThisWeek: 0,
    };

    for (const todo of todos) {
      stats.byStatus[todo.status as TodoStatus]++;
      stats.byPriority[todo.priority as keyof typeof stats.byPriority]++;

      if (
        todo.dueDate &&
        new Date(todo.dueDate) < now &&
        !["completed", "cancelled"].includes(todo.status)
      ) {
        stats.overdue++;
      }

      if (todo.completedAt && new Date(todo.completedAt) > weekAgo) {
        stats.completedThisWeek++;
      }
    }

    return stats;
  }

  /**
   * 获取子任务
   */
  async getChildren(parentId: string): Promise<Todo[]> {
    const todos = await getPrismaEngineTodo(this.prisma).findMany({
      where: { parentId },
      orderBy: { createdAt: "asc" },
    });
    return todos.map((t: Record<string, unknown>) => this.mapToTodo(t));
  }

  /**
   * 批量更新状态
   * 使用事务保证数据一致性
   */
  async batchUpdateStatus(
    ids: string[],
    status: TodoStatus,
    _updatedBy: string,
  ): Promise<Todo[]> {
    const updateData: Record<string, unknown> = { status };
    if (status === "completed") {
      updateData.completedAt = new Date();
      updateData.progress = 100;
    }

    // ★ 使用事务保证 updateMany 和 findMany 的一致性
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await this.prisma.$transaction(
      async (tx: any) => {
        await getPrismaEngineTodo(tx).updateMany({
          where: { id: { in: ids } },
          data: updateData,
        });

        const todos = await getPrismaEngineTodo(tx).findMany({
          where: { id: { in: ids } },
        });

        return todos.map((t: Record<string, unknown>) => this.mapToTodo(t));
      },
      { timeout: 30000 },
    ); // 30 秒超时
  }

  /**
   * 映射数据库记录到 Todo 类型
   */
  private mapToTodo(record: Record<string, unknown>): Todo {
    return {
      id: record.id as string,
      type: record.type as Todo["type"],
      title: record.title as string,
      description: record.description as string | undefined,
      entityType: record.entityType as string,
      entityId: record.entityId as string,
      parentId: record.parentId as string | undefined,
      assigneeId: record.assigneeId as string | undefined,
      createdBy: record.createdBy as string,
      status: record.status as TodoStatus,
      priority: record.priority as Todo["priority"],
      labels: (record.labels as string[]) ?? [],
      dueDate: record.dueDate as Date | undefined,
      createdAt: record.createdAt as Date,
      updatedAt: record.updatedAt as Date,
      completedAt: record.completedAt as Date | undefined,
      progress: record.progress as number | undefined,
      blockedBy: record.blockedBy as string[] | undefined,
      metadata: record.metadata as Record<string, unknown> | undefined,
    };
  }
}
