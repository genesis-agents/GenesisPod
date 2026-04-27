/**
 * LeaderAgent —— Mission 唯一最终负责对象（multi-phase）
 *
 * 设计 (Lead-Replanner-Lite, baseline §Leader-as-Single-Responsibility):
 *   • 单一 LLM agent spec，全程在 4 个 milestone 在场
 *   • 每个 phase 的 input 包含"自己之前说过的话"，让 LLM 真正承担过程责任
 *   • 业务规则强制 M7 的 accountabilityNote 引用过去决策（防止橡皮图章签字）
 *
 * 4 个 phase:
 *   M0 plan            — 拆维度 + 声明 successCriteria/qualityBar/deliverables
 *   M1 assess-research — researchers 完成后做过程管理（accept/patch/redirect/abort）
 *   M6 foreword        — 写 meta-level 综合摘要（vs Writer 的 ExecutiveSummary）
 *   M7 signoff         — 签字 + 自评分 + accountabilityNote
 *
 * Prompt 不嵌在 .ts 里 —— 拆到 duties/<phase>.md，由 duty-loader 加载并模板渲染。
 *
 * 生命周期:
 *   AgentRunner.run(LeaderAgent, { phase: ..., ... })
 *   ↑ 由 LeaderService.create() → SupervisedMission 在每个 milestone 调用，
 *     传入累积的 missionContext
 */

import { z } from "zod";
import {
  AgentSpec,
  DefineAgent,
} from "../../../../ai-harness/facade";
import { buildPromptFromDuty } from "../../utils/duty-loader";

// ── 共享子 schema ──
const Goals = z.object({
  successCriteria: z.array(z.string().min(8)).min(1).max(10),
  qualityBar: z.object({
    minSources: z.number().int().min(0).max(50),
    minCoverage: z.number().int().min(0).max(100),
    hardConstraints: z.array(z.string()).default([]),
  }),
  deliverables: z.array(z.string().min(4)).min(1).max(8),
});

const InitialRisk = z.object({
  type: z.string().min(2),
  severity: z.enum(["low", "medium", "high"]),
  mitigation: z.string().min(8),
});

const Dimension = z.object({
  id: z.string(),
  name: z.string(),
  rationale: z.string(),
  toolHint: z.object({
    categories: z.array(z.string()).min(1),
    preferIds: z.array(z.string()).optional(),
  }),
  dependsOn: z.array(z.string()).optional(),
});

/** Leader 自己历史决策的简化记录（喂给后续 phase 用） */
const PastDecision = z.object({
  phase: z.enum(["plan", "assess-research", "foreword"]),
  at: z.string(),
  decision: z.string(),
  rationale: z.string(),
});

const ResearcherOutcome = z.object({
  dimensionId: z.string(),
  dimensionName: z.string(),
  state: z.enum(["completed", "degraded", "failed"]),
  findingsCount: z.number().int().min(0),
  sources: z.array(z.string()),
  summary: z.string(),
  failureCode: z.string().optional(),
});

const QualitySnapshot = z.object({
  sourceCount: z.number().int().min(0),
  coverageScore: z.number().int().min(0).max(100),
  overall: z.number().int().min(0).max(100),
  finalVerdict: z.string(),
  reviewerAvgScore: z.number().int().min(0).max(100).optional(),
  criticVerdict: z.enum(["pass", "concerns", "fail"]).optional(),
  criticBlindspots: z.array(z.string()).default([]),
  criticBiases: z.array(z.string()).default([]),
});

// ── Input: discriminated union by phase ──
const Input = z.discriminatedUnion("phase", [
  z.object({
    phase: z.literal("plan"),
    topic: z.string(),
    depth: z.enum(["quick", "standard", "deep"]),
    language: z.enum(["zh-CN", "en-US"]),
    userProfile: z.unknown().optional(),
  }),
  z.object({
    phase: z.literal("assess-research"),
    topic: z.string(),
    language: z.enum(["zh-CN", "en-US"]),
    myPlan: z.object({
      goals: Goals,
      dimensions: z.array(Dimension),
    }),
    researcherOutcomes: z.array(ResearcherOutcome),
  }),
  z.object({
    phase: z.literal("foreword"),
    topic: z.string(),
    language: z.enum(["zh-CN", "en-US"]),
    myPlan: z.object({ goals: Goals, dimensions: z.array(Dimension) }),
    myDecisions: z.array(PastDecision).default([]),
    stageOutcomes: z.object({
      researcherStates: z.array(
        z.object({
          name: z.string(),
          state: z.enum(["completed", "degraded", "failed"]),
        }),
      ),
      reconciliation: z
        .object({
          factCount: z.number().int(),
          conflictCount: z.number().int(),
          criticalGaps: z.array(z.string()).default([]),
        })
        .optional(),
      writerSections: z.array(z.string()),
      qualitySnapshot: QualitySnapshot,
    }),
  }),
  z.object({
    phase: z.literal("signoff"),
    topic: z.string(),
    language: z.enum(["zh-CN", "en-US"]),
    myPlan: z.object({ goals: Goals, dimensions: z.array(Dimension) }),
    myDecisions: z.array(PastDecision).default([]),
    myForeword: z.object({
      whatWeAnswered: z.array(
        z.object({
          criterion: z.string(),
          addressed: z.enum(["yes", "partial", "no"]),
          evidence: z.string(),
        }),
      ),
      whatRemainsUnclear: z.array(z.string()).default([]),
    }),
    finalQuality: z.object({
      sourceCount: z.number().int(),
      coverageScore: z.number().int(),
      overall: z.number().int(),
      finalVerdict: z.string(),
      wordCount: z.number().int(),
      reviewerAvgScore: z.number().int().optional(),
      criticVerdict: z.enum(["pass", "concerns", "fail"]).optional(),
    }),
    dimensionStates: z.array(
      z.object({
        name: z.string(),
        state: z.enum(["completed", "degraded", "failed"]),
      }),
    ),
  }),
]);

