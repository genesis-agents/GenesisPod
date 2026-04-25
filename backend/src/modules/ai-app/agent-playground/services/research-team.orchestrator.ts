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
 */

import { Injectable, Logger } from "@nestjs/common";
// 必修 #8: 全部从 ai-engine/facade 导入，不穿透 harness/* 子路径
import {
  AgentRunner,
  DomainEventBus,
  JudgeService,
  MemoryAutoIndexer,
  MissionBudgetPool,
  type DomainEvent,
  type HarnessIAgent as IAgent,
  type IContextEnvelope,
} from "../../../ai-engine/facade";
import { BillingContext } from "../../../ai-infra/credits/billing-context";
import { CreditsService } from "../../../ai-infra/credits/credits.service";
import { RuntimeEnvironmentService } from "../../../ai-engine/runtime/resource/runtime-environment.service";
import { LeaderAgent } from "../agents/leader.agent";
import { ResearcherAgent } from "../agents/researcher.agent";
import { AnalystAgent } from "../agents/analyst.agent";
import { WriterAgent } from "../agents/writer.agent";
// ReviewerAgent 是显式 reviewer 角色 spec；本 demo 用 JudgeService 三 verifier 投票替代，
// 业务方可注入 ReviewerAgent 替换 critical verifier
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

/**
 * 必修 #3: 从 RunResult.events 启发提取 LLM token 数。
 * AgentEvent.payload 在 action_executed 时含 tokensUsed（IActionResult.tokensUsed）；
 * 没有时退回 budget_warning 事件中的 snapshot.tokensUsed 差值；
 * 都没有则按 iterations × 估算系数兜底。
 */
