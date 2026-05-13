/**
 * AgentPlaygroundController — 后端 REST 入口
 */

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { randomUUID, timingSafeEqual } from "crypto";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import {
  RateLimit,
  RateLimitGuard,
} from "../../../common/guards/rate-limit.guard";
import { Public } from "../../../common/decorators/public.decorator";
import type { RequestWithUser } from "../../../common/types/express-request.types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  RunMissionInputSchema,
  type RunMissionInput,
} from "./dto/run-mission.dto";
import {
  MissionElectionTracker,
  MissionOwnershipRegistry,
} from "@/modules/ai-harness/facade";
import { MissionEventBuffer } from "./services/mission/lifecycle/mission-event-buffer.service";
import { MissionStore } from "./services/mission/lifecycle/mission-store.service";
// ★ Phase 5 (2026-04-29): 接入 ai-harness 沉淀的 MissionCheckpointService
import { MissionCheckpointService } from "@/modules/ai-harness/facade";
import { LeaderChatService } from "./services/chat/leader-chat.service";
import { MissionAbortRegistry } from "@/modules/ai-harness/facade";
import { LocalRerunService } from "./services/mission/rerun/local-rerun.service";
import { MissionRerunOrchestratorService } from "./services/mission/rerun/mission-rerun-orchestrator.service";
import { MissionExportService } from "./services/export/mission-export.service";
// ★ R2-C 单轨化（2026-05-04）：删除 legacy TeamMission + RuntimeFlagService
//   pipeline-v1 现在是唯一 mission 路径。dispatcher 即 trunk。
import { PlaygroundPipelineDispatcher } from "./services/mission/workflow/playground-pipeline-dispatcher.service";

@Controller("agent-playground")
@UseGuards(JwtAuthGuard)
export class AgentPlaygroundController {
  private readonly log = new Logger(AgentPlaygroundController.name);

  constructor(
    private readonly buffer: MissionEventBuffer,
    private readonly ownership: MissionOwnershipRegistry,
    private readonly store: MissionStore,
    private readonly leaderChat: LeaderChatService,
    private readonly abortRegistry: MissionAbortRegistry,
    private readonly prisma: PrismaService,
    private readonly checkpoint: MissionCheckpointService,
    private readonly localRerun: LocalRerunService,
    private readonly exportService: MissionExportService,
    private readonly rerunOrchestrator: MissionRerunOrchestratorService,
    private readonly electionTracker: MissionElectionTracker,
    // ★ R2-C 单轨化：pipelineDispatcher 是唯一 mission orchestrator
    private readonly pipelineDispatcher: PlaygroundPipelineDispatcher,
  ) {}

  private isDevTriggerAuthorized(presentedToken?: string): boolean {
    const expectedToken = process.env.AGENT_PLAYGROUND_DEV_TRIGGER_TOKEN;
    if (!expectedToken || !presentedToken) return false;
    const expected = Buffer.from(expectedToken);
    const presented = Buffer.from(presentedToken);
    return (
      expected.length === presented.length &&
      timingSafeEqual(expected, presented)
    );
  }

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
   * GET /api/v1/agent-playground/missions/resumable
   * ★ Phase 5: 列出当前用户有 checkpoint 的可恢复 mission
   * 让前端展示"上次中断的 mission，可继续"
   */
  @Get("missions/resumable")
  async listResumable(@Request() req: RequestWithUser): Promise<{
    items: { missionId: string; savedAt: string; completedKeys: string[] }[];
  }> {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException("Authentication required");
    const snapshots = await this.checkpoint.listResumable(userId);
    return {
      items: snapshots.map((s) => ({
        missionId: s.missionId,
        savedAt: s.savedAt.toISOString(),
        completedKeys: s.completedKeys,
      })),
    };
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
    if (mission) return { mission };
    // ★ R-LIVE-4 (2026-04-30): mission 启动后 5s 内 GET → store.getById null
    //   (store.create 未跑完) 但 in-memory ownership 已 assign。这里降级返回
    //   "starting" 占位，避免前端 detail 页面被 403 顶掉；前端轮询会拉到完整
    //   row 后渲染真实数据。仅 in-memory 已确认 ownership 才允许，否则仍 403。
    const owner = this.ownership.getOwner(id);
    if (owner === userId) {
      this.log.debug(
        `[getMission ${id}] DB row not yet persisted; returning ownership-confirmed pending placeholder`,
      );
      return {
        mission: {
          id,
          status: "starting",
          startedAt: new Date().toISOString(),
        },
      };
    }
    throw new ForbiddenException("Mission not found");
  }

