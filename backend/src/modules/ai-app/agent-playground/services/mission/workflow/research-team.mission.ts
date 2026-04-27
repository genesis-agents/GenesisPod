/**
 * ResearchTeamMission
 *
 * 串完整 5-stage 流程，所有调用都走真实系统：
 *   - LLM: AiChatService → ModelElectionService → 真 provider
 *   - Tool: ToolRegistry → 真 web-search / arxiv-search / github-search / web-scraper
 *   - Credit: BillingContext + CreditsService 真扣费
 *   - Vector memory: PrismaVectorStore + MemoryAutoIndexer
 *   - Verify: JudgeService 真 LLM 评分
 *   - Event: DomainEventBus → SocketBroadcastAdapter → 前端
 *
 * 流程：
 *   1. Leader  → ReAct  → 拆维度
 *   2. Researcher×N → spawnMany('majority') → 并行 ReAct + 真搜索
 *   3. Analyst → Reflexion → 整合（self+critical verifier 自动 critique→revise）
 *   4. Writer  → ReAct + outputSchema 自愈
 *   5. Reviewer → JudgeService.judgeWithConsensus → < 80 分 retry Writer
 *   6. MemoryAutoIndexer → trajectory 入向量库
 *
 * 事件粒度：
 *   - mission:started / mission:completed / mission:rejected
 *   - stage:started / stage:completed
 *   - agent:lifecycle (start/end per agent invocation)
 *   - agent:thought / agent:action / agent:observation （relayed from RunResult.events）
 *   - cost:tick （每个 stage 完成后累计）
 *   - verifier:verdict （三个 judge 各一条）
 *   - report:draft （writer 每次产出）
 *   - memory:indexed
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  AgentRunner,
  DomainEventBus,
  JudgeService,
  MemoryAutoIndexer,
  MissionBudgetPool,
  type DomainEvent,
  type HarnessIAgent as IAgent,
  type HarnessIAgentEvent as IAgentEvent,
  type IContextEnvelope,
} from "../../../../../ai-engine/facade";
import { BillingContext } from "../../../../../ai-infra/credits/billing-context";
import { CreditsService } from "../../../../../ai-infra/credits/credits.service";
import { RuntimeEnvironmentService } from "../../../../../ai-engine/runtime/resource/runtime-environment.service";
import { LeaderAgent } from "../../../agents/leader/leader.agent";
import {
  LeaderService,
  SupervisedMission,
  ReconcilerService,
  AnalystService,
  WriterService,
  ReviewerService,
  VerifierService,
  StewardService,
  AgentInvoker,
} from "../../roles";
import { ResearcherAgent } from "../../../agents/researcher/researcher.agent";
import { ReportAssemblerService } from "../../artifact/report-assembler.service";
import { MissionStateService } from "../lifecycle/mission-state.service";
import { MissionAbortRegistry } from "../lifecycle/mission-abort.registry";
import { ChapterWriterAgent } from "../../../agents/writer/chapter-writer.agent";
import { ChapterReviewerAgent } from "../../../agents/writer/chapter-reviewer.agent";
import { DimensionIntegratorAgent } from "../../../agents/writer/dimension-integrator.agent";
import { SingleShotWriterAgent } from "../../../agents/writer/single-shot-writer.agent";
// MissionReviewerAgent: 当前 mission 评审走 VerifierService（多 judge 投票），
// MissionReviewerAgent class 已声明但 orchestrator 暂未直接调用，保留为后续替换 path。
import {
  type ResearchReport,
  resolveBudgetMultiplier,
  resolveMissionCredits,
  type RunMissionInput,
} from "../../../dto/run-mission.dto";
import { BillingRuntimeEnvAdapter } from "../../../adapters/billing-runtime-env.adapter";
import { MissionStore } from "../lifecycle/mission-store.service";
import { HarnessFailureLearner } from "../../failure-learning/harness-failure-learner.service";
import {
  extractAgentFailureDiagnostic,
  extractFailureMessage,
} from "./helpers/failure-extraction.util";
import {
  estimateUsdFromTokens,
  extractTokenSpend,
} from "./helpers/token-spend.util";
import type { MissionContext } from "./mission-context";
import type { MissionDeps } from "./mission-deps";
import { runBudgetEstimateStage } from "./stages/00-budget-estimate.stage";
import { runLeaderPlanStage } from "./stages/10-leader-plan.stage";
import { runLeaderAssessM1Stage } from "./stages/30-leader-assess-m1.stage";
import { runReconcilerStage } from "./stages/40-reconciler.stage";
import { runAnalystStage } from "./stages/50-analyst.stage";
import { runWriterOutlineStage } from "./stages/55-writer-outline.stage";
import { runCriticStage } from "./stages/70-critic.stage";
import { runLeaderHandoffStage } from "./stages/80-leader-handoff.stage";
import { runPersistStage } from "./stages/99-persist.stage";

interface MissionResult {
  readonly missionId: string;
  readonly report: ResearchReport;
  readonly reviewScore: number;
  readonly costUsd: number;
  readonly trajectoryStored: number;
  readonly themeSummary?: string;
  readonly dimensions?: { id: string; name: string; rationale: string }[];
  readonly verdicts?: {
    verifierId: string;
    score: number;
    critique?: string;
    attempt?: number;
  }[];
  // ★ Phase P0-5: ReportArtifact v2（结构化输出，三视图共享）
  readonly reportArtifact?: import("../../../dto/report-artifact.dto").ReportArtifact;
  // ★ Phase P0-4: Reconciler [3.5] 产物
  readonly reconciliationReport?: unknown;
  // ★ Phase P0-8: 用户档位 merged 后快照
  readonly userProfile?: unknown;
  // ★ Phase Lead-3: M7 sign-off 产物
  readonly leaderSignOff?: {
    leaderOverallScore: number;
    leaderVerdict: "excellent" | "good" | "acceptable" | "failed";
    accountabilityNote: string;
    signed: boolean;
    refusalReason?: string;
  };
}

interface RelayCtx {
  missionId: string;
  userId: string;
  /** demo agentId — 稳定且对人友好（如 "researcher#0"），不是 runtime UUID */
  agentId: string;
  role: string;
  /** 每 mission 独享的 RuntimeEnvironment 适配器（含 BYOK / 余额 / 模型池） */
  envAdapter?: BillingRuntimeEnvAdapter;
  /** budgetProfile 转出的倍率，scale 每个 agent 的 maxTokens / maxIterations */
  budgetMultiplier?: number;
  /**
   * ★ Tool Recall hint（mission-pipeline-baseline.md §3.4 [3.b]）—— 上层（如 Leader
   * 阶段产出的 dim.toolHint）透传到 AgentRunner，AgentRunner 在 spec.toolCategories
   * 召回的池子里再做 hint 收窄 + preferIds 标注。
   */
  toolRecallHint?: {
    categories?: readonly string[];
    excludeIds?: readonly string[];
    preferIds?: readonly string[];
  };
  /** ★ Phase P1-3: loop 覆盖（thorough/paranoid 档位切 reflexion） */
  loopOverride?: "react" | "reflexion";
}

@Injectable()
export class ResearchTeamMission {
  private readonly log = new Logger(ResearchTeamMission.name);

  constructor(
    private readonly runner: AgentRunner,
    private readonly judge: JudgeService,
    private readonly indexer: MemoryAutoIndexer,
    private readonly eventBus: DomainEventBus,
    private readonly credits: CreditsService,
    private readonly runtimeEnv: RuntimeEnvironmentService,
    private readonly store: MissionStore,
    private readonly failureLearner: HarnessFailureLearner,
    private readonly reportAssembler: ReportAssemblerService,
    private readonly missionState: MissionStateService,
    private readonly abortRegistry: MissionAbortRegistry,
    private readonly leaderService: LeaderService,
    // ★ Phase Lead-Services: per-role services
    private readonly reconcilerService: ReconcilerService,
    private readonly analystService: AnalystService,
    // writer/verifier/steward 服务已注册但 orchestrator 调用点切换留 PR-S6b/S5
    // 暂用 // @ts-expect-error 抑制 unused 警告？不 —— eslint/tsc 用 readonly 不构成 unused，
    // 留用于后续小步迁移。下划线前缀显式表达"已知不使用"。
    private readonly writerService: WriterService,
    private readonly reviewerService: ReviewerService,
    private readonly verifierService: VerifierService,
    private readonly stewardService: StewardService,
    private readonly invoker: AgentInvoker,
  ) {}

  /**
   * 给 LeaderService 用的 runFn —— 复用 orchestrator 的 runner +
   * 让 leader 调用同样走 BillingContext / event relay。
   */
  private buildLeaderInvocation(
    missionId: string,
    userId: string,
    billing: unknown,
  ): import("../../roles/leader.service").LeaderRunFn {
    const fn = async <TIn, TOut>({
      spec,
      input,
      agentId,
    }: {
      spec: typeof LeaderAgent;
      input: TIn;
      agentId: string;
    }): Promise<{
      state: "completed" | "failed" | "cancelled";
      output?: TOut;
      events?: readonly unknown[];
    }> => {
      const result = await this.runAndRelay(
        spec as unknown as typeof LeaderAgent,
        input as unknown as Record<string, unknown>,
        {
          missionId,
          userId,
          agentId,
          role: "leader",
          envAdapter: billing as never,
        },
      );
      return {
        state:
          result.state === "completed"
            ? "completed"
            : result.state === "cancelled"
              ? "cancelled"
              : "failed",
        output: result.output as TOut | undefined,
        events: result.events,
      };
    };
    return fn;
  }

