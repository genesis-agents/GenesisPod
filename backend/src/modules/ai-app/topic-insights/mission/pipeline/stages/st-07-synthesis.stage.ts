/**
 * ST-07-SYNTH · 报告合成
 *
 * 调 AG-11-SY 基于 dimension metas 产出最终报告。
 * 严禁 Synthesizer 访问 evidence-save 工具（由 Agent 自身 forbiddenTools 保护）。
 */

import { Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { toPrismaJson } from "@/common/utils/prisma-json.utils";
import { SpecAgentRegistry } from "@/modules/ai-engine/facade";
import type { SynthesizerInput } from "@/modules/ai-app/topic-insights/agents/specs";
import type { SynthesisResult } from "@/modules/ai-app/topic-insights/agents/specs/schemas";
import { sanitizeSectionOutput } from "@/modules/ai-app/topic-insights/shared/utils/sanitize-output.utils";
import type { PipelineIdentityContext, Stage, StageResults } from "../types";
import type {
  IntegrateStageOutput,
  PlanStageOutput,
  SynthStageOutput,
  WriteStageOutput,
} from "./stage-context";

export interface SynthStageInput {
  /** baseline：合成必须带真实 topic name 而非 missionId placeholder */
  readonly topicName: string;
  readonly language: string;
  readonly dimensionMetas: IntegrateStageOutput["dimensionMetas"];
  readonly integratedSectionsPerDim: Record<string, string>;
}

@Injectable()
export class SynthStage implements Stage<SynthStageInput, SynthStageOutput> {
  readonly id = "ST-07-SYNTH" as const;
  readonly name = "Report synthesis";
  readonly dependsOn = ["ST-05-INTEGRATE" as const];
  readonly runsWhen = "always" as const;
  readonly slo = {
    p95Ms: 180_000,
    tokenBudget: 40_000,
    targetSuccessRate: 0.9,
  };
  readonly emitsEvents = [
    "report:synthesis_started",
    "report:synthesis_completed",
  ];

  constructor(
    private readonly agentRegistry: SpecAgentRegistry,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async prepare(
    _identity: PipelineIdentityContext,
    upstream: StageResults,
  ): Promise<SynthStageInput> {
    const integrate = upstream.get<IntegrateStageOutput>("ST-05-INTEGRATE");
    const write = upstream.get<WriteStageOutput>("ST-03-WRITE");
    // ★ baseline：从 LeaderPlan.taskUnderstanding.topic 读真实 topic name，
    //   不再使用 missionId placeholder；这影响 synthesis prompt 的 {topic} 展开。
    const plan = upstream.get<PlanStageOutput>("ST-01-PLAN").plan;

    const byDim: Record<string, string> = {};
    for (const s of write.sections) {
      byDim[s.dimensionId] = (byDim[s.dimensionId] ?? "") + "\n\n" + s.content;
    }

    return {
      topicName: plan.taskUnderstanding?.topic || plan.missionId,
      language: "zh",
      dimensionMetas: integrate.dimensionMetas,
      integratedSectionsPerDim: byDim,
    };
  }

  async execute(
    identity: PipelineIdentityContext,
    input: SynthStageInput,
    _signal: AbortSignal,
  ): Promise<SynthStageOutput> {
    const runner = this.agentRegistry.get<SynthesizerInput, SynthesisResult>(
      "AG-11-SY",
    );
    if (!runner)
      throw new Error("AG-11-SY not registered in SpecAgentRegistry");
    const res = await runner.executeSpec(
      {
        missionId: identity.missionId,
        topicId: identity.topicId,
        topicName: input.topicName,
        dimensionMetas: input.dimensionMetas,
        integratedSectionsPerDim: input.integratedSectionsPerDim,
        language: input.language,
      },
      identity.capabilities?.env,
    );
    if (res.state !== "completed") {
      throw new Error(
        `AG-11-SY failed: ${res.errors?.join("; ") ?? "unknown"}`,
      );
    }
    // ★ baseline 第三道铁墙：最终合成 markdown 在入 DB 前最后一次 sanitize，
    //   对冲 LLM 偶发的 JSON 残留 / 英文占位 / 元注释。
    const synth = res.output;
    return {
      synthesis: {
        ...synth,
        fullMarkdown: sanitizeSectionOutput(synth.fullMarkdown),
      },
    };
  }

  async persist(
    identity: PipelineIdentityContext,
    output: SynthStageOutput,
  ): Promise<void> {
    if (!this.prisma) return;
    const synth = output.synthesis;
    await this.prisma.topicReport.update({
      where: { id: identity.reportId },
      data: {
        executiveSummary: synth.executiveSummary,
        fullReport: synth.fullMarkdown,
        fullReportSize: Buffer.byteLength(synth.fullMarkdown, "utf8"),
        highlights: toPrismaJson(synth.highlights),
        // charts / riskMatrix / recommendations 未来纳入独立字段；
        // 当前合并 riskMatrix + recommendations 一并存入 charts 字段（schema 已有）
        charts: toPrismaJson({
          crossDimensionAnalysis: synth.crossDimensionAnalysis,
          riskMatrix: synth.riskMatrix,
          recommendations: synth.recommendations,
        }),
      },
    });
  }
}
