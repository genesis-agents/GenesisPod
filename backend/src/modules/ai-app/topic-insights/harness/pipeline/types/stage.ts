/**
 * Stage 抽象 — 对应 02-target-architecture §2.2
 *
 * 每个 Stage 定义明确的 Input / Output（不共享 context），
 * 并声明 dependsOn / runsWhen / SLO / 发射的 event 类型。
 */

import type { PipelineIdentityContext } from "./identity-context";
import type { StageResults } from "./stage-results";

/** Stage 标识符白名单（对齐 02-target-architecture §3.2） */
export type StageId =
  | "ST-00-INIT"
  | "ST-01-PLAN"
  | "ST-02-RESEARCH"
  | "ST-03-WRITE"
  | "ST-04-REVIEW"
  | "ST-05-INTEGRATE"
  | "ST-06-COGLOOP"
  | "ST-07-SYNTH"
  | "ST-08-QGATE"
  | "ST-09-EVAL"
  | "ST-10-FACT"
  | "ST-11-ASM"
  | "ST-12-LATEX"
  | "ST-13-PERSIST"
  | "ST-14-CLEANUP";

export type StageCondition =
  | "always"
  | "thoroughOrDeep"
  | "hasLatex"
  | "qualityGateFailed";

export interface StageSLO {
  /** P95 执行时长（ms） */
  readonly p95Ms: number;
  /**
   * Stage 预算上限（0 = 不涉及 LLM）
   * 注意：这是 stage 级 budget 的 metadata，不是直接传给 LLM 的 `maxTokens` 参数；
   * LLM 调用参数走 agent 自己的 TaskProfile。
   */
  readonly tokenBudget: number;
  /** 预期成功率（0-1） */
  readonly targetSuccessRate: number;
}

/**
 * Stage 会发射的事件类型（声明式契约）
 * Pipeline 运行时会校验 emit 的 event.type 必须在此列表内
 */
export type StageEmittedEvent = string;

export interface Stage<TInput = unknown, TOutput = unknown> {
  readonly id: StageId;
  readonly name: string;
  readonly dependsOn: StageId[];
  readonly runsWhen: StageCondition;
  readonly slo: StageSLO;
  readonly emitsEvents: StageEmittedEvent[];

  /**
   * 从 identity + 上游 StageResults 组装本 stage 的 input
   * 不做业务逻辑，只做数据整形
   */
  prepare(
    identity: PipelineIdentityContext,
    upstreamResults: StageResults,
  ): Promise<TInput>;

  /**
   * 实际业务执行；必须响应 signal.aborted
   */
  execute(
    identity: PipelineIdentityContext,
    input: TInput,
    signal: AbortSignal,
  ): Promise<TOutput>;

  /**
   * 把 output 持久化到 DB，供 resume 时 rebuild StageResults 使用
   */
  persist(identity: PipelineIdentityContext, output: TOutput): Promise<void>;

  /** 可选清理（AutoDream / cache release 等） */
  cleanup?(identity: PipelineIdentityContext): Promise<void>;
}
