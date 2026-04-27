/**
 * ResearchTeamOrchestrator
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
} from "../../../ai-engine/facade";
import { BillingContext } from "../../../ai-infra/credits/billing-context";
import { CreditsService } from "../../../ai-infra/credits/credits.service";
import { RuntimeEnvironmentService } from "../../../ai-engine/runtime/resource/runtime-environment.service";
import { LeaderAgent } from "../agents/leader/leader.agent";
import { LeaderService, SupervisedMission } from "./roles";
import { ResearcherAgent } from "../agents/researcher/researcher.agent";
import { ReconcilerAgent } from "../agents/reconciler/reconciler.agent";
import { ReportAssemblerService } from "./artifact/report-assembler.service";
import { MissionStateService } from "./mission/mission-state.service";
import { MissionAbortRegistry } from "./mission/mission-abort.registry";
import { AnalystAgent } from "../agents/analyst/analyst.agent";
import { SingleShotWriterAgent } from "../agents/writer/single-shot-writer.agent";
import { MissionOutlinePlannerAgent } from "../agents/writer/mission-outline-planner.agent";
import { DimensionOutlinePlannerAgent } from "../agents/writer/dimension-outline-planner.agent";
import { ChapterWriterAgent } from "../agents/writer/chapter-writer.agent";
import { ChapterReviewerAgent } from "../agents/writer/chapter-reviewer.agent";
import { DimensionIntegratorAgent } from "../agents/writer/dimension-integrator.agent";
// MissionReviewerAgent: 当前 mission 评审走 VerifierService（多 judge 投票），
// MissionReviewerAgent class 已声明但 orchestrator 暂未直接调用，保留为后续替换 path。
import { MissionCriticAgent } from "../agents/reviewer/mission-critic.agent";
import { DimensionQualityJudgeAgent } from "../agents/reviewer/dimension-quality-judge.agent";
import {
  type ResearchReport,
  resolveBudgetMultiplier,
  resolveMissionCredits,
  type RunMissionInput,
} from "../dto/run-mission.dto";
import { BillingRuntimeEnvAdapter } from "../adapters/billing-runtime-env.adapter";
import { MissionStore } from "./mission/mission-store.service";
import { HarnessFailureLearner } from "./failure-learning/harness-failure-learner.service";

/**
 * 维度元数据（Lead M0 plan 产出 / M1 redirect 追加都用这个 shape）。
 * 与 LeaderAgent 的 Dimension schema 同构，dispatch 重派 researcher 时传给 toolRecallHint。
 */
interface PlanDimensionLite {
  id: string;
  name: string;
  rationale: string;
  toolHint?: {
    categories: readonly string[];
    preferIds?: readonly string[];
  };
  dependsOn?: readonly string[];
}

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
  readonly reportArtifact?: import("../dto/report-artifact.dto").ReportArtifact;
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

/**
 * 从 RunResult.events + state 抽出"为什么失败"的可读消息。
 *
 *   1. 优先用最后一个 error 事件的 payload.message
 *   2. 否则用 terminated 事件的 reason / detail
 *   3. 否则用最后一个 observation.error
 *   4. 否则 outputSchema 校验失败 fallback 文字
 *   5. 仍没有 → 给一个 hint，让 UI 不再显示"未捕获明确的错误信息"
 */
/**
 * 抽取 RunResult.events 里最具体的 failure 快照，给 orchestrator 层做
 * 维度降级 / mission 失败决策时用。
 *
 * 策略：倒序扫描 error 事件，第一个带 failureCode 的就是 root cause。
 * 没有 failureCode 时回落到 terminated.reason / 最后 error.message。
 */
function extractAgentFailureDiagnostic(events: readonly IAgentEvent[]):
  | {
      failureCode?: string;
      message?: string;
      diagnostic?: Record<string, unknown>;
      recoveryHint?: Record<string, unknown>;
    }
  | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.type === "error") {
      const p = ev.payload as {
        message?: string;
        failureCode?: string;
        diagnostic?: Record<string, unknown>;
        recoveryHint?: Record<string, unknown>;
      } | null;
      if (p?.failureCode) {
        return {
          failureCode: p.failureCode,
          message: p.message,
          diagnostic: p.diagnostic,
          recoveryHint: p.recoveryHint,
        };
      }
    }
  }
  // 没有结构化 failureCode：从 terminated.reason 推一个粗略码
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.type === "terminated") {
      const p = ev.payload as { reason?: string } | null;
      if (p?.reason && p.reason !== "completed") {
        const code =
          p.reason === "budget"
            ? "LOOP_BUDGET_EXHAUSTED"
            : p.reason === "cancelled"
              ? "UNKNOWN"
              : p.reason === "empty_llm_response"
                ? "LOOP_EMPTY_RESPONSE_IMMEDIATE"
                : p.reason === "error"
                  ? "PROVIDER_API_ERROR"
                  : "UNKNOWN";
        return { failureCode: code };
      }
    }
  }
  return undefined;
}

