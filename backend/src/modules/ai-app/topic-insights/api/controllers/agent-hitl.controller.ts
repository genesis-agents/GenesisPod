/**
 * AgentHITLController — Human-In-The-Loop endpoints for SOTA agent runtime.
 *
 * 归属：L3 ai-app/topic-insights/api/controllers/
 *
 * 暴露：
 *   GET  /api/topic-insights/agent-hitl/missions/:missionId/paused   — list paused tasks
 *   POST /api/topic-insights/agent-hitl/tasks/:taskId/resume          — resume a paused task
 *   POST /api/topic-insights/agent-hitl/tasks/:taskId/inject          — inject observation (no resume)
 */

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import {
  ResearchHITLService,
  type PausedTaskSummary,
} from "../../agent/hitl/research-hitl.service";

export class ResumeTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  humanInput?: string;
}

export class InjectObservationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  content!: string;
}

@ApiTags("Topic Insights - Agent HITL")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("api/topic-insights/agent-hitl")
export class AgentHITLController {
  constructor(private readonly hitl: ResearchHITLService) {}

  @Get("missions/:missionId/paused")
  @ApiOperation({ summary: "列出一个 mission 下所有暂停等待人工干预的任务" })
  @ApiParam({ name: "missionId", description: "Mission ID" })
  @ApiResponse({ status: 200, description: "paused 任务列表" })
  async listPaused(
    @Param("missionId") missionId: string,
  ): Promise<{ tasks: PausedTaskSummary[] }> {
    const tasks = await this.hitl.listPausedTasks(missionId);
    return { tasks };
  }

  @Post("tasks/:taskId/resume")
  @ApiOperation({ summary: "恢复一个暂停的任务（可附加人工输入）" })
  @ApiParam({ name: "taskId", description: "Task ID" })
  @ApiResponse({ status: 200, description: "任务已进入 QUEUED 状态" })
  async resume(
    @Param("taskId") taskId: string,
    @Body() dto: ResumeTaskDto,
    @Request() req: { user?: { id?: string } },
  ): Promise<{ success: true }> {
    await this.hitl.resumeTask(taskId, {
      humanInput: dto.humanInput,
      resumedBy: req.user?.id,
    });
    return { success: true };
  }

  @Post("tasks/:taskId/inject")
  @ApiOperation({ summary: "向正在运行的任务注入观察（不改变状态）" })
  @ApiParam({ name: "taskId", description: "Task ID" })
  @ApiResponse({ status: 200, description: "观察已写入 agent_steps" })
  async inject(
    @Param("taskId") taskId: string,
    @Body() dto: InjectObservationDto,
  ): Promise<{ success: true }> {
    await this.hitl.injectObservation(taskId, dto.content);
    return { success: true };
  }
}
