/**
 * LeaderService —— Mission "领导"在工程层的承载体
 *
 * 设计决策 (mission-pipeline-baseline.md §Leader-as-Single-Responsibility):
 *   • 业务概念"领导（Leader）"在工程上是 SupervisedMission 实例
 *   • LeaderService 是 NestJS provider 工厂：每个 mission create() 一个 SupervisedMission
 *   • SupervisedMission 是 TypeScript 类，承载跨 milestone 的 missionContext
 *   • 全程委托同一个 LeaderAgent LLM spec 完成 4 个 milestone 的认知决策
 *   • 让 LeaderAgent 在 M7 签字时能引用自己 M0/M1/M6 的历史决策做真正的问责
 *
 * 用法:
 *   const leader = leaderService.create(missionId, userId, task, runFn);
 *   const plan = await leader.plan();
 *   // ...researchers 跑完...
 *   const m1 = await leader.assessResearchers(researcherOutcomes);
 *   // ...reconciler / analyst / writer / reviewer / critic 跑完...
 *   const foreword = await leader.writeForeword(stageOutcomes);
 *   const signOff = await leader.signOff(finalQuality, dimensionStates);
 *   if (!signOff.signed) { mission status = quality-failed }
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  LeaderAgent,
  type LeaderAssessResearchOutput,
  type LeaderForewordOutput,
  type LeaderPlanOutput,
  type LeaderSignoffOutput,
} from "../../agents/leader/leader.agent";
import { MissionStore } from "../mission/lifecycle/mission-store.service";
import {
  extractAgentFailureDiagnostic,
  extractFailureMessage,
} from "../mission/workflow/helpers/failure-extraction.util";

/**
 * Recoverable failure codes —— Leader 自愈重试时识别这些码做一次重跑（+50% budget），
 * 因为它们都是 LLM 一次性偶发问题（schema 不达标 / 截断 / 空响应），重试通常能过。
 */
const LEADER_RECOVERABLE = new Set([
  "RUNNER_OUTPUT_SCHEMA_MISMATCH",
  "RUNNER_WALL_TIME_EXCEEDED",
  "RUNNER_LOOP_LIMIT",
  "LOOP_EMPTY_RESPONSE_IMMEDIATE",
  "LOOP_REASONING_COT_EXHAUSTION",
  "PARSE_MALFORMED_JSON",
  "PARSE_MISSING_ACTION",
  "PARSE_UNKNOWN_ACTION_KIND",
  "PARSE_EMPTY_ACTIONS_ARRAY",
  "BUSINESS_RULE_VIOLATION",
]);

/**
 * 把 leader.* runFn result 转为带诊断的失败摘要（用于 throw 时 UI 能看清楚到底挂在哪）。
 * 优先级：events 里的 failureCode > extractFailureMessage 文本 > generic state。
 */
function describeLeaderFailure(
  phase: string,
  res: {
    state: "completed" | "failed" | "cancelled";
    output?: unknown;
    events?: readonly unknown[];
  },
): { code: string; message: string; recoverable: boolean } {
  const events = (res.events ?? []) as Parameters<
    typeof extractAgentFailureDiagnostic
  >[0];
  const diag = extractAgentFailureDiagnostic(events);
  const code = diag?.failureCode ?? "UNKNOWN";
  const friendly = extractFailureMessage(events, res.state, !!res.output);
  const message =
    friendly ??
    (res.state !== "completed"
      ? `agent state=${res.state}`
      : !res.output
        ? `agent 没有产出 output`
        : `agent 输出 phase 不是 ${phase}`);
  return {
    code,
    message,
    recoverable: LEADER_RECOVERABLE.has(code),
  };
}

// ── Public types ──

export interface LeaderTask {
  topic: string;
  depth: "quick" | "standard" | "deep";
  language: "zh-CN" | "en-US";
  userProfile?: unknown;
}

export interface LeaderResearcherOutcome {
  dimensionId: string;
  dimensionName: string;
  state: "completed" | "degraded" | "failed";
  findingsCount: number;
  sources: string[];
  summary: string;
  failureCode?: string;
}

export interface LeaderStageOutcomes {
  researcherStates: {
    name: string;
    state: "completed" | "degraded" | "failed";
  }[];
  reconciliation?: {
    factCount: number;
    conflictCount: number;
    criticalGaps: string[];
  };
  writerSections: string[];
  qualitySnapshot: {
    sourceCount: number;
    coverageScore: number;
    overall: number;
    finalVerdict: string;
    reviewerAvgScore?: number;
    criticVerdict?: "pass" | "concerns" | "fail";
    criticBlindspots: string[];
    criticBiases: string[];
    // ★ 沉淀消费 v3 (2026-04-29): 10 维客观评审注入
    objectiveScore?: number;
    objectiveGrade?: string;
    objectiveFeedback?: string;
  };
}

