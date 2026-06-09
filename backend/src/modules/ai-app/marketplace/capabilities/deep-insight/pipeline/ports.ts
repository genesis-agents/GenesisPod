/**
 * deep-insight pipeline 三端口（能力家自有 abstractions，不放 app、不放 harness）。
 *
 * 设计依据：docs/architecture/capability-execution-architecture.md §2。
 *   - StageBindings        —— 14 阶段认知逻辑（**能力家提供**，实现住 ./bindings/）。
 *   - AgentInvocation      —— 单次 run 的 agent 调用上下文（userId / preferredModelId /
 *                              onAgentEvent relay）；随 pipeline input 透传给 bindings。
 *   - MissionPersistencePort —— 持久化契约（**消费方注入**）；已定义在
 *     marketplace/capability/capability-runner.port.ts，本文件 re-export 复用，
 *     不重复定义（避免造第二套端口）。
 *
 * 铁律（§1.2 R1/R2/R5）：本文件零 app import，只依赖 harness facade + capability 契约。
 */
import type {
  StageRunArgs,
  ResolvedStageHooks,
  IAgentEvent,
} from "@/modules/ai-harness/facade";
import type {
  MissionPersistencePort,
  MissionTerminalDetails,
} from "../../../capability/capability-runner.port";

// 复用 capability 契约层已定义的持久化端口（消费方注入，能力内核只见端口）。
export type { MissionPersistencePort, MissionTerminalDetails };

/**
 * 单次 run 的 agent 调用上下文。
 *
 * bindings 内部用 harness AgentRunner 跑共享 @DefineAgent 时，把这些透传进
 * RunOptions（userId / preferredModelId）+ 用 onAgentEvent relay 实时 agent 事件。
 * 随 pipeline input（DeepInsightPipelineInput.invocation）下发，bindings 从
 * args.ctx.input 取——这样 orchestrator 主签名稳定（只认 pipelineId），
 * StageBindings 实现可保持无状态（hooks 注册一次，per-run 数据走 ctx.input）。
 */
export interface AgentInvocation {
  /** BYOK / billing / ownership 归属。 */
  readonly userId: string;
  /** 用户选定的真实 model id（透传 agentRunner.run RunOptions.preferredModelId）。 */
  readonly preferredModelId?: string;
  /** researcher 抽图开关。 */
  readonly withFigures?: boolean;
  /** 本地知识库 ids（researcher rag-search 召回限定）。 */
  readonly knowledgeBaseIds?: readonly string[];
  /** 搜索时效窗口。 */
  readonly searchTimeRange?: "30d" | "90d" | "180d" | "365d" | "730d" | "all";
  /** 用户研究 brief（背景/约束/关注角度）。 */
  readonly description?: string;
  /** 报告深度档位。 */
  readonly depth?: "quick" | "standard" | "deep";
  /**
   * IAgentEvent → 上层流式 relay。bindings 在每次 agentRunner.run 时透传，
   * 把 thinking / action_planned / action_executed / error 上抛给消费方。
   */
  readonly onAgentEvent?: (
    stepId: string,
    role: string,
    dimension: string | undefined,
    ev: IAgentEvent,
  ) => void;
}

/**
 * deep-insight pipeline 的业务输入（= orchestrator RunPipelineArgs.input / ctx.input）。
 *
 * topic / language 是核心语义输入；invocation 携带 per-run 的 agent 调用上下文。
 * bindings 从 args.ctx.input（断言为本类型）读它们。
 */
export interface DeepInsightPipelineInput {
  readonly topic: string;
  readonly language: "zh-CN" | "en-US";
  readonly invocation: AgentInvocation;
}

/**
 * StageBindings —— 14 阶段逻辑契约（能力家实现，实现住 ./bindings/）。
 *
 * 实现内部用 harness AgentRunner 跑共享 @DefineAgent + 写 CrossStageState；
 * 不碰任何 app DB（中间态进 CrossStageState；落库由 PERSIST primitive →
 * MissionPersistencePort）。
 *
 * 设计选择（§2.1 落地）：StageBindings 暴露一个 `buildHooksForStep(stepId)`，
 * 为每个 step 返回该 step 对应 primitive 所需的 ResolvedStageHooks。runner 在
 * 注册 recipe config 时，把这些 hooks 挂到每个 step.hooks 上一次性注册——
 * 这是 playground 已跑通的同款模式（buildHooksForStep），但 hooks 内部从
 * args.ctx.input.invocation 取 per-run 数据，保持 bindings 无状态。
 */
export interface StageBindings {
  /**
   * 为 stepId 构建该 step primitive 所需的 hooks 集合。
   * 未知 stepId 抛错（recipe 14 step 必须全覆盖）。
   */
  buildHooksForStep(stepId: string): ResolvedStageHooks;
}

/** 从 MissionContext 安全取出 deep-insight 业务输入。 */
export function readPipelineInput(
  ctx: StageRunArgs["ctx"],
): DeepInsightPipelineInput {
  const input = ctx.input as Partial<DeepInsightPipelineInput> | undefined;
  if (!input || typeof input.topic !== "string" || !input.invocation) {
    throw new Error(
      "[deep-insight pipeline] ctx.input 不是合法 DeepInsightPipelineInput（缺 topic / invocation）",
    );
  }
  return input as DeepInsightPipelineInput;
}

/** CrossStageState key 业务前缀（§4.1：key 用 deep-insight.* 前缀避免与他人撞）。 */
export const CS_KEY = {
  plan: "deep-insight.plan",
  researcherResults: "deep-insight.researcherResults",
  reconciliationReport: "deep-insight.reconciliationReport",
  analystOutput: "deep-insight.analystOutput",
  outlinePlan: "deep-insight.outlinePlan",
  report: "deep-insight.report",
  reportArtifact: "deep-insight.reportArtifact",
  reviewScore: "deep-insight.reviewScore",
  verifierVerdicts: "deep-insight.verifierVerdicts",
  reviewVerdict: "deep-insight.reviewVerdict",
  leaderSignOff: "deep-insight.leaderSignOff",
  tokensUsed: "deep-insight.tokensUsed",
  costCents: "deep-insight.costCents",
  // ★ W2.5 富增强：s4 patch 失败跟踪（s10 据此强制拒签，对齐 playground s4PatchFailures）。
  s4PatchFailures: "deep-insight.s4PatchFailures",
  // ★ W2.5 富增强：s10 leader finalScore（QualityTrace 客观计算，落 CapabilityRunResult）。
  finalScore: "deep-insight.finalScore",
  // ★ W2.5 富增强：s9b 客观评估 10 维结果（落 reportArtifact.metadata.pipelineEvaluation）。
  pipelineEvaluation: "deep-insight.pipelineEvaluation",
  // ★ W2.5 富增强：run 起始时间戳（assembler generationTimeMs 计算）。
  startedAt: "deep-insight.startedAt",
} as const;
