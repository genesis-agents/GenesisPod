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
  const url = new URL(`${API_BASE}/replay/${missionId}`);
  if (sinceTs != null) url.searchParams.set('since', String(sinceTs));
  const res = await fetch(url.toString(), {
    headers: { ...getAuthHeader() },
  });
  if (!res.ok) {
    throw new Error(`Failed to replay mission: ${res.status}`);
  }
  return (await res.json()) as ReplayResponse;
}
