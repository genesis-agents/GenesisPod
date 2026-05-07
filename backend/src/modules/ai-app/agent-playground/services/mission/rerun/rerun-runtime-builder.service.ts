/**
 * RerunMissionRuntimeBuilder — PR-R5b-FULL (2026-05-07)
 *
 * 上游：docs/architecture/ai-harness/runner/per-task-rerun-with-cascade.md v1.2
 *
 * 给 StageRerunDispatcher 用：把 hydrated ctx + runtime stub（billing/pool/leader/
 * missionAbort/budgetMultiplier）拼装成完整 MissionContext，让 stage 函数能直接调原
 * runStage 函数，不必各自自维护一套缩水版逻辑。
 *
 * 与 MissionRuntimeShellService 的关键差别（rerun vs initial run）：
 *   - 不调 store.create（mission 行已存）
 *   - 不调 validateModels / validateCredits（rerun 由 LocalRerunService 上游已校验）
 *   - 不开 wallTimer / heartbeatTimer（rerun 是同步 cascade，非长生命周期 mission）
 *   - cleanup 仅 unregister missionAbort（无 timer 要清）
 *
 * 设计：
 *   - 一次 cascade 一个 session（startSession/endSession 配对）
 *   - cascade 中所有 handler 共享同一 billing/pool/leader（避免重复构造）
 *   - cleanup 在 dispatcher 的 finally 调，保证 abortRegistry 不泄露
 */

import { Injectable, Logger } from "@nestjs/common";
import { MissionBudgetPool } from "@/modules/ai-harness/facade";
import { MissionAbortRegistry } from "@/modules/ai-harness/facade";
import { CreditsService } from "../../../../../ai-infra/credits/credits.service";
import { RuntimeEnvironmentService } from "@/modules/ai-harness/facade";
import { BillingRuntimeEnvAdapter } from "@/modules/ai-harness/facade";
import { LeaderService, type SupervisedMission } from "../../roles";
import { LeaderInvocationFactory } from "../leader-invocation.factory";
import {
  resolveBudgetMultiplier,
  resolveMissionCredits,
} from "../../../dto/run-mission.dto";
import type { HydratedMissionContext } from "./ctx-hydrator.service";
import type { MissionContext } from "../workflow/mission-context";

export interface RerunRuntimeSession {
  readonly missionId: string;
  readonly userId: string;
  readonly billing: BillingRuntimeEnvAdapter;
  readonly pool: MissionBudgetPool;
  readonly leader: SupervisedMission;
  readonly budgetMultiplier: number;
  readonly missionAbort: AbortController;
  cleanup(): void;
}

@Injectable()
export class RerunMissionRuntimeBuilder {
  private readonly log = new Logger(RerunMissionRuntimeBuilder.name);

  constructor(
    private readonly leaderInvocationFactory: LeaderInvocationFactory,
    private readonly credits: CreditsService,
    private readonly runtimeEnv: RuntimeEnvironmentService,
    private readonly abortRegistry: MissionAbortRegistry,
    private readonly leaderService: LeaderService,
  ) {}

