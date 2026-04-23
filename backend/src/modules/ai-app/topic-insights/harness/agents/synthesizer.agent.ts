/**
 * AG-11-SY · Synthesizer
 *
 * 从 dimension metas + cross-dim facts 产出最终报告。
 * Access matrix：只读 rag/TL-04-DIMMEM；**严禁** TL-02-EVSAVE（防止假证据）。
 */

import { Injectable } from "@nestjs/common";
import { BaseAgentRunner } from "./base-agent-runner";
import {
  SynthesisResultSchema,
  type DimensionMeta,
  type QualityReview,
  type SynthesisResult,
} from "./schemas";
import type { AccessToolId, AgentRunContext } from "./types";

export interface SynthesizerInput {
  readonly topicId: string;
  readonly topicName: string;
  readonly dimensionMetas: ReadonlyArray<DimensionMeta>;
  readonly integratedSectionsPerDim: Record<string, string>;
  readonly overallReview?: QualityReview;
  readonly userPrompt?: string;
  readonly language: string;
}

@Injectable()
export class SynthesizerAgent extends BaseAgentRunner<
  SynthesizerInput,
  SynthesisResult
> {
  readonly id = "AG-11-SY";
  readonly name = "Report Synthesizer";
  readonly tools: ReadonlyArray<AccessToolId> = ["rag-search", "TL-04-DIMMEM"];
  readonly forbiddenTools: ReadonlyArray<AccessToolId> = ["TL-02-EVSAVE"];
  readonly outputSchema = SynthesisResultSchema;

  protected async executeImpl(
    _ctx: AgentRunContext<SynthesizerInput>,
  ): Promise<{ output: unknown; tokensUsed: number; costUsd: number }> {
    throw new Error(
      `[${this.id}] Real LLM execution not yet wired — use HARNESS_AGENTS_STUB=1`,
    );
  }

  protected async stubOutput(
    ctx: AgentRunContext<SynthesizerInput>,
  ): Promise<{ output: unknown; tokensUsed: number; costUsd: number }> {
    const { input, identity } = ctx;
    const execSummary =
      `# 执行摘要\n\n本报告就 ${input.topicName} 从 ${input.dimensionMetas.length} 个维度展开系统研究。` +
      input.dimensionMetas
        .map((m) => `\n\n**${m.dimensionName}**：${m.summary.slice(0, 200)}...`)
        .join("") +
      "\n\n综合分析表明：上述研究具有结构性机会与阶段性风险并存的特征。（stub synthesis）";

    const fullMarkdown =
      `# ${input.topicName} · 综合研究报告\n\n` +
      execSummary +
      "\n\n" +
      input.dimensionMetas
        .map(
          (m, idx) =>
            `## ${idx + 1}. ${m.dimensionName}\n\n${m.summary}\n\n` +
            m.keyFindings.map((kf, i) => `- 发现 ${i + 1}：${kf}`).join("\n"),
        )
        .join("\n\n") +
      "\n\n## 结论\n\n" +
      "综合以上维度分析，" +
      input.topicName +
      " 的演进呈现复合型趋势（stub）。";

    const highlights = input.dimensionMetas.slice(0, 5).map((m, idx) => ({
      type: "KEY_FINDING" as const,
      text: `${m.dimensionName}：核心发现 ${idx + 1}（${m.keyFindings[0] ?? ""}）`,
    }));

    const result: SynthesisResult = {
      missionId: identity.missionId,
      executiveSummary: execSummary.slice(0, 3500),
      preface: `本报告针对 ${input.topicName} 进行深度研究（stub preface ≥50 字）。使用 ${input.dimensionMetas.length} 个分析维度，综合得出结论与建议。`,
      fullMarkdown,
      highlights:
        highlights.length >= 3
          ? highlights
          : [
              ...highlights,
              ...Array.from({ length: 3 - highlights.length }).map((_, i) => ({
                type: "KEY_FINDING" as const,
                text: `补齐 stub highlight ${i + 1}（stub）`,
              })),
            ],
      crossDimensionAnalysis:
        `跨维度分析：${input.dimensionMetas.map((m) => m.dimensionName).join("、")} 之间形成互补与制约关系，` +
        "其中趋势层面的共振、挑战层面的叠加、机会层面的互补三条主线清晰可见（stub cross-dimension analysis）。",
      riskMatrix: [
        {
          level: "medium" as const,
          description: "stub: 数据时效性风险",
          relatedDimensions: input.dimensionMetas
            .slice(0, 2)
            .map((m) => m.dimensionId),
        },
      ],
      recommendations: [
        {
          priority: "P1" as const,
          action: `针对 ${input.topicName} 补充更多时效数据`,
          rationale: "避免数据过期带来的结论偏差",
          relatedDimensions:
            input.dimensionMetas.length > 0
              ? [input.dimensionMetas[0].dimensionId]
              : ["stub-dim-1"],
        },
      ],
    };

    return { output: result, tokensUsed: 0, costUsd: 0 };
  }
}