// ── Output: discriminated union by phase ──
const Output = z.discriminatedUnion("phase", [
  z.object({
    phase: z.literal("plan"),
    themeSummary: z.string().min(20),
    dimensions: z.array(Dimension).min(2).max(7),
    goals: Goals,
    initialRisks: z.array(InitialRisk).default([]),
  }),
  z.object({
    phase: z.literal("assess-research"),
    decision: z.enum(["accept-all", "patch", "redirect", "abort"]),
    rationale: z.string().min(20),
    perDimension: z.array(
      z.object({
        dimensionId: z.string(),
        action: z.enum([
          "accept",
          "accept-degraded",
          "retry-with-critique",
          "replace-spec",
          "abort",
        ]),
        critique: z.string().optional(),
        newAgentSpecId: z.string().optional(),
      }),
    ),
    newDimensions: z.array(Dimension).default([]),
  }),
  z.object({
    phase: z.literal("foreword"),
    whatWeAnswered: z
      .array(
        z.object({
          criterion: z.string().min(4),
          addressed: z.enum(["yes", "partial", "no"]),
          evidence: z.string().min(8),
        }),
      )
      .min(1)
      .max(10),
    whatRemainsUnclear: z.array(z.string().min(4)).max(8).default([]),
    howToRead: z.string().min(20).max(500),
    recommendedFollowUp: z.array(z.string().min(4)).max(6).default([]),
  }),
  z.object({
    phase: z.literal("signoff"),
    leaderOverallScore: z.number().int().min(0).max(100),
    leaderVerdict: z.enum(["excellent", "good", "acceptable", "failed"]),
    accountabilityNote: z.string().min(50).max(1500),
    signed: z.boolean(),
    refusalReason: z.string().optional(),
  }),
]);

// 公开类型方便 LeaderService / orchestrator 使用
export type LeaderInput = z.infer<typeof Input>;
export type LeaderOutput = z.infer<typeof Output>;
export type LeaderPlanOutput = Extract<LeaderOutput, { phase: "plan" }>;
export type LeaderAssessResearchOutput = Extract<
  LeaderOutput,
  { phase: "assess-research" }
>;
export type LeaderForewordOutput = Extract<LeaderOutput, { phase: "foreword" }>;
export type LeaderSignoffOutput = Extract<LeaderOutput, { phase: "signoff" }>;

@DefineAgent({
  id: "playground.leader",
  version: "2.0.0",
  identity: {
    role: "leader",
    description:
      "Mission 唯一最终负责对象。在 plan / assess-research / foreword / signoff 4 个 milestone 全程在场，对最终产物签字承担问责。",
  },
  loop: "react",
  toolCategories: ["information"],
  taskProfile: {
    creativity: "low",
    outputLength: "medium",
    reasoningDepth: "moderate",
  },
  inputSchema: Input,
  outputSchema: Output,
  budget: { maxTokens: 16_000, maxIterations: 4 },
})
export class LeaderAgent extends AgentSpec<typeof Input, typeof Output> {
  buildSystemPrompt({ input }: { input: z.infer<typeof Input> }): string {
    const dutyName: Record<typeof input.phase, string> = {
      plan: "plan",
      "assess-research": "assess-research",
      foreword: "foreword",
      signoff: "signoff",
    };
    // 计算 plan phase 才用得到的辅助变量
    const enriched: Record<string, unknown> = {
      ...(input as unknown as Record<string, unknown>),
    };
    if (input.phase === "plan") {
      enriched.currentDate = new Date().toISOString().slice(0, 10);
      enriched.currentYear = new Date().getFullYear();
      enriched.dimensionsTarget =
        input.depth === "quick"
          ? "2-3"
          : input.depth === "deep"
            ? "5-7"
            : "3-5";
    }
    return buildPromptFromDuty("leader", dutyName[input.phase], enriched);
  }

