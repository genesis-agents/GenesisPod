/**
 * AI Radar API client
 *
 * 后端走全局 ResponseTransformInterceptor → { success, data, metadata }，
 * 通过 unwrapStandard 取 .data。
 */

import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import type {
  CreateRadarSourceInput,
  CreateRadarTopicInput,
  RadarInsight,
  RadarItem,
  RadarRun,
  RadarSource,
  RadarSourceType,
  RadarTopic,
  RadarTopicStatus,
  RadarTopicWithCounts,
  RecommendedSource,
  RefreshRunSummary,
  UpdateRadarTopicInput,
} from './types';

const API_BASE = `${config.apiBaseUrl}/api/v1/radar`;

function unwrapStandard<T>(raw: unknown): T {
  if (raw && typeof raw === 'object' && 'data' in raw) {
    const wrapper = raw as { success?: boolean; data?: unknown };
    if (wrapper.data !== undefined) {
      return wrapper.data as T;
    }
  }
  return raw as T;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let detail = '';
    try {
      const text = await res.text();
      detail = text.length > 300 ? `${text.slice(0, 300)}…` : text;
    } catch {
      // ignore
    }
    throw new Error(`Radar API ${res.status}: ${detail || res.statusText}`);
  }
  const raw = (await res.json()) as unknown;
  return unwrapStandard<T>(raw);
}

// ── Topic ─────────────────────────────────────────────

export async function listTopics(
  opts: { status?: RadarTopicStatus; limit?: number; cursor?: string } = {}
): Promise<{ items: RadarTopic[]; nextCursor: string | null }> {
  const qs = new URLSearchParams();
  if (opts.status) qs.set('status', opts.status);
  if (opts.limit) qs.set('limit', String(opts.limit));
  if (opts.cursor) qs.set('cursor', opts.cursor);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return request<{ items: RadarTopic[]; nextCursor: string | null }>(
    `/topics${suffix}`
  );
}

export async function getTopic(id: string): Promise<RadarTopicWithCounts> {
  return request<RadarTopicWithCounts>(`/topics/${id}`);
}

export async function createTopic(
  input: CreateRadarTopicInput
): Promise<RadarTopic> {
  return request<RadarTopic>('/topics', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateTopic(
  id: string,
  input: UpdateRadarTopicInput
): Promise<RadarTopic> {
  return request<RadarTopic>(`/topics/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteTopic(id: string): Promise<void> {
  await request<{ deleted: true }>(`/topics/${id}`, { method: 'DELETE' });
}

export async function pauseTopic(id: string): Promise<RadarTopic> {
  return request<RadarTopic>(`/topics/${id}/pause`, { method: 'POST' });
}

export async function resumeTopic(id: string): Promise<RadarTopic> {
  return request<RadarTopic>(`/topics/${id}/resume`, { method: 'POST' });
}

export async function archiveTopic(id: string): Promise<RadarTopic> {
  return request<RadarTopic>(`/topics/${id}/archive`, { method: 'POST' });
}

// ── Source ────────────────────────────────────────────

export async function listSources(topicId: string): Promise<RadarSource[]> {
  return request<RadarSource[]>(`/topics/${topicId}/sources`);
}

export async function createSource(
  topicId: string,
  input: CreateRadarSourceInput
): Promise<RadarSource> {
  return request<RadarSource>(`/topics/${topicId}/sources`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/**
 * Backend UpdateRadarSourceDto 只允许改 label / config / enabled；
 * type / identifier 改了会被 ValidationPipe whitelist strip。
 */
export interface UpdateRadarSourceInput {
  label?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
}

export async function updateSource(
  sourceId: string,
  input: UpdateRadarSourceInput
): Promise<RadarSource> {
  return request<RadarSource>(`/sources/${sourceId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteSource(sourceId: string): Promise<void> {
  await request<{ deleted: true }>(`/sources/${sourceId}`, {
    method: 'DELETE',
  });
}

export async function recommendSources(
  topicId: string,
  perTypeLimit?: number
): Promise<{ candidates: RecommendedSource[] }> {
  return request<{ candidates: RecommendedSource[] }>(
    `/topics/${topicId}/sources/recommend`,
    {
      method: 'POST',
      body: JSON.stringify(perTypeLimit ? { perTypeLimit } : {}),
    }
  );
}

export async function acceptRecommendedSources(
  topicId: string,
  candidates: RecommendedSource[]
): Promise<RadarSource[]> {
  // R6 整改：原 backend 用 string[] 双重序列化是反模式；
  // 现 DTO 改为 RecommendedSourceCandidateDto[] + ValidateNested，直接发对象。
  return request<RadarSource[]>(`/topics/${topicId}/sources/recommend/accept`, {
    method: 'POST',
    body: JSON.stringify({ candidates }),
  });
}

// ── Feed ──────────────────────────────────────────────

export async function listFeed(
  topicId: string,
  opts: {
    type?: RadarSourceType;
    since?: string;
    minRelevance?: number;
    acceptedOnly?: boolean;
    limit?: number;
    cursor?: string;
  } = {}
): Promise<{ items: RadarItem[]; nextCursor: string | null }> {
  const qs = new URLSearchParams();
  if (opts.type) qs.set('type', opts.type);
  if (opts.since) qs.set('since', opts.since);
  if (opts.minRelevance != null)
    qs.set('minRelevance', String(opts.minRelevance));
  if (opts.acceptedOnly) qs.set('acceptedOnly', 'true');
  if (opts.limit) qs.set('limit', String(opts.limit));
  if (opts.cursor) qs.set('cursor', opts.cursor);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return request<{ items: RadarItem[]; nextCursor: string | null }>(
    `/topics/${topicId}/feed${suffix}`
  );
}

// ── Insight ───────────────────────────────────────────

export async function listInsights(
  topicId: string,
  limit?: number
): Promise<RadarInsight[]> {
  const qs = limit ? `?limit=${limit}` : '';
  return request<RadarInsight[]>(`/topics/${topicId}/insights${qs}`);
}

export async function getLatestInsight(
  topicId: string
): Promise<{ insight: RadarInsight | null }> {
  return request<{ insight: RadarInsight | null }>(
    `/topics/${topicId}/insights/latest`
  );
}

// ── Run ───────────────────────────────────────────────

export async function listRuns(
  topicId: string,
  limit?: number
): Promise<RadarRun[]> {
  const qs = limit ? `?limit=${limit}` : '';
  return request<RadarRun[]>(`/topics/${topicId}/runs${qs}`);
}

export async function triggerRefresh(
  topicId: string
): Promise<RefreshRunSummary> {
  return request<RefreshRunSummary>(`/topics/${topicId}/refresh`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function cancelRun(runId: string): Promise<RadarRun> {
  return request<RadarRun>(`/runs/${runId}/cancel`, { method: 'POST' });
}
