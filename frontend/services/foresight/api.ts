/**
 * AI 前瞻（Foresight）API client
 *
 * 后端走全局 ResponseTransformInterceptor，响应被包成
 *   { success: true, data: {...}, metadata: {...} }
 * 所有调用 unwrapStandard() 取出 .data。
 */

import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';

const API_BASE = `${config.apiBaseUrl}/api/v1/foresight`;

export interface ForesightSource {
  org: string;
  title: string;
  type: string;
  url: string;
}

export interface ForesightScenario {
  scenario: string;
  p: number;
  conf: number;
}

export interface ForesightCard {
  id: string;
  cardKey: string;
  layer: string;
  title: string;
  claim: string;
  conf: number;
  sens: 'high' | 'mid' | 'low';
  horizon: number;
  stage: 'current' | 'evolving' | 'exploring' | 'research';
  evidence: string[];
  falsifiers: string[];
  sources: ForesightSource[];
  scenarios: ForesightScenario[] | null;
  originType: string;
}

export interface ForesightEdge {
  id: string;
  fromCardId: string;
  toCardId: string;
  metric: string;
  type: 'flow' | 'constrain';
  weight: number;
}

export interface ForesightSignalBasis {
  falsifier?: string;
  dir?: string;
  threshold?: string;
  observed?: string;
  gradeNote?: string;
  sources?: ForesightSource[];
}

export interface ForesightSignal {
  id: string;
  name: string;
  targetCardId: string;
  direction: 'down' | 'up';
  targetConf: number;
  effect: string;
  basis: ForesightSignalBasis;
  grade: 'strong' | 'weak' | 'none';
  status: 'candidate' | 'injected' | 'archived';
  injectedAt: string | null;
}

export interface ForesightReviewItem {
  id: string;
  signalId: string;
  cardId: string;
  impact: number;
  depth: number;
  isSource: boolean;
  status: 'pending' | 'resolved';
  decision: 'adjust' | 'keep' | null;
  confFrom: number | null;
  confTo: number | null;
}

export interface ForesightConclusion {
  id: string;
  conclKey: string;
  title: string;
  body: string;
  decisions: string[];
  trigger: string;
  upstreamKeys: string[];
  conf: number;
  horizon: number;
}

export interface ForesightConfLog {
  id: string;
  fromConf: number;
  toConf: number;
  actor: string;
  reason: string;
  createdAt: string;
}

export interface ForesightOverview {
  cards: ForesightCard[];
  edges: ForesightEdge[];
  signals: ForesightSignal[];
  reviewItems: ForesightReviewItem[];
  conclusions: ForesightConclusion[];
}

export interface InjectResult {
  signalId: string;
  markedCount: number;
  observed: Array<{ cardId: string; impact: number }>;
  impact: Record<string, number>;
}

function unwrapStandard<T>(raw: unknown): T {
  if (raw && typeof raw === 'object' && 'data' in raw) {
    const wrapper = raw as { data?: unknown };
    if (wrapper.data !== undefined && wrapper.data !== null) {
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
    const body = await res.text().catch(() => '');
    throw new Error(`foresight api ${res.status}: ${body.slice(0, 300)}`);
  }
  return unwrapStandard<T>(await res.json());
}

export function fetchOverview(): Promise<ForesightOverview> {
  return request<ForesightOverview>('/overview');
}

export function seedDemo(): Promise<{ seeded: boolean }> {
  return request<{ seeded: boolean }>('/seed', { method: 'POST' });
}

export function injectSignal(signalId: string): Promise<InjectResult> {
  return request<InjectResult>(
    `/signals/${encodeURIComponent(signalId)}/inject`,
    { method: 'POST' }
  );
}

export function resolveReview(
  itemId: string,
  decision: 'adjust' | 'keep'
): Promise<{ item: ForesightReviewItem; card: ForesightCard }> {
  return request(`/review/${encodeURIComponent(itemId)}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ decision }),
  });
}

export function fetchLedger(cardId: string): Promise<ForesightConfLog[]> {
  return request<ForesightConfLog[]>(
    `/cards/${encodeURIComponent(cardId)}/ledger`
  );
}