  /**
   * 业务规则校验（mission-pipeline-baseline.md §Leader）
   *
   * 重点:
   *   - plan: dim 数量符合 depth target + dim id 唯一
   *   - assess-research: perDimension 必须覆盖所有 dim, retry/replace 必填补充字段
   *   - foreword: 有 degraded / critical gap 时 whatRemainsUnclear 不能为空
   *   - signoff:
   *     · signed=false 必须填 refusalReason
   *     · verdict ↔ score 一致
   *     · accountabilityNote 必须引用历史决策
   */
  validateBusinessRules(
    output: z.infer<typeof Output>,
    ctx: { input: z.infer<typeof Input>; identity: unknown },
  ): void {
    const issues: string[] = [];

    if (output.phase === "plan" && ctx.input.phase === "plan") {
      const target =
        ctx.input.depth === "quick"
          ? [2, 3]
          : ctx.input.depth === "deep"
            ? [5, 7]
            : [3, 5];
      if (
        output.dimensions.length < target[0] ||
        output.dimensions.length > target[1]
      ) {
        issues.push(
          `depth=${ctx.input.depth} 要求 ${target[0]}-${target[1]} dim, 实际 ${output.dimensions.length}`,
        );
      }
      const ids = new Set<string>();
      for (const d of output.dimensions) {
        if (ids.has(d.id))
          issues.push(`dimension id "${d.id}" 重复（M0 必须唯一）`);
        ids.add(d.id);
      }
    }

    if (
      output.phase === "assess-research" &&
      ctx.input.phase === "assess-research"
    ) {
      const dimIds = new Set(
        ctx.input.researcherOutcomes.map((r) => r.dimensionId),
      );
      const coveredIds = new Set(output.perDimension.map((p) => p.dimensionId));
      for (const id of dimIds) {
        if (!coveredIds.has(id)) {
          issues.push(
            `perDimension 缺少 dim ${id} 的处理决策（必须覆盖所有 dim）`,
          );
        }
      }
      if (
        output.decision === "patch" &&
        output.perDimension.every((p) => p.action === "accept")
      ) {
        issues.push(
          `decision=patch 但 perDimension 全是 accept（应至少 1 个 retry/replace/abort/accept-degraded）`,
        );
      }
      for (const p of output.perDimension) {
        if (p.action === "retry-with-critique" && !p.critique) {
          issues.push(
            `dim ${p.dimensionId} action=retry-with-critique 但 critique 缺失`,
          );
        }
        if (p.action === "replace-spec" && !p.newAgentSpecId) {
          issues.push(
            `dim ${p.dimensionId} action=replace-spec 但 newAgentSpecId 缺失`,
          );
        }
      }
    }

    if (output.phase === "foreword" && ctx.input.phase === "foreword") {
      const hasDegraded = ctx.input.stageOutcomes.researcherStates.some(
        (s) => s.state !== "completed",
      );
      const hasCriticalGap =
        (ctx.input.stageOutcomes.reconciliation?.criticalGaps.length ?? 0) > 0;
      const hasCriticConcern =
        ctx.input.stageOutcomes.qualitySnapshot.criticVerdict === "fail" ||
        ctx.input.stageOutcomes.qualitySnapshot.criticBlindspots.length > 0;
      if (
        (hasDegraded || hasCriticalGap || hasCriticConcern) &&
        output.whatRemainsUnclear.length === 0
      ) {
        issues.push(
          `存在 degraded dim / critical gap / critic concern，但 whatRemainsUnclear 为空（Lead 必须诚实）`,
        );
      }
      const expectedCount = ctx.input.myPlan.goals.successCriteria.length;
      if (output.whatWeAnswered.length < expectedCount) {
        issues.push(
          `whatWeAnswered 只覆盖 ${output.whatWeAnswered.length} 条，应覆盖 ${expectedCount} 条 successCriteria`,
        );
      }
    }

    if (output.phase === "signoff") {
      if (!output.signed && !output.refusalReason) {
        issues.push("signed=false 时必须填 refusalReason");
      }
      const v = output.leaderVerdict;
      const s = output.leaderOverallScore;
      if (v === "excellent" && s < 80)
        issues.push(`verdict=excellent 但 score=${s} < 80`);
      if (v === "good" && (s < 65 || s >= 90))
        issues.push(`verdict=good 但 score=${s} 不在 [65,90)`);
      if (v === "acceptable" && (s < 45 || s >= 75))
        issues.push(`verdict=acceptable 但 score=${s} 不在 [45,75)`);
      if (v === "failed" && s >= 60)
        issues.push(`verdict=failed 但 score=${s} >= 60`);
      const note = output.accountabilityNote;
      if (!/M[0-9]|我在|我决定|我让|我之前|当时|我作为|本次/.test(note)) {
        issues.push(
          `accountabilityNote 必须引用历史决策（含 "我在/我决定/M0/M1/M6/当时" 等关键词），不接受空话`,
        );
      }
    }

    if (issues.length > 0) {
      throw new Error(issues.join("; "));
    }
  }
}
