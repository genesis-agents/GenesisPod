import { useCallback } from 'react';
import { useApiGet } from '@/hooks/core';
import { apiClient } from '@/lib/api/client';
import { toast } from '@/stores';

// All SecretCategory values exposed to users (USER_DONATED excluded per spec)
export type SecretCategory =
  | 'AI_MODEL'
  | 'SEARCH'
  | 'EXTRACTION'
  | 'YOUTUBE'
  | 'TTS'
  | 'SKILLSMP'
  | 'POLICY'
  | 'FINANCE'
  | 'ACADEMIC'
  | 'WEATHER'
  | 'IMAGE_SEARCH'
  | 'DEV_TOOLS'
  | 'MCP'
  | 'OTHER';

export const SECRET_CATEGORIES: SecretCategory[] = [
  'AI_MODEL',
  'SEARCH',
  'EXTRACTION',
  'YOUTUBE',
  'TTS',
  'SKILLSMP',
  'POLICY',
  'FINANCE',
  'ACADEMIC',
  'WEATHER',
  'IMAGE_SEARCH',
  'DEV_TOOLS',
  'MCP',
  'OTHER',
];

export interface UserSecretItem {
  /** 'llm' | 'secret' — used as the :source path param */
  source: 'llm' | 'secret';
  id: string;
  name: string;
  displayName: string;
  category: string;
  provider: string | null;
  maskedValue: string;
  isActive: boolean;
  usageCount: number;
  testStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSecretBody {
  name: string;
  displayName?: string;
  category: SecretCategory;
  provider?: string;
  value: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdateSecretBody {
  value?: string;
  displayName?: string;
  description?: string;
  isActive?: boolean;
}

interface UserSecretsResponse {
  items: UserSecretItem[];
}

export function useUserSecrets() {
  const { data, loading, error, refresh } = useApiGet<UserSecretsResponse>(
    '/user/secrets',
    { immediate: true }
  );

  const secrets = data?.items ?? [];

  const createSecret = useCallback(
    async (body: CreateSecretBody): Promise<boolean> => {
      try {
        await apiClient.post('/user/secrets', body);
        toast.success('Key created');
        await refresh();
        return true;
      } catch (err) {
        toast.error((err as Error).message || 'Failed to create key');
        return false;
      }
    },
    [refresh]
  );

  const updateSecret = useCallback(
    async (
      source: 'llm' | 'secret',
      id: string,
      body: UpdateSecretBody
    ): Promise<boolean> => {
      try {
        await apiClient.put(`/user/secrets/${source}/${id}`, body);
        toast.success('Key updated');
        await refresh();
        return true;
      } catch (err) {
        toast.error((err as Error).message || 'Failed to update key');
        return false;
      }
    },
    [refresh]
  );

  const deleteSecret = useCallback(
    async (source: 'llm' | 'secret', id: string): Promise<boolean> => {
      try {
        await apiClient.delete(`/user/secrets/${source}/${id}`);
        toast.success('Key deleted');
        await refresh();
        return true;
      } catch (err) {
        toast.error((err as Error).message || 'Failed to delete key');
        return false;
      }
    },
    [refresh]
  );

  const requestSystemKey = useCallback(
    async (
      category: SecretCategory,
      targetId: string,
      reason?: string
    ): Promise<boolean> => {
      try {
        await apiClient.post('/user/authorization/requests', {
          type: 'KEY_ASSIGNMENT',
          category,
          targetId,
          reason,
        });
        toast.success('Request submitted');
        return true;
      } catch (err) {
        toast.error((err as Error).message || 'Failed to submit request');
        return false;
      }
    },
    []
  );

  return {
    secrets,
    loading,
    error,
    refresh,
    createSecret,
    updateSecret,
    deleteSecret,
    requestSystemKey,
  };
}
