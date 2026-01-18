/**
 * Research TODO Service
 *
 * 管理研究任务的 TODO 列表，提供任务可视化和进度追踪
 * 参考 Claude Code 的 TODO 机制设计
 *
 * 功能：
 * - TODO CRUD 操作
 * - 从 Mission 自动生成 TODO 列表
 * - 状态更新和进度追踪
 * - WebSocket 事件推送
 * - 数据库持久化
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  forwardRef,
  Inject,
} from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  ResearchTodoStatus,
  ResearchTodoType,
  ResearchTaskStatus,
  Prisma,
  DimensionStatus,
} from "@prisma/client";
import type { ResearchTodo, ResearchMission } from "@prisma/client";
import { ResearchEventEmitterService } from "./research-event-emitter.service";
import { DimensionMissionService } from "./dimension-mission.service";
import { TASK_PRIORITY } from "./research-mission.service";

// ==================== Types ====================

export interface CreateTodoInput {
  topicId: string;
  missionId: string;
  type: ResearchTodoType;
  title: string;
  description?: string;
  dimensionId?: string;
  dimensionName?: string;
  agentId?: string;
  agentName?: string;
  agentRole?: string;
  /** ★ Agent 使用的 AI 模型 ID */
  modelId?: string;
  priority?: number;
  dependsOn?: string[];
  estimatedMs?: number;
  userCanPause?: boolean;
  userCanCancel?: boolean;
  userCanPrioritize?: boolean;
}

export interface UpdateTodoProgressInput {
  progress: number;
  statusMessage?: string;
}

export interface TodoFilter {
  missionId?: string;
  status?: ResearchTodoStatus[];
  type?: ResearchTodoType[];
}

export interface TodoSummary {
  total: number;
  pending: number;
  queued: number;
  inProgress: number;
  paused: number;
  completed: number;
  failed: number;
  cancelled: number;
  overallProgress: number;
}

export interface TodoResult {
  sourcesFound?: number;
  wordCount?: number;
  keyFindings?: number;
  error?: string;
}

// ==================== WebSocket Event Types ====================

export enum TodoEventType {
  TODO_CREATED = "todo:created",
  TODO_STATUS_CHANGED = "todo:status_changed",
  TODO_PROGRESS = "todo:progress",
  TODO_COMPLETED = "todo:completed",
  TODO_FAILED = "todo:failed",
  TODO_CANCELLED = "todo:cancelled",
  TODO_PAUSED = "todo:paused",
  TODO_RESUMED = "todo:resumed",
}

// ==================== Service ====================

@Injectable()
export class ResearchTodoService {
  private readonly logger = new Logger(ResearchTodoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: ResearchEventEmitterService,
    @Inject(forwardRef(() => DimensionMissionService))
    private readonly dimensionMissionService: DimensionMissionService,
  ) {}

  // ==================== CRUD 操作 ====================

  /**
   * 创建新的 TODO
   */
  async createTodo(input: CreateTodoInput): Promise<ResearchTodo> {
    const todo = await this.prisma.researchTodo.create({
      data: {
        topicId: input.topicId,
        missionId: input.missionId,
        type: input.type,
        title: input.title,
        description: input.description,
        dimensionId: input.dimensionId,
        dimensionName: input.dimensionName,
        agentId: input.agentId,
        agentName: input.agentName,
        agentRole: input.agentRole,
        modelId: input.modelId, // ★ 保存 Agent 使用的模型 ID
        priority: input.priority ?? 0,
        dependsOn: input.dependsOn ?? [],
        estimatedMs: input.estimatedMs,
        userCanPause: input.userCanPause ?? true,
        userCanCancel: input.userCanCancel ?? true,
        userCanPrioritize: input.userCanPrioritize ?? true,
        status: ResearchTodoStatus.PENDING,
      },
    });

    // 发送 WebSocket 事件
    await this.emitTodoEvent(input.topicId, TodoEventType.TODO_CREATED, {
      todo: this.formatTodoForClient(todo),
    });

    this.logger.log(`[createTodo] Created TODO ${todo.id}: ${todo.title}`);
    return todo;
  }

  /**
   * 获取专题的 TODO 列表
   */
  async getTodos(
    topicId: string,
    filter?: TodoFilter,
  ): Promise<{ todos: ResearchTodo[]; summary: TodoSummary }> {
    const where: Prisma.ResearchTodoWhereInput = {
      topicId,
      ...(filter?.missionId && { missionId: filter.missionId }),
      ...(filter?.status?.length && { status: { in: filter.status } }),
      ...(filter?.type?.length && { type: { in: filter.type } }),
    };

    const todos = await this.prisma.researchTodo.findMany({
      where,
      orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
    });

    const summary = this.calculateSummary(todos);

    return { todos, summary };
  }

  /**
   * 获取单个 TODO 详情
   */
  async getTodoById(todoId: string): Promise<ResearchTodo> {
    const todo = await this.prisma.researchTodo.findUnique({
      where: { id: todoId },
    });

    if (!todo) {
      throw new NotFoundException(`TODO ${todoId} not found`);
    }

    return todo;
  }

