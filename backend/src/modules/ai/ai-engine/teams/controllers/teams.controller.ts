/**
 * AI Engine - Teams Controller
 * 团队 API 控制器
 *
 * 提供 REST API 端点：
 * - GET  /api/ai/teams           - 获取所有团队
 * - GET  /api/ai/teams/:id       - 获取团队详情
 * - POST /api/ai/teams/missions  - 创建并执行任务
 * - GET  /api/ai/teams/missions/:id        - 获取任务状态
 * - GET  /api/ai/teams/missions/:id/result - 获取任务结果
 * - POST /api/ai/teams/missions/:id/cancel - 取消任务
 * - POST /api/ai/teams/missions/stream     - 流式执行任务 (SSE)
 */

import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Res,
  HttpStatus,
  Logger,
  BadRequestException,
} from "@nestjs/common";
import { Response } from "express";
import {
  TeamsService,
  CreateMissionDto,
  MissionStatus,
  TeamInfo,
} from "../services/teams.service";
import { MissionResult } from "../abstractions/mission.interface";

// ==================== Request DTOs ====================

/**
 * 创建任务请求体
 */
class CreateMissionRequestDto {
  teamId!: string;
  goal!: string;
  context?: string;
  constraints?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// ==================== Response DTOs ====================

/**
 * 团队列表响应
 */
interface TeamsListResponse {
  success: boolean;
  data: TeamInfo[];
  total: number;
}

/**
 * 团队详情响应
 */
interface TeamDetailResponse {
  success: boolean;
  data: TeamInfo;
}

/**
 * 任务创建响应
 */
interface MissionCreatedResponse {
  success: boolean;
  missionId: string;
  message: string;
}

/**
 * 任务状态响应
 */
interface MissionStatusResponse {
  success: boolean;
  data: MissionStatus;
}

/**
 * 任务结果响应
 */
interface MissionResultResponse {
  success: boolean;
  data: MissionResult;
}

// ==================== Controller ====================

@Controller("api/ai/teams")
export class TeamsController {
  private readonly logger = new Logger(TeamsController.name);

  constructor(private readonly teamsService: TeamsService) {}

  // ==================== 团队管理 ====================

  /**
   * 获取所有可用团队
   * GET /api/ai/teams
   */
  @Get()
  listTeams(): TeamsListResponse {
    this.logger.log("Listing all teams");
    const teams = this.teamsService.listTeams();
    return {
      success: true,
      data: teams,
      total: teams.length,
    };
  }

  /**
   * 获取团队详情
   * GET /api/ai/teams/:id
   */
  @Get(":id")
  getTeam(@Param("id") id: string): TeamDetailResponse {
    this.logger.log(`Getting team: ${id}`);
    const team = this.teamsService.getTeam(id);
    return {
      success: true,
      data: team,
    };
  }

  // ==================== 任务执行 ====================

  /**
   * 创建并执行任务
   * POST /api/ai/teams/missions
   */
  @Post("missions")
  async createMission(
    @Body() dto: CreateMissionRequestDto,
  ): Promise<MissionCreatedResponse> {
    this.logger.log(`Creating mission for team: ${dto.teamId}`);

    // 验证必填字段
    if (!dto.teamId) {
      throw new BadRequestException("teamId is required");
    }
    if (!dto.goal) {
      throw new BadRequestException("goal is required");
    }

    const missionDto: CreateMissionDto = {
      teamId: dto.teamId,
      goal: dto.goal,
      context: dto.context,
      constraints: dto.constraints as CreateMissionDto["constraints"],
      metadata: dto.metadata,
    };

    const missionId = await this.teamsService.executeMission(missionDto);

    return {
      success: true,
      missionId,
      message: `Mission ${missionId} created and started`,
    };
  }

  /**
   * 流式执行任务 (Server-Sent Events)
   * POST /api/ai/teams/missions/stream
   */
  @Post("missions/stream")
  async streamMission(
    @Body() dto: CreateMissionRequestDto,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`Creating streaming mission for team: ${dto.teamId}`);

    // 验证必填字段
    if (!dto.teamId) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: "teamId is required",
      });
      return;
    }
    if (!dto.goal) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: "goal is required",
      });
      return;
    }

    // 设置 SSE 响应头
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const missionDto: CreateMissionDto = {
      teamId: dto.teamId,
      goal: dto.goal,
      context: dto.context,
      constraints: dto.constraints as CreateMissionDto["constraints"],
      metadata: dto.metadata,
    };

    try {
      const generator = this.teamsService.executeMissionStream(missionDto);

      for await (const event of generator) {
        // 发送 SSE 事件
        const eventData = JSON.stringify(event);
        res.write(`event: ${event.type}\n`);
        res.write(`data: ${eventData}\n\n`);

        // 如果是完成或失败事件，结束流
        if (
          event.type === "mission_completed" ||
          event.type === "mission_failed"
        ) {
          res.write(`event: done\n`);
          res.write(`data: {"type":"done"}\n\n`);
          break;
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Stream mission error: ${errorMessage}`);

      res.write(`event: error\n`);
      res.write(
        `data: ${JSON.stringify({ type: "error", error: errorMessage })}\n\n`,
      );
    } finally {
      res.end();
    }
  }

  /**
   * 获取任务状态
   * GET /api/ai/teams/missions/:id
   */
  @Get("missions/:id")
  getMissionStatus(@Param("id") id: string): MissionStatusResponse {
    this.logger.log(`Getting mission status: ${id}`);
    const status = this.teamsService.getMissionStatus(id);
    return {
      success: true,
      data: status,
    };
  }

  /**
   * 获取任务结果
   * GET /api/ai/teams/missions/:id/result
   */
  @Get("missions/:id/result")
  async getMissionResult(
    @Param("id") id: string,
  ): Promise<MissionResultResponse> {
    this.logger.log(`Getting mission result: ${id}`);
    const result = await this.teamsService.getMissionResult(id);
    return {
      success: true,
      data: result,
    };
  }

  /**
   * 取消任务
   * POST /api/ai/teams/missions/:id/cancel
   */
  @Post("missions/:id/cancel")
  cancelMission(@Param("id") id: string): {
    success: boolean;
    message: string;
  } {
    this.logger.log(`Cancelling mission: ${id}`);
    const cancelled = this.teamsService.cancelMission(id);
    return {
      success: cancelled,
      message: cancelled
        ? `Mission ${id} cancelled`
        : `Failed to cancel mission ${id}`,
    };
  }
}
