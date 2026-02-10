import { getAuthTokens } from '../utils/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const tokens = getAuthTokens();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (tokens?.accessToken) {
    (headers as Record<string, string>)['Authorization'] =
      `Bearer ${tokens.accessToken}`;
  }

  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  const result = await response.json();

  if (
    result &&
    typeof result === 'object' &&
    'success' in result &&
    'data' in result
  ) {
    return result.data;
  }

  return result;
}

// ==================== Types ====================

export interface PlanPhaseStatus {
  status: 'pending' | 'active' | 'completed' | 'skipped';
  missionId?: string;
  summary?: string;
  completedAt?: string;
}

export interface PlanSummary {
  id: string;
  name: string;
  goal: string;
  templateId: string;
  currentPhase: number;
  totalPhases: number;
  phaseStatus: Record<number, PlanPhaseStatus>;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
}

export interface PlanDetail extends PlanSummary {
  description: string | null;
  depth: string;
  autoAdvance: boolean;
  members: Array<{ id: string; displayName: string; aiModel: string }>;
}

export interface PlanTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface CreatePlanPayload {
  name: string;
  goal: string;
  templateId?: string;
  depth?: string;
}

// ==================== API ====================

export async function createPlan(
  dto: CreatePlanPayload
): Promise<{ planId: string }> {
  return fetchWithAuth('/api/v1/ai-planning', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function getPlans(search?: string): Promise<PlanSummary[]> {
  const params = search ? `?search=${encodeURIComponent(search)}` : '';
  return fetchWithAuth(`/api/v1/ai-planning${params}`);
}

export async function getTemplates(): Promise<PlanTemplate[]> {
  return fetchWithAuth('/api/v1/ai-planning/templates');
}

export async function getPlanDetail(planId: string): Promise<PlanDetail> {
  return fetchWithAuth(`/api/v1/ai-planning/${planId}`);
}

export async function advancePhase(
  planId: string
): Promise<{ currentPhase: number }> {
  return fetchWithAuth(`/api/v1/ai-planning/${planId}/advance`, {
    method: 'POST',
  });
}

export async function retryPhase(planId: string, phase: number): Promise<void> {
  return fetchWithAuth(`/api/v1/ai-planning/${planId}/phase/${phase}/retry`, {
    method: 'POST',
  });
}

export async function exportPlan(planId: string): Promise<string> {
  const tokens = getAuthTokens();
  const headers: HeadersInit = {};
  if (tokens?.accessToken) {
    headers['Authorization'] = `Bearer ${tokens.accessToken}`;
  }

  const response = await fetch(
    `${API_BASE}/api/v1/ai-planning/${planId}/export`,
    { headers }
  );

  if (!response.ok) {
    throw new Error(`Export failed: HTTP ${response.status}`);
  }

  return response.text();
}

export async function deletePlan(planId: string): Promise<void> {
  return fetchWithAuth(`/api/v1/ai-planning/${planId}`, {
    method: 'DELETE',
  });
}
