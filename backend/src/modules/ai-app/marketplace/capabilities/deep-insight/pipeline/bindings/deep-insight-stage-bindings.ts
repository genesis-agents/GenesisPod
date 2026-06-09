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
import type {
  ReportArtifactAssembler,
  SectionSelfEvalService,
  SectionRemediationService,
  ReportEvaluationService,
  QualityTraceComputeService,
  RemediationAction,
  FigureRelevanceService,
  ExtractedFigure,
} from "../../runner-deps";
import { CS_KEY, readPipelineInput, type StageBindings } from "../ports";
import { invokeAgent } from "./agent-invoke.helper";
import {
  buildAssembleInput,
  buildChapterInputs,
  buildCriticArtifactSummary,
  asArtifact,
  type PlanShape,
  type AnalystShape,
  type WriterReportShape,
  type ReportArtifactLite,
} from "./report-assembler.helper";

/**
 * 富评判 / 富组装服务束（全部 @Global HarnessModule 提供，runner 构造函数注入后透传）。
 * 设计依据：capability-execution-architecture.md §3「认知决策/编排下沉能力家；
 * 无状态打分/组装基元留 harness，能力家组合它」——本束即「组合」的注入点。
 */
export interface RichServices {
  readonly reportArtifactAssembler: ReportArtifactAssembler;
  readonly sectionSelfEval: SectionSelfEvalService;
  readonly sectionRemediation: SectionRemediationService;
  readonly reportEvaluation: ReportEvaluationService;
  readonly qualityTrace: QualityTraceComputeService;
  // ★ figure re-home（2026-06-09）：Stage-3 图文相关性精排（embedding），
  //   s8 组装前对 researcher 产出的 figureCandidates 按维度精排（与 playground s3 等价）。
  readonly figureRelevance: FigureRelevanceService;
}

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

/** researcher 产出的图候选（图文相关性精排入参的原始形状）。 */
interface FigureCandidate {
  sourceUrl: string;
  imageUrl?: string;
  caption: string;
  sourcePageOrSection?: string;
  relevanceHint?: "high" | "medium" | "low";
}

/** 带可选图候选的 researcher 产物视图（rankFigureCandidates 用）。 */
interface FigureRankableResearcher {
  dimension: string;
  figureCandidates?: FigureCandidate[];
  [key: string]: unknown;
}

export class DeepInsightStageBindings implements StageBindings {
  constructor(
    private readonly runner: AgentRunner,
    private readonly rich: RichServices,
  ) {}

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
        return this.buildQualityEnhanceHooks();
      case "s9-critic":
        return this.buildCriticHooks();
      case "s9b-objective-eval":
        return this.buildObjectiveEvalHooks();
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

