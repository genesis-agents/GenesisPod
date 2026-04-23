/**
 * AG-08-GS · GapSearcher
 *
 * 识别某个维度当前研究中的知识空白（gaps），输出补救 queries。
 * Access matrix：无工具（纯 LLM 推理）。
 */

import { Injectable, Optional } from "@nestjs/common";
import type { TaskProfile } from "@/modules/ai-engine/facade";
import { BaseAgentRunner } from "./base-agent-runner";
import { GapSearcherResultSchema, type GapSearcherResult } from "./schemas";
import type { AccessToolId, AgentRunContext } from "./types";
import { LlmInvokerService } from "../llm";

export interface GapSearcherInput {
  readonly dimensionId: string;
  readonly dimensionName: string;
  readonly dimensionSummary: string;
  readonly existingKeyFindings: ReadonlyArray<string>;
  readonly existingEvidenceCount: number;
}

@Injectable()
export class GapSearcherAgent extends BaseAgentRunner<
  GapSearcherInput,
  GapSearcherResult
> {
  readonly id = "AG-08-GS";
  readonly name = "Gap Searcher";
  readonly tools: ReadonlyArray<AccessToolId> = [];
  readonly forbiddenTools: ReadonlyArray<AccessToolId> = ["TL-02-EVSAVE"];
  readonly outputSchema = GapSearcherResultSchema;
  protected readonly taskProfile: TaskProfile = {
    creativity: "medium",
    outputLength: "short",
  };

  constructor(@Optional() llmInvoker?: LlmInvokerService) {
    super(llmInvoker);
  }

  protected buildSystemPrompt(_ctx: AgentRunContext<GapSearcherInput>): string {
    return [
      "你是研究空白识别员。基于已有 summary + key findings + evidence count，指出：",
      "1. 哪些关键问题尚未被回答（gapStatement）",
      "2. 每个 gap 建议的补充搜索 queries（≥1）",
      "3. priority 0-10（10=最关键）",
      "",
      "只输出当前证据不足以支撑但对结论必要的 gap。严格 JSON 输出。",
    ].join("\n");
  }

  protected buildUserPrompt(ctx: AgentRunContext<GapSearcherInput>): string {
    const { input } = ctx;
    return [
      `dimension: ${input.dimensionName} (id=${input.dimensionId})`,
      `evidenceCount: ${input.existingEvidenceCount}`,
      "",
      "已有 key findings:",
      ...input.existingKeyFindings.map((kf, i) => `  ${i + 1}. ${kf}`),
      "",
      "summary:",
      input.dimensionSummary.slice(0, 2000),
      "",
      "请输出 GapSearcherResult JSON。",
    ].join("\n");
  }

  protected stubOutput(
    ctx: AgentRunContext<GapSearcherInput>,
  ): Promise<{ output: unknown; tokensUsed: number; costUsd: number }> {
    const { input } = ctx;
    const result: GapSearcherResult = {
      dimensionId: input.dimensionId,
      gaps:
        input.existingEvidenceCount < 5
          ? [
              {
                id: `${input.dimensionId}-gap-1`,
                dimensionId: input.dimensionId,
                gapStatement: `${input.dimensionName} 证据不足（仅 ${input.existingEvidenceCount} 条），关键数据缺失。`,
                suggestedQueries: [
                  `${input.dimensionName} 2026 最新数据`,
                  `${input.dimensionName} 行业报告`,
                ],
                priority: 8,
              },
            ]
          : [],
    };
    return Promise.resolve({ output: result, tokensUsed: 0, costUsd: 0 });
  }
}
