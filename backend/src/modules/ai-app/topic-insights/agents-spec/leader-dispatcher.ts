/**
 * AG-17-LDP · LeaderDispatcher spec
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";
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
      "你是意图分发员。分析用户 prompt 属于哪一类：",
      "- new_research: 开启新研究",
      "- refine_report: 微调已有 report（仅在 hasExistingReport=true 有效）",
      "- answer_followup: 跟进问题（仅在 hasExistingReport=true）",
      "- restart_mission: 丢弃已有，重启",
      "",
      "confidence 0-1。严格 JSON 输出。",
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
