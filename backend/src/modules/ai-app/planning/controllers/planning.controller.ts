import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Res,
} from "@nestjs/common";
import { Response } from "express";
import { Throttle } from "@nestjs/throttler";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import { PlanningOrchestratorService } from "../services/planning-orchestrator.service";
import { PlanningTemplateService } from "../services/planning-template.service";
import { CreatePlanDto } from "../dto/create-plan.dto";
import type { RequestWithUser } from "../../../../common/types/express-request.types";

@ApiTags("AI Planning")
@ApiBearerAuth()
@Controller("ai-planning")
@UseGuards(JwtAuthGuard)
export class PlanningController {
  constructor(
    private readonly orchestrator: PlanningOrchestratorService,
    private readonly templateService: PlanningTemplateService,
  ) {}

  @Post()
  @ApiOperation({ summary: "创建策划" })
  @ApiResponse({ status: 201, description: "策划创建成功" })
  async createPlan(
    @Request() req: RequestWithUser,
    @Body() dto: CreatePlanDto,
  ) {
    return this.orchestrator.createPlan(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: "获取策划列表" })
  @ApiResponse({ status: 200, description: "策划列表" })
  async getPlans(
    @Request() req: RequestWithUser,
    @Query("search") search?: string,
  ) {
    return this.orchestrator.getPlans(req.user.id, search);
  }

  @Get("templates")
  @ApiOperation({ summary: "获取策划模板列表" })
  @ApiResponse({ status: 200, description: "模板列表" })
  async getTemplates() {
    return this.templateService.getTemplates();
  }

  @Get(":planId")
  @ApiOperation({ summary: "获取策划详情" })
  @ApiResponse({ status: 200, description: "策划详情" })
  async getPlanDetail(
    @Request() req: RequestWithUser,
    @Param("planId") planId: string,
  ) {
    return this.orchestrator.getPlanDetail(planId, req.user.id);
  }

  @Post(":planId/advance")
  @ApiOperation({ summary: "推进到下一阶段" })
  @ApiResponse({ status: 200, description: "阶段推进成功" })
  async advancePhase(
    @Request() req: RequestWithUser,
    @Param("planId") planId: string,
  ) {
    return this.orchestrator.advancePhase(planId, req.user.id);
  }

  @Post(":planId/phase/:phase/retry")
  @ApiOperation({ summary: "重新执行某阶段" })
  @ApiResponse({ status: 200, description: "阶段重试成功" })
  async retryPhase(
    @Request() req: RequestWithUser,
    @Param("planId") planId: string,
    @Param("phase") phase: string,
  ) {
    return this.orchestrator.retryPhase(
      planId,
      parseInt(phase, 10),
      req.user.id,
    );
  }

  @Get(":planId/export")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: "导出策划文档" })
  @ApiResponse({ status: 200, description: "Markdown" })
  async exportPlan(
    @Request() req: RequestWithUser,
    @Param("planId") planId: string,
    @Res() res: Response,
  ) {
    const markdown = await this.orchestrator.exportPlan(planId, req.user.id);
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="plan-${planId}.md"`,
    );
    res.send(markdown);
  }

  @Delete(":planId")
  @ApiOperation({ summary: "删除策划" })
  @ApiResponse({ status: 200, description: "策划删除成功" })
  async deletePlan(
    @Request() req: RequestWithUser,
    @Param("planId") planId: string,
  ) {
    await this.orchestrator.deletePlan(planId, req.user.id);
    return { success: true };
  }
}
