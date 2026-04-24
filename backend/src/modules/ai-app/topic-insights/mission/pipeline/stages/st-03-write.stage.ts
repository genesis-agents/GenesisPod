/**
 * ST-03-WRITE · 分章节写作
 *
 * 对每个维度的每个 section 调 AG-03-SW。
 * 骨架：每个 dim 产出 2 个占位 section。
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  SpecAgentRegistry,
  classifyModelTier,
  ModelTier,
} from "@/modules/ai-engine/facade";
import type { SectionWriterInput } from "@/modules/ai-app/topic-insights/agents/specs";
import type { SectionResult } from "@/modules/ai-app/topic-insights/agents/specs/schemas";
import type { PipelineIdentityContext, Stage, StageResults } from "../types";
import { TIER_ADAPTATIONS } from "../config/tier-adaptations.config";
// ★ baseline sanitizeSectionOutput（section-writer.service.ts L442 / assembler L-）
//   第一道铁墙：LLM 输出落 DB 前必须过 sanitize
import { sanitizeSectionOutput } from "@/modules/ai-app/topic-insights/shared/utils/sanitize-output.utils";
// ★ baseline dimension-mission.distributeDiverseEvidence：section 间 evidence 差异化
import {
  distributeDiverseEvidence,
  type EvidenceData,
  type SectionLite,
} from "@/modules/ai-app/topic-insights/shared/utils/evidence-distribution.utils";
import type { OutlineStageOutput } from "./stage-context";
import type {
  PlanStageOutput,
  ResearchStageOutput,
  WriteStageOutput,
} from "./stage-context";

export interface WriteStageInput {
  readonly plan: PlanStageOutput["plan"];
  readonly research: ResearchStageOutput;
  /** Leader-driven section outlines (AG-02-DP 产出)；空时退化到硬编码 2 节 */
  readonly outlinesByDimension: Record<
    string,
    {
      readonly sections: ReadonlyArray<{
        readonly id: string;
        readonly title: string;
        readonly description: string;
        readonly targetWords: number;
        readonly keyPoints: ReadonlyArray<string>;
        readonly dependsOn: ReadonlyArray<string>;
      }>;
    }
  >;
}

@Injectable()
export class WriteStage implements Stage<WriteStageInput, WriteStageOutput> {
  readonly id = "ST-03-WRITE" as const;
  readonly name = "Section writing";
  // ST-02B-OUTLINE 提供 Leader-driven sections (AG-02-DP) 给 ST-03 消费；
  // ST-02-RESEARCH 间接通过 ST-02B.dependsOn 传递（DAG 拓扑排序仍保证顺序）
  readonly dependsOn = ["ST-02-RESEARCH" as const, "ST-02B-OUTLINE" as const];
  readonly runsWhen = "always" as const;
  readonly slo = {
    p95Ms: 180_000,
    tokenBudget: 20_000,
    targetSuccessRate: 0.9,
  };
  readonly emitsEvents = ["section:write_started", "section:write_completed"];

  private readonly logger = new Logger(WriteStage.name);

