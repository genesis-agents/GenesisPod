/**
 * Agents Controller
 * 统一 Agent API 入口
 */

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Sse,
  UseGuards,
  Logger,
  Req,
  MessageEvent,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Observable, map, catchError, of } from "rxjs";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { AgentOrchestrator } from "./core/agent.orchestrator";
import { AgentRegistry } from "./core/agent.registry";
import { AgentType, AgentInput, AgentConfig } from "./core/agent.types";
import { AgentsService } from "./agents.service";

/**
 * 执行请求 DTO
 */
interface ExecuteRequestDto {
  agentType?: AgentType;
  prompt: string;
  files?: Array<{
    id: string;
    name: string;
    mimeType: string;
    size: number;
    url?: string;
  }>;
  urls?: string[];
  resourceIds?: string[];
  templateId?: string;
  options?: Record<string, unknown>;
}

@Controller("agents")
@UseGuards(JwtAuthGuard)
export class AgentsController {
  private readonly logger = new Logger(AgentsController.name);

  constructor(
    private readonly orchestrator: AgentOrchestrator,
    private readonly agentRegistry: AgentRegistry,
    private readonly agentsService: AgentsService,
  ) {}

  /**
   * 获取所有可用的 Agent
   */
  @Get()
  async getAgents(): Promise<{ agents: AgentConfig[] }> {
    const configs = this.agentRegistry.getAllConfigs();
    return { agents: configs };
  }

  /**
   * 获取 Agent 状态报告
   */
  @Get("status")
  async getStatus(): Promise<Record<string, unknown>> {
    const report = this.orchestrator.getStatusReport();
    const agentStats = this.agentRegistry.getStats();
    return {
      agents: report,
      stats: agentStats,
    };
  }

  /**
   * 获取指定 Agent 的模板
   */
  @Get(":type/templates")
  async getTemplates(
    @Param("type") type: string,
  ): Promise<{ templates: unknown[] }> {
    const agentType = type.toUpperCase() as AgentType;
    if (!Object.values(AgentType).includes(agentType)) {
      throw new HttpException("Invalid agent type", HttpStatus.BAD_REQUEST);
    }

    if (!this.agentRegistry.has(agentType)) {
      return { templates: [] };
    }

    const agent = this.agentRegistry.get(agentType);
    return { templates: agent.getTemplates() };
  }

  /**
   * 执行 Agent 任务
   */
  @Post("execute")
  async execute(
    @Body() body: ExecuteRequestDto,
    @Req() req: any,
  ): Promise<{ taskId: string; status: string }> {
    const userId = req.user?.id;

    // 构建 Agent 输入
    const input: AgentInput = {
      prompt: body.prompt,
      files: body.files,
      urls: body.urls,
      resourceIds: body.resourceIds,
      templateId: body.templateId,
      options: body.options,
    };

    // 创建任务记录
    const task = await this.agentsService.createTask({
      userId,
      agentType: body.agentType,
      input,
    });

    // 异步执行任务
    this.executeTaskAsync(task.id, input, body.agentType, userId);

    return {
      taskId: task.id,
      status: "pending",
    };
  }

  /**
   * 获取任务状态
   */
  @Get("tasks/:taskId")
  async getTask(@Param("taskId") taskId: string): Promise<unknown> {
    const task = await this.agentsService.getTask(taskId);
    if (!task) {
      throw new HttpException("Task not found", HttpStatus.NOT_FOUND);
    }
    return task;
  }

  /**
   * 任务进度 SSE 流
   */
  @Sse("tasks/:taskId/stream")
  streamTask(@Param("taskId") taskId: string): Observable<MessageEvent> {
    return this.agentsService.getTaskStream(taskId).pipe(
      map((event) => ({
        data: JSON.stringify(event),
      })),
      catchError((error) => {
        this.logger.error(`Stream error: ${error.message}`);
        return of({
          data: JSON.stringify({ type: "error", error: error.message }),
        });
      }),
    );
  }

  /**
   * 取消任务
   */
  @Post("tasks/:taskId/cancel")
  async cancelTask(
    @Param("taskId") taskId: string,
  ): Promise<{ success: boolean }> {
    const success = await this.agentsService.cancelTask(taskId);
    return { success };
  }

  /**
   * 获取任务产出物
   */
  @Get("tasks/:taskId/artifacts")
  async getArtifacts(
    @Param("taskId") taskId: string,
  ): Promise<{ artifacts: unknown[] }> {
    const artifacts = await this.agentsService.getArtifacts(taskId);
    return { artifacts };
  }

  /**
   * 下载产出物
   */
  @Get("artifacts/:artifactId/download")
  async downloadArtifact(
    @Param("artifactId") artifactId: string,
  ): Promise<any> {
    return this.agentsService.getArtifactDownload(artifactId);
  }

  /**
   * 异步执行任务
   */
  private async executeTaskAsync(
    taskId: string,
    input: AgentInput,
    agentType?: AgentType,
    userId?: string,
  ): Promise<void> {
    try {
      await this.agentsService.updateTaskStatus(taskId, "PLANNING");

      for await (const event of this.orchestrator.execute(
        input,
        agentType,
        userId,
      )) {
        // 发布事件到 SSE 流
        this.agentsService.publishEvent(taskId, event);

        // 更新任务状态
        if (event.type === "plan_ready") {
          await this.agentsService.updateTaskStatus(taskId, "EXECUTING");
          await this.agentsService.updateTaskPlan(taskId, event.plan);
        }

        if (event.type === "artifact") {
          await this.agentsService.saveArtifact(taskId, event.artifact);
        }

        if (event.type === "complete") {
          await this.agentsService.updateTaskStatus(taskId, "COMPLETED");
          await this.agentsService.updateTaskResult(taskId, event.result);
        }

        if (event.type === "error") {
          await this.agentsService.updateTaskStatus(
            taskId,
            "FAILED",
            event.error,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Task execution error: ${error}`);
      await this.agentsService.updateTaskStatus(
        taskId,
        "FAILED",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }
}
