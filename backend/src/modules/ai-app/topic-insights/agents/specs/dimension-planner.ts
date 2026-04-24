/**
 * AG-02-DP · DimensionPlanner spec
 * Plans sections within a single dimension (3-8 with dependsOn DAG).
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";
import { DimensionOutlineSchema, type DimensionOutline } from "./schemas";

export interface DimensionPlannerInput {
  readonly dimensionId: string;
  readonly dimensionName: string;
  readonly dimensionDescription: string;
  readonly allDimensions: ReadonlyArray<{
    id: string;
    name: string;
    description: string;
  }>;
  readonly researchDepth: "quick" | "standard" | "thorough" | "deep";
}

export const DIMENSION_PLANNER_SPEC: IAgentSpec<
  DimensionPlannerInput,
  DimensionOutline
> = {
  identity: {
    role: {
      id: "AG-02-DP",
      name: "Dimension Planner",
      description:
        "给定单个 dimension，规划 3-8 个 sections（带 dependsOn DAG）。",
      workStyle: "structured",
    },
    persona: { tone: "formal", language: "zh-CN", style: "研究规划员" },
    goal: { summary: "产出 DimensionOutline（sections + deps）" },
    constraints: {
      maxIterations: 3,
      maxTokens: 15_000,
      maxWallTimeMs: 45_000,
      safetyLevel: "standard",
    },
    tools: ["TL-04-DIMMEM", "rag-search"],
    forbiddenTools: ["TL-02-EVSAVE"],
  },
  taskProfile: { creativity: "low", outputLength: "medium" },
  outputSchema: DimensionOutlineSchema,

  buildSystemPrompt: () =>
    [
      "你是维度规划员。给定一个 dimension 和所有兄弟 dimensions 上下文，输出 3-8 个 sections。",
      "约束：",
      "1. 每个 section 有 id / title / description / targetWords (200-1000) / keyPoints (≥1) / dependsOn (数组，可空)",
      "2. section 之间的 dependsOn 不能形成环",
      "3. 避免与其他 dimension 内容重复",
      "",
      "严格 JSON 输出。",
    ].join("\n"),

  buildUserPrompt: (ctx) => {
    const { input } = ctx;
    const others = input.allDimensions
      .filter((d) => d.id !== input.dimensionId)
      .map((d) => `- ${d.name}: ${d.description}`)
      .join("\n");
    return [
      `当前维度: ${input.dimensionName} (id=${input.dimensionId})`,
      `描述: ${input.dimensionDescription}`,
      `研究深度: ${input.researchDepth}`,
      "",
      "兄弟维度（避免内容重叠）:",
      others || "(无)",
      "",
      "请输出 DimensionOutline JSON。",
    ].join("\n");
  },

  stubFn: async (ctx) => {
    const { input } = ctx;
    const count = input.researchDepth === "thorough" ? 4 : 2;
    return {
      dimensionId: input.dimensionId,
      dimensionName: input.dimensionName,
      sections: Array.from({ length: count }).map((_, idx) => ({
        id: `${input.dimensionId}-s-${idx + 1}`,
        title: `${input.dimensionName} - 子章节 ${idx + 1}`,
        description: `针对 ${input.dimensionName} 的子章节 ${idx + 1}`,
        targetWords: 400,
        keyPoints: [`要点 A${idx + 1}`, `要点 B${idx + 1}`],
        dependsOn: idx === 0 ? [] : [`${input.dimensionId}-s-${idx}`],
      })),
    };
  },
};