  /**
   * 获取 TODO 详情（包含关联的 Agent 活动）
   * ★ 修复：USER_REQUEST 类型的 TODO 不应显示其他任务的活动
   */
  async getTodoDetails(todoId: string): Promise<{
    todo: ResearchTodo;
    activities: any[];
  }> {
    const todo = await this.getTodoById(todoId);

    // ★ 对于 USER_REQUEST 类型的 TODO，只有在执行后才有活动记录
    // 未执行的用户请求不应显示其他任务的活动
    if (todo.type === "USER_REQUEST") {
      // USER_REQUEST TODO 暂无关联活动（除非我们将来支持记录执行过程）
      return { todo, activities: [] };
    }

    // 其他类型的 TODO：根据维度或代理过滤
    let whereCondition: Prisma.ResearchAgentActivityWhereInput = {
      topicId: todo.topicId,
      missionId: todo.missionId,
    };

    if (todo.dimensionId) {
      // 维度研究 TODO：只显示该维度的活动
      whereCondition.dimensionId = todo.dimensionId;
    } else if (todo.agentId) {
      // 有明确代理的 TODO
      whereCondition.agentId = todo.agentId;
    } else {
      // 没有维度也没有代理，返回空（避免返回所有活动）
      return { todo, activities: [] };
    }

    const activities = await this.prisma.researchAgentActivity.findMany({
      where: whereCondition,
      orderBy: { createdAt: "asc" },
    });

    return { todo, activities };
  }

  // ==================== 状态管理 ====================

  /**
   * 更新 TODO 状态
   */
  async updateTodoStatus(
    todoId: string,
    newStatus: ResearchTodoStatus,
    message?: string,
  ): Promise<ResearchTodo> {
    const todo = await this.getTodoById(todoId);
    const oldStatus = todo.status;

    // 验证状态转换
    this.validateStatusTransition(oldStatus, newStatus);

    // 更新字段
    const updateData: Prisma.ResearchTodoUpdateInput = {
      status: newStatus,
      ...(message && { statusMessage: message }),
    };

    // 状态特定更新
    if (newStatus === ResearchTodoStatus.IN_PROGRESS && !todo.startedAt) {
      updateData.startedAt = new Date();
    }

    if (
      newStatus === ResearchTodoStatus.COMPLETED ||
      newStatus === ResearchTodoStatus.FAILED ||
      newStatus === ResearchTodoStatus.CANCELLED
    ) {
      updateData.completedAt = new Date();
      if (todo.startedAt) {
        updateData.actualMs = Date.now() - todo.startedAt.getTime();
      }
    }

    const updatedTodo = await this.prisma.researchTodo.update({
      where: { id: todoId },
      data: updateData,
    });

    // 发送状态变更事件
    await this.emitTodoEvent(todo.topicId, TodoEventType.TODO_STATUS_CHANGED, {
      todoId,
      oldStatus,
      newStatus,
      message,
      todo: this.formatTodoForClient(updatedTodo),
    });

    this.logger.log(
      `[updateTodoStatus] TODO ${todoId}: ${oldStatus} -> ${newStatus}`,
    );
    return updatedTodo;
  }

