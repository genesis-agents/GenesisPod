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
import { MissionStore } from "./services/mission-store.service";
import { LeaderChatService } from "./services/leader-chat.service";

@Controller("agent-playground")
@UseGuards(JwtAuthGuard)
export class AgentPlaygroundController {
  private readonly log = new Logger(AgentPlaygroundController.name);

  constructor(
    private readonly orchestrator: ResearchTeamOrchestrator,
    private readonly buffer: MissionEventBuffer,
    private readonly ownership: MissionOwnershipRegistry,
    private readonly store: MissionStore,
    private readonly leaderChat: LeaderChatService,
  ) {}

  /**
   * GET /api/v1/agent-playground/missions
   * 当前用户的 mission 列表（所有历史，按 startedAt 倒序）
   */
  @Get("missions")
  async listMissions(
    @Request() req: RequestWithUser,
  ): Promise<{ items: unknown[] }> {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException("Authentication required");
    const items = await this.store.listByUser(userId, 100);
    return { items };
  }

  /**
   * GET /api/v1/agent-playground/missions/:id
   * 单个 mission 完整 detail（含 reportFull / dimensions / verdicts）
   */
  @Get("missions/:id")
  async getMission(
    @Param("id") id: string,
    @Request() req: RequestWithUser,
  ): Promise<{ mission: unknown }> {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException("Authentication required");
    const mission = await this.store.getById(id, userId);
    if (!mission) throw new ForbiddenException("Mission not found");
    return { mission };
  }

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
   * POST /api/v1/agent-playground/missions/:id/rerun
   * 用相同配置（topic / depth / language / maxCredits）启动一个新 mission，
   * 返回新 missionId 给前端跳转。
   */
  @Post("missions/:id/rerun")
  async rerunMission(
    @Param("id") missionId: string,
    @Request() req: RequestWithUser,
  ): Promise<{ missionId: string; streamNamespace: string }> {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException("Authentication required");
    await this.assertOwnership(missionId, userId);

    const original = await this.store.getById(missionId, userId);
    if (!original)
      throw new ForbiddenException(`mission ${missionId} not found`);

    const input: RunMissionInput = {
      topic: original.topic,
      depth: (["quick", "standard", "deep"].includes(original.depth)
        ? original.depth
        : "standard") as RunMissionInput["depth"],
      language: (original.language === "en-US"
        ? "en-US"
        : "zh-CN") as RunMissionInput["language"],
      maxCredits: 300,
    };

    const newMissionId = randomUUID();
    this.ownership.assign(newMissionId, userId);

    void this.orchestrator
      .runMission(newMissionId, input, userId)
      .catch((err: unknown) => {
        this.log.error(
          `mission ${newMissionId} (rerun of ${missionId}) failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    return { missionId: newMissionId, streamNamespace: "agent-playground" };
  }

  /**
   * POST /api/v1/agent-playground/missions/:id/cancel
   * 取消运行中的 mission：DB 状态置为 cancelled，前端停止 polling。
   *
   * 限制：不会 abort 后台正在跑的 orchestrator（in-memory），但其后续写入
   * 会被 markFailed 兜底（写入 cancelled 状态会被 markCompleted 覆盖时
   * 我们在 markCompleted 里加了 guard——见 mission-store.service.ts）。
   */
  @Post("missions/:id/cancel")
  async cancelMission(
    @Param("id") missionId: string,
    @Request() req: RequestWithUser,
  ): Promise<{ ok: true; status: string }> {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException("Authentication required");
    await this.assertOwnership(missionId, userId);

    const persisted = await this.store.getById(missionId, userId);
    if (!persisted)
      throw new ForbiddenException(`mission ${missionId} not found`);
    if (persisted.status !== "running") {
      throw new BadRequestException(
        `mission ${missionId} status is ${persisted.status}, not running`,
      );
    }
    await this.store.markCancelled(missionId);
    return { ok: true, status: "cancelled" };
  }

  /**
   * GET /api/v1/agent-playground/replay/:missionId?since=<ts>
   *
   * 从 MissionEventBuffer 读取累积事件。前端可：
   *   - 初次进页面用此端点 hydrate（防 socket 断线/掉包）
   *   - WS 失败时 polling 兜底
   */
  @Get("replay/:missionId")
  async replay(
    @Param("missionId") missionId: string,
    @Query("since") since: string | undefined,
    @Request() req: RequestWithUser,
  ): Promise<{ events: readonly unknown[]; serverNow: number }> {
    await this.assertOwnership(missionId, req.user?.id);
    const sinceTs = since ? Number(since) : undefined;
    const ts = Number.isFinite(sinceTs as number)
      ? (sinceTs as number)
      : undefined;
    // Fast path: in-memory buffer
    let events: readonly unknown[] = this.buffer.read(missionId, ts);
    // 兜底：内存空（Railway recycle 后），从 DB 持久化层读
    if (events.length === 0) {
      events = await this.buffer.readPersisted(missionId, ts);
    }
    return { events, serverNow: Date.now() };
  }

  /**
   * GET /api/v1/agent-playground/missions/:id/leader-chat
   * 拉取该 mission 的 Leader 对话历史。
   */
  @Get("missions/:id/leader-chat")
  async listLeaderChat(
    @Param("id") missionId: string,
    @Request() req: RequestWithUser,
  ): Promise<{ messages: unknown[] }> {
    await this.assertOwnership(missionId, req.user?.id);
    const messages = await this.leaderChat.list(missionId);
    return { messages };
  }

  /**
   * POST /api/v1/agent-playground/missions/:id/leader-chat
   * Body: { content: string }
   * 用户向 Leader 提问 → 系统回复（基于 mission 上下文）→ 两条都持久化。
   */
  @Post("missions/:id/leader-chat")
  async sendLeaderChat(
    @Param("id") missionId: string,
    @Body() body: { content?: string },
    @Request() req: RequestWithUser,
  ): Promise<{ user: unknown; assistant: unknown }> {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException("Authentication required");
    await this.assertOwnership(missionId, userId);
    const content = (body?.content ?? "").toString();
    if (!content.trim()) {
      throw new BadRequestException("content must be a non-empty string");
    }
    if (content.length > 4000) {
      throw new BadRequestException("content exceeds 4000 chars");
    }
    return this.leaderChat.send(missionId, userId, content);
  }

  /**
   * 双层 ownership：先查内存 registry（fast path），miss 时回退查 DB。
   * Railway recycle 后 in-memory registry 清空，但 mission 在 DB 中仍存在，
   * 不应该让用户看不到自己的历史 mission。
   */
  private async assertOwnership(
    missionId: string,
    userId?: string,
  ): Promise<void> {
    if (!userId) throw new ForbiddenException("Authentication required");
    const owner = this.ownership.getOwner(missionId);
    if (owner) {
      if (owner !== userId) {
        throw new ForbiddenException(`mission ${missionId} not owned by you`);
      }
      return;
    }
    // Fallback: registry miss → 查 DB
    const persisted = await this.store.getById(missionId, userId);
    if (!persisted) {
      throw new ForbiddenException(`mission ${missionId} not found`);
    }
    // DB 命中 → 重新登记 in-memory（下次 hot path），保留 ownership
    this.ownership.assign(missionId, userId);
  }
}
