import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AIModelType } from "@prisma/client";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../../common/guards/admin.guard";
import { ModelRecommendationsService } from "../../ai-engine/llm/recommendations/model-recommendations.service";
import { AdminModelsAutoConfigureService } from "./services/admin-models-auto-configure.service";

interface AuthedReq {
  user: { id: string; email: string };
}

/**
 * 管理员：一键 AI 配置 + 推荐矩阵 CRUD。
 *
 * 路径：
 *   POST   /admin/ai-models/auto-configure
 *   GET    /admin/model-recommendations
 *   POST   /admin/model-recommendations
 *   PATCH  /admin/model-recommendations/:id
 *   DELETE /admin/model-recommendations/:id
 *   POST   /admin/model-recommendations/seed       (补齐缺失的默认条目)
 *   POST   /admin/model-recommendations/reset      (完全重置为硬编码默认)
 */
@ApiTags("Admin - Model Recommendations")
@Controller()
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminModelRecommendationsController {
  constructor(
    private readonly autoConfigure: AdminModelsAutoConfigureService,
    private readonly recommendations: ModelRecommendationsService,
  ) {}

  // ============ Auto-Configure ============

  @Post("admin/ai-models/auto-configure")
  @ApiOperation({
    summary:
      "一键 AI 配置：基于现有 AIModel 里的 keys 扫描 provider /v1/models",
  })
  @ApiResponse({
    status: 200,
    description: "返回创建/跳过的明细",
  })
  async runAutoConfigure() {
    return this.autoConfigure.run();
  }

  // ============ Recommendations CRUD ============

  @Get("admin/model-recommendations")
  @ApiOperation({
    summary: "获取推荐矩阵（DB 优先 + 硬编码 fallback 合并）",
  })
  async listAll() {
    return {
      items: await this.recommendations.listAll(),
    };
  }

  @Get("admin/model-recommendations/db")
  @ApiOperation({
    summary: "获取 DB 原始行（编辑用，不含 fallback）",
  })
  async listDb() {
    return {
      items: await this.recommendations.listDbRows(),
    };
  }

  @Post("admin/model-recommendations")
  @ApiOperation({ summary: "新增一条 (provider, modelType) 推荐" })
  async create(
    @Req() req: AuthedReq,
    @Body()
    body: {
      provider: string;
      modelType: AIModelType;
      patterns: string[];
      priority?: number;
      note?: string;
    },
  ) {
    if (!body.provider) throw new BadRequestException("provider is required");
    if (!body.modelType) throw new BadRequestException("modelType is required");
    return this.recommendations.create(body, req.user.id);
  }

  @Patch("admin/model-recommendations/:id")
  @ApiOperation({ summary: "更新指定推荐（只改 patterns / priority / note）" })
  async update(
    @Req() req: AuthedReq,
    @Param("id") id: string,
    @Body()
    body: {
      patterns?: string[];
      priority?: number;
      note?: string | null;
    },
  ) {
    return this.recommendations.update(id, body, req.user.id);
  }

  @Delete("admin/model-recommendations/:id")
  @ApiOperation({ summary: "删除指定推荐（可用于恢复 fallback 默认）" })
  async remove(@Param("id") id: string) {
    await this.recommendations.remove(id);
    return { success: true };
  }

  @Post("admin/model-recommendations/seed")
  @ApiOperation({
    summary: "补齐：只插入缺失的默认条目，不覆盖现有",
  })
  async seedMissing(@Req() req: AuthedReq) {
    return this.recommendations.seedMissingDefaults(req.user.id);
  }

  @Post("admin/model-recommendations/reset")
  @ApiOperation({
    summary: "完全重置为硬编码默认（危险：会清空管理员编辑过的 patterns）",
  })
  async reset(@Req() req: AuthedReq) {
    return this.recommendations.resetToDefaults(req.user.id);
  }
}
