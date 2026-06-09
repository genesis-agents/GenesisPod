/**
 * DeepInsightStageBindings —— deep-insight 14 阶段执行内核（能力家提供）。
 *
 * 设计依据：docs/architecture/capability-execution-architecture.md §2.1 / §3 / §4。
 *
 * 职责：为 recipe 的每个 step 提供该 step primitive 所需的 ResolvedStageHooks。
 *   - 调哪个 agent / 产出写哪 / 喂下游什么 —— 全部在此 wiring（**不重写 prompt**：
 *     agent 与 skill 是共享的，recipe 已 load SKILL.md；本文件只是 wiring）。
 *   - 中间态全程走 harness CrossStageState（key 用 deep-insight.* 前缀），零 app DB。
 *   - LLM 调用统一经 invokeAgent → harness AgentRunner（共享 @DefineAgent）。
 *
 * 逻辑来源（§3 下沉表）：playground 13 个角色服务（Leader/Reconciler/Analyst/Writer/
 * Reviewer/Verifier/Steward + 评判组合）的"调哪个 agent + 写哪 + 喂什么"编排逻辑，
 * 改写为调共享 agent + 写 CrossStageState。
 *
 * 铁律（§1.2 R1/R2/R5）：零 app import；只依赖 harness facade + 共享 agent + 端口。
 */
import type {
  AgentRunner,
  CrossStageState,
  ResolvedStageHooks,
  StageRunArgs,
} from "@/modules/ai-harness/facade";
import { defineStageHooks } from "@/modules/ai-harness/facade";
import { CS_KEY, readPipelineInput, type StageBindings } from "../ports";
import { invokeAgent } from "./agent-invoke.helper";

/** plan 阶段产物（维度拆解）。 */
interface PlanResult {
  themeSummary: string;
  dimensions: { id: string; name: string; rationale: string }[];
}

/** 单维 researcher 产物（findings + summary）。 */
interface ResearcherResult {
  dimension: string;
  findings: Array<{
    claim?: string;
    evidence?: string;
    source?: string;
    sourceTitle?: string;
    sourceSnippet?: string;
  }>;
  summary: string;
}

export class DeepInsightStageBindings implements StageBindings {
  constructor(private readonly runner: AgentRunner) {}

  buildHooksForStep(stepId: string): ResolvedStageHooks {
    switch (stepId) {
      case "s1-budget":
        return this.buildBudgetHooks();
      case "s2-leader-plan":
        return this.buildPlanHooks();
      case "s3-researcher-collect":
        return this.buildResearchHooks();
      case "s4-leader-assess":
        return this.buildAssessHooks();
      case "s5-reconciler":
        return this.buildReconcileHooks();
      case "s6-analyst":
        return this.buildAnalyzeHooks();
      case "s7-writer-outline":
        return this.buildOutlineHooks();
      case "s8-writer":
        return this.buildWriterHooks();
      case "s8b-quality-enhancement":
      case "s9-critic":
      case "s9b-objective-eval":
        return this.buildReviewHooks(stepId);
      case "s10-leader-foreword-signoff":
        return this.buildSignoffHooks();
      case "s11-persist":
        return this.buildPersistHooks();
      default:
        throw new Error(
          `[deep-insight bindings] 无 hook builder for step "${stepId}"`,
        );
    }
  }

  // ── S1 budget gate（persist primitive，budget-pre 模式；无 LLM）──────────────
  private buildBudgetHooks(): ResolvedStageHooks {
    return defineStageHooks({
      persist: async (): Promise<void> => {
        // budget gate 是预算闸；能力内核不直连 DB——预算/计费由消费方在 ctx 注入。
        // 本 step 仅作 pipeline 锚点（s1-budget），无 app 副作用。
      },
    });
  }