function extractFailureMessage(
  events: readonly IAgentEvent[],
  state: string,
  hasOutput: boolean,
  /** 实际从 RunResult 拿到的运行统计，给 explainTerminatedReason 拼上下文 */
  runStats?: { iterations?: number; wallTimeMs?: number; tokensUsed?: number },
): string | undefined {
  if (state === "completed") return undefined;
  // 从事件流统计 token（terminated 事件本身不带 tokensUsed）
  const tokensUsed =
    runStats?.tokensUsed ??
    events.reduce((sum, ev) => {
      if (ev.type === "action_executed") {
        const p = ev.payload as { tokensUsed?: number } | null;
        if (p && typeof p.tokensUsed === "number") return sum + p.tokensUsed;
      }
      return sum;
    }, 0);
  // 扫 reflection 事件 —— Reflexion loop 会留下 score / critique，
  // 用来区分 reason="budget" 是「token 真耗尽」还是「verifier 反复未达门槛」
  const reflectionVerdicts: { score: number; critique?: string }[] = [];
  for (const ev of events) {
    if (ev.type === "reflection") {
      const p = ev.payload as {
        score?: number;
        verdicts?: { score?: number; critique?: string }[];
      } | null;
      if (typeof p?.score === "number") {
        reflectionVerdicts.push({ score: p.score });
      }
      if (Array.isArray(p?.verdicts)) {
        for (const v of p.verdicts) {
          if (typeof v.score === "number") {
            reflectionVerdicts.push({
              score: v.score,
              critique: v.critique,
            });
          }
        }
      }
    }
  }
  // 关键根因检测：所有 finalize observation 输出都为空 → LLM 持续返回空内容
  // （比 budget / verifier 误报更准确，需要先于 terminated reason 判定）
  const finalizeObs = events.filter((ev) => {
    if (ev.type !== "action_executed") return false;
    const p = ev.payload as {
      action?: { kind?: string };
      output?: unknown;
    } | null;
    return p?.action?.kind === "finalize";
  });
  const emptyFinalize = finalizeObs.filter((ev) => {
    const p = ev.payload as { output?: unknown } | null;
    const out = p?.output;
    return (
      out == null ||
      out === "" ||
      (typeof out === "string" && out.trim() === "")
    );
  });
  const llmReturnedEmpty =
    finalizeObs.length >= 2 && emptyFinalize.length === finalizeObs.length;
  // 抓 thought 事件的真实 modelId —— 让错误信息直接告诉用户问题模型
  let usedModelId: string | undefined;
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.type === "thinking") {
      const p = ev.payload as { modelId?: string } | null;
      if (p?.modelId) {
        usedModelId = p.modelId;
        break;
      }
    }
  }

  const ctx = {
    iterations: runStats?.iterations,
    wallTimeMs: runStats?.wallTimeMs,
    tokensUsed: tokensUsed > 0 ? tokensUsed : undefined,
    reflectionVerdicts,
    llmReturnedEmpty,
    emptyFinalizeCount: emptyFinalize.length,
    usedModelId,
  };
  // 倒序扫，错误信息通常在末尾
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.type === "error") {
      // ★ 优先读结构化 failureCode + diagnostic（新格式）；fallback 旧 message 字段
      const p = ev.payload as {
        message?: string;
        failureCode?: string;
        diagnostic?: Record<string, unknown>;
      } | null;
      if (p?.failureCode) {
        const diagSnippet = p.diagnostic
          ? ` [${Object.entries(p.diagnostic)
              .filter(
                ([k, v]) =>
                  v != null &&
                  [
                    "modelId",
                    "completionTokens",
                    "toolId",
                    "schemaError",
                  ].includes(k),
              )
              .map(
                ([k, v]) =>
                  `${k}=${typeof v === "string" ? v.slice(0, 80) : v}`,
              )
              .join(" ")}]`
          : "";
        return `[${p.failureCode}]${diagSnippet} ${p.message ?? ""}`.trim();
      }
      if (p?.message) return p.message;
    }
    if (ev.type === "action_executed") {
      const p = ev.payload as { error?: { message?: string } } | null;
      if (p?.error?.message) return `工具调用失败：${p.error.message}`;
    }
    if (ev.type === "terminated") {
      const p = ev.payload as {
        reason?: string;
        message?: string;
        detail?: string;
      } | null;
      if (p?.message) return p.message;
      if (p?.detail) return p.detail;
      if (p?.reason && p.reason !== "completed") {
        return explainTerminatedReason(p.reason, ctx);
      }
    }
  }
  if (state === "failed") {
    if (!hasOutput) {
      // 检查是否所有 observation 都是空 → LLM 持续返空，多半是 BYOK 模型配置问题
      const observations = events.filter((ev) => ev.type === "action_executed");
      const emptyObs = observations.filter((ev) => {
        const p = ev.payload as { output?: unknown } | null;
        const out = p?.output;
        return (
          out == null ||
          out === "" ||
          (typeof out === "object" &&
            Object.keys(out as Record<string, unknown>).length === 0)
        );
      });
      if (observations.length > 0 && emptyObs.length === observations.length) {
        return `LLM 持续返回空内容 (${observations.length} 次调用全部空响应) —— 多半是 BYOK 模型配置异常 (model id 不存在 / API 拒绝 / 输出被过滤)。请前往 设置 → 模型 检查当前选用的模型是否真实可用`;
      }
      return "Agent 未产出有效输出（可能是 LLM 返回空 / 超时 / 网络中断）";
    }
    return "outputSchema 校验失败 —— Agent 产出格式不符合预期 schema（详见原始执行轨迹中最后一个 finalize 事件的 input/output）";
  }
  if (state === "cancelled") return "Agent 被取消";
  return undefined;
}

/**
 * 把 Harness 干巴巴的终止 reason 转成给人看的失败原因（含上下文）。
 *
 * 关键判别：reason="budget" 在 Reflexion loop 里有歧义 ——
 *   - 如果 reflectionVerdicts 有低分记录 → 是 verifier 反复未达门槛（不是 token 问题）
 *   - 否则才是真的 maxTokens 触顶
 */
