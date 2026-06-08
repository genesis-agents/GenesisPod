/**
 * CompanyController — REST endpoints for "一人公司 OS" persistent CRUD
 *
 * Base path: /company
 * Auth:      JwtAuthGuard (userId from req.user.id)
 *
 * Endpoints (W2 contract):
 *   GET    /company                           → snapshot
 *   POST   /company/hire                      → hire agent
 *   PATCH  /company/hired/:id                 → update hired agent
 *   DELETE /company/hired/:id                 → dismiss hired agent
 *   POST   /company/ceo                       → set / unset CEO
 *   POST   /company/teams                     → create team
 *   PATCH  /company/teams/:id                 → rename team
 *   DELETE /company/teams/:id                 → delete team
 *   POST   /company/teams/:id/members         → add member
 *   DELETE /company/teams/:id/members/:hiredAgentId → remove member
 *   POST   /company/teams/:id/leader          → set leader
 *   POST   /company/teams/:id/workflow        → assign / unset workflow
 *   POST   /company/workflows/custom          → create custom workflow
 *   POST   /company/workflows/acquire         → acquire from marketplace
 *   PATCH  /company/workflows/:id             → update workflow
 *   DELETE /company/workflows/:id             → delete workflow
 */

import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import type { RequestWithUser } from "@/common/types/express-request.types";
import { CompanyService } from "../../services/company.service";
import { CompanyMissionService } from "../../services/company-mission.service";
import {
  AcquireWorkflowDto,
  InstantiateTeamFromWorkflowDto,
  AddTeamMemberDto,
  CreateMissionDto,
  CreateTeamDto,
  HireAgentDto,
  SetCeoDto,
  SetTeamLeaderDto,
  SetTeamWorkflowDto,
  UpdateHiredAgentDto,
  UpdateTeamDto,
  UpdateWorkflowDto,
} from "../dto/company.dto";

@ApiTags("Company")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("company")
export class CompanyController {
  constructor(
    private readonly companyService: CompanyService,
    private readonly missionService: CompanyMissionService,
  ) {}

  // ── helpers ─────────────────────────────────────────────────────────────────

  private getUserId(req: RequestWithUser): string {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException("Authenticated user required");
    return userId;
  }

