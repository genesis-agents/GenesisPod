/**
 * AG-18-LI · LeaderIntent spec (F2)
 *
 * 用户在 /leader/chat 发一条消息；spec 解码成 4 类决策之一：
 *   DIRECT_ANSWER | CREATE_TODO | CLARIFY | ACKNOWLEDGE
 *
 * LeaderChatService 根据 decisionType 分发后续副作用；spec 本身只做意图理解。
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";

import { buildPersona } from "./defaults";
import {
  LeaderIntentDecisionSchema,
  type LeaderIntentDecision,
} from "./schemas";

export interface LeaderIntentInput {
  readonly message: string;
  readonly topicId: string;
  readonly topicName: string;
  readonly topicType?: string;
  readonly missionId?: string;
  readonly missionStatus?: string;
  readonly hasExistingReport?: boolean;
  readonly recentMessages?: ReadonlyArray<{
    readonly role: "user" | "leader";
    readonly content: string;
  }>;
}

export const LEADER_INTENT_SPEC: IAgentSpec<
  LeaderIntentInput,
  LeaderIntentDecision
> = {
  identity: {
    role: {
      id: "AG-18-LI",
      name: "Leader Intent",
      description:
        "解码 /leader/chat 用户消息，选 DIRECT_ANSWER / CREATE_TODO / CLARIFY / ACKNOWLEDGE。",
      workStyle: "structured",
    },
    persona: buildPersona("研究团队对话引导员"),
    goal: {
      summary: "针对单条用户消息产出 LeaderIntentDecision",
      successCriteria: [
        "decisionType 明确",
        "DIRECT_ANSWER 必须填 response",
        "CREATE_TODO 必须填 todoCandidate",
        "CLARIFY 必须填 clarifyQuestion + clarifyOptions",
      ],
    },
    constraints: {
      maxIterations: 2,
      maxTokens: 4_000,
      maxWallTimeMs: 20_000,
      safetyLevel: "standard",
    },
    tools: [],
    forbiddenTools: ["TL-02-EVSAVE"],
  },
  taskProfile: { creativity: "low", outputLength: "short" },
  outputSchema: LeaderIntentDecisionSchema,

  buildSystemPrompt: () =>
    [
      "你是研究团队的对话引导员。收到用户发给 Leader 的一条消息，先理解意图，再选一种响应：",
      "- DIRECT_ANSWER: 消息是可以直接答复的问题（概念澄清 / 状态询问 / 范围确认）。必须填 response。",
      "- CREATE_TODO: 消息实际是 mission 范畴内的新任务（补一个维度 / 扩展分析 / 深挖某点）。必须填 todoCandidate。",
      "- CLARIFY: 消息模糊、缺关键约束，需反问。必须填 clarifyQuestion 和 2-4 个 clarifyOptions。",
      "- ACKNOWLEDGE: 闲聊 / 感谢 / 低信息量消息。response 可填短确认。",
      "",
      "输出严格 JSON，符合 LeaderIntentDecisionSchema；不要 markdown fence。",
    ].join("\n"),

  buildUserPrompt: (ctx) => {
    const { input } = ctx;
    const recent =
      input.recentMessages && input.recentMessages.length > 0
        ? [
            "",
            "## 最近对话（最多 6 条）",
            ...input.recentMessages
              .slice(-6)
              .map((m) => `- [${m.role}] ${m.content.slice(0, 200)}`),
          ].join("\n")
        : "";
    return [
      `topicId: ${input.topicId}`,
      `topicName: ${input.topicName}`,
      input.topicType ? `topicType: ${input.topicType}` : "",
      input.missionId ? `missionId: ${input.missionId}` : "",
      input.missionStatus ? `missionStatus: ${input.missionStatus}` : "",
      typeof input.hasExistingReport === "boolean"
        ? `hasExistingReport: ${input.hasExistingReport}`
        : "",
      recent,
      "",
      `## 当前用户消息`,
      input.message,
      "",
      "请输出 LeaderIntentDecision JSON。",
    ]
      .filter(Boolean)
      .join("\n");
  },

  validateBusinessRules: (decision) => {
    if (decision.decisionType === "DIRECT_ANSWER" && !decision.response) {
      throw new Error("[AG-18-LI] DIRECT_ANSWER requires non-empty response");
    }
    if (decision.decisionType === "CREATE_TODO" && !decision.todoCandidate) {
      throw new Error("[AG-18-LI] CREATE_TODO requires todoCandidate");
    }
    if (decision.decisionType === "CLARIFY") {
      if (!decision.clarifyQuestion) {
        throw new Error("[AG-18-LI] CLARIFY requires clarifyQuestion");
      }
      if (!decision.clarifyOptions || decision.clarifyOptions.length < 2) {
        throw new Error(
          "[AG-18-LI] CLARIFY requires at least 2 clarifyOptions",
        );
      }
    }
  },

  stubFn: async (ctx) => {
    const msg = ctx.input.message.trim();
    if (!msg) {
      return {
        decisionType: "ACKNOWLEDGE" as const,
        understanding: "空消息",
        response: "收到",
        todoCandidate: null,
        clarifyQuestion: null,
        clarifyOptions: null,
      };
    }
    if (msg.endsWith("?") || msg.endsWith("？")) {
      return {
        decisionType: "DIRECT_ANSWER" as const,
        understanding: `用户问: ${msg}`,
        response: "收到你的问题（stub 模式）",
        todoCandidate: null,
        clarifyQuestion: null,
        clarifyOptions: null,
      };
    }
    return {
      decisionType: "ACKNOWLEDGE" as const,
      understanding: msg,
      response: "已记录（stub）",
      todoCandidate: null,
      clarifyQuestion: null,
      clarifyOptions: null,
    };
  },
};
