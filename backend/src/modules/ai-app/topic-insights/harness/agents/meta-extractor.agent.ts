/**
 * AG-05-ME · DimensionMetaExtractor
 *
 * 从 section 合集抽取 dimension 级 meta（summary / keyFindings / trends 等）。
 * 纯 LLM transformation，无工具访问。
 */

import { Injectable } from "@nestjs/common";
import { BaseAgentRunner } from "./base-agent-runner";
import { DimensionMetaSchema, type DimensionMeta } from "./schemas";
import type { AccessToolId, AgentRunContext } from "./types";

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

  protected async executeImpl(
    _ctx: AgentRunContext<MetaExtractorInput>,
  ): Promise<{ output: unknown; tokensUsed: number; costUsd: number }> {
    throw new Error(
      `[${this.id}] Real LLM execution not yet wired — use HARNESS_AGENTS_STUB=1`,
    );
  }

  protected async stubOutput(
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
    return { output: meta, tokensUsed: 0, costUsd: 0 };
  }
}
