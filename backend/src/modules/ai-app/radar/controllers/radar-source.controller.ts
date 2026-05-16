import {
  Body,
  Controller,
  Delete,
  Get,
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
import { SourceDiscoveryService } from "../services/source/source-discovery.service";

/**
 * RadarSourceController
 *
 * Topic-scoped 数据源 CRUD + AI 推荐入口（PR-R3 接通 SourceCuratorAgent）。
 */
@Controller("radar")
@UseGuards(JwtAuthGuard)
export class RadarSourceController {
  constructor(
    private readonly sources: RadarSourceService,
    private readonly discovery: SourceDiscoveryService,
  ) {}

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
   * AI 推荐数据源候选（调 source-curator agent → LLM 列出 X/YouTube/RSS/Custom 候选）。
   *
   * 返回不入库；前端勾选后通过 /recommend/accept 批量入库。
   */
  @Post("topics/:topicId/sources/recommend")
  async recommend(
    @Request() req: RequestWithUser,
    @Param("topicId") topicId: string,
    @Body() dto: RecommendSourcesDto,
  ) {
    const candidates = await this.discovery.recommend(req.user.id, topicId, {
      perTypeLimit: dto.perTypeLimit,
    });
    return { candidates };
  }

  /**
   * 接受 AI 推荐源 → 批量入库（isAiRecommended=true 标记）。
   */
  @Post("topics/:topicId/sources/recommend/accept")
  async acceptRecommended(
    @Request() req: RequestWithUser,
    @Param("topicId") topicId: string,
    @Body() dto: AcceptRecommendedSourcesDto,
  ) {
    return this.discovery.acceptCandidates(
      req.user.id,
      topicId,
      dto.candidates,
    );
  }
}