  async runMission(
    missionId: string,
    input: RunMissionInput,
    userId: string,
    workspaceId?: string,
  ): Promise<MissionResult> {
    // ★ Phase P12-1 / P14-1: 注册 abort controller + mission 级 wall-time
    const missionAbort = this.abortRegistry.register(missionId);
    const MISSION_WALL_TIME_MS = 1_800_000; // 30 分钟（baseline §10 D9）
    const wallTimer = setTimeout(() => {
      this.log.warn(
        `[${missionId}] mission wall-time exceeded (${MISSION_WALL_TIME_MS}ms) — auto abort`,
      );
      void this.emit({
        type: "agent-playground.mission:budget-warning-hard",
        missionId,
        userId,
        payload: {
          reason: "wall_time_exceeded",
          wallTimeMs: MISSION_WALL_TIME_MS,
        },
      }).catch(() => {});
      missionAbort.abort("mission_wall_time_exceeded");
    }, MISSION_WALL_TIME_MS);
    const billing = new BillingRuntimeEnvAdapter(
      userId,
      workspaceId,
      this.credits,
      this.runtimeEnv,
    );

    const effectiveMaxCredits = resolveMissionCredits(input);
    // 1 credit ≈ 1k tokens；max 10k credits = 10M tokens 上限保护，足够任何
    // 实际研究任务。配合 budgetProfile=unlimited 时基本不触发上限。
    const pool = new MissionBudgetPool({
      maxTokens: effectiveMaxCredits * 1000,
      maxCostUsd: effectiveMaxCredits * 0.002,
    });

    // 预检 1：模型可用性 —— 用户 BYOK 默认模型必须真实可用。
    // 否则 mission 会跑到第一次 LLM 调用才空响应，浪费 1-2 分钟才报错。
    try {
      const allModels = await billing.listAvailableModels();
      const healthy = allModels.filter((m) => m.available);
      if (allModels.length > 0 && healthy.length === 0) {
        const ids = allModels.map((m) => m.modelId).join(", ");
        const msg = `用户 BYOK 配置的所有模型均不可用：${ids}。请前往 设置 → 模型 检查 model id 是否真实存在 / API key 是否有效`;
        await this.emit({
          type: "agent-playground.mission:rejected",
          missionId,
          userId,
          payload: {
            reason: "no_healthy_model",
            availableCount: 0,
            totalCount: allModels.length,
            userMessage: msg,
          },
        });
        throw new Error(msg);
      }
    } catch (err) {
      // 仅 reject-throw 抛出；env 查询失败不阻断（partial info ok）
      if (err instanceof Error && err.message.includes("BYOK 配置")) throw err;
    }

    const credit = await billing.getCreditState();
    if (credit.balance <= (credit.hardLimit ?? 0)) {
      const hint = await billing.suggestFallback({ reason: "no_credit" });
      await this.emit({
        type: "agent-playground.mission:rejected",
        missionId,
        userId,
        payload: {
          reason: "no_credit",
          balance: credit.balance,
          userMessage: hint.userMessage,
        },
      });
      throw new Error(hint.userMessage ?? "Credit balance too low");
    }

    // 先持久化 mission record (status=running)
    // 同时把 userProfile 快照写进去，cancelled/failed 时也能看到配置
    await this.store.create({
      id: missionId,
      userId,
      workspaceId,
      topic: input.topic,
      depth: input.depth,
      language: input.language,
      maxCredits: effectiveMaxCredits,
      userProfile: {
        depth: input.depth,
        language: input.language,
        budgetProfile: input.budgetProfile,
        styleProfile: input.styleProfile,
        lengthProfile: input.lengthProfile,
        audienceProfile: input.audienceProfile,
        withFigures: input.withFigures,
        auditLayers: input.auditLayers,
        concurrency: input.concurrency,
        viewMode: input.viewMode,
      } as Record<string, unknown>,
    });

    return BillingContext.run(
      {
        userId,
        moduleType: "agent-playground",
        operationType: "research-team",
        referenceId: missionId,
      },
      async () => {
        const t0 = Date.now();
        try {
          const result = await this.runMissionBody(
            missionId,
            input,
            userId,
            workspaceId,
            pool,
            t0,
            billing,
            // depth × budgetProfile 组合倍率：让两个 lever 协同 scale agent budget
            resolveBudgetMultiplier(input),
          );
          // ── Stage 99: 持久化（已抽到 stages/99-persist.stage.ts）──
          await runPersistStage(
            { missionId, t0, result, pool },
            this.buildStageDeps(),
          );
          clearTimeout(wallTimer);
          this.abortRegistry.unregister(missionId);
          return result;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const errName = err instanceof Error ? err.name : "Unknown";
          const snap = pool.snapshot();
          // ★ mission 级失败码归类
          let missionFailureCode: string = "UNKNOWN";
          if (
            errName === "InsufficientCreditsException" ||
            /credit|余额不足|insufficient/i.test(message)
          ) {
            missionFailureCode = "ORCH_CREDIT_INSUFFICIENT";
          } else if (errName === "ByokRequiredError") {
            missionFailureCode = "PROVIDER_BYOK_MODEL_NOT_FOUND";
          } else if (
            errName === "InputValidationError" ||
            errName === "DefineAgentMissingError"
          ) {
            missionFailureCode = "RUNNER_INPUT_SCHEMA_MISMATCH";
          } else if (/timeout|timed out/i.test(message)) {
            missionFailureCode = "RUNNER_WALL_TIME_EXCEEDED";
          } else if (/rate.?limit|429/i.test(message)) {
            missionFailureCode = "PROVIDER_RATE_LIMIT";
          } else if (!/aborted|cancelled/i.test(message)) {
            missionFailureCode = "PROVIDER_API_ERROR";
          }
          // 任何 uncaught 错误都要让 UI 知道 —— 否则 status 永远停在 "running"
          await this.emit({
            type: "agent-playground.mission:failed",
            missionId,
            userId,
            payload: {
              message,
              failureCode: missionFailureCode,
              errorName: errName,
              wallTimeMs: Date.now() - t0,
              tokensUsed: snap.poolTokensUsed,
              costUsd: snap.poolCostUsd,
              diagnostic: {
                errorStack: err instanceof Error ? err.stack : undefined,
              },
            },
          }).catch(() => {});
          await this.store.markFailed(missionId, {
            errorMessage: message,
            tokensUsed: snap.poolTokensUsed,
            costUsd: snap.poolCostUsd,
            wallTimeMs: Date.now() - t0,
          });
          clearTimeout(wallTimer);
          this.abortRegistry.unregister(missionId);
          throw err;
        }
      },
    );
  }

