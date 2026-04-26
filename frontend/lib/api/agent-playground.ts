/**
 * Agent Playground API client
 *
 * 后端走全局 ResponseTransformInterceptor，响应被包成
 *   { success: true, data: {...原始返回...}, metadata: {...} }
 * 所有调用必须 unwrapStandard() 取出 .data
 */

import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';

const API_BASE = `${config.apiBaseUrl}/api/v1/agent-playground`;

export type BudgetProfile = 'low' | 'medium' | 'high' | 'unlimited';

export interface RunMissionInput {
  topic: string;
  depth: 'quick' | 'standard' | 'deep';
  language: 'zh-CN' | 'en-US';
  /** 推荐使用 budgetProfile（4 档），maxCredits 为 deprecated 兼容字段 */
  budgetProfile?: BudgetProfile;
  /** @deprecated 直接数字上限；新代码用 budgetProfile */
  maxCredits?: number;
}

export interface RunMissionResponse {
  missionId: string;
  streamNamespace: string;
}

export interface ReplayEvent {
  type: string;
  payload: unknown;
  agentId?: string;
  traceId?: string;
  timestamp: number;
}

export interface ReplayResponse {
  events: ReplayEvent[];
  serverNow: number;
}

/**
 * 兼容拆包：标准 { success, data, metadata } 优先取 data；
 * 没有 wrapping 时直接用原始对象。
 */
function unwrapStandard<T>(raw: unknown): T {
  if (raw && typeof raw === 'object' && 'data' in raw) {
    const wrapper = raw as { success?: boolean; data?: unknown };
    if (wrapper.data && typeof wrapper.data === 'object') {
      return wrapper.data as T;
    }
  }
  return raw as T;
}

