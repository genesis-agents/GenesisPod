/**
 * Custom Agents API client (R-CA 2026-05-05)
 *
 * 该模块自己拥有的一站式启动 + 主页 mission 列表 API。
 * 与 services/agent-playground/api.ts 共享 MissionListItem 类型（custom agent 启动的
 * mission 跑的就是 playground pipeline，列表卡片字段一致）。
 */
import { apiClient } from '@/lib/api/client';
import type { MissionListItem } from '@/services/agent-playground/api';

/**
 * POST /user/custom-agents/:id/launch
 * 一站式启动：translate + 启动 mission + 写 launch 行
 */
export async function launchCustomAgentMission(
  id: string,
  body: { topic: string; overrides?: Record<string, unknown> }
): Promise<{ missionId: string; streamNamespace: string }> {
  return apiClient.post<{ missionId: string; streamNamespace: string }>(
    `/user/custom-agents/${id}/launch`,
    body
  );
}

/**
 * GET /user/custom-agents/:id/missions
 * 该 agent 启动过的所有 mission cards（驱动 /custom-agents/:id 主页 mission 网格）
 */
export async function listCustomAgentMissions(
  id: string
): Promise<MissionListItem[]> {
  const data = await apiClient.get<{ items: MissionListItem[] }>(
    `/user/custom-agents/${id}/missions`
  );
  return data.items ?? [];
}