  private async runMissionBody(
    missionId: string,
    input: RunMissionInput,
    userId: string,
    workspaceId: string | undefined,
    pool: MissionBudgetPool,
    t0: number,
    billing: BillingRuntimeEnvAdapter,
    budgetMultiplier: number,
  ): Promise<MissionResult> {
    {
      {
        // ── Stage 0: 预算预估 + mission:started（已抽到 stages/00-budget-estimate.stage.ts）──
        const startCtx = this.buildStageCtx({
          missionId,
          userId,
          input,
          t0,
          billing,
          pool,
          leader: undefined as never, // leader 在下一个 stage 才创建，budget 不需要它
          budgetMultiplier,
        });
        await runBudgetEstimateStage(
          startCtx,
          this.buildStageDeps(),
          workspaceId,
        );

        // ── Stage 1: Leader 拆维度（M0 plan via LeaderService）──
        // ★ Phase Lead-Final: Lead 全程在场 —— 创建 SupervisedMission，整 mission 复用
        const leader: SupervisedMission = this.leaderService.create(
          missionId,
          userId,
          {
            topic: input.topic,
            depth: input.depth,
            language: input.language,
            userProfile: input,
          },
          this.buildLeaderInvocation(missionId, userId, billing),
        );

        // M0 stage: 已抽到 stages/10-leader-plan.stage.ts
        const m0Ctx = this.buildStageCtx({
          missionId,
          userId,
          input,
          t0,
          billing,
          pool,
          leader,
          budgetMultiplier,
        });
        await runLeaderPlanStage(m0Ctx, this.buildStageDeps());
        const plan = m0Ctx.plan!;

        // ── Stage 2: Researcher×N 并行 ──
        await this.emit({
          type: "agent-playground.stage:started",
          missionId,
          userId,
          payload: {
            stage: "researchers",
            count: plan.dimensions.length,
            dimensions: plan.dimensions.map((d) => d.name),
          },
        });
        // ★ Phase P1-17: 检测 dependsOn → 走 DAG 调度；否则全并行
        const hasDependencies = plan.dimensions.some(
          (d) => (d as { dependsOn?: string[] }).dependsOn?.length,
        );
        if (hasDependencies) {
          await this.emit({
            type: "agent-playground.stage:started",
            missionId,
            userId,
            payload: {
              stage: "researchers-dag",
              dependencyMap: plan.dimensions.reduce(
                (acc, d) => {
                  const deps = (d as { dependsOn?: string[] }).dependsOn ?? [];
                  if (deps.length > 0) acc[d.id] = deps;
                  return acc;
                },
                {} as Record<string, string[]>,
              ),
            },
          });
        }
        const researcherDispatch = hasDependencies
          ? this.runDagConcurrency.bind(this)
          : this.runWithConcurrency.bind(this);
        const researcherResults = await researcherDispatch(
          plan.dimensions,
          input.concurrency,
          async (dim, idx) => {
            const agentId = `researcher#${idx}`;
            // 单个 researcher 失败不能拖垮整个 mission：
            // 任何抛错都收敛成 "(failed: ...)" 占位，让 Analyst 拿剩下的维度继续
            try {
              // ★ 主动接入跨 mission 失败模式记忆 ──
              // 启动 researcher 之前先查"这个 (researcher, topic+dim+language)
              // prompt 上历史哪些 model 撞过墙"，把它们喂给 adapter，
              // react-loop 的 model-availability fallback 链自动绕开。
              const promptKey = `${input.topic}::${dim.name}::${input.language}`;
              const knownFailures = await this.failureLearner
                .lookup({
                  agentSpecId: "playground.researcher",
                  systemPrompt: promptKey,
                })
                .catch(() => []);
              const preDisabled: { failed: string; fallback: string }[] = [];
              for (const rec of knownFailures) {
                // 触发条件：count >= 2（一次性失败可能是偶发，2+ 才确认是稳定问题）
                // 且有 lastFallbackModel（确认有可行的备选）
                if (rec.count >= 2 && rec.lastFallbackModel) {
                  billing.markModelDisabled(rec.modelId, rec.lastFallbackModel);
                  preDisabled.push({
                    failed: rec.modelId,
                    fallback: rec.lastFallbackModel,
                  });
                }
              }
              if (preDisabled.length > 0) {
                this.log.log(
                  `[researcher#${idx}] pre-disabled ${preDisabled.length} known-failing model(s) on dim "${dim.name}": ${preDisabled.map((d) => `${d.failed}→${d.fallback}`).join(", ")}`,
                );
                await this.emit({
                  type: "agent-playground.failure-pattern:pre-applied",
                  missionId,
                  userId,
                  agentId,
                  payload: {
                    dimension: dim.name,
                    preDisabled,
                    matchedRecords: knownFailures.length,
                  },
                }).catch(() => {});
              }

              await this.lifecycle(
                missionId,
                userId,
                agentId,
                "researcher",
                "started",
                { dimension: dim.name },
              );
              const runResearcher = async (
                attempt: number,
                bumpedMult: number,
                topicSuffix = "",
              ) =>
                this.runAndRelay(
                  ResearcherAgent,
                  {
                    topic: input.topic + topicSuffix,
                    dimension: dim.name,
                    language: input.language,
                  },
                  {
                    missionId,
                    userId,
                    agentId:
                      attempt > 0 ? `${agentId}.retry${attempt}` : agentId,
                    role: "researcher",
                    envAdapter: billing,
                    budgetMultiplier: bumpedMult,
                    // ★ Leader 给的 dim.toolHint → Researcher 的 toolRecallHint
                    // AgentRunner 五步召回会把它收窄到 spec.toolCategories 内的子集
                    toolRecallHint: dim.toolHint
                      ? {
                          categories: dim.toolHint.categories,
                          preferIds: dim.toolHint.preferIds,
                        }
                      : undefined,
                  },
                );
              let r = await runResearcher(0, budgetMultiplier);

              // ★ Self-heal: 第 1 次跑挂了 → 加 50% 预算 + 在 topic 加补救提示，重跑一次。
              //    只对"可恢复"失败重试：schema 不达标 / wall-time / 空响应 / parse 失败。
              //    rate-limit / quota / abort 不重试（重试也只是再次失败）。
              const RECOVERABLE = new Set([
                "RUNNER_OUTPUT_SCHEMA_MISMATCH",
                "RUNNER_WALL_TIME_EXCEEDED",
                "RUNNER_LOOP_LIMIT",
                "LOOP_EMPTY_RESPONSE_IMMEDIATE",
                "LOOP_REASONING_COT_EXHAUSTION",
                "PARSE_MALFORMED_JSON",
                "PARSE_MISSING_ACTION",
                "PARSE_UNKNOWN_ACTION_KIND",
                "PARSE_EMPTY_ACTIONS_ARRAY",
              ]);
              if (r.state !== "completed" || !r.output) {
                const innerFail0 = extractAgentFailureDiagnostic(r.events);
                const code0 = innerFail0?.failureCode;
                if (code0 && RECOVERABLE.has(code0)) {
                  this.log.warn(
                    `[researcher#${idx}] dim "${dim.name}" first attempt failed (${code0}); retrying with +50% budget`,
                  );
                  await this.emit({
                    type: "agent-playground.dimension:retrying",
                    missionId,
                    userId,
                    agentId,
                    payload: {
                      dimension: dim.name,
                      reason: code0,
                      bumpedBudgetMultiplier: budgetMultiplier * 1.5,
                    },
                  }).catch(() => {});
                  r = await runResearcher(
                    1,
                    budgetMultiplier * 1.5,
                    `（重试：上一轮以 ${code0} 失败，请先返回符合 schema 的 finalize；4-5 条 finding，每条带 source URL）`,
                  );
                }
              }

              // ★ 成功且确实用了 fallback model → 回写 recordSuccessfulFallback
              // 让下次同 key 命中时跳过失败 model，直接走 fallback。
              if (
                r.state === "completed" &&
                r.output &&
                preDisabled.length > 0
              ) {
                // 从事件流里抓真实跑通的 modelId（最后一个 thinking event 的 modelId）
                let actualModelId: string | undefined;
                for (let i = r.events.length - 1; i >= 0; i--) {
                  const ev = r.events[i];
                  if (ev.type === "thinking") {
                    const p = ev.payload as { modelId?: string } | null;
                    if (p?.modelId) {
                      actualModelId = p.modelId;
                      break;
                    }
                  }
                }
                if (actualModelId) {
                  for (const pd of preDisabled) {
                    // actualModelId 已经是 fallback（不是 failed） → 标记成功
                    if (actualModelId === pd.fallback) {
                      // 记录成功 workaround：(spec, failedModel, prompt, *) 都标 resolved
                      // 不局限于具体 failureCode（这条记录如果有多个 code，全部更新）
                      for (const rec of knownFailures.filter(
                        (r0) => r0.modelId === pd.failed,
                      )) {
                        await this.failureLearner
                          .recordSuccessfulFallback({
                            key: {
                              agentSpecId: "playground.researcher",
                              modelId: pd.failed,
                              systemPrompt: promptKey,
                              failureCode: rec.failureCode,
                            },
                            fallbackModelId: pd.fallback,
                          })
                          .catch(() => {});
                      }
                    }
                  }
                }
              }
              await this.tickCostDelta(
                missionId,
                userId,
                "researchers",
                pool,
                extractTokenSpend(r.events),
              );
              await this.lifecycle(
                missionId,
                userId,
                agentId,
                "researcher",
                r.state === "completed" ? "completed" : "failed",
                {
                  wallTimeMs: r.wallTimeMs,
                  iterations: r.iterations,
                  dimension: dim.name,
                  error: extractFailureMessage(r.events, r.state, !!r.output, {
                    iterations: r.iterations,
                    wallTimeMs: r.wallTimeMs,
                  }),
                },
              );
              await this.emit({
                type: "agent-playground.researcher:completed",
                missionId,
                userId,
                agentId,
                payload: {
                  dimension: dim.name,
                  state: r.state,
                  iterations: r.iterations,
                  wallTimeMs: r.wallTimeMs,
                  summary:
                    r.state === "completed" && r.output
                      ? (r.output as { summary?: string }).summary
                      : undefined,
                  findingsCount:
                    r.state === "completed" && r.output
                      ? ((r.output as { findings?: unknown[] }).findings ?? [])
                          .length
                      : 0,
                },
              });
              if (r.state !== "completed" || !r.output) {
                // ★ orchestrator 级降级：emit ORCH_DIMENSION_DEGRADED 事件
                // 把内层 agent 的 failureCode/diagnostic 一并冒泡到 mission_events
                const innerFailure = extractAgentFailureDiagnostic(r.events);
                await this.emit({
                  type: "agent-playground.dimension:degraded",
                  missionId,
                  userId,
                  agentId,
                  payload: {
                    dimension: dim.name,
                    state: r.state,
                    failureCode: "ORCH_DIMENSION_DEGRADED",
                    innerFailureCode: innerFailure?.failureCode,
                    innerMessage: innerFailure?.message,
                    diagnostic: {
                      ...(innerFailure?.diagnostic ?? {}),
                      stage: "researcher",
                      iterations: r.iterations,
                      wallTimeMs: r.wallTimeMs,
                    },
                    recoveryHint: innerFailure?.recoveryHint,
                  },
                }).catch(() => {});
                // ★ 跨 mission 失败模式记忆：把这次失败模式入库，下次同 (agent,
                // model, prompt 前缀, code) 命中时直接走 fallback。
                if (innerFailure?.failureCode) {
                  const innerModelId = (innerFailure.diagnostic?.modelId ??
                    "unknown") as string;
                  // systemPrompt 用 dimension 名字 + topic 拼起来当稳定 hash 输入
                  // （ResearcherAgent.buildSystemPrompt 也只依赖这两个字段）
                  await this.failureLearner
                    .recordFailure({
                      key: {
                        agentSpecId: "playground.researcher",
                        modelId: innerModelId,
                        systemPrompt: `${input.topic}::${dim.name}::${input.language}`,
                        failureCode: innerFailure.failureCode,
                      },
                      missionId,
                      userId,
                      diagnostic: innerFailure.diagnostic,
                    })
                    .catch(() => {});
                }
                return {
                  dimension: dim.name,
                  findings: [],
                  summary: `(failed: ${r.state}${innerFailure?.failureCode ? `, code=${innerFailure.failureCode}` : ""})`,
                };
              }
              const researcherOut = r.output as {
                dimension: string;
                findings: { claim: string; evidence: string; source: string }[];
                summary: string;
              };

              // ── TI-style per-dimension chapter pipeline ──
              // ★ Phase P4-4: minimal 档位 + quick depth 跳过 chapter pipeline 节省成本
              const skipChapterPipeline =
                input.auditLayers === "minimal" || input.depth === "quick";
              if (skipChapterPipeline) {
                return researcherOut;
              }
              try {
                const enriched = await this.runPerDimensionPipeline({
                  missionId,
                  userId,
                  dimensionIdx: idx,
                  dimensionName: dim.name,
                  topic: input.topic,
                  language: input.language,
                  depth: input.depth,
                  pool,
                  researcherOut,
                  billing,
                  budgetMultiplier,
                });
                return enriched;
              } catch (err) {
                const message =
                  err instanceof Error ? err.message : String(err);
                this.log.warn(
                  `[per-dim pipeline ${idx}] threw on "${dim.name}": ${message}`,
                );
                // 退化到原始 researcher 输出
                return researcherOut;
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              const errName = err instanceof Error ? err.name : "Unknown";
              this.log.warn(
                `[researcher#${idx}] threw on dim "${dim.name}" (${errName}): ${message}`,
              );
              await this.lifecycle(
                missionId,
                userId,
                agentId,
                "researcher",
                "failed",
                { dimension: dim.name, error: message },
              ).catch(() => {});
              // ★ 区分 throw 类型：哪一层挂了一目了然
              let innerFailureCode = "UNKNOWN";
              if (errName === "ByokRequiredError") {
                innerFailureCode = "PROVIDER_BYOK_MODEL_NOT_FOUND";
              } else if (
                errName === "InputValidationError" ||
                errName === "DefineAgentMissingError"
              ) {
                innerFailureCode = "RUNNER_INPUT_SCHEMA_MISMATCH";
              } else if (/timeout|timed out/i.test(message)) {
                innerFailureCode = "RUNNER_WALL_TIME_EXCEEDED";
              } else if (/rate.?limit|429/i.test(message)) {
                innerFailureCode = "PROVIDER_RATE_LIMIT";
              } else if (!/aborted|cancelled/i.test(message)) {
                innerFailureCode = "PROVIDER_API_ERROR";
              }
              // ★ orchestrator 级降级：threw exception 路径
              await this.emit({
                type: "agent-playground.dimension:degraded",
                missionId,
                userId,
                agentId,
                payload: {
                  dimension: dim.name,
                  state: "exception",
                  failureCode: "ORCH_DIMENSION_DEGRADED",
                  innerFailureCode,
                  innerMessage: message,
                  diagnostic: {
                    stage: "researcher",
                    errorName: errName,
                    errorMessage: message,
                    errorStack: err instanceof Error ? err.stack : undefined,
                  },
                },
              }).catch(() => {});
              return {
                dimension: dim.name,
                findings: [],
                summary: `(error: ${message})`,
              };
            }
          },
        );
        // researchers cost 已在 runWithConcurrency 内 per-researcher tickCostDelta 累加
        if (pool.isExhausted()) {
          await this.emit({
            type: "agent-playground.budget:exhausted",
            missionId,
            userId,
            payload: pool.snapshot(),
          });
        }
        await this.emit({
          type: "agent-playground.stage:completed",
          missionId,
          userId,
          payload: {
            stage: "researchers",
            results: researcherResults.map((r) => ({
              dimension: r.dimension,
              findingsCount: r.findings.length,
              summary: r.summary,
            })),
          },
        });

        // ── ★ M1 ASSESS-RESEARCH（已抽到 stages/30-leader-assess-m1.stage.ts）──
        await runLeaderAssessM1Stage(
          this.buildStageCtx({
            missionId,
            userId,
            input,
            t0,
            billing,
            pool,
            leader,
            budgetMultiplier,
            plan,
            researcherResults,
          }),
          this.buildStageDeps(),
        );

        // ── Stage B' (3.5): Reconciler 对账（已抽到 stages/40-reconciler.stage.ts）──
        const reconCtx = this.buildStageCtx({
          missionId,
          userId,
          input,
          t0,
          billing,
          pool,
          leader,
          budgetMultiplier,
          plan,
          researcherResults,
        });
        await runReconcilerStage(reconCtx, this.buildStageDeps());
        const reconciliationReport = reconCtx.reconciliationReport;

        // ── Stage 3: Analyst 反思整合（已抽到 stages/50-analyst.stage.ts）──
        const analyst = await runAnalystStage(
          this.buildStageCtx({
            missionId,
            userId,
            input,
            t0,
            billing,
            pool,
            leader,
            budgetMultiplier,
            plan,
            researcherResults,
            reconciliationReport,
          }),
          this.buildStageDeps(),
        );

        // ★ Phase P4-1: OutlinePlanner W1（已抽到 stages/55-writer-outline.stage.ts）
        await runWriterOutlineStage(
          this.buildStageCtx({
            missionId,
            userId,
            input,
            t0,
            billing,
            pool,
            leader,
            budgetMultiplier,
            plan,
            researcherResults,
            reconciliationReport,
          }),
          this.buildStageDeps(),
        );

        // ── Stage 4: Writer 起草 + 必要时 retry ──
        let attempts = 0;
        let report: ResearchReport | null = null;
        let reviewScore = 0;
        let verifierVerdicts: unknown[] = [];
        // 指针指向最后一次成功的 writer agent + 它的事件流，用于 memory auto-index
        let lastWriterAgent: IAgent | null = null;
        let lastWriterEvents: readonly IAgentEvent[] = [];
        // 失败时记录最后一次 writer 的失败原因（给 Writer-failed throw 用）
        let lastWriterFailMsg: string | undefined;
        const MAX_WRITER_ATTEMPTS = 2;
        do {
          attempts += 1;
          const writerAgentId = `writer#${attempts}`;
          await this.emit({
            type: "agent-playground.stage:started",
            missionId,
            userId,
            payload: { stage: "writer", attempt: attempts },
          });
          await this.lifecycle(
            missionId,
            userId,
            writerAgentId,
            "writer",
            "started",
            { attempt: attempts },
          );
          // ★ Phase P4-3: Writer 跨 mission 失败模式预查
          await this.preDisableKnownFailingModels(
            billing,
            "playground.writer",
            `${input.topic}::writer::${input.language}`,
          );
          // ★ Phase P5-4: Writer 输入也 Summarize-on-Handoff
          const writerInsights = this.missionState.compressIfNeeded(
            analyst.insights,
            "writer.insights",
          );
          const writerContradictions = this.missionState.compressIfNeeded(
            analyst.contradictions,
            "writer.contradictions",
          );
          // ★ Raw findings 透传：让 Writer 不仅看 Analyst 抽出来的 insights，
          //   还能看到每个 Researcher 原始的 (claim, evidence, source) 三元组。
          //   这样 Writer 引用具体数字 / 时间 / URL 时，每条都能在原始证据里找到对应。
          const rawFindings: {
            dimension: string;
            claim: string;
            evidence: string;
            source: string;
          }[] = [];
          for (const r of researcherResults) {
            for (const f of r.findings ?? []) {
              rawFindings.push({
                dimension: r.dimension,
                claim: f.claim,
                evidence: f.evidence,
                source: f.source,
              });
            }
          }
          // 单 shot writer 路径 + judgeWithConsensus 需要直接访问 agent.getEnvelope()，
          // 暂保留 runAndRelay 直调（service 抽象不暴露 .agent，留 PR-S6b 解决）
          const writerRes = await this.runAndRelay(
            SingleShotWriterAgent,
            {
              topic: input.topic,
              depth: input.depth,
              language: input.language,
              insights: writerInsights,
              themeSummary: analyst.themeSummary,
              contradictions: writerContradictions,
              rawFindings,
            },
            {
              missionId,
              userId,
              agentId: writerAgentId,
              role: "writer",
              envAdapter: billing,
              loopOverride: this.resolveLoopOverride(
                input.auditLayers,
                "writer",
              ),
            },
          );
          await this.tickCostDelta(
            missionId,
            userId,
            "writer",
            pool,
            extractTokenSpend(writerRes.events),
          );
          await this.lifecycle(
            missionId,
            userId,
            writerAgentId,
            "writer",
            writerRes.state === "completed" ? "completed" : "failed",
            {
              wallTimeMs: writerRes.wallTimeMs,
              iterations: writerRes.iterations,
              attempt: attempts,
              error: extractFailureMessage(
                writerRes.events,
                writerRes.state,
                !!writerRes.output,
                {
                  iterations: writerRes.iterations,
                  wallTimeMs: writerRes.wallTimeMs,
                },
              ),
            },
          );
          if (writerRes.state !== "completed" || !writerRes.output) {
            lastWriterFailMsg = extractFailureMessage(
              writerRes.events,
              writerRes.state,
              !!writerRes.output,
              {
                iterations: writerRes.iterations,
                wallTimeMs: writerRes.wallTimeMs,
              },
            );
            continue;
          }
          report = writerRes.output as ResearchReport;
          lastWriterAgent = writerRes.agent;
          lastWriterEvents = writerRes.events;
          await this.emit({
            type: "agent-playground.report:draft",
            missionId,
            userId,
            agentId: writerAgentId,
            payload: { attempt: attempts, report },
          });

          // ── Stage 5: Verify Consensus ──
          await this.emit({
            type: "agent-playground.stage:started",
            missionId,
            userId,
            payload: { stage: "reviewer", attempt: attempts },
          });
          await this.lifecycle(
            missionId,
            userId,
            "reviewer",
            "reviewer",
            "started",
            { attempt: attempts },
          );
          const verdict = await this.judge.judgeWithConsensus({
            output: report,
            envelope: writerRes.agent.getEnvelope(),
            verifierIds: ["self", "external", "critical"],
            passThreshold: 70,
          });
          reviewScore = verdict.decision.score;
          verifierVerdicts = verdict.verdicts as unknown[];
          // 每个 judge 单独 emit，前端可以并排显示
          for (const v of verdict.verdicts) {
            await this.emit({
              type: "agent-playground.verifier:verdict",
              missionId,
              userId,
              agentId: "reviewer",
              payload: {
                verifierId: v.judgeId,
                score: v.score,
                critique: v.critique,
                criteria: v.criteria,
                modelId: v.modelId,
                attempt: attempts,
              },
            });
          }
          await this.lifecycle(
            missionId,
            userId,
            "reviewer",
            "reviewer",
            "completed",
            {
              attempt: attempts,
              consensusScore: reviewScore,
              consensusVerdict: verdict.decision.verdict,
            },
          );
          await this.emit({
            type: "agent-playground.stage:completed",
            missionId,
            userId,
            payload: {
              stage: "reviewer",
              attempt: attempts,
              score: reviewScore,
              decision: verdict.decision.verdict,
            },
          });
          if (verdict.decision.verdict === "pass") break;
        } while (attempts < MAX_WRITER_ATTEMPTS);

        if (!report) {
          throw new Error(
            lastWriterFailMsg
              ? `Writer 失败 (尝试 ${MAX_WRITER_ATTEMPTS} 次)：${lastWriterFailMsg}`
              : `Writer failed after ${MAX_WRITER_ATTEMPTS} attempts`,
          );
        }

        await this.emit({
          type: "agent-playground.stage:completed",
          missionId,
          userId,
          payload: { stage: "writer", attempts, finalScore: reviewScore },
        });

        // ── Stage 6: Memory auto-index ──
        // 用最后一次成功的 writer agent + 它的事件流喂 indexer：
        // extractCandidates() 从 envelope.messages 取 assistant 输出，从 events 取 tool 观察
        const indexAgent =
          lastWriterAgent ?? this.makeProxyAgent(missionId, "research-team");
        const indexed = await this.indexer
          .indexAgentTrajectory(indexAgent, lastWriterEvents, {
            namespace: workspaceId ?? userId,
            source: "agent-playground.research-team",
            tags: [input.depth, input.topic],
            confidence: reviewScore / 100,
            metadata: { topic: input.topic, missionId },
          })
          .catch((err: unknown) => {
            this.log.warn(
              `[indexer] failed: ${err instanceof Error ? err.message : String(err)}`,
            );
            return 0;
          });
        await this.emit({
          type: "agent-playground.memory:indexed",
          missionId,
          userId,
          payload: {
            chunks: indexed,
            namespace: workspaceId ?? userId,
            tags: [input.depth, input.topic],
          },
        });

        const snap = pool.snapshot();
        const wallTimeMs = Date.now() - t0;
        await this.emit({
          type: "agent-playground.mission:completed",
          missionId,
          userId,
          payload: {
            reviewScore,
            costUsd: snap.poolCostUsd,
            tokensUsed: snap.poolTokensUsed,
            trajectoryStored: indexed,
            wallTimeMs,
            verifierVerdicts,
          },
        });

        await this.credits
          .consumeCredits({
            userId,
            moduleType: "agent-playground",
            operationType: "research-team",
            tokenCount: snap.poolTokensUsed,
            referenceId: missionId,
            description: `Research mission: ${input.topic}`,
            idempotencyKey: missionId,
          })
          .catch((err: unknown) => {
            this.log.warn(
              `[credits] consume failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          });

        // ★ Phase P1-19: 把 Reviewer 评分整合进 ReportArtifact.quality.dimensions
        //   reviewer 是 L3 跨角审，得到的 reviewScore 反映 traceability + factual + style 的合成评估
        //   用 reviewScore 增强 traceability/styleConformance/factualConsistency dim
        // ── Phase P0-5: 装配 ReportArtifact v2（结构化输出）──
        let reportArtifact:
          | import("../../../dto/report-artifact.dto").ReportArtifact
          | undefined;
        try {
          // ★ Phase P2-10: 从 lastWriterEvents 抽真实 modelTrail + 计算 generationTimeMs
          const modelIds = new Set<string>();
          let writerStartTs: number | undefined;
          let writerEndTs: number | undefined;
          for (const ev of lastWriterEvents ?? []) {
            if (ev.type === "thinking") {
              const p = ev.payload as { modelId?: string } | null;
              if (p?.modelId) modelIds.add(p.modelId);
            }
            if (writerStartTs === undefined) writerStartTs = ev.timestamp;
            writerEndTs = ev.timestamp;
          }
          const modelTrail = Array.from(modelIds);
          const writerGenerationMs =
            writerStartTs && writerEndTs
              ? writerEndTs - writerStartTs
              : wallTimeMs;
          // Phase P15-2: rerun 时，userProfile 中含 prevMissionId 即视为增量
          // 当前不真做 diff（需读取上一版 sections 做 4-gram 比较），先标记 isIncremental
          const isIncremental = false; // P2+ 真实 diff
          void isIncremental;
          reportArtifact = this.reportAssembler.assemble({
            topic: input.topic,
            language: input.language,
            styleProfile: input.styleProfile,
            lengthProfile: input.lengthProfile,
            audienceProfile: input.audienceProfile,
            plan: {
              themeSummary: plan.themeSummary,
              dimensions: plan.dimensions.map((d) => ({
                id: d.id,
                name: d.name,
                rationale: d.rationale,
              })),
            },
            researcherResults: researcherResults.map((r) => ({
              dimension: r.dimension,
              findings: r.findings,
              summary: r.summary,
              // ★ Phase P1-1: 图候选透传到 Assembler（图来源红线）
              figureCandidates: (r as { figureCandidates?: unknown[] })
                .figureCandidates as
                | {
                    sourceUrl: string;
                    imageUrl?: string;
                    caption: string;
                    sourcePageOrSection?: string;
                    relevanceHint?: "high" | "medium" | "low";
                  }[]
                | undefined,
            })),
            analyst: {
              themeSummary: report.summary,
            },
            writerReport: report,
            reconciliationReport: (reconciliationReport ??
              undefined) as Parameters<
              typeof this.reportAssembler.assemble
            >[0]["reconciliationReport"],
            generationTimeMs: writerGenerationMs,
            totalTokens: {
              prompt: 0,
              completion: snap.poolTokensUsed,
              total: snap.poolTokensUsed,
            },
            costCents: Math.round((snap.poolCostUsd ?? 0) * 100),
            modelTrail,
          });
        } catch (err) {
          this.log.warn(
            `[${missionId}] reportAssembler failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
          );
        }

        // ★ Phase P5-2 / P7-8: 把 reconciliation 的事实质量进一步纳入 quality + qualityTrace
        if (reportArtifact && reconciliationReport) {
          reportArtifact.quality.qualityTrace.push({
            stage: "reconciler",
            check: `${(reconciliationReport as { factTable?: unknown[] }).factTable?.length ?? 0} facts / ${(reconciliationReport as { conflicts?: unknown[] }).conflicts?.length ?? 0} conflicts`,
            passed:
              ((
                reconciliationReport as {
                  conflicts?: { resolutionType: string }[];
                }
              ).conflicts?.filter(
                (c) => c.resolutionType === "flagged-unresolved",
              ).length ?? 0) === 0,
            timestamp: Date.now(),
          });
        }
        if (reportArtifact && reconciliationReport) {
          const conflicts =
            (
              reconciliationReport as {
                conflicts?: { resolutionType: string }[];
              }
            ).conflicts ?? [];
          const unresolved = conflicts.filter(
            (c) => c.resolutionType === "flagged-unresolved",
          ).length;
          if (unresolved > 0) {
            const drop = Math.min(0.5, unresolved * 0.15);
            reportArtifact.quality.dimensions.factualConsistency = Math.max(
              0,
              Math.round(
                reportArtifact.quality.dimensions.factualConsistency *
                  (1 - drop),
              ),
            );
            reportArtifact.quality.warnings.push({
              dimension: "factualConsistency",
              message: `Reconciler 标记 ${unresolved} 项 unresolved 冲突`,
            });
          }
          const gaps =
            (reconciliationReport as { gaps?: { severity: string }[] }).gaps ??
            [];
          const criticalGaps = gaps.filter(
            (g) => g.severity === "critical",
          ).length;
          if (criticalGaps > 0) {
            reportArtifact.quality.dimensions.coverage = Math.max(
              0,
              Math.round(reportArtifact.quality.dimensions.coverage * 0.8),
            );
            reportArtifact.quality.warnings.push({
              dimension: "coverage",
              message: `Reconciler 识别 ${criticalGaps} 项 critical gap 未覆盖`,
            });
          }
        }

        // ★ Phase P5-3: withFigures=true 但 figureCount=0 时降低 coverage
        if (
          reportArtifact &&
          input.withFigures &&
          reportArtifact.figures.length === 0
        ) {
          reportArtifact.quality.warnings.push({
            dimension: "withFigures",
            message:
              "用户开启图文并茂，但终稿无可用图（researcher 未抽到符合红线的图）",
          });
        }

        // ★ Phase P5-8: 维度降级率超过 30% 时降低 coverage
        if (reportArtifact) {
          const totalDims = plan.dimensions.length;
          const degradedDims = researcherResults.filter(
            (r) => r.findings.length === 0,
          ).length;
          if (totalDims > 0 && degradedDims / totalDims > 0.3) {
            reportArtifact.quality.dimensions.coverage = Math.max(
              0,
              Math.round(reportArtifact.quality.dimensions.coverage * 0.6),
            );
            reportArtifact.quality.warnings.push({
              dimension: "coverage",
              message: `${degradedDims}/${totalDims} 维度降级（无 findings）`,
            });
          }
        }

        // ★ Phase P1-19: Reviewer 三路评分整合到 quality.dimensions
        if (reportArtifact && reviewScore > 0) {
          const reviewerSignal = Math.max(0, Math.min(100, reviewScore));
          // Reviewer 是 L3 跨角，主要信号来自整体可读性 + 事实可信
          // 让 traceability / factualConsistency / styleConformance 与 reviewer 评分加权
          const blend = (cur: number, signal: number, w = 0.4): number =>
            Math.round(cur * (1 - w) + signal * w);
          reportArtifact.quality.dimensions.traceability = blend(
            reportArtifact.quality.dimensions.traceability,
            reviewerSignal,
          );
          reportArtifact.quality.dimensions.factualConsistency = blend(
            reportArtifact.quality.dimensions.factualConsistency,
            reviewerSignal,
            0.3,
          );
          reportArtifact.quality.dimensions.styleConformance = blend(
            reportArtifact.quality.dimensions.styleConformance,
            reviewerSignal,
            0.5,
          );
          // overall 重算
          const dims = reportArtifact.quality.dimensions;
          reportArtifact.quality.overall = Math.round(
            Object.values(dims).reduce((a, b) => a + b, 0) /
              Object.keys(dims).length,
          );
          reportArtifact.quality.qualityTrace.push({
            stage: "reviewer-l3",
            check: "blended-into-quality-dimensions",
            passed: reviewerSignal >= 70,
            timestamp: Date.now(),
          });
          // 各 verifier 的 score 也入 trace（限制 trace 大小）
          if (reportArtifact.quality.qualityTrace.length > 50) {
            reportArtifact.quality.qualityTrace =
              reportArtifact.quality.qualityTrace.slice(-30);
          }
          for (const v of verifierVerdicts) {
            const ver = v as {
              verifierId?: string;
              score?: number;
            };
            if (ver?.verifierId && typeof ver.score === "number") {
              reportArtifact.quality.qualityTrace.push({
                stage: ver.verifierId,
                check: `score=${ver.score}`,
                passed: ver.score >= 70,
                timestamp: Date.now(),
              });
            }
          }
        }

        // ── Phase P1-4 / P37-1: L4 Critic（已抽到 stages/70-critic.stage.ts）
        await runCriticStage(
          this.buildStageCtx({
            missionId,
            userId,
            input,
            t0,
            billing,
            pool,
            leader,
            budgetMultiplier,
            plan,
            researcherResults,
            reconciliationReport,
            reportArtifact,
            report,
            reviewScore,
            verifierVerdicts,
          }),
          this.buildStageDeps(),
        );

        // ★ Phase Lead-Stages: M6 + M7 全部走 stage 文件
        // services/mission/workflow/stages/80-leader-handoff.stage.ts
        const stageCtx = this.buildStageCtx({
          missionId,
          userId,
          input,
          t0,
          billing,
          pool,
          leader,
          budgetMultiplier,
          plan,
          researcherResults,
          reconciliationReport,
          reportArtifact,
          report,
          reviewScore,
          verifierVerdicts,
        });
        const stageDeps = this.buildStageDeps();
        await runLeaderHandoffStage(stageCtx, stageDeps);
        const leaderSignOff = stageCtx.leaderSignOff;

        return {
          missionId,
          report,
          reviewScore,
          costUsd: snap.poolCostUsd,
          trajectoryStored: indexed,
          themeSummary: plan.themeSummary,
          dimensions: plan.dimensions,
          verdicts: verifierVerdicts as MissionResult["verdicts"],
          reportArtifact,
          reconciliationReport: reconciliationReport ?? undefined,
          userProfile: {
            depth: input.depth,
            budgetProfile: input.budgetProfile,
            styleProfile: input.styleProfile,
            lengthProfile: input.lengthProfile,
            audienceProfile: input.audienceProfile,
            withFigures: input.withFigures,
            auditLayers: input.auditLayers,
            concurrency: input.concurrency,
            viewMode: input.viewMode,
            language: input.language,
          },
          leaderSignOff,
        };
      }
    }
  }

  // ─── stage extraction helpers ──────────────────────────────────

  private buildStageCtx(args: {
    missionId: string;
    userId: string;
    input: RunMissionInput;
    t0: number;
    billing: BillingRuntimeEnvAdapter;
    pool: MissionBudgetPool;
    leader: SupervisedMission;
    budgetMultiplier: number;
    plan?: MissionContext["plan"];
    researcherResults?: MissionContext["researcherResults"];
    reconciliationReport?: MissionContext["reconciliationReport"];
    reportArtifact?: MissionContext["reportArtifact"];
    report?: MissionContext["report"];
    reviewScore?: number;
    verifierVerdicts?: unknown[];
  }): MissionContext {
    return {
      missionId: args.missionId,
      userId: args.userId,
      input: args.input,
      t0: args.t0,
      billing: args.billing,
      pool: args.pool,
      leader: args.leader,
      budgetMultiplier: args.budgetMultiplier,
      plan: args.plan,
      researcherResults: args.researcherResults,
      reconciliationReport: args.reconciliationReport,
      reportArtifact: args.reportArtifact,
      report: args.report,
      reviewScore: args.reviewScore,
      verifierVerdicts: args.verifierVerdicts,
    };
  }

  private buildStageDeps(): MissionDeps {
    return {
      leader: this.leaderService,
      reconciler: this.reconcilerService,
      analyst: this.analystService,
      writer: this.writerService,
      reviewer: this.reviewerService,
      verifier: this.verifierService,
      steward: this.stewardService,
      invoker: this.invoker,
      store: this.store,
      missionState: this.missionState,
      abortRegistry: this.abortRegistry,
      runner: this.runner,
      judge: this.judge,
      indexer: this.indexer,
      eventBus: this.eventBus,
      credits: this.credits,
      runtimeEnv: this.runtimeEnv,
      failureLearner: this.failureLearner,
      reportAssembler: this.reportAssembler,
      log: this.log,
      emit: this.emit.bind(this),
      lifecycle: this.lifecycle.bind(this),
    };
  }

  // ─── private ────────────────────────────────────────────────

  private async emit(args: {
    type: string;
    missionId: string;
    userId: string;
    agentId?: string;
    traceId?: string;
    payload: unknown;
  }): Promise<void> {
    const event: DomainEvent = {
      type: args.type,
      scope: { missionId: args.missionId, userId: args.userId },
      payload: args.payload,
      agentId: args.agentId,
      traceId: args.traceId,
      timestamp: Date.now(),
    };
    await this.eventBus.emit(event).catch(() => {
      /* event 失败不影响主流程 */
    });
  }

  private async lifecycle(
    missionId: string,
    userId: string,
    agentId: string,
    role: string,
    phase: "started" | "completed" | "failed",
    detail?: Record<string, unknown>,
  ): Promise<void> {
    await this.emit({
      type: "agent-playground.agent:lifecycle",
      missionId,
      userId,
      agentId,
      payload: { agentId, role, phase, ...detail },
    });
  }

  /**
   * 记录本 stage 的 token/cost 增量到 pool，并 emit cost:tick：
   * payload 同时携带 stage delta（让 UI 画 per-stage 条形图，避免 cumulative 错觉）。
   */
  private async tickCostDelta(
    missionId: string,
    userId: string,
    stage: string,
    pool: MissionBudgetPool,
    deltaTokens: number,
  ): Promise<void> {
    const deltaCostUsd = estimateUsdFromTokens(deltaTokens);
    pool.recordSpend(deltaTokens, 0, deltaCostUsd);
    const snap = pool.snapshot();
    await this.emit({
      type: "agent-playground.cost:tick",
      missionId,
      userId,
      payload: {
        stage,
        deltaTokens,
        deltaCostUsd,
        tokensUsed: snap.poolTokensUsed,
        costUsd: snap.poolCostUsd,
      },
    });
  }

  /**
   * 一次性运行 Agent + 实时 relay 每个事件 → WebSocket。
   *
   * 第三参数走 RunOptions，让 Harness 自闭包：
   *   - userId         → 自动包 BillingContext（下游 LLM 自动走该用户 BYOK）
   *   - environment    → 自动注入 <environment> block（BYOK / 余额 / 模型池）
   *   - exposeCatalog  → 默认 true，自动注入 <available_tools> + <available_skills>
   *   - onEvent        → per-iteration 实时 relay
   *
   * Agent 类完全不感知环境/账单/能力 catalog —— 这是 Harness 该做的事。
   */
  private async runAndRelay<TSpec extends Parameters<AgentRunner["run"]>[0]>(
    Spec: TSpec,
    input: Parameters<AgentRunner["run"]>[1],
    ctx: RelayCtx,
  ): Promise<Awaited<ReturnType<AgentRunner["run"]>>> {
    // Phase P12-1: 把 mission 级 abort signal 透传到所有子 runner
    const signal = this.abortRegistry.getSignal(ctx.missionId);
    return this.runner.run(Spec, input, {
      userId: ctx.userId,
      environment: ctx.envAdapter,
      budgetMultiplier: ctx.budgetMultiplier,
      toolRecallHint: ctx.toolRecallHint,
      loopOverride: ctx.loopOverride,
      signal,
      billingMeta: {
        moduleType: "agent-playground",
        operationType: ctx.role,
        referenceId: ctx.missionId,
      },
      onEvent: async (ev) => {
        await this.relayAgentEvents([ev], ctx);
      },
    });
  }

  /**
   * Phase P3-2: 通用失败模式预查（mission-pipeline-failure-learning.md）
   * 给 analyst/writer/reconciler 等 stage 复用 researcher 的失败学习路径。
   * 返回 preDisabled 数组，调用方应用到 BillingRuntimeEnvAdapter.markModelDisabled。
   */
  private async preDisableKnownFailingModels(
    billing: BillingRuntimeEnvAdapter,
    agentSpecId: string,
    promptKey: string,
  ): Promise<{ failed: string; fallback: string }[]> {
    const known = await this.failureLearner
      .lookup({ agentSpecId, systemPrompt: promptKey })
      .catch(() => []);
    const preDisabled: { failed: string; fallback: string }[] = [];
    for (const rec of known) {
      if (rec.count >= 2 && rec.lastFallbackModel) {
        billing.markModelDisabled(rec.modelId, rec.lastFallbackModel);
        preDisabled.push({
          failed: rec.modelId,
          fallback: rec.lastFallbackModel,
        });
      }
    }
    return preDisabled;
  }

  /**
   * 根据 auditLayers 档位 + stage 类型决定是否切 reflexion loop。
   * mission-pipeline-audit-layers.md L1 启用规则：
   *   - thorough/paranoid 时 Leader/Analyst/Writer 走 reflexion
   *   - default 时 deep depth + 高质量需求 stage 选择性启用
   *   - minimal 时永远 react
   */
  private resolveLoopOverride(
    auditLayers: string,
    stage:
      | "leader"
      | "researcher"
      | "reconciler"
      | "analyst"
      | "writer"
      | "reviewer",
  ): "react" | "reflexion" | undefined {
    if (auditLayers === "minimal") return undefined;
    const useReflexion =
      auditLayers === "thorough" || auditLayers === "paranoid";
    if (!useReflexion) return undefined;
    // researcher / reconciler 不走 reflexion（成本敏感）
    if (stage === "researcher" || stage === "reconciler") return undefined;
    return "reflexion";
  }

  /**
   * 把 RunResult.events 转成 demo 友好的 thought / action / observation 事件。
   * 必须 await 每条 emit —— 否则 caller 紧接的 lifecycle:completed 会赶在 trace 之前到达 UI。
   *
   * 注意：当配合 runAndRelay 使用时，事件是 per-iteration relay 进来的（数组长度=1）；
   *      当被旧调用方式 batch 调用时，则一次处理多个。两种用法都安全。
   */
  private async relayAgentEvents(
    events: readonly IAgentEvent[],
    ctx: RelayCtx,
  ): Promise<void> {
    for (const ev of events) {
      if (ev.type === "thinking") {
        const p = ev.payload as {
          text: string;
          tokenCount?: number;
          modelId?: string;
        };
        await this.emit({
          type: "agent-playground.agent:thought",
          missionId: ctx.missionId,
          userId: ctx.userId,
          agentId: ctx.agentId,
          payload: {
            agentId: ctx.agentId,
            role: ctx.role,
            text: p.text,
            tokenCount: p.tokenCount,
            modelId: p.modelId,
            originalTs: ev.timestamp,
          },
        });
      } else if (ev.type === "action_planned") {
        const action = ev.payload as {
          kind: string;
          toolId?: string;
          input?: unknown;
          calls?: unknown[];
          skillId?: string;
          name?: string;
        };
        await this.emit({
          type: "agent-playground.agent:action",
          missionId: ctx.missionId,
          userId: ctx.userId,
          agentId: ctx.agentId,
          payload: {
            agentId: ctx.agentId,
            role: ctx.role,
            kind: action.kind,
            toolId: action.toolId,
            skillId: action.skillId,
            subagentName: action.name,
            input: action.input,
            calls: action.calls,
            originalTs: ev.timestamp,
          },
        });
      } else if (ev.type === "action_executed") {
        const r = ev.payload as {
          action: { kind: string; toolId?: string };
          output: unknown;
          error?: { message: string };
          latencyMs: number;
          tokensUsed?: number;
        };
        await this.emit({
          type: "agent-playground.agent:observation",
          missionId: ctx.missionId,
          userId: ctx.userId,
          agentId: ctx.agentId,
          payload: {
            agentId: ctx.agentId,
            role: ctx.role,
            kind: r.action?.kind,
            toolId: r.action?.toolId,
            output: this.truncatePayload(r.output),
            error: r.error?.message,
            latencyMs: r.latencyMs,
            tokensUsed: r.tokensUsed,
            originalTs: ev.timestamp,
          },
        });
      } else if (ev.type === "reflection") {
        const p = ev.payload as { text?: string; verdict?: string };
        await this.emit({
          type: "agent-playground.agent:reflection",
          missionId: ctx.missionId,
          userId: ctx.userId,
          agentId: ctx.agentId,
          payload: {
            agentId: ctx.agentId,
            role: ctx.role,
            text: p.text,
            verdict: p.verdict,
            originalTs: ev.timestamp,
          },
        });
      } else if (ev.type === "error") {
        const p = ev.payload as { message: string };
        await this.emit({
          type: "agent-playground.agent:error",
          missionId: ctx.missionId,
          userId: ctx.userId,
          agentId: ctx.agentId,
          payload: {
            agentId: ctx.agentId,
            role: ctx.role,
            message: p.message,
            originalTs: ev.timestamp,
          },
        });
      } else if (ev.type === "tools_recalled") {
        // ★ Phase P3-1: 中继 tools_recalled 让前端 trace 可视化
        const p = ev.payload as {
          recalledIds?: readonly string[];
          categories?: readonly string[];
          source?: string;
          preferIds?: readonly string[];
        };
        await this.emit({
          type: "agent-playground.tools:recalled",
          missionId: ctx.missionId,
          userId: ctx.userId,
          agentId: ctx.agentId,
          payload: {
            agentId: ctx.agentId,
            role: ctx.role,
            recalledIds: p.recalledIds ?? [],
            categories: p.categories ?? [],
            source: p.source ?? "spec",
            preferIds: p.preferIds ?? [],
            originalTs: ev.timestamp,
          },
        });
      } else if (ev.type === "validation_failed") {
        // ★ Phase P3-1: 中继 validation_failed 让前端可视化校验闸 reject
        const p = ev.payload as {
          rejectCount?: number;
          maxRejects?: number;
          issues?: string;
        };
        await this.emit({
          type: "agent-playground.agent:validation-rejected",
          missionId: ctx.missionId,
          userId: ctx.userId,
          agentId: ctx.agentId,
          payload: {
            agentId: ctx.agentId,
            role: ctx.role,
            rejectCount: p.rejectCount ?? 0,
            maxRejects: p.maxRejects ?? 3,
            issues: p.issues ?? "",
            originalTs: ev.timestamp,
          },
        });
      }
    }
  }

  private truncatePayload(payload: unknown): unknown {
    if (payload == null) return payload;
    if (typeof payload === "string") {
      return payload.length > 1500 ? payload.slice(0, 1500) + "…" : payload;
    }
    try {
      const s = JSON.stringify(payload);
      if (s.length <= 4000) return payload;
      return { _truncated: true, preview: s.slice(0, 4000) + "…" };
    } catch {
      return String(payload);
    }
  }

  private makeProxyAgent(missionId: string, roleId: string): IAgent {
    const env: IContextEnvelope = {
      id: missionId,
      system: "",
      messages: [],
      reminders: [],
      tools: [],
      memory: { sessionId: missionId },
      budget: {
        tokensUsed: 0,
        tokensRemaining: 0,
        iterationsUsed: 0,
        iterationsRemaining: 0,
        wallTimeStartMs: Date.now(),
      },
    };
    return {
      id: missionId,
      identity: {
        role: { id: roleId, name: roleId, description: "demo proxy agent" },
        skills: [],
        tools: [],
      },
      state: "completed",
      execute: async function* () {
        /* no-op */
      },
      spawnSubagent: async () => {
        throw new Error("proxy agent cannot spawn");
      },
      getEnvelope: () => env,
      cancel: async () => {
        /* no-op */
      },
    };
  }

  private async runWithConcurrency<TIn, TOut>(
    items: readonly TIn[],
    concurrency: number,
    fn: (item: TIn, idx: number) => Promise<TOut>,
  ): Promise<TOut[]> {
    const results: TOut[] = [];
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(concurrency, items.length) },
      async () => {
        while (cursor < items.length) {
          const idx = cursor++;
          results[idx] = await fn(items[idx], idx);
        }
      },
    );
    await Promise.all(workers);
    return results;
  }

