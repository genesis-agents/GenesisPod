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
  NotFoundException,
  BadRequestException,
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
import { TeamsService } from "../teams/services/teams.service";
import { TeamId } from "../teams/abstractions/team.interface";

@ApiTags("A2A Protocol")
@Controller()
export class A2AController {
  private readonly logger = new Logger(A2AController.name);

  constructor(
    private readonly agentCardRegistry: AgentCardRegistry,
    private readonly teamsService: TeamsService,
  ) {}

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

    // 映射 A2A skillId 到 teamId
    const teamId = this.mapSkillToTeam(request.skillId);
    if (!teamId) {
      this.logger.warn(`No team mapping for skill: ${request.skillId}`);
      return {
        taskId: this.generateTaskId(),
        status: A2ATaskStatus.FAILED,
        error: {
          code: "SKILL_NOT_IMPLEMENTED",
          message: `Skill '${request.skillId}' is not yet implemented`,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    try {
      // 创建任务通过 TeamsService
      const missionId = await this.teamsService.executeMission({
        teamId,
        goal: request.input.content,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        context: request.config?.context ?? "",
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        constraints: request.config?.constraints,
        metadata: {
          ...(request.metadata ?? {}),
          a2aSkillId: request.skillId,
          webhookUrl: request.config?.webhookUrl,
        },
      });

      this.logger.log(
        `A2A task created: ${missionId} for skill: ${request.skillId}`,
      );

      return {
        taskId: missionId,
        status: A2ATaskStatus.PENDING,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `Failed to create A2A task for skill ${request.skillId}: ${error instanceof Error ? error.message : String(error)}`,
      );

      return {
        taskId: this.generateTaskId(),
        status: A2ATaskStatus.FAILED,
        error: {
          code: "TASK_CREATION_FAILED",
          message:
            error instanceof Error ? error.message : "Unknown error occurred",
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
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

    try {
      // 获取任务状态
      const missionStatus = this.teamsService.getMissionStatus(taskId);

      // 映射状态
      const a2aStatus = this.mapMissionStatusToA2A(missionStatus.status);

      // 尝试从团队ID推断skillId
      let skillId = "unknown-skill";
      try {
        // 如果任务已完成或失败，可以从result获取metadata
        if (
          a2aStatus === A2ATaskStatus.COMPLETED ||
          a2aStatus === A2ATaskStatus.FAILED
        ) {
          const missionResult =
            await this.teamsService.getMissionResult(taskId);
          skillId =
            (missionResult.metadata?.a2aSkillId as string) ??
            this.reverseMapTeamToSkill(missionStatus.teamId);
        } else {
          // 对于进行中的任务，根据teamId反向推断
          skillId = this.reverseMapTeamToSkill(missionStatus.teamId);
        }
      } catch {
        // Fallback to team-based mapping
        skillId = this.reverseMapTeamToSkill(missionStatus.teamId);
      }

      // 基础响应
      const response: A2ATaskStatusResponse = {
        taskId,
        skillId,
        status: a2aStatus,
        createdAt: missionStatus.startTime.toISOString(),
        updatedAt: (missionStatus.endTime ?? new Date()).toISOString(),
      };

      // 如果任务已完成，获取结果
      if (a2aStatus === A2ATaskStatus.COMPLETED) {
        try {
          const missionResult =
            await this.teamsService.getMissionResult(taskId);
          response.result = {
            content: missionResult.summary,
            mode: "text/markdown",
            data: {
              deliverables: missionResult.deliverables,
              statistics: missionResult.statistics,
            },
            metadata: {
              duration: missionResult.duration,
              tokenUsage: {
                input: 0, // MissionResult doesn't track input/output separately
                output: 0,
                total: missionResult.tokensUsed,
              },
            },
          };
        } catch (error) {
          this.logger.warn(
            `Failed to fetch result for completed task ${taskId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      // 如果任务失败，添加错误信息
      if (a2aStatus === A2ATaskStatus.FAILED && missionStatus.error) {
        response.error = {
          code: "MISSION_FAILED",
          message: missionStatus.error,
        };
      }

      return response;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        (error instanceof Error && error.message.includes("not found"))
      ) {
        throw new NotFoundException(`Task ${taskId} not found`);
      }

      this.logger.error(
        `Failed to get status for task ${taskId}: ${error instanceof Error ? error.message : String(error)}`,
      );

      throw new BadRequestException(
        `Failed to retrieve task status: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * 生成任务ID
   */
  private generateTaskId(): string {
    return `a2a_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 映射 A2A Skill ID 到 Team ID
   */
  private mapSkillToTeam(skillId: string): TeamId | null {
    const skillToTeamMap: Record<string, TeamId> = {
      "deep-research": "research" as TeamId,
      "ai-ask": "research" as TeamId, // Use research team for Q&A
      "team-debate": "debate" as TeamId,
      "document-generation": "report" as TeamId,
      "ai-writing": "report" as TeamId, // Use report team for long-form writing
    };

    return skillToTeamMap[skillId] || null;
  }

  /**
   * 反向映射 Team ID 到 A2A Skill ID (best guess)
   */
  private reverseMapTeamToSkill(teamId: TeamId): string {
    const teamToSkillMap: Record<string, string> = {
      research: "deep-research",
      debate: "team-debate",
      report: "document-generation",
    };

    return teamToSkillMap[teamId] ?? "unknown-skill";
  }

  /**
   * 映射 Mission Status 到 A2A Task Status
   */
  private mapMissionStatusToA2A(
    status: "pending" | "running" | "completed" | "failed" | "cancelled",
  ): A2ATaskStatus {
    switch (status) {
      case "pending":
        return A2ATaskStatus.PENDING;
      case "running":
        return A2ATaskStatus.RUNNING;
      case "completed":
        return A2ATaskStatus.COMPLETED;
      case "failed":
        return A2ATaskStatus.FAILED;
      case "cancelled":
        return A2ATaskStatus.CANCELLED;
      default:
        return A2ATaskStatus.PENDING;
    }
  }
}