  /**
   * 给一次 cascade 起 session（startSession 与 cleanup 配对）。
   *
   * caller（dispatcher）必须 try / finally 保证 cleanup 执行，否则 abortRegistry
   * 残留 controller 会让后续 mission 的同 missionId rerun（24h 后理论上允许）误读。
   */
  startSession(
    ctx: HydratedMissionContext,
    workspaceId?: string,
  ): RerunRuntimeSession {
    const { missionId, userId, input } = ctx;

    // ★ R1 共识 P0 (security, 2026-05-07): abortRegistry.register 内部是
    //   `map.set` 静默覆盖，若存在 stale controller（前次 mission 跑期 pod crash /
    //   cleanup 失败 / cron 重入）会丢失旧 controller 引用导致孤儿 runner。
    //   防御：register 前主动检测 + abort 旧 controller。
    const existing = this.abortRegistry.getSignal(missionId);
    if (existing && !existing.aborted) {
      this.log.warn(
        `[rerun-runtime ${missionId}] stale AbortController detected — aborting before register (orphan-prevention)`,
      );
      this.abortRegistry.abort(missionId, "rerun_replacing_stale");
      // unregister 让 register 重新分配（防 register 静默覆盖时旧 controller 引用断）
      this.abortRegistry.unregister(missionId);
    }
    const missionAbort = this.abortRegistry.register(missionId);

    const billing = new BillingRuntimeEnvAdapter(
      userId,
      workspaceId,
      this.credits,
      this.runtimeEnv,
    );
    const effectiveMaxCredits = resolveMissionCredits(input);
    const budgetMultiplier = resolveBudgetMultiplier(input);
    const pool = new MissionBudgetPool({
      maxTokens: effectiveMaxCredits * 1000,
      maxCostUsd: effectiveMaxCredits * 0.002,
    });

    const leader = this.leaderService.create(
      missionId,
      userId,
      {
        topic: input.topic,
        depth: input.depth,
        language: input.language,
        userProfile: input as Record<string, unknown>,
      },
      this.leaderInvocationFactory.build(missionId, userId, billing),
    );

    let cleaned = false;
    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      try {
        this.abortRegistry.unregister(missionId);
      } catch (err) {
        this.log.warn(
          `[rerun-runtime ${missionId}] abortRegistry.unregister failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    };

    this.log.log(
      `[rerun-runtime ${missionId}] session opened (budgetMultiplier=${budgetMultiplier}, maxCredits=${effectiveMaxCredits})`,
    );

    return {
      missionId,
      userId,
      billing,
      pool,
      leader,
      budgetMultiplier,
      missionAbort,
      cleanup,
    };
  }

  /**
   * 把 HydratedMissionContext + RerunRuntimeSession 合成完整 MissionContext。
   *
   * 复制 hydrated 字段 + 注入 runtime 字段（billing/pool/leader/budgetMultiplier/t0）。
   * 返回值类型为 MissionContext，stage 函数可直接接受。
   */
  composeMissionContext(
    ctx: HydratedMissionContext,
    session: RerunRuntimeSession,
  ): MissionContext {
    // ★ R1 共识 P0 (architect, 2026-05-07): 去 lying assertion `as unknown as MissionContext`
    //   （违反 feedback_no_lying_assertion）。剥 hydrated 标识字段 __hydrated 后 spread —
    //   HydratedMissionContext = Omit<MissionContext, runtime 5 字段> & { __hydrated, t0 }，
    //   去掉 __hydrated 再加 runtime 5 字段就是合法 MissionContext，编译期严格校验。
    //
    // ★ leader 内存隔离（架构 P0-3 回应）：每次 cascade 调 startSession 都创建 fresh
    //   SupervisedMission（session.leader），不复用前次 mission 跑期 leader 容器，
    //   所以 DB reset + leader memory 也被 reset，状态一致。
    //
    // ★ 嵌套引用浅拷贝防御（reviewer P1）：plan/researcherResults 等仍是引用共享。
    //   stage 函数遵循"赋值替换"模式（ctx.plan = newPlan）而非 in-place mutate，
    //   不会污染 hydrated；若未来 stage 改用 .push() / Object.assign 则需重审。
    const { __hydrated: _h, ...rest } = ctx;
    void _h;
    const composed: MissionContext = {
      ...rest,
      t0: ctx.t0,
      billing: session.billing,
      pool: session.pool,
      leader: session.leader,
      budgetMultiplier: session.budgetMultiplier,
    };
    return composed;
  }

  /**
   * 把 stage 跑完后回写到 hydrated ctx（让 cascade chain 中的下个 stage 看到产物）。
   *
   * MissionContext 是 mutable —— stage 通过 ctx.plan = ... 写产物，rerun 把这些
   * 增量回写到 HydratedMissionContext，让 cascade 串起来。
   */
  writeBackToHydrated(
    composed: MissionContext,
    hydrated: HydratedMissionContext,
  ): HydratedMissionContext {
    // 把 composed 的所有 phase 字段拷回 hydrated，但保留 hydrated 的标识字段
    // （__hydrated / 不可变 missionId/userId/input/t0）。runtime 字段（billing/
    // pool/leader/budgetMultiplier）从 composed 中剔除，hydrated 不存这些。
    const {
      billing: _b,
      pool: _p,
      leader: _l,
      budgetMultiplier: _bm,
      ...phaseAndInvariants
    } = composed;
    void _b;
    void _p;
    void _l;
    void _bm;
    return {
      ...hydrated,
      ...phaseAndInvariants,
      __hydrated: true,
    };
  }
}
