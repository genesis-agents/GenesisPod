import { Controller, Get, Query, UseGuards, Logger } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../../../common/guards/admin.guard";
import { OpsDashboardService } from "./ops-dashboard.service";
import {
  OpsOverviewDto,
  OpsModuleStatDto,
  OpsTopicStatDto,
} from "./dto/ops-dashboard.dto";

/**
 * 运营看板（Ops Dashboard）只读控制器
 * 统一路由前缀: /admin/dashboard
 * 三个端点均接受 ?days=30（默认 30）。
 */
@ApiTags("Admin - Ops Dashboard")
@Controller("admin/dashboard")
@UseGuards(JwtAuthGuard, AdminGuard)
export class OpsDashboardController {
  private readonly logger = new Logger(OpsDashboardController.name);

  constructor(private readonly opsDashboardService: OpsDashboardService) {}

  @Get("overview")
  @ApiOperation({ summary: "运营看板总览：活跃/新增/事件/成本" })
  @ApiQuery({ name: "days", required: false, type: Number })
  @ApiResponse({ status: 200, description: "返回运营总览聚合数据" })
  async getOverview(@Query("days") days?: string): Promise<OpsOverviewDto> {
    this.logger.log("Admin: Fetching ops dashboard overview");
    return this.opsDashboardService.getOverview(this.parseDays(days));
  }

  @Get("modules")
  @ApiOperation({ summary: "运营看板：各模块漏斗统计" })
  @ApiQuery({ name: "days", required: false, type: Number })
  @ApiResponse({ status: 200, description: "返回各模块漏斗统计" })
  async getModules(@Query("days") days?: string): Promise<OpsModuleStatDto[]> {
    this.logger.log("Admin: Fetching ops dashboard module stats");
    return this.opsDashboardService.getModules(this.parseDays(days));
  }

  @Get("topics")
  @ApiOperation({ summary: "运营看板：热门话题 top 20" })
  @ApiQuery({ name: "days", required: false, type: Number })
  @ApiResponse({ status: 200, description: "返回热门话题统计" })
  async getTopics(@Query("days") days?: string): Promise<OpsTopicStatDto[]> {
    this.logger.log("Admin: Fetching ops dashboard topic stats");
    return this.opsDashboardService.getTopics(this.parseDays(days));
  }

  /** 解析 days 查询参数，默认 30（service 内再做范围归一化） */
  private parseDays(days?: string): number {
    if (days === undefined) return 30;
    const parsed = parseInt(days, 10);
    return Number.isNaN(parsed) ? 30 : parsed;
  }
}
