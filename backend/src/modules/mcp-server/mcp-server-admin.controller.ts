/**
 * MCP Server Admin Controller
 * Admin monitoring for the externally-exposed MCP Server
 * Routes: /admin/mcp-server/*
 */

import { Controller, Get, Query, UseGuards, Logger } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../common/guards/admin.guard";
import { MCPServerService } from "./mcp-server.service";

@ApiTags("Admin - MCP Server")
@Controller("admin/mcp-server")
@UseGuards(JwtAuthGuard, AdminGuard)
export class MCPServerAdminController {
  private readonly logger = new Logger(MCPServerAdminController.name);

  constructor(private readonly mcpServerService: MCPServerService) {}

  @Get("status")
  @ApiOperation({ summary: "获取 MCP Server 状态概览" })
  @ApiResponse({ status: 200, description: "返回 MCP Server 状态" })
  async getStatus() {
    this.logger.log("Admin: Fetching MCP Server status");
    return this.mcpServerService.getDetailedStatus();
  }

  @Get("metrics")
  @ApiOperation({ summary: "获取 MCP Server 使用指标" })
  @ApiQuery({ name: "startDate", required: false, type: String })
  @ApiQuery({ name: "endDate", required: false, type: String })
  @ApiQuery({ name: "toolName", required: false, type: String })
  @ApiResponse({ status: 200, description: "返回使用指标" })
  async getMetrics(
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("toolName") toolName?: string,
  ) {
    this.logger.log("Admin: Fetching MCP Server metrics");
    return this.mcpServerService.getMetrics({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      toolName,
    });
  }

  @Get("sessions")
  @ApiOperation({ summary: "获取活动会话列表" })
  @ApiResponse({ status: 200, description: "返回活动会话" })
  async getSessions() {
    this.logger.log("Admin: Fetching MCP Server sessions");
    return {
      sessions: this.mcpServerService.getSessions(),
      count: this.mcpServerService.getSessions().length,
    };
  }

  @Get("tools")
  @ApiOperation({ summary: "获取已注册工具列表" })
  @ApiResponse({ status: 200, description: "返回工具详情" })
  async getTools() {
    this.logger.log("Admin: Fetching MCP Server tools");
    const status = this.mcpServerService.getDetailedStatus();
    return {
      tools: status.tools,
      count: status.toolCount,
    };
  }
}
