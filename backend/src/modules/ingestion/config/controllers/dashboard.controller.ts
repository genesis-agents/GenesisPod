import { Controller, Get } from "@nestjs/common";
import { DashboardService } from "../services/dashboard.service";

@Controller("data-management/dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("summary")
  async getSummary() {
    return this.dashboardService.getDashboardSummary();
  }

  @Get("recent-tasks")
  async getRecentTasks() {
    return this.dashboardService.getRecentTasks();
  }
}
