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
  type RunMissionInput,
} from "../dto/run-mission.dto";
import { BillingRuntimeEnvAdapter } from "../adapters/billing-runtime-env.adapter";
import { MissionStore } from "./mission-store.service";

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

    const pool = new MissionBudgetPool({
      maxTokens: input.maxCredits * 100,
      maxCostUsd: input.maxCredits * 0.0002,
    });

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
      maxCredits: input.maxCredits,
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
          { missionId, userId, agentId: "leader", role: "leader" },
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
          },
        );
        if (leaderRes.state !== "completed") {
          throw new Error("Leader stage failed");
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
                { missionId, userId, agentId, role: "researcher" },
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
                return {
                  dimension: dim.name,
                  findings: [],
                  summary: `(failed: ${r.state})`,
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
          { missionId, userId, agentId: "analyst", role: "analyst" },
        );
        await this.tickCostDelta(
          missionId,
          userId,
          "analyst",
          pool,
          extractTokenSpend(analystRes.events),
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
          },
        );
        if (analystRes.state !== "completed" || !analystRes.output) {
          throw new Error(`Analyst stage failed: ${analystRes.state}`);
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
            },
          );
          if (writerRes.state !== "completed" || !writerRes.output) {
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
            `Writer failed after ${MAX_WRITER_ATTEMPTS} attempts`,
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
   * 这是 "为什么要用它而不是 runner.run + relayAgentEvents 两步":
   *   - runner.run 第三个参数是 onEvent 回调，每产生一个事件立刻 await relay
   *   - 不再等 agent 跑完 batch relay，UI 能看到实时 thought/action/observation 流
   */
  private async runAndRelay<TSpec extends Parameters<AgentRunner["run"]>[0]>(
    Spec: TSpec,
    input: Parameters<AgentRunner["run"]>[1],
    ctx: RelayCtx,
  ): Promise<Awaited<ReturnType<AgentRunner["run"]>>> {
    return this.runner.run(Spec, input, async (ev) => {
      await this.relayAgentEvents([ev], ctx);
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
      { dimension: dimensionName, wallTimeMs: outlineRes.wallTimeMs },
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
