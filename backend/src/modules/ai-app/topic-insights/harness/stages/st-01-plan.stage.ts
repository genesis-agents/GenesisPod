/**
 * ST-01-PLAN · Leader 全局规划
 *
 * 调 AG-01-LD 产出 LeaderPlan。Input 源自 identity + Topic context
 * （通过 PlanContextProvider 注入，Group E 集成时接入 PrismaService）。
 */

import { Injectable, Optional } from "@nestjs/common";
import {
  HarnessAgentRegistry,
  type LeaderPlannerInput,
  type LeaderPlan,
} from "../agents";
import type {
  PipelineIdentityContext,
  Stage,
  StageResults,
} from "../pipeline/types";
import type { PlanStageOutput } from "./stage-context";

/**
 * Topic 元信息提供者 — Group E 集成时改用 Prisma 查询
 */
export abstract class PlanContextProvider {
  abstract load(identity: PipelineIdentityContext): Promise<{
    readonly topicName: string;
    readonly topicType: "MACRO" | "TECHNOLOGY" | "COMPANY" | "EVENT";
    readonly userPrompt?: string;
    readonly availableModels: ReadonlyArray<string>;
    readonly language: string;
  }>;
}

/** Stub 实现 — 测试用 */
export class StubPlanContextProvider extends PlanContextProvider {
  // eslint-disable-next-line @typescript-eslint/require-await
  async load(_identity: PipelineIdentityContext): Promise<{
    readonly topicName: string;
    readonly topicType: "MACRO" | "TECHNOLOGY" | "COMPANY" | "EVENT";
    readonly userPrompt?: string;
    readonly availableModels: ReadonlyArray<string>;
    readonly language: string;
  }> {
    return {
      topicName: "Stub Topic",
      topicType: "MACRO",
      userPrompt: "stub prompt",
      availableModels: ["stub-model-1", "stub-model-2"],
      language: "zh",
    };
  }
}

@Injectable()
export class PlanStage implements Stage<LeaderPlannerInput, PlanStageOutput> {
  readonly id = "ST-01-PLAN" as const;
  readonly name = "Leader plan";
  readonly dependsOn = ["ST-00-INIT" as const];
  readonly runsWhen = "always" as const;
  readonly slo = {
    p95Ms: 60_000,
    tokenBudget: 30_000,
    targetSuccessRate: 0.95,
  };
  readonly emitsEvents = ["leader:planning", "leader:plan_ready"];

  constructor(
    private readonly agentRegistry: HarnessAgentRegistry,
    @Optional()
    private readonly contextProvider: PlanContextProvider = new StubPlanContextProvider(),
  ) {}

  async prepare(
    identity: PipelineIdentityContext,
    _upstream: StageResults,
  ): Promise<LeaderPlannerInput> {
    const meta = await this.contextProvider.load(identity);
    return {
      topicId: identity.topicId,
      topicName: meta.topicName,
      topicType: meta.topicType,
      userPrompt: meta.userPrompt,
      availableModels: meta.availableModels,
      language: meta.language,
      researchDepth: identity.depth,
      maxDimensions: 6,
    };
  }

  async execute(
    identity: PipelineIdentityContext,
    input: LeaderPlannerInput,
    signal: AbortSignal,
  ): Promise<PlanStageOutput> {
    const runner = this.agentRegistry.mustGet<LeaderPlannerInput, LeaderPlan>(
      "AG-01-LD",
    );
    const res = await runner.run({ input, identity, signal });
    return { plan: res.output };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async persist(
    _identity: PipelineIdentityContext,
    _output: PlanStageOutput,
  ): Promise<void> {
    // Group E 接入真实 DB（写 ResearchMission.plan）
  }
}