  // ── S4 leader assess（assess primitive，真决策 + patch 失败跟踪）─────────────────
  //
  // 富增强（W2.5，对齐 playground s4-leader-assess）：
  //   1. runRole 跑 leader assess-research，产出 decision ∈ accept-all/patch/redirect/abort
  //      + perDimension（每维 accept/retry-with-critique/replace-spec/abort）。
  //   2. parseDecision 把 leader verdict 映射到 assess primitive 的 4 路决策：
  //      abort → abort-mission（primitive 原生抛 StageAbortError 终止 mission）；
  //      patch/redirect → retry-some（标记需补救）；accept-all → continue。
  //   3. dispatchAssessActions 把 patch/redirect 的弱维度记进 ctx.s4PatchFailures——
  //      s10 signoff 的 accountability hook 据此强制拒签（防"评估说要补救但没补就签字"）。
  //
  // 范围说明（已在返回里 flag 为后续波）：本波**不做**并行重派 researcher 的完整
  //   patch-retry 闭环（需 DAGExecutor 重跑 per-dim pipeline，属更大子系统）。本波交付
  //   "真决策 + abort 终止 + 失败跟踪供 s10 硬门"，这是 signoff 完整性的 parity-critical 部分。
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
        try {
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
          return res.output ?? { decision: "accept-all" };
        } catch {
          // assess 可降级：leader 评估失败不阻断（视为 accept-all，下游照常成稿）。
          return { decision: "accept-all" };
        }
      },
      // 把 leader verdict 映射到 assess primitive 的 4 路决策。
      parseDecision: (
        raw: unknown,
      ): "continue" | "retry-some" | "abort-mission" | "patch-then-retry" => {
        const decision = this.readLeaderAssessDecision(raw);
        switch (decision) {
          case "abort":
            return "abort-mission";
          case "patch":
          case "redirect":
            return "retry-some";
          case "accept-all":
          default:
            return "continue";
        }
      },
      // patch/redirect → 把弱维度记进 s4PatchFailures（s10 硬门依据）。
      dispatchAssessActions: (args: {
        decision:
          | "continue"
          | "retry-some"
          | "abort-mission"
          | "patch-then-retry";
        raw: unknown;
        ctx: StageRunArgs["ctx"];
        crossStageState: CrossStageState;
      }): void => {
        if (args.decision !== "retry-some") return;
        // 用 runner 绑定的 crossState（与 s10 读取同一实例）。
        const cs = this.fullArgs(args.ctx).crossStageState;
        const weak = this.extractWeakDimensions(args.raw);
        for (const dim of weak) {
          cs.append<{ dimension: string; reason: string }>(
            CS_KEY.s4PatchFailures,
            dim,
          );
        }
      },
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
        return res.output ?? null;
      },
      // 富组装（W2.5，对齐 playground s8 reportArtifact）：writer 原始 report →
      // ReportArtifactAssembler.assemble（sections 树 / citations 编号 + occurrences /
      // figures 五项硬规则 / quickView / factTable / 50+ 格式自动修复 / 10 维质量评分）。
      // assemble 是纯代码（无 LLM），失败时降级回 writer 原始 report 不阻断终态。
      reportArtifactAssembler: async (args: {
        artifact: unknown;
        ctx: StageRunArgs["ctx"];
        crossStageState: CrossStageState;
      }): Promise<unknown> => {
        // 用 runner 绑定的 crossState（fullArgs），与其它 hook + 终态组装同一实例。
        // primitive 透传的 args.crossStageState 是 orchestrator 自己那份（记账用），
        // 与 runner 绑定那份不同——业务产物必须写绑定那份才能被 s9b/s10/终态读到。
        const cs = this.fullArgs(args.ctx).crossStageState;
        const input = readPipelineInput(args.ctx);
        const plan = cs.get<PlanResult>(CS_KEY.plan);
        const researcherResults =
          cs.get<ResearcherResult[]>(CS_KEY.researcherResults) ?? [];
        const analyst = cs.get<AnalystShape>(CS_KEY.analystOutput);
        const startedAt = cs.get<number>(CS_KEY.startedAt) ?? Date.now();
        // ★ figure re-home（2026-06-09）：组装前对 figureCandidates 做 embedding 相关性
        //   精排（与 playground s3 的 filterRelevantFigures 等价）。fail-open：精排失败
        //   返回原 researcherResults，不阻断报告组装。
        const rankedResearcherResults = await this.rankFigureCandidates(
          researcherResults as unknown as FigureRankableResearcher[],
          plan,
          input.topic,
        );
        try {
          const assembleInput = buildAssembleInput({
            profile: {
              topic: input.topic,
              language: input.language,
              ...(input.invocation.depth
                ? { depth: input.invocation.depth }
                : {}),
            },
            plan: plan as PlanShape | undefined,
            researcherResults: rankedResearcherResults as never,
            analyst,
            writerReport: args.artifact as WriterReportShape | undefined,
            usage: {
              totalTokens: cs.get<number>(CS_KEY.tokensUsed) ?? 0,
              totalCostCents: cs.get<number>(CS_KEY.costCents) ?? 0,
              generationTimeMs: Math.max(0, Date.now() - startedAt),
            },
          });
          const artifact =
            this.rich.reportArtifactAssembler.assemble(assembleInput);
          cs.set(CS_KEY.reportArtifact, artifact);
          return artifact;
        } catch {
          // assemble 失败降级：reportArtifact = writer 原始 report（不退化终态产出）。
          cs.set(CS_KEY.reportArtifact, args.artifact);
          return args.artifact;
        }
      },
    });
  }

  // ── S8b section quality enhancement（review primitive，afterReview 富补救）──────
  //
  // 富增强（W2.5，对齐 playground s8b-section-quality-enhancement）：
  //   review 跑 reviewer agent 给主评分 + 合成 reviewVerdict（company gate 不退化）。
  //   afterReview 跑 SectionSelfEval（4 维写后自评）→ SectionRemediation（弱维度定向补救）
  //   逐 section 闭环 + QualityTrace.recordDimensionRemediationLoop 记前/后/delta，
  //   把补救后的 section 回写 reportArtifact（纯 LLM + 纯映射，失败降级不阻断）。
  private buildQualityEnhanceHooks(): ResolvedStageHooks {
    return defineStageHooks({
      review: async (args: {
        ctx: StageRunArgs["ctx"];
      }): Promise<{ verdict: unknown; score?: number }> =>
        this.runReviewerScore(args.ctx, "s8b-quality-enhancement"),
      afterReview: async (args: {
        ctx: StageRunArgs["ctx"];
        crossStageState: CrossStageState;
      }): Promise<void> => {
        // 用 runner 绑定的 crossState（与产物同一实例）。
        const cs = this.fullArgs(args.ctx).crossStageState;
        await this.runSectionRemediation(args.ctx, cs);
      },
    });
  }

  // ── S9 meta-critic（review primitive，独立 critic 复审 + 降权）────────────────────
  //
  // 富增强（W2.5，对齐 playground s9-reviewer-critic-l4）：critic agent 独立复审
  //   产出 verdict（pass/concerns/fail）；afterReview 据 verdict 对 reportArtifact.quality
  //   降权（fail → overall ×0.7；concerns → ×0.9），让 s10 leader 看到真实质量信号。
  private buildCriticHooks(): ResolvedStageHooks {
    return defineStageHooks({
      review: async (args: {
        ctx: StageRunArgs["ctx"];
      }): Promise<{ verdict: unknown }> => {
        const full = this.fullArgs(args.ctx);
        const input = readPipelineInput(full.ctx);
        const artifact = full.crossStageState.get(CS_KEY.reportArtifact);
        try {
          const res = await invokeAgent({
            runner: this.runner,
            specId: "playground.critic",
            input: {
              topic: input.topic,
              language: input.language,
              audienceProfile: "domain-expert",
              artifactSummary: buildCriticArtifactSummary(
                asArtifact(artifact),
                input.topic,
              ),
            },
            invocation: input.invocation,
            crossStageState: full.crossStageState,
            signal: full.ctx.signal,
            stepId: "s9-critic",
            role: "critic",
            operationType: "meta-critic",
          });
          return { verdict: res.output };
        } catch {
          return { verdict: null };
        }
      },
      afterReview: (args: {
        verdict: unknown;
        ctx: StageRunArgs["ctx"];
        crossStageState: CrossStageState;
      }): void => {
        // 用 runner 绑定的 crossState（与产物同一实例）。
        const cs = this.fullArgs(args.ctx).crossStageState;
        this.applyCriticDowngrade(args.verdict, cs);
      },
    });
  }

  // ── S9b objective evaluation（review primitive，10 维客观评分）────────────────────
  //
  // 富增强（W2.5，对齐 playground s9b-report-objective-evaluation）：
  //   review 跑 reviewer agent 主评分；objectiveEvalInjection 跑 ReportEvaluation 10 维
  //   结构化评审（按 section 拆 ChapterInput），结果落 reportArtifact.metadata.pipelineEvaluation
  //   + 记 finalScore（overallScore），供 s10 leader signoff 参考。
  private buildObjectiveEvalHooks(): ResolvedStageHooks {
    return defineStageHooks({
      review: async (args: {
        ctx: StageRunArgs["ctx"];
      }): Promise<{ verdict: unknown; score?: number }> =>
        this.runReviewerScore(args.ctx, "s9b-objective-eval"),
      objectiveEvalInjection: async (args: {
        verdict: unknown;
        ctx: StageRunArgs["ctx"];
      }): Promise<unknown> => {
        const full = this.fullArgs(args.ctx);
        const input = readPipelineInput(full.ctx);
        const artifact = asArtifact(
          full.crossStageState.get(CS_KEY.reportArtifact),
        );
        const chapters = buildChapterInputs(artifact);
        if (chapters.length === 0) return args.verdict;
        try {
          const evalResult = await this.rich.reportEvaluation.evaluateReport({
            reportTitle: artifact?.title ?? input.topic,
            topicType: input.topic,
            chapters,
            language: input.language,
          });
          full.crossStageState.set(CS_KEY.pipelineEvaluation, evalResult);
          // 把 10 维评估落进 reportArtifact.metadata.pipelineEvaluation（前端可见）。
          if (artifact) {
            const meta = artifact.metadata ?? {};
            meta.pipelineEvaluation = evalResult;
            artifact.metadata = meta;
            full.crossStageState.set(CS_KEY.reportArtifact, artifact);
          }
        } catch {
          // 客观评估失败降级：不阻断 mission（s10 仍可凭 reviewScore 签字）。
        }
        return args.verdict;
      },
    });
  }

  /** s8b / s9b 共用：跑 reviewer agent 拿主评分 + 合成 reviewVerdict（company gate 不退化）。 */
  private async runReviewerScore(
    ctx: StageRunArgs["ctx"],
    stepId: string,
  ): Promise<{ verdict: unknown; score?: number }> {
    const full = this.fullArgs(ctx);
    const input = readPipelineInput(full.ctx);
    const report =
      full.crossStageState.get(CS_KEY.reportArtifact) ??
      full.crossStageState.get(CS_KEY.report);
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
        stepId === "s9b-objective-eval" ? "objective-eval" : "quality-enhance",
    });
    const verdict = res.output;
    const score = this.extractScore(verdict);
    if (typeof score === "number") {
      full.crossStageState.set(CS_KEY.reviewScore, score);
    }
    const synth = this.synthReviewVerdict(verdict);
    if (synth) full.crossStageState.set(CS_KEY.reviewVerdict, synth);
    return { verdict, ...(typeof score === "number" ? { score } : {}) };
  }

  /**
   * s8b 富补救：逐 section 跑 SectionSelfEval（4 维）→ 弱维度 SectionRemediation 定向补救，
   * QualityTrace 记补救闭环，补救后 section 回写 reportArtifact.sections + content.fullMarkdown。
   * 任何单 section 失败降级跳过（fail-open，不阻断 mission）。
   */
  private async runSectionRemediation(
    ctx: StageRunArgs["ctx"],
    crossStageState: CrossStageState,
  ): Promise<void> {
    const input = readPipelineInput(ctx);
    const artifact = asArtifact(crossStageState.get(CS_KEY.reportArtifact));
    const sections = artifact?.sections;
    if (!artifact || !Array.isArray(sections) || sections.length === 0) return;

    const trace = this.rich.qualityTrace.createTrace(ctx.missionId);
    let mutated = false;

    for (const sec of sections as Array<{
      id?: string;
      title?: string;
      heading?: string;
      content?: string;
      body?: string;
    }>) {
      const content = sec.content ?? sec.body ?? "";
      const title = sec.title ?? sec.heading ?? "";
      if (content.length < 200) continue; // 太短不值得补救
      try {
        const evalResult = await this.rich.sectionSelfEval.evaluateSection({
          content,
          sectionTitle: title,
          topicName: input.topic,
          language: input.language,
        });
        if (evalResult.overallOk || evalResult.weakAreas.length === 0) continue;
        const actions: RemediationAction[] =
          this.rich.sectionSelfEval.determineRemediationActions(
            evalResult,
            7,
            input.language,
          );
        if (actions.length === 0) continue;
        const remediated = await this.rich.sectionRemediation.remediate({
          content,
          sectionTitle: title,
          actions,
          ...(input.invocation.preferredModelId
            ? { originalModelId: input.invocation.preferredModelId }
            : {}),
          language: input.language,
        });
        if (remediated.skipped || !remediated.content) continue;
        // 回写补救后内容（content / body 任一存在的字段都更新）。
        if (sec.content !== undefined) sec.content = remediated.content;
        if (sec.body !== undefined) sec.body = remediated.content;
        if (sec.content === undefined && sec.body === undefined) {
          sec.content = remediated.content;
        }
        mutated = true;
        // QualityTrace 记补救闭环（before/after delta）。
        const after = await this.rich.sectionSelfEval.evaluateSection({
          content: remediated.content,
          sectionTitle: title,
          topicName: input.topic,
          language: input.language,
        });
        this.rich.qualityTrace.recordDimensionRemediationLoop(
          trace,
          sec.id ?? title,
          {
            selfEvalScoresBefore: evalResult.scores,
            selfEvalScoresAfter: after.scores,
            weakAreasResolved: after.weakAreas.length === 0,
            ...(input.invocation.preferredModelId
              ? { remediationModel: input.invocation.preferredModelId }
              : {}),
          },
        );
      } catch {
        // 单 section 补救失败降级跳过（不阻断后续 section / mission）。
      }
    }

    if (mutated) {
      // section 内容变了 → 重建 content.fullMarkdown（前端连续阅读 / 复制 markdown 用）。
      this.rebuildArtifactMarkdown(artifact);
      crossStageState.set(CS_KEY.reportArtifact, artifact);
    }
  }

  // ── S10 leader foreword + signoff（signoff primitive，多层 verdict + 硬门）─────────
  //
  // 富增强（W2.5，对齐 playground s10-leader-foreword-and-signoff）：
  //   runRole 跑 leader signoff（综合 reportArtifact + reviewScore + 客观评估写前言/签字）。
  //   accountability hook 做最终问责裁决（在 LLM 签字之上叠加业务硬门）：
  //     1. s4 patch 失败（ctx.s4PatchFailures 非空）→ 强制 signed=false（防"说要补救没补就签"）。
  //     2. finalScore 经 QualityTrace 客观计算（从 10 维评估 + reviewScore 融合），落 CS_KEY.finalScore。
  //   forcedDegraded=true 时 signoff primitive 会让 stage 标记降级（前端可见）。
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
          return res.output;
        } catch {
          // signoff 可降级：缺 leader 签字不阻断终态产出。
          return null;
        }
      },
      accountability: (args: {
        raw: unknown;
        ctx: StageRunArgs["ctx"];
        crossStageState: CrossStageState;
      }): { forcedDegraded?: boolean; signoff: unknown } => {
        // 用 runner 绑定的 crossState（与 s4 写入、终态读取同一实例）。
        const cs = this.fullArgs(args.ctx).crossStageState;
        const patchFailures =
          cs.get<Array<{ dimension: string }>>(CS_KEY.s4PatchFailures) ?? [];
        const objectiveScore = this.objectiveFinalScore(cs);
        if (typeof objectiveScore === "number") {
          cs.set(CS_KEY.finalScore, objectiveScore);
        }
        let signoff = args.raw;
        let forcedDegraded = false;
        // s4 patch 失败 → 强制拒签（覆盖 LLM 的 signed）。
        if (
          patchFailures.length > 0 &&
          signoff &&
          typeof signoff === "object"
        ) {
          const s = { ...(signoff as Record<string, unknown>) };
          s.signed = false;
          s.refusalReason =
            (typeof s.refusalReason === "string" && s.refusalReason) ||
            `s4 评估标记 ${patchFailures.length} 个维度需补救但未完成闭环，按问责规则强制拒签`;
          signoff = s;
          forcedDegraded = true;
        }
        cs.set(CS_KEY.leaderSignOff, signoff ?? null);
        return { signoff: signoff ?? null, forcedDegraded };
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

  /** 从 leader assess-research 产出读 decision（accept-all/patch/redirect/abort）。 */
  private readLeaderAssessDecision(
    raw: unknown,
  ): "accept-all" | "patch" | "redirect" | "abort" {
    if (!raw || typeof raw !== "object") return "accept-all";
    const d = (raw as { decision?: unknown }).decision;
    if (
      d === "patch" ||
      d === "redirect" ||
      d === "abort" ||
      d === "accept-all"
    ) {
      return d;
    }
    return "accept-all";
  }

  /** 从 leader assess perDimension 抽出非 accept 的弱维度（s4PatchFailures 记账）。 */
  private extractWeakDimensions(
    raw: unknown,
  ): Array<{ dimension: string; reason: string }> {
    if (!raw || typeof raw !== "object") return [];
    const per = (raw as { perDimension?: unknown }).perDimension;
    if (!Array.isArray(per)) return [];
    const out: Array<{ dimension: string; reason: string }> = [];
    for (const item of per) {
      if (!item || typeof item !== "object") continue;
      const r = item as Record<string, unknown>;
      const action = typeof r.action === "string" ? r.action : "";
      if (action && action !== "accept") {
        out.push({
          dimension:
            typeof r.dimension === "string" ? r.dimension : "(unknown)",
          reason: action,
        });
      }
    }
    return out;
  }

  /**
   * s9 critic verdict → reportArtifact.quality.overall 降权（fail ×0.7 / concerns ×0.9）。
   * 让 s10 leader 看到经独立复审修正后的真实质量信号。
   */
  private applyCriticDowngrade(
    verdict: unknown,
    crossStageState: CrossStageState,
  ): void {
    if (!verdict || typeof verdict !== "object") return;
    const v = (verdict as { overallVerdict?: unknown }).overallVerdict;
    const factor = v === "fail" ? 0.7 : v === "concerns" ? 0.9 : 1;
    if (factor === 1) return;
    const artifact = asArtifact(crossStageState.get(CS_KEY.reportArtifact));
    if (!artifact?.quality || typeof artifact.quality.overall !== "number") {
      return;
    }
    artifact.quality.overall = Math.round(artifact.quality.overall * factor);
    crossStageState.set(CS_KEY.reportArtifact, artifact);
  }

  /**
   * s10 客观 finalScore：优先 10 维客观评估 overallScore；缺则回退 reviewScore；
   * 再缺则回退 reportArtifact.quality.overall。纯计算，无 LLM。
   */
  private objectiveFinalScore(
    crossStageState: CrossStageState,
  ): number | undefined {
    const evalResult = crossStageState.get<{ overallScore?: number }>(
      CS_KEY.pipelineEvaluation,
    );
    if (typeof evalResult?.overallScore === "number") {
      return Math.round(evalResult.overallScore);
    }
    const reviewScore = crossStageState.get<number>(CS_KEY.reviewScore);
    if (typeof reviewScore === "number") return Math.round(reviewScore);
    const artifact = asArtifact(crossStageState.get(CS_KEY.reportArtifact));
    if (typeof artifact?.quality?.overall === "number") {
      return Math.round(artifact.quality.overall);
    }
    return undefined;
  }

  /**
   * figure re-home（2026-06-09）：组装前对每维 figureCandidates 做 embedding 相关性精排。
   *
   * 等价 playground s3 的 `filterRelevantFigures(candidates, dim.name)`：
   *   - 按 dimension 分别精排（每维 caption 对标该维 name，缺则回退 topic）；
   *   - 候选缺 imageUrl 不可成图，精排前剔除（但保留在结果外，不污染相关性判断）；
   *   - FigureRelevance 入参是 ExtractedFigure（需 type）；researcher 候选是 web 抓取图，
   *     统一映射 type="photo"（触发 caption 语义判断，正是精排目标）；
   *   - fail-open：单维精排失败保留该维原候选；整体异常返回原 researcherResults，不阻断报告。
   */
  private async rankFigureCandidates(
    researcherResults: FigureRankableResearcher[],
    plan: PlanResult | undefined,
    topic: string,
  ): Promise<FigureRankableResearcher[]> {
    try {
      return await Promise.all(
        researcherResults.map(async (r) => {
          const candidates = r.figureCandidates;
          if (!candidates || candidates.length === 0) return r;
          // 维度名：candidate 无 dimension 锚点，用 researcher.dimension 对标该维；缺则回退 topic。
          const dimName =
            plan?.dimensions.find((d) => d.name === r.dimension)?.name ??
            r.dimension ??
            topic;
          // 仅可成图（有 imageUrl）的候选进精排；映射成 ExtractedFigure（type=photo 触发语义判断）。
          const rankable = candidates.filter(
            (c): c is FigureCandidate & { imageUrl: string } =>
              typeof c.imageUrl === "string" && c.imageUrl.length > 0,
          );
          if (rankable.length === 0) return r;
          const figures: ExtractedFigure[] = rankable.map((c) => ({
            imageUrl: c.imageUrl,
            caption: c.caption ?? "",
            type: "photo",
          }));
          try {
            const relevant =
              await this.rich.figureRelevance.filterRelevantFigures(
                figures,
                dimName,
              );
            const keptUrls = new Set(
              relevant.map((f: ExtractedFigure) => f.imageUrl),
            );
            // 精排只保留通过的候选（顺序保持），其余（含无 imageUrl 的）一律剔除——
            // 无 imageUrl 的候选本就不可渲染成图，不应入图库。
            const kept = candidates.filter(
              (c) => typeof c.imageUrl === "string" && keptUrls.has(c.imageUrl),
            );
            return { ...r, figureCandidates: kept };
          } catch {
            // 单维精排失败 fail-open：保留该维原候选。
            return r;
          }
        }),
      );
    } catch {
      // 整体异常 fail-open：返回原 researcherResults，不阻断报告组装。
      return researcherResults;
    }
  }

  /** s8b 补救后 section 内容变了 → 重建 content.fullMarkdown（标题 ## + body 拼接）。 */
  private rebuildArtifactMarkdown(artifact: ReportArtifactLite): void {
    const parts: string[] = [];
    if (artifact.title) parts.push(`# ${artifact.title}`);
    for (const s of artifact.sections ?? []) {
      const heading = s.title ?? s.heading;
      if (heading) parts.push(`## ${heading}`);
      const body = s.content ?? s.body;
      if (body) parts.push(body);
    }
    const fullMarkdown = parts.join("\n\n");
    artifact.content = {
      fullMarkdown,
      fullReportSize: Buffer.byteLength(fullMarkdown, "utf8"),
    };
  }

  private extractScore(verdict: unknown): number | undefined {
    if (!verdict || typeof verdict !== "object") return undefined;
    const v = verdict as Record<string, unknown>;
    return typeof v.score === "number" ? v.score : undefined;
  }

  private synthReviewVerdict(verdict: unknown):
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
