/**
 * AG-09-HV · HypothesisVerifier
 *
 * 对一组 hypotheses 给出 verified / refuted / inconclusive 判定。
 * Access matrix：rag-search 只读。
 */

import { Injectable, Optional } from "@nestjs/common";
import type { TaskProfile } from "@/modules/ai-engine/facade";
import { BaseAgentRunner } from "./base-agent-runner";
import {
  HypothesisVerifierResultSchema,
  type HypothesisVerifierResult,
} from "./schemas";
import type { AccessToolId, AgentRunContext } from "./types";
import { LlmInvokerService } from "../llm";

export interface HypothesisVerifierInput {
  readonly hypotheses: ReadonlyArray<{ id: string; statement: string }>;
  readonly evidenceSummaries: ReadonlyArray<{
    id: string;
    title: string;
    snippet: string;
  }>;
}

@Injectable()
export class HypothesisVerifierAgent extends BaseAgentRunner<
  HypothesisVerifierInput,
  HypothesisVerifierResult
> {
  readonly id = "AG-09-HV";
  readonly name = "Hypothesis Verifier";
  readonly tools: ReadonlyArray<AccessToolId> = ["rag-search"];
  readonly forbiddenTools: ReadonlyArray<AccessToolId> = ["TL-02-EVSAVE"];
  readonly outputSchema = HypothesisVerifierResultSchema;
  protected readonly taskProfile: TaskProfile = {
    creativity: "deterministic",
    outputLength: "medium",
  };

  constructor(@Optional() llmInvoker?: LlmInvokerService) {
    super(llmInvoker);
  }

  protected buildSystemPrompt(
    _ctx: AgentRunContext<HypothesisVerifierInput>,
  ): string {
    return [
      "你是假设验证员。对每个 hypothesis：",
      "1. 基于提供的 evidence 决定 verdict ∈ {verified, refuted, inconclusive}",
      "2. 列出 supportingEvidenceIds（来自 evidenceSummaries）",
      "3. confidence 0-1",
      "4. reasoning 简明说明",
      "",
      "只可使用提供的 evidence。严格 JSON 输出。",
    ].join("\n");
  }

  protected buildUserPrompt(
    ctx: AgentRunContext<HypothesisVerifierInput>,
  ): string {
    const { input } = ctx;
    return [
      "hypotheses:",
      ...input.hypotheses.map((h) => `  - ${h.id}: ${h.statement}`),
      "",
      "evidenceSummaries:",
      ...input.evidenceSummaries
        .slice(0, 15)
        .map((e) => `  - ${e.id}: ${e.title}\n    ${e.snippet.slice(0, 150)}`),
      "",
      "请输出 HypothesisVerifierResult JSON。",
    ].join("\n");
  }

  protected stubOutput(
    ctx: AgentRunContext<HypothesisVerifierInput>,
  ): Promise<{ output: unknown; tokensUsed: number; costUsd: number }> {
    const { input } = ctx;
    const result: HypothesisVerifierResult = {
      hypotheses: input.hypotheses.map((h) => ({
        id: h.id,
        statement: h.statement,
        verdict: "inconclusive" as const,
        supportingEvidenceIds: input.evidenceSummaries
          .slice(0, 2)
          .map((e) => e.id),
        confidence: 0.5,
        reasoning: "stub: insufficient evidence to verify",
      })),
    };
    return Promise.resolve({ output: result, tokensUsed: 0, costUsd: 0 });
  }
}