  /**
   * 更新 TODO 进度
   */
  async updateTodoProgress(
    todoId: string,
    input: UpdateTodoProgressInput,
  ): Promise<ResearchTodo> {
    const todo = await this.getTodoById(todoId);

    // 只有进行中的任务才能更新进度
    if (todo.status !== ResearchTodoStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Cannot update progress for TODO with status ${todo.status}`,
      );
    }

    const updatedTodo = await this.prisma.researchTodo.update({
      where: { id: todoId },
      data: {
        progress: Math.min(100, Math.max(0, input.progress)),
        statusMessage: input.statusMessage,
      },
    });

    // 发送进度事件
    await this.emitTodoEvent(todo.topicId, TodoEventType.TODO_PROGRESS, {
      todoId,
      progress: updatedTodo.progress,
      statusMessage: input.statusMessage,
    });

    return updatedTodo;
  }

  /**
   * 完成 TODO（带结果）
   */
  async completeTodo(
    todoId: string,
    result?: TodoResult,
  ): Promise<ResearchTodo> {
    const todo = await this.getTodoById(todoId);

    const updatedTodo = await this.prisma.researchTodo.update({
      where: { id: todoId },
      data: {
        status: ResearchTodoStatus.COMPLETED,
        progress: 100,
        completedAt: new Date(),
        actualMs: todo.startedAt ? Date.now() - todo.startedAt.getTime() : null,
        result: result ? (result as any) : undefined,
        statusMessage: "已完成",
      },
    });

    // 发送完成事件
    await this.emitTodoEvent(todo.topicId, TodoEventType.TODO_COMPLETED, {
      todoId,
      result,
      duration: updatedTodo.actualMs,
      todo: this.formatTodoForClient(updatedTodo),
    });

    this.logger.log(`[completeTodo] TODO ${todoId} completed`);
    return updatedTodo;
  }

  /**
   * 标记 TODO 失败
   */
  async failTodo(todoId: string, error: string): Promise<ResearchTodo> {
    const todo = await this.getTodoById(todoId);

    const updatedTodo = await this.prisma.researchTodo.update({
      where: { id: todoId },
      data: {
        status: ResearchTodoStatus.FAILED,
        completedAt: new Date(),
        actualMs: todo.startedAt ? Date.now() - todo.startedAt.getTime() : null,
        result: { error } as any,
        statusMessage: `失败: ${error}`,
      },
    });

    // 发送失败事件
    await this.emitTodoEvent(todo.topicId, TodoEventType.TODO_FAILED, {
      todoId,
      error,
      canRetry: true,
      todo: this.formatTodoForClient(updatedTodo),
    });

    this.logger.error(`[failTodo] TODO ${todoId} failed: ${error}`);
    return updatedTodo;
  }

  // ==================== 用户操作 ====================

  /**
   * ★ 更新 TODO 内容（标题和描述）
   * 仅限 USER_REQUEST 类型且状态为 PENDING 的 TODO
   */
  async updateTodoContent(
    todoId: string,
    input: { title?: string; description?: string },
  ): Promise<ResearchTodo> {
    const todo = await this.getTodoById(todoId);

    // 只允许编辑 USER_REQUEST 类型
    if (todo.type !== "USER_REQUEST") {
      throw new BadRequestException("只能编辑用户请求类型的任务");
    }

    // 只允许编辑 PENDING 状态
    if (todo.status !== ResearchTodoStatus.PENDING) {
      throw new BadRequestException("只能编辑待处理状态的任务");
    }

    const updatedTodo = await this.prisma.researchTodo.update({
      where: { id: todoId },
      data: {
        ...(input.title && { title: input.title }),
        ...(input.description !== undefined && {
          description: input.description,
        }),
      },
    });

    this.logger.log(`[updateTodoContent] TODO ${todoId} updated`);
    return updatedTodo;
  }

  /**
   * ★ 删除 TODO
   * 仅限 USER_REQUEST 类型且状态为 PENDING 的 TODO
   */
  async deleteTodo(todoId: string): Promise<void> {
    const todo = await this.getTodoById(todoId);

    // 只允许删除 USER_REQUEST 类型
    if (todo.type !== "USER_REQUEST") {
      throw new BadRequestException("只能删除用户请求类型的任务");
    }

    // 只允许删除 PENDING 状态
    if (todo.status !== ResearchTodoStatus.PENDING) {
      throw new BadRequestException("只能删除待处理状态的任务");
    }

    await this.prisma.researchTodo.delete({
      where: { id: todoId },
    });

    // 发送删除事件
    await this.emitTodoEvent(todo.topicId, TodoEventType.TODO_STATUS_CHANGED, {
      todoId,
      oldStatus: todo.status,
      newStatus: "DELETED",
      message: "用户已删除",
    });

    this.logger.log(`[deleteTodo] TODO ${todoId} deleted`);
  }

  /**
   * 暂停 TODO
   */
  async pauseTodo(todoId: string): Promise<ResearchTodo> {
    const todo = await this.getTodoById(todoId);

    if (!todo.userCanPause) {
      throw new BadRequestException("This TODO cannot be paused");
    }

    if (todo.status !== ResearchTodoStatus.IN_PROGRESS) {
      throw new BadRequestException("Only in-progress TODOs can be paused");
    }

    const updatedTodo = await this.prisma.researchTodo.update({
      where: { id: todoId },
      data: {
        status: ResearchTodoStatus.PAUSED,
        statusMessage: "用户已暂停",
      },
    });

    await this.emitTodoEvent(todo.topicId, TodoEventType.TODO_PAUSED, {
      todoId,
      todo: this.formatTodoForClient(updatedTodo),
    });

    this.logger.log(`[pauseTodo] TODO ${todoId} paused by user`);
    return updatedTodo;
  }

  /**
   * 恢复 TODO
   */
  async resumeTodo(todoId: string): Promise<ResearchTodo> {
    const todo = await this.getTodoById(todoId);

    if (todo.status !== ResearchTodoStatus.PAUSED) {
      throw new BadRequestException("Only paused TODOs can be resumed");
    }

    const updatedTodo = await this.prisma.researchTodo.update({
      where: { id: todoId },
      data: {
        status: ResearchTodoStatus.IN_PROGRESS,
        statusMessage: "已恢复执行",
      },
    });

    await this.emitTodoEvent(todo.topicId, TodoEventType.TODO_RESUMED, {
      todoId,
      todo: this.formatTodoForClient(updatedTodo),
    });

    this.logger.log(`[resumeTodo] TODO ${todoId} resumed by user`);
    return updatedTodo;
  }

  /**
   * 取消 TODO
   */
  async cancelTodo(todoId: string, reason?: string): Promise<ResearchTodo> {
    const todo = await this.getTodoById(todoId);

    if (!todo.userCanCancel) {
      throw new BadRequestException("This TODO cannot be cancelled");
    }

    const cancellableStatuses: ResearchTodoStatus[] = [
      ResearchTodoStatus.PENDING,
      ResearchTodoStatus.QUEUED,
      ResearchTodoStatus.PAUSED,
    ];

    if (!cancellableStatuses.includes(todo.status)) {
      throw new BadRequestException(
        `Cannot cancel TODO with status ${todo.status}`,
      );
    }

    const updatedTodo = await this.prisma.researchTodo.update({
      where: { id: todoId },
      data: {
        status: ResearchTodoStatus.CANCELLED,
        completedAt: new Date(),
        statusMessage: reason || "用户已取消",
      },
    });

    await this.emitTodoEvent(todo.topicId, TodoEventType.TODO_CANCELLED, {
      todoId,
      reason,
      todo: this.formatTodoForClient(updatedTodo),
    });

    this.logger.log(`[cancelTodo] TODO ${todoId} cancelled: ${reason}`);
    return updatedTodo;
  }

  /**
   * 重试失败的 TODO
   */
  async retryTodo(todoId: string): Promise<ResearchTodo> {
    const todo = await this.getTodoById(todoId);

    if (todo.status !== ResearchTodoStatus.FAILED) {
      throw new BadRequestException("Only failed TODOs can be retried");
    }

    const updatedTodo = await this.prisma.researchTodo.update({
      where: { id: todoId },
      data: {
        status: ResearchTodoStatus.QUEUED,
        progress: 0,
        startedAt: null,
        completedAt: null,
        actualMs: null,
        result: Prisma.DbNull,
        statusMessage: "等待重试",
      },
    });

    await this.emitTodoEvent(todo.topicId, TodoEventType.TODO_STATUS_CHANGED, {
      todoId,
      oldStatus: ResearchTodoStatus.FAILED,
      newStatus: ResearchTodoStatus.QUEUED,
      message: "任务已重新排队",
      todo: this.formatTodoForClient(updatedTodo),
    });

    this.logger.log(`[retryTodo] TODO ${todoId} queued for retry`);
    return updatedTodo;
  }

  /**
   * 调整 TODO 优先级
   */
  async prioritizeTodo(
    todoId: string,
    priority: "high" | "normal" | "low",
  ): Promise<ResearchTodo> {
    const todo = await this.getTodoById(todoId);

    if (!todo.userCanPrioritize) {
      throw new BadRequestException("This TODO cannot be prioritized");
    }

    const priorityValue = {
      high: 100,
      normal: 0,
      low: -100,
    }[priority];

    const updatedTodo = await this.prisma.researchTodo.update({
      where: { id: todoId },
      data: { priority: priorityValue },
    });

    this.logger.log(
      `[prioritizeTodo] TODO ${todoId} priority set to ${priority}`,
    );
    return updatedTodo;
  }

  // ==================== Mission 集成 ====================

  /**
   * 从 Mission 生成 TODO 列表
   * 在 Leader 规划完成后调用
   */
  async generateTodosFromMission(
    mission: ResearchMission,
    leaderPlan: any,
  ): Promise<ResearchTodo[]> {
    const todos: ResearchTodo[] = [];
    const topicId = mission.topicId;
    const missionId = mission.id;

    this.logger.log(
      `[generateTodosFromMission] Generating TODOs for mission ${missionId}`,
    );

    // 1. Leader 规划 TODO（已完成）
    const leaderTodo = await this.createTodo({
      topicId,
      missionId,
      type: ResearchTodoType.LEADER_PLANNING,
      title: "Leader 任务理解与规划",
      description: "Leader 分析研究主题，制定研究策略和任务分配",
      agentId: "leader",
      agentName: "研究协调员",
      agentRole: "leader",
      priority: 1000,
      userCanPause: false,
      userCanCancel: false,
    });
    // 立即标记为完成
    await this.completeTodo(leaderTodo.id, {
      keyFindings: leaderPlan?.dimensions?.length || 0,
    });
    todos.push(leaderTodo);

    // 2. 为每个维度创建研究 TODO
    const dimensions = leaderPlan?.dimensions || [];
    const agentAssignments = leaderPlan?.agentAssignments || [];
    const dimensionTodoIds: string[] = [];

    for (let i = 0; i < dimensions.length; i++) {
      const dim = dimensions[i];
      const dimId = dim.id || dim.dimensionId;

      // ★ 查找此维度对应的 Agent 分配，获取 modelId
      const assignment = agentAssignments.find(
        (a: { agentType: string; assignedDimensions?: string[] }) =>
          a.agentType === "dimension_researcher" &&
          a.assignedDimensions?.includes(dimId),
      );

      const dimensionTodo = await this.createTodo({
        topicId,
        missionId,
        type: ResearchTodoType.DIMENSION_RESEARCH,
        title: `${dim.name || dim.dimensionName}维度研究`,
        description:
          dim.description || `研究 ${dim.name || dim.dimensionName} 相关内容`,
        dimensionId: dimId,
        dimensionName: dim.name || dim.dimensionName,
        agentId: assignment?.agentId || `researcher-${i + 1}`,
        agentName: assignment?.agentName || `研究员 ${i + 1}`,
        agentRole: "researcher",
        modelId: assignment?.modelId, // ★ 保存分配的模型 ID
        priority: 500 - i,
        dependsOn: [leaderTodo.id],
        estimatedMs: 120000, // 预估 2 分钟
      });
      dimensionTodoIds.push(dimensionTodo.id);
      todos.push(dimensionTodo);
    }

    // 3. 报告撰写 TODO
    const reportTodo = await this.createTodo({
      topicId,
      missionId,
      type: ResearchTodoType.REPORT_WRITING,
      title: "报告撰写",
      description: "整合各维度研究结果，撰写完整研究报告",
      agentId: "synthesizer",
      agentName: "报告撰写员",
      agentRole: "synthesizer",
      priority: 100,
      dependsOn: dimensionTodoIds,
      estimatedMs: 180000, // 预估 3 分钟
    });
    todos.push(reportTodo);

    // 4. 质量审核 TODO
    const reviewTodo = await this.createTodo({
      topicId,
      missionId,
      type: ResearchTodoType.QUALITY_REVIEW,
      title: "质量审核",
      description: "审核研究报告质量，确保内容准确性和完整性",
      agentId: "reviewer",
      agentName: "质量审核员",
      agentRole: "reviewer",
      priority: 50,
      dependsOn: [reportTodo.id],
      estimatedMs: 60000, // 预估 1 分钟
    });
    todos.push(reviewTodo);

    this.logger.log(
      `[generateTodosFromMission] Generated ${todos.length} TODOs for mission ${missionId}`,
    );

    return todos;
  }

  /**
   * 获取下一个可执行的 TODO
   * 根据依赖关系和优先级
   */
  async getNextExecutableTodo(missionId: string): Promise<ResearchTodo | null> {
    // 获取所有待执行的 TODO
    const pendingTodos = await this.prisma.researchTodo.findMany({
      where: {
        missionId,
        status: {
          in: [ResearchTodoStatus.PENDING, ResearchTodoStatus.QUEUED],
        },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    });

    if (pendingTodos.length === 0) {
      return null;
    }

    // 获取已完成的 TODO ID
    const completedTodos = await this.prisma.researchTodo.findMany({
      where: {
        missionId,
        status: ResearchTodoStatus.COMPLETED,
      },
      select: { id: true },
    });
    const completedIds = new Set(completedTodos.map((t) => t.id));

    // 找到第一个依赖都已完成的 TODO
    for (const todo of pendingTodos) {
      const dependencies = todo.dependsOn || [];
      const allDepsCompleted = dependencies.every((depId) =>
        completedIds.has(depId),
      );

      if (allDepsCompleted) {
        return todo;
      }
    }

    return null;
  }

  /**
   * 检查 TODO 依赖是否满足
   */
  async checkDependencies(todoId: string): Promise<boolean> {
    const todo = await this.getTodoById(todoId);
    const dependencies = todo.dependsOn || [];

    if (dependencies.length === 0) {
      return true;
    }

    const completedCount = await this.prisma.researchTodo.count({
      where: {
        id: { in: dependencies },
        status: ResearchTodoStatus.COMPLETED,
      },
    });

    return completedCount === dependencies.length;
  }

  /**
   * 创建用户请求的 TODO
   */
  async createUserRequestTodo(
    topicId: string,
    missionId: string,
    title: string,
    description?: string,
  ): Promise<ResearchTodo> {
    return this.createTodo({
      topicId,
      missionId,
      type: ResearchTodoType.USER_REQUEST,
      title,
      description,
      agentId: "leader",
      agentName: "研究协调员",
      agentRole: "leader",
      priority: 800, // 用户请求优先级较高
    });
  }

  /**
   * ★ 执行用户请求的 TODO
   * 解析 TODO 内容，执行相应操作（如新增维度并研究）
   */
  async executeTodo(
    topicId: string,
    todoId: string,
  ): Promise<{ todo: ResearchTodo; message: string }> {
    this.logger.log(`[executeTodo] Starting execution for TODO ${todoId}`);

    // 1. 获取 TODO 信息
    const todo = await this.prisma.researchTodo.findUnique({
      where: { id: todoId },
    });

    if (!todo) {
      throw new NotFoundException(`TODO ${todoId} not found`);
    }

    // 2. 验证 TODO 类型和状态
    if (todo.type !== ResearchTodoType.USER_REQUEST) {
      throw new BadRequestException(
        `Only USER_REQUEST type TODOs can be executed. Got: ${todo.type}`,
      );
    }

    if (todo.status !== ResearchTodoStatus.PENDING) {
      throw new BadRequestException(
        `TODO must be in PENDING status to execute. Current: ${todo.status}`,
      );
    }

    // 3. 更新状态为 IN_PROGRESS
    const updatedTodo = await this.prisma.researchTodo.update({
      where: { id: todoId },
      data: {
        status: ResearchTodoStatus.IN_PROGRESS,
        startedAt: new Date(),
        statusMessage: "正在执行用户请求...",
      },
    });

    // 发送状态更新事件
    await this.emitTodoEvent(topicId, TodoEventType.TODO_STATUS_CHANGED, {
      todoId,
      oldStatus: ResearchTodoStatus.PENDING,
      newStatus: ResearchTodoStatus.IN_PROGRESS,
      message: "正在执行用户请求...",
      todo: this.formatTodoForClient(updatedTodo),
    });

    // 4. 解析 TODO 内容，判断要执行什么操作
    const todoTitle = todo.title.toLowerCase();
    const todoDesc = (todo.description || "").toLowerCase();

    let resultMessage = "";

    try {
      // ★ 判断是否需要新增维度/章节
      const isAddDimension =
        todoTitle.includes("新增维度") ||
        todoTitle.includes("添加维度") ||
        todoTitle.includes("新增章节") ||
        todoTitle.includes("添加章节") ||
        todoTitle.includes("独立章节") ||
        todoDesc.includes("新增维度") ||
        todoDesc.includes("新增章节") ||
        // 匹配 "研究: xxx" 格式（Leader 创建的研究任务）
        /^研究[:：]/.test(todoTitle);

      if (isAddDimension) {
        // 新增维度/章节操作
        resultMessage = await this.executeAddDimension(topicId, todo);
      } else if (
        todoTitle.includes("深入研究") ||
        todoTitle.includes("详细分析")
      ) {
        // 深入研究操作
        resultMessage = await this.executeDeepResearch(topicId, todo);
      } else {
        // 通用执行：标记为完成
        resultMessage = `任务「${todo.title}」已记录，将在后续研究中考虑`;
      }

      // 5. 更新状态为 COMPLETED
      const completedTodo = await this.prisma.researchTodo.update({
        where: { id: todoId },
        data: {
          status: ResearchTodoStatus.COMPLETED,
          progress: 100,
          completedAt: new Date(),
          actualMs: updatedTodo.startedAt
            ? Date.now() - updatedTodo.startedAt.getTime()
            : null,
          statusMessage: resultMessage,
        },
      });

      // 发送完成事件
      await this.emitTodoEvent(topicId, TodoEventType.TODO_COMPLETED, {
        todoId,
        result: { message: resultMessage },
        duration: completedTodo.actualMs,
        todo: this.formatTodoForClient(completedTodo),
      });

      this.logger.log(
        `[executeTodo] TODO ${todoId} executed successfully: ${resultMessage}`,
      );

      return {
        todo: completedTodo,
        message: resultMessage,
      };
    } catch (error) {
      // 执行失败，更新状态
      const failedTodo = await this.prisma.researchTodo.update({
        where: { id: todoId },
        data: {
          status: ResearchTodoStatus.FAILED,
          statusMessage: `执行失败: ${error instanceof Error ? error.message : "未知错误"}`,
        },
      });

      await this.emitTodoEvent(topicId, TodoEventType.TODO_FAILED, {
        todo: this.formatTodoForClient(failedTodo),
        error: error instanceof Error ? error.message : "未知错误",
      });

      throw error;
    }
  }

  /**
   * 执行新增维度操作
   * ★ 增强版：创建 Dimension + Task 后自动触发 AI 研究
   */
  private async executeAddDimension(
    topicId: string,
    todo: ResearchTodo,
  ): Promise<string> {
    this.logger.log(
      `[executeAddDimension] Adding new dimension for topic ${topicId}`,
    );

    // 从 title 或 description 中提取维度名称
    const titleMatch = todo.title.match(/[：:「](.+?)[」]?$/);
    const dimensionName = titleMatch
      ? titleMatch[1].trim()
      : todo.title.replace(/新增维度|添加维度|[：:]/g, "").trim();

    // 获取 topic 信息
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
    });

    if (!topic) {
      throw new NotFoundException(`Topic ${topicId} not found`);
    }

    // 获取最新的 report
    const report = await this.prisma.topicReport.findFirst({
      where: { topicId },
      orderBy: { generatedAt: "desc" },
    });

    // 创建新维度
    const dimension = await this.prisma.topicDimension.create({
      data: {
        topicId,
        name: dimensionName,
        description: todo.description || `用户请求新增的维度：${dimensionName}`,
        status: DimensionStatus.PENDING,
        sortOrder: 100,
        searchQueries: [dimensionName], // 使用维度名作为初始搜索词
      },
    });

    this.logger.log(
      `[executeAddDimension] Created dimension ${dimension.id}: ${dimensionName}`,
    );

    // ★ 同时创建 ResearchTask 记录，用于 Mission 进度追踪
    let task = null;
    if (todo.missionId) {
      task = await this.prisma.researchTask.create({
        data: {
          missionId: todo.missionId,
          title: `研究: ${dimensionName}`,
          description:
            todo.description || `用户请求的新维度研究：${dimensionName}`,
          taskType: "dimension_research",
          dimensionName: dimensionName,
          dimensionId: dimension.id,
          assignedAgent: "researcher_dynamic",
          assignedAgentType: "dimension_researcher",
          priority: TASK_PRIORITY.DIMENSION_RESEARCH_DYNAMIC,
          status: ResearchTaskStatus.EXECUTING,
          startedAt: new Date(),
        },
      });

      // 更新 Mission 的 totalTasks 计数
      await this.prisma.researchMission.update({
        where: { id: todo.missionId },
        data: {
          totalTasks: { increment: 1 },
        },
      });

      this.logger.log(
        `[executeAddDimension] Created ResearchTask ${task.id} for dimension ${dimensionName}`,
      );
    }

    // ★ 自动触发维度研究
    try {
      // 更新 TODO 进度
      await this.prisma.researchTodo.update({
        where: { id: todo.id },
        data: {
          progress: 20,
          statusMessage: `已创建维度「${dimensionName}」，正在启动 AI 研究...`,
        },
      });

      // 调用 DimensionMissionService 执行真正的研究
      const missionResult =
        await this.dimensionMissionService.executeDimensionMission(
          topic,
          dimension,
          report?.id,
          todo.missionId,
        );

      if (missionResult.success) {
        // ★ 更新 Task 状态为完成
        if (task) {
          await this.prisma.researchTask.update({
            where: { id: task.id },
            data: {
              status: ResearchTaskStatus.COMPLETED,
              completedAt: new Date(),
              result:
                missionResult.analysisResult as unknown as Prisma.InputJsonValue,
              resultSummary: `研究完成，找到 ${missionResult.evidenceIds.length} 个证据`,
            },
          });
          // 更新 Mission 的 completedTasks 计数
          await this.prisma.researchMission.update({
            where: { id: todo.missionId! },
            data: {
              completedTasks: { increment: 1 },
            },
          });
        }

        this.logger.log(
          `[executeAddDimension] Dimension research completed successfully for ${dimensionName}`,
        );
        return `已创建新维度「${dimensionName}」并完成 AI 研究。找到 ${missionResult.evidenceIds.length} 个证据来源。`;
      } else {
        // ★ 更新 Task 状态为失败
        if (task) {
          await this.prisma.researchTask.update({
            where: { id: task.id },
            data: {
              status: ResearchTaskStatus.FAILED,
              completedAt: new Date(),
              resultSummary: `研究失败: ${missionResult.error || "未知错误"}`,
            },
          });
        }

        this.logger.warn(
          `[executeAddDimension] Dimension research failed: ${missionResult.error}`,
        );
        return `已创建新维度「${dimensionName}」，但研究过程中出现问题: ${missionResult.error || "未知错误"}。您可以稍后手动触发研究。`;
      }
    } catch (error) {
      // ★ 更新 Task 状态为失败
      if (task) {
        await this.prisma.researchTask.update({
          where: { id: task.id },
          data: {
            status: ResearchTaskStatus.FAILED,
            completedAt: new Date(),
            resultSummary: `研究失败: ${error instanceof Error ? error.message : "未知错误"}`,
          },
        });
      }

      // 研究失败不影响维度创建
      this.logger.error(
        `[executeAddDimension] Failed to execute dimension research: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      return `已创建新维度「${dimensionName}」，但自动研究启动失败。您可以在维度列表中手动触发研究。`;
    }
  }

