/**
 * AI Agents Controller
 * 统一 Agent API 入口
 */

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Sse,
  Logger,
  Req,
  MessageEvent,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from "@nestjs/swagger";
import { Observable, map, catchError, of } from "rxjs";
import { AgentOrchestrator } from "../../ai-harness/kernel/registry/agent-orchestrator";
import { AgentRegistry } from "../../ai-harness/kernel/registry/plan-based-agent-registry";
import {
  AgentId,
  BUILTIN_AGENTS,
  BuiltinAgentId,
  AgentInput,
} from "../../ai-engine/core/types/agent.types";
import { AgentsService } from "./agents.service";
import {
  ExecuteRequestDto,
  ExecuteResponseDto,
  TaskResponseDto,
  AgentsResponseDto,
  TemplatesResponseDto,
  StatusReportResponseDto,
  ArtifactsResponseDto,
  CancelResponseDto,
} from "./dto";

interface AuthenticatedRequest {
  user: { id: string; email: string };
}

@ApiTags("AI Agents")
@Controller("agents")
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
  @ApiOperation({
    summary: "获取所有可用的 Agent",
    description: "返回系统中所有已注册的 AI Agent 配置信息",
  })
  @ApiResponse({
    status: 200,
    description: "成功获取 Agent 列表",
    type: AgentsResponseDto,
  })
  async getAgents(): Promise<AgentsResponseDto> {
    const configs = this.agentRegistry.getAllConfigs();
    return { agents: configs };
  }

  /**
   * 获取 Agent 状态报告
   */
  @Get("status")
  @ApiOperation({
    summary: "获取 Agent 状态报告",
    description: "获取所有 Agent 的运行状态和统计信息",
  })
  @ApiResponse({
    status: 200,
    description: "成功获取状态报告",
    type: StatusReportResponseDto,
  })
  async getStatus(): Promise<StatusReportResponseDto> {
    const report = this.orchestrator.getStatusReport();
    const agentStats = this.agentRegistry.getStats();
    const totalTasks = Object.values(agentStats.byId).reduce(
      (sum, s: { executions: number; errors: number }) => sum + s.executions,
      0,
    );
    return {
      agents: report,
      stats: {
        registeredAgents: agentStats.total,
        availableTools: 0, // ToolRegistry not injected here; use facade layer for full stats
        totalTasks,
      },
    };
  }

  /**
   * 获取指定 Agent 的模板
   */
  @Get(":type/templates")
  @ApiOperation({
    summary: "获取指定 Agent 的模板",
    description: "获取指定 Agent 类型的所有可用模板",
  })
  @ApiParam({
    name: "type",
    description: "Agent 类型（小写）",
    enum: ["slides", "docs", "designer"],
    example: "slides",
  })
  @ApiResponse({
    status: 200,
    description: "成功获取模板列表",
    type: TemplatesResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "无效的 Agent 类型",
  })
  async getTemplates(
    @Param("type") type: string,
  ): Promise<TemplatesResponseDto> {
    const agentId = type.toLowerCase();
    if (!Object.values(BUILTIN_AGENTS).includes(agentId as BuiltinAgentId)) {
      throw new HttpException("Invalid agent type", HttpStatus.BAD_REQUEST);
    }

    if (!this.agentRegistry.has(agentId)) {
      return { templates: [] };
    }

    const agent = this.agentRegistry.get(agentId);
    return { templates: agent.getTemplates() };
  }

  /**
   * 执行 Agent 任务
   */
  @Post("execute")
  @ApiOperation({
    summary: "执行 Agent 任务",
    description: "创建并执行一个 AI Agent 任务，支持文件、URL 和资源引用",
  })
  @ApiResponse({
    status: 201,
    description: "任务创建成功",
    type: ExecuteResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "请求参数错误",
  })
  @ApiResponse({
    status: 401,
    description: "未授权",
  })
  async execute(
    @Body() body: ExecuteRequestDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ExecuteResponseDto> {
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
      agentId: body.agentId,
      input,
    });

    // 异步执行任务
    void this.executeTaskAsync(task.id, input, body.agentId, userId);

    return {
      taskId: task.id,
      status: "pending",
    };
  }

  /**
   * 获取任务状态
   */
  @Get("tasks/:taskId")
  @ApiOperation({
    summary: "获取任务状态",
    description: "获取指定任务的详细信息和执行状态",
  })
  @ApiParam({
    name: "taskId",
    description: "任务 ID",
    example: "clxxxx12345",
  })
  @ApiResponse({
    status: 200,
    description: "成功获取任务信息",
    type: TaskResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "任务不存在",
  })
  async getTask(@Param("taskId") taskId: string): Promise<TaskResponseDto> {
    const task = await this.agentsService.getTask(taskId);
    if (!task) {
      throw new HttpException("Task not found", HttpStatus.NOT_FOUND);
    }
    return task as unknown as TaskResponseDto;
  }

  /**
   * 任务进度 SSE 流
   */
  @Sse("tasks/:taskId/stream")
  @ApiOperation({
    summary: "任务进度流",
    description: "通过 Server-Sent Events (SSE) 实时获取任务执行进度",
  })
  @ApiParam({
    name: "taskId",
    description: "任务 ID",
    example: "clxxxx12345",
  })
  @ApiResponse({
    status: 200,
    description: "SSE 流连接成功",
  })
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
  @ApiOperation({
    summary: "取消任务",
    description: "取消正在执行或等待中的任务",
  })
  @ApiParam({
    name: "taskId",
    description: "任务 ID",
    example: "clxxxx12345",
  })
  @ApiResponse({
    status: 200,
    description: "取消操作完成",
    type: CancelResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "任务不存在",
  })
  async cancelTask(
    @Param("taskId") taskId: string,
  ): Promise<CancelResponseDto> {
    const success = await this.agentsService.cancelTask(taskId);
    return { success };
  }

  /**
   * 获取任务产出物
   */
  @Get("tasks/:taskId/artifacts")
  @ApiOperation({
    summary: "获取任务产出物",
    description: "获取任务生成的所有产出物列表",
  })
  @ApiParam({
    name: "taskId",
    description: "任务 ID",
    example: "clxxxx12345",
  })
  @ApiResponse({
    status: 200,
    description: "成功获取产出物列表",
    type: ArtifactsResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "任务不存在",
  })
  async getArtifacts(
    @Param("taskId") taskId: string,
  ): Promise<ArtifactsResponseDto> {
    const artifacts = await this.agentsService.getArtifacts(taskId);
    return {
      artifacts: artifacts as unknown as ArtifactsResponseDto["artifacts"],
    };
  }

  /**
   * 下载产出物
   */
  @Get("artifacts/:artifactId/download")
  @ApiOperation({
    summary: "下载产出物",
    description: "下载指定的产出物文件",
  })
  @ApiParam({
    name: "artifactId",
    description: "产出物 ID",
    example: "clxxxx67890",
  })
  @ApiResponse({
    status: 200,
    description: "成功返回文件",
  })
  @ApiResponse({
    status: 404,
    description: "产出物不存在",
  })
  async downloadArtifact(
    @Param("artifactId") artifactId: string,
  ): Promise<{ url: string | null; name: string; mimeType: string }> {
    return this.agentsService.getArtifactDownload(artifactId);
  }

  /**
   * 异步执行任务
   */
  private async executeTaskAsync(
    taskId: string,
    input: AgentInput,
    agentId?: AgentId,
    userId?: string,
  ): Promise<void> {
    try {
      await this.agentsService.updateTaskStatus(taskId, "PLANNING");

      for await (const event of this.orchestrator.execute(
        input,
        agentId,
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
