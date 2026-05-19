/**
 * RadarRunController（彻底重构后）
 *
 * 完全走 ai-harness mission pipeline 框架：
 *   - GET /topics/:topicId/runs: 历史 run 列表（RadarMissionStore.listByTopic）
 *   - POST /topics/:topicId/refresh: 走 RadarPipelineDispatcher.runRefreshMission
 *     （内部 openSession → orchestrator.run → emit events → cleanup）
 *   - POST /runs/:runId/cancel: dispatcher.abortMission（真停，触发 abortSignal）
 *
 * RateLimit: refresh 10/60s/user（LLM 成本风险）；list 30/60s/user（参考
 * feedback_user_action_rate_limits_loose）。
 */
import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Logger,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import {
  RateLimit,
  RateLimitGuard,
} from "../../../../common/guards/rate-limit.guard";
import type { RequestWithUser } from "../../../../common/types/express-request.types";
import { CacheService } from "@/common/cache/cache.service";
import { TriggerRefreshDto } from "../dto";
import { RadarTopicService } from "../services/topic/radar-topic.service";
import { RadarMissionStore } from "../services/mission/lifecycle/radar-mission-store.service";
import { RadarPipelineDispatcher } from "../services/mission/workflow/radar-pipeline-dispatcher.service";
import { DailyBriefingGeneratorService } from "../services/briefing/daily-briefing-generator.service";

/** FU-P2-4: 设计 §4.3 — 同一日只能 rerun ≤2 次（首次精选 + 2 次手动 = 3 上限） */
const RERUN_LIMIT_PER_DAY = 2;

@Controller("radar")
@UseGuards(JwtAuthGuard, RateLimitGuard)
export class RadarRunController {
  private readonly log = new Logger(RadarRunController.name);

  constructor(
    private readonly topics: RadarTopicService,
    private readonly store: RadarMissionStore,
    private readonly dispatcher: RadarPipelineDispatcher,
    private readonly cache: CacheService,
    private readonly dailyGenerator: DailyBriefingGeneratorService,
  ) {}

  @Get("topics/:topicId/runs")
  async list(
    @Request() req: RequestWithUser,
    @Param("topicId") topicId: string,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    await this.topics.getOwnedById(req.user.id, topicId);
    return this.store.listByTopic(topicId, req.user.id, limit);
  }

  /**
   * 单 run 详情（mission 详情页用）。
   *
   * 返回完整 RadarRun 行（含 metrics JSON / lastCompletedStage / error）。
   * ownership 校验由 store.getById 内置 userId 过滤完成。
   */
  @Get("runs/:runId")
  async getOne(@Request() req: RequestWithUser, @Param("runId") runId: string) {
    const run = await this.store.getById(runId, req.user.id);
    if (!run) throw new NotFoundException("Run not found");
    return run;
  }

