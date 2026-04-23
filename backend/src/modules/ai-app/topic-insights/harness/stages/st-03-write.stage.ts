/**
 * ST-03-WRITE · 分章节写作
 *
 * 对每个维度的每个 section 调 AG-03-SW。
 * 骨架：每个 dim 产出 2 个占位 section。
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  HarnessAgentRegistry,
  type SectionResult,
  type SectionWriterInput,
} from "../agents";
import type {
  PipelineIdentityContext,
  Stage,
  StageResults,
} from "../pipeline/types";
import type {
  PlanStageOutput,
  ResearchStageOutput,
  WriteStageOutput,
} from "./stage-context";

export interface WriteStageInput {
  readonly plan: PlanStageOutput["plan"];
  readonly research: ResearchStageOutput;
}

@Injectable()
export class WriteStage implements Stage<WriteStageInput, WriteStageOutput> {
  readonly id = "ST-03-WRITE" as const;
  readonly name = "Section writing";
  readonly dependsOn = ["ST-02-RESEARCH" as const];
  readonly runsWhen = "always" as const;
  readonly slo = {
    p95Ms: 180_000,
    tokenBudget: 20_000,
    targetSuccessRate: 0.9,
  };
  readonly emitsEvents = ["section:write_started", "section:write_completed"];

  private readonly logger = new Logger(WriteStage.name);

  constructor(
    private readonly agentRegistry: HarnessAgentRegistry,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async prepare(
    _identity: PipelineIdentityContext,
    upstream: StageResults,
  ): Promise<WriteStageInput> {
    const planOut = upstream.get<PlanStageOutput>("ST-01-PLAN");
    const research = upstream.get<ResearchStageOutput>("ST-02-RESEARCH");
    return { plan: planOut.plan, research };
  }

  async execute(
    identity: PipelineIdentityContext,
    input: WriteStageInput,
    signal: AbortSignal,
  ): Promise<WriteStageOutput> {
    const runner = this.agentRegistry.mustGet<
      SectionWriterInput,
      SectionResult
    >("AG-03-SW");
    const sections: SectionResult[] = [];

    // dimensionId → evidence rows（ST-02 写入的真 evidence）
    const evidenceByDim = await this.loadEvidenceByDimension(input.research);

    for (const dim of input.plan.dimensions) {
      const dimEvidence = evidenceByDim.get(dim.id) ?? [];
      const evidenceSummary = this.buildEvidenceSummary(dim.name, dimEvidence);

      for (let si = 0; si < 2; si++) {
        if (signal.aborted) {
          throw new DOMException(
            `[${this.id}] aborted at dim=${dim.id} section=${si}`,
            "AbortError",
          );
        }
        const sectionInput: SectionWriterInput = {
          topicId: identity.topicId,
          topicName: dim.name, // upstream context（Group E 接真 topic name）
          dimensionId: dim.id,
          dimensionName: dim.name,
          sectionPlan: {
            id: `${dim.id}-s-${si + 1}`,
            title: `${dim.name} 子章节 ${si + 1}`,
            description: dim.description,
            targetWords: 400,
            keyPoints: [`子章节 ${si + 1} 要点 A`, `要点 B`],
          },
          evidenceSummary,
          language: "zh",
        };
        const res = await runner.run({ input: sectionInput, identity, signal });
        sections.push(res.output);
      }
    }

    return { sections };
  }

  /**
   * 根据 ResearchStageOutput.byDimension[*].evidenceIds 从 DB 拉真 evidence 行。
   * 无 prisma（测试模式）返回空 Map。
   */
  private async loadEvidenceByDimension(research: ResearchStageOutput): Promise<
    Map<
      string,
      Array<{
        id: string;
        title: string;
        url: string;
        snippet: string | null;
        domain: string | null;
        citationIndex: number | null;
      }>
    >
  > {
    const byDim = new Map<
      string,
      Array<{
        id: string;
        title: string;
        url: string;
        snippet: string | null;
        domain: string | null;
        citationIndex: number | null;
      }>
    >();
    if (!this.prisma) return byDim;

    for (const outcome of research.byDimension) {
      if (outcome.evidenceIds.length === 0) continue;
      try {
        const rows = await this.prisma.topicEvidence.findMany({
          where: { id: { in: [...outcome.evidenceIds] } },
          select: {
            id: true,
            title: true,
            url: true,
            snippet: true,
            domain: true,
            citationIndex: true,
          },
        });
        byDim.set(outcome.dimensionId, rows);
      } catch (err) {
        this.logger.warn(
          `loadEvidence dim=${outcome.dimensionId} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return byDim;
  }

  /** 构造喂给 SectionWriter 的 evidenceSummary 字符串 */
  private buildEvidenceSummary(
    dimensionName: string,
    rows: Array<{
      id: string;
      title: string;
      url: string;
      snippet: string | null;
      domain: string | null;
      citationIndex: number | null;
    }>,
  ): string {
    if (rows.length === 0) {
      return `维度 "${dimensionName}" 暂无可用证据。`;
    }
    const lines = rows.slice(0, 12).map((r, idx) => {
      const ref = r.citationIndex ?? idx + 1;
      const dom = r.domain ? `（${r.domain}）` : "";
      const snippet = (r.snippet ?? "").slice(0, 220);
      return `[${ref}] ${r.title}${dom}\n    ${snippet}\n    来源: ${r.url}\n    evidenceId: ${r.id}`;
    });
    return `证据（${rows.length} 条，取前 ${Math.min(rows.length, 12)} 条）:\n\n${lines.join("\n\n")}`;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async persist(
    _identity: PipelineIdentityContext,
    _output: WriteStageOutput,
  ): Promise<void> {
    // Group E: 写 TopicReportSection 表
  }
}
