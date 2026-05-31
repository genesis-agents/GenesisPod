/**
 * 运营看板（Ops Dashboard）返回结构
 * 对应 /admin/dashboard 的 overview / modules / topics 三个只读端点
 */

/** 单个模块的成本聚合（来源：ai_engine_metrics，唯一真源） */
export interface OpsModuleCost {
  module: string;
  costUsd: number;
  tokens: number;
}

/** /overview 返回结构 */
export interface OpsOverviewDto {
  /** 近 7 天产生"完成类"行为（completed/saved/published 且 success != false）的去重用户数 */
  pwau: number;
  /** 今天有 user_event 的去重用户数 */
  todayActive: number;
  /** 今天注册的用户数 */
  todayNew: number;
  /** 时间窗内 user_event 总数 */
  totalEvents: number;
  /** 成本（仅来源 ai_engine_metrics） */
  cost: {
    totalUsd: number;
    byModule: OpsModuleCost[];
  };
}

/** /modules 单项 */
export interface OpsModuleStatDto {
  module: string;
  /** 该模块时间窗内的去重活跃用户数 */
  activeUsers: number;
  started: number;
  completed: number;
  failed: number;
  /** completed / started（started 为 0 时返回 0） */
  completionRate: number;
}

/** /topics 单项 */
export interface OpsTopicStatDto {
  topicKey: string;
  count: number;
}
