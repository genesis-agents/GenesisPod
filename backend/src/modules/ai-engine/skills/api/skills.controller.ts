/**
 * AI Skills Public API Controller
 *
 * 提供 SkillsMP 数据的公开 API 端点
 * 用于 AI Skills 页面展示
 */

import {
  Controller,
  Get,
  Post,
  Query,
  Logger,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import { SkillsApiService } from "./skills-api.service";

@Controller("skills")
@UseGuards(JwtAuthGuard)
export class SkillsController {
  private readonly logger = new Logger(SkillsController.name);

  constructor(private readonly skillsApiService: SkillsApiService) {}

  /**
   * 获取 Skills 统计数据
   * GET /api/v1/skills/stats
   */
  @Get("stats")
  async getStats() {
    this.logger.debug("Fetching skills stats");
    return this.skillsApiService.getStats();
  }

  /**
   * 获取 Skills 时间线数据
   * GET /api/v1/skills/timeline
   */
  @Get("timeline")
  async getTimeline() {
    this.logger.debug("Fetching skills timeline");
    return this.skillsApiService.getTimeline();
  }

  /**
   * 搜索 Skills
   * GET /api/v1/skills/search
   */
  @Get("search")
  async searchSkills(
    @Query("q") query?: string,
    @Query("category") category?: string,
    @Query("sortBy") sortBy?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    this.logger.debug(
      `Searching skills: query=${query}, category=${category}, sortBy=${sortBy}`,
    );
    return this.skillsApiService.searchSkills({
      query,
      category,
      sortBy: sortBy as "stars" | "downloads" | "name" | undefined,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
    });
  }

  /**
   * 获取热门 Skills
   * GET /api/v1/skills/popular
   */
  @Get("popular")
  async getPopularSkills(@Query("limit") limit?: string) {
    this.logger.debug(`Fetching popular skills, limit=${limit}`);
    return this.skillsApiService.getPopularSkills(limit ? parseInt(limit) : 50);
  }

  /**
   * 获取精选 Skills
   * GET /api/v1/skills/featured
   */
  @Get("featured")
  async getFeaturedSkills(@Query("limit") limit?: string) {
    this.logger.debug(`Fetching featured skills, limit=${limit}`);
    return this.skillsApiService.getFeaturedSkills(
      limit ? parseInt(limit) : 20,
    );
  }

  /**
   * 获取所有分类
   * GET /api/v1/skills/categories
   */
  @Get("categories")
  async getCategories() {
    this.logger.debug("Fetching skill categories");
    return this.skillsApiService.getCategories();
  }

  /**
   * 手动触发同步
   * POST /api/v1/skills/sync
   */
  @Post("sync")
  async syncSkills() {
    this.logger.log("Triggering skills sync");
    return this.skillsApiService.syncFromSkillsMP();
  }
}
