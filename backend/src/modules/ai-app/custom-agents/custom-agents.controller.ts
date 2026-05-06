/**
 * E R4 Phase 2 (PR-E2, 2026-05-05): 用户自定义 Agent REST controller
 *
 * 路由：
 *   GET    /user/custom-agents              列表
 *   GET    /user/custom-agents/options      5 步向导拉选项 (skills/models/tools/primitives/enums)
 *   POST   /user/custom-agents              创建
 *   GET    /user/custom-agents/:id          详情
 *   PATCH  /user/custom-agents/:id          更新（任意步骤 partial）
 *   DELETE /user/custom-agents/:id          删除
 *   POST   /user/custom-agents/:id/publish  发布（5 步完整性校验 → DRAFT→PUBLISHED）
 *
 * PR-E3 会加 /run（直接从 custom agent 启 mission）—— 见 agent-playground controller。
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
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
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

  /**
   * GET /user/custom-agents/options
   * 5 步向导拉选项：primitives / skills / tools / models / enums。
   * 注意：必须 declared 在 :id 路由之前，否则被 :id 吃掉。
   */
  @Get("options")
  async options() {
    return this.service.options();
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

  /**
   * POST /user/custom-agents/:id/translate
   *
   * PR-E3: 把 CustomAgentConfig 翻译成 agent-playground RunMissionInput。
   * 前端拿到后调 /agent-playground/team/run 启动 mission。
   *
   * body: { topic: string, overrides?: Record<string, unknown> }
   * resp: { input, metadata: { customAgentId, customAgentSlug, version } }
   */
  @Post(":id/translate")
  async translate(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: { topic: string; overrides?: Record<string, unknown> },
  ) {
    return this.service.translate(req.user.id, id, body);
  }

  /**
   * POST /user/custom-agents/:id/launch  (R-CA 2026-05-05)
   *
   * 一站式启动：translate + 启动 mission + 写 launch 行
   * body: { topic, overrides? }  resp: { missionId, streamNamespace }
   */
  @Post(":id/launch")
  async launch(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: { topic: string; overrides?: Record<string, unknown> },
  ) {
    return this.service.launch(req.user.id, id, body);
  }

  /**
   * GET /user/custom-agents/:id/missions  (R-CA 2026-05-05)
   *
   * 该 custom agent 启动过的所有 mission cards
   * （驱动 /custom-agents/:id 主页的 mission 网格）
   */
  @Get(":id/missions")
  async missions(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.service.listMissionsByAgent(req.user.id, id);
  }
}