export interface LeaderFinalQuality {
  sourceCount: number;
  coverageScore: number;
  overall: number;
  finalVerdict: string;
  wordCount: number;
  reviewerAvgScore?: number;
  criticVerdict?: "pass" | "concerns" | "fail";
  // ★ 沉淀消费 v3 (2026-04-29): 10 维客观评审注入
  objectiveScore?: number;
  objectiveGrade?: string;
  objectiveFeedback?: string;
}

interface PastDecision {
  phase: "plan" | "assess-research" | "foreword";
  at: string;
  decision: string;
  rationale: string;
}

interface MissionContext {
  missionId: string;
  userId: string;
  task: LeaderTask;
  plan?: LeaderPlanOutput;
  decisions: PastDecision[];
  foreword?: LeaderForewordOutput & { generatedAt: string };
}

// ── Runner abstraction (parameter, avoid circular DI) ──

/**
 * 注入到 SupervisedMission 的 runner 抽象。
 * orchestrator 已经持有真实的 AgentRunner（来自 ai-engine/facade），
 * 直接传函数避免循环依赖 + 让 supervisor 跟 orchestrator 共享 envAdapter / billing context。
 */
export type LeaderRunFn = <TIn, TOut>(args: {
  spec: typeof LeaderAgent;
  input: TIn;
  agentId: string;
}) => Promise<{
  state: "completed" | "failed" | "cancelled";
  output?: TOut;
  events?: readonly unknown[];
}>;

// ── SupervisedMission：单 mission 的 Lead 容器 ──

export class SupervisedMission {
  private context: MissionContext;

  constructor(
    missionId: string,
    userId: string,
    task: LeaderTask,
    private readonly runFn: LeaderRunFn,
    private readonly store: MissionStore,
    private readonly log: Logger,
  ) {
    this.context = { missionId, userId, task, decisions: [] };
  }

