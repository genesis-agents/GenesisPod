/**
 * AG-01-LD · Leader spec
 *
 * 目标架构 v2（docs/design/topic-insights-harness-redesign/11-target-architecture.md）：
 * 本 spec 声明式替代 harness/agents/leader-planner.agent.ts（P3 一次性删除）。
 * L2 AgentFactory 读本 spec 产出 IAgent，注册到 L2 AgentRegistry。
 *
 * 输入 TInput = LeaderPlannerInput → 输出 TOutput = LeaderPlan
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";
import { LeaderPlanSchema, type LeaderPlan } from "./schemas";

export interface LeaderPlannerInput {
  readonly missionId: string;
  readonly topicId: string;
  readonly topicName: string;
  readonly topicType: "MACRO" | "TECHNOLOGY" | "COMPANY" | "EVENT";
  readonly userPrompt?: string;
  readonly availableModels: ReadonlyArray<string>;
  readonly language: string;
  readonly researchDepth: "quick" | "standard" | "thorough" | "deep";
  readonly maxDimensions: number;
  readonly existingDimensions?: ReadonlyArray<{ id: string; name: string }>;
  /** v2 目标架构：runWithHarness 注入的能力快照信息 */
  readonly availableAgentIds?: ReadonlyArray<string>;
  readonly availableToolIds?: ReadonlyArray<string>;
  readonly recommendedDepth?: "quick" | "standard" | "thorough" | "deep";
  /**
   * F6.2 · Framework-skill markdown blocks injected from
   * FrameworkSkillPolicyRepository.loadFrameworks(topicType, eventSubtype).
   * Each string is the full body of a `.skill.md` framework (MACRO / EVENT-CRISIS
   * / etc.) and gets appended to the system prompt in order. Optional: empty
   * list = no injection, keeps legacy prompt shape.
   */
  readonly frameworkPrompts?: ReadonlyArray<string>;
}

export const LEADER_PLANNER_SPEC: IAgentSpec<LeaderPlannerInput, LeaderPlan> = {
  identity: {
    role: {
      id: "AG-01-LD",
      name: "Research Leader",
      description:
        "对研究主题做全局规划：识别维度 / 分配 agent 与模型 / 制定执行策略。",
      workStyle: "structured",
    },
    persona: {
      tone: "formal",
      language: "zh-CN",
      style: "资深研究战略顾问",
    },
    goal: {
      summary: "为给定 topic 产出 3-8 维度 + agent 分配 + 执行策略",
      successCriteria: [
        "3-8 个 dimension",
        "每个 dimension 有 searchQueries ≥ 1 / dataSources ≥ 1",
        "agentAssignments 包含 dimension_researcher / quality_reviewer / report_writer",
        "modelId 必须在 availableModels 内",
      ],
    },
    constraints: {
      maxIterations: 4,
      maxTokens: 30_000,
      maxWallTimeMs: 60_000,
      safetyLevel: "standard",
    },
    tools: [
      "short-term-memory",
      "long-term-memory",
      "rag-search",
      "knowledge-graph",
      "TL-07-MODEL",
    ],
    forbiddenTools: ["TL-02-EVSAVE"],
  },

  taskProfile: {
    creativity: "low",
    outputLength: "medium",
  },

  outputSchema: LeaderPlanSchema,

  buildSystemPrompt: (ctx) => {
    const base = [
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
    // F6.2 · When the caller supplies framework-skill bodies
    // (FrameworkSkillPolicyRepository.loadFrameworks), prepend them as domain
    // analysis framework context so the plan reflects topicType-specific method.
    const fw = ctx.input.frameworkPrompts ?? [];
    if (fw.length === 0) return base;
    return [
      base,
      "",
      "## 领域分析框架（请在规划维度时遵循以下方法论）",
      ...fw.map((body, i) => `### 框架 ${i + 1}\n${body}`),
    ].join("\n");
  },

  buildUserPrompt: (ctx) => {
    const { input } = ctx;
    const existing = input.existingDimensions?.length
      ? `\n已有维度（避免重复）：${input.existingDimensions.map((d) => d.name).join("、")}`
      : "";
    const agentsHint = input.availableAgentIds?.length
      ? `\n可用 agent 白名单: ${input.availableAgentIds.join(", ")}`
      : "";
    const toolsHint = input.availableToolIds?.length
      ? `\n可用 tool 白名单: ${input.availableToolIds.join(", ")}`
      : "";
    const depthNote =
      input.recommendedDepth && input.recommendedDepth !== input.researchDepth
        ? `\n⚠️ 环境能力对齐后建议 depth=${input.recommendedDepth}（用户请求 ${input.researchDepth}）。按 ${input.recommendedDepth} 规划。`
        : "";
    return [
      `missionId: ${input.missionId}`,
      `topicId: ${input.topicId}`,
      `topicName: ${input.topicName}`,
      `topicType: ${input.topicType}`,
      `language: ${input.language}`,
      `researchDepth: ${input.researchDepth}`,
      `maxDimensions: ${input.maxDimensions}`,
      `availableModels: ${input.availableModels.join(", ") || "（未提供）"}`,
      input.userPrompt ? `userPrompt: ${input.userPrompt}` : "",
      existing,
      agentsHint,
      toolsHint,
      depthNote,
      "",
      "请输出符合 LeaderPlan schema 的 JSON。modelId 必须来自 availableModels。",
    ]
      .filter(Boolean)
      .join("\n");
  },

  validateBusinessRules: (plan, ctx) => {
    const available = new Set(ctx.input.availableModels);
    if (available.size === 0) return;
    for (const a of plan.agentAssignments) {
      if (!available.has(a.modelId)) {
        throw new Error(
          `[AG-01-LD] agentAssignment role=${a.role} uses model "${a.modelId}" not in availableModels`,
        );
      }
    }
  },

  stubFn: async (ctx) => {
    const { input } = ctx;
    const dimCount = Math.max(3, Math.min(input.maxDimensions, 6));
    const dimensions = Array.from({ length: dimCount }).map((_, idx) => ({
      id: `${input.missionId}-dim-${idx + 1}`,
      name: `stub 维度 ${idx + 1}`,
      description: `针对 ${input.topicName} 的 ${input.topicType} 类型，探索维度 ${idx + 1}`,
      purpose: `分析 ${input.topicName} 在维度 ${idx + 1} 的核心问题`,
      searchQueries: [`${input.topicName} 维度${idx + 1} 趋势`],
      dataSources: ["web-search", "rag-search"],
      priority: idx + 1,
    }));

    return {
      missionId: input.missionId,
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
  },
};
