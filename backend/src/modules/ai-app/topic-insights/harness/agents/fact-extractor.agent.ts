/**
 * AG-10-FX · FactExtractor
 *
 * 跨维度抽取 facts（trend / data_point / insight / risk）。
 * Access matrix：TL-04-DIMMEM 只读。
 */

import { Injectable, Optional } from "@nestjs/common";
import type { TaskProfile } from "@/modules/ai-engine/facade";
import { BaseAgentRunner } from "./base-agent-runner";
import { FactExtractorResultSchema, type FactExtractorResult } from "./schemas";
import type { AccessToolId, AgentRunContext } from "./types";
import { LlmInvokerService } from "../llm";

export interface FactExtractorInput {
  readonly dimensions: ReadonlyArray<{
    id: string;
    name: string;
    summary: string;
    keyFindings: ReadonlyArray<string>;
  }>;
  readonly evidenceIds: ReadonlyArray<string>;
}

@Injectable()
export class FactExtractorAgent extends BaseAgentRunner<
  FactExtractorInput,
  FactExtractorResult
> {
  readonly id = "AG-10-FX";
  readonly name = "Fact Extractor";
  readonly tools: ReadonlyArray<AccessToolId> = ["TL-04-DIMMEM"];
  readonly forbiddenTools: ReadonlyArray<AccessToolId> = ["TL-02-EVSAVE"];
  readonly outputSchema = FactExtractorResultSchema;
  protected readonly taskProfile: TaskProfile = {
    creativity: "low",
    outputLength: "medium",
  };

  constructor(@Optional() llmInvoker?: LlmInvokerService) {
    super(llmInvoker);
  }

  protected buildSystemPrompt(
    _ctx: AgentRunContext<FactExtractorInput>,
  ): string {
    return [
      "你是跨维度事实抽取员。从各维度 summary + key findings 中抽取结构化 facts。",
      "约束：",
      "1. 每个 fact 分类为 trend / data_point / insight / risk 之一",
      "2. 绑定来源 dimensionId + evidenceIds",
      "3. statement 尽量量化（含数字、时间、主体）",
      "4. 只抽实质性事实，不重复 key findings 原文",
      "",
      "严格 JSON 输出。",
    ].join("\n");
  }

  protected buildUserPrompt(ctx: AgentRunContext<FactExtractorInput>): string {
    const { input } = ctx;
    return [
      "dimensions:",
      ...input.dimensions.map(
        (d) =>
          `  - ${d.name} (id=${d.id})\n    summary: ${d.summary.slice(0, 300)}\n    findings: ${d.keyFindings.join(" | ")}`,
      ),
      "",
      `evidence pool size: ${input.evidenceIds.length}`,
      "",
      "请输出 FactExtractorResult JSON。",
    ].join("\n");
  }

  protected stubOutput(
    ctx: AgentRunContext<FactExtractorInput>,
  ): Promise<{ output: unknown; tokensUsed: number; costUsd: number }> {
    const { input } = ctx;
    const result: FactExtractorResult = {
      facts: input.dimensions.slice(0, 4).map((d, idx) => ({
        id: `fact-${d.id}-1`,
        dimensionId: d.id,
        statement: `${d.name}：${d.keyFindings[0] ?? "关键发现（stub）"}`,
        evidenceIds: input.evidenceIds.slice(idx * 2, idx * 2 + 2),
        category:
          idx % 4 === 0
            ? ("trend" as const)
            : idx % 4 === 1
              ? ("data_point" as const)
              : idx % 4 === 2
                ? ("insight" as const)
                : ("risk" as const),
      })),
    };
    return Promise.resolve({ output: result, tokensUsed: 0, costUsd: 0 });
  }
}