  // ── S2 leader plan（plan primitive）──────────────────────────────────────────
  private buildPlanHooks(): ResolvedStageHooks {
    return defineStageHooks({
      runRole: async (args: { ctx: StageRunArgs["ctx"] }): Promise<unknown> => {
        const full = this.fullArgs(args.ctx);
        const input = readPipelineInput(full.ctx);
        const res = await invokeAgent({
          runner: this.runner,
          specId: "playground.leader",
          input: {
            phase: "plan",
            topic: input.topic,
            language: input.language,
            ...(input.invocation.description
              ? { description: input.invocation.description }
              : {}),
          },
          invocation: input.invocation,
          crossStageState: full.crossStageState,
          signal: full.ctx.signal,
          stepId: "s2-leader-plan",
          role: "leader",
          operationType: "plan",
        });
        const plan = this.normalizePlan(res.output, input.topic);
        full.crossStageState.set<PlanResult>(CS_KEY.plan, plan);
        return plan;
      },
      extractPlanFields: (raw: unknown) => {
        const plan = raw as PlanResult | undefined;
        return { dimensions: plan?.dimensions ?? [] };
      },
    });
  }

  // ── S3 researcher fan-out（research primitive）────────────────────────────────
  private buildResearchHooks(): ResolvedStageHooks {
    return defineStageHooks({
      fanOut: (args: { ctx: StageRunArgs["ctx"] }): ReadonlyArray<unknown> => {
        const full = this.fullArgs(args.ctx);
        const plan = full.crossStageState.get<PlanResult>(CS_KEY.plan);
        if (!plan) {
          throw new Error("[s3-researcher-collect] 无 plan（s2 未产出）");
        }
        return plan.dimensions;
      },
      perItemPipeline: async (args: {
        item: unknown;
        ctx: StageRunArgs["ctx"];
      }): Promise<unknown> => {
        const full = this.fullArgs(args.ctx);
        const input = readPipelineInput(full.ctx);
        const dim = args.item as { id: string; name: string };
        const res = await invokeAgent({
          runner: this.runner,
          specId: "playground.researcher",
          input: {
            topic: input.topic,
            dimension: dim.name,
            language: input.language,
            withFigures: input.invocation.withFigures ?? false,
            ...(input.invocation.description
              ? { description: input.invocation.description }
              : {}),
            ...(input.invocation.knowledgeBaseIds?.length
              ? { knowledgeBaseIds: [...input.invocation.knowledgeBaseIds] }
              : {}),
            ...(input.invocation.searchTimeRange
              ? { searchTimeRange: input.invocation.searchTimeRange }
              : {}),
          },
          invocation: input.invocation,
          crossStageState: full.crossStageState,
          signal: full.ctx.signal,
          stepId: "s3-researcher-collect",
          role: "researcher",
          dimension: dim.name,
          operationType: "research",
        });
        // ReActLoop 到 maxIterations 未 finalize 时 output=null，不能伪装成功。
        if (res.output == null) {
          throw new Error(
            `[s3-researcher-collect] dim "${dim.name}" 无有效产出`,
          );
        }
        const result = res.output as ResearcherResult;
        full.crossStageState.append<ResearcherResult>(
          CS_KEY.researcherResults,
          result,
        );
        return result;
      },
      onPatchFailure: (_args: { item: unknown; error: unknown }): void => {
        // 单维失败不阻断 mission（research primitive 已计 failureCount）；
        // 终态有效产出数量由 runner 兜底判定（全失败 → failed）。
      },
    });
  }

  // ── S4 leader assess（assess primitive）───────────────────────────────────────
  private buildAssessHooks(): ResolvedStageHooks {
    return defineStageHooks({
      runRole: async (args: { ctx: StageRunArgs["ctx"] }): Promise<unknown> => {
        const full = this.fullArgs(args.ctx);
        const input = readPipelineInput(full.ctx);
        const plan = full.crossStageState.get<PlanResult>(CS_KEY.plan);
        const researcherResults =
          full.crossStageState.get<ResearcherResult[]>(
            CS_KEY.researcherResults,
          ) ?? [];
        const res = await invokeAgent({
          runner: this.runner,
          specId: "playground.leader",
          input: {
            phase: "assess-research",
            topic: input.topic,
            language: input.language,
            plan,
            researcherResults,
          },
          invocation: input.invocation,
          crossStageState: full.crossStageState,
          signal: full.ctx.signal,
          stepId: "s4-leader-assess",
          role: "leader",
          operationType: "assess",
        });
        return res.output ?? { decision: "continue" };
      },
      // assess 决策：能力内核默认 continue（patch/abort 的过程管理是 app 增强，
      // 不在共享内核默认路径——降级为"评估后继续"，不退化报告产出）。
      parseDecision: (_raw: unknown): "continue" => "continue",
    });
  }

