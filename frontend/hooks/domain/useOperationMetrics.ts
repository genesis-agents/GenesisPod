/**
 * useOperationMetrics —— 运营看板只读指标 hooks
 *
 * 对接后端 /api/v1/admin/dashboard 三个只读端点（JwtAuthGuard + AdminGuard）：
 *   - GET /overview  经营总览（PWAU / 今日活跃 / 今日新增 / 成本）
 *   - GET /modules   模块健康（按 module 分组的漏斗 + 完成率）
 *   - GET /topics     主题运营（topicKey 频次 top 20）
 *
 * 三个端点均接受 ?days=N（默认 30）。复用 useApiGet 范式，days 变化时自动重取。
 */

import { useApiGet, type UseApiGetResult } from '@/hooks/core';

// ──────────────── 后端响应类型 ────────────────

export interface OverviewCostByModule {
  module: string;
  costUsd: number;
  tokens: number;
}

export interface OverviewMetrics {
  pwau: number;
  todayActive: number;
  todayNew: number;
  totalEvents: number;
  cost: {
    totalUsd: number;
    byModule: OverviewCostByModule[];
  };
}

export interface ModuleHealthRow {
  module: string;
  activeUsers: number;
  started: number;
  completed: number;
  failed: number;
  completionRate: number;
}

export interface TopicRow {
  topicKey: string;
  count: number;
}

const BASE = '/admin/dashboard';

// ──────────────── hooks ────────────────

export function useOverviewMetrics(
  days: number
): UseApiGetResult<OverviewMetrics> {
  return useApiGet<OverviewMetrics>(`${BASE}/overview?days=${days}`, {
    deps: [days],
  });
}

export function useModuleHealth(
  days: number
): UseApiGetResult<ModuleHealthRow[]> {
  return useApiGet<ModuleHealthRow[]>(`${BASE}/modules?days=${days}`, {
    deps: [days],
  });
}

export function useTopicMetrics(days: number): UseApiGetResult<TopicRow[]> {
  return useApiGet<TopicRow[]>(`${BASE}/topics?days=${days}`, {
    deps: [days],
  });
}
