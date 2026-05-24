/**
 * RerunMissionRuntimeBuilder — playground 业务子类(继承 BusinessTeamRerunRuntimeBuilderFramework)
 *
 * 上游：docs/architecture/ai-harness/runner/per-task-rerun-with-cascade.md v1.2
 *
 * 2026-05-24 P5 (Wave 1)：stale-protect / makeCleanup idempotent guard 骨架已上提到
 * ai-harness/teams/business-team/rerun/business-team-rerun-runtime-builder.framework。
 * 本类只剩业务 hooks：
 *   - buildSession: playground billing / pool / leader / abort 装配
 *   - composeMissionContext / writeBackToHydrated: playground MissionContext shape
 */

import { Injectable } from "@nestjs/common";
import {
  MissionBudgetPool,
  ResolvedBudgetCaps,
  MissionAbortRegistry,
  BusinessTeamRerunRuntimeBuilderFramework,
  RuntimeEnvironmentService,
  BillingRuntimeEnvAdapter,
  type BusinessTeamRerunRuntimeSession,
  type RerunRuntimeComposerHooks,
} from "@/modules/ai-harness/facade";
import { CreditsService } from "../../../../ai-infra/credits/credits.service";
import { LeaderService, type SupervisedMission } from "../roles";
import { LeaderInvocationFactory } from "../pipeline/leader-invocation.factory";
import {
  resolveBudgetMultiplier,
  resolveMissionCredits,
} from "../../api/dto/run-mission.dto";
import type { HydratedMissionContext } from "./ctx-hydrator.service";
import type { MissionContext } from "../context/mission-context";

export interface RerunRuntimeSession extends BusinessTeamRerunRuntimeSession {
  readonly billing: BillingRuntimeEnvAdapter;
  readonly pool: MissionBudgetPool;
  readonly leader: SupervisedMission;
  readonly budgetMultiplier: number;
  readonly missionAbort: AbortController;
}

@Injectable()
export class RerunMissionRuntimeBuilder extends BusinessTeamRerunRuntimeBuilderFramework<
  HydratedMissionContext,
  MissionContext,
  RerunRuntimeSession
> {
  constructor(
    leaderInvocationFactory: LeaderInvocationFactory,
    credits: CreditsService,
    runtimeEnv: RuntimeEnvironmentService,
    abortRegistry: MissionAbortRegistry,
    leaderService: LeaderService,
  ) {
    const hooks: RerunRuntimeComposerHooks<
      HydratedMissionContext,
      MissionContext,
      RerunRuntimeSession
    > = {
      buildSession: ({ ctx, workspaceId }) => {
        const { missionId, userId, input } = ctx;
        this.protectStaleAbortController(missionId);
        const missionAbort = abortRegistry.register(missionId);

        const billing = new BillingRuntimeEnvAdapter(
          userId,
          workspaceId,
          credits,
          runtimeEnv,
        );
        const effectiveMaxCredits = resolveMissionCredits(input);
        const budgetMultiplier = resolveBudgetMultiplier(input);
        const pool = new MissionBudgetPool(
          ResolvedBudgetCaps.resolve({
            maxCredits: effectiveMaxCredits,
            budgetMultiplier,
          }).toTokenBudget(),
        );

        const leader = leaderService.create(
          missionId,
          userId,
          {
            topic: input.topic,
            depth: input.depth,
            language: input.language,
            userProfile: input as Record<string, unknown>,
          },
          leaderInvocationFactory.build(missionId, userId, billing),
        );

        const cleanup = this.makeCleanup(missionId);
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
      },
      composeMissionContext: (ctx, session) => {
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
      },
      writeBackToHydrated: (composed, hydrated) => {
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
      },
    };
    super(abortRegistry, hooks, "agent-playground");
  }
}
