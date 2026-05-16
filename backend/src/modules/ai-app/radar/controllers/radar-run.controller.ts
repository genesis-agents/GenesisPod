import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  DefaultValuePipe,
  Get,
  Logger,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { RadarRunStatus, RadarRunTrigger } from "@prisma/client";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import {
  RateLimit,
  RateLimitGuard,
} from "../../../../common/guards/rate-limit.guard";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import type { RequestWithUser } from "../../../../common/types/express-request.types";
import { TriggerRefreshDto } from "../dto";
import { RadarCollectService } from "../services/collect/radar-collect.service";
import { RadarTopicService } from "../services/topic/radar-topic.service";

/**
 * RadarRunController (PR-R5 + R6 整改)
 *
 * 历史 run 查询（GET）+ 手动触发刷新（POST）。
 *
 * - refresh: 走 RadarCollectService.runRefresh，完整 collect → AI pipeline → insight
 *   链路，dedup 在 service 层走 transaction 原子化（防 findFirst→create 之间的 race）。
 * - cancel:  标记 CANCELLED（同步执行模式下等于 race 后兜底；fire-and-forget 模式
 *   需要接 AbortController 真停，列入后续 follow-up）。
 *
 * RateLimit: 用户主动 endpoint 走 10/60s（参考 feedback_user_action_rate_limits_loose
 * 30/60s 起步，refresh 因带 LLM 暴账风险收紧到 10/60s）；recommend 同档。
 */
@Controller("radar")
@UseGuards(JwtAuthGuard, RateLimitGuard)
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
   * 防滥用三件套：
   * 1. RateLimit 10/60s/user（控制器层）
   * 2. RadarCollectService.runRefresh 内部用 $transaction 创建 run，
   *    findFirst-inflight + create 在同事务里执行（防 controller 层 race）
   * 3. 5s dedup window 拒绝刚完成的 run（防双击）
   */
  @Post("topics/:topicId/refresh")
  @RateLimit({
    maxRequests: 10,
    windowSeconds: 60,
    message: "刷新过于频繁，请稍候再试",
  })
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
    try {
      const summary = await this.collect.runRefresh(
        topicId,
        RadarRunTrigger.MANUAL,
        { userId: req.user.id, dedupSeconds: 5 },
      );
      this.log.log(
        `Manual refresh topic=${topicId} run=${summary.runId} inserted=${summary.itemsInserted}/${summary.itemsFetched}`,
      );
      return summary;
    } catch (err) {
      if (err instanceof ConflictException) throw err;
      throw err;
    }
  }

  @Post("runs/:runId/cancel")
  async cancel(@Request() req: RequestWithUser, @Param("runId") runId: string) {
    const run = await this.prisma.radarRun.findUnique({
      where: { id: runId },
      include: { topic: true },
    });
    if (!run) throw new NotFoundException("Run not found");
    if (run.topic.userId !== req.user.id) {
      throw new NotFoundException("Run not found");
    }
    if (run.status !== RadarRunStatus.RUNNING) {
      throw new BadRequestException(
        `Run in status=${run.status}, cannot cancel`,
      );
    }
    // 同步执行模式下，cancel 等于"标记为 CANCELLED"；fire-and-forget 模式需要接
    // AbortController 真停（follow-up）。
    return this.prisma.radarRun.update({
      where: { id: runId },
      data: {
        status: RadarRunStatus.CANCELLED,
        completedAt: new Date(),
      },
    });
  }
}
