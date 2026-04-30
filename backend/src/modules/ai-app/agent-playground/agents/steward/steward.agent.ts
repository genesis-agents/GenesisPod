/**
 * StewardAgent —— 资源 / 合规 / 边界守门员（multi-scope 单一 class）
 *
 * 与 Leader 的根本区别:
 *   - Leader 管"做什么 / 做得怎么样"（业务方向 + 质量问责）
 *   - Steward 管"能不能做 / 该不该做"（资源边界 + 合规 + 风险）
 *
 * 4 种工作 scope（discriminatedUnion）:
 *   - budget-guard      : 预算 token / cost 阈值警告
 *   - compliance-check  : 引用源 / 内容是否违反规则
 *   - data-boundary     : PII / 内部数据是否泄露
 *   - source-diversity  : 单 domain 占比警告
 *
 * 当前最小实现：仅 budget-guard 一个 duty，其他 scope 留 schema 占位。
 * 当前 orchestrator 暂未接入，留作后续 PR 在各 stage 进行 alert 拦截。
 */

import { z } from "zod";
import { AgentSpec, DefineAgent } from "../../../../ai-harness/facade";
import { buildPromptFromDuty } from "../../utils/duty-loader";

const Input = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("budget-guard"),
    missionId: z.string(),
    language: z.enum(["zh-CN", "en-US"]),
    snapshot: z.object({
      tokensUsed: z.number().int(),
      tokensLimit: z.number().int(),
      costUsd: z.number(),
      stagesCompleted: z.array(z.string()),
      stagesPending: z.array(z.string()),
    }),
    thresholds: z.object({
      softWarnPct: z.number().int().default(70),
      hardBlockPct: z.number().int().default(95),
    }),
  }),
  z.object({
    scope: z.literal("compliance-check"),
    missionId: z.string(),
    language: z.enum(["zh-CN", "en-US"]),
    citations: z.array(
      z.object({
        url: z.string(),
        domain: z.string().optional(),
      }),
    ),
    blacklist: z.array(z.string()).default([]),
  }),
  z.object({
    scope: z.literal("data-boundary"),
    missionId: z.string(),
    language: z.enum(["zh-CN", "en-US"]),
    samples: z.array(z.string()).min(1),
  }),
  z.object({
    scope: z.literal("source-diversity"),
    missionId: z.string(),
    language: z.enum(["zh-CN", "en-US"]),
    citations: z.array(
      z.object({
        url: z.string(),
        domain: z.string().optional(),
      }),
    ),
    domainConcentrationThreshold: z.number().min(0).max(1).default(0.6),
  }),
]);

const Alert = z.object({
  level: z.enum(["info", "warning", "block"]),
  trigger: z.string(),
  current: z.string(),
  threshold: z.string(),
  suggestedAction: z.string(),
});

const Output = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("budget-guard"),
    alerts: z.array(Alert),
  }),
  z.object({
    scope: z.literal("compliance-check"),
    alerts: z.array(Alert),
    flaggedCitations: z.array(z.string()).default([]),
  }),
  z.object({
    scope: z.literal("data-boundary"),
    alerts: z.array(Alert),
    flaggedSamples: z.array(z.number().int()).default([]),
  }),
  z.object({
    scope: z.literal("source-diversity"),
    alerts: z.array(Alert),
    domainBreakdown: z.array(
      z.object({
        domain: z.string(),
        count: z.number().int(),
        pct: z.number(),
      }),
    ),
  }),
]);

export type StewardInput = z.infer<typeof Input>;
export type StewardOutput = z.infer<typeof Output>;

@DefineAgent({
  id: "playground.steward",
  version: "1.0.0",
  identity: {
    role: "steward",
    description:
      "资源 / 合规 / 边界守门员。一个 class，4 种 scope 覆盖 budget / compliance / data-boundary / source-diversity。",
  },
  loop: "reflexion",
  toolCategories: [],
  taskProfile: {
    creativity: "deterministic",
    outputLength: "short",
    reasoningDepth: "moderate",
  },
  inputSchema: Input,
  outputSchema: Output,
  budget: { maxTokens: 4_000, maxIterations: 2 },
})
export class StewardAgent extends AgentSpec<typeof Input, typeof Output> {
  buildSystemPrompt({ input }: { input: z.infer<typeof Input> }): string {
    const dutyMap: Record<typeof input.scope, string> = {
      "budget-guard": "budget-guard",
      "compliance-check": "compliance-check",
      "data-boundary": "data-boundary",
      "source-diversity": "source-diversity",
    };
    return buildPromptFromDuty("steward", dutyMap[input.scope], input as never);
  }
}
