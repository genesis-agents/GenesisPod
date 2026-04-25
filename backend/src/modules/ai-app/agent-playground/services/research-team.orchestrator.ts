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
import { AnalystAgent } from "../agents/analyst.agent";
import { WriterAgent } from "../agents/writer.agent";
import {
  type ResearchReport,
  type RunMissionInput,
} from "../dto/run-mission.dto";
import { BillingRuntimeEnvAdapter } from "../adapters/billing-runtime-env.adapter";

interface MissionResult {
  readonly missionId: string;
  readonly report: ResearchReport;
  readonly reviewScore: number;
  readonly costUsd: number;
  readonly trajectoryStored: number;
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

    return BillingContext.run(
      {
        userId,
        moduleType: "agent-playground",
        operationType: "research-team",
        referenceId: missionId,
      },
      async () => {
        const t0 = Date.now();
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
        const leaderRes = await this.runner.run(LeaderAgent, {
          topic: input.topic,
          depth: input.depth,
          language: input.language,
        });
        this.relayAgentEvents(leaderRes.events, {
          missionId,
          userId,
          agentId: "leader",
          role: "leader",
        });
        const leaderTokens = extractTokenSpend(leaderRes.events);
        pool.recordSpend(leaderTokens, 0, 0);
        await this.tickCost(missionId, userId, "leader", pool);
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
            await this.lifecycle(
              missionId,
              userId,
              agentId,
              "researcher",
              "started",
              { dimension: dim.name },
            );
            const r = await this.runner.run(ResearcherAgent, {
              topic: input.topic,
              dimension: dim.name,
              language: input.language,
            });
            this.relayAgentEvents(r.events, {
              missionId,
              userId,
              agentId,
              role: "researcher",
            });
            pool.recordSpend(extractTokenSpend(r.events), 0, 0);
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
            return r.output as {
              dimension: string;
              findings: { claim: string; evidence: string; source: string }[];
              summary: string;
            };
          },
        );
        await this.tickCost(missionId, userId, "researchers", pool);
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
        const analystRes = await this.runner.run(AnalystAgent, {
          topic: input.topic,
          language: input.language,
          researcherResults,
        });
        this.relayAgentEvents(analystRes.events, {
          missionId,
          userId,
          agentId: "analyst",
          role: "analyst",
        });
        pool.recordSpend(extractTokenSpend(analystRes.events), 0, 0);
        await this.tickCost(missionId, userId, "analyst", pool);
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
          const writerRes = await this.runner.run(WriterAgent, {
            topic: input.topic,
            language: input.language,
            insights: analyst.insights,
            themeSummary: analyst.themeSummary,
          });
          this.relayAgentEvents(writerRes.events, {
            missionId,
            userId,
            agentId: writerAgentId,
            role: "writer",
          });
          pool.recordSpend(extractTokenSpend(writerRes.events), 0, 0);
          await this.tickCost(missionId, userId, "writer", pool);
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
        const proxyAgent = this.makeProxyAgent(missionId, "research-team");
        const indexed = await this.indexer
          .indexAgentTrajectory(proxyAgent, [], {
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
        };
      },
    );
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

  private async tickCost(
    missionId: string,
    userId: string,
    stage: string,
    pool: MissionBudgetPool,
  ): Promise<void> {
    const snap = pool.snapshot();
    await this.emit({
      type: "agent-playground.cost:tick",
      missionId,
      userId,
      payload: {
        stage,
        tokensUsed: snap.poolTokensUsed,
        costUsd: snap.poolCostUsd,
      },
    });
  }

  /**
   * 把 RunResult.events 转成 demo 友好的 thought / action / observation 事件。
   * 注：post-stage relay，事件按 stage 批量到达，UI 仍按 timestamp 顺序渲染。
   */
  private relayAgentEvents(
    events: readonly IAgentEvent[],
    ctx: RelayCtx,
  ): void {
    for (const ev of events) {
      if (ev.type === "thinking") {
        const p = ev.payload as { text: string; tokenCount?: number };
        void this.emit({
          type: "agent-playground.agent:thought",
          missionId: ctx.missionId,
          userId: ctx.userId,
          agentId: ctx.agentId,
          payload: {
            agentId: ctx.agentId,
            role: ctx.role,
            text: p.text,
            tokenCount: p.tokenCount,
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
        void this.emit({
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
        void this.emit({
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
        void this.emit({
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
        void this.emit({
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
}