export async function runResearchTeam(
  input: RunMissionInput
): Promise<RunMissionResponse> {
  const res = await fetch(`${API_BASE}/research-team/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const detail = text.length > 200 ? text.slice(0, 200) + '…' : text;
    throw new Error(`Failed to start mission: ${res.status} ${detail}`);
  }
  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    throw new Error('Failed to start mission: invalid JSON response');
  }
  const data = unwrapStandard<{ missionId?: unknown }>(raw);
  const missionId = data.missionId;
  if (typeof missionId !== 'string' || missionId.length === 0) {
    throw new Error('Failed to start mission: missionId missing in response');
  }
  return data as RunMissionResponse;
}

export interface MissionListItem {
  id: string;
  topic: string;
  /** quick / standard / deep（后端可能扩展，故用 string） */
  depth: string;
  language: string;
  /** running / completed / failed / rejected（后端可能扩展，故用 string） */
  status: string;
  startedAt: string;
  completedAt: string | null;
  wallTimeMs: number | null;
  finalScore: number | null;
  tokensUsed: number | null;
  costUsd: number | null;
  reportTitle: string | null;
  reportSummary: string | null;
  errorMessage: string | null;
}

export interface MissionDetail extends MissionListItem {
  themeSummary: string | null;
  dimensions: { id: string; name: string; rationale: string }[] | null;
  reportFull: {
    title?: string;
    summary?: string;
    sections?: { heading: string; body: string; sources?: string[] }[];
    conclusion?: string;
    citations?: string[];
  } | null;
  verdicts:
    | {
        verifierId: string;
        score: number;
        critique?: string;
        attempt?: number;
      }[]
    | null;
  trajectoryStored: number | null;
}

export async function listMissions(): Promise<MissionListItem[]> {
  const res = await fetch(`${API_BASE}/missions`, {
    headers: { ...getAuthHeader() },
  });
  if (!res.ok) throw new Error(`Failed to list missions: ${res.status}`);
  const raw = await res.json();
  const data = unwrapStandard<{ items?: MissionListItem[] }>(raw);
  return data.items ?? [];
}

export async function getMissionDetail(id: string): Promise<MissionDetail> {
  const res = await fetch(`${API_BASE}/missions/${encodeURIComponent(id)}`, {
    headers: { ...getAuthHeader() },
  });
  if (!res.ok) throw new Error(`Failed to fetch mission: ${res.status}`);
  const raw = await res.json();
  const data = unwrapStandard<{ mission?: MissionDetail }>(raw);
  if (!data.mission) throw new Error('Mission not found');
  return data.mission;
}

export type LeaderDecisionType =
  | 'DIRECT_ANSWER'
  | 'CREATE_TODO'
  | 'CLARIFY'
  | 'ACKNOWLEDGE';

export interface LeaderDecision {
  type: LeaderDecisionType;
  understanding?: string;
  todo?: { name: string; rationale: string }[];
  clarifyOptions?: string[];
}

export interface LeaderChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tokensUsed: number | null;
  createdAt: string;
  decision?: LeaderDecision | null;
}

export interface LeaderChatSendResponse {
  user: LeaderChatMessage;
  assistant: LeaderChatMessage;
  appendedDimensionIds?: string[];
}

export async function rerunMission(
  missionId: string
): Promise<{ missionId: string; streamNamespace: string }> {
  const res = await fetch(
    `${API_BASE}/missions/${encodeURIComponent(missionId)}/rerun`,
    {
      method: 'POST',
      headers: { ...getAuthHeader() },
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Rerun failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const raw: unknown = await res.json();
  return unwrapStandard<{ missionId: string; streamNamespace: string }>(raw);
}

export async function deleteMission(missionId: string): Promise<{ ok: true }> {
  const res = await fetch(
    `${API_BASE}/missions/${encodeURIComponent(missionId)}`,
    {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Delete failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const raw: unknown = await res.json();
  return unwrapStandard<{ ok: true }>(raw);
}

export async function updateMission(
  missionId: string,
  data: { topic: string }
): Promise<{ ok: true }> {
  const res = await fetch(
    `${API_BASE}/missions/${encodeURIComponent(missionId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(data),
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Update failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const raw: unknown = await res.json();
  return unwrapStandard<{ ok: true }>(raw);
}

export async function cancelMission(
  missionId: string
): Promise<{ ok: true; status: string }> {
  const res = await fetch(
    `${API_BASE}/missions/${encodeURIComponent(missionId)}/cancel`,
    {
      method: 'POST',
      headers: { ...getAuthHeader() },
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Cancel failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const raw: unknown = await res.json();
  return unwrapStandard<{ ok: true; status: string }>(raw);
}

export async function listLeaderChat(
  missionId: string
): Promise<LeaderChatMessage[]> {
  const res = await fetch(
    `${API_BASE}/missions/${encodeURIComponent(missionId)}/leader-chat`,
    { headers: { ...getAuthHeader() } }
  );
  if (!res.ok) throw new Error(`Failed to load leader chat: ${res.status}`);
  const raw: unknown = await res.json();
  const data = unwrapStandard<{ messages?: LeaderChatMessage[] }>(raw);
  return data.messages ?? [];
}

export async function sendLeaderChat(
  missionId: string,
  content: string
): Promise<LeaderChatSendResponse> {
  const res = await fetch(
    `${API_BASE}/missions/${encodeURIComponent(missionId)}/leader-chat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({ content }),
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Failed to send to leader: ${res.status} ${text.slice(0, 200)}`
    );
  }
  const raw: unknown = await res.json();
  return unwrapStandard<LeaderChatSendResponse>(raw);
}

export async function replayMission(
  missionId: string,
  sinceTs?: number
): Promise<ReplayResponse> {
  // 字符串拼接，不要 new URL —— 本地开发 apiBaseUrl 是空字符串走 Next rewrites
  const qs =
    sinceTs != null ? `?since=${encodeURIComponent(String(sinceTs))}` : '';
  const res = await fetch(
    `${API_BASE}/replay/${encodeURIComponent(missionId)}${qs}`,
    { headers: { ...getAuthHeader() } }
  );
  if (!res.ok) {
    throw new Error(`Failed to replay mission: ${res.status}`);
  }
  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    throw new Error('Failed to replay mission: invalid JSON response');
  }
  const data = unwrapStandard<{ events?: unknown; serverNow?: number }>(raw);
  if (!Array.isArray(data.events)) {
    throw new Error('Failed to replay mission: events array missing');
  }
  return data as ReplayResponse;
}
