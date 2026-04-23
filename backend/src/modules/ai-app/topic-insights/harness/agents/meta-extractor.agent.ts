/**
 * AG-05-ME · DimensionMetaExtractor
 *
 * 从 section 合集抽取 dimension 级 meta（summary / keyFindings / trends 等）。
 * 纯 LLM transformation，无工具访问。
 */

import { Injectable, Optional } from "@nestjs/common";
import type { TaskProfile } from "@/modules/ai-engine/facade";
import { BaseAgentRunner } from "./base-agent-runner";
import { DimensionMetaSchema, type DimensionMeta } from "./schemas";
import type { AccessToolId, AgentRunContext } from "./types";
import { LlmInvokerService } from "../llm";

export interface MetaExtractorInput {
  readonly dimensionId: string;
  readonly dimensionName: string;
  readonly integratedSections: string;
  /** 必须来自 DB count（原则 6 — evidenceUsed 从 DB 读） */
  readonly evidenceCount: number;
}

@Injectable()
export class MetaExtractorAgent extends BaseAgentRunner<
  MetaExtractorInput,
  DimensionMeta
> {
  readonly id = "AG-05-ME";
  readonly name = "Dimension Meta Extractor";
  readonly tools: ReadonlyArray<AccessToolId> = [];
  readonly outputSchema = DimensionMetaSchema;
  protected readonly taskProfile: TaskProfile = {
    creativity: "low",
    outputLength: "medium",
  };

  constructor(@Optional() llmInvoker?: LlmInvokerService) {
    super(llmInvoker);
  }

  protected buildSystemPrompt(
    _ctx: AgentRunContext<MetaExtractorInput>,
  ): string {
    return [
      "你是维度元信息提取员。从整合后的章节合集中提取 dimension 级：summary（30+ 字）/ keyFindings（≥ 1）/ trends / challenges / opportunities。",
      "约束：",
      "1. 不创造新内容，只做总结提炼",
      "2. evidenceCount 必须使用给定值（不自报）",
      "3. summary 不超过 300 字",
      "",
      "严格 JSON 输出。",
    ].join("\n");
  }

  protected buildUserPrompt(ctx: AgentRunContext<MetaExtractorInput>): string {
    const { input } = ctx;
    return [
      `dimensionId: ${input.dimensionId}`,
      `dimensionName: ${input.dimensionName}`,
      `evidenceCount: ${input.evidenceCount}（必须原样填入 output.evidenceCount）`,
      "",
      "integratedSections（可能较长，需概括）：",
      input.integratedSections.slice(0, 8000),
      "",
      "请输出 DimensionMeta JSON。",
    ].join("\n");
  }

  protected stubOutput(
    ctx: AgentRunContext<MetaExtractorInput>,
  ): Promise<{ output: unknown; tokensUsed: number; costUsd: number }> {
    const { input } = ctx;
    const meta: DimensionMeta = {
      dimensionId: input.dimensionId,
      dimensionName: input.dimensionName,
      summary: `${input.dimensionName} 维度的研究表明：关键结构与趋势已识别（stub summary）。整合章节规模 ${input.integratedSections.length} 字符。`,
      keyFindings: [
        `${input.dimensionName} 发现 1（stub）`,
        `${input.dimensionName} 发现 2（stub）`,
        `${input.dimensionName} 发现 3（stub）`,
      ],
      trends: [
        `${input.dimensionName} 趋势 A`,
        `${input.dimensionName} 趋势 B`,
      ],
      challenges: [`${input.dimensionName} 挑战 1`],
      opportunities: [`${input.dimensionName} 机会 1`],
      evidenceCount: input.evidenceCount,
    };
    return Promise.resolve({ output: meta, tokensUsed: 0, costUsd: 0 });
  }
}
