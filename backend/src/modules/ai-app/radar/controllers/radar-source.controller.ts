import {
  Body,
  Controller,
  Delete,
  Get,
  NotImplementedException,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import type { RequestWithUser } from "../../../../common/types/express-request.types";
import {
  AcceptRecommendedSourcesDto,
  CreateRadarSourceDto,
  RecommendSourcesDto,
  UpdateRadarSourceDto,
} from "../dto";
import { RadarSourceService } from "../services/source/radar-source.service";

/**
 * RadarSourceController
 *
 * Topic-scoped 数据源 CRUD + AI 推荐入口（PR-R4 接入 source-curator agent 后才实装）。
 */
@Controller("radar")
@UseGuards(JwtAuthGuard)
export class RadarSourceController {
  constructor(private readonly sources: RadarSourceService) {}

  @Post("topics/:topicId/sources")
  async create(
    @Request() req: RequestWithUser,
    @Param("topicId") topicId: string,
    @Body() dto: CreateRadarSourceDto,
  ) {
    return this.sources.create(req.user.id, topicId, dto);
  }

  @Get("topics/:topicId/sources")
  async list(
    @Request() req: RequestWithUser,
    @Param("topicId") topicId: string,
  ) {
    return this.sources.listByTopic(req.user.id, topicId);
  }

  @Patch("sources/:sourceId")
  async update(
    @Request() req: RequestWithUser,
    @Param("sourceId") sourceId: string,
    @Body() dto: UpdateRadarSourceDto,
  ) {
    return this.sources.update(req.user.id, sourceId, dto);
  }

  @Delete("sources/:sourceId")
  async delete(
    @Request() req: RequestWithUser,
    @Param("sourceId") sourceId: string,
  ) {
    await this.sources.delete(req.user.id, sourceId);
    return { deleted: true };
  }

  /**
   * AI 推荐数据源候选（不入库，返回 candidate 列表给前端展示）。
   *
   * PR-R3 引入 source-curator agent 后实装；PR-R1 阶段保留 endpoint shape。
   */
  @Post("topics/:topicId/sources/recommend")
  async recommend(
    @Request() _req: RequestWithUser,
    @Param("topicId") _topicId: string,
    @Body() _dto: RecommendSourcesDto,
  ) {
    throw new NotImplementedException(
      "AI 源推荐将在 PR-R3 引入 source-curator agent 后启用",
    );
  }

  /**
   * 接受 AI 推荐源 → 批量入库（PR-R3 接入推荐链路后启用）。
   */
  @Post("topics/:topicId/sources/recommend/accept")
  async acceptRecommended(
    @Request() _req: RequestWithUser,
    @Param("topicId") _topicId: string,
    @Body() _dto: AcceptRecommendedSourcesDto,
  ) {
    throw new NotImplementedException(
      "AI 源推荐接受将在 PR-R3 引入 source-curator agent 后启用",
    );
  }
}
