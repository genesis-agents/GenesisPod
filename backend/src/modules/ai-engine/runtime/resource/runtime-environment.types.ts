/**
 * RuntimeEnvironmentService 公共类型契约
 *
 * 设计文档：docs/design/topic-insights-harness-redesign/11-capability-discovery.md
 *
 * 注意：这是 L2 AI Engine runtime 层通用契约——**不含任何 AI App 特定概念**
 * （无 "topic-insights"、"harness"、"research-depth" 等）。
 * 各 L3 App 在自己的 CapabilityReconciler 里把本层输出映射到 App 语义。
 */

export type RuntimeModelType = "CHAT" | "REASONING" | "EMBEDDING" | "VISION";

export interface RuntimeModelCapability {
  readonly modelId: string;
  readonly provider: string;
  readonly modelType: RuntimeModelType;
  readonly contextWindow: number;
  readonly costTier: "cheap" | "standard" | "premium";
  readonly healthy: boolean;
  readonly recentErrorRate?: number;
}

export interface RuntimeToolCapability {
  readonly toolId: string;
  readonly name: string;
  readonly category?: string;
  readonly enabled: boolean;
  readonly healthy: boolean;
  readonly note?: string;
}

export interface RuntimeDepHealth {
  readonly healthy: boolean;
  readonly checkedAt: string;
  readonly note?: string;
}

export interface RuntimeUserKeyState {
  readonly hasByok: boolean;
  readonly byokProviders: ReadonlyArray<string>;
  readonly sharedKeyAvailable: boolean;
}

/**
 * L2 Environment Snapshot — 客观环境事实，与任何 AI App 无关。
 */
export interface EnvironmentSnapshot {
  readonly generatedAt: string;
  readonly userId: string;
  readonly models: Readonly<
    Record<RuntimeModelType, ReadonlyArray<RuntimeModelCapability>>
  >;
  readonly agents: ReadonlyArray<string>; // L2 AgentRegistry 全量 id
  readonly tools: ReadonlyArray<RuntimeToolCapability>; // L2 ToolRegistry
  readonly skills: ReadonlyArray<string>; // L2 SkillRegistry 全量 id
  readonly userKeys: RuntimeUserKeyState;
  readonly externalDeps: Readonly<Record<string, RuntimeDepHealth>>;
}

export interface EnvironmentSnapshotParams {
  readonly userId: string;
  /** 强制刷新缓存（默认使用 30 秒缓存） */
  readonly force?: boolean;
}
