/**
 * AgentPlaygroundController — 后端 REST 入口
 */

import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Logger,
  Param,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import type { RequestWithUser } from "../../../common/types/express-request.types";
import { ResearchTeamOrchestrator } from "./services/research-team.orchestrator";
import {
  RunMissionInputSchema,
  type RunMissionInput,
} from "./dto/run-mission.dto";
// 必修 #8: 走 facade 而非穿透 harness/checkpoint
import { AgentEventStore } from "../../ai-engine/facade";
import { MissionOwnershipRegistry } from "./services/mission-ownership.registry";

@Controller("agent-playground")
@UseGuards(JwtAuthGuard)
export class AgentPlaygroundController {
  private readonly log = new Logger(AgentPlaygroundController.name);

  constructor(
    private readonly orchestrator: ResearchTeamOrchestrator,
    private readonly eventStore: AgentEventStore,
    private readonly ownership: MissionOwnershipRegistry,
  ) {}

  /**
   * POST /api/v1/agent-playground/research-team/run
   *
   * 必修 #1（fire-and-forget）：立刻返回 missionId，
   * mission 在后台跑，前端通过 socket join 监听事件。
   */
  @Post("research-team/run")
  runResearchTeam(
    @Body() body: unknown,
    @Request() req: RequestWithUser,
  ): { missionId: string; streamNamespace: string } {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException("Authentication required");

    const parsed = RunMissionInputSchema.safeParse(body);
    if (!parsed.success) {
      // 必修 #5: BadRequestException 而非 Error → 客户端拿到 400 而非 500
      throw new BadRequestException(
        `Invalid input: ${parsed.error.issues
          .map((i) => `${i.path.join(".")}:${i.message}`)
          .join("; ")}`,
      );
    }
    const input: RunMissionInput = parsed.data;
    const missionId = randomUUID();

    // 必修 #4: 注册 ownership，gateway/replay/cost 用此校验
    this.ownership.assign(missionId, userId);

    // fire-and-forget：mission 在后台跑；前端走 socket 拉事件
    void this.orchestrator
      .runMission(missionId, input, userId)
      .catch((err: unknown) => {
        this.log.error(
          `mission ${missionId} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    return { missionId, streamNamespace: "agent-playground" };
  }

  @Get("replay/:missionId")
  async replay(
    @Param("missionId") missionId: string,
    @Request() req: RequestWithUser,
  ): Promise<{ events: readonly unknown[] }> {
    this.assertOwnership(missionId, req.user?.id);
    const events = await this.eventStore.readStream(missionId, { limit: 1000 });
    return { events };
  }

  @Get("cost/:missionId")
  async cost(
    @Param("missionId") missionId: string,
    @Request() req: RequestWithUser,
  ): Promise<{ missionId: string; breakdown: unknown }> {
    this.assertOwnership(missionId, req.user?.id);
    const events = await this.eventStore.readStream(missionId, { limit: 1000 });
    return { missionId, breakdown: events.map((e) => e.payload) };
  }

  private assertOwnership(missionId: string, userId?: string): void {
    if (!userId) throw new ForbiddenException("Authentication required");
    const owner = this.ownership.getOwner(missionId);
    if (!owner) throw new ForbiddenException(`mission ${missionId} not found`);
    if (owner !== userId) {
      throw new ForbiddenException(`mission ${missionId} not owned by you`);
    }
  }
}