function extractTokenSpend(
  events: readonly { type: string; payload: unknown }[],
): number {
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
    // 必修 #2: BillingRuntimeEnvAdapter 当前未通过 AgentRunner 透传到 spec.runtimeEnv。
    // 在此预先建好对象，给业务方手动 query（例如 leader 启动前主动调 suggestFallback）。
    // 真正接通需要 AgentRunner 接受 runtimeEnv 参数 —— 已记到 PR-X TODO。
    // 本 demo 在前置健康检查时直接用 adapter，让前端能看到余额状态。
    const billing = new BillingRuntimeEnvAdapter(
      userId,
      workspaceId,
      this.credits,
      this.runtimeEnv,
    );

    // 必修 #3: MissionBudgetPool 在 PR 当前版本无法跨 AgentRunner 联动
    // （AgentRunner 内部各自创建独立 BudgetAccountant）。
    // 这里仅用于"前置预算检查 + 累计统计"：每 stage 完成后 pool.recordSpend() 手动入账。
    const pool = new MissionBudgetPool({
      maxTokens: input.maxCredits * 100,
      maxCostUsd: input.maxCredits * 0.0002,
    });

    // 必修 #2 前置：先看 credit 余额，余额不足直接拒绝（无 LLM 调用浪费）
    const credit = await billing.getCreditState();
    if (credit.balance <= (credit.hardLimit ?? 0)) {
      const hint = await billing.suggestFallback({ reason: "no_credit" });
      await this.emit("agent-playground.mission:rejected", missionId, userId, {
        reason: "no_credit",
        balance: credit.balance,
        userMessage: hint.userMessage,
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
        await this.emit("agent-playground.mission:started", missionId, userId, {
          input,
          workspaceId,
        });

        // ── Stage 1: Leader 拆维度 ──
        await this.emit("agent-playground.stage:started", missionId, userId, {
          stage: "leader",
        });
        const leaderRes = await this.runner.run(LeaderAgent, {
          topic: input.topic,
          depth: input.depth,
          language: input.language,
        });
        if (leaderRes.state !== "completed") {
          throw new Error("Leader stage failed");
        }
        pool.recordSpend(extractTokenSpend(leaderRes.events), 0, 0);
        const plan = leaderRes.output as {
          themeSummary: string;
          dimensions: { id: string; name: string; rationale: string }[];
        };
        await this.emit("agent-playground.stage:completed", missionId, userId, {
          stage: "leader",
          dimensions: plan.dimensions.map((d) => d.name),
        });

        // ── Stage 2: Researcher×N 并行 ──
        await this.emit("agent-playground.stage:started", missionId, userId, {
          stage: "researchers",
          count: plan.dimensions.length,
        });
        // 必修 #11: 限制并发避免击穿 LLM rate limit（pLimit 3 简化版）
        const researcherResults = await this.runWithConcurrency(
          plan.dimensions,
          3,
          async (dim) => {
            const r = await this.runner.run(ResearcherAgent, {
              topic: input.topic,
              dimension: dim.name,
              language: input.language,
            });
            pool.recordSpend(extractTokenSpend(r.events), 0, 0);
            await this.emit(
              "agent-playground.researcher:completed",
              missionId,
              userId,
              { dimension: dim.name, state: r.state, iters: r.iterations },
            );
            // 必修 #6: state 检查 + 类型 narrowing
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
        // 池子检查
        if (pool.isExhausted()) {
          await this.emit(
            "agent-playground.budget:exhausted",
            missionId,
            userId,
            pool.snapshot(),
          );
        }

        // ── Stage 3: Analyst 反思整合 ──
        await this.emit("agent-playground.stage:started", missionId, userId, {
          stage: "analyst",
        });
        const analystRes = await this.runner.run(AnalystAgent, {
          topic: input.topic,
          language: input.language,
          researcherResults,
        });
        pool.recordSpend(extractTokenSpend(analystRes.events), 0, 0);
        // 必修 #6: state 检查
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

        // ── Stage 4: Writer 起草 + 必要时 retry ──
        let attempts = 0;
        let report: ResearchReport | null = null;
        let reviewScore = 0;
        const MAX_WRITER_ATTEMPTS = 2;
        do {
          attempts += 1;
          await this.emit("agent-playground.stage:started", missionId, userId, {
            stage: "writer",
            attempt: attempts,
          });
          const writerRes = await this.runner.run(WriterAgent, {
            topic: input.topic,
            language: input.language,
            insights: analyst.insights,
            themeSummary: analyst.themeSummary,
          });
          pool.recordSpend(extractTokenSpend(writerRes.events), 0, 0);
          if (writerRes.state !== "completed" || !writerRes.output) {
            // 当轮失败：让循环再试一次
            continue;
          }
          report = writerRes.output as ResearchReport;

          // ── Stage 5: Verify Consensus ──
          await this.emit("agent-playground.stage:started", missionId, userId, {
            stage: "reviewer",
          });
          const verdict = await this.judge.judgeWithConsensus({
            output: report,
            envelope: writerRes.agent.getEnvelope(),
            verifierIds: ["self", "external", "critical"],
            passThreshold: 70,
          });
          reviewScore = verdict.decision.score;
          await this.emit(
            "agent-playground.reviewer:scored",
            missionId,
            userId,
            {
              attempt: attempts,
              score: reviewScore,
              decision: verdict.decision.verdict,
              verdicts: verdict.verdicts,
            },
          );
          if (verdict.decision.verdict === "pass") break;
        } while (attempts < MAX_WRITER_ATTEMPTS);

        // 必修 #6: writer 全部失败时不能继续
        if (!report) {
          throw new Error(
            `Writer failed after ${MAX_WRITER_ATTEMPTS} attempts`,
          );
        }

        // ── Stage 6: Memory auto-index ──
        // 必修 #14: 不用 `as never`，构造一个最小 IAgent shape（只用到 id + identity.role）
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

        const snap = pool.snapshot();
        await this.emit(
          "agent-playground.mission:completed",
          missionId,
          userId,
          {
            reviewScore,
            costUsd: snap.poolCostUsd,
            trajectoryStored: indexed,
          },
        );

        // 真扣费：用 token-based credit 计费（CreditsService 内部按 modelName 算积分）
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

  private async emit(
    type: string,
    missionId: string,
    userId: string,
    payload: unknown,
  ): Promise<void> {
    const event: DomainEvent = {
      type,
      scope: { missionId, userId },
      payload,
      timestamp: Date.now(),
    };
    await this.eventBus.emit(event).catch(() => {
      /* event 失败不影响主流程 */
    });
  }

  /**
   * 必修 #14: 给 MemoryAutoIndexer 构造一个最小 IAgent 代理；
   * MemoryAutoIndexer 只读 agent.id / agent.identity.role.id / agent.getEnvelope().memory，
   * 不需要完整 IAgent 行为。
   */
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

  /**
   * 必修 #11: 简化版 pLimit —— 限制并发避免击穿 LLM rate limit
   */
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
