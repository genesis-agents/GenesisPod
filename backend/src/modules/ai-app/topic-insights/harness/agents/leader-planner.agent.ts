/**
 * AG-01-LD · Leader (Research Planner)
 *
 * 输入 topic 信息 → 输出 LeaderPlan（3-8 dimensions + agent assignments）。
 * Access matrix：只读工具；禁止 TL-02-EVSAVE。
 */

import { Injectable, Optional } from "@nestjs/common";
import type { TaskProfile } from "@/modules/ai-engine/facade";
import { BaseAgentRunner } from "./base-agent-runner";
import { LeaderPlanSchema, type LeaderPlan } from "./schemas";
import type { AccessToolId, AgentRunContext } from "./types";
import { LlmInvokerService } from "../llm";

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
  protected readonly taskProfile: TaskProfile = {
    creativity: "low",
    outputLength: "medium",
  };

  constructor(@Optional() llmInvoker?: LlmInvokerService) {
    super(llmInvoker);
  }

  protected buildSystemPrompt(
    _ctx: AgentRunContext<LeaderPlannerInput>,
  ): string {
    return [
      "你是资深研究战略顾问，负责对研究主题做全局规划。",
      "给定一个主题，你要：",
      "1. 识别 3-8 个研究维度（根据 topicType 和 researchDepth 决定数量）",
      "2. 为每个维度写出 description / purpose / searchQueries（≥1）/ dataSources（≥1）/ priority（1-10）",
      "3. 产出 agentAssignments，包含至少 dimension_researcher / quality_reviewer / report_writer 三种角色",
      "4. 每个 agentAssignment.modelId 必须从 availableModels 中选择",
      "5. executionStrategy ∈ {sequential, parallel, hybrid}",
      "6. complexityScore 0-10 自评",
      "",
      "输出要求：严格遵循 JSON schema。不要加 markdown fence、注释、前言。",
    ].join("\n");
  }

  protected buildUserPrompt(ctx: AgentRunContext<LeaderPlannerInput>): string {
    const { input, identity } = ctx;
    const existing = input.existingDimensions?.length
      ? `\n已有维度（避免重复）：${input.existingDimensions.map((d) => d.name).join("、")}`
      : "";
    return [
      `missionId: ${identity.missionId}`,
      `topicId: ${input.topicId}`,
      `topicName: ${input.topicName}`,
      `topicType: ${input.topicType}`,
      `language: ${input.language}`,
      `researchDepth: ${input.researchDepth}`,
      `maxDimensions: ${input.maxDimensions}`,
      `availableModels: ${input.availableModels.join(", ") || "（未提供）"}`,
      input.userPrompt ? `userPrompt: ${input.userPrompt}` : "",
      existing,
      "",
      "请输出符合 LeaderPlan schema 的 JSON。",
    ]
      .filter(Boolean)
      .join("\n");
  }

  protected stubOutput(
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
          modelId: input.availableModels[0] ?? "",
          skills: ["SK-03-WRITE"],
        },
        {
          role: "quality_reviewer" as const,
          modelId: input.availableModels[1] ?? input.availableModels[0] ?? "",
        },
        {
          role: "report_writer" as const,
          modelId: input.availableModels[0] ?? "",
        },
      ],
      executionStrategy: "parallel" as const,
      complexityScore: 6,
      reasoning: `Stub plan for topic ${input.topicName} depth=${input.researchDepth}`,
    };

    return Promise.resolve({ output: plan, tokensUsed: 0, costUsd: 0 });
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
