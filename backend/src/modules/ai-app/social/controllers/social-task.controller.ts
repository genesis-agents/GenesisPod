import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import { SocialTaskService } from "../services/social-task.service";
import {
  CreateSocialTaskDto,
  RenameSocialTaskDto,
} from "../dto/create-social-task.dto";

interface AuthenticatedRequest {
  user?: { id?: string };
}

@Controller("ai-social/tasks")
@UseGuards(JwtAuthGuard)
export class SocialTaskController {
  constructor(private readonly taskService: SocialTaskService) {}

  @Post()
  async createTask(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateSocialTaskDto,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    return this.taskService.createTask(dto, userId);
  }

  @Get()
  async listTasks(
    @Req() req: AuthenticatedRequest,
    @Query("status") status?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    return this.taskService.listTasks(userId, {
      status,
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /** GET /ai-social/tasks/mission/:missionId/replay?since=<ts> — 累积事件水合（仿 playground replay） */
  @Get("mission/:missionId/replay")
  async replayMission(
    @Req() req: AuthenticatedRequest,
    @Param("missionId") missionId: string,
    @Query("since") since?: string,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    const sinceTs = since ? Number(since) : undefined;
    return this.taskService.getMissionReplay(
      missionId,
      userId,
      Number.isFinite(sinceTs as number) ? (sinceTs as number) : undefined,
    );
  }

  @Get(":id")
  async getTask(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    return this.taskService.getTask(id, userId);
  }

  @Delete(":id")
  async cancelTask(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    const result = await this.taskService.cancelTask(id, userId);
    return { success: true, ...result };
  }

  @Post(":id/retry")
  async retryTask(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    return this.taskService.retryTask(id, userId);
  }

  /** PATCH /ai-social/tasks/:id — 重命名任务（卡片「编辑」） */
  @Patch(":id")
  async renameTask(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: RenameSocialTaskDto,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    return this.taskService.renameTask(id, userId, dto.title);
  }
}
