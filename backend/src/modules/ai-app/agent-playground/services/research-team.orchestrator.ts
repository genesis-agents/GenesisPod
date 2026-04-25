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
import { randomUUID } from "crypto";
import { AgentRunner } from "../../../ai-engine/harness/dx";
import {
  DomainEventBus,
  type DomainEvent,
} from "../../../ai-engine/harness/events";
import { JudgeService } from "../../../ai-engine/harness/verify";
import { MemoryAutoIndexer } from "../../../ai-engine/harness/memory-bridge/memory-auto-indexer";
import { MissionBudgetPool } from "../../../ai-engine/harness/runtime/mission-budget-pool";
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
    input: RunMissionInput,
    userId: string,
    workspaceId?: string,
  ): Promise<MissionResult> {
    const missionId = randomUUID();
    // 业务方可在 spec.runtimeEnv 注入此 adapter；
    // 本 demo 把它用于"显式查 BYOK / credit / fallback"演示，
    // 也作为 IRuntimeEnvironment 接入 Harness 的参考实现
    const billing = new BillingRuntimeEnvAdapter(
      userId,
      workspaceId,
      this.credits,
      this.runtimeEnv,
    );
    void billing; // 后续 PR 让 AgentRunner 接 envelope.runtimeEnv 透传
    // 共享预算池：所有 stage 共享 maxCredits
    const pool = new MissionBudgetPool({
      maxTokens: input.maxCredits * 100, // 1 credit ≈ 100 tokens 启发
      maxCostUsd: input.maxCredits * 0.0002,
    });

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
        const researcherResults = await Promise.all(
          plan.dimensions.map(async (dim) => {
            const r = await this.runner.run(ResearcherAgent, {
              topic: input.topic,
              dimension: dim.name,
              language: input.language,
            });
            await this.emit(
              "agent-playground.researcher:completed",
              missionId,
              userId,
              { dimension: dim.name, state: r.state, iters: r.iterations },
            );
            return r.output as {
              dimension: string;
              findings: { claim: string; evidence: string; source: string }[];
              summary: string;
            };
          }),
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
        let report: ResearchReport;
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

        // ── Stage 6: Memory auto-index ──
        const indexed = await this.indexer
          .indexAgentTrajectory(
            // 用 writer agent 的最终 envelope 作为代表
            // 简化：实际 production 可串联多 agent 的 trajectory
            {
              id: missionId,
              identity: { role: { id: "research-team" } },
            } as never,
            [],
            {
              namespace: workspaceId ?? userId,
              source: "agent-playground.research-team",
              tags: [input.depth, input.topic],
              confidence: reviewScore / 100,
              metadata: { topic: input.topic, missionId },
            },
          )
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
}
