/**
 * MissionViewState — 跨 Agent Team App 的前端展示状态契约
 *
 * 2026-05-26 ADR 009 §3 (前端业务下沉到后端) 落地起点 (PR-D-0):
 *   各 team app 前端目前各自做 event → state derive (lib/features/<team>/derive.ts).
 *   按 ADR 009, 这些推导逻辑必须下沉到后端, 后端按本 contract emit view-state event,
 *   前端只渲染. 本文件是该协议的 single source of truth.
 *
 * 设计原则:
 *   1. 通用部分在 framework (mission / stages / agents / cost / status), 每个 team 都用
 *   2. team-specific 字段用 `TDomain` 泛型注入, 由具体 team app 在 ai-app/ 层定义形态
 *   3. 全部 readonly + Record (immutable shape), 前端只渲染不变形
 *   4. 字段命名与现有前端 derive.ts 兼容 (零字段变更, 仅形态重组), 满足 ADR 009 §0 红线
 *
 * 兼容性 (ADR 009 §0):
 *   实现本 contract 的后端 service 必须输出与现有前端 derive 函数 deep-equal 的 view state.
 *   每个 team 的 view-state service 必带 *.equivalence.spec.ts 验证.
 *
 * 与现有前端 DerivedView 字段映射规则 (通用部分):
 *   DerivedView.mission   → MissionViewState.mission
 *   DerivedView.stages    → MissionViewState.stages
 *   DerivedView.agents    → MissionViewState.agents
 *   DerivedView.cost      → MissionViewState.cost
 *   其他 team-specific 字段 (verdicts / reports / dimensionPipelines 等业务概念)
 *     → MissionViewState.domain (TDomain 泛型扩展)
 *
 * 状态: V0 contract (待首个 team app PR-D-1 接入 → V0.1 迭代调整)
 */

/** Mission 顶层 lifecycle 状态 (所有 team 共享). */
export type MissionLifecycleStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "aborted"
  | "rejected";

/** 通用 mission 信息. team-specific 字段去 `MissionViewState.domain`. */
export interface MissionViewInfo {
  readonly missionId: string;
  readonly status: MissionLifecycleStatus;
  readonly startedAt?: number;
  readonly endedAt?: number;
  readonly failedMessage?: string;
  readonly rejectedReason?: string;
  readonly cancelledAt?: number;
  /** 用户原始输入摘要 (team 自定义, framework 不解释). */
  readonly inputSummary?: string;
}

/** Stage 状态 (顺序 stage 流水线). team-specific stage 含义在 stageKind. */
export type StageStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface StageViewState {
  readonly id: string;
  /**
   * team-specific stage 分组 key, 例如 'leader' / 'analyst' / 'writer' / 'publish' /
   * 'collect' 等业务阶段语义. framework 不强制约束, 前端用此 key 选 panel 类型.
   */
  readonly kind: string;
  readonly status: StageStatus;
  readonly startedAt?: number;
  readonly endedAt?: number;
  readonly detail?: string;
  readonly attempts?: number;
  readonly progressPercent?: number;
}

/** Agent live state (实时显示). */
export type AgentPhase = "pending" | "running" | "completed" | "failed";

export interface AgentViewState {
  readonly agentId: string;
  /** team-specific role (leader / researcher / writer / composer / publisher / 等). */
  readonly role: string;
  readonly phase: AgentPhase;
  readonly startedAt?: number;
  readonly endedAt?: number;
  readonly wallTimeMs?: number;
  readonly iterations?: number;
  readonly attempt?: number;
  readonly modelId?: string;
  readonly failureMessage?: string;
  readonly retryCount?: number;
  /** team-specific extra (例如某 team 的维度绑定 / 平台 id 等业务字段). */
  readonly extra?: Readonly<Record<string, unknown>>;
}

/** Cost / budget 状态 (通用, 所有 team 都消耗 LLM token). */
export interface CostViewState {
  readonly tokensUsed: number;
  readonly costUsd: number;
  readonly byStage: ReadonlyArray<{
    readonly stage: string;
    readonly tokensUsed: number;
    readonly costUsd: number;
  }>;
}

/**
 * MissionViewState - 顶层契约.
 *
 * TDomain 是 team-specific 扩展点, 每个具体 team app 在 ai-app/<team>/contracts/
 * 定义自己的 DomainView shape (例如报告类 team 含 dimensions/verdicts/reports;
 * 发布类 team 含 contentId/platforms/publishStatus; 信号类 team 含 signals).
 *
 * 前端组件: 通用部分 (mission/stages/agents/cost) 由 canonical shell 渲染;
 * team-specific 部分由 team 自定义 panel 消费 `state.domain`.
 */
export interface MissionViewState<TDomain = Record<string, unknown>> {
  readonly missionId: string;
  readonly mission: MissionViewInfo;
  readonly stages: ReadonlyArray<StageViewState>;
  readonly agents: ReadonlyArray<AgentViewState>;
  readonly cost: CostViewState;
  /** 当前正在执行的 step id (来自 stages[*].id). null = 已终结. */
  readonly currentStepId: string | null;
  /** 顶层进度 (0-100, 由 stages 完成度算出). */
  readonly progressPercent: number;
  /** team-specific domain extension. team 自定义 shape. */
  readonly domain: TDomain;
  /** view state 生成时间戳 (后端 emit 时刻, 用于前端 ordering). */
  readonly snapshotAt: number;
}

/**
 * MissionViewState event payload (后端 emit 用).
 *
 * Event type 命名约定: 每个 team 用自己的 namespace 前缀 + ".mission:view-state".
 *   具体 team event type 由 PR-D-1 实现时在各 team 的 events.ts 中 T(...) 注册.
 *   本 contract 不硬编码具体 team 前缀, 避免与 event-contract spec 冲突.
 * Routing: 与现有 `mission:lifecycle` / `mission:stage:*` 事件并行, 不替代它们.
 *   细粒度事件保留作 audit/debug 通道. view-state 是合成事件 (full snapshot).
 *
 * 频率: 后端在每个 mission state 变化时 emit 1 次 (stage start/end, agent finish,
 *   verdict update 等). 不在每个 LLM token 上 emit (太频繁).
 */
export interface MissionViewStateEvent<TDomain = Record<string, unknown>> {
  readonly type: string; // `<team>.mission:view-state`
  readonly missionId: string;
  readonly state: MissionViewState<TDomain>;
}

/**
 * 后端实现 view state 推送的端口.
 * 每个 mission-pipeline 型 team app 在 PR-D-1 实现一个 `<team>-view-state.service.ts`,
 * 内部维护 mission view state (event-sourced), 在每个 mission state 变化时调用 emit().
 */
export interface IMissionViewStatePort<TDomain = Record<string, unknown>> {
  /**
   * 推送 mission view state. 后端 service 在每次 state mutation 后调用.
   * 调用方式: 同步, 由 service 内部决定 emit 频率 (建议 debounce 100ms).
   */
  emit(state: MissionViewState<TDomain>): void;

  /** 获取最新 snapshot (前端 reconnect / API 拉取场景用). */
  getCurrentSnapshot(missionId: string): MissionViewState<TDomain> | null;
}