  // ── S5 reconciler（synthesize primitive，reconcile 模式）───────────────────────
  private buildReconcileHooks(): ResolvedStageHooks {
    return defineStageHooks({
      synthesize: async (args: {
        ctx: StageRunArgs["ctx"];
      }): Promise<unknown> => {
        const full = this.fullArgs(args.ctx);
        const input = readPipelineInput(full.ctx);
        const plan = full.crossStageState.get<PlanResult>(CS_KEY.plan);
        const researcherResults =
          full.crossStageState.get<ResearcherResult[]>(
            CS_KEY.researcherResults,
          ) ?? [];
        try {
          const res = await invokeAgent({
            runner: this.runner,
            specId: "playground.reconciler",
            input: {
              topic: input.topic,
              language: input.language,
              plan,
              researcherResults,
            },
            invocation: input.invocation,
            crossStageState: full.crossStageState,
            signal: full.ctx.signal,
            stepId: "s5-reconciler",
            role: "reconciler",
            operationType: "reconcile",
          });
          full.crossStageState.set(CS_KEY.reconciliationReport, res.output);
          return res.output;
        } catch {
          // reconciler 可降级：失败不阻断，下游 analyst 收空对账报告。
          full.crossStageState.set(CS_KEY.reconciliationReport, null);
          return null;
        }
      },
    });
  }

  // ── S6 analyst（synthesize primitive，analyze 模式）────────────────────────────
  private buildAnalyzeHooks(): ResolvedStageHooks {
    return defineStageHooks({
      synthesize: async (args: {
        ctx: StageRunArgs["ctx"];
      }): Promise<unknown> => {
        const full = this.fullArgs(args.ctx);
        const input = readPipelineInput(full.ctx);
        const researcherResults =
          full.crossStageState.get<ResearcherResult[]>(
            CS_KEY.researcherResults,
          ) ?? [];
        const rec = full.crossStageState.get<{
          reconciliationReport?: string;
          factTable?: unknown[];
          overlaps?: unknown[];
          gaps?: unknown[];
        }>(CS_KEY.reconciliationReport);
        const res = await invokeAgent({
          runner: this.runner,
          specId: "playground.analyst",
          input: {
            topic: input.topic,
            language: input.language,
            researcherResults,
            reconciliationReport: {
              reconciliationReport: rec?.reconciliationReport ?? "",
              factTable: rec?.factTable ?? [],
              overlaps: rec?.overlaps ?? [],
              gaps: rec?.gaps ?? [],
            },
          },
          invocation: input.invocation,
          crossStageState: full.crossStageState,
          signal: full.ctx.signal,
          stepId: "s6-analyst",
          role: "analyst",
          operationType: "analyze",
        });
        full.crossStageState.set(CS_KEY.analystOutput, res.output);
        return res.output;
      },
    });
  }

