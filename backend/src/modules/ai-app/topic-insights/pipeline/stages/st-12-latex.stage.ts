/**
 * ST-12-LATEX · LaTeX delimiter 修复（条件执行）
 *
 * 依赖 ST-11-ASM；runsWhen=hasLatex 仅在 assembly 产物含 LaTeX 时执行。
 *
 * 运行时 hasLatex 判断由 orchestrator 的 evalCondition 处理；当前
 * orchestrator 对 hasLatex 返回 false（默认 skip）。此 stage 接入方式：
 * 1. 如果 Advanced Tier 在 orchestrator 加入 runtime hasLatex 判断 → 自动跑
 * 2. 否则仅作为 registry 上的 stage 备用
 *
 * 实际修复用 harness 的 validateLatexDelimiters utility（粗暴 fix）；
 * 真 Advanced Tier 的 AG-14-LX 做 LLM-based 修复。
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { validateLatexDelimiters } from "../utils";
import type { PipelineIdentityContext, Stage, StageResults } from "../types";
import type { AssemblyStageOutput, LatexStageOutput } from "./stage-context";

@Injectable()
export class LatexStage implements Stage<
  AssemblyStageOutput,
  LatexStageOutput
> {
  private readonly logger = new Logger(LatexStage.name);
  readonly id = "ST-12-LATEX" as const;
  readonly name = "LaTeX repair";
  readonly dependsOn = ["ST-11-ASM" as const];
  readonly runsWhen = "hasLatex" as const;
  readonly slo = {
    p95Ms: 60_000,
    tokenBudget: 10_000,
    targetSuccessRate: 0.95,
  };
  readonly emitsEvents = ["latex:repaired"];

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async prepare(
    _identity: PipelineIdentityContext,
    upstream: StageResults,
  ): Promise<AssemblyStageOutput> {
    return upstream.get<AssemblyStageOutput>("ST-11-ASM");
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(
    _identity: PipelineIdentityContext,
    input: AssemblyStageOutput,
    _signal: AbortSignal,
  ): Promise<LatexStageOutput> {
    const result = validateLatexDelimiters(input.fullMarkdown);
    const repaired = result.repaired ?? input.fullMarkdown;

    if (result.issues.length > 0) {
      this.logger.warn(
        `latex issues=${result.issues.length} → repaired markdown (${input.fullMarkdown.length}→${repaired.length} chars)`,
      );
    }

    return {
      fullMarkdown: repaired,
      repaired: result.issues.length > 0,
      issuesFound: result.issues.length,
    };
  }

  async persist(
    identity: PipelineIdentityContext,
    output: LatexStageOutput,
  ): Promise<void> {
    if (!this.prisma || !output.repaired) return;
    // 覆盖 TopicReport.fullReport 为修复版
    await this.prisma.topicReport
      .update({
        where: { id: identity.reportId },
        data: {
          fullReport: output.fullMarkdown,
          fullReportSize: Buffer.byteLength(output.fullMarkdown, "utf8"),
        },
      })
      .catch((err: unknown) =>
        this.logger.warn(
          `topicReport update failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
  }
}
