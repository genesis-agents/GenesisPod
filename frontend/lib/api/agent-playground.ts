/**
 * Agent Playground API client
 */

import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';

const API_BASE = `${config.apiBaseUrl}/api/v1/agent-playground`;

export interface RunMissionInput {
  topic: string;
  depth: 'quick' | 'standard' | 'deep';
  language: 'zh-CN' | 'en-US';
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
    // text 可能是 HTML（404 页）→ 截断防止 UI 爆炸
    const detail = text.length > 200 ? text.slice(0, 200) + '…' : text;
    throw new Error(`Failed to start mission: ${res.status} ${detail}`);
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error('Failed to start mission: invalid JSON response');
  }
  const missionId = (data as { missionId?: unknown }).missionId;
  if (typeof missionId !== 'string' || missionId.length === 0) {
    throw new Error('Failed to start mission: missionId missing in response');
  }
  return data as RunMissionResponse;
}

export async function replayMission(
  missionId: string,
  sinceTs?: number
): Promise<ReplayResponse> {
  // 用字符串拼接，不要 new URL —— 本地开发 apiBaseUrl 是空字符串（走 Next.js rewrites），
  // 相对路径喂给 URL 构造器会抛 "Invalid URL"。
  const qs =
    sinceTs != null ? `?since=${encodeURIComponent(String(sinceTs))}` : '';
  const res = await fetch(
    `${API_BASE}/replay/${encodeURIComponent(missionId)}${qs}`,
    { headers: { ...getAuthHeader() } }
  );
  if (!res.ok) {
    throw new Error(`Failed to replay mission: ${res.status}`);
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error('Failed to replay mission: invalid JSON response');
  }
  const events = (data as { events?: unknown }).events;
  if (!Array.isArray(events)) {
    throw new Error('Failed to replay mission: events array missing');
  }
  return data as ReplayResponse;
}