function explainTerminatedReason(
  reason: string,
  detail?: {
    tokensUsed?: number;
    iterations?: number;
    wallTimeMs?: number;
    reflectionVerdicts?: { score: number; critique?: string }[];
    /** 所有 finalize observation 都是空 → LLM 没在产出，不是 budget */
    llmReturnedEmpty?: boolean;
    emptyFinalizeCount?: number;
    /** 最近一次 LLM 真实使用的 model id（让用户立刻看到具体哪个模型出问题） */
    usedModelId?: string;
  } | null,
): string {
  const ctx: string[] = [];
  if (detail?.tokensUsed != null) ctx.push(`已用 ${detail.tokensUsed} tokens`);
  if (detail?.iterations != null) ctx.push(`已迭代 ${detail.iterations} 轮`);
  if (detail?.wallTimeMs != null)
    ctx.push(`耗时 ${(detail.wallTimeMs / 1000).toFixed(1)}s`);
  const ctxStr = ctx.length > 0 ? ` (${ctx.join(", ")})` : "";

  // Reflexion verdict 分析：判断 budget reason 是 verifier 还是 token
  const verdicts = detail?.reflectionVerdicts ?? [];
  const lastVerdict =
    verdicts.length > 0 ? verdicts[verdicts.length - 1] : null;
  const isVerifierExhaustion =
    verdicts.length > 0 && verdicts.every((v) => v.score < 70); // 默认 passThreshold=70

  switch (reason) {
    case "budget":
    case "budget_exhausted":
    case "token_limit":
      // 优先级 1: LLM 持续返空（最具体）
      if (detail?.llmReturnedEmpty) {
        return `LLM 持续返回空 finalize${ctxStr} —— ${detail.emptyFinalizeCount ?? "?"} 次调用全部 output="" 且立即 finalize。**根因极可能是 BYOK 模型配置错误**：当前使用的 model id 可能不存在 / API 拒绝 / 输出被过滤 / 模型不支持 ReAct JSON 协议。请前往 设置 → 模型 验证模型可用性，或换用主流模型 (gpt-4o / claude-3.5)`;
      }
      // 优先级 2: verifier 反复未通过门槛
      if (isVerifierExhaustion) {
        const lastCritique = lastVerdict?.critique
          ? ` 最后一次评分批注：「${lastVerdict.critique.slice(0, 200)}${
              lastVerdict.critique.length > 200 ? "…" : ""
            }」`
          : "";
        return `Reflexion 反复未通过质量门槛${ctxStr} —— ${verdicts.length} 轮评分均 <70 分（最后 ${lastVerdict?.score.toFixed(
          1,
        )} 分）。${lastCritique} 可调高 budget.maxIterations 给更多重写机会，或降低 passThreshold，或检查 verifier prompt 是否过严`;
      }
      // 优先级 3: 真 token 触顶
      return `Agent 预算耗尽${ctxStr} —— maxTokens 触顶。可在 @DefineAgent.budget.maxTokens 调高，或缩短输入 / 减少迭代`;
    case "empty_llm_response":
      // ReActLoop circuit breaker emit 的新 reason —— LLM 连续返空被熔断
      return `LLM 立即 finalize 空结果（${detail?.emptyFinalizeCount ?? "?"} 次）—— Harness 已熔断防止浪费 token。${
        detail?.usedModelId ? `当前 model: "${detail.usedModelId}"。` : ""
      }常见根因：(1) BYOK model id 在 provider 不存在 (2) reasoning model max_completion_tokens 不足让 CoT + visible output 同时装下 (3) prompt 让 LLM 完全无所适从。建议先在「设置→模型」确认 model id 真实可用`;
    case "iteration_limit":
    case "max_iterations":
      return `Agent 达到最大迭代次数${ctxStr} —— 通常是 LLM 反复尝试未收敛。可调高 maxIterations，或检查 prompt 是否引导歧义`;
    case "wall_time":
    case "wall_time_limit":
      return `Agent 超时${ctxStr} —— maxWallTimeMs 触顶。可调高 budget.maxWallTimeMs 或检查工具调用是否卡住`;
    case "cancelled":
      return `Agent 被取消${ctxStr}`;
    case "error":
      return `Agent 内部错误${ctxStr} —— 详见 trace 末尾的 error / observation.error 字段`;
    case "context_too_long":
      return `Agent 上下文超长${ctxStr} —— 已触发 ContextCompactor 但仍溢出。可缩短 systemPrompt 或减少历史轮数`;
    default:
      return `Agent 异常终止：${reason}${ctxStr}`;
  }
}

function extractTokenSpend(events: readonly IAgentEvent[]): number {
  let total = 0;
  let lastBudgetTokens = 0;
  for (const ev of events) {
    if (ev.type === "action_executed") {
      const p = ev.payload as { tokensUsed?: number } | null;
      if (p && typeof p.tokensUsed === "number") total += p.tokensUsed;
    } else if (ev.type === "budget_warning") {
      const p = ev.payload as { tokensUsed?: number } | null;
      if (p && typeof p.tokensUsed === "number") {
        lastBudgetTokens = Math.max(lastBudgetTokens, p.tokensUsed);
      }
    }
  }
  return Math.max(total, lastBudgetTokens);
}

/**
 * 粗略 USD 估算 —— demo 用，避免 Cost meter 永远 $0。
 * 真实账单走 CreditsService.consumeCredits（按模型分级算积分）。
 * Sonnet/4o 量级混合估算：~$3 / 1M tokens。
 */
function estimateUsdFromTokens(tokens: number): number {
  return tokens * 0.000003;
}

