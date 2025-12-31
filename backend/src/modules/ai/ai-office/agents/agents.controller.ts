/**
 * Agent Controller
 *
 * 统一的 Agent 执行入口
 * 支持 SSE 流式输出任务进度
 */

import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Res,
  Logger,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBody, ApiParam } from "@nestjs/swagger";
import { Response } from "express";
import { randomUUID } from "crypto";
import { AgentType, AgentTask, taskStore } from "./agents.types";
import { DocsOrchestratorService } from "../docs";
import { DesignerOrchestratorService } from "../designer";
import {
  SlidesOrchestratorService,
  GenerateInput,
  StreamEvent,
} from "../slides";

interface ExecuteAgentDto {
  prompt: string;
  title?: string;
  urls?: string[];
  resourceIds?: string[];
  options?: Record<string, any>;
  agentType?: AgentType;
}

@ApiTags("Agents")
@Controller("agents")
export class AgentsController {
  private readonly logger = new Logger(AgentsController.name);

  constructor(
    private readonly docsOrchestrator: DocsOrchestratorService,
    private readonly designerOrchestrator: DesignerOrchestratorService,
    private readonly slidesOrchestrator: SlidesOrchestratorService,
  ) {}

  /**
   * 执行 Agent 任务
   */
  @Post("execute")
  @ApiOperation({ summary: "Execute an agent task" })
  @ApiBody({ description: "Agent input parameters" })
  async executeAgent(
    @Body() body: ExecuteAgentDto,
  ): Promise<{ taskId: string; status: string }> {
    const taskId = randomUUID();
    const agentType = body.agentType || AgentType.DOCS;

    this.logger.log(
      `[executeAgent] Creating task ${taskId} for agent ${agentType}`,
    );

    // 创建任务记录
    const task: AgentTask = {
      id: taskId,
      agentType,
      status: "pending",
      input: {
        prompt: body.prompt,
        title: body.title,
        urls: body.urls,
        resourceIds: body.resourceIds,
        options: body.options,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    taskStore.tasks.set(taskId, task);
    taskStore.streams.set(taskId, []);

    // 异步启动生成
    this.runAgentTask(taskId, task).catch((error) => {
      this.logger.error(`[executeAgent] Task ${taskId} failed:`, error);
    });

    return { taskId, status: "pending" };
  }

  /**
   * 获取任务状态
   */
  @Get("tasks/:taskId")
  @ApiOperation({ summary: "Get task status" })
  @ApiParam({ name: "taskId", description: "Task ID" })
  async getTask(@Param("taskId") taskId: string): Promise<AgentTask> {
    const task = taskStore.tasks.get(taskId);
    if (!task) {
      throw new HttpException("Task not found", HttpStatus.NOT_FOUND);
    }
    return task;
  }

  /**
   * SSE 流式获取任务进度
   */
  @Get("tasks/:taskId/stream")
  @ApiOperation({ summary: "Stream task progress via SSE" })
  @ApiParam({ name: "taskId", description: "Task ID" })
  async streamTask(
    @Param("taskId") taskId: string,
    @Res() res: Response,
  ): Promise<void> {
    const task = taskStore.tasks.get(taskId);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    // 设置 SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    this.logger.log(`[streamTask] SSE connection opened for task ${taskId}`);

    // 发送已有的事件
    const existingEvents = taskStore.streams.get(taskId) || [];
    for (const event of existingEvents) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    // 如果任务已完成，直接关闭
    if (
      task.status === "completed" ||
      task.status === "failed" ||
      task.status === "cancelled"
    ) {
      res.end();
      return;
    }

    // 轮询新事件（简单实现，生产环境应使用 Redis Pub/Sub）
    const intervalId = setInterval(() => {
      const currentTask = taskStore.tasks.get(taskId);
      const events = taskStore.streams.get(taskId) || [];

      // 发送新事件
      for (let i = existingEvents.length; i < events.length; i++) {
        res.write(`data: ${JSON.stringify(events[i])}\n\n`);
      }
      existingEvents.length = events.length;

      // 检查是否完成
      if (
        currentTask?.status === "completed" ||
        currentTask?.status === "failed" ||
        currentTask?.status === "cancelled"
      ) {
        clearInterval(intervalId);
        res.end();
      }
    }, 100);

    // 处理客户端断开
    res.on("close", () => {
      this.logger.log(`[streamTask] SSE connection closed for task ${taskId}`);
      clearInterval(intervalId);
    });
  }

  /**
   * 取消任务
   */
  @Post("tasks/:taskId/cancel")
  @ApiOperation({ summary: "Cancel a running task" })
  @ApiParam({ name: "taskId", description: "Task ID" })
  async cancelTask(
    @Param("taskId") taskId: string,
  ): Promise<{ success: boolean }> {
    const task = taskStore.tasks.get(taskId);
    if (!task) {
      throw new HttpException("Task not found", HttpStatus.NOT_FOUND);
    }

    task.status = "cancelled";
    task.updatedAt = new Date();

    // 发送取消事件
    this.emitEvent(taskId, {
      type: "error",
      timestamp: new Date().toISOString(),
      taskId,
      data: { error: "Task cancelled by user" },
    });

    return { success: true };
  }

  /**
   * 获取任务产出物
   */
  @Get("tasks/:taskId/artifacts")
  @ApiOperation({ summary: "Get task artifacts" })
  @ApiParam({ name: "taskId", description: "Task ID" })
  async getArtifacts(
    @Param("taskId") taskId: string,
  ): Promise<{ artifacts: any[] }> {
    const task = taskStore.tasks.get(taskId);
    if (!task) {
      throw new HttpException("Task not found", HttpStatus.NOT_FOUND);
    }

    return { artifacts: task.result?.artifacts || [] };
  }

  // ============================================
  // 内部方法
  // ============================================

  /**
   * 运行 Agent 任务
   */
  private async runAgentTask(taskId: string, task: AgentTask): Promise<void> {
    task.status = "running";
    task.updatedAt = new Date();

    this.emitEvent(taskId, {
      type: "progress",
      timestamp: new Date().toISOString(),
      taskId,
      data: { phase: "starting", percentage: 0, message: "Starting..." },
    });

    try {
      switch (task.agentType) {
        case AgentType.DOCS:
          await this.runDocsAgent(taskId, task);
          break;
        case AgentType.DESIGNER:
          await this.runDesignerAgent(taskId, task);
          break;
        case AgentType.SLIDES:
          await this.runSlidesAgent(taskId, task);
          break;
        default:
          throw new Error(`Unsupported agent type: ${task.agentType}`);
      }

      task.status = "completed";
      task.completedAt = new Date();
      task.updatedAt = new Date();
    } catch (error: any) {
      this.logger.error(`[runAgentTask] Error:`, error);
      task.status = "failed";
      task.error = error.message;
      task.updatedAt = new Date();

      this.emitEvent(taskId, {
        type: "error",
        timestamp: new Date().toISOString(),
        taskId,
        data: { error: error.message },
      });
    }
  }

  /**
   * 运行 Docs Agent
   */
  private async runDocsAgent(taskId: string, task: AgentTask): Promise<void> {
    const input = task.input;
    const options = input.options || {};

    const stream = this.docsOrchestrator.generateDocsStream({
      prompt: input.prompt,
      title: input.title,
      documentType: options.documentType || "ARTICLE",
      detailLevel: options.detailLevel || 2,
      language: options.language || "zh-CN",
      urls: input.urls,
      resourceIds: input.resourceIds,
      userId: options.userId, // 传递 userId
    });

    return new Promise((resolve, reject) => {
      stream.subscribe({
        next: (event) => {
          // 转换事件格式
          const agentEvent = this.convertDocsEvent(taskId, event);
          this.emitEvent(taskId, agentEvent);

          // 如果完成，设置结果
          if (event.type === "complete" && event.result) {
            task.result = {
              documentId: event.result.docId,
              artifacts: [
                {
                  id: event.result.docId,
                  type: "document",
                  name: input.title || "文档",
                  url: `/api/ai-office/documents/${event.result.docId}`,
                },
              ],
              summary: `生成了 ${event.result.totalSections} 个章节，共 ${event.result.wordCount} 字`,
              duration: event.result.duration,
            };
          }
        },
        error: (err) => reject(err),
        complete: () => resolve(),
      });
    });
  }

  /**
   * 运行 Designer Agent
   */
  private async runDesignerAgent(
    taskId: string,
    task: AgentTask,
  ): Promise<void> {
    const input = task.input;
    const options = input.options || {};

    const stream = this.designerOrchestrator.generateDesignStream({
      prompt: input.prompt,
      title: input.title,
      designType: options.designType || "infographic",
      style: options.style || "consulting",
      aspectRatio: options.aspectRatio || "16:9",
      layout: options.templateLayout || "cards",
      language: options.language || "zh-CN",
      urls: input.urls,
      resourceIds: input.resourceIds,
      userId: options.userId, // 传递 userId
    });

    return new Promise((resolve, reject) => {
      stream.subscribe({
        next: (event) => {
          const agentEvent = this.convertDesignerEvent(taskId, event);
          this.emitEvent(taskId, agentEvent);

          if (event.type === "complete" && event.result) {
            task.result = {
              documentId: event.result.designId,
              artifacts: [
                {
                  id: event.result.designId,
                  type: "html",
                  name: input.title || "设计",
                  url: `/api/ai-office/documents/${event.result.designId}`,
                },
              ],
              summary: "设计生成完成",
              duration: event.result.duration,
            };
          }
        },
        error: (err) => reject(err),
        complete: () => resolve(),
      });
    });
  }

  /**
   * 运行 Slides Agent
   */
  private async runSlidesAgent(taskId: string, task: AgentTask): Promise<void> {
    const input = task.input;
    const options = input.options || {};

    // 使用 Slides API
    const generateInput: GenerateInput = {
      userId: options.userId || "anonymous",
      title: input.title || input.prompt?.slice(0, 50) || "演示文稿",
      sourceText: input.prompt || "",
      targetPages: options.slideCount || 8,
      stylePreference: "dark",
      themeId: options.themeId || "genspark-dark",
    };

    const stream = this.slidesOrchestrator.generateSlides(generateInput);

    return new Promise((resolve, reject) => {
      stream.subscribe({
        next: (event: StreamEvent) => {
          const agentEvent = this.convertPPTEvent(taskId, event);
          this.emitEvent(taskId, agentEvent);

          if (event.type === "complete" && event.data) {
            const eventData = event.data as Record<string, any>;
            task.result = {
              documentId: eventData.sessionId || event.sessionId,
              artifacts: [
                {
                  id: eventData.sessionId || event.sessionId,
                  type: "pptx",
                  name: input.title || "演示文稿",
                  url: `/api/ai-office/slides/sessions/${eventData.sessionId || event.sessionId}`,
                },
              ],
              summary: `生成了 ${eventData.totalPages || 0} 页幻灯片`,
              duration: eventData.totalDuration || 0,
            };
          }
        },
        error: (err: Error) => reject(err),
        complete: () => resolve(),
      });
    });
  }

  /**
   * 转换 Docs 事件
   */
  private convertDocsEvent(taskId: string, event: any): any {
    const base = {
      timestamp: event.timestamp,
      taskId,
    };

    switch (event.type) {
      case "progress":
        return {
          ...base,
          type: "progress",
          data: event.progress,
        };
      case "outline_complete":
        return {
          ...base,
          type: "plan_ready",
          data: { outline: event.outline },
        };
      case "section_start":
        return {
          ...base,
          type: "step_start",
          data: event.section,
        };
      case "section_complete":
        return {
          ...base,
          type: "step_complete",
          data: event.section,
        };
      case "complete":
        return {
          ...base,
          type: "complete",
          data: event.result,
        };
      case "error":
        return {
          ...base,
          type: "error",
          data: event.error,
        };
      default:
        return { ...base, type: event.type, data: event };
    }
  }

  /**
   * 转换 Designer 事件
   */
  private convertDesignerEvent(taskId: string, event: any): any {
    const base = {
      timestamp: event.timestamp,
      taskId,
    };

    switch (event.type) {
      case "progress":
        return {
          ...base,
          type: "progress",
          data: event.progress,
        };
      case "spec_complete":
        return {
          ...base,
          type: "plan_ready",
          data: { spec: event.spec },
        };
      case "render_complete":
        return {
          ...base,
          type: "artifact",
          data: event.design,
        };
      case "complete":
        return {
          ...base,
          type: "complete",
          data: event.result,
        };
      case "error":
        return {
          ...base,
          type: "error",
          data: event.error,
        };
      default:
        return { ...base, type: event.type, data: event };
    }
  }

  /**
   * 转换 PPT 事件 (StreamEvent)
   */
  private convertPPTEvent(taskId: string, event: StreamEvent): any {
    const base = {
      timestamp: event.timestamp || new Date().toISOString(),
      taskId,
    };
    const eventData = event.data as Record<string, any> | undefined;

    switch (event.type) {
      case "progress_update":
        return {
          ...base,
          type: "progress",
          data: {
            phase: eventData?.phase,
            percentage: eventData?.overallProgress || 0,
            message: eventData?.message,
          },
        };
      case "phase_completed":
        return {
          ...base,
          type: "plan_ready",
          data: { outline: eventData },
        };
      case "page_completed":
        return {
          ...base,
          type: "step_complete",
          data: {
            pageNumber: eventData?.pageNumber,
            html: eventData?.html,
          },
        };
      case "complete":
        return {
          ...base,
          type: "complete",
          data: eventData,
        };
      case "error":
        return {
          ...base,
          type: "error",
          data: { message: eventData?.message || "Unknown error" },
        };
      default:
        return { ...base, type: event.type, data: eventData };
    }
  }

  /**
   * 发送事件到流
   */
  private emitEvent(taskId: string, event: any): void {
    const events = taskStore.streams.get(taskId);
    if (events) {
      events.push(event);
    }
  }
}
