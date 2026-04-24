/**
 * ResearchTask 业务字段 metadata 声明（topic-insights 专属）
 *
 * 归属：L3 ai-app/topic-insights/agent/adapters/
 *
 * Harness runtime 的 AgentTask<TMetadata> 泛型参数，topic-insights 传入此类型。
 */

export interface ResearchTaskMetadata extends Record<string, unknown> {
  readonly missionId: string;
  readonly topicId: string;
  readonly dimensionId?: string;
  readonly dimensionName?: string;
  readonly parentTaskId?: string;
  /** 原 ResearchTask.assignedAgent（前端展示用） */
  readonly assignedAgent?: string;
  readonly assignedAgentType?: string;
  /** Leader 分配的模型 id（非 tier — tier 由 budget 动态降档决定） */
  readonly modelId?: string;
  readonly skills?: readonly string[];
  readonly tools?: readonly string[];
  readonly priority?: number;
  readonly dependencies?: readonly string[];
}
