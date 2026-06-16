/**
 * 系统数据流图 API client。
 * 后端走全局 ResponseTransformInterceptor → { success, data, metadata }，取 .data。
 */

import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { apiError } from '@/lib/utils/api-error';
import type { DataFlowGraph, DataFlowMetrics } from './types';

const API_BASE = `${config.apiBaseUrl}/api/v1/admin/data-flow`;

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
    throw await apiError(res);
  }
  const raw = (await res.json()) as unknown;
  return unwrapStandard<T>(raw);
}

/** ① 真实拓扑（节点/边/层 + live 标注）。 */
export function getDataFlowGraph(): Promise<DataFlowGraph> {
  return request<DataFlowGraph>('/graph');
}

/** ② 真实流量（AIUsageLog 聚合，windowHours 回看窗口）。 */
export function getDataFlowMetrics(windowHours = 24): Promise<DataFlowMetrics> {
  return request<DataFlowMetrics>(`/metrics?window=${windowHours}`);
}
