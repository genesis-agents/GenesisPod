import { Controller, Get, Query } from "@nestjs/common";
import { DashboardService } from "./dashboard.service";

@Controller("data-collection")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * 获取仪表盘统计
   * GET /data-collection/dashboard
   */
  @Get("dashboard")
  async getStats() {
    const stats = await this.dashboardService.getStats();
    return {
      success: true,
      data: stats,
    };
  }

  /**
   * 获取时间序列数据
   * GET /data-collection/dashboard/timeseries?days=7
   */
  @Get("dashboard/timeseries")
  async getTimeSeries(@Query("days") days?: string) {
    const data = await this.dashboardService.getTimeSeries(
      days ? parseInt(days) : 7,
    );
    return {
      success: true,
      data,
    };
  }
}
