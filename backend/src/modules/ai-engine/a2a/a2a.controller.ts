/**
 * A2A Controller
 * Agent-to-Agent Protocol 端点实现
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Logger,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiSecurity,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../../../common/decorators/public.decorator";
import { A2AApiKeyGuard } from "./guards/a2a-api-key.guard";
import { AgentCardRegistry } from "./agent-card/agent-card.registry";
import {
  A2AAgentCard,
  A2ATaskRequest,
  A2ATaskResponse,
  A2ATaskStatusResponse,
  A2ATaskStatus,
} from "./abstractions/a2a.interface";

@ApiTags("A2A Protocol")
@Controller()
export class A2AController {
  private readonly logger = new Logger(A2AController.name);

  constructor(private readonly agentCardRegistry: AgentCardRegistry) {}

  /**
   * Agent Discovery Endpoint
   * 公开端点，返回 Agent Card，用于外部 Agent 发现 Raven 能力
   *
   * 标准路径: /.well-known/agent.json
   */
  @Get(".well-known/agent.json")
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get Agent Card",
    description:
      "Returns the A2A Agent Card describing Raven AI Engine capabilities. This is a public discovery endpoint.",
  })
  @ApiResponse({
    status: 200,
    description: "Agent Card retrieved successfully",
    type: Object,
  })
  getAgentCard(): A2AAgentCard {
    this.logger.log("Agent Card requested");
    return this.agentCardRegistry.getAgentCard();
  }

  /**
   * Create Task Endpoint
   * 创建新的 A2A 任务
   *
   * 需要 API Key 认证
   * 限流: 30 请求/分钟
   */
  @Public()
  @Post("a2a/tasks")
  @UseGuards(A2AApiKeyGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBearerAuth()
  @ApiSecurity("X-API-Key")
  @ApiOperation({
    summary: "Create A2A Task",
    description:
      "Creates a new task for the specified skill. Requires API key authentication. Rate limit: 30 requests/minute.",
  })
  @ApiResponse({
    status: 202,
    description: "Task created and accepted for processing",
    type: Object,
  })
  @ApiResponse({
    status: 400,
    description: "Invalid request or unsupported skill",
  })
  @ApiResponse({
    status: 401,
    description: "Invalid or missing API key",
  })
  @ApiResponse({
    status: 429,
    description: "Too many requests",
  })
  async createTask(@Body() request: A2ATaskRequest): Promise<A2ATaskResponse> {
    this.logger.log(`Create task request for skill: ${request.skillId}`);

    // 验证技能是否存在
    const skill = this.agentCardRegistry.getSkillById(request.skillId);
    if (!skill) {
      this.logger.warn(`Invalid skill requested: ${request.skillId}`);
      return {
        taskId: this.generateTaskId(),
        status: A2ATaskStatus.FAILED,
        error: {
          code: "INVALID_SKILL",
          message: `Skill '${request.skillId}' not found`,
          details: {
            availableSkills: this.agentCardRegistry
              .getSkills()
              .map((s) => s.id),
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    // TODO: 实现实际的任务创建逻辑
    // 目前返回占位符响应
    const taskId = this.generateTaskId();
    this.logger.log(`Task created with ID: ${taskId}`);

    return {
      taskId,
      status: A2ATaskStatus.PENDING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get Task Status Endpoint
   * 查询任务状态
   *
   * 需要 API Key 认证
   * 限流: 60 请求/分钟
   */
  @Public()
  @Get("a2a/tasks/:taskId")
  @UseGuards(A2AApiKeyGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiSecurity("X-API-Key")
  @ApiOperation({
    summary: "Get Task Status",
    description:
      "Retrieves the current status and result of a task. Requires API key authentication. Rate limit: 60 requests/minute.",
  })
  @ApiResponse({
    status: 200,
    description: "Task status retrieved successfully",
    type: Object,
  })
  @ApiResponse({
    status: 401,
    description: "Invalid or missing API key",
  })
  @ApiResponse({
    status: 404,
    description: "Task not found",
  })
  @ApiResponse({
    status: 429,
    description: "Too many requests",
  })
  async getTaskStatus(
    @Param("taskId") taskId: string,
  ): Promise<A2ATaskStatusResponse> {
    this.logger.log(`Task status requested for: ${taskId}`);

    // TODO: 实现实际的任务状态查询逻辑
    // 目前返回占位符响应
    return {
      taskId,
      skillId: "unknown",
      status: A2ATaskStatus.PENDING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * 生成任务ID
   */
  private generateTaskId(): string {
    return `a2a_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