  // ── S7 writer outline（draft primitive，outline 模式）──────────────────────────
  private buildOutlineHooks(): ResolvedStageHooks {
    return defineStageHooks({
      draftOnce: async (args: {
        ctx: StageRunArgs["ctx"];
      }): Promise<unknown> => {
        const full = this.fullArgs(args.ctx);
        const input = readPipelineInput(full.ctx);
        const plan = full.crossStageState.get<PlanResult>(CS_KEY.plan);
        const depth = input.invocation.depth ?? "standard";
        try {
          const res = await invokeAgent({
            runner: this.runner,
            specId: "playground.writer.outline-planner",
            input: {
              topic: input.topic,
              language: input.language,
              depth,
              audienceProfile: "domain-expert",
              styleProfile: "academic",
              lengthProfile: "standard",
              withFigures: input.invocation.withFigures ?? false,
              plan: {
                themeSummary: plan?.themeSummary ?? input.topic,
                dimensions: plan?.dimensions ?? [],
              },
            },
            invocation: input.invocation,
            crossStageState: full.crossStageState,
            signal: full.ctx.signal,
            stepId: "s7-writer-outline",
            role: "writer",
            operationType: "outline",
          });
          full.crossStageState.set(CS_KEY.outlinePlan, res.output);
          return res.output ?? null;
        } catch {
          // outline 可降级：缺失则 writer 从零规划（writer schema outlinePlan 可选）。
          full.crossStageState.set(CS_KEY.outlinePlan, null);
          return null;
        }
      },
    });
  }

  // ── S8 writer full draft（draft primitive，full 模式）──────────────────────────
  private buildWriterHooks(): ResolvedStageHooks {
    return defineStageHooks({
      draftOnce: async (args: {
        ctx: StageRunArgs["ctx"];
      }): Promise<unknown> => {
        const full = this.fullArgs(args.ctx);
        const input = readPipelineInput(full.ctx);
        const plan = full.crossStageState.get<PlanResult>(CS_KEY.plan);
        const analyst = (full.crossStageState.get<{
          insights?: unknown[];
          themeSummary?: string;
          contradictions?: unknown[];
        }>(CS_KEY.analystOutput) ?? {
          insights: [],
          themeSummary: plan?.themeSummary ?? input.topic,
        }) as {
          insights?: unknown[];
          themeSummary?: string;
          contradictions?: unknown[];
        };
        const outlinePlan = full.crossStageState.get(CS_KEY.outlinePlan);
        const res = await invokeAgent({
          runner: this.runner,
          specId: "playground.writer",
          input: {
            topic: input.topic,
            depth: input.invocation.depth ?? "standard",
            language: input.language,
            insights: analyst.insights ?? [],
            themeSummary:
              analyst.themeSummary ?? plan?.themeSummary ?? input.topic,
            ...(analyst.contradictions
              ? { contradictions: analyst.contradictions }
              : {}),
            ...(outlinePlan ? { outlinePlan } : {}),
          },
          invocation: input.invocation,
          crossStageState: full.crossStageState,
          signal: full.ctx.signal,
          stepId: "s8-writer",
          role: "writer",
          operationType: "write",
        });
        full.crossStageState.set(CS_KEY.report, res.output);
        // reportArtifact 与 report 在共享内核默认等价（artifact 富组装是 app 增强）。
        full.crossStageState.set(CS_KEY.reportArtifact, res.output);
        return res.output ?? null;
      },
    });
  }

  // ── S8b / S9 / S9b review（review primitive）──────────────────────────────────
  private buildReviewHooks(stepId: string): ResolvedStageHooks {
    return defineStageHooks({
      review: async (args: {
        ctx: StageRunArgs["ctx"];
      }): Promise<{ verdict: unknown; score?: number }> => {
        const full = this.fullArgs(args.ctx);
        const input = readPipelineInput(full.ctx);
        const report = full.crossStageState.get(CS_KEY.report);
        // s9-critic 用 critic agent；s8b/s9b 用 reviewer agent（评分主逻辑）。
        if (stepId === "s9-critic") {
          try {
            const res = await invokeAgent({
              runner: this.runner,
              specId: "playground.critic",
              input: this.buildCriticInput(report, input.topic, input.language),
              invocation: input.invocation,
              crossStageState: full.crossStageState,
              signal: full.ctx.signal,
              stepId,
              role: "critic",
              operationType: "critic",
            });
            return { verdict: res.output };
          } catch {
            return { verdict: null };
          }
        }
        const res = await invokeAgent({
          runner: this.runner,
          specId: "playground.reviewer",
          input: {
            topic: input.topic,
            language: input.language,
            draftReport: report,
          },
          invocation: input.invocation,
          crossStageState: full.crossStageState,
          signal: full.ctx.signal,
          stepId,
          role: "reviewer",
          operationType:
            stepId === "s9b-objective-eval"
              ? "objective-eval"
              : "quality-enhance",
        });
        const verdict = res.output;
        const score = this.extractScore(verdict);
        if (typeof score === "number") {
          full.crossStageState.set(CS_KEY.reviewScore, score);
        }
        // 合成 reviewVerdict（让 company 验收 gate 不退化，W6 同款逻辑）。
        const synth = this.synthReviewVerdict(verdict);
        if (synth) full.crossStageState.set(CS_KEY.reviewVerdict, synth);
        return { verdict, ...(typeof score === "number" ? { score } : {}) };
      },
    });
  }

