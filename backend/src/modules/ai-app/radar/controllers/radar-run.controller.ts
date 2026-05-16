import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  NotImplementedException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import type { RequestWithUser } from "../../../../common/types/express-request.types";
import { TriggerRefreshDto } from "../dto";
import { RadarTopicService } from "../services/topic/radar-topic.service";

/**
 * RadarRunController
 *
 * 历史 run 查询（GET）+ 手动触发刷新（POST）。
 * 手动触发的实际编排在 PR-R3 引入 RadarPipelineDispatcher 后启用。
 */
@Controller("radar")
@UseGuards(JwtAuthGuard)
export class RadarRunController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly topics: RadarTopicService,
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

  @Post("topics/:topicId/refresh")
  async refresh(
    @Request() _req: RequestWithUser,
    @Param("topicId") _topicId: string,
    @Body() _dto: TriggerRefreshDto,
  ) {
    throw new NotImplementedException(
      "手动刷新需要 PR-R3 RadarPipelineDispatcher 接入后启用",
    );
  }

  @Post("runs/:runId/cancel")
  async cancel(
    @Request() _req: RequestWithUser,
    @Param("runId") _runId: string,
  ) {
    throw new NotImplementedException(
      "手动取消将在 PR-R4 引入 mission lifecycle 后启用",
    );
  }
}
