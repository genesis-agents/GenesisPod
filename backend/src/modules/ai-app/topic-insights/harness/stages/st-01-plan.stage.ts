/**
 * ST-01-PLAN · Leader 全局规划
 *
 * 调 AG-01-LD 产出 LeaderPlan。Input 源自 identity + Topic context
 * （通过 PlanContextProvider 注入，Group E 集成时接入 PrismaService）。
 */

import { Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { toPrismaJson } from "@/common/utils/prisma-json.utils";
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
  load(_identity: PipelineIdentityContext): Promise<{
    readonly topicName: string;
    readonly topicType: "MACRO" | "TECHNOLOGY" | "COMPANY" | "EVENT";
    readonly userPrompt?: string;
    readonly availableModels: ReadonlyArray<string>;
    readonly language: string;
  }> {
    return Promise.resolve({
      topicName: "Stub Topic",
      topicType: "MACRO" as const,
      userPrompt: "stub prompt",
      availableModels: ["stub-model-1", "stub-model-2"],
      language: "zh",
    });
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
    @Optional() private readonly prisma?: PrismaService,
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

  async persist(
    identity: PipelineIdentityContext,
    output: PlanStageOutput,
  ): Promise<void> {
    if (!this.prisma) return; // 单测环境可无 Prisma，安全 skip
    await this.prisma.researchMission.update({
      where: { id: identity.missionId },
      data: {
        leaderPlan: toPrismaJson(output.plan),
        totalTasks: output.plan.dimensions.length,
      },
    });
  }
}
