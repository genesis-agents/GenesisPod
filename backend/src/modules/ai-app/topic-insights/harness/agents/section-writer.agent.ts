/**
 * AG-03-SW · SectionWriter
 *
 * 输入 sectionPlan → 输出 SectionResult。
 * Access matrix：写 evidence（TL-02-EVSAVE）是允许的；搜索/图表/memory 只读。
 */

import { Injectable, Optional } from "@nestjs/common";
import type { TaskProfile } from "@/modules/ai-engine/facade";
import { BaseAgentRunner } from "./base-agent-runner";
import { SectionResultSchema, type SectionResult } from "./schemas";
import type { AccessToolId, AgentRunContext } from "./types";
import { LlmInvokerService } from "../llm";

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
  protected readonly taskProfile: TaskProfile = {
    creativity: "medium",
    outputLength: "long",
  };

  constructor(@Optional() llmInvoker?: LlmInvokerService) {
    super(llmInvoker);
  }

  protected buildSystemPrompt(
    _ctx: AgentRunContext<SectionWriterInput>,
  ): string {
    return [
      "你是章节研究写作员。给定 sectionPlan 和 evidenceSummary，请完成该 section 深度写作。",
      "要求：",
      "1. wordCount 须达到 targetWords × 0.85 - 1.15",
      "2. keyFindings ≥ sectionPlan.keyPoints.length 个；每个至少关联 2 个 evidenceRefs",
      "3. citationCount ≥ keyFindings.length × 1.5",
      "4. 正文必须引用提供的证据（[1][2] 格式）",
      "5. evidenceIdsUsed 列出所有用到的 evidence id",
      "",
      "严格 JSON 输出，不要 markdown fence。",
    ].join("\n");
  }

  protected buildUserPrompt(ctx: AgentRunContext<SectionWriterInput>): string {
    const { input } = ctx;
    const plan = input.sectionPlan;
    return [
      `topic: ${input.topicName}（id=${input.topicId}）`,
      `dimension: ${input.dimensionName}（id=${input.dimensionId}）`,
      `language: ${input.language}`,
      "",
      `sectionPlan:`,
      `  id=${plan.id}`,
      `  title=${plan.title}`,
      `  description=${plan.description}`,
      `  targetWords=${plan.targetWords}`,
      `  keyPoints: ${plan.keyPoints.map((k, i) => `(${i + 1}) ${k}`).join(" / ")}`,
      "",
      `evidenceSummary:`,
      input.evidenceSummary,
      "",
      "请输出 SectionResult JSON。",
    ].join("\n");
  }

  protected stubOutput(
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

    return Promise.resolve({
      output: sectionResult,
      tokensUsed: 0,
      costUsd: 0,
    });
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