  // ── snapshot ─────────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: "获取公司快照（profile + teams + hired + workflows）",
  })
  async getCompany(@Request() req: RequestWithUser) {
    return this.companyService.getCompany(this.getUserId(req));
  }

  // ── hire ─────────────────────────────────────────────────────────────────────

  @Post("hire")
  @ApiOperation({ summary: "从市场招募一个 Agent" })
  async hire(@Request() req: RequestWithUser, @Body() dto: HireAgentDto) {
    return this.companyService.hire(this.getUserId(req), dto.listingId);
  }

  // ── hired agent ───────────────────────────────────────────────────────────────

  @Patch("hired/:id")
  @ApiOperation({ summary: "更新雇员 Agent 配置" })
  async updateHired(
    @Request() req: RequestWithUser,
    @Param("id") id: string,
    @Body() dto: UpdateHiredAgentDto,
  ) {
    return this.companyService.updateHired(this.getUserId(req), id, dto);
  }

  @Delete("hired/:id")
  @HttpCode(204)
  @ApiOperation({ summary: "解雇 Agent" })
  async deleteHired(
    @Request() req: RequestWithUser,
    @Param("id") id: string,
  ): Promise<void> {
    await this.companyService.deleteHired(this.getUserId(req), id);
  }

  // ── CEO ───────────────────────────────────────────────────────────────────────

  @Post("ceo")
  @ApiOperation({ summary: "设置/取消 CEO" })
  async setCeo(@Request() req: RequestWithUser, @Body() dto: SetCeoDto) {
    return this.companyService.setCeo(
      this.getUserId(req),
      dto.hiredAgentId ?? null,
    );
  }

  // ── teams ─────────────────────────────────────────────────────────────────────

  @Post("teams")
  @ApiOperation({ summary: "创建团队" })
  async createTeam(
    @Request() req: RequestWithUser,
    @Body() dto: CreateTeamDto,
  ) {
    return this.companyService.createTeam(this.getUserId(req), dto.name);
  }

  @Post("teams/from-workflow")
  @ApiOperation({ summary: "一键成军：从工作流模板实例化满编团队" })
  async instantiateTeamFromWorkflow(
    @Request() req: RequestWithUser,
    @Body() dto: InstantiateTeamFromWorkflowDto,
  ) {
    return this.companyService.instantiateTeamFromWorkflow(
      this.getUserId(req),
      dto.workflowListingId,
      dto.name,
    );
  }

  @Patch("teams/:id")
  @ApiOperation({ summary: "更新团队名称" })
  async updateTeam(
    @Request() req: RequestWithUser,
    @Param("id") id: string,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.companyService.updateTeam(this.getUserId(req), id, dto);
  }

  @Delete("teams/:id")
  @HttpCode(204)
  @ApiOperation({ summary: "删除团队" })
  async deleteTeam(
    @Request() req: RequestWithUser,
    @Param("id") id: string,
  ): Promise<void> {
    await this.companyService.deleteTeam(this.getUserId(req), id);
  }

  // ── team members ──────────────────────────────────────────────────────────────

  @Post("teams/:id/members")
  @ApiOperation({ summary: "向团队添加成员" })
  async addTeamMember(
    @Request() req: RequestWithUser,
    @Param("id") teamId: string,
    @Body() dto: AddTeamMemberDto,
  ) {
    return this.companyService.addTeamMember(
      this.getUserId(req),
      teamId,
      dto.hiredAgentId,
    );
  }

  @Delete("teams/:id/members/:hiredAgentId")
  @HttpCode(204)
  @ApiOperation({ summary: "从团队移除成员" })
  async removeTeamMember(
    @Request() req: RequestWithUser,
    @Param("id") teamId: string,
    @Param("hiredAgentId") hiredAgentId: string,
  ): Promise<void> {
    await this.companyService.removeTeamMember(
      this.getUserId(req),
      teamId,
      hiredAgentId,
    );
  }

  // ── team leader ───────────────────────────────────────────────────────────────

  @Post("teams/:id/leader")
  @ApiOperation({ summary: "设置团队 Leader" })
  async setTeamLeader(
    @Request() req: RequestWithUser,
    @Param("id") teamId: string,
    @Body() dto: SetTeamLeaderDto,
  ) {
    return this.companyService.setTeamLeader(
      this.getUserId(req),
      teamId,
      dto.hiredAgentId,
    );
  }

  // ── team workflow ─────────────────────────────────────────────────────────────

  @Post("teams/:id/workflow")
  @ApiOperation({ summary: "为团队分配工作流" })
  async setTeamWorkflow(
    @Request() req: RequestWithUser,
    @Param("id") teamId: string,
    @Body() dto: SetTeamWorkflowDto,
  ) {
    return this.companyService.setTeamWorkflow(
      this.getUserId(req),
      teamId,
      dto.workflowId ?? null,
    );
  }

  // ── workflows ─────────────────────────────────────────────────────────────────

  @Post("workflows/custom")
  @ApiOperation({ summary: "创建自定义工作流" })
  async createCustomWorkflow(@Request() req: RequestWithUser) {
    return this.companyService.createCustomWorkflow(this.getUserId(req));
  }

  @Post("workflows/acquire")
  @ApiOperation({ summary: "从市场获取工作流" })
  async acquireWorkflow(
    @Request() req: RequestWithUser,
    @Body() dto: AcquireWorkflowDto,
  ) {
    return this.companyService.acquireWorkflow(
      this.getUserId(req),
      dto.sourceListingId,
    );
  }

  @Patch("workflows/:id")
  @ApiOperation({ summary: "更新工作流配置" })
  async updateWorkflow(
    @Request() req: RequestWithUser,
    @Param("id") id: string,
    @Body() dto: UpdateWorkflowDto,
  ) {
    return this.companyService.updateWorkflow(this.getUserId(req), id, dto);
  }

  @Delete("workflows/:id")
  @HttpCode(204)
  @ApiOperation({ summary: "删除工作流" })
  async deleteWorkflow(
    @Request() req: RequestWithUser,
    @Param("id") id: string,
  ): Promise<void> {
    await this.companyService.deleteWorkflow(this.getUserId(req), id);
  }

  // ── missions ───────────────────────────────────────────────────────────────

  @Post("teams/:id/missions")
  @ApiOperation({ summary: "为团队创建并启动 Mission" })
  async createMission(
    @Request() req: RequestWithUser,
    @Param("id") teamId: string,
    @Body() dto: CreateMissionDto,
  ) {
    return this.missionService.createMission(
      this.getUserId(req),
      teamId,
      dto.title,
    );
  }

  @Get("missions")
  @ApiOperation({ summary: "获取 Mission 列表（可按 teamId 过滤）" })
  @ApiQuery({ name: "teamId", required: false, description: "按团队 ID 过滤" })
  async listMissions(
    @Request() req: RequestWithUser,
    @Query("teamId") teamId?: string,
  ) {
    return this.missionService.listMissions(this.getUserId(req), teamId);
  }
}
