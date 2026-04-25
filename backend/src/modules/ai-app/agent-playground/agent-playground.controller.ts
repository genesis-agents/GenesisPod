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
  Query,
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
import { MissionOwnershipRegistry } from "./services/mission-ownership.registry";
import { MissionEventBuffer } from "./services/mission-event-buffer.service";

@Controller("agent-playground")
@UseGuards(JwtAuthGuard)
export class AgentPlaygroundController {
  private readonly log = new Logger(AgentPlaygroundController.name);

  constructor(
    private readonly orchestrator: ResearchTeamOrchestrator,
    private readonly buffer: MissionEventBuffer,
    private readonly ownership: MissionOwnershipRegistry,
  ) {}

  /**
   * POST /api/v1/agent-playground/research-team/run
   *
   * fire-and-forget：立刻返回 missionId，mission 在后台跑，前端通过 socket join 监听事件。
   * 同时 /replay 端点提供 polling fallback。
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
      throw new BadRequestException(
        `Invalid input: ${parsed.error.issues
          .map((i) => `${i.path.join(".")}:${i.message}`)
          .join("; ")}`,
      );
    }
    const input: RunMissionInput = parsed.data;
    const missionId = randomUUID();

    this.ownership.assign(missionId, userId);

    void this.orchestrator
      .runMission(missionId, input, userId)
      .catch((err: unknown) => {
        this.log.error(
          `mission ${missionId} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    return { missionId, streamNamespace: "agent-playground" };
  }

  /**
   * GET /api/v1/agent-playground/replay/:missionId?since=<ts>
   *
   * 从 MissionEventBuffer 读取累积事件。前端可：
   *   - 初次进页面用此端点 hydrate（防 socket 断线/掉包）
   *   - WS 失败时 polling 兜底
   */
  @Get("replay/:missionId")
  replay(
    @Param("missionId") missionId: string,
    @Query("since") since: string | undefined,
    @Request() req: RequestWithUser,
  ): { events: readonly unknown[]; serverNow: number } {
    this.assertOwnership(missionId, req.user?.id);
    const sinceTs = since ? Number(since) : undefined;
    const events = this.buffer.read(
      missionId,
      Number.isFinite(sinceTs as number) ? (sinceTs as number) : undefined,
    );
    return { events, serverNow: Date.now() };
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
