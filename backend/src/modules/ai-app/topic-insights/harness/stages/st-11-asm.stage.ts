/**
 * ST-11-ASM · 报告组装
 *
 * 把 synthesis 的 fullMarkdown / executiveSummary / highlights 等字段
 * 组装为可直接写 DB 的 report artifact。
 *
 * 当前骨架：pass-through + 统计 wordCount / sectionCount。
 * Group E 接入 utils/assemble 的 UT-ASM-FULL / UT-ASM-TOC。
 */

import { Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { toPrismaJson } from "@/common/utils/prisma-json.utils";
import { numberSubHeadings } from "../utils";
import type {
  PipelineIdentityContext,
  Stage,
  StageResults,
} from "../pipeline/types";
import type { AssemblyStageOutput, SynthStageOutput } from "./stage-context";

@Injectable()
export class AssemblyStage implements Stage<
  SynthStageOutput,
  AssemblyStageOutput
> {
  readonly id = "ST-11-ASM" as const;
  readonly name = "Report assembly";
  readonly dependsOn = ["ST-07-SYNTH" as const];
  readonly runsWhen = "always" as const;
  readonly slo = { p95Ms: 10_000, tokenBudget: 0, targetSuccessRate: 0.99 };
  readonly emitsEvents = ["report:assembled"];

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async prepare(
    _identity: PipelineIdentityContext,
    upstream: StageResults,
  ): Promise<SynthStageOutput> {
    return upstream.get<SynthStageOutput>("ST-07-SYNTH");
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(
    _identity: PipelineIdentityContext,
    input: SynthStageOutput,
    _signal: AbortSignal,
  ): Promise<AssemblyStageOutput> {
    // 给各 `##` 章节下的 `###` 子标题自动编号
    const lines = input.synthesis.fullMarkdown.split("\n");
    let sectionCount = 0;
    let currentSectionStart = -1;
    const finalLines: string[] = [];

    const flushSection = (idx: number) => {
      if (currentSectionStart === -1) return;
      const slice = lines.slice(currentSectionStart, idx).join("\n");
      const numbered = numberSubHeadings(slice, sectionCount);
      finalLines.push(numbered);
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^##\s+/.test(line)) {
        flushSection(i);
        sectionCount += 1;
        currentSectionStart = i;
      }
    }
    flushSection(lines.length);

    const finalMd =
      finalLines.length > 0
        ? lines.slice(0, currentSectionStart).join("\n") +
          (currentSectionStart >= 0 ? "\n" : "") +
          finalLines.join("\n")
        : input.synthesis.fullMarkdown;

    return {
      fullMarkdown: finalMd,
      executiveSummary: input.synthesis.executiveSummary,
      wordCount: finalMd.length,
      sectionCount,
    };
  }

  async persist(
    identity: PipelineIdentityContext,
    output: AssemblyStageOutput,
  ): Promise<void> {
    if (!this.prisma) return;

    // 从 ST-07-SYNTH 的产物拿 highlights / riskMatrix / recommendations
    // 这里无法拿 upstream（persist 没接收 StageResults），退化用空数组。
    // 合理折中：ST-07 的 persist 已经把关键字段写了（F-2），这里只覆盖
    // `fullReport` / `totalDimensions` / `totalSources`（来自 assembly 后的最终值）。
    await this.prisma.topicReport.update({
      where: { id: identity.reportId },
      data: {
        fullReport: output.fullMarkdown,
        fullReportSize: Buffer.byteLength(output.fullMarkdown, "utf8"),
        executiveSummary: output.executiveSummary,
        totalDimensions: output.sectionCount,
      },
    });

    // 保留 toPrismaJson 以防后续扩展 highlights/charts 存入（当前无操作）
    void toPrismaJson;
  }
}
