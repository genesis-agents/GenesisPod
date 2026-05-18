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
  ConflictException,
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

    try {
      const summary = await this.dispatcher.runRefreshMission(
        {
          topicId,
          trigger: "MANUAL",
          topicName: topic.name,
          keywords: parseKeywords(topic.keywords),
          description: topic.description,
          entityType: topic.entityType,
          refreshCron: topic.refreshCron,
        },
        req.user.id,
      );
      this.log.log(
        `Manual refresh topic=${topicId} mission=${summary.missionId} status=${summary.status}`,
      );
      return {
        runId: summary.missionId,
        status: summary.status,
      };
    } catch (err) {
      if (err instanceof ConflictException) throw err;
      throw err;
    }
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