  /**
   * GET /api/v1/agent-playground/missions/:id/export?format=csv-facts|csv-citations|markdown
   * Phase P1-8: 数据集导出（mission-pipeline-baseline.md §7.9）
   */
  // ★ 全覆盖审计修 (2026-05-06): format 参数无 whitelist，任意字符串可透传到 exportService，
  //   存在路径注入 / 非预期格式 handler 被触达的风险。显式枚举允许值，其余抛 BadRequest。
  private static readonly ALLOWED_EXPORT_FORMATS = new Set([
    "md",
    "markdown",
    "json",
    "pdf",
    "docx",
    "csv-facts",
    "csv-citations",
  ]);

  @Get("missions/:id/export")
  async exportMission(
    @Param("id") id: string,
    @Query("format") format: string,
    @Request() req: RequestWithUser,
  ): Promise<{ filename: string; mimeType: string; content: string }> {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException("Authentication required");
    if (
      !format ||
      !AgentPlaygroundController.ALLOWED_EXPORT_FORMATS.has(format)
    ) {
      throw new BadRequestException(
        `Invalid export format "${format ?? ""}". Allowed: ${[...AgentPlaygroundController.ALLOWED_EXPORT_FORMATS].join(", ")}`,
      );
    }
    return this.exportService.export(id, userId, format);
  }

  /**
   * GET /api/v1/agent-playground/missions/:id/report-versions
   * 报告版本列表（不含 reportFull，仅 summary 字段，用于版本切换器下拉）。
   * mission 没有任何 rerun 时返回空列表（前端兜底用 mission.report_full 当 v1）。
   */
  @Get("missions/:id/report-versions")
  async listMissionReportVersions(
    @Param("id") id: string,
    @Request() req: RequestWithUser,
  ): Promise<{
    items: Array<{
      version: number;
      versionLabel: string | null;
      reportTitle: string | null;
      reportSummary: string | null;
      finalScore: number | null;
      leaderSigned: boolean | null;
      triggerType: string;
      generatedAt: string;
    }>;
  }> {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException("Authentication required");
    // ownership 校验：拉不到 mission 行 → 不属于当前用户（或不存在）
    const mission = await this.store.getById(id, userId);
    if (!mission) throw new ForbiddenException("Mission not found");
    const rows = await this.store.listReportVersions(id);
    return {
      items: rows.map((r) => ({
        version: r.version,
        versionLabel: r.versionLabel,
        reportTitle: r.reportTitle,
        reportSummary: r.reportSummary,
        finalScore: r.finalScore,
        leaderSigned: r.leaderSigned,
        triggerType: r.triggerType,
        generatedAt: r.generatedAt.toISOString(),
      })),
    };
  }

