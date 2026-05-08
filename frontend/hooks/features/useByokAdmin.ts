'use client';

import { useCallback, useState } from 'react';
import { useApiGet } from '@/hooks/core';
import { apiClient } from '@/lib/api/client';
import { toast } from '@/stores';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DistributableKeyView {
  id: string;
  provider: string;
  label: string;
  keyHint: string | null;
  apiEndpoint: string | null;
  monthlyQuotaCents: number | null;
  currentSpendCents: number;
  quotaResetAt: string;
  isActive: boolean;
  expiresAt: string | null;
  activeAssignmentCount: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface AssignmentView {
  id: string;
  keyId: string;
  provider: string;
  userId: string;
  userQuotaCents: number | null;
  userSpendCents: number;
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'REVOKED';
  assignedAt: string;
  assignedBy: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  revokedReason: string | null;
  note: string | null;
}

export interface KeyRequestView {
  id: string;
  userId: string;
  provider: string;
  reason: string | null;
  estimatedUsage: 'LIGHT' | 'MEDIUM' | 'HEAVY' | null;
  note: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  handledBy: string | null;
  handledAt: string | null;
  rejectionReason: string | null;
  resultingAssignmentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ByokDashboardMetrics {
  totalKeys: number;
  activeKeys: number;
  activeAssignments: number;
  pendingRequests: number;
  monthlySpendCents: number;
  monthlyQuotaCents: number | null;
  utilizationPercent: number | null;
}

// ─── Distributable Keys ──────────────────────────────────────────────────────

export function useDistributableKeys(filters?: {
  provider?: string;
  isActive?: boolean;
}) {
  const query = new URLSearchParams();
  if (filters?.provider) query.set('provider', filters.provider);
  if (filters?.isActive !== undefined)
    query.set('isActive', String(filters.isActive));
  const qs = query.toString();

  const {
    data,
    loading,
    error,
    execute: refresh,
  } = useApiGet<{
    items: DistributableKeyView[];
  }>(`/admin/distributable-keys${qs ? `?${qs}` : ''}`, { immediate: true });

  const [mutating, setMutating] = useState(false);

  const create = useCallback(
    async (input: {
      provider: string;
      label: string;
      apiKey: string;
      apiEndpoint?: string;
      monthlyQuotaCents?: number;
      expiresAt?: string;
    }): Promise<DistributableKeyView | null> => {
      setMutating(true);
      try {
        const result = await apiClient.post<DistributableKeyView>(
          '/admin/distributable-keys',
          input
        );
        await refresh();
        toast.success('Key 已添加到分发池');
        return result;
      } catch (err) {
        toast.error((err as Error).message || '创建失败');
        return null;
      } finally {
        setMutating(false);
      }
    },
    [refresh]
  );

  const update = useCallback(
    async (
      id: string,
      patch: Partial<DistributableKeyView> & { apiKey?: string }
    ) => {
      setMutating(true);
      try {
        await apiClient.patch(`/admin/distributable-keys/${id}`, patch);
        await refresh();
        toast.success('已更新');
        return true;
      } catch (err) {
        toast.error((err as Error).message || '更新失败');
        return false;
      } finally {
        setMutating(false);
      }
    },
    [refresh]
  );

  const deactivate = useCallback(
    async (id: string) => {
      setMutating(true);
      try {
        await apiClient.delete(`/admin/distributable-keys/${id}`);
        await refresh();
        toast.success('Key 已停用');
        return true;
      } catch (err) {
        toast.error((err as Error).message || '停用失败');
        return false;
      } finally {
        setMutating(false);
      }
    },
    [refresh]
  );

  return {
    keys: data?.items || [],
    loading,
    error,
    mutating,
    refresh,
    create,
    update,
    deactivate,
  };
}

export function useDistributableKeyDetail(id: string | null) {
  const {
    data,
    loading,
    error,
    execute: refresh,
  } = useApiGet<{
    key: DistributableKeyView;
    assignments: AssignmentView[];
  }>(`/admin/distributable-keys/${id ?? ''}`, {
    immediate: !!id,
    deps: [id],
  });
  return {
    key: data?.key ?? null,
    assignments: data?.assignments ?? [],
    loading,
    error,
    refresh,
  };
}

// ─── Admin Assignments ───────────────────────────────────────────────────────

export function useAdminKeyAssignments(filters?: {
  status?: string;
  provider?: string;
}) {
  const query = new URLSearchParams();
  if (filters?.status) query.set('status', filters.status);
  if (filters?.provider) query.set('provider', filters.provider);
  const qs = query.toString();
  const {
    data,
    loading,
    error,
    execute: refresh,
  } = useApiGet<{
    items: AssignmentView[];
  }>(`/admin/key-assignments${qs ? `?${qs}` : ''}`, { immediate: true });

  const revoke = useCallback(
    async (id: string, reason?: string) => {
      try {
        await apiClient.delete(`/admin/key-assignments/${id}`, {
          body: JSON.stringify({ reason }),
          headers: { 'Content-Type': 'application/json' },
        });
        await refresh();
        toast.success('分配已撤销');
        return true;
      } catch (err) {
        toast.error((err as Error).message || '撤销失败');
        return false;
      }
    },
    [refresh]
  );

  const updateAssignment = useCallback(
    async (
      id: string,
      patch: {
        userQuotaCents?: number | null;
        expiresAt?: string | null;
        note?: string | null;
        status?: 'ACTIVE' | 'SUSPENDED';
      }
    ) => {
      try {
        await apiClient.patch(`/admin/key-assignments/${id}`, patch);
        await refresh();
        toast.success('已更新');
        return true;
      } catch (err) {
        toast.error((err as Error).message || '更新失败');
        return false;
      }
    },
    [refresh]
  );

  return {
    assignments: data?.items || [],
    loading,
    error,
    refresh,
    revoke,
    updateAssignment,
  };
}

// ─── Admin Key Requests ──────────────────────────────────────────────────────

export function useAdminKeyRequests(filters?: { status?: string }) {
  const query = new URLSearchParams();
  if (filters?.status) query.set('status', filters.status);
  const qs = query.toString();
  const {
    data,
    loading,
    error,
    execute: refresh,
  } = useApiGet<{
    items: KeyRequestView[];
  }>(`/admin/key-requests${qs ? `?${qs}` : ''}`, { immediate: true });

  const approve = useCallback(
    async (
      id: string,
      input: {
        keyId: string;
        userQuotaCents?: number | null;
        expiresAt?: string | null;
        note?: string;
      }
    ) => {
      try {
        await apiClient.post(`/admin/key-requests/${id}/approve`, input);
        await refresh();
        toast.success('申请已批准并完成分配');
        return true;
      } catch (err) {
        toast.error((err as Error).message || '批准失败');
        return false;
      }
    },
    [refresh]
  );

  const reject = useCallback(
    async (id: string, reason: string) => {
      try {
        await apiClient.post(`/admin/key-requests/${id}/reject`, { reason });
        await refresh();
        toast.success('申请已拒绝');
        return true;
      } catch (err) {
        toast.error((err as Error).message || '拒绝失败');
        return false;
      }
    },
    [refresh]
  );

  return {
    requests: data?.items || [],
    loading,
    error,
    refresh,
    approve,
    reject,
  };
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export function useByokDashboard() {
  const {
    data,
    loading,
    error,
    execute: refresh,
  } = useApiGet<ByokDashboardMetrics>('/admin/byok-dashboard', {
    immediate: true,
    cacheKey: 'byok-dashboard',
    cacheTTL: 60_000,
  });
  return { metrics: data, loading, error, refresh };
}

// ─── Util ────────────────────────────────────────────────────────────────────

export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '无限';
  return `$${(cents / 100).toFixed(2)}`;
}
