/**
 * AG-01-LD · Leader (Research Planner)
 *
 * 输入 topic 信息 → 输出 LeaderPlan（3-8 dimensions + agent assignments）。
 * Access matrix：只读工具；禁止 TL-02-EVSAVE。
 */

import { Injectable } from "@nestjs/common";
import { BaseAgentRunner } from "./base-agent-runner";
import { LeaderPlanSchema, type LeaderPlan } from "./schemas";
import type { AccessToolId, AgentRunContext } from "./types";

export interface LeaderPlannerInput {
  readonly topicId: string;
  readonly topicName: string;
  readonly topicType: "MACRO" | "TECHNOLOGY" | "COMPANY" | "EVENT";
  readonly userPrompt?: string;
  readonly availableModels: ReadonlyArray<string>;
  readonly language: string;
  readonly researchDepth: "quick" | "standard" | "thorough" | "deep";
  readonly maxDimensions: number;
  readonly existingDimensions?: ReadonlyArray<{ id: string; name: string }>;
}

@Injectable()
export class LeaderPlannerAgent extends BaseAgentRunner<
  LeaderPlannerInput,
  LeaderPlan
> {
  readonly id = "AG-01-LD";
  readonly name = "Research Leader";
  readonly tools: ReadonlyArray<AccessToolId> = [
    "short-term-memory",
    "long-term-memory",
    "rag-search",
    "knowledge-graph",
    "TL-07-MODEL",
  ];
  readonly forbiddenTools: ReadonlyArray<AccessToolId> = ["TL-02-EVSAVE"];
  readonly outputSchema = LeaderPlanSchema;

  protected async executeImpl(
    _ctx: AgentRunContext<LeaderPlannerInput>,
  ): Promise<{ output: unknown; tokensUsed: number; costUsd: number }> {
    // Tier Core Group E 集成时接入 AiChatService
    throw new Error(
      `[${this.id}] Real LLM execution not yet wired — use HARNESS_AGENTS_STUB=1`,
    );
  }

  protected async stubOutput(
    ctx: AgentRunContext<LeaderPlannerInput>,
  ): Promise<{ output: unknown; tokensUsed: number; costUsd: number }> {
    const { input, identity } = ctx;
    const dimCount = Math.max(3, Math.min(input.maxDimensions, 6));
    const dimensions = Array.from({ length: dimCount }).map((_, idx) => ({
      id: `${identity.missionId}-dim-${idx + 1}`,
      name: `stub 维度 ${idx + 1}`,
      description: `针对 ${input.topicName} 的 ${input.topicType} 类型，探索维度 ${idx + 1}`,
      purpose: `分析 ${input.topicName} 在维度 ${idx + 1} 的核心问题`,
      searchQueries: [`${input.topicName} 维度${idx + 1} 趋势`],
      dataSources: ["web-search", "rag-search"],
      priority: idx + 1,
    }));

    const plan = {
      missionId: identity.missionId,
      dimensions,
      agentAssignments: [
        {
          role: "dimension_researcher" as const,
          modelId: input.availableModels[0] ?? "default",
          skills: ["SK-03-WRITE"],
        },
        {
          role: "quality_reviewer" as const,
          modelId:
            input.availableModels[1] ?? input.availableModels[0] ?? "default",
        },
        {
          role: "report_writer" as const,
          modelId: input.availableModels[0] ?? "default",
        },
      ],
      executionStrategy: "parallel" as const,
      complexityScore: 6,
      reasoning: `Stub plan for topic ${input.topicName} depth=${input.researchDepth}`,
    };

    return { output: plan, tokensUsed: 0, costUsd: 0 };
  }

  /**
   * Business rule：agentAssignments.modelId 必须在 availableModels 里
   * （或用户传空 availableModels 时跳过）
   */
  protected validateBusinessRules(
    output: LeaderPlan,
    ctx: AgentRunContext<LeaderPlannerInput>,
  ): void {
    const available = new Set(ctx.input.availableModels);
    if (available.size === 0) return;
    for (const a of output.agentAssignments) {
      if (!available.has(a.modelId)) {
        throw new Error(
          `[${this.id}] agentAssignment role=${a.role} uses model ${a.modelId} not in availableModels`,
        );
      }
    }
  }
}
