/**
 * ST-11-ASM · 报告组装
 *
 * 把 synthesis 的 fullMarkdown / executiveSummary / highlights 等字段
 * 组装为可直接写 DB 的 report artifact。
 *
 * 当前骨架：pass-through + 统计 wordCount / sectionCount。
 * Group E 接入 utils/assemble 的 UT-ASM-FULL / UT-ASM-TOC。
 */

import { Injectable } from "@nestjs/common";
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
  readonly slo = { p95Ms: 10_000, maxTokens: 0, targetSuccessRate: 0.99 };
  readonly emitsEvents = ["report:assembled"];

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

  // eslint-disable-next-line @typescript-eslint/require-await
  async persist(
    _identity: PipelineIdentityContext,
    _output: AssemblyStageOutput,
  ): Promise<void> {
    // Group E: 最终写 TopicReport
  }
}