  /**
   * GET /api/v1/agent-playground/missions/:id/report-versions/:version
   * 单版本完整 reportFull（用于版本切换时替换 ArtifactReader 的 artifact prop）。
   */
  @Get("missions/:id/report-versions/:version")
  async getMissionReportVersion(
    @Param("id") id: string,
    @Param("version") versionRaw: string,
    @Request() req: RequestWithUser,
  ): Promise<{
    version: number;
    versionLabel: string | null;
    triggerType: string;
    generatedAt: string;
    reportFull: unknown;
    changesFromPrev: unknown;
  }> {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException("Authentication required");
    const version = Number.parseInt(versionRaw, 10);
    if (!Number.isFinite(version) || version <= 0) {
      throw new BadRequestException("version must be a positive integer");
    }
    const mission = await this.store.getById(id, userId);
    if (!mission) throw new ForbiddenException("Mission not found");
    const row = await this.store.getReportVersion(id, version);
    if (!row) {
      throw new BadRequestException(
        `Report version v${version} not found for mission ${id}`,
      );
    }
    return {
      version: row.version,
      versionLabel: row.versionLabel,
      triggerType: row.triggerType,
      generatedAt: row.generatedAt.toISOString(),
      reportFull: row.reportFull,
      changesFromPrev: row.changesFromPrev,
    };
  }