  /** ★ M0: 拆分维度 + 声明目标（带 self-heal：第一次挂在可恢复码 → 自动重试一次） */
  async plan(): Promise<LeaderPlanOutput> {
    const planInput = {
      phase: "plan" as const,
      topic: this.context.task.topic,
      depth: this.context.task.depth,
      language: this.context.task.language,
      userProfile: this.context.task.userProfile,
    };

    let res = await this.runFn<unknown, LeaderPlanOutput>({
      spec: LeaderAgent,
      input: planInput,
      agentId: "leader",
    });

    // self-heal：第一次挂在可恢复码（schema 不达标 / 截断 / 空响应）→ 自动重试一次
    if (
      res.state !== "completed" ||
      !res.output ||
      res.output.phase !== "plan"
    ) {
      const fail0 = describeLeaderFailure("plan", res);
      if (fail0.recoverable) {
        this.log.warn(
          `[supervisor.plan ${this.context.missionId}] first attempt failed (${fail0.code}: ${fail0.message.slice(0, 200)}); retrying once`,
        );
        res = await this.runFn<unknown, LeaderPlanOutput>({
          spec: LeaderAgent,
          input: planInput,
          agentId: "leader.retry1",
        });
      }
    }

    if (
      res.state !== "completed" ||
      !res.output ||
      res.output.phase !== "plan"
    ) {
      const fail = describeLeaderFailure("plan", res);
      // 抛出带完整诊断信息的错误：上层 catch 会把它写到 mission.errorMessage / lifecycle.error，
      // 前端任务详情就能看到具体失败码和消息（不再是 generic "did not return valid plan"）
      throw new Error(`Leader.plan failed [${fail.code}]: ${fail.message}`);
    }
    this.context.plan = res.output;
    this.context.decisions.push({
      phase: "plan",
      at: new Date().toISOString(),
      decision: `plan:${res.output.dimensions.length}-dim`,
      rationale: res.output.themeSummary.slice(0, 200),
    });
    await this.store
      .appendLeaderJournal(this.context.missionId, {
        plan: {
          themeSummary: res.output.themeSummary,
          dimensionsCount: res.output.dimensions.length,
          dimensions: res.output.dimensions,
          goals: res.output.goals,
          initialRisks: res.output.initialRisks,
          createdAt: new Date().toISOString(),
        },
      })
      .catch((err) =>
        this.log.warn(
          `[supervisor.plan ${this.context.missionId}] journal write failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
    return res.output;
  }

  /** ★ M1: researchers 完成后做过程管理决策 */
  async assessResearchers(
    researcherOutcomes: LeaderResearcherOutcome[],
  ): Promise<LeaderAssessResearchOutput> {
    if (!this.context.plan) {
      throw new Error("must call plan() before assessResearchers()");
    }
    const res = await this.runFn<unknown, LeaderAssessResearchOutput>({
      spec: LeaderAgent,
      input: {
        phase: "assess-research",
        topic: this.context.task.topic,
        language: this.context.task.language,
        myPlan: {
          goals: this.context.plan.goals,
          dimensions: this.context.plan.dimensions,
        },
        researcherOutcomes,
      },
      agentId: "leader",
    });
    if (
      res.state !== "completed" ||
      !res.output ||
      res.output.phase !== "assess-research"
    ) {
      const fail = describeLeaderFailure("assess-research", res);
      throw new Error(
        `Leader.assessResearchers failed [${fail.code}]: ${fail.message}`,
      );
    }
    const decision: PastDecision = {
      phase: "assess-research",
      at: new Date().toISOString(),
      decision: `${res.output.decision}: ${res.output.perDimension.map((p) => `${p.dimensionId}=${p.action}`).join(", ")}`,
      rationale: res.output.rationale,
    };
    this.context.decisions.push(decision);
    await this.store
      .appendLeaderJournal(this.context.missionId, {
        decisions: [decision],
      })
      .catch((err) =>
        this.log.warn(
          `[supervisor.assess ${this.context.missionId}] journal write failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
    return res.output;
  }

  /** ★ M6: 写综合 foreword */
  async writeForeword(
    stageOutcomes: LeaderStageOutcomes,
  ): Promise<LeaderForewordOutput & { generatedAt: string }> {
    if (!this.context.plan) {
      throw new Error("must call plan() before writeForeword()");
    }
    const res = await this.runFn<unknown, LeaderForewordOutput>({
      spec: LeaderAgent,
      input: {
        phase: "foreword",
        topic: this.context.task.topic,
        language: this.context.task.language,
        myPlan: {
          goals: this.context.plan.goals,
          dimensions: this.context.plan.dimensions,
        },
        myDecisions: this.context.decisions.filter(
          (d) => d.phase !== "foreword",
        ),
        stageOutcomes,
      },
      agentId: "leader",
    });
    if (
      res.state !== "completed" ||
      !res.output ||
      res.output.phase !== "foreword"
    ) {
      const fail = describeLeaderFailure("foreword", res);
      throw new Error(
        `Leader.writeForeword failed [${fail.code}]: ${fail.message}`,
      );
    }
    const foreword = { ...res.output, generatedAt: new Date().toISOString() };
    this.context.foreword = foreword;
    this.context.decisions.push({
      phase: "foreword",
      at: foreword.generatedAt,
      decision: `foreword: yes=${
        res.output.whatWeAnswered.filter((a) => a.addressed === "yes").length
      } / partial=${
        res.output.whatWeAnswered.filter((a) => a.addressed === "partial")
          .length
      } / no=${
        res.output.whatWeAnswered.filter((a) => a.addressed === "no").length
      }`,
      rationale: res.output.howToRead.slice(0, 200),
    });
    await this.store
      .appendLeaderJournal(this.context.missionId, {
        foreword,
      })
      .catch((err) =>
        this.log.warn(
          `[supervisor.foreword ${this.context.missionId}] journal write failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
    return foreword;
  }

  /** ★ M7: 终极签字（必须引用过去自己决策做问责） */
  async signOff(
    finalQuality: LeaderFinalQuality,
    dimensionStates: {
      name: string;
      state: "completed" | "degraded" | "failed";
    }[],
  ): Promise<LeaderSignoffOutput> {
    if (!this.context.plan || !this.context.foreword) {
      throw new Error("must call plan() and writeForeword() before signOff()");
    }
    const res = await this.runFn<unknown, LeaderSignoffOutput>({
      spec: LeaderAgent,
      input: {
        phase: "signoff",
        topic: this.context.task.topic,
        language: this.context.task.language,
        myPlan: {
          goals: this.context.plan.goals,
          dimensions: this.context.plan.dimensions,
        },
        myDecisions: this.context.decisions,
        myForeword: {
          whatWeAnswered: this.context.foreword.whatWeAnswered,
          whatRemainsUnclear: this.context.foreword.whatRemainsUnclear,
        },
        finalQuality,
        dimensionStates,
      },
      agentId: "leader",
    });
    if (
      res.state !== "completed" ||
      !res.output ||
      res.output.phase !== "signoff"
    ) {
      const fail = describeLeaderFailure("signoff", res);
      throw new Error(`Leader.signOff failed [${fail.code}]: ${fail.message}`);
    }
    return res.output;
  }

  getContext(): Readonly<MissionContext> {
    return this.context;
  }
}

// ── Factory service (Nest provider) ──

@Injectable()
export class LeaderService {
  private readonly log = new Logger(LeaderService.name);

  constructor(private readonly store: MissionStore) {}

  create(
    missionId: string,
    userId: string,
    task: LeaderTask,
    runFn: LeaderRunFn,
  ): SupervisedMission {
    return new SupervisedMission(
      missionId,
      userId,
      task,
      runFn,
      this.store,
      this.log,
    );
  }
}
