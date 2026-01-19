import { useApiGet, useApiPost } from '../core';
import { apiClient } from '@/lib/api/client';
import { useCallback, useState } from 'react';

export type SecretCategory =
  | 'AI_MODEL'
  | 'SEARCH'
  | 'EXTRACTION'
  | 'YOUTUBE'
  | 'TTS'
  | 'SKILLSMP'
  | 'OTHER';

export interface Secret {
  id: string;
  name: string;
  displayName: string;
  category: SecretCategory;
  description: string | null;
  provider: string | null;
  isActive: boolean;
  maskedValue: string;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string | null;
  accessCount: number;
  expiresAt: string | null;
  lastRotatedAt: string | null;
}

export interface SecretAccessLog {
  id: string;
  secretId: string | null;
  action: string;
  actionStatus: string;
  secretName: string | null;
  userId: string | null;
  userEmail: string | null;
  ipAddress: string | null;
  timestamp: string;
}

export interface CreateSecretDto {
  name: string;
  displayName: string;
  value: string;
  category?: SecretCategory;
  description?: string;
  provider?: string;
  expiresAt?: string;
  isActive?: boolean;
}

export interface UpdateSecretDto {
  displayName?: string;
  description?: string;
  category?: SecretCategory;
  provider?: string;
  expiresAt?: string;
  isActive?: boolean;
  value?: string;
}

export function useAdminSecrets() {
  const [updateLoading, setUpdateLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [getValueLoading, setGetValueLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);

  // 列表查询
  const {
    data: secrets,
    loading: listLoading,
    error: listError,
    execute: refreshSecrets,
  } = useApiGet<Secret[]>('/api/admin/secrets', {
    immediate: true,
  });

  // 获取密钥名称列表
  const { data: secretNames, execute: refreshSecretNames } = useApiGet<
    string[]
  >('/api/admin/secrets/names', {
    immediate: true,
  });

  // 创建密钥
  const {
    loading: createLoading,
    error: createError,
    execute: createSecretApi,
  } = useApiPost<Secret, CreateSecretDto>('/api/admin/secrets');

  const createSecret = useCallback(
    async (data: CreateSecretDto) => {
      const result = await createSecretApi(data);
      if (result) {
        await refreshSecrets();
        await refreshSecretNames();
      }
      return result;
    },
    [createSecretApi, refreshSecrets, refreshSecretNames]
  );

  const updateSecret = useCallback(
    async (name: string, data: UpdateSecretDto) => {
      setUpdateLoading(true);
      try {
        const result = await apiClient.patch<Secret>(
          `/api/admin/secrets/${name}`,
          data
        );
        await refreshSecrets();
        return result;
      } finally {
        setUpdateLoading(false);
      }
    },
    [refreshSecrets]
  );

  const deleteSecret = useCallback(
    async (name: string) => {
      setDeleteLoading(true);
      try {
        await apiClient.delete(`/api/admin/secrets/${name}`);
        await refreshSecrets();
        await refreshSecretNames();
      } finally {
        setDeleteLoading(false);
      }
    },
    [refreshSecrets, refreshSecretNames]
  );

  const getSecretValue = useCallback(
    async (name: string): Promise<string | null> => {
      setGetValueLoading(true);
      try {
        const result = await apiClient.get<{ value: string }>(
          `/api/admin/secrets/${name}/value`
        );
        return result?.value ?? null;
      } finally {
        setGetValueLoading(false);
      }
    },
    []
  );

  const getAccessLogs = useCallback(
    async (name: string, limit = 50): Promise<SecretAccessLog[]> => {
      setLogsLoading(true);
      try {
        const result = await apiClient.get<SecretAccessLog[]>(
          `/api/admin/secrets/${name}/logs?limit=${limit}`
        );
        return result ?? [];
      } finally {
        setLogsLoading(false);
      }
    },
    []
  );

  return {
    // 数据
    secrets: secrets ?? [],
    secretNames: secretNames ?? [],

    // 加载状态
    loading: listLoading || createLoading || updateLoading || deleteLoading,
    isRefreshing: listLoading,

    // 错误状态
    error: listError || createError,

    // 操作方法
    refreshSecrets,
    refreshSecretNames,
    createSecret,
    updateSecret,
    deleteSecret,
    getSecretValue,
    getAccessLogs,

    // 操作状态
    isCreating: createLoading,
    isUpdating: updateLoading,
    isDeleting: deleteLoading,
    isGettingValue: getValueLoading,
    isLoadingLogs: logsLoading,
  };
}