  /**
   * POST /api/v1/agent-playground/dev/trigger-mission
   *
   * 内部触发端点 —— 让外部脚本（npm scripts / sh / curl）能启动 mission，
   * 不依赖前端 / JWT。鉴权方式：必须传 userApiKeyId（user_api_keys 表主键 UUID），
   * 后端校验该 id 真实存在 → 反查 user_id → 启动 mission。
   *
   * 这等价于"持有 BYOK API 密钥记录的 ID"才能触发，相当于密钥所有人凭证。
   * 不公开访问（id 是 UUID v4，不可猜测，且需要数据库直接读取才能拿到）。
   */
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({
    maxRequests: 3,
    windowSeconds: 60,
    keyType: "ip",
  })
  @Post("dev/trigger-mission")
  async devTriggerMission(
    @Body()
    body: { userApiKeyId: string; input: unknown; internalToken?: string },
    @Headers("x-agent-playground-token") headerToken?: string,
  ): Promise<{ missionId: string }> {
    if (!this.isDevTriggerAuthorized(headerToken ?? body?.internalToken)) {
      throw new ForbiddenException("dev trigger disabled or unauthorized");
    }
    if (!body?.userApiKeyId) {
      throw new BadRequestException("userApiKeyId required");
    }
    // 反查 user_id —— prisma typed accessor 名为 userApiKey
    const apiKey = await this.prisma.userApiKey.findUnique({
      where: { id: body.userApiKeyId },
      select: { userId: true },
    });
    if (!apiKey) {
      throw new ForbiddenException(
        `userApiKeyId ${body.userApiKeyId} not found`,
      );
    }
    const userId = apiKey.userId;
    const parsed = RunMissionInputSchema.safeParse(body.input);
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
    void this.pipelineDispatcher
      .runMission(missionId, input, userId)
      .catch((err: unknown) => {
        this.log.error(
          `dev-trigger mission ${missionId} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    return { missionId };
  }

  /**
   * POST /api/v1/agent-playground/team/run
   *
   * fire-and-forget：立刻返回 missionId，mission 在后台跑，前端通过 socket join 监听事件。
   * 同时 /replay 端点提供 polling fallback。
   */
  @Post("team/run")
  @UseGuards(RateLimitGuard)
  @RateLimit({
    maxRequests: 30,
    windowSeconds: 60,
    message: "启动 mission 过于频繁，请稍后再试",
  })
  async runTeam(
    @Body() body: unknown,
    @Request() req: RequestWithUser,
  ): Promise<{
    missionId: string;
    streamNamespace: string;
  }> {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException("Authentication required");

    // ★ P0 并发限制 (2026-05-06): 每 user 最多 3 个并发 running mission，
    // 超过时拒绝启动，防止单用户打爆 pod 内存和 DB 连接。
    const MAX_CONCURRENT_MISSIONS = 3;
    const running = await this.store.countRunningByUser(userId);
    if (running >= MAX_CONCURRENT_MISSIONS) {
      throw new BadRequestException(
        `已有 ${running} 个 mission 正在运行，最多同时运行 ${MAX_CONCURRENT_MISSIONS} 个，请等待完成后再启动`,
      );
    }

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

    // ★ R2-C 单轨化：pipelineDispatcher 是唯一 mission 入口
    void this.pipelineDispatcher
      .runMission(missionId, input, userId)
      .catch((err: unknown) => {
        this.log.error(
          `mission ${missionId} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    return {
      missionId,
      streamNamespace: "agent-playground",
    };
  }

  /**
   * POST /api/v1/agent-playground/missions/:id/rerun?mode=fresh|incremental
   *
   * 用原 mission 的 userProfile 全字段启动新 mission：
   *   - mode=fresh       全新从头跑（清 checkpoint）— "开始"按钮语义
   *   - mode=incremental 跳过已完成 stage（clone checkpoint）— "更新"按钮语义，
   *                      对齐 Topic Insight handleContinueResearch 模式
   * 默认 incremental（向后兼容）。
   */
  @Post("missions/:id/rerun")
  @UseGuards(RateLimitGuard)
  @RateLimit({
    maxRequests: 30,
    windowSeconds: 60,
    message: "重跑 mission 过于频繁，请稍后再试",
  })
  async rerunMission(
    @Param("id") missionId: string,
    @Query("mode") mode: string | undefined,
    @Request() req: RequestWithUser,
  ): Promise<{ missionId: string; streamNamespace: string }> {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException("Authentication required");
    await this.assertOwnership(missionId, userId);
    const resolvedMode: "fresh" | "incremental" =
      mode === "fresh" ? "fresh" : "incremental";
    return this.rerunOrchestrator.rerunFullMission(
      missionId,
      userId,
      resolvedMode,
    );
  }

  /**
   * POST /api/v1/agent-playground/missions/:id/todos/:todoId/rerun
   *
   * 单 todo 重跑 v1 —— 创建新 mission，沿用原 input + 注入 focusHint，
   *   让 leader 在 S2 plan 阶段重点优化该 dim/chapter/finding。
   *
   * 不允许重跑：origin = leader-assess-abort（已放弃）/ system:s11-persist（终态归档）。
   *
   * 前端必须在 body 携带 todo 的语义信息（origin / scope / dimensionRef / chapterIndex /
   * todoTitle）—— todoId 是前端 derive 的虚拟 ID，后端无法独立解析。
   */
  @Post("missions/:id/todos/:todoId/rerun")
  @UseGuards(RateLimitGuard)
  @RateLimit({
    maxRequests: 30,
    windowSeconds: 60,
    message: "todo 重跑过于频繁，请稍后再试",
  })
  async rerunTodo(
    @Param("id") missionId: string,
    @Param("todoId") todoId: string,
    @Body()
    body: {
      origin?: string;
      scope?: "dimension" | "chapter" | "review" | "system" | "mission";
      dimensionRef?: string;
      chapterIndex?: number;
      todoTitle?: string;
      reasonText?: string;
    },
    @Request() req: RequestWithUser,
  ): Promise<{ missionId: string; streamNamespace: string }> {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException("Authentication required");
    await this.assertOwnership(missionId, userId);
    return this.rerunOrchestrator.rerunFromTodo({
      sourceMissionId: missionId,
      userId,
      todoId,
      body,
    });
  }

  /**
   * POST /api/v1/agent-playground/missions/:id/todos/:todoId/local-rerun
   *
   * 单 stage 局部重跑（B 路线）—— 与 rerunTodo 对偶：
   *   ✓ 复用原 missionId（不创建新 mission）
   *   ✓ 跑指定的 stage（按 todo.scope 路由）
   *   ✓ 产物 patch 回原 mission（markRerunPatch）
   *   ✓ 失败时原产物保留
   *
   * v1 仅支持 system:s9b（10 维客观评审重跑）。其它 scope 抛 BadRequest，
   * 调用方应该 fallback 到老 rerunTodo（开新研究）。
   */
  @Post("missions/:id/todos/:todoId/local-rerun")
  @UseGuards(RateLimitGuard)
  // ★ 2026-05-08 task #152 用户反馈"429 限制过严"：单 stage 局部重跑是最细粒度
  //   操作（复用 missionId 无新 mission 开销），用户可能连续点多个 stage 修复
  //   报告。原 10/60s 在 6+ stage mission 中容易打满。改 30/60s（与 Leader Chat
  //   同档，符合"细粒度交互"特点），仍低于 60/60s 的高频读类限流。
  @RateLimit({
    maxRequests: 30,
    windowSeconds: 60,
    message: "局部重跑过于频繁，请稍后再试",
  })
  async localRerunTodo(
    @Param("id") missionId: string,
    @Param("todoId") todoId: string,
    @Body()
    body: {
      origin?: string;
      scope?: "dimension" | "chapter" | "review" | "system" | "mission";
      dimensionRef?: string;
      chapterIndex?: number;
      todoTitle?: string;
      reasonText?: string;
      /**
       * v1.2 PR-R7：后端 stepId 直接路由 + cascade 链。
       * 优先级 > scope/todoId 老路径。
       */
      stepId?: string;
    },
    @Request() req: RequestWithUser,
  ): Promise<{
    ok: true;
    missionId: string;
    scope: string;
    durationMs: number;
    cascade?: {
      completed: string[];
      abortedAt?: string;
      remaining?: string[];
    };
  }> {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException("Authentication required");
    await this.assertOwnership(missionId, userId);

    const result = await this.localRerun.run(
      {
        missionId,
        userId,
        todoId,
        origin: (body?.origin ?? "").trim(),
        scope: (body?.scope ?? "mission") as
          | "dimension"
          | "chapter"
          | "review"
          | "system"
          | "mission",
        dimensionRef: body?.dimensionRef?.trim() || undefined,
        chapterIndex: body?.chapterIndex,
        todoTitle: body?.todoTitle?.trim() || undefined,
        reasonText: body?.reasonText?.trim() || undefined,
        stepId: body?.stepId?.trim() || undefined,
      },
      // emit fn —— 直接走 buffer.broadcast（与老 rerunTodo 同款）
      async (args) => {
        await this.buffer.broadcast({
          type: args.type,
          scope: { missionId: args.missionId, userId: args.userId },
          payload: args.payload as Record<string, unknown>,
          timestamp: Date.now(),
        });
      },
    );
    return result;
  }

  /**
   * POST /api/v1/agent-playground/missions/:id/cancel
   * 取消运行中的 mission：DB 状态置为 cancelled，前端停止 polling。
   *
   * 限制：不会 abort 后台正在跑的 orchestrator（in-memory），但其后续写入
   * 会被 markFailed 兜底（写入 cancelled 状态会被 markCompleted 覆盖时
   * 我们在 markCompleted 里加了 guard——见 mission-store.service.ts）。
   */
  /**
   * POST /api/v1/agent-playground/error-report
   * 接收前端 mission detail ErrorBoundary 上报的渲染崩溃（contract drift / lying
   * assertion / 兜底失效等）。仅写日志（Railway stderr），不写 DB（避免崩溃风暴
   * 时打满 DB）。Logger.error 被 Railway severity=error 索引便于告警。
   */
  @Public()
  @Post("error-report")
  async reportClientError(
    @Body()
    body: {
      missionId?: string;
      message?: string;
      stack?: string;
      digest?: string;
      pathname?: string;
      userAgent?: string;
      timestamp?: string;
    },
    @Request() req: RequestWithUser,
  ): Promise<{ ok: true }> {
    const userId = req.user?.id ?? "anon";
    const safeMessage = (body.message ?? "unknown").slice(0, 500);
    const safeStack = (body.stack ?? "").slice(0, 2000);
    const missionId = body.missionId ?? "unknown";
    this.log.error(
      `[ClientError] mission=${missionId} user=${userId} digest=${body.digest ?? ""} ` +
        `path=${body.pathname ?? ""} msg="${safeMessage}"`,
    );
    if (safeStack) this.log.error(`[ClientError] stack:\n${safeStack}`);
    return { ok: true };
  }

  @Post("missions/:id/cancel")
  async cancelMission(
    @Param("id") missionId: string,
    @Request() req: RequestWithUser,
  ): Promise<{ ok: true; status: string; alreadyCancelled?: true }> {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException("Authentication required");
    await this.assertOwnership(missionId, userId);

    const persisted = await this.store.getById(missionId, userId);
    if (!persisted)
      throw new ForbiddenException(`mission ${missionId} not found`);
    // ★ 全覆盖审计修 (2026-05-06): 已 cancelled 时幂等返回 200，不抛 400（双击取消场景）
    if (persisted.status === "cancelled") {
      return { ok: true, status: "cancelled", alreadyCancelled: true };
    }
    if (persisted.status !== "running") {
      throw new BadRequestException(
        `mission ${missionId} status is ${persisted.status}, not running`,
      );
    }
    // ★ Phase P12-1: 真触发 abort signal，让正在跑的 LLM/tool call 立即中断
    this.abortRegistry.abort(missionId, "user_cancelled");
    await this.store.markCancelled(missionId);
    this.electionTracker.clear(missionId);
    // ★ 通过事件缓冲广播 mission:cancelled，让正在监听的前端实时切到「已取消」
    await this.buffer.broadcast({
      type: "agent-playground.mission:cancelled",
      scope: { missionId, userId },
      payload: { reason: "user_cancelled", message: "用户取消" },
      timestamp: Date.now(),
    });
    return { ok: true, status: "cancelled" };
  }

  /**
   * DELETE /api/v1/agent-playground/missions/:id
   * 删除当前用户的某个 mission（仅删除 DB 记录，不影响已结束的 in-memory 状态）。
   *
   * 2026-05-12 FK 事故修复：running 状态 mission 直接删会让 background workers
   *   （saveResearchResult / refreshHeartbeat）的 upsert/update 撞 FK 违约
   *   （agent_playground_research_results_mission_id_fkey）以及"No record was
   *   found for an update"（heartbeat）。要么先 cancel（abortRegistry.abort
   *   → 后台真正停 → markCancelled），要么进入终态后再 delete。
   */
  @Delete("missions/:id")
  async deleteMission(
    @Param("id") missionId: string,
    @Request() req: RequestWithUser,
  ): Promise<{ ok: true }> {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException("Authentication required");
    const persisted = await this.store.getById(missionId, userId);
    if (!persisted)
      throw new ForbiddenException(`mission ${missionId} not found`);
    if (persisted.status === "running") {
      throw new BadRequestException(
        `mission ${missionId} 状态为 running，请先 cancel 再 delete（直接删会让 background workers 撞 FK 违约）`,
      );
    }
    await this.store.deleteByUser(missionId, userId);
    this.electionTracker.clear(missionId);
    this.ownership.release(missionId);
    return { ok: true };
  }

  /**
   * PATCH /api/v1/agent-playground/missions/:id
   *
   * 修改 mission 配置：topic（任意状态可改）+ 预算字段（仅非运行状态可改）。
   *
   * 预算字段（2026-05-13）：
   *   - maxCredits：1 credit ≈ 1k tokens（10 - 100000）
   *   - budgetMultiplierOverride：每个 sub-agent token/iter 缩放（0.3 - 10）
   *   - wallTimeMs：mission 总时长上限毫秒（60000 - 10800000，即 1min-180min）
   * status 必须为 terminal（completed/cancelled/failed/quality-failed/rejected）；
   * 下一次「重跑」会读到新值生效。
   */
  @Patch("missions/:id")
  async updateMission(
    @Param("id") missionId: string,
    @Body()
    body: {
      topic?: string;
      maxCredits?: number;
      budgetMultiplierOverride?: number;
      wallTimeMs?: number;
    },
    @Request() req: RequestWithUser,
  ): Promise<{ ok: true }> {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException("Authentication required");

    // 入参先校验，再查 mission（保留 BadRequest 在 NotFound 前的语义）
    if (typeof body.topic === "string") {
      const topic = body.topic.trim();
      if (!topic) throw new BadRequestException("topic is required");
      if (topic.length > 500)
        throw new BadRequestException("topic exceeds 500 chars");
    }

    const persisted = await this.store.getById(missionId, userId);
    if (!persisted)
      throw new ForbiddenException(`mission ${missionId} not found`);

    // topic 任意状态可改
    if (typeof body.topic === "string") {
      await this.store.updateTopicByUser(missionId, userId, body.topic.trim());
    }

    // 预算字段仅非运行状态可改（store 层会再守一遍）
    const hasBudget =
      typeof body.maxCredits === "number" ||
      typeof body.budgetMultiplierOverride === "number" ||
      typeof body.wallTimeMs === "number";
    if (hasBudget) {
      if (
        typeof body.maxCredits === "number" &&
        (body.maxCredits < 10 || body.maxCredits > 100_000)
      ) {
        throw new BadRequestException("maxCredits must be 10..100000");
      }
      if (
        typeof body.budgetMultiplierOverride === "number" &&
        (body.budgetMultiplierOverride < 0.3 ||
          body.budgetMultiplierOverride > 10)
      ) {
        throw new BadRequestException(
          "budgetMultiplierOverride must be 0.3..10",
        );
      }
      if (
        typeof body.wallTimeMs === "number" &&
        (body.wallTimeMs < 60_000 || body.wallTimeMs > 180 * 60_000)
      ) {
        throw new BadRequestException(
          "wallTimeMs must be 60000..10800000 (1-180min)",
        );
      }
      const res = await this.store.updateBudgetByUser(missionId, userId, {
        maxCredits: body.maxCredits,
        wallTimeMs: body.wallTimeMs,
        budgetMultiplierOverride: body.budgetMultiplierOverride,
      });
      if (!res.ok) {
        if (res.reason === "non_terminal_status") {
          throw new BadRequestException(
            "Cannot edit budget while mission is running. Cancel first.",
          );
        }
        if (res.reason === "not_found") {
          throw new ForbiddenException(`mission ${missionId} not found`);
        }
        throw new BadRequestException(res.reason ?? "budget update failed");
      }
    }
    return { ok: true };
  }

  /**
   * GET /api/v1/agent-playground/replay/:missionId?since=<ts>
   *
   * 从 MissionEventBuffer 读取累积事件。前端可：
   *   - 初次进页面用此端点 hydrate（防 socket 断线/掉包）
   *   - WS 失败时 polling 兜底
   */
  @UseGuards(RateLimitGuard)
  @RateLimit({
    maxRequests: 60,
    windowSeconds: 60,
    keyType: "user",
  })
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
  @UseGuards(RateLimitGuard)
  @RateLimit({
    maxRequests: 30,
    windowSeconds: 60,
    message: "Leader Chat 请求过于频繁，请稍后再试",
  })
  async sendLeaderChat(
    @Param("id") missionId: string,
    @Body() body: { content?: string },
    @Request() req: RequestWithUser,
  ): Promise<{ user: unknown; assistant: unknown }> {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException("Authentication required");
    await this.assertOwnership(missionId, userId);
    // ★ P1-Q (2026-04-29): 先 trim 再校验长度 —— 否则大量空格的 4000 字符可绕过校验
    const content = (body?.content ?? "").toString().trim();
    if (!content) {
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