  /**
   * 执行深入研究操作
   * ★ 增强版：创建 Dimension + Task 后自动触发 AI 研究
   */
  private async executeDeepResearch(
    topicId: string,
    todo: ResearchTodo,
  ): Promise<string> {
    this.logger.log(`[executeDeepResearch] Deep research for topic ${topicId}`);

    // 从 title 或 description 中提取研究主题
    const researchTopic = todo.title
      .replace(/深入研究|详细分析|[：:]/g, "")
      .trim();

    // 获取 topic 信息
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
    });

    if (!topic) {
      throw new NotFoundException(`Topic ${topicId} not found`);
    }

    // 获取最新的 report
    const report = await this.prisma.topicReport.findFirst({
      where: { topicId },
      orderBy: { generatedAt: "desc" },
    });

    // 创建专门的深入研究维度
    const dimensionName = `深入分析：${researchTopic}`;
    const dimension = await this.prisma.topicDimension.create({
      data: {
        topicId,
        name: dimensionName,
        description:
          todo.description ||
          `用户请求深入研究的主题：${researchTopic}\n\n请进行详细、全面的分析。`,
        status: DimensionStatus.PENDING,
        sortOrder: 100,
        searchQueries: [researchTopic, `${researchTopic} 详细分析`],
      },
    });

    this.logger.log(
      `[executeDeepResearch] Created deep research dimension ${dimension.id}: ${dimensionName}`,
    );

    // ★ 同时创建 ResearchTask 记录，用于 Mission 进度追踪
    let task = null;
    if (todo.missionId) {
      task = await this.prisma.researchTask.create({
        data: {
          missionId: todo.missionId,
          title: `研究: ${dimensionName}`,
          description:
            todo.description || `用户请求的深入研究：${researchTopic}`,
          taskType: "dimension_research",
          dimensionName: dimensionName,
          dimensionId: dimension.id,
          assignedAgent: "researcher_dynamic",
          assignedAgentType: "dimension_researcher",
          priority: TASK_PRIORITY.DIMENSION_RESEARCH_DYNAMIC,
          status: ResearchTaskStatus.EXECUTING,
          startedAt: new Date(),
        },
      });

      // 更新 Mission 的 totalTasks 计数
      await this.prisma.researchMission.update({
        where: { id: todo.missionId },
        data: {
          totalTasks: { increment: 1 },
        },
      });

      this.logger.log(
        `[executeDeepResearch] Created ResearchTask ${task.id} for deep research ${dimensionName}`,
      );
    }

    // ★ 自动触发维度研究
    try {
      // 更新 TODO 进度
      await this.prisma.researchTodo.update({
        where: { id: todo.id },
        data: {
          progress: 20,
          statusMessage: `正在启动对「${researchTopic}」的深入研究...`,
        },
      });

      // 调用 DimensionMissionService 执行真正的研究
      const missionResult =
        await this.dimensionMissionService.executeDimensionMission(
          topic,
          dimension,
          report?.id,
          todo.missionId,
        );

      if (missionResult.success) {
        // ★ 更新 Task 状态为完成
        if (task) {
          await this.prisma.researchTask.update({
            where: { id: task.id },
            data: {
              status: ResearchTaskStatus.COMPLETED,
              completedAt: new Date(),
              result:
                missionResult.analysisResult as unknown as Prisma.InputJsonValue,
              resultSummary: `深入研究完成，找到 ${missionResult.evidenceIds.length} 个证据`,
            },
          });
          // 更新 Mission 的 completedTasks 计数
          await this.prisma.researchMission.update({
            where: { id: todo.missionId! },
            data: {
              completedTasks: { increment: 1 },
            },
          });
        }

        this.logger.log(
          `[executeDeepResearch] Deep research completed successfully for ${researchTopic}`,
        );
        return `已完成对「${researchTopic}」的深入研究。找到 ${missionResult.evidenceIds.length} 个证据来源，研究内容已添加到报告中。`;
      } else {
        // ★ 更新 Task 状态为失败
        if (task) {
          await this.prisma.researchTask.update({
            where: { id: task.id },
            data: {
              status: ResearchTaskStatus.FAILED,
              completedAt: new Date(),
              resultSummary: `研究失败: ${missionResult.error || "未知错误"}`,
            },
          });
        }

        this.logger.warn(
          `[executeDeepResearch] Deep research failed: ${missionResult.error}`,
        );
        return `深入研究「${researchTopic}」过程中出现问题: ${missionResult.error || "未知错误"}。您可以稍后在维度列表中手动触发研究。`;
      }
    } catch (error) {
      // ★ 更新 Task 状态为失败
      if (task) {
        await this.prisma.researchTask.update({
          where: { id: task.id },
          data: {
            status: ResearchTaskStatus.FAILED,
            completedAt: new Date(),
            resultSummary: `研究失败: ${error instanceof Error ? error.message : "未知错误"}`,
          },
        });
      }

      // 研究失败不影响维度创建
      this.logger.error(
        `[executeDeepResearch] Failed to execute deep research: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      return `已创建深入研究任务「${researchTopic}」，但自动研究启动失败。您可以在维度列表中手动触发研究。`;
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * 计算 TODO 汇总
   */
  private calculateSummary(todos: ResearchTodo[]): TodoSummary {
    const summary: TodoSummary = {
      total: todos.length,
      pending: 0,
      queued: 0,
      inProgress: 0,
      paused: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      overallProgress: 0,
    };

    let totalProgress = 0;
    let countableItems = 0;

    for (const todo of todos) {
      switch (todo.status) {
        case ResearchTodoStatus.PENDING:
          summary.pending++;
          break;
        case ResearchTodoStatus.QUEUED:
          summary.queued++;
          break;
        case ResearchTodoStatus.IN_PROGRESS:
          summary.inProgress++;
          totalProgress += todo.progress;
          countableItems++;
          break;
        case ResearchTodoStatus.PAUSED:
          summary.paused++;
          totalProgress += todo.progress;
          countableItems++;
          break;
        case ResearchTodoStatus.COMPLETED:
          summary.completed++;
          totalProgress += 100;
          countableItems++;
          break;
        case ResearchTodoStatus.FAILED:
          summary.failed++;
          break;
        case ResearchTodoStatus.CANCELLED:
          summary.cancelled++;
          break;
      }
    }

    // 计算整体进度（排除取消和失败的）
    const activeItems =
      summary.pending +
      summary.queued +
      summary.inProgress +
      summary.paused +
      summary.completed;
    if (activeItems > 0) {
      summary.overallProgress = Math.round(
        (summary.completed * 100 +
          todos
            .filter(
              (t) =>
                t.status === ResearchTodoStatus.IN_PROGRESS ||
                t.status === ResearchTodoStatus.PAUSED,
            )
            .reduce((sum, t) => sum + t.progress, 0)) /
          activeItems,
      );
    }

    return summary;
  }

  /**
   * 验证状态转换是否有效
   */
  private validateStatusTransition(
    from: ResearchTodoStatus,
    to: ResearchTodoStatus,
  ): void {
    const validTransitions: Record<ResearchTodoStatus, ResearchTodoStatus[]> = {
      [ResearchTodoStatus.PENDING]: [
        ResearchTodoStatus.QUEUED,
        ResearchTodoStatus.CANCELLED,
      ],
      [ResearchTodoStatus.QUEUED]: [
        ResearchTodoStatus.IN_PROGRESS,
        ResearchTodoStatus.CANCELLED,
      ],
      [ResearchTodoStatus.IN_PROGRESS]: [
        ResearchTodoStatus.PAUSED,
        ResearchTodoStatus.COMPLETED,
        ResearchTodoStatus.FAILED,
      ],
      [ResearchTodoStatus.PAUSED]: [
        ResearchTodoStatus.IN_PROGRESS,
        ResearchTodoStatus.CANCELLED,
      ],
      [ResearchTodoStatus.COMPLETED]: [],
      [ResearchTodoStatus.FAILED]: [ResearchTodoStatus.QUEUED],
      [ResearchTodoStatus.CANCELLED]: [],
    };

    if (!validTransitions[from]?.includes(to)) {
      throw new BadRequestException(
        `Invalid status transition from ${from} to ${to}`,
      );
    }
  }

  /**
   * 格式化 TODO 用于客户端
   */
  private formatTodoForClient(todo: ResearchTodo): any {
    return {
      id: todo.id,
      topicId: todo.topicId,
      missionId: todo.missionId,
      type: todo.type,
      title: todo.title,
      description: todo.description,
      dimensionId: todo.dimensionId,
      dimensionName: todo.dimensionName,
      agentId: todo.agentId,
      agentName: todo.agentName,
      agentRole: todo.agentRole,
      status: todo.status,
      progress: todo.progress,
      statusMessage: todo.statusMessage,
      priority: todo.priority,
      dependsOn: todo.dependsOn,
      startedAt: todo.startedAt?.toISOString(),
      completedAt: todo.completedAt?.toISOString(),
      estimatedMs: todo.estimatedMs,
      actualMs: todo.actualMs,
      result: todo.result,
      userCanPause: todo.userCanPause,
      userCanCancel: todo.userCanCancel,
      userCanPrioritize: todo.userCanPrioritize,
      createdAt: todo.createdAt.toISOString(),
      updatedAt: todo.updatedAt.toISOString(),
    };
  }

  /**
   * 发送 TODO 事件到 WebSocket
   */
  private async emitTodoEvent(
    topicId: string,
    event: TodoEventType,
    data: any,
  ): Promise<void> {
    await this.eventEmitter.emitToTopic(topicId, event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }
}
