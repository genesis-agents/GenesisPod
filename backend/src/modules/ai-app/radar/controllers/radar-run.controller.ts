import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  DefaultValuePipe,
  Get,
  Logger,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { RadarRunStatus, RadarRunTrigger } from "@prisma/client";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import type { RequestWithUser } from "../../../../common/types/express-request.types";
import { TriggerRefreshDto } from "../dto";
import { RADAR_SCHEDULER_DEFAULTS } from "../radar.constants";
import { RadarCollectService } from "../services/collect/radar-collect.service";
import { RadarTopicService } from "../services/topic/radar-topic.service";

/**
 * RadarRunController
 *
 * 历史 run 查询（GET）+ 手动触发刷新（POST）。
 * PR-R2 接通：手动 refresh 走 RadarCollectService 同步执行（pull only，无 AI score）。
 * PR-R3 会把 RadarCollectService 替换为 RadarPipelineDispatcher（含 8 个 AI stage）。
 */
@Controller("radar")
@UseGuards(JwtAuthGuard)
export class RadarRunController {
  private readonly log = new Logger(RadarRunController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly topics: RadarTopicService,
    private readonly collect: RadarCollectService,
  ) {}

  @Get("topics/:topicId/runs")
  async list(
    @Request() req: RequestWithUser,
    @Param("topicId") topicId: string,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    await this.topics.getOwnedById(req.user.id, topicId);
    const cap = Math.min(Math.max(limit, 1), 100);
    return this.prisma.radarRun.findMany({
      where: { topicId },
      orderBy: { startedAt: "desc" },
      take: cap,
    });
  }

  /**
   * 手动触发一次刷新（同步执行 + 返回 run summary）。
   *
   * dedup window：5 秒内重复 POST 直接 409 返回正在运行的 run。
   */
  @Post("topics/:topicId/refresh")
  async refresh(
    @Request() req: RequestWithUser,
    @Param("topicId") topicId: string,
    @Body() _dto: TriggerRefreshDto,
  ) {
    const topic = await this.topics.getOwnedById(req.user.id, topicId);
    if (topic.status !== "ACTIVE") {
      throw new BadRequestException(
        `主题处于 ${topic.status} 状态，无法刷新，请先 resume`,
      );
    }
    // dedup window
    const windowAgo = new Date(
      Date.now() - RADAR_SCHEDULER_DEFAULTS.manualDedupSeconds * 1000,
    );
    const recent = await this.prisma.radarRun.findFirst({
      where: {
        topicId,
        status: { in: [RadarRunStatus.PENDING, RadarRunStatus.RUNNING] },
      },
      orderBy: { startedAt: "desc" },
    });
    if (recent) {
      throw new ConflictException({
        message: "已有 run 正在执行，请稍候",
        runId: recent.id,
        status: recent.status,
      });
    }
    const recentCompleted = await this.prisma.radarRun.findFirst({
      where: {
        topicId,
        startedAt: { gte: windowAgo },
      },
      orderBy: { startedAt: "desc" },
    });
    if (recentCompleted) {
      throw new ConflictException({
        message: `请稍后再试（${RADAR_SCHEDULER_DEFAULTS.manualDedupSeconds}s 内不可重复触发）`,
        runId: recentCompleted.id,
        status: recentCompleted.status,
      });
    }

    const summary = await this.collect.runRefresh(
      topicId,
      RadarRunTrigger.MANUAL,
      { userId: req.user.id },
    );
    this.log.log(
      `Manual refresh topic=${topicId} run=${summary.runId} inserted=${summary.itemsInserted}/${summary.itemsFetched}`,
    );
    return summary;
  }

  @Post("runs/:runId/cancel")
  async cancel(@Request() req: RequestWithUser, @Param("runId") runId: string) {
    const run = await this.prisma.radarRun.findUnique({
      where: { id: runId },
      include: { topic: true },
    });
    if (!run) throw new BadRequestException("Run not found");
    if (run.topic.userId !== req.user.id) {
      throw new BadRequestException("Not owner");
    }
    if (run.status !== RadarRunStatus.RUNNING) {
      throw new BadRequestException(
        `Run in status=${run.status}, cannot cancel`,
      );
    }
    // PR-R2 同步执行模式下，cancel 等于"标记为 CANCELLED"。
    // PR-R4 引入 fire-and-forget 后会接入 AbortController 真停。
    return this.prisma.radarRun.update({
      where: { id: runId },
      data: {
        status: RadarRunStatus.CANCELLED,
        completedAt: new Date(),
      },
    });
  }
}
