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
import { LeaderAgent } from "../agents/leader.agent";
import { ResearcherAgent } from "../agents/researcher.agent";
import { DimensionOutlineAgent } from "../agents/dimension-outline.agent";
import { ChapterWriterAgent } from "../agents/chapter-writer.agent";
import { ChapterReviewerAgent } from "../agents/chapter-reviewer.agent";
import { DimensionIntegratorAgent } from "../agents/dimension-integrator.agent";
import { DimensionQualityJudgeAgent } from "../agents/dimension-quality-judge.agent";
import { AnalystAgent } from "../agents/analyst.agent";
import { WriterAgent } from "../agents/writer.agent";
import {
  type ResearchReport,
  resolveBudgetMultiplier,
  resolveMissionCredits,
  type RunMissionInput,
} from "../dto/run-mission.dto";
import { BillingRuntimeEnvAdapter } from "../adapters/billing-runtime-env.adapter";
import { MissionStore } from "./mission-store.service";
import { HarnessFailureLearner } from "./harness-failure-learner.service";

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
  ) {}

  async runMission(
    missionId: string,
    input: RunMissionInput,
    userId: string,
    workspaceId?: string,
  ): Promise<MissionResult> {
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
    await this.store.create({
      id: missionId,
      userId,
      workspaceId,
      topic: input.topic,
      depth: input.depth,
      language: input.language,
      maxCredits: effectiveMaxCredits,
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
          await this.store.markCompleted(missionId, {
            finalScore: result.reviewScore,
            tokensUsed: snap.poolTokensUsed,
            costUsd: snap.poolCostUsd,
            trajectoryStored: result.trajectoryStored,
            wallTimeMs: Date.now() - t0,
            themeSummary: result.themeSummary,
            dimensions: result.dimensions,
            report: result.report as unknown as {
              title?: string;
              summary?: string;
            },
            verdicts: result.verdicts,
          });
          return result;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const snap = pool.snapshot();
          // 任何 uncaught 错误都要让 UI 知道 —— 否则 status 永远停在 "running"
          await this.emit({
            type: "agent-playground.mission:failed",
            missionId,
            userId,
            payload: {
              message,
              wallTimeMs: Date.now() - t0,
              tokensUsed: snap.poolTokensUsed,
              costUsd: snap.poolCostUsd,
            },
          }).catch(() => {});
          await this.store.markFailed(missionId, {
            errorMessage: message,
            tokensUsed: snap.poolTokensUsed,
            costUsd: snap.poolCostUsd,
            wallTimeMs: Date.now() - t0,
          });
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

        // ── Stage 1: Leader 拆维度 ──
        await this.emit({
          type: "agent-playground.stage:started",
          missionId,
          userId,
          payload: { stage: "leader" },
        });
        await this.lifecycle(missionId, userId, "leader", "leader", "started");
        const leaderRes = await this.runAndRelay(
          LeaderAgent,
          {
            topic: input.topic,
            depth: input.depth,
            language: input.language,
          },
          {
            missionId,
            userId,
            agentId: "leader",
            role: "leader",
            envAdapter: billing,
            budgetMultiplier,
          },
        );
        await this.tickCostDelta(
          missionId,
          userId,
          "leader",
          pool,
          extractTokenSpend(leaderRes.events),
        );
        await this.lifecycle(
          missionId,
          userId,
          "leader",
          "leader",
          leaderRes.state === "completed" ? "completed" : "failed",
          {
            wallTimeMs: leaderRes.wallTimeMs,
            iterations: leaderRes.iterations,
            error: extractFailureMessage(
              leaderRes.events,
              leaderRes.state,
              !!leaderRes.output,
              {
                iterations: leaderRes.iterations,
                wallTimeMs: leaderRes.wallTimeMs,
              },
            ),
          },
        );
        if (leaderRes.state !== "completed") {
          throw new Error(
            extractFailureMessage(
              leaderRes.events,
              leaderRes.state,
              !!leaderRes.output,
              {
                iterations: leaderRes.iterations,
                wallTimeMs: leaderRes.wallTimeMs,
              },
            ) ?? "Leader stage failed",
          );
        }
        const plan = leaderRes.output as {
          themeSummary: string;
          dimensions: { id: string; name: string; rationale: string }[];
        };
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
        const researcherResults = await this.runWithConcurrency(
          plan.dimensions,
          3,
          async (dim, idx) => {
            const agentId = `researcher#${idx}`;
            // 单个 researcher 失败不能拖垮整个 mission：
            // 任何抛错都收敛成 "(failed: ...)" 占位，让 Analyst 拿剩下的维度继续
            try {
              await this.lifecycle(
                missionId,
                userId,
                agentId,
                "researcher",
                "started",
                { dimension: dim.name },
              );
              const r = await this.runAndRelay(
                ResearcherAgent,
                {
                  topic: input.topic,
                  dimension: dim.name,
                  language: input.language,
                },
                {
                  missionId,
                  userId,
                  agentId,
                  role: "researcher",
                  envAdapter: billing,
                  budgetMultiplier,
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
              this.log.warn(
                `[researcher#${idx}] threw on dim "${dim.name}": ${message}`,
              );
              await this.lifecycle(
                missionId,
                userId,
                agentId,
                "researcher",
                "failed",
                { dimension: dim.name, error: message },
              ).catch(() => {});
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
                  innerFailureCode: "UNKNOWN",
                  innerMessage: message,
                  diagnostic: {
                    stage: "researcher",
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
        const analystRes = await this.runAndRelay(
          AnalystAgent,
          {
            topic: input.topic,
            language: input.language,
            researcherResults,
          },
          {
            missionId,
            userId,
            agentId: "analyst",
            role: "analyst",
            envAdapter: billing,
            budgetMultiplier,
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
          const writerRes = await this.runAndRelay(
            WriterAgent,
            {
              topic: input.topic,
              depth: input.depth,
              language: input.language,
              insights: analyst.insights,
              themeSummary: analyst.themeSummary,
              contradictions: analyst.contradictions,
            },
            {
              missionId,
              userId,
              agentId: writerAgentId,
              role: "writer",
              envAdapter: billing,
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

        return {
          missionId,
          report,
          reviewScore,
          costUsd: snap.poolCostUsd,
          trajectoryStored: indexed,
          themeSummary: plan.themeSummary,
          dimensions: plan.dimensions,
          verdicts: verifierVerdicts as MissionResult["verdicts"],
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
    return this.runner.run(Spec, input, {
      userId: ctx.userId,
      environment: ctx.envAdapter,
      budgetMultiplier: ctx.budgetMultiplier,
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
      DimensionOutlineAgent,
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
