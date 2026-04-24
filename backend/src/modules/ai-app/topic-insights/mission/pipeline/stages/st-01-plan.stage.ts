/**
 * ST-01-PLAN · Leader 全局规划
 *
 * 调 AG-01-LD 产出 LeaderPlan。Input 源自 identity + Topic context
 * （通过 PlanContextProvider 注入，Group E 集成时接入 PrismaService）。
 */

import { Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { toPrismaJson } from "@/common/utils/prisma-json.utils";
import { SpecAgentRegistry } from "@/modules/ai-engine/harness";
import type { LeaderPlannerInput } from "@/modules/ai-app/topic-insights/agents/specs";
import type { LeaderPlan } from "@/modules/ai-app/topic-insights/agents/specs/schemas";
import type { PipelineIdentityContext, Stage, StageResults } from "../types";
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
    private readonly agentRegistry: SpecAgentRegistry,
    @Optional()
    private readonly contextProvider: PlanContextProvider = new StubPlanContextProvider(),
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async prepare(
    identity: PipelineIdentityContext,
    _upstream: StageResults,
  ): Promise<LeaderPlannerInput> {
    const meta = await this.contextProvider.load(identity);
    // ★ v2: 能力快照优先：有 capabilities 就透出给 Leader（models/agents/tools/降级建议）
    const caps = identity.capabilities;
    const envChatModels = caps
      ? [
          ...caps.env.models.CHAT.map((m) => m.modelId),
          ...caps.env.models.REASONING.map((m) => m.modelId),
        ]
      : meta.availableModels;
    return {
      missionId: identity.missionId,
      topicId: identity.topicId,
      topicName: meta.topicName,
      topicType: meta.topicType,
      userPrompt: meta.userPrompt,
      availableModels:
        envChatModels.length > 0 ? envChatModels : meta.availableModels,
      language: meta.language,
      researchDepth: caps?.requestedDepth ?? identity.depth,
      maxDimensions: 6,
      availableAgentIds: caps?.env.agents,
      availableToolIds: caps?.env.tools
        .filter((t) => t.healthy)
        .map((t) => t.toolId),
      recommendedDepth: caps?.recommendedDepth,
    };
  }

  async execute(
    _identity: PipelineIdentityContext,
    input: LeaderPlannerInput,
    _signal: AbortSignal,
  ): Promise<PlanStageOutput> {
    const runner = this.agentRegistry.get<LeaderPlannerInput, LeaderPlan>(
      "AG-01-LD",
    );
    if (!runner)
      throw new Error("AG-01-LD not registered in SpecAgentRegistry");
    const res = await runner.executeSpec(input);
    if (res.state !== "completed") {
      throw new Error(
        `AG-01-LD failed: ${res.errors?.join("; ") ?? "unknown"}`,
      );
    }
    return { plan: res.output };
  }

  async persist(
    identity: PipelineIdentityContext,
    output: PlanStageOutput,
  ): Promise<void> {
    if (!this.prisma) return; // 单测环境可无 Prisma，安全 skip

    // ★ Group G-1: 把 harness plan.dimensions 落成 TopicDimension 行，
    // 并把真实 DB id 回写进 output.plan.dimensions[*].id。
    // 没有 (topicId, name) unique constraint，走 findFirst + create/update。
    const prisma = this.prisma;
    const upserted = await Promise.all(
      output.plan.dimensions.map(async (d, idx) => {
        const existing = await prisma.topicDimension.findFirst({
          where: { topicId: identity.topicId, name: d.name },
          select: { id: true },
        });
        if (existing) {
          await prisma.topicDimension.update({
            where: { id: existing.id },
            data: {
              description: d.description,
              searchQueries: toPrismaJson(d.searchQueries),
              searchSources: toPrismaJson(d.dataSources),
              sortOrder: idx,
            },
          });
          return { id: existing.id };
        }
        return prisma.topicDimension.create({
          data: {
            topicId: identity.topicId,
            name: d.name,
            description: d.description,
            searchQueries: toPrismaJson(d.searchQueries),
            searchSources: toPrismaJson(d.dataSources),
            sortOrder: idx,
          },
          select: { id: true },
        });
      }),
    );

    // Mutate plan.dimensions in place to carry真 DB id（后续 stage 依赖）
    const mutablePlan = output.plan as {
      dimensions: Array<{ id: string } & Record<string, unknown>>;
    };
    for (let i = 0; i < mutablePlan.dimensions.length; i++) {
      mutablePlan.dimensions[i].id = upserted[i].id;
    }

    // H3 single-dimension scope: after IDs are assigned, prune plan.dimensions
    // to just the scoped ids so all downstream stages (RESEARCH/WRITE/REVIEW/
    // INTEGRATE/REMEDIATE) naturally operate on the subset.
    if (identity.dimensionScope && identity.dimensionScope.length > 0) {
      const wanted = new Set(identity.dimensionScope);
      const filtered = mutablePlan.dimensions.filter(
        (d) =>
          (typeof d.id === "string" && wanted.has(d.id)) ||
          (typeof d.name === "string" && wanted.has(d.name)),
      );
      mutablePlan.dimensions.length = 0;
      mutablePlan.dimensions.push(...filtered);
    }

    await prisma.researchMission.update({
      where: { id: identity.missionId },
      data: {
        leaderPlan: toPrismaJson(output.plan),
        totalTasks: output.plan.dimensions.length,
      },
    });
  }
}