  /**
   * Phase P1-17: 拓扑序分批并行（mission-pipeline-baseline.md §11 D17）
   *
   * 每个 item 可声明 dependsOn:string[] 指向其他 item.id；同 batch 内并行，
   * 跨 batch 串行。检测到循环或缺失依赖时回退到全并行（不报错）。
   *
   * 仅当 items.some(i => i.dependsOn?.length) 时调用此方法；否则直接 runWithConcurrency。
   */
  private async runDagConcurrency<
    TIn extends { id: string; dependsOn?: string[] },
    TOut,
  >(
    items: readonly TIn[],
    concurrency: number,
    fn: (item: TIn, idx: number) => Promise<TOut>,
  ): Promise<TOut[]> {
    // 拓扑排序（Kahn 算法）
    const ids = new Set(items.map((i) => i.id));
    const inDeg = new Map<string, number>();
    const adj = new Map<string, string[]>();
    for (const it of items) {
      const deps = (it.dependsOn ?? []).filter((d) => ids.has(d));
      inDeg.set(it.id, deps.length);
      for (const d of deps) {
        const arr = adj.get(d) ?? [];
        arr.push(it.id);
        adj.set(d, arr);
      }
    }
    const batches: string[][] = [];
    let pending = Array.from(inDeg.entries())
      .filter(([, n]) => n === 0)
      .map(([id]) => id);
    const seen = new Set<string>();
    while (pending.length > 0) {
      batches.push([...pending]);
      pending.forEach((id) => seen.add(id));
      const next: string[] = [];
      for (const id of pending) {
        for (const child of adj.get(id) ?? []) {
          inDeg.set(child, (inDeg.get(child) ?? 0) - 1);
          if (inDeg.get(child) === 0) next.push(child);
        }
      }
      pending = next;
    }
    // 检测循环：未 seen 的 item 全部塞最后一批
    if (seen.size < items.length) {
      this.log.warn(
        `[runDagConcurrency] cycle or missing deps detected — fallback to flat`,
      );
      return this.runWithConcurrency(items, concurrency, fn);
    }
    // 按 batch 跑
    const results: TOut[] = new Array(items.length);
    const idToIdx = new Map<string, number>();
    items.forEach((it, i) => idToIdx.set(it.id, i));
    for (const batch of batches) {
      const batchItems = batch.map((id) => items[idToIdx.get(id)!]);
      const batchResults = await this.runWithConcurrency(
        batchItems,
        concurrency,
        async (it) => fn(it, idToIdx.get(it.id)!),
      );
      batchItems.forEach((it, i) => {
        results[idToIdx.get(it.id)!] = batchResults[i];
      });
    }
    return results;
  }

