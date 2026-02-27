/**
 * AI Kernel Admin Controller
 * 提供 Kernel 进程管理、事件日志查询等管理端点
 * 统一路由前缀: /admin/kernel
 */
import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Logger,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../../common/guards/admin.guard";
import { KernelApiService } from "../../ai-kernel/api/kernel-api.service";
import { ProcessState } from "@prisma/client";

@ApiTags("Admin - AI Kernel")
@Controller("admin/kernel")
@UseGuards(JwtAuthGuard, AdminGuard)
export class KernelAdminController {
  private readonly logger = new Logger(KernelAdminController.name);

  constructor(private readonly kernelApi: KernelApiService) {}

  // ─── Process Management ───

  @Get("processes")
  @ApiOperation({ summary: "List all kernel processes" })
  @ApiQuery({
    name: "userId",
    required: false,
    description: "Filter by user ID",
  })
  @ApiQuery({
    name: "states",
    required: false,
    description: "Comma-separated process states filter",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "Max results (default 50)",
  })
  @ApiResponse({ status: 200, description: "List of kernel processes" })
  async listProcesses(
    @Query("userId") userId?: string,
    @Query("states") states?: string,
    @Query("limit") limit?: string,
  ) {
    const stateFilter = states
      ? (states.split(",") as ProcessState[])
      : undefined;
    const effectiveUserId = userId || "system";
    const processes = await this.kernelApi.listProcesses(
      effectiveUserId,
      stateFilter,
    );
    const maxResults = limit ? parseInt(limit, 10) : 50;
    return {
      processes: processes.slice(0, maxResults),
      total: processes.length,
    };
  }

  @Get("processes/:id")
  @ApiOperation({ summary: "Get kernel process details" })
  @ApiResponse({ status: 200, description: "Process details" })
  @ApiResponse({ status: 404, description: "Process not found" })
  async getProcess(@Param("id") processId: string) {
    const process = await this.kernelApi.getProcess(processId);
    if (!process) {
      return { error: "Process not found", processId };
    }
    return process;
  }

  @Get("processes/:id/journal")
  @ApiOperation({ summary: "Get process event journal" })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "Max events (default 100)",
  })
  @ApiQuery({
    name: "offset",
    required: false,
    description: "Pagination offset",
  })
  @ApiResponse({ status: 200, description: "Process event history" })
  async getProcessJournal(
    @Param("id") processId: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const result = await this.kernelApi.getEventHistory(processId, {
      limit: limit ? parseInt(limit, 10) : 100,
      offset: offset ? parseInt(offset, 10) : 0,
    });
    return result;
  }

  @Get("processes/:id/budget")
  @ApiOperation({ summary: "Check process budget status" })
  @ApiResponse({ status: 200, description: "Budget check result" })
  async checkBudget(@Param("id") processId: string) {
    return this.kernelApi.checkBudget(processId);
  }

  // ─── Process Actions ───

  @Post("processes/:id/pause")
  @ApiOperation({ summary: "Pause a running process" })
  @ApiResponse({ status: 200, description: "Process paused" })
  async pauseProcess(@Param("id") processId: string) {
    this.logger.log(`Admin pausing process ${processId}`);
    const process = await this.kernelApi.pauseProcess(processId);
    return { success: true, process };
  }

  @Post("processes/:id/resume")
  @ApiOperation({ summary: "Resume a paused process" })
  @ApiResponse({ status: 200, description: "Process resumed" })
  async resumeProcess(@Param("id") processId: string) {
    this.logger.log(`Admin resuming process ${processId}`);
    const process = await this.kernelApi.resumeProcess(processId);
    return { success: true, process };
  }

  @Post("processes/:id/cancel")
  @ApiOperation({ summary: "Cancel a process" })
  @ApiResponse({ status: 200, description: "Process cancelled" })
  async cancelProcess(@Param("id") processId: string) {
    this.logger.log(`Admin cancelling process ${processId}`);
    const process = await this.kernelApi.cancelProcess(processId);
    return { success: true, process };
  }

  // ─── Mission Actions ───

  @Post("processes/:id/complete")
  @ApiOperation({ summary: "Force-complete a mission process" })
  @ApiResponse({ status: 200, description: "Mission marked complete" })
  async completeMission(@Param("id") processId: string) {
    this.logger.log(`Admin force-completing mission process ${processId}`);
    await this.kernelApi.completeMission(processId, {
      reason: "admin_force_complete",
    });
    return { success: true };
  }

  @Post("processes/:id/fail")
  @ApiOperation({ summary: "Force-fail a mission process" })
  @ApiResponse({ status: 200, description: "Mission marked failed" })
  async failMission(@Param("id") processId: string) {
    this.logger.log(`Admin force-failing mission process ${processId}`);
    await this.kernelApi.failMission(processId, "Admin force-failed");
    return { success: true };
  }
}