  // ── S10 leader foreword + signoff（signoff primitive）──────────────────────────
  private buildSignoffHooks(): ResolvedStageHooks {
    return defineStageHooks({
      runRole: async (args: { ctx: StageRunArgs["ctx"] }): Promise<unknown> => {
        const full = this.fullArgs(args.ctx);
        const input = readPipelineInput(full.ctx);
        const report = full.crossStageState.get(CS_KEY.reportArtifact);
        const reviewScore = full.crossStageState.get<number>(
          CS_KEY.reviewScore,
        );
        try {
          const res = await invokeAgent({
            runner: this.runner,
            specId: "playground.leader",
            input: {
              phase: "signoff",
              topic: input.topic,
              language: input.language,
              reportArtifact: report,
              reviewScore,
            },
            invocation: input.invocation,
            crossStageState: full.crossStageState,
            signal: full.ctx.signal,
            stepId: "s10-leader-foreword-signoff",
            role: "leader",
            operationType: "signoff",
          });
          full.crossStageState.set(CS_KEY.leaderSignOff, res.output);
          return res.output;
        } catch {
          // signoff 可降级：缺 leader 签字不阻断终态产出。
          full.crossStageState.set(CS_KEY.leaderSignOff, null);
          return null;
        }
      },
    });
  }

  // ── S11 final persist（persist primitive，final 模式；无 LLM，落库经端口由 runner 做）
  private buildPersistHooks(): ResolvedStageHooks {
    return defineStageHooks({
      persist: async (): Promise<void> => {
        // 终态落库（applyTerminalIfRunning）+ checkpoint 清理由 runner 在
        // orchestrator.run 返回后经 ctx.persistence 做；本 step 仅作 pipeline 终点锚点。
      },
    });
  }

  // ── helpers ───────────────────────────────────────────────────────────────────

  /**
   * 部分 primitive 的 hook 签名只给 { ctx } 子集（如 plan.runRole / synthesize.synthesize），
   * 不透传 crossStageState。但 ctx.missionId 全程稳定——runner 在 run 前用
   * attachState(missionId, crossStageState) 把本次 run 的 crossStageState 绑到
   * missionId，hook 内 fullArgs(ctx) 据 ctx.missionId 取回（与 playground 据
   * missionId 取 SessionEntry.crossState 同款）。
   */
  private fullArgs(ctx: StageRunArgs["ctx"]): {
    ctx: StageRunArgs["ctx"];
    crossStageState: CrossStageState;
  } {
    const cs = STATE_BY_MISSION.get(ctx.missionId);
    if (!cs) {
      throw new Error(
        "[deep-insight bindings] crossStageState 未绑定到 missionId（attachState 未调用）",
      );
    }
    return { ctx, crossStageState: cs };
  }

