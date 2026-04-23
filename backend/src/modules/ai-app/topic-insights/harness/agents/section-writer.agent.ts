/**
 * AG-03-SW · SectionWriter
 *
 * 输入 sectionPlan → 输出 SectionResult。
 * Access matrix：写 evidence（TL-02-EVSAVE）是允许的；搜索/图表/memory 只读。
 */

import { Injectable } from "@nestjs/common";
import { BaseAgentRunner } from "./base-agent-runner";
import { SectionResultSchema, type SectionResult } from "./schemas";
import type { AccessToolId, AgentRunContext } from "./types";

export interface SectionWriterInput {
  readonly topicId: string;
  readonly topicName: string;
  readonly dimensionId: string;
  readonly dimensionName: string;
  readonly sectionPlan: {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly targetWords: number;
    readonly keyPoints: ReadonlyArray<string>;
  };
  readonly evidenceSummary: string;
  readonly language: string;
}

@Injectable()
export class SectionWriterAgent extends BaseAgentRunner<
  SectionWriterInput,
  SectionResult
> {
  readonly id = "AG-03-SW";
  readonly name = "Section Writer";
  readonly tools: ReadonlyArray<AccessToolId> = [
    "TL-06-SEARCHMULTI",
    "rag-search",
    "knowledge-graph",
    "TL-03-FIGEXT",
    "TL-02-EVSAVE",
    "short-term-memory",
  ];
  readonly outputSchema = SectionResultSchema;

  protected async executeImpl(
    _ctx: AgentRunContext<SectionWriterInput>,
  ): Promise<{ output: unknown; tokensUsed: number; costUsd: number }> {
    throw new Error(
      `[${this.id}] Real LLM execution not yet wired — use HARNESS_AGENTS_STUB=1`,
    );
  }

  protected async stubOutput(
    ctx: AgentRunContext<SectionWriterInput>,
  ): Promise<{ output: unknown; tokensUsed: number; costUsd: number }> {
    const { input } = ctx;
    const plan = input.sectionPlan;
    const wordCount = Math.floor(plan.targetWords);
    const content =
      `### ${plan.title}\n\n` +
      plan.keyPoints
        .map((kp, idx) => `**要点 ${idx + 1}**: ${kp} [${idx + 1}]`)
        .join("\n\n") +
      `\n\n${plan.description} 这是 ${input.dimensionName} 维度下 ${plan.title} 的 stub 正文，` +
      "A".repeat(Math.max(0, wordCount - 200)) +
      ".";

    const keyFindings = plan.keyPoints.map((kp, idx) => ({
      statement: `关于 ${kp} 的核心发现 ${idx + 1}（stub）`,
      evidenceRefs: [`ev-${idx + 1}`, `ev-${idx + 2}`],
      confidence: 0.8,
    }));

    const sectionResult = {
      sectionId: plan.id,
      dimensionId: input.dimensionId,
      title: plan.title,
      content,
      wordCount,
      keyFindings,
      citationCount: plan.keyPoints.length * 2,
      evidenceIdsUsed: plan.keyPoints.flatMap((_, idx) => [
        `ev-${idx + 1}`,
        `ev-${idx + 2}`,
      ]),
    };

    return { output: sectionResult, tokensUsed: 0, costUsd: 0 };
  }

  /**
   * Business rule：
   * - wordCount >= targetWords × 0.85
   * - citationCount >= keyFindings.length × 1.5
   */
  protected validateBusinessRules(
    output: SectionResult,
    ctx: AgentRunContext<SectionWriterInput>,
  ): void {
    const target = ctx.input.sectionPlan.targetWords;
    if (output.wordCount < Math.floor(target * 0.85)) {
      throw new Error(
        `[${this.id}] wordCount=${output.wordCount} below 85% of target=${target}`,
      );
    }
    const minCites = Math.ceil(output.keyFindings.length * 1.5);
    if (output.citationCount < minCites) {
      throw new Error(
        `[${this.id}] citationCount=${output.citationCount} below min=${minCites}`,
      );
    }
  }
}