  constructor(
    private readonly agentRegistry: SpecAgentRegistry,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async prepare(
    _identity: PipelineIdentityContext,
    upstream: StageResults,
  ): Promise<WriteStageInput> {
    const planOut = upstream.get<PlanStageOutput>("ST-01-PLAN");
    const research = upstream.get<ResearchStageOutput>("ST-02-RESEARCH");
    // ST-02B 可能跳过（pipeline orchestrator 根据 runsWhen 决定），这里 tryGet
    const outlineOut = this.tryGetOutlineStage(upstream);
    return {
      plan: planOut.plan,
      research,
      outlinesByDimension: outlineOut?.outlinesByDimension ?? {},
    };
  }

  private tryGetOutlineStage(
    upstream: StageResults,
  ): OutlineStageOutput | null {
    try {
      return upstream.get<OutlineStageOutput>("ST-02B-OUTLINE");
    } catch {
      return null;
    }
  }

  async execute(
    identity: PipelineIdentityContext,
    input: WriteStageInput,
    signal: AbortSignal,
  ): Promise<WriteStageOutput> {
    const runner = this.agentRegistry.get<SectionWriterInput, SectionResult>(
      "AG-03-SW",
    );
    if (!runner)
      throw new Error("AG-03-SW not registered in SpecAgentRegistry");
    const sections: SectionResult[] = [];

    // dimensionId → evidence rows（ST-02 写入的真 evidence）
    const evidenceByDim = await this.loadEvidenceByDimension(input.research);

    // Tier 自适应（Apr 21 baseline TIER_ADAPTATIONS 恢复）
    // 默认 CHAT 模型决定 tier；capabilities 缺失时回落 STANDARD（基线行为）。
    const leaderModelId =
      identity.capabilities?.env.models.CHAT[0]?.modelId ?? "";
    const tier = leaderModelId
      ? classifyModelTier(leaderModelId)
      : ModelTier.STANDARD;
    const adaptation = TIER_ADAPTATIONS[tier];

    for (const dim of input.plan.dimensions) {
      const dimEvidence = evidenceByDim.get(dim.id) ?? [];
      // 弱模型 (BASIC) 截断证据数量，避免上下文过长引起质量下降
      const effectiveDimEvidence =
        adaptation.maxEvidenceItems > 0 &&
        dimEvidence.length > adaptation.maxEvidenceItems
          ? dimEvidence.slice(0, adaptation.maxEvidenceItems)
          : dimEvidence;

      // ★ targetWords 按 Tier 自适应（作为 outline 缺失时的 fallback）
      const baseTargetWords = adaptation.targetWordsPerSection ?? 600;

      // ★ baseline dimension-mission.distributeDiverseEvidence 接入：
      //   section 间 evidence 差异化分配（top-3 共享 + round-robin 独占）。
      //   每个 section 最多 core(3) + extra(5) = 8 条；promptIndex 全局一致。
      //
      // ★ ST-02B-OUTLINE 接入：优先用 AG-02-DP 产出的 Leader-规划 sections；
      //   若该 dim 无 outline（AG-02-DP 失败或 stage 跳过），退化 2 节硬编码。
      const outlineForDim = input.outlinesByDimension[dim.id];
      const leaderSections = outlineForDim?.sections ?? [];
      const sectionPlans: SectionLite[] =
        leaderSections.length > 0
          ? leaderSections.map((s) => ({
              id: s.id,
              title: s.title,
              keyPoints: s.keyPoints,
              description: s.description,
            }))
          : Array.from({ length: 2 }).map((_, si) => ({
              id: `${dim.id}-s-${si + 1}`,
              title: `${dim.name} 子章节 ${si + 1}`,
              keyPoints: [`子章节 ${si + 1} 要点 A`, `要点 B`],
              description: dim.description,
            }));
      const evidenceBySection = distributeDiverseEvidence(
        sectionPlans,
        effectiveDimEvidence.map(
          (r) =>
            ({
              id: r.id,
              title: r.title,
              snippet: r.snippet,
              url: r.url,
              domain: r.domain,
              // credibilityScore 暂未喂 weightProfile，后续接 Leader evidenceWeightHint 再补
            }) satisfies EvidenceData,
        ),
      );

      for (let si = 0; si < sectionPlans.length; si++) {
        if (signal.aborted) {
          throw new DOMException(
            `[${this.id}] aborted at dim=${dim.id} section=${si}`,
            "AbortError",
          );
        }
        const sectionPlan = sectionPlans[si];
        const distributedEvidence = evidenceBySection.get(sectionPlan.id);
        // 把 EvidenceData (带 promptIndex) → 原行形；无分配时用整 dim evidence
        const resolvedEvidence: Array<{
          id: string;
          title: string;
          url: string;
          snippet: string | null;
          domain: string | null;
          citationIndex: number | null;
        }> = distributedEvidence
          ? distributedEvidence.flatMap((e) => {
              const orig = effectiveDimEvidence.find((r) => r.id === e.id);
              if (!orig) return [];
              return [
                {
                  ...orig,
                  citationIndex: e.promptIndex ?? orig.citationIndex,
                },
              ];
            })
          : effectiveDimEvidence;
        const evidenceSummary = this.buildEvidenceSummary(
          dim.name,
          resolvedEvidence,
        );

        // ★ 若 Leader outline 指定了 targetWords，优先使用；否则 tier 推荐值
        const leaderTargetWords =
          leaderSections[si]?.targetWords ?? baseTargetWords;
        const sectionInput: SectionWriterInput = {
          topicId: identity.topicId,
          topicName: dim.name, // upstream context（Group E 接真 topic name）
          dimensionId: dim.id,
          dimensionName: dim.name,
          sectionPlan: {
            id: sectionPlan.id,
            title: sectionPlan.title,
            description: sectionPlan.description ?? "",
            targetWords: leaderTargetWords,
            keyPoints: [...sectionPlan.keyPoints],
          },
          evidenceSummary,
          language: "zh",
          tierHint: adaptation.promptSuffix
            ? { promptSuffix: adaptation.promptSuffix }
            : undefined,
        };
        const res = await runner.executeSpec(
          sectionInput,
          identity.capabilities?.env,
        );
        if (res.state !== "completed") {
          throw new Error(
            `AG-03-SW failed at ${dim.id}/s-${si + 1}: ${res.errors?.join("; ") ?? "unknown"}`,
          );
        }
        // ★ baseline 第一道铁墙：LLM 输出必须过 sanitize 再入管道
        const rawOutput = res.output;
        const cleanContent = sanitizeSectionOutput(rawOutput.content);
        sections.push({
          ...rawOutput,
          content: cleanContent,
          wordCount: cleanContent.length,
        });
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

  /**
   * 构造喂给 SectionWriter 的 evidenceSummary 字符串。
   *
   * 不再内部 slice(0, 12) —— Tier 自适应 (`TIER_ADAPTATIONS.maxEvidenceItems`)
   * 由 execute() 统一决定证据条数。这里原样格式化传入行，让 STRONG tier 能
   * 真正拿到全部证据、BASIC tier 严格限制在 8 条。
   */
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
    const lines = rows.map((r, idx) => {
      const ref = r.citationIndex ?? idx + 1;
      const dom = r.domain ? `（${r.domain}）` : "";
      const snippet = (r.snippet ?? "").slice(0, 220);
      return `[${ref}] ${r.title}${dom}\n    ${snippet}\n    来源: ${r.url}\n    evidenceId: ${r.id}`;
    });
    return `证据（${rows.length} 条）:\n\n${lines.join("\n\n")}`;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async persist(
    _identity: PipelineIdentityContext,
    _output: WriteStageOutput,
  ): Promise<void> {
    // Group E: 写 TopicReportSection 表
  }
}
