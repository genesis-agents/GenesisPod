'use client';

import { useCallback } from 'react';
import { useApiGet } from '@/hooks/core';
import { apiClient } from '@/lib/api/client';
import { toast } from '@/stores';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UserAssignmentView {
  id: string;
  keyId: string;
  provider: string;
  userId: string;
  userQuotaCents: number | null;
  userSpendCents: number;
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'REVOKED';
  assignedAt: string;
  expiresAt: string | null;
  keyLabel: string;
  keyHint: string | null;
  poolRemainingCents: number | null;
  note: string | null;
}

export interface MyKeyRequest {
  id: string;
  // 2026-05-08: 用户提交时不再选 provider；后端字段保留 nullable 仅为兼容历史数据
  provider: string | null;
  reason: string | null;
  estimatedUsage: 'LIGHT' | 'MEDIUM' | 'HEAVY' | null;
  note: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  rejectionReason: string | null;
  createdAt: string;
  handledAt: string | null;
}

export interface AvailableModelsResponse {
  availableProviders: string[];
  modelType: string;
  models: Array<{
    id: string;
    name: string;
    displayName: string;
    modelId: string;
    provider: string;
    modelType: string;
    isReasoning: boolean;
    maxTokens: number;
    priority: number;
  }>;
}

export interface OnboardingStatus {
  byokOnboardedAt: string | null;
  isAdmin: boolean;
  requiresOnboarding: boolean;
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useMyKeyAssignments() {
  const {
    data,
    loading,
    error,
    execute: refresh,
  } = useApiGet<{
    items: UserAssignmentView[];
  }>('/user/key-assignments', { immediate: true });
  return { assignments: data?.items ?? [], loading, error, refresh };
}

export function useMyKeyRequests() {
  const {
    data,
    loading,
    error,
    execute: refresh,
  } = useApiGet<{
    items: MyKeyRequest[];
  }>('/user/key-requests', { immediate: true });

  const submit = useCallback(
    async (input: {
      reason?: string;
      estimatedUsage?: 'LIGHT' | 'MEDIUM' | 'HEAVY';
      note?: string;
    }): Promise<MyKeyRequest | null> => {
      try {
        const req = await apiClient.post<MyKeyRequest>(
          '/user/key-requests',
          input
        );
        await refresh();
        toast.success('申请已提交，管理员处理后会通知你');
        return req;
      } catch (err) {
        toast.error((err as Error).message || '申请失败');
        return null;
      }
    },
    [refresh]
  );

  const cancel = useCallback(
    async (id: string) => {
      try {
        await apiClient.delete(`/user/key-requests/${id}`);
        await refresh();
        toast.success('已撤销申请');
        return true;
      } catch (err) {
        toast.error((err as Error).message || '撤销失败');
        return false;
      }
    },
    [refresh]
  );

  return {
    requests: data?.items ?? [],
    loading,
    error,
    refresh,
    submit,
    cancel,
  };
}

export function useAvailableModels(modelType?: string) {
  const qs = modelType ? `?modelType=${encodeURIComponent(modelType)}` : '';
  const {
    data,
    loading,
    error,
    execute: refresh,
  } = useApiGet<AvailableModelsResponse>(`/user/available-models${qs}`, {
    immediate: true,
    cacheKey: `available-models-${modelType ?? 'CHAT'}`,
    cacheTTL: 60_000,
  });
  return {
    availableProviders: data?.availableProviders ?? [],
    models: data?.models ?? [],
    modelType: data?.modelType ?? 'CHAT',
    loading,
    error,
    refresh,
  };
}

export function useOnboardingStatus() {
  const {
    data,
    loading,
    error,
    execute: refresh,
  } = useApiGet<OnboardingStatus>('/user/onboarding/status', {
    immediate: true,
  });

  const complete = useCallback(async () => {
    try {
      await apiClient.patch('/user/onboarding/complete', {});
      await refresh();
      return true;
    } catch (err) {
      toast.error((err as Error).message || '标记引导完成失败');
      return false;
    }
  }, [refresh]);

  return {
    status: data,
    loading,
    error,
    refresh,
    complete,
  };
}