  /**
   * 手动触发一次刷新 mission（通过 dispatcher.runRefreshMission）。
   *
   * 防滥用三件套：
   * 1. RateLimit 10/60s/user（controller 层）
   * 2. RadarMissionStore.createAtomic 在 $transaction 内 inflight check + create
   *    防 controller 层 race（真并发也只能有一个 running）
   * 3. RadarPipelineDispatcher.runRefreshMission 同步等 mission 完成后返回
   *    summary（v1 同步模式；前端有 ws 实时进度推送）
   */
  @Post("topics/:topicId/refresh")
  @RateLimit({
    maxRequests: 10,
    windowSeconds: 60,
    message: "刷新过于频繁，请稍候再试",
  })
  async refresh(
    @Request() req: RequestWithUser,
    @Param("topicId") topicId: string,
    @Body() _dto: TriggerRefreshDto,
  ) {
    const topic = await this.topics.getOwnedById(req.user.id, topicId);
    if (topic.status !== "ACTIVE") {
      throw new BadRequestException(
        `主题处于 ${topic.status} 状态，无法刷新，请先 resume`,
      );
    }

    // FU-P2-4: 当日 rerun 计数 + ≤2/天 闸（Redis INCR；fail-open Redis 故障不阻塞）
    const today = new Date().toISOString().slice(0, 10);
    const rerunKey = `radar:rerun:${topicId}:${today}`;
    try {
      const count = await this.cache.incrby(rerunKey, 1);
      if (count === 1) await this.cache.expire(rerunKey, 86400);
      if (count > RERUN_LIMIT_PER_DAY) {
        throw new BadRequestException(
          `今日已重新精选 ${count - 1} 次，达上限 ${RERUN_LIMIT_PER_DAY} 次`,
        );
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.log.warn(
        `rerun counter incrby failed (fail-open): ${(err as Error).message}`,
      );
    }

    // PR-DR2-FU2 UX：refresh 改 fire-and-forget。
    // 旧 sync 路径 await 整个 mission 才返回 → 前端拿 runId 时 WS 进度事件早已
    // 全 emit 完毕，订阅永远收不到 onCompleted，"采集中..."卡死且无进度可视化。
    // 新 async 路径：先生成 missionId 同步返回，mission 在后台跑 + WS 实时 emit
    // S1-S8 stage 进度 + RUN_COMPLETED；前端拿 runId 立即 WS subscribe 看到全程。
    const missionId = randomUUID();
    const userId = req.user.id;
    const topicSnapshot = {
      topicId,
      trigger: "MANUAL" as const,
      topicName: topic.name,
      keywords: parseKeywords(topic.keywords),
      description: topic.description,
      entityType: topic.entityType,
      refreshCron: topic.refreshCron,
    };

    void (async () => {
      try {
        const summary = await this.dispatcher.runRefreshMission(
          topicSnapshot,
          userId,
          { missionId },
        );
        this.log.log(
          `Manual refresh topic=${topicId} mission=${summary.missionId} status=${summary.status}`,
        );

        // PM P0-2: refresh mission 只 S1-S8，daily briefing 是 S9 路径产物，
        // 需主动触发 DailyBriefingGenerator 重生
        if (summary.status === "completed") {
          try {
            const briefingDate = new Date().toISOString().slice(0, 10);
            const result = await this.dailyGenerator.generateForTopic({
              topicId,
              userId,
              briefingDate,
              missionId: summary.missionId,
            });
            this.log.log(
              `Manual refresh briefing regenerated topic=${topicId} status=${result.status} selected=${result.selectedCount}`,
            );
          } catch (err) {
            this.log.warn(
              `Manual refresh briefing regen failed topic=${topicId}: ${(err as Error).message}`,
            );
          }
        }
      } catch (err) {
        this.log.error(
          `Manual refresh fire-and-forget failed topic=${topicId} mission=${missionId}: ${(err as Error).message}`,
        );
      }
    })();

    return {
      runId: missionId,
      status: "running" as const,
    };
  }

  @Post("runs/:runId/cancel")
  @RateLimit({
    maxRequests: 30,
    windowSeconds: 60,
    message: "取消操作过于频繁",
  })
  async cancel(@Request() req: RequestWithUser, @Param("runId") runId: string) {
    const run = await this.store.getById(runId, req.user.id);
    if (!run) throw new NotFoundException("Run not found");
    if (run.status !== "running") {
      throw new BadRequestException(
        `Run in status=${run.status}, cannot cancel`,
      );
    }
    // 真停：触发 AbortController.abort → orchestrator signal.aborted → 各 stage
    // 早断 → dispatcher finally cleanup + markCancelled
    const ok = this.dispatcher.abortMission(runId, "user_cancelled");
    if (!ok) {
      // mission 不在内存（pod restart 后）：直接 mark cancelled
      await this.store.markCancelled(runId, "user_cancelled_no_session");
    }
    return { runId, cancelled: true };
  }
}

function parseKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}
