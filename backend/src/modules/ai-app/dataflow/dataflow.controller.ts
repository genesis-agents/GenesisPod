/**
 * DataFlowController —— 系统数据流图 REST API（管理后台「系统架构图 · 数据流」Tab）
 *
 * GET /api/v1/admin/data-flow/graph             真实拓扑（节点/边/层 + live 标注）
 * GET /api/v1/admin/data-flow/metrics?window=24 真实流量（AIUsageLog 聚合，window=小时）
 *
 * 仅管理员可见（JwtAuthGuard + AdminGuard）。
 */

import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../../common/guards/admin.guard";
import { DataFlowService } from "./dataflow.service";

@Controller("admin/data-flow")
@UseGuards(JwtAuthGuard, AdminGuard)
export class DataFlowController {
  constructor(private readonly dataFlowService: DataFlowService) {}

  @Get("graph")
  getGraph() {
    return this.dataFlowService.getGraph();
  }

  @Get("metrics")
  getMetrics(@Query("window") window?: string) {
    const hours = window ? Number.parseInt(window, 10) : 24;
    return this.dataFlowService.getMetrics(Number.isFinite(hours) ? hours : 24);
  }
}
