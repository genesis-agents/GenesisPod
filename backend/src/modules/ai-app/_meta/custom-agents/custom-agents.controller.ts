/**
 * E R4 Phase 2 (PR-E1, 2026-05-05): 用户自定义 Agent REST controller
 *
 * 路由：
 *   GET    /user/custom-agents
 *   POST   /user/custom-agents
 *   GET    /user/custom-agents/:id
 *   PATCH  /user/custom-agents/:id
 *   DELETE /user/custom-agents/:id
 *   POST   /user/custom-agents/:id/publish
 *
 * 后续 PR-E2 加 step-by-step PATCH 路由（PATCH /user/custom-agents/:id/steps/:step）
 * PR-E3 加 /run（直接从 custom agent 启 mission）
 */
import {
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
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import { CustomAgentsService } from "./custom-agents.service";
import {
  CreateCustomAgentDto,
  UpdateCustomAgentDto,
} from "./dto/custom-agent.dto";

interface AuthenticatedRequest {
  user: { id: string; email: string };
}

@UseGuards(JwtAuthGuard)
@Controller("user/custom-agents")
export class CustomAgentsController {
  constructor(private readonly service: CustomAgentsService) {}

  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    return this.service.list(req.user.id);
  }

  @Post()
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateCustomAgentDto,
  ) {
    return this.service.create(req.user.id, dto);
  }

  @Get(":id")
  async getById(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.service.getById(req.user.id, id);
  }

  @Patch(":id")
  async update(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateCustomAgentDto,
  ) {
    return this.service.update(req.user.id, id, dto);
  }

  @Delete(":id")
  async remove(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.service.remove(req.user.id, id);
  }

  @Post(":id/publish")
  async publish(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.service.publish(req.user.id, id);
  }
}
