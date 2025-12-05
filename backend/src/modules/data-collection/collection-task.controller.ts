import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import {
  CollectionTaskService,
  CreateCollectionTaskDto,
  UpdateCollectionTaskDto,
} from "./collection-task.service";
import { CollectionTaskStatus, CollectionTaskType } from "@prisma/client";

@Controller("data-collection/tasks")
export class CollectionTaskController {
  constructor(private readonly taskService: CollectionTaskService) {}

  /**
   * 创建采集任务
   * POST /data-collection/tasks
   */
  @Post()
  async create(@Body() dto: CreateCollectionTaskDto) {
    const task = await this.taskService.create(dto);
    return {
      success: true,
      data: task,
    };
  }

  /**
   * 获取所有任务
   * GET /data-collection/tasks
   */
  @Get()
  async findAll(
    @Query("status") status?: CollectionTaskStatus,
    @Query("type") type?: CollectionTaskType,
    @Query("sourceId") sourceId?: string,
    @Query("limit") limit?: string,
  ) {
    const tasks = await this.taskService.findAll({
      status,
      type,
      sourceId,
      limit: limit ? parseInt(limit) : undefined,
    });
    return {
      success: true,
      data: tasks,
      total: tasks.length,
    };
  }

  /**
   * 获取运行中的任务
   * GET /data-collection/tasks/running
   */
  @Get("running")
  async getRunning() {
    const tasks = await this.taskService.getRunningTasks();
    return {
      success: true,
      data: tasks,
      total: tasks.length,
    };
  }

  /**
   * 获取待执行的任务
   * GET /data-collection/tasks/pending
   */
  @Get("pending")
  async getPending() {
    const tasks = await this.taskService.getPendingTasks();
    return {
      success: true,
      data: tasks,
      total: tasks.length,
    };
  }

  /**
   * 获取单个任务
   * GET /data-collection/tasks/:id
   */
  @Get(":id")
  async findOne(@Param("id") id: string) {
    const task = await this.taskService.findOne(id);
    return {
      success: true,
      data: task,
    };
  }

  /**
   * 更新任务
   * PUT /data-collection/tasks/:id
   */
  @Put(":id")
  async update(@Param("id") id: string, @Body() dto: UpdateCollectionTaskDto) {
    const task = await this.taskService.update(id, dto);
    return {
      success: true,
      data: task,
    };
  }

  /**
   * 删除任务
   * DELETE /data-collection/tasks/:id
   */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string) {
    await this.taskService.remove(id);
  }

  /**
   * 执行任务
   * POST /data-collection/tasks/:id/execute
   *
   * 注意：任务会在后台异步执行，不会阻塞响应
   * 前端应通过轮询 GET /tasks/:id 获取任务进度
   */
  @Post(":id/execute")
  async execute(@Param("id") id: string) {
    // 先验证任务存在
    await this.taskService.findOne(id);

    // 异步执行任务，不等待完成
    // 使用 setImmediate 确保响应先返回
    setImmediate(() => {
      this.taskService.execute(id).catch((error) => {
        console.error(`Task ${id} execution failed:`, error);
      });
    });

    return {
      success: true,
      message: "Task execution started",
    };
  }

  /**
   * 暂停任务
   * POST /data-collection/tasks/:id/pause
   */
  @Post(":id/pause")
  async pause(@Param("id") id: string) {
    const task = await this.taskService.pause(id);
    return {
      success: true,
      data: task,
    };
  }

  /**
   * 恢复任务
   * POST /data-collection/tasks/:id/resume
   */
  @Post(":id/resume")
  async resume(@Param("id") id: string) {
    const task = await this.taskService.resume(id);
    return {
      success: true,
      data: task,
    };
  }

  /**
   * 取消任务
   * POST /data-collection/tasks/:id/cancel
   */
  @Post(":id/cancel")
  async cancel(@Param("id") id: string) {
    const task = await this.taskService.cancel(id);
    return {
      success: true,
      data: task,
    };
  }
}