  /**
   * TI-style per-dimension chapter pipeline.
   * 接收 Researcher 收集的素材，跑 outline → chapters [write+review loop] →
   * integrate → 5-axis grade，然后返回带 fullMarkdown + grade 的 enriched result。
   */
  private async runPerDimensionPipeline(args: {
    missionId: string;
    userId: string;
    dimensionIdx: number;
    dimensionName: string;
    topic: string;
    language: "zh-CN" | "en-US";
    depth: "quick" | "standard" | "deep";
    pool: MissionBudgetPool;
    researcherOut: {
      dimension: string;
      findings: { claim: string; evidence: string; source: string }[];
      summary: string;
    };
    billing: BillingRuntimeEnvAdapter;
    budgetMultiplier: number;
  }): Promise<{
    dimension: string;
    findings: { claim: string; evidence: string; source: string }[];
    summary: string;
    /** Per-dim 增强字段 */
    chapters?: {
      index: number;
      heading: string;
      body: string;
      wordCount: number;
    }[];
    abstract?: string;
    keyFindings?: string[];
    fullMarkdown?: string;
    grade?: {
      overall: number;
      grade: string;
      axes: Record<string, { score: number; comment: string }>;
      summary: string;
    };
  }> {
    const {
      missionId,
      userId,
      dimensionIdx,
      dimensionName,
      topic,
      language,
      depth,
      pool,
      researcherOut,
      billing,
      budgetMultiplier,
    } = args;

    const targetChapterCount = depth === "quick" ? 3 : depth === "deep" ? 7 : 5;
    const targetWordsPerChapter =
      depth === "quick" ? 600 : depth === "deep" ? 2500 : 1500;
    const dimAgentTag = `researcher#${dimensionIdx}`;

    // findings 不足时直接退化，跳过 chapter pipeline
    if (researcherOut.findings.length === 0) {
      return researcherOut;
    }

    // ── 1. Outline ──
    const outlineAgentId = `outline#${dimensionIdx}`;
    await this.lifecycle(
      missionId,
      userId,
      outlineAgentId,
      "outline",
      "started",
      {
        dimension: dimensionName,
      },
    );
    // ★ Phase Lead-Services: 通过 WriterService.planDimensionOutline()
    const outlineRes = await this.writerService.planDimensionOutline(
      {
        topic,
        dimension: dimensionName,
        language,
        dimensionSummary: researcherOut.summary,
        findings: researcherOut.findings,
        targetChapterCount,
      },
      {
        missionId,
        userId,
        agentId: outlineAgentId,
        role: "outline",
        envAdapter: billing,
      },
    );
    await this.tickCostDelta(
      missionId,
      userId,
      "researchers",
      pool,
      extractTokenSpend(outlineRes.events),
    );
    await this.lifecycle(
      missionId,
      userId,
      outlineAgentId,
      "outline",
      outlineRes.state === "completed" ? "completed" : "failed",
      {
        dimension: dimensionName,
        wallTimeMs: outlineRes.wallTimeMs,
        error: extractFailureMessage(
          outlineRes.events,
          outlineRes.state,
          !!outlineRes.output,
          {
            iterations: outlineRes.iterations,
            wallTimeMs: outlineRes.wallTimeMs,
          },
        ),
      },
    );
    if (outlineRes.state !== "completed" || !outlineRes.output) {
      return researcherOut;
    }
    const outline = outlineRes.output as {
      chapters: {
        index: number;
        heading: string;
        thesis: string;
        keyPoints: string[];
        sourceIndices: number[];
      }[];
    };
    await this.emit({
      type: "agent-playground.dimension:outline:planned",
      missionId,
      userId,
      agentId: dimAgentTag,
      payload: {
        dimension: dimensionName,
        chapterCount: outline.chapters.length,
        chapters: outline.chapters.map((c) => ({
          index: c.index,
          heading: c.heading,
          thesis: c.thesis,
        })),
      },
    });

    // ── 2. 逐章节 write + review loop ──
    const writtenChapters: {
      index: number;
      heading: string;
      body: string;
      wordCount: number;
    }[] = [];
    const previousHeadings: string[] = [];
    const MAX_REVISION_ATTEMPTS = 2;
    const PASS_THRESHOLD = 75;

    for (const chapter of outline.chapters) {
      const chapterSources = chapter.sourceIndices
        .map((i) => researcherOut.findings[i])
        .filter((s): s is NonNullable<typeof s> => s != null);

      let attempt = 0;
      let lastDraft:
        | { body: string; wordCount: number; citationsUsed: string[] }
        | undefined;
      let lastCritique: string | undefined;

      while (attempt < MAX_REVISION_ATTEMPTS + 1) {
        attempt += 1;
        const writerAgentId = `chapter-writer#${dimensionIdx}.${chapter.index}.${attempt}`;
        await this.emit({
          type: "agent-playground.chapter:writing:started",
          missionId,
          userId,
          agentId: writerAgentId,
          payload: {
            dimension: dimensionName,
            chapterIndex: chapter.index,
            heading: chapter.heading,
            attempt,
          },
        });
        const writerRes = await this.runAndRelay(
          ChapterWriterAgent,
          {
            topic,
            dimension: dimensionName,
            language,
            chapter: {
              index: chapter.index,
              heading: chapter.heading,
              thesis: chapter.thesis,
              keyPoints: chapter.keyPoints,
            },
            sources: chapterSources,
            targetWords: targetWordsPerChapter,
            previousChapterHeadings: previousHeadings,
            previousCritique: lastCritique,
            previousDraft: lastDraft?.body,
          },
          {
            missionId,
            userId,
            agentId: writerAgentId,
            role: "chapter-writer",
            envAdapter: billing,
            budgetMultiplier,
          },
        );
        await this.tickCostDelta(
          missionId,
          userId,
          "researchers",
          pool,
          extractTokenSpend(writerRes.events),
        );
        if (writerRes.state !== "completed" || !writerRes.output) {
          await this.emit({
            type: "agent-playground.chapter:writing:completed",
            missionId,
            userId,
            agentId: writerAgentId,
            payload: {
              dimension: dimensionName,
              chapterIndex: chapter.index,
              attempt,
              state: "failed",
            },
          });
          break;
        }
        const draft = writerRes.output as {
          body: string;
          wordCount: number;
          citationsUsed: string[];
        };
        lastDraft = draft;
        await this.emit({
          type: "agent-playground.chapter:writing:completed",
          missionId,
          userId,
          agentId: writerAgentId,
          payload: {
            dimension: dimensionName,
            chapterIndex: chapter.index,
            heading: chapter.heading,
            wordCount: draft.wordCount,
            attempt,
            state: "completed",
          },
        });

        // ── review ──
        const reviewerAgentId = `chapter-reviewer#${dimensionIdx}.${chapter.index}.${attempt}`;
        await this.emit({
          type: "agent-playground.chapter:review:started",
          missionId,
          userId,
          agentId: reviewerAgentId,
          payload: {
            dimension: dimensionName,
            chapterIndex: chapter.index,
            attempt,
          },
        });
        const reviewerRes = await this.runAndRelay(
          ChapterReviewerAgent,
          {
            topic,
            dimension: dimensionName,
            language,
            chapter: {
              index: chapter.index,
              heading: chapter.heading,
              thesis: chapter.thesis,
              body: draft.body,
              wordCount: draft.wordCount,
              targetWords: targetWordsPerChapter,
            },
          },
          {
            missionId,
            userId,
            agentId: reviewerAgentId,
            role: "chapter-reviewer",
            envAdapter: billing,
            budgetMultiplier,
          },
        );
        await this.tickCostDelta(
          missionId,
          userId,
          "researchers",
          pool,
          extractTokenSpend(reviewerRes.events),
        );
        const verdict =
          reviewerRes.state === "completed" && reviewerRes.output
            ? (reviewerRes.output as {
                decision: "pass" | "revise";
                score: number;
                critique: string;
              })
            : {
                decision: "pass" as const,
                score: 60,
                critique: "(reviewer failed)",
              };
        await this.emit({
          type: "agent-playground.chapter:review:completed",
          missionId,
          userId,
          agentId: reviewerAgentId,
          payload: {
            dimension: dimensionName,
            chapterIndex: chapter.index,
            attempt,
            decision: verdict.decision,
            score: verdict.score,
            critique: verdict.critique,
          },
        });

        if (
          verdict.decision === "pass" ||
          verdict.score >= PASS_THRESHOLD ||
          attempt >= MAX_REVISION_ATTEMPTS + 1
        ) {
          writtenChapters.push({
            index: chapter.index,
            heading: chapter.heading,
            body: draft.body,
            wordCount: draft.wordCount,
          });
          previousHeadings.push(chapter.heading);
          break;
        }

        // revise → 下一轮
        lastCritique = verdict.critique;
        await this.emit({
          type: "agent-playground.chapter:revision",
          missionId,
          userId,
          agentId: reviewerAgentId,
          payload: {
            dimension: dimensionName,
            chapterIndex: chapter.index,
            nextAttempt: attempt + 1,
            critique: verdict.critique,
          },
        });
      }
    }

    if (writtenChapters.length === 0) {
      return researcherOut;
    }

    // ── 3. Integrate ──
    const integratorAgentId = `integrator#${dimensionIdx}`;
    await this.emit({
      type: "agent-playground.dimension:integrating:started",
      missionId,
      userId,
      agentId: integratorAgentId,
      payload: {
        dimension: dimensionName,
        chapterCount: writtenChapters.length,
      },
    });
    const integrateRes = await this.runAndRelay(
      DimensionIntegratorAgent,
      {
        topic,
        dimension: dimensionName,
        language,
        chapters: writtenChapters,
        dimensionSummary: researcherOut.summary,
      },
      {
        missionId,
        userId,
        agentId: integratorAgentId,
        role: "integrator",
        envAdapter: billing,
      },
    );
    await this.tickCostDelta(
      missionId,
      userId,
      "researchers",
      pool,
      extractTokenSpend(integrateRes.events),
    );

    let abstract: string | undefined;
    let keyFindings: string[] | undefined;
    let fullMarkdown: string | undefined;
    if (integrateRes.state === "completed" && integrateRes.output) {
      const integrated = integrateRes.output as {
        abstract: string;
        keyFindings: string[];
        fullMarkdown: string;
        totalWordCount: number;
      };
      abstract = integrated.abstract;
      keyFindings = integrated.keyFindings;
      fullMarkdown = integrated.fullMarkdown;
      await this.emit({
        type: "agent-playground.dimension:integrating:completed",
        missionId,
        userId,
        agentId: integratorAgentId,
        payload: {
          dimension: dimensionName,
          totalWordCount: integrated.totalWordCount,
          chapterCount: writtenChapters.length,
        },
      });
    }

    // ── 4. 5-axis grade ──
    const gradeAgentId = `quality-judge#${dimensionIdx}`;
    let grade:
      | {
          overall: number;
          grade: string;
          axes: Record<string, { score: number; comment: string }>;
          summary: string;
        }
      | undefined;
    if (fullMarkdown && abstract) {
      const sources = researcherOut.findings.map((f) => ({
        url: f.source,
      }));
      // ★ Phase Lead-Services: 通过 ReviewerService.judgeDimension()
      const gradeRes = await this.reviewerService.judgeDimension(
        {
          topic,
          dimension: dimensionName,
          language,
          abstract,
          fullMarkdown,
          totalWordCount: writtenChapters.reduce((s, c) => s + c.wordCount, 0),
          sources,
        },
        {
          missionId,
          userId,
          agentId: gradeAgentId,
          role: "quality-judge",
          envAdapter: billing,
          budgetMultiplier,
        },
      );
      await this.tickCostDelta(
        missionId,
        userId,
        "researchers",
        pool,
        extractTokenSpend(gradeRes.events),
      );
      if (gradeRes.state === "completed" && gradeRes.output) {
        const g = gradeRes.output as {
          overall: number;
          grade: string;
          axes: Record<string, { score: number; comment: string }>;
          summary: string;
        };
        grade = g;
        await this.emit({
          type: "agent-playground.dimension:graded",
          missionId,
          userId,
          agentId: gradeAgentId,
          payload: {
            dimension: dimensionName,
            overall: g.overall,
            grade: g.grade,
            axes: g.axes,
            summary: g.summary,
          },
        });
      }
    }

    return {
      ...researcherOut,
      chapters: writtenChapters,
      abstract,
      keyFindings,
      fullMarkdown,
      grade,
    };
  }
}
