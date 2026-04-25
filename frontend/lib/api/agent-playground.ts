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
  id: string;
  agentId: string;
  seq: number;
  type: string;
  payload: unknown;
  emittedAt: string;
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
    throw new Error(
      `Failed to start mission: ${res.status} ${await res.text()}`
    );
  }
  return (await res.json()) as RunMissionResponse;
}

export async function replayMission(
  missionId: string
): Promise<{ events: ReplayEvent[] }> {
  const res = await fetch(`${API_BASE}/replay/${missionId}`, {
    headers: { ...getAuthHeader() },
  });
  if (!res.ok) {
    throw new Error(`Failed to replay mission: ${res.status}`);
  }
  return (await res.json()) as { events: ReplayEvent[] };
}

export async function getMissionCost(
  missionId: string
): Promise<{ missionId: string; breakdown: unknown }> {
  const res = await fetch(`${API_BASE}/cost/${missionId}`, {
    headers: { ...getAuthHeader() },
  });
  if (!res.ok) throw new Error(`Failed to get cost: ${res.status}`);
  return (await res.json()) as { missionId: string; breakdown: unknown };
}
