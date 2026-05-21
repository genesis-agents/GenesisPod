/**
 * AI Radar API client
 *
 * 后端走全局 ResponseTransformInterceptor → { success, data, metadata }，
 * 通过 unwrapStandard 取 .data。
 */

import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import type {
  CancelRunResponse,
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
  TriggerRefreshResponse,
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

// ── Run 实时事件流回放（对齐 playground /replay）──────────

export interface RadarStreamEvent {
  type: string;
  payload: unknown;
  timestamp: number;
}

export interface RadarReplayResponse {
  events: RadarStreamEvent[];
  serverNow: number;
}

/**
 * GET /radar/replay/:runId?since=ts —— 从后端 RadarMissionEventBuffer 读累积事件。
 * 前端 useRadarStream：进页面 hydrate + WS 失败 polling 兜底。
 */
export async function replayRadarRun(
  runId: string,
  sinceTs?: number
): Promise<RadarReplayResponse> {
  const qs =
    sinceTs != null ? `?since=${encodeURIComponent(String(sinceTs))}` : '';
  return request<RadarReplayResponse>(
    `/replay/${encodeURIComponent(runId)}${qs}`
  );
}

// ── Topic ─────────────────────────────────────────────

export async function listTopics(
  opts: {
    status?: RadarTopicStatus;
    limit?: number;
    cursor?: string;
    q?: string;
  } = {}
): Promise<{ items: RadarTopicWithCounts[]; nextCursor: string | null }> {
  const qs = new URLSearchParams();
  if (opts.status) qs.set('status', opts.status);
  if (opts.limit) qs.set('limit', String(opts.limit));
  if (opts.cursor) qs.set('cursor', opts.cursor);
  if (opts.q && opts.q.trim()) qs.set('q', opts.q.trim());
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return request<{ items: RadarTopicWithCounts[]; nextCursor: string | null }>(
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

export async function setVisibility(
  id: string,
  visibility: 'PRIVATE' | 'SHARED' | 'PUBLIC'
): Promise<RadarTopic> {
  return request<RadarTopic>(`/topics/${id}/visibility`, {
    method: 'PATCH',
    body: JSON.stringify({ visibility }),
  });
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

export interface RecommendSourcesResult {
  /** preflight 已验证可达的候选 */
  candidates: RecommendedSource[];
  /** R7 2026-05-19：preflight 阶段过滤掉的不可达源 + 原因 */
  skipped: Array<{ type: string; identifier: string; reason: string }>;
  /** LLM 原始召回总数 = candidates.length + skipped.length */
  totalGenerated: number;
}

export async function recommendSources(
  topicId: string,
  perTypeLimit?: number
): Promise<RecommendSourcesResult> {
  // R7 2026-05-19：backend 在推荐阶段就 preflight，前端不再"接受后才发现 5/6 失败"。
  // skipped + totalGenerated 用于 UI 展示"AI 推荐 N 个，已过滤 M 个不可达"。
  return request<RecommendSourcesResult>(
    `/topics/${topicId}/sources/recommend`,
    {
      method: 'POST',
      body: JSON.stringify(perTypeLimit ? { perTypeLimit } : {}),
    }
  );
}

export interface AcceptRecommendedSourcesResult {
  created: RadarSource[];
  /** preflight 后剔除的源（不可达 / 死链 / shape 错），前端可提示用户 */
  skipped: Array<{ type: string; identifier: string; reason: string }>;
}

export async function acceptRecommendedSources(
  topicId: string,
  candidates: RecommendedSource[]
): Promise<AcceptRecommendedSourcesResult> {
  // 2026-05-18：backend accept 路径加 preflight（CollectorRouter.fanOut 真发
  // 一次拉取），LLM hallucinate 的死链 / 解析失败的 @handle 不再入库，返回
  // { created, skipped } 让前端展示"接受 N，过滤 M 个不可达"。
  return request<AcceptRecommendedSourcesResult>(
    `/topics/${topicId}/sources/recommend/accept`,
    {
      method: 'POST',
      body: JSON.stringify({ candidates }),
    }
  );
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

/** 单 run 详情（mission 详情页用） */
export async function getRun(runId: string): Promise<RadarRun> {
  return request<RadarRun>(`/runs/${runId}`);
}

export async function triggerRefresh(
  topicId: string
): Promise<TriggerRefreshResponse> {
  return request<TriggerRefreshResponse>(`/topics/${topicId}/refresh`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function cancelRun(runId: string): Promise<CancelRunResponse> {
  return request<CancelRunResponse>(`/runs/${runId}/cancel`, {
    method: 'POST',
  });
}
