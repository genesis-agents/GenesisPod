/**
 * AG-16-MA · MissionAdjuster spec
 */

/**
 * NOTE: Apr 21 baseline 没有 mission-adjuster prompt（baseline 用 orchestrator
 * 直接判断 budget/quality 信号，没有 LLM 咨询步骤）。harness 新 spec 保留本地
 * prompt（JSON schema 格式，符合"budget/quality → 决策"语义）。
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";
import { MissionAdjustmentSchema, type MissionAdjustment } from "./schemas";

export interface MissionAdjusterInput {
  readonly budgetUsagePct: number;
  readonly currentDepth: "quick" | "standard" | "thorough" | "deep";
  readonly completedStages: ReadonlyArray<string>;
  readonly pendingStages: ReadonlyArray<string>;
  readonly qualityScore?: number;
  readonly elapsedMs: number;
}

export const MISSION_ADJUSTER_SPEC: IAgentSpec<
  MissionAdjusterInput,
  MissionAdjustment
> = {
  identity: {
    role: {
      id: "AG-16-MA",
      name: "Mission Adjuster",
      description:
        "budget/质量信号下的 mission 策略调整（continue / downgrade / extend_budget / abort）。",
      workStyle: "structured",
    },
    persona: { tone: "formal", language: "zh-CN", style: "调度员" },
    goal: {
      summary:
        "产出 MissionAdjustment（decision + reason + recommendedActions）",
    },
    constraints: {
      maxIterations: 2,
      maxTokens: 5_000,
      maxWallTimeMs: 20_000,
      safetyLevel: "standard",
    },
    tools: [],
    forbiddenTools: ["TL-02-EVSAVE"],
  },
  taskProfile: { creativity: "deterministic", outputLength: "short" },
  outputSchema: MissionAdjustmentSchema,

  buildSystemPrompt: () =>
    [
      "你是 mission 策略调整员。根据当前进度和预算，决定 4 种动作之一。",
      "",
      "## 输出 JSON 格式（严格遵守字段名/类型/必填）",
      "```json",
      "{",
      '  "decision": "continue",      // enum: continue | extend_budget | downgrade_depth | abort',
      '  "reason": "≥10 字的决策理由",',
      '  "recommendedActions": ["具体的 next step 1", "具体的 next step 2"]',
      "}",
      "```",
      "",
      "决策语义：",
      "- continue: 维持当前路径",
      "- extend_budget: 申请延长 budget（只在质量关键才选）",
      "- downgrade_depth: 降级到更低 depth（thorough→standard 等）",
      "- abort: 终止 mission",
      "",
      "⚠️ decision 只能是 4 个枚举值之一；严格 JSON，不要 fence 包裹输出。",
    ].join("\n"),

  buildUserPrompt: (ctx) => {
    const { input } = ctx;
    return [
      `budgetUsagePct: ${(input.budgetUsagePct * 100).toFixed(1)}%`,
      `currentDepth: ${input.currentDepth}`,
      `elapsedMs: ${input.elapsedMs}`,
      input.qualityScore != null
        ? `qualityScore: ${input.qualityScore}/100`
        : "",
      "",
      `completedStages (${input.completedStages.length}): ${input.completedStages.join(", ")}`,
      `pendingStages (${input.pendingStages.length}): ${input.pendingStages.join(", ")}`,
      "",
      "请输出 MissionAdjustment JSON。",
    ]
      .filter(Boolean)
      .join("\n");
  },

  stubFn: async (ctx) => {
    const { input } = ctx;
    let decision: MissionAdjustment["decision"] = "continue";
    if (input.budgetUsagePct >= 1) decision = "abort";
    else if (input.budgetUsagePct >= 0.9 && input.currentDepth !== "quick")
      decision = "downgrade_depth";
    return {
      decision,
      reason: `budget usage ${(input.budgetUsagePct * 100).toFixed(0)}% (stub)`,
      recommendedActions: ["monitor budget", "skip optional stages"],
    };
  },
};
