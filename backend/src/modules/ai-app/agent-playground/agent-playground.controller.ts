/**
 * AgentPlaygroundController — 后端 REST 入口
 */

import {
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
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import type { RequestWithUser } from "../../../common/types/express-request.types";
import { ResearchTeamOrchestrator } from "./services/research-team.orchestrator";
import {
  RunMissionInputSchema,
  type RunMissionInput,
} from "./dto/run-mission.dto";
import { AgentEventStore } from "../../ai-engine/harness/checkpoint";

@Controller("api/agent-playground")
@UseGuards(JwtAuthGuard)
export class AgentPlaygroundController {
  private readonly log = new Logger(AgentPlaygroundController.name);

  constructor(
    private readonly orchestrator: ResearchTeamOrchestrator,
    private readonly eventStore: AgentEventStore,
  ) {}

  /**
   * POST /api/agent-playground/research-team/run
   * 启动一次 mission；返回 missionId 后 mission 仍在后台跑，前端走 socket 拉事件
   */
  @Post("research-team/run")
  async runResearchTeam(
    @Body() body: unknown,
    @Request() req: RequestWithUser,
  ): Promise<{ missionId: string; streamNamespace: string }> {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException("Authentication required");

    const parsed = RunMissionInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new Error(
        `Invalid input: ${parsed.error.issues
          .map((i) => `${i.path.join(".")}:${i.message}`)
          .join("; ")}`,
      );
    }
    const input: RunMissionInput = parsed.data;

    // 等 mission 拿到 missionId（mission 内 emit started 事件后返回 id），
    // 实际任务执行继续在 promise 里跑
    const result = await this.orchestrator
      .runMission(input, userId)
      .catch((err: unknown) => {
        this.log.error(
          `mission failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        throw err;
      });

    return {
      missionId: result.missionId,
      streamNamespace: "agent-playground",
    };
  }

  @Get("replay/:missionId")
  async replay(@Param("missionId") missionId: string): Promise<{
    events: readonly unknown[];
  }> {
    const events = await this.eventStore.readStream(missionId, { limit: 1000 });
    return { events };
  }

  @Get("cost/:missionId")
  async cost(@Param("missionId") missionId: string): Promise<{
    missionId: string;
    breakdown: unknown;
  }> {
    const events = await this.eventStore.readStream(missionId, { limit: 1000 });
    return { missionId, breakdown: events.map((e) => e.payload) };
  }
}
