/**
 * AG-17-LDP · LeaderDispatcher
 *
 * 用户 prompt → intent 识别（是否开启新研究 / 微调已有 report / 跟进问题 /
 * 重启 mission）。
 * 当前 pipeline 不调用；intent gateway 集成时使用。
 *
 * Access matrix：无工具。
 */

import { Injectable, Optional } from "@nestjs/common";
import type { TaskProfile } from "@/modules/ai-engine/facade";
import { BaseAgentRunner } from "./base-agent-runner";
import {
  LeaderDispatchDecisionSchema,
  type LeaderDispatchDecision,
} from "./schemas";
import type { AccessToolId, AgentRunContext } from "./types";
import { LlmInvokerService } from "../llm";

export interface LeaderDispatcherInput {
  readonly userPrompt: string;
  readonly hasExistingReport: boolean;
  readonly lastReportSummary?: string;
}

@Injectable()
export class LeaderDispatcherAgent extends BaseAgentRunner<
  LeaderDispatcherInput,
  LeaderDispatchDecision
> {
  readonly id = "AG-17-LDP";
  readonly name = "Leader Dispatcher";
  readonly tools: ReadonlyArray<AccessToolId> = [];
  readonly forbiddenTools: ReadonlyArray<AccessToolId> = ["TL-02-EVSAVE"];
  readonly outputSchema = LeaderDispatchDecisionSchema;
  protected readonly taskProfile: TaskProfile = {
    creativity: "deterministic",
    outputLength: "minimal",
  };

  constructor(@Optional() llmInvoker?: LlmInvokerService) {
    super(llmInvoker);
  }

  protected buildSystemPrompt(
    _ctx: AgentRunContext<LeaderDispatcherInput>,
  ): string {
    return [
      "你是意图分发员。分析用户 prompt 属于哪一类：",
      "- new_research: 开启新研究",
      "- refine_report: 微调已有 report（仅在 hasExistingReport=true 有效）",
      "- answer_followup: 跟进问题（仅在 hasExistingReport=true）",
      "- restart_mission: 丢弃已有，重启",
      "",
      "confidence 0-1。严格 JSON 输出。",
    ].join("\n");
  }

  protected buildUserPrompt(
    ctx: AgentRunContext<LeaderDispatcherInput>,
  ): string {
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
  }

  protected stubOutput(
    ctx: AgentRunContext<LeaderDispatcherInput>,
  ): Promise<{ output: unknown; tokensUsed: number; costUsd: number }> {
    const { input } = ctx;
    const intent: LeaderDispatchDecision["intent"] = input.hasExistingReport
      ? "refine_report"
      : "new_research";
    return Promise.resolve({
      output: {
        intent,
        confidence: 0.7,
        reasoning: `stub intent based on hasExistingReport=${input.hasExistingReport}`,
      },
      tokensUsed: 0,
      costUsd: 0,
    });
  }
}