  private normalizePlan(raw: unknown, topic: string): PlanResult {
    const p = raw as
      | {
          themeSummary?: unknown;
          dimensions?: Array<{
            id?: unknown;
            name?: unknown;
            rationale?: unknown;
          }>;
        }
      | undefined;
    const rawDims = Array.isArray(p?.dimensions) ? p.dimensions : [];
    const dimensions = rawDims
      .filter(
        (d): d is { id?: unknown; name: string; rationale?: unknown } =>
          !!d && typeof (d as { name?: unknown }).name === "string",
      )
      .slice(0, 6)
      .map((d, i) => ({
        id: typeof d.id === "string" ? d.id : `dim-${i + 1}`,
        name: String(d.name),
        rationale: typeof d.rationale === "string" ? d.rationale : "",
      }));
    if (dimensions.length === 0) {
      dimensions.push({ id: "dim-1", name: topic, rationale: "" });
    }
    return {
      themeSummary:
        typeof p?.themeSummary === "string" ? p.themeSummary : topic,
      dimensions,
    };
  }

  private buildCriticInput(
    report: unknown,
    topic: string,
    language: string,
  ): Record<string, unknown> {
    const r = report as
      | {
          title?: string;
          sections?: Array<{ heading?: string; title?: string }>;
          executiveSummary?: string;
        }
      | undefined;
    const sectionTitles = (r?.sections ?? []).map(
      (s) => s.heading ?? s.title ?? "",
    );
    return {
      topic,
      language,
      audienceProfile: "domain-expert",
      artifactSummary: {
        title: r?.title ?? topic,
        executiveSummary: r?.executiveSummary ?? "",
        sectionCount: sectionTitles.length,
        sectionTitles,
        citationCount: 0,
        factCount: 0,
        figureCount: 0,
        overallQuality: 70,
        qualityDimensions: {},
      },
    };
  }

  private extractScore(verdict: unknown): number | undefined {
    if (!verdict || typeof verdict !== "object") return undefined;
    const v = verdict as Record<string, unknown>;
    return typeof v.score === "number" ? v.score : undefined;
  }

  private synthReviewVerdict(
    verdict: unknown,
  ):
    | {
        score?: number;
        verdict?: "approve" | "revise" | "reject";
        notes?: string[];
      }
    | undefined {
    if (!verdict || typeof verdict !== "object") return undefined;
    const r = verdict as Record<string, unknown>;
    const score = typeof r.score === "number" ? r.score : undefined;
    const v =
      r.verdict === "approve" ||
      r.verdict === "revise" ||
      r.verdict === "reject"
        ? (r.verdict as "approve" | "revise" | "reject")
        : undefined;
    const notes = Array.isArray(r.notes)
      ? r.notes.filter((n): n is string => typeof n === "string")
      : undefined;
    if (score === undefined && v === undefined) return undefined;
    return {
      ...(score !== undefined ? { score } : {}),
      ...(v !== undefined ? { verdict: v } : {}),
      ...(notes?.length ? { notes } : {}),
    };
  }
}

/**
 * missionId → crossStageState 绑定表。
 *
 * 背景：部分 primitive 的 hook 签名只给 { ctx } 子集（如 plan.runRole /
 * synthesize.synthesize），不透传 crossStageState。但 orchestrator 内部对每个
 * mission 只构造一份 crossStageState 并全程透传；runner 在 orchestrator.run 前
 * 用同一份 crossStageState 调 attachState(missionId, cs)，hook 内据 ctx.missionId
 * 取回。
 *
 * 注意：本表 key 为 missionId（per-run 隔离），runner 在 run 的 finally 必须
 * detachState(missionId) 清理，避免 module-level 可变态泄漏 / 跨 run 污染
 * （对齐 Claude Code 反向洞察 #8：禁跨 thread 污染 module-level state）。
 */
const STATE_BY_MISSION = new Map<string, CrossStageState>();

/** runner 在 orchestrator.run 前调用：把本次 run 的 crossStageState 绑到 missionId。 */
export function attachState(
  missionId: string,
  crossStageState: CrossStageState,
): void {
  STATE_BY_MISSION.set(missionId, crossStageState);
}

/** runner 在 run 的 finally 调用：清理绑定，防 module-level state 泄漏。 */
export function detachState(missionId: string): void {
  STATE_BY_MISSION.delete(missionId);
}
