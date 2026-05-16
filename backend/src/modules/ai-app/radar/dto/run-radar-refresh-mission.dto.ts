/**
 * RunRadarRefreshMissionInput
 *
 * 主刷新 mission 的输入快照。由 controller(manual refresh) / scheduler(cron)
 * 构造后传给 RadarPipelineDispatcher.runMission()。同 RunMissionInput 一样，
 * 也作为 createMissionRow 入参的快照数据源（snap 入 payload JSON）。
 *
 * 设计：DTO 用 plain interface（不挂 class-validator）—— controller 已用 path
 * param 拿 topicId，input 由 service 内部从 topic 行 hydrate 出来，没有边界来源的
 * 不可信用户输入。
 */
export interface RunRadarRefreshMissionInput {
  readonly topicId: string;
  readonly trigger: "MANUAL" | "SCHEDULED" | "FIRST_RUN";
  /** snapshot 字段，从 RadarTopic.name 复制（防 topic 中途改名 mission 失锚） */
  readonly topicName: string;
  /** snapshot 字段，从 RadarTopic.keywords 复制 */
  readonly keywords: string[];
  /** snapshot 字段，从 RadarTopic.description 复制 */
  readonly description?: string | null;
  /** snapshot 字段，从 RadarTopic.entityType 复制 */
  readonly entityType?: string | null;
  /** snapshot 字段，从 RadarTopic.refreshCron 复制 */
  readonly refreshCron: string;
}

/**
 * Discovery mission 输入。
 */
export interface RunRadarDiscoveryMissionInput {
  readonly topicId: string;
  readonly topicName: string;
  readonly keywords: string[];
  readonly description?: string | null;
  readonly entityType?: string | null;
  readonly existingSources: Array<{
    readonly type: string;
    readonly identifier: string;
  }>;
}

export function resolveRadarMissionWallTimeMs(): number {
  // 默认 30 分钟 wall time，参考 playground "quick" 档位；
  // 单 user 同时 RUNNING ≤3 + budget cap → 不需要更宽。
  return 30 * 60 * 1000;
}

export function resolveRadarMaxCredits(): number {
  // 主刷新 mission 预算 50 credits（≈ $0.50 LLM cost cap）
  return 50;
}

export function resolveRadarBudgetMultiplier(): number {
  return 1.0;
}

export function resolveRadarDiscoveryWallTimeMs(): number {
  return 3 * 60 * 1000;
}

export function resolveRadarDiscoveryMaxCredits(): number {
  return 10;
}
