/**
 * LeaderSupervisor —— Mission "领导"在工程层的承载体
 *
 * 设计决策 (mission-pipeline-baseline.md §Leader-as-Single-Responsibility):
 *   • 业务概念"领导（Leader）"在工程上是 SupervisedMission 实例
 *   • 它本身不是 LLM agent，是一个 TypeScript 类，承载跨 milestone 的 missionContext
 *   • 它**全程委托同一个 LeaderAgent LLM spec** 完成 4 个 milestone 的认知决策
 *   • 让 LeaderAgent 在 M7 签字时能引用自己 M0/M1/M6 的历史决策做真正的问责
 *
 * 用法:
 *   const leader = leaderSupervisor.create(missionId, userId, task);
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
} from "../agents/leader/leader.agent";
import { MissionStore } from "./mission-store.service";

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

  /** ★ M0: 拆分维度 + 声明目标 */
  async plan(): Promise<LeaderPlanOutput> {
    const res = await this.runFn<unknown, LeaderPlanOutput>({
      spec: LeaderAgent,
      input: {
        phase: "plan",
        topic: this.context.task.topic,
        depth: this.context.task.depth,
        language: this.context.task.language,
        userProfile: this.context.task.userProfile,
      },
      agentId: "leader",
    });
    if (
      res.state !== "completed" ||
      !res.output ||
      res.output.phase !== "plan"
    ) {
      throw new Error("Leader.plan failed: agent did not return valid plan");
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
      throw new Error(
        "Leader.assessResearchers failed: agent did not return valid decision",
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
      throw new Error(
        "Leader.writeForeword failed: agent did not return valid foreword",
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
      throw new Error(
        "Leader.signOff failed: agent did not return valid sign-off",
      );
    }
    return res.output;
  }

  getContext(): Readonly<MissionContext> {
    return this.context;
  }
}

// ── Factory service (Nest provider) ──

@Injectable()
export class LeaderSupervisor {
  private readonly log = new Logger(LeaderSupervisor.name);

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
