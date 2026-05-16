/**
 * SocialPipelineDispatcher — SocialPublishMission 入口（v1 sequential runner）
 *
 * 职责：
 *   - runMission(missionId, input, userId) 异步入口
 *   - 装配 MissionInvariants ctx + CommonDeps（注入 9 role service + invoker +
 *     failureLearner / postmortemClassifier）
 *   - 顺序 / 并发跑 13 stage adapter（同一 mission 一个 contextIds map）
 *   - emit mission lifecycle 事件（s11 内部 emit social.mission:completed）
 *   - 终态后 fire-and-forget 跑 s12 postlude
 *
 * v1 简化版（PR-4）：
 *   - 不用 MissionPipelineOrchestrator + 不用 hook builders；直接顺序 await
 *     stage adapter（PR-4.1 切到 orchestrator 形态接 cascade rerun / checkpoint）
 *   - 不持久化 mission row（PR-5 接 SocialMission DB schema）
 *   - rawContent / sessionExpiresAt 等业务字段当前 ctx 注入空值，PR-5 在
 *     mission entry 阶段从 SocialContent / SocialConnection 查询装配
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  AgentRunner,
  DomainEventBus,
  MissionAbortRegistry,
  MissionBudgetPool,
  FailureLearnerService,
  PostmortemClassifierService,
  BillingRuntimeEnvAdapter,
} from "@/modules/ai-harness/facade";
import {
  SocialAgentInvoker,
  LeaderService,
  StewardService,
  PlatformProbeService,
  ContentTransformerService,
  CoverArtistService,
  ComposerService,
  PolishReviewerService,
  PublishExecutorAgentService,
  PublishVerifierService,
} from "../../roles";
import {
  runMissionBudgetEvalStage,
  runPlatformProbeStage,
  runContentTransformStage,
  runLeaderAssessTransformStage,
  runCoverCraftStage,
  runBodyComposeStage,
  runPolishReviewStage,
  runPublishExecuteStage,
  runPublishRetryStage,
  runPublishVerifyStage,
  runLeaderSignoffStage,
  runMissionPersistStage,
  runSelfEvolutionStage,
} from "./stages";
import type {
  RunSocialMissionInput,
  MissionInvariants,
  MissionContext,
} from "./mission-context";
import type { CommonDeps } from "./mission-deps";

export interface SocialMissionSummary {
  readonly missionId: string;
  readonly status: "completed" | "failed" | "aborted";
  readonly error?: unknown;
}

@Injectable()
export class SocialPipelineDispatcher {
  private readonly log = new Logger(SocialPipelineDispatcher.name);

  constructor(
    private readonly invoker: SocialAgentInvoker,
    private readonly leader: LeaderService,
    private readonly steward: StewardService,
    private readonly platformProbe: PlatformProbeService,
    private readonly contentTransformer: ContentTransformerService,
    private readonly coverArtist: CoverArtistService,
    private readonly composer: ComposerService,
    private readonly polishReviewer: PolishReviewerService,
    private readonly publishExecutor: PublishExecutorAgentService,
    private readonly publishVerifier: PublishVerifierService,
    private readonly runner: AgentRunner,
    private readonly eventBus: DomainEventBus,
    private readonly abortRegistry: MissionAbortRegistry,
    private readonly failureLearner: FailureLearnerService,
    private readonly postmortemClassifier: PostmortemClassifierService,
  ) {}

  async runMission(
    missionId: string,
    input: RunSocialMissionInput,
    userId: string,
  ): Promise<SocialMissionSummary> {
    const t0 = Date.now();
    this.log.log(
      `[${missionId}] SocialPublishMission start; platforms=${input.platforms.join(",")}`,
    );

    // PR-4 stub: billing adapter / pool 由 dispatcher 注入空 budgetMultiplier=1
    // 占位实现；PR-5 接 BillingRuntimeEnvAdapter / MissionBudgetPool 真实例
    const billing = {} as BillingRuntimeEnvAdapter;
    const pool = {} as MissionBudgetPool;

    const contextIds: Record<string, string> = {};
    for (const platform of input.platforms) {
      const connId = input.connectionIds[platform] ?? "noconn";
      contextIds[platform] = `social-${platform}-${connId}`;
    }

    const ctx: MissionContext = {
      missionId,
      userId,
      input,
      t0,
      billing,
      pool,
      budgetMultiplier: 1,
      contextIds,
    };

    const wrapEmit = async (args: {
      type: string;
      missionId: string;
      userId: string;
      agentId?: string;
      traceId?: string;
      payload: unknown;
    }): Promise<void> => {
      await this.eventBus
        .emit({
          type: args.type,
          scope: { userId: args.userId, missionId: args.missionId },
          payload: args.payload,
          agentId: args.agentId,
          traceId: args.traceId,
          timestamp: Date.now(),
        })
        .catch(() => {
          // best-effort emit；PR-5 在 module init 阶段注册 social.* event types
          // 到 DomainEventRegistry 后会正式走广播链路
        });
    };

    const deps: CommonDeps = {
      invoker: this.invoker,
      abortRegistry: this.abortRegistry,
      runner: this.runner,
      eventBus: this.eventBus,
      log: this.log,
      emit: wrapEmit,
      lifecycle: async (mid, uid, agentId, role, phase, detail) =>
        this.invoker.emitLifecycle(mid, uid, agentId, role, phase, detail),
      markStageDegraded: async (mid, uid, stepId, reason) => {
        this.log.warn(`[${mid}] stage ${stepId} degraded: ${reason}`);
        await wrapEmit({
          type: "social.stage:degraded",
          missionId: mid,
          userId: uid,
          payload: { stepId, reason },
        });
      },
      leader: this.leader,
      steward: this.steward,
      platformProbe: this.platformProbe,
      contentTransformer: this.contentTransformer,
      coverArtist: this.coverArtist,
      composer: this.composer,
      polishReviewer: this.polishReviewer,
      publishExecutor: this.publishExecutor,
      publishVerifier: this.publishVerifier,
      failureLearner: this.failureLearner,
      postmortemClassifier: this.postmortemClassifier,
    };

    try {
      // S1-S2 序列
      await runMissionBudgetEvalStage(ctx as MissionInvariants, deps);
      await runPlatformProbeStage(ctx, deps);

      // S3-S4
      await runContentTransformStage(ctx, deps);
      await runLeaderAssessTransformStage(ctx, deps);

      // S5-S7 (多平台并发已在每 stage 内部处理)
      await runCoverCraftStage(ctx, deps);
      await runBodyComposeStage(ctx, deps);
      await runPolishReviewStage(ctx, deps);

      // S8 真发 + S8b 重试
      await runPublishExecuteStage(ctx, deps);
      await runPublishRetryStage(ctx, deps);

      // S9 回读校验
      await runPublishVerifyStage(ctx, deps);

      // S10 Leader 签字
      await runLeaderSignoffStage(ctx, deps);

      // S11 持久化
      await runMissionPersistStage(ctx, deps);

      // S12 fire-and-forget 不阻塞返回
      void this.runPostlude(ctx, deps);

      this.log.log(
        `[${missionId}] mission completed in ${(Date.now() - t0) / 1000}s`,
      );
      return { missionId, status: "completed" };
    } catch (err) {
      this.log.error(
        `[${missionId}] mission failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      await wrapEmit({
        type: "social.mission:failed",
        missionId,
        userId,
        payload: {
          error: err instanceof Error ? err.message : String(err),
          wallTimeMs: Date.now() - t0,
        },
      });

      // S12 也跑（postmortem 学失败）
      void this.runPostlude(ctx, deps);

      return { missionId, status: "failed", error: err };
    } finally {
      // PR-4 stub: relay clearMission；PR-5 加 session cleanup
      this.invoker.clearMissionRelayState(missionId);
    }
  }

  private async runPostlude(
    ctx: MissionContext,
    deps: CommonDeps,
  ): Promise<void> {
    try {
      await runSelfEvolutionStage(ctx, deps);
    } catch (err) {
      this.log.warn(
        `[${ctx.missionId}] postlude S12 threw: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
