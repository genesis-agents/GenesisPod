/**
 * AG-17-LDP · LeaderDispatcher spec
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";
// ★ 复用 Apr 21 baseline 的 LEADER_INTERVENE_PROMPT（用户意图→决策 同源）
import { LEADER_INTERVENE_PROMPT } from "@/modules/ai-app/topic-insights/prompts/research-leader.prompt";
import {
  LeaderDispatchDecisionSchema,
  type LeaderDispatchDecision,
} from "./schemas";

export interface LeaderDispatcherInput {
  readonly userPrompt: string;
  readonly hasExistingReport: boolean;
  readonly lastReportSummary?: string;
}

export const LEADER_DISPATCHER_SPEC: IAgentSpec<
  LeaderDispatcherInput,
  LeaderDispatchDecision
> = {
  identity: {
    role: {
      id: "AG-17-LDP",
      name: "Leader Dispatcher",
      description:
        "用户 prompt 意图分类 → new_research / refine_report / answer_followup / restart_mission。",
      workStyle: "structured",
    },
    persona: { tone: "formal", language: "zh-CN", style: "意图路由官" },
    goal: {
      summary: "产出 LeaderDispatchDecision（intent + confidence + reasoning）",
    },
    constraints: {
      maxIterations: 2,
      maxTokens: 3_000,
      maxWallTimeMs: 15_000,
      safetyLevel: "standard",
    },
    tools: [],
    forbiddenTools: ["TL-02-EVSAVE"],
  },
  taskProfile: { creativity: "deterministic", outputLength: "minimal" },
  outputSchema: LeaderDispatchDecisionSchema,

  buildSystemPrompt: () =>
    [
      // ★ 复用 Apr 21 baseline 的 LEADER_INTERVENE_PROMPT 原文（同是用户意图→决策类）
      LEADER_INTERVENE_PROMPT,
      "",
      "## 【关键覆盖】本 spec 是「新研究 vs 既有报告处理」分发，输出 JSON：",
      "```json",
      "{",
      '  "intent": "new_research",     // enum: new_research | refine_report | answer_followup | restart_mission',
      '  "confidence": 0.85,           // number 0-1',
      '  "reasoning": "≥5 字的理由"',
      "}",
      "```",
      "",
      "语义：new_research=开启新研究；refine_report=微调已有（hasExistingReport=true 才有效）；",
      "answer_followup=跟进问题；restart_mission=丢弃已有重启。",
      "⚠️ confidence 是数字；严格 JSON。",
    ].join("\n"),

  buildUserPrompt: (ctx) => {
    const { input } = ctx;
    return [
      `hasExistingReport: ${input.hasExistingReport}`,
      input.lastReportSummary
        ? `lastReportSummary: ${input.lastReportSummary.slice(0, 500)}`
        : "",
      "",
      `userPrompt: ${input.userPrompt}`,
      "",
      "请输出 LeaderDispatchDecision JSON。",
    ]
      .filter(Boolean)
      .join("\n");
  },

  stubFn: async (ctx) => {
    const intent: LeaderDispatchDecision["intent"] = ctx.input.hasExistingReport
      ? "refine_report"
      : "new_research";
    return {
      intent,
      confidence: 0.7,
      reasoning: `stub intent based on hasExistingReport=${ctx.input.hasExistingReport}`,
    };
  },
};
