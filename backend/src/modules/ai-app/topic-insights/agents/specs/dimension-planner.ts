/**
 * AG-02-DP · DimensionPlanner spec
 * Plans sections within a single dimension (3-8 with dependsOn DAG).
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";
import { DimensionOutlineSchema, type DimensionOutline } from "./schemas";
// ★ 直接复用 Apr 21 baseline 的 DIMENSION_OUTLINE_PROMPT
import { DIMENSION_OUTLINE_PROMPT } from "@/modules/ai-app/topic-insights/prompts/research-leader.prompt";

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
      // ★ 直接复用 Apr 21 baseline 的 DIMENSION_OUTLINE_PROMPT 原文
      DIMENSION_OUTLINE_PROMPT,
      "",
      "## 【关键覆盖】本次调用输出 JSON：",
      "```json",
      "{",
      '  "dimensionId": "复制 input.dimensionId 原值",',
      '  "dimensionName": "复制 input.dimensionName 原值",',
      '  "sections": [                 // 长度 1-8',
      "    {",
      '      "id": "s-1",               // 短 id',
      '      "title": "章节标题",',
      '      "description": "1-2 句描述",',
      '      "targetWords": 600,        // integer >0，建议 200-1000',
      '      "keyPoints": ["≥1 条要点"],',
      '      "dependsOn": []            // 其他 section id，可空数组',
      "    }",
      "  ]",
      "}",
      "```",
      "",
      "⚠️ sections[].dependsOn 不能形成环；dimensionId 原样回传；数字是数字；严格 JSON。",
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
