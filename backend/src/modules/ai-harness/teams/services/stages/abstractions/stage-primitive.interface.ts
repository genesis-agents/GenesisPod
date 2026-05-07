/**
 * IStagePrimitive — generic stage primitive 接口（v5.1 §3.2 / §3.4）
 *
 * 7 个核心 primitive：
 *   plan / research / assess / synthesize / draft / review / signoff
 *
 * 加 2 个无 LLM primitive：
 *   persist (write IMissionStore.markCompleted/markFailed)
 *   learn (postmortem + memory consolidation, fire-and-forget)
 *
 * 设计：每个 primitive 是 IStagePrimitive 实现，输入 (ctx, role, config, hooks,
 * crossStageState) 输出 stage-specific result。每个 primitive 核心 happy-path
 * < 250 行；业务专属逻辑通过 hooks + crossStageState 注入。
 */
import type { CrossStageState } from "./cross-stage-state";

/**
 * Mission-level context（pipeline orchestrator 维护，传给每个 stage）
 *
 * 业务无关 generic 结构；ai-app 通过 ctx.input / ctx.statefulRoleStates /
 * crossStageState 传递业务字段。
 */
export interface MissionContext<TInput = unknown> {
  readonly missionId: string;
  readonly userId?: string;
  readonly tenantId?: string;
  /** 业务输入（topic / requirements 等，由 ai-app 定义 schema）*/
  readonly input: TInput;
  /** stateful role 状态（plan/assess/foreword/signoff 跨 stage 读写）*/
  readonly statefulRoleStates: Record<string, RoleState>;
  /** abort signal（mission 被取消时触发）*/
  readonly signal?: AbortSignal;
}

export interface RoleState {
  /** 该 role 跨 stage 的 decisions 累计（plan → assess → signoff 自动追加）*/
  readonly decisions: PastDecision[];
}

export interface PastDecision {
  readonly phase: string; // "plan" | "assess" | "signoff" 等
  readonly decision: string;
  readonly rationale?: string;
  readonly timestamp: number;
}

/**
 * Stage 解析后的 role + skill spec（PipelineOrchestrator 注入）
 */
export interface ResolvedRole {
  readonly id: string;
  /** SkillSpecBuilder 产物（含 systemPrompt/allowedTools/outputSchema）*/
  readonly skillSpec: import("@/modules/ai-engine/skills/spec-builder").IAgentSpec;
  /** stateful=true 时 stage primitive 自动 appendDecision 到 store */
  readonly stateful: boolean;
}

/**
 * Stage 在 PipelineConfig 中的 step 配置
 */
export interface StageStepConfig {
  /** stage primitive id（plan/research/...）*/
  readonly id: string;
  /** stage 自定义 mode（如 synthesize: "reconcile"|"analyze"）*/
  readonly mode?: string;
  /** stage 超时毫秒；undefined=无超时 */
  readonly timeoutMs?: number;
  /** stage 自定义参数（passed to hooks via context）*/
  readonly params?: Readonly<Record<string, unknown>>;
  /**
   * PR-R1 (2026-05-07 per-task rerun + cascade)：DAG 元数据（可选，向后兼容）
   *
   * 用途：cascade 执行器读 successors 决定调度；ctx-hydrator 读 ctxReads 校验完整性；
   *      mission-store 读 dbWrites + resetFields 决定 reset 范围。
   *
   * 不声明则该 stage 不参与 cascade rerun（rerunable 默认视为 false）。
   * 类型见 ai-harness/runner/dag/stage-dag-meta.types.ts。
   */
  readonly dag?: import("../../../../runner/dag/stage-dag-meta.types").StageDagMeta;
}

/**
 * 业务 hook 函数类型（区别于 plugin platform hook，不经 HookBus）
 *
 * 每个 stage primitive 在关键决策点 invoke 这些 callback；ai-app 通过
 * PipelineConfig.hooks 注入。callback 签名因 stage 而异，由各 primitive 定义。
 */
export type StageHookFn<TArgs = unknown, TResult = void> = (
  args: TArgs,
) => TResult | Promise<TResult>;

/**
 * Stage primitive 已解析的 hook 集合
 */
export interface ResolvedStageHooks {
  /** generic catch-all：以 hook name 索引 */
  readonly [hookName: string]: StageHookFn | undefined;
}

/**
 * IStagePrimitive 核心接口（v5.1 §3.2）
 *
 * happy-path < 250 行；业务专属逻辑通过 hooks + crossStageState 注入。
 */
export interface IStagePrimitive<TIn = unknown, TOut = unknown> {
  /** 类型 id：plan / research / assess / synthesize / draft / review / signoff /
   *   persist / learn */
  readonly id: StagePrimitiveId;

  /**
   * 执行 stage
   *
   * @returns stage 输出（写入 ctx.stageOutputs[id]）
   * @throws StageAbortError 业务级 abort（如 assess 决定 abort mission）
   */
  run(args: StageRunArgs<TIn>): Promise<TOut>;
}

export type StagePrimitiveId =
  | "plan"
  | "research"
  | "assess"
  | "synthesize"
  | "draft"
  | "review"
  | "signoff"
  | "persist"
  | "learn";

export interface StageRunArgs<TIn = unknown> {
  readonly ctx: MissionContext<TIn>;
  readonly role: ResolvedRole;
  readonly config: StageStepConfig;
  readonly hooks: ResolvedStageHooks;
  readonly crossStageState: CrossStageState;
  /** 前序 stage 的 outputs（按 stage id 索引）*/
  readonly previousOutputs: Readonly<Record<string, unknown>>;
}

/**
 * Stage 业务级 abort（区别于 HookBus 的 platform abort）
 *
 * 例：assess primitive 决定 abort mission（"continue" decision 改 "abort"）
 *     synthesize 决定 short-circuit（singleDimension 不调 LLM 直接复用）
 */
export class StageAbortError extends Error {
  constructor(
    public readonly stage: string,
    public readonly reason: string,
    public readonly partialOutput?: unknown,
  ) {
    super(`Stage "${stage}" aborted: ${reason}`);
    this.name = "StageAbortError";
  }
}