@Injectable()
export class ResearchTeamOrchestrator {
  private readonly log = new Logger(ResearchTeamOrchestrator.name);

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
  ) {}

  /**
   * 给 LeaderService 用的 runFn —— 复用 orchestrator 的 runner +
   * 让 leader 调用同样走 BillingContext / event relay。
   */
  private buildLeaderRunFn(
    missionId: string,
    userId: string,
    billing: unknown,
  ): import("./roles/leader.service").LeaderRunFn {
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

  /**
   * Lead M1 dispatch：把 leader.assessResearchers() 的决策落到实际调度上。
   *
   * 处理范围（每条 perDimension action）:
   *   accept / accept-degraded → no-op，保留原 researcher 产出
   *   retry-with-critique      → 重派 ResearcherAgent，input 带 critique，覆盖原结果
   *   replace-spec             → 当前只注册了 ResearcherAgent，降级为带提示的 retry
   *   abort                    → 该 dim 标记空 findings + summary "(aborted by Lead)"
   * newDimensions[]            → 追加 dim 到 plan + 跑 ResearcherAgent，append 到结果
   *
   * 设计取舍：
   *   - retry/extend 不再走 per-dim chapter pipeline（避免 M1 后耗时翻倍）
   *   - 失败的 retry 不再二次自愈（self-heal 已在 researcher loop 内做过）
   *   - mutate researcherResults / plan.dimensions 而不是返回新数组（下游已持有引用）
   */
  private async dispatchLeadM1Actions(args: {
    missionId: string;
    userId: string;
    input: RunMissionInput;
    plan: { dimensions: PlanDimensionLite[] };
    researcherResults: {
      dimension: string;
      findings: unknown[];
      summary: string;
    }[];
    m1: {
      decision: "accept-all" | "patch" | "redirect" | "abort";
      perDimension: {
        dimensionId: string;
        action:
          | "accept"
          | "accept-degraded"
          | "retry-with-critique"
          | "replace-spec"
          | "abort";
        critique?: string;
        newAgentSpecId?: string;
      }[];
      newDimensions: PlanDimensionLite[];
    };
    billing: BillingRuntimeEnvAdapter;
    budgetMultiplier: number;
    pool: MissionBudgetPool;
  }): Promise<{
    retried: number;
    aborted: number;
    appended: number;
    skipped: number;
  }> {
    const {
      missionId,
      userId,
      input,
      plan,
      researcherResults,
      m1,
      billing,
      budgetMultiplier,
      pool,
    } = args;

    let retried = 0;
    let aborted = 0;
    let appended = 0;
    let skipped = 0;

    // ── per-dim actions ──
    for (const action of m1.perDimension) {
      const idx = plan.dimensions.findIndex((d) => d.id === action.dimensionId);
      if (idx < 0) {
        this.log.warn(
          `[${missionId}] M1 dispatch: dim id "${action.dimensionId}" not in plan, skipped`,
        );
        skipped++;
        continue;
      }
      const dim = plan.dimensions[idx];
      if (action.action === "accept" || action.action === "accept-degraded") {
        continue;
      }
      if (action.action === "abort") {
        researcherResults[idx] = {
          dimension: dim.name,
          findings: [],
          summary: `(aborted by Lead M1: ${action.critique?.slice(0, 200) ?? "abandoned"})`,
        };
        aborted++;
        await this.emit({
          type: "agent-playground.dimension:retrying",
          missionId,
          userId,
          agentId: `researcher#${idx}`,
          payload: {
            dimension: dim.name,
            reason: "leader-m1-abort",
            critique: action.critique,
          },
        }).catch(() => {});
        continue;
      }
      // retry-with-critique / replace-spec → 都走带 critique 的 researcher 重派
      const critique =
        action.action === "replace-spec"
          ? `[Lead M1 要求换 spec → 当前只注册了 ResearcherAgent，请用更激进的搜索策略] ${action.critique ?? ""} ${action.newAgentSpecId ? `(原意换为 ${action.newAgentSpecId})` : ""}`.trim()
          : (action.critique ??
            "Lead 在 M1 要求重做该维度，请提升覆盖率与来源质量");

      await this.emit({
        type: "agent-playground.dimension:retrying",
        missionId,
        userId,
        agentId: `researcher#${idx}`,
        payload: {
          dimension: dim.name,
          reason:
            action.action === "replace-spec"
              ? "leader-m1-replace"
              : "leader-m1-retry",
          critique,
          bumpedBudgetMultiplier: budgetMultiplier * 1.3,
        },
      }).catch(() => {});

      const newOut = await this.runResearcherForLeadDispatch({
        missionId,
        userId,
        input,
        dim,
        idx,
        billing,
        budgetMultiplier: budgetMultiplier * 1.3,
        pool,
        critique,
        retryLabel: `lead-m1-${action.action === "replace-spec" ? "replace" : "retry"}`,
      });
      if (newOut) {
        researcherResults[idx] = newOut;
        retried++;
      } else {
        skipped++;
      }
    }

    // ── newDimensions[] (redirect) ──
    for (const newDim of m1.newDimensions) {
      // 确保 id 不冲突
      if (plan.dimensions.some((d) => d.id === newDim.id)) {
        this.log.warn(
          `[${missionId}] M1 dispatch: newDimension id "${newDim.id}" conflicts with existing dim, skipped`,
        );
        skipped++;
        continue;
      }
      plan.dimensions.push(newDim);
      const idx = plan.dimensions.length - 1;
      await this.emit({
        type: "agent-playground.dimension:retrying",
        missionId,
        userId,
        agentId: `researcher#${idx}`,
        payload: {
          dimension: newDim.name,
          reason: "leader-m1-extend",
          rationale: newDim.rationale,
        },
      }).catch(() => {});
      const out = await this.runResearcherForLeadDispatch({
        missionId,
        userId,
        input,
        dim: newDim,
        idx,
        billing,
        budgetMultiplier,
        pool,
        critique: `Lead 在 M1 追加了这个维度（rationale: ${newDim.rationale.slice(0, 150)}）`,
        retryLabel: "lead-m1-extend",
      });
      researcherResults.push(
        out ?? {
          dimension: newDim.name,
          findings: [],
          summary: "(failed: lead-m1-extend dispatch produced no output)",
        },
      );
      if (out) appended++;
      else skipped++;
    }

    return { retried, aborted, appended, skipped };
  }

  /**
   * 单 dim 的 ResearcherAgent 重派（M1 dispatch 用）。
   *
   * 与主 dispatch 路径的区别：
   *   - 不跑 per-dim chapter pipeline（M1 已经在 reconciler 之前，时间敏感）
   *   - 不做二次 self-heal（researcher 内层失败就接受 degraded）
   *   - 不再 lookup 跨 mission failure pattern（原 dispatch 已查过）
   *   - 失败时返回 null，由调用方决定占位
   */
  private async runResearcherForLeadDispatch(args: {
    missionId: string;
    userId: string;
    input: RunMissionInput;
    dim: PlanDimensionLite;
    idx: number;
    billing: BillingRuntimeEnvAdapter;
    budgetMultiplier: number;
    pool: MissionBudgetPool;
    critique: string;
    retryLabel: string;
  }): Promise<{
    dimension: string;
    findings: { claim: string; evidence: string; source: string }[];
    summary: string;
  } | null> {
    const {
      missionId,
      userId,
      input,
      dim,
      idx,
      billing,
      budgetMultiplier,
      pool,
      critique,
      retryLabel,
    } = args;
    const agentId = `researcher#${idx}.${retryLabel}`;
    await this.lifecycle(missionId, userId, agentId, "researcher", "started", {
      dimension: dim.name,
      retryLabel,
    });
    const r = await this.runAndRelay(
      ResearcherAgent,
      {
        topic: input.topic,
        dimension: dim.name,
        language: input.language,
        critique,
      },
      {
        missionId,
        userId,
        agentId,
        role: "researcher",
        envAdapter: billing,
        budgetMultiplier,
        toolRecallHint: dim.toolHint
          ? {
              categories: dim.toolHint.categories,
              preferIds: dim.toolHint.preferIds,
            }
          : undefined,
      },
    );
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
        retryLabel,
        error: extractFailureMessage(r.events, r.state, !!r.output, {
          iterations: r.iterations,
          wallTimeMs: r.wallTimeMs,
        }),
      },
    );
    if (r.state !== "completed" || !r.output) return null;
    const out = r.output as {
      dimension: string;
      findings: { claim: string; evidence: string; source: string }[];
      summary: string;
    };
    return out;
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
          // 持久化 completed 状态 + 完整结果（含 dimensions / themeSummary / verdicts）
          const snap = pool.snapshot();
          // P0-5: 优先存 ReportArtifact v2，fallback 旧 ResearchReport v1
          const v2Title = result.reportArtifact?.metadata?.topic;
          const v2Summary =
            result.reportArtifact?.quickView?.executiveSummary?.markdown;
          const reportPayload = result.reportArtifact
            ? {
                ...result.reportArtifact,
                title: v2Title,
                summary: v2Summary,
              }
            : (result.report as unknown as {
                title?: string;
                summary?: string;
              });
          // ★ Phase Lead-3: Leader 签字结果同时写入 mission 顶层列
          //   - signed=false → markFailed 而不是 markCompleted（mission 标 quality-failed）
          //   - signed=true  → markCompleted + 持久化 leaderOverallScore/Verdict
          if (result.leaderSignOff && !result.leaderSignOff.signed) {
            await this.store.markFailed(missionId, {
              wallTimeMs: Date.now() - t0,
              errorMessage: `Lead 拒绝签字: ${result.leaderSignOff.refusalReason ?? "未达 qualityBar / successCriteria 不全回答"}`,
              tokensUsed: snap.poolTokensUsed,
              costUsd: snap.poolCostUsd,
              trajectoryStored: result.trajectoryStored,
              themeSummary: result.themeSummary,
              dimensions: result.dimensions,
              report: reportPayload as unknown as {
                title?: string;
                summary?: string;
              },
              reportArtifactVersion: result.reportArtifact ? 2 : 1,
              userProfile: result.userProfile ?? null,
              reconciliationReport: result.reconciliationReport ?? null,
              verdicts: result.verdicts,
              leaderJournal: undefined, // 已通过 appendLeaderJournal 增量写入
              leaderOverallScore: result.leaderSignOff.leaderOverallScore,
              leaderSigned: false,
              leaderVerdict: result.leaderSignOff.leaderVerdict,
            });
          } else {
            await this.store.markCompleted(missionId, {
              finalScore: result.reviewScore,
              tokensUsed: snap.poolTokensUsed,
              costUsd: snap.poolCostUsd,
              trajectoryStored: result.trajectoryStored,
              wallTimeMs: Date.now() - t0,
              themeSummary: result.themeSummary,
              dimensions: result.dimensions,
              report: reportPayload as unknown as {
                title?: string;
                summary?: string;
              },
              reportArtifactVersion: result.reportArtifact ? 2 : 1,
              userProfile: result.userProfile ?? null,
              reconciliationReport: result.reconciliationReport ?? null,
              verdicts: result.verdicts,
              leaderOverallScore: result.leaderSignOff?.leaderOverallScore,
              leaderSigned: result.leaderSignOff?.signed,
              leaderVerdict: result.leaderSignOff?.leaderVerdict,
            });
          }
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
        await this.emit({
          type: "agent-playground.mission:started",
          missionId,
          userId,
          payload: { input, workspaceId, startedAt: t0 },
        });

        // ★ Phase P3-8 / P4-7: 启动前预算预估（按 budgetMultiplier 等比缩放）
        const baseEstimate = 400_000; // deep+medium 基线
        const estimateBudget = Math.round(
          baseEstimate * Math.max(0.1, budgetMultiplier),
        );
        try {
          const estimate = await billing.estimateAffordable({
            maxTokens: estimateBudget,
          });
          if (!estimate.affordable) {
            const warningType =
              estimate.suggestion === "abort"
                ? "agent-playground.mission:budget-warning-hard"
                : "agent-playground.mission:budget-warning-soft";
            await this.emit({
              type: warningType,
              missionId,
              userId,
              payload: {
                shortfall: estimate.shortfall,
                suggestion: estimate.suggestion,
                estimatedCredits: estimate.estimatedCredits,
                currentBalance: estimate.currentBalance,
              },
            });
            if (estimate.suggestion === "abort") {
              throw new Error(
                `余额不足以启动 mission（短缺 ${estimate.shortfall} credits），请充值后重试`,
              );
            }
          }
        } catch (err) {
          this.log.warn(
            `[${missionId}] budget estimate failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
          );
        }

        // ── Stage 1: Leader 拆维度（M0 plan via LeaderService）──
        await this.emit({
          type: "agent-playground.stage:started",
          missionId,
          userId,
          payload: { stage: "leader" },
        });
        await this.lifecycle(missionId, userId, "leader", "leader", "started");

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
          this.buildLeaderRunFn(missionId, userId, billing),
        );

        // M0: plan() 内部自动 emit lifecycle / appendLeaderJournal
        let planResult;
        try {
          planResult = await leader.plan();
        } catch (err) {
          await this.lifecycle(
            missionId,
            userId,
            "leader",
            "leader",
            "failed",
            { error: err instanceof Error ? err.message : String(err) },
          );
          throw err;
        }
        await this.lifecycle(
          missionId,
          userId,
          "leader",
          "leader",
          "completed",
          {},
        );
        const plan = {
          themeSummary: planResult.themeSummary,
          dimensions: planResult.dimensions,
          goals: planResult.goals,
          initialRisks: planResult.initialRisks ?? [],
        };
        // 兼容老下游：plan.goals / plan.initialRisks 都存在
        {
          await this.emit({
            type: "agent-playground.leader:goals-set",
            missionId,
            userId,
            payload: {
              goals: plan.goals,
              initialRisks: plan.initialRisks ?? [],
            },
          }).catch(() => {});
        }
        await this.emit({
          type: "agent-playground.stage:completed",
          missionId,
          userId,
          payload: {
            stage: "leader",
            dimensions: plan.dimensions,
            themeSummary: plan.themeSummary,
          },
        });

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

        // ── ★ M1 ASSESS-RESEARCH (Lead-Replanner-Lite 必做 milestone) ──
        // Lead 全程在场最后一块拼图：researchers 完成后 Lead 评估每个 dim 产出，
        // 决定 accept-all / patch / redirect / abort。这次决策会被持久化到
        // leader_journal.decisions[]，M7 sign-off 时强制引用作为问责依据。
        try {
          const researcherOutcomes = plan.dimensions.map((d) => {
            const r = researcherResults.find((x) => x.dimension === d.name);
            const findings = r?.findings ?? [];
            const summary = r?.summary ?? "";
            const state: "completed" | "degraded" | "failed" =
              findings.length === 0
                ? "failed"
                : summary.startsWith("(failed") || summary.startsWith("(error")
                  ? "degraded"
                  : "completed";
            // 抽前 5 条 source URL 给 Lead 看，避免 prompt 爆炸
            const sources = findings
              .map((f) => f.source)
              .filter((s): s is string => typeof s === "string")
              .slice(0, 5);
            const failureCodeMatch = summary.match(/code=([A-Z_]+)/);
            return {
              dimensionId: d.id,
              dimensionName: d.name,
              state,
              findingsCount: findings.length,
              sources,
              summary: summary.slice(0, 300),
              failureCode: failureCodeMatch ? failureCodeMatch[1] : undefined,
            };
          });
          const m1 = await leader.assessResearchers(researcherOutcomes);
          await this.emit({
            type: "agent-playground.leader:decision",
            missionId,
            userId,
            payload: {
              phase: "assess-research",
              decision: m1.decision,
              rationale: m1.rationale,
              perDimension: m1.perDimension,
              newDimensionsCount: m1.newDimensions.length,
            },
          }).catch(() => {});

          if (m1.decision === "abort") {
            // Lead 主动叫停整 mission（多个 critical 失败无法挽救）
            throw new Error(
              `Lead aborted mission after assess-research: ${m1.rationale.slice(0, 200)}`,
            );
          }
          // ★ Phase Lead-E: M1 patch/redirect dispatch —— Lead 决策真正落到调度
          if (m1.decision === "patch" || m1.decision === "redirect") {
            const stats = await this.dispatchLeadM1Actions({
              missionId,
              userId,
              input,
              plan,
              researcherResults,
              m1,
              billing,
              budgetMultiplier,
              pool,
            });
            this.log.log(
              `[${missionId}] Leader M1 dispatch=${m1.decision}: retried=${stats.retried} aborted=${stats.aborted} appended=${stats.appended} skipped=${stats.skipped}`,
            );
            await this.emit({
              type: "agent-playground.leader:decision",
              missionId,
              userId,
              payload: {
                phase: "assess-research-dispatched",
                decision: m1.decision,
                stats,
              },
            }).catch(() => {});
          }
        } catch (err) {
          if (err instanceof Error && err.message.startsWith("Lead aborted")) {
            throw err; // abort 是 Lead 主动叫停，必须传播
          }
          this.log.warn(
            `[${missionId}] M1 assess-research failed (non-fatal, mission proceeds): ${err instanceof Error ? err.message : String(err)}`,
          );
        }

        // ── Stage B' (3.5): Reconciler 对账 ──
        // mission-pipeline-baseline.md §3.5 / mission-pipeline-reconciler.md
        // Researcher 并行产出后强制对账：事实表 / 冲突 / 重叠 / 空白 / 图候选池
        // 失败不阻塞 mission（degraded：reconciliationReport 为空，下游 Analyst 退化为旧路径）
        let reconciliationReport: {
          factTable: unknown[];
          conflicts: unknown[];
          overlaps: unknown[];
          gaps: unknown[];
          figureCandidates: unknown[];
          reconciliationReport: string;
        } | null = null;
        try {
          await this.emit({
            type: "agent-playground.stage:started",
            missionId,
            userId,
            payload: { stage: "reconciler" },
          });
          await this.lifecycle(
            missionId,
            userId,
            "reconciler",
            "reconciler",
            "started",
          );
          // ★ Phase P4-2: Reconciler 跨 mission 失败模式预查
          await this.preDisableKnownFailingModels(
            billing,
            "playground.reconciler",
            `${input.topic}::reconciler::${input.language}`,
          );
          const reconRes = await this.runAndRelay(
            ReconcilerAgent,
            {
              topic: input.topic,
              language: input.language,
              plan: {
                themeSummary: plan.themeSummary,
                dimensions: plan.dimensions.map((d) => ({
                  id: d.id,
                  name: d.name,
                  rationale: d.rationale,
                })),
              },
              researcherResults,
            },
            {
              missionId,
              userId,
              agentId: "reconciler",
              role: "reconciler",
              envAdapter: billing,
              budgetMultiplier,
            },
          );
          await this.tickCostDelta(
            missionId,
            userId,
            "reconciler",
            pool,
            extractTokenSpend(reconRes.events),
          );
          if (reconRes.state === "completed" && reconRes.output) {
            reconciliationReport =
              reconRes.output as unknown as typeof reconciliationReport;
            await this.emit({
              type: "agent-playground.reconciliation:completed",
              missionId,
              userId,
              payload: {
                factCount: reconciliationReport!.factTable.length,
                conflictCount: reconciliationReport!.conflicts.length,
                overlapCount: reconciliationReport!.overlaps.length,
                gapCount: reconciliationReport!.gaps.length,
                figureCandidateCount:
                  reconciliationReport!.figureCandidates.length,
              },
            });
          }
          await this.lifecycle(
            missionId,
            userId,
            "reconciler",
            "reconciler",
            reconRes.state === "completed" ? "completed" : "failed",
            {
              wallTimeMs: reconRes.wallTimeMs,
              iterations: reconRes.iterations,
            },
          );
          await this.emit({
            type: "agent-playground.stage:completed",
            missionId,
            userId,
            payload: { stage: "reconciler", state: reconRes.state },
          });
        } catch (err) {
          // 对账失败不阻塞 mission：emit warning，下游 Analyst 退化路径
          const msg = err instanceof Error ? err.message : String(err);
          this.log.warn(
            `[${missionId}] reconciler stage failed (non-fatal): ${msg}`,
          );
          await this.emit({
            type: "agent-playground.dimension:degraded",
            missionId,
            userId,
            agentId: "reconciler",
            payload: {
              stage: "reconciler",
              failureCode: "RECONCILER_FAILED",
              innerMessage: msg,
            },
          }).catch(() => {});
        }

        // ── Stage 3: Analyst 反思整合 ──
        await this.emit({
          type: "agent-playground.stage:started",
          missionId,
          userId,
          payload: { stage: "analyst" },
        });
        await this.lifecycle(
          missionId,
          userId,
          "analyst",
          "analyst",
          "started",
        );
        // ★ Phase P1-10: Summarize-on-Handoff（baseline §9.1）
        const analystResearcherInput = this.missionState.compressIfNeeded(
          researcherResults,
          "analyst.researcherResults",
        );
        // ★ Phase P3-2: 跨 mission 失败模式预查（同 researcher 路径）
        await this.preDisableKnownFailingModels(
          billing,
          "playground.analyst",
          `${input.topic}::analyst::${input.language}`,
        );
        const analystRes = await this.runAndRelay(
          AnalystAgent,
          {
            topic: input.topic,
            language: input.language,
            researcherResults: analystResearcherInput,
            // ★ Phase P1-5: 强制 Analyst 消费 Reconciler 产物
            reconciliationReport: reconciliationReport ?? undefined,
          },
          {
            missionId,
            userId,
            agentId: "analyst",
            role: "analyst",
            envAdapter: billing,
            budgetMultiplier,
            loopOverride: this.resolveLoopOverride(
              input.auditLayers,
              "analyst",
            ),
          },
        );
        await this.tickCostDelta(
          missionId,
          userId,
          "analyst",
          pool,
          extractTokenSpend(analystRes.events),
        );
        const analystFailMsg = extractFailureMessage(
          analystRes.events,
          analystRes.state,
          !!analystRes.output,
          {
            iterations: analystRes.iterations,
            wallTimeMs: analystRes.wallTimeMs,
          },
        );
        await this.lifecycle(
          missionId,
          userId,
          "analyst",
          "analyst",
          analystRes.state === "completed" ? "completed" : "failed",
          {
            wallTimeMs: analystRes.wallTimeMs,
            iterations: analystRes.iterations,
            error: analystFailMsg,
          },
        );
        if (analystRes.state !== "completed" || !analystRes.output) {
          throw new Error(
            analystFailMsg ?? `Analyst stage failed: ${analystRes.state}`,
          );
        }
        const analyst = analystRes.output as {
          insights: {
            headline: string;
            narrative: string;
            supportingDimensions: string[];
            confidence: number;
          }[];
          themeSummary: string;
          contradictions?: {
            claim: string;
            conflictingSources: string[];
            resolution: string;
          }[];
        };
        await this.emit({
          type: "agent-playground.stage:completed",
          missionId,
          userId,
          payload: { stage: "analyst", insightsCount: analyst.insights.length },
        });

        // ★ Phase P4-1: 在 thorough+ 档位下，先跑 OutlinePlanner W1 给 Writer 提示
        let outlinePlanResult: {
          chapterOutlines: {
            sectionId: string;
            heading: string;
            thesis: string;
          }[];
          targetWordsPerChapter: Record<string, number>;
          factAllocation: Record<string, string[]>;
          figurePlan: Record<string, string[]>;
        } | null = null;
        if (
          input.auditLayers === "thorough" ||
          input.auditLayers === "paranoid"
        ) {
          try {
            const outlineRes = await this.runAndRelay(
              MissionOutlinePlannerAgent,
              {
                topic: input.topic,
                language: input.language,
                audienceProfile: input.audienceProfile,
                styleProfile: input.styleProfile,
                lengthProfile: input.lengthProfile,
                withFigures: input.withFigures,
                plan: {
                  themeSummary: plan.themeSummary,
                  dimensions: plan.dimensions.map((d) => ({
                    id: d.id,
                    name: d.name,
                    rationale: d.rationale,
                  })),
                },
                factTable:
                  (
                    reconciliationReport as unknown as {
                      factTable?: {
                        id: string;
                        entity: string;
                        attribute: string;
                        value: string;
                      }[];
                    } | null
                  )?.factTable ?? [],
                figureCandidates: [],
              },
              {
                missionId,
                userId,
                agentId: "outline-planner",
                role: "outline-planner",
                envAdapter: billing,
                budgetMultiplier,
              },
            );
            await this.tickCostDelta(
              missionId,
              userId,
              "writer",
              pool,
              extractTokenSpend(outlineRes.events),
            );
            if (outlineRes.state === "completed" && outlineRes.output) {
              outlinePlanResult =
                outlineRes.output as unknown as typeof outlinePlanResult;
              const chapterOutlines =
                (outlinePlanResult as { chapterOutlines?: unknown[] } | null)
                  ?.chapterOutlines ?? [];
              await this.emit({
                type: "agent-playground.dimension:outline:planned",
                missionId,
                userId,
                payload: {
                  chapterCount: chapterOutlines.length,
                },
              });
            }
          } catch (err) {
            this.log.warn(
              `[${missionId}] outline-planner failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
        // 标记使用避免 unused warning（Writer 当前不消费此 plan，未来 W2 会接入）
        void outlinePlanResult;

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
          | import("../dto/report-artifact.dto").ReportArtifact
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
            reconciliationReport: reconciliationReport ?? undefined,
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

        // ── Phase P1-4 / P37-1: L4 Critic
        // 启用条件：thorough+ OR (audience=executive AND auditLayers≠minimal)
        const enableCritic =
          input.auditLayers === "thorough" ||
          input.auditLayers === "paranoid" ||
          (input.audienceProfile === "executive" &&
            input.auditLayers !== "minimal");
        if (enableCritic && reportArtifact) {
          try {
            // Phase P16-5: Critic 也接 FailureLearner
            await this.preDisableKnownFailingModels(
              billing,
              "playground.critic",
              `${input.topic}::critic::${input.language}`,
            );
            const criticRes = await this.runAndRelay(
              MissionCriticAgent,
              {
                topic: input.topic,
                language: input.language,
                audienceProfile: input.audienceProfile,
                styleProfile: input.styleProfile,
                lengthProfile: input.lengthProfile,
                artifactSummary: {
                  title: reportArtifact.metadata.topic,
                  // Phase P32-1: executiveSummary 太长时截断（1500 chars 够 critic 评估）
                  executiveSummary:
                    reportArtifact.quickView.executiveSummary.markdown.slice(
                      0,
                      1500,
                    ),
                  sectionCount: reportArtifact.sections.length,
                  sectionTitles: reportArtifact.sections.map((s) => s.title),
                  citationCount: reportArtifact.citations.length,
                  factCount: reportArtifact.factTable.length,
                  figureCount: reportArtifact.figures.length,
                  overallQuality: reportArtifact.quality.overall,
                  qualityDimensions: reportArtifact.quality.dimensions,
                },
                upstreamReviewerVerdict:
                  verifierVerdicts.length > 0
                    ? {
                        score: reviewScore,
                        critique: (verifierVerdicts[0] as { critique?: string })
                          ?.critique,
                      }
                    : undefined,
              } as Parameters<typeof this.runner.run>[1],
              {
                missionId,
                userId,
                agentId: "critic",
                role: "critic",
                envAdapter: billing,
                budgetMultiplier,
              },
            );
            await this.tickCostDelta(
              missionId,
              userId,
              "reviewer",
              pool,
              extractTokenSpend(criticRes.events),
            );
            if (criticRes.state === "completed" && criticRes.output) {
              const criticOut = criticRes.output as {
                overallVerdict: "pass" | "concerns" | "fail";
                blindspots: string[];
                biasFlags: string[];
                suggestions: string[];
                rationale: string;
              };
              // ★ Phase P21-2: emit 独立 critic:verdict 事件给前端 trace
              await this.emit({
                type: "agent-playground.critic:verdict",
                missionId,
                userId,
                payload: {
                  verdict: criticOut.overallVerdict,
                  blindspotCount: criticOut.blindspots.length,
                  biasCount: criticOut.biasFlags.length,
                  suggestionCount: criticOut.suggestions.length,
                  rationale: criticOut.rationale,
                },
              }).catch(() => {});
              // 把 critic 输出写到 quality.warnings（不阻塞 mission）
              const criticMessages: { dimension: string; message: string }[] = [
                {
                  dimension: "l4-critic",
                  message: `[${criticOut.overallVerdict}] ${criticOut.rationale}`,
                },
                ...criticOut.blindspots.map((b) => ({
                  dimension: "l4-blindspot",
                  message: b,
                })),
                ...criticOut.biasFlags.map((b) => ({
                  dimension: "l4-bias",
                  message: b,
                })),
                ...criticOut.suggestions.map((s) => ({
                  dimension: "l4-suggestion",
                  message: s,
                })),
              ];
              reportArtifact.quality.warnings.push(...criticMessages);
              reportArtifact.quality.qualityTrace.push({
                stage: "critic",
                check: "l4-meta-review",
                passed: criticOut.overallVerdict === "pass",
                timestamp: Date.now(),
              });
              // fail verdict → 降低 overall + novelty + factualConsistency
              if (criticOut.overallVerdict === "fail") {
                reportArtifact.quality.hardGateViolations.push({
                  dimension: "l4-critic",
                  severity: "warning",
                  message: `L4 critic 给出 fail 判定（${criticOut.rationale.slice(0, 100)}）`,
                });
                reportArtifact.quality.overall = Math.max(
                  0,
                  Math.round(reportArtifact.quality.overall * 0.7),
                );
                reportArtifact.quality.dimensions.novelty = Math.max(
                  0,
                  Math.round(reportArtifact.quality.dimensions.novelty * 0.6),
                );
                if (criticOut.biasFlags.length > 0) {
                  reportArtifact.quality.dimensions.styleConformance = Math.max(
                    0,
                    Math.round(
                      reportArtifact.quality.dimensions.styleConformance * 0.7,
                    ),
                  );
                }
              } else if (criticOut.overallVerdict === "concerns") {
                reportArtifact.quality.overall = Math.max(
                  0,
                  Math.round(reportArtifact.quality.overall * 0.9),
                );
                reportArtifact.quality.dimensions.novelty = Math.max(
                  0,
                  Math.round(reportArtifact.quality.dimensions.novelty * 0.85),
                );
              }
            }
          } catch (err) {
            this.log.warn(
              `[${missionId}] L4 critic failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }

        // ★ Phase Lead-Final: M6 SYNTHESIS + M7 SIGN-OFF（统一通过 LeaderService）
        //
        // LeaderAgent 在这两个 milestone 看到自己 M0 的 goals 和 M1 的过程决策，
        // 最后在 M7 写 accountabilityNote 时被业务规则强制引用历史决策做问责。
        let leaderForeword:
          | NonNullable<typeof reportArtifact>["metadata"]["leaderForeword"]
          | undefined;
        let leaderSignOff:
          | {
              leaderOverallScore: number;
              leaderVerdict: "excellent" | "good" | "acceptable" | "failed";
              accountabilityNote: string;
              signed: boolean;
              refusalReason?: string;
            }
          | undefined;
        if (reportArtifact) {
          // ── 准备 stage outcome 摘要 ──
          const dimStateOf = (d: {
            name: string;
          }): "completed" | "degraded" | "failed" => {
            const r = researcherResults.find((x) => x.dimension === d.name);
            const findings = (r as { findings?: unknown[] })?.findings ?? [];
            if (findings.length === 0) return "failed";
            const summary = (r as { summary?: string })?.summary ?? "";
            return summary.startsWith("(failed") ? "degraded" : "completed";
          };
          const dimensionStates = plan.dimensions.map((d) => ({
            name: d.name,
            state: dimStateOf(d),
          }));
          const reconStats = reconciliationReport
            ? {
                factCount:
                  (reconciliationReport as { factTable?: unknown[] }).factTable
                    ?.length ?? 0,
                conflictCount:
                  (reconciliationReport as { conflicts?: unknown[] }).conflicts
                    ?.length ?? 0,
                criticalGaps: (
                  (
                    reconciliationReport as {
                      gaps?: {
                        severity?: string;
                        expectedAspects?: string[];
                      }[];
                    }
                  ).gaps ?? []
                )
                  .filter((g) => g.severity === "critical")
                  .map((g) => (g.expectedAspects ?? []).join(", "))
                  .filter(Boolean),
              }
            : undefined;
          const reviewerAvg =
            verifierVerdicts.length > 0
              ? Math.round(
                  (verifierVerdicts as { score?: number }[]).reduce(
                    (sum: number, v) => sum + (v.score ?? 0),
                    0,
                  ) / verifierVerdicts.length,
                )
              : undefined;
          const criticWarnings = reportArtifact.quality.warnings.filter((w) =>
            w.dimension?.startsWith("l4-"),
          );
          const criticBlindspots = criticWarnings
            .filter((w) => w.dimension === "l4-blindspot")
            .map((w) => w.message);
          const criticBiases = criticWarnings
            .filter((w) => w.dimension === "l4-bias")
            .map((w) => w.message);
          const criticVerdictRaw = criticWarnings.find(
            (w) => w.dimension === "l4-critic",
          )?.message;
          const criticVerdict = criticVerdictRaw?.startsWith("[fail]")
            ? "fail"
            : criticVerdictRaw?.startsWith("[concerns]")
              ? "concerns"
              : criticVerdictRaw?.startsWith("[pass]")
                ? "pass"
                : undefined;

          // ── M6: leader.writeForeword() ──
          try {
            leaderForeword = await leader.writeForeword({
              researcherStates: dimensionStates,
              reconciliation: reconStats,
              writerSections: reportArtifact.sections.map((s) => s.title),
              qualitySnapshot: {
                sourceCount: reportArtifact.citations.length,
                coverageScore: reportArtifact.quality.dimensions.coverage,
                overall: reportArtifact.quality.overall,
                finalVerdict: reportArtifact.quality.finalVerdict ?? "?",
                reviewerAvgScore: reviewerAvg,
                criticVerdict,
                criticBlindspots,
                criticBiases,
              },
            });
            reportArtifact.metadata.leaderForeword = leaderForeword;
            await this.emit({
              type: "agent-playground.leader:foreword",
              missionId,
              userId,
              payload: leaderForeword,
            }).catch(() => {});
          } catch (err) {
            this.log.warn(
              `[${missionId}] M6 foreword failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
            );
          }

          // ── M7: leader.signOff() —— 仅在 M6 成功时跑 ──
          if (leaderForeword) {
            try {
              leaderSignOff = await leader.signOff(
                {
                  sourceCount: reportArtifact.citations.length,
                  coverageScore: reportArtifact.quality.dimensions.coverage,
                  overall: reportArtifact.quality.overall,
                  finalVerdict: reportArtifact.quality.finalVerdict ?? "?",
                  wordCount: reportArtifact.metadata.wordCount,
                  reviewerAvgScore: reviewerAvg,
                  criticVerdict,
                },
                dimensionStates,
              );
              await this.emit({
                type: "agent-playground.leader:signed",
                missionId,
                userId,
                payload: leaderSignOff,
              }).catch(() => {});
            } catch (err) {
              this.log.warn(
                `[${missionId}] M7 sign-off failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          }
        }

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
    const outlineRes = await this.runAndRelay(
      DimensionOutlinePlannerAgent,
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
      const gradeRes = await this.runAndRelay(
        DimensionQualityJudgeAgent,
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
