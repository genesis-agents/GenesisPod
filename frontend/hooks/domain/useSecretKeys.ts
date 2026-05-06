/**
 * 多 KEY 管理 hook（admin /admin/secrets/:secretId/keys/*）
 *
 * 一个 secret 下 N 个 KEY 行 CRUD + test。
 * 与 useAdminSecrets 是兄弟关系，独立加载。
 */

import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '@/lib/api/client';

export interface SecretKeyRow {
  id: string;
  secretId: string;
  label: string;
  keyHint: string | null;
  isActive: boolean;
  priority: number;
  testStatus: 'success' | 'failed' | null;
  lastTestedAt: string | null;
  lastErrorMessage: string | null;
  accessCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AddKeyInput {
  label: string;
  value: string;
  priority?: number;
  isActive?: boolean;
}

export interface UpdateKeyMetaInput {
  label?: string;
  priority?: number;
  isActive?: boolean;
}

export function useSecretKeys(secretId: string | null) {
  const [keys, setKeys] = useState<SecretKeyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    if (!secretId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<SecretKeyRow[]>(
        `/admin/secrets/${secretId}/keys`
      );
      setKeys(data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load keys');
    } finally {
      setLoading(false);
    }
  }, [secretId]);

  useEffect(() => {
    if (secretId) void load();
    else setKeys([]);
  }, [secretId, load]);

  const addKey = useCallback(
    async (input: AddKeyInput) => {
      if (!secretId) return;
      setActionLoading(true);
      try {
        await apiClient.post(`/admin/secrets/${secretId}/keys`, input);
        await load();
      } finally {
        setActionLoading(false);
      }
    },
    [secretId, load]
  );

  const updateKeyMeta = useCallback(
    async (keyId: string, meta: UpdateKeyMetaInput) => {
      if (!secretId) return;
      setActionLoading(true);
      try {
        await apiClient.patch(`/admin/secrets/${secretId}/keys/${keyId}`, meta);
        await load();
      } finally {
        setActionLoading(false);
      }
    },
    [secretId, load]
  );

  const replaceKeyValue = useCallback(
    async (keyId: string, value: string) => {
      if (!secretId) return;
      setActionLoading(true);
      try {
        await apiClient.put(`/admin/secrets/${secretId}/keys/${keyId}/value`, {
          value,
        });
        await load();
      } finally {
        setActionLoading(false);
      }
    },
    [secretId, load]
  );

  const deleteKey = useCallback(
    async (keyId: string) => {
      if (!secretId) return;
      setActionLoading(true);
      try {
        await apiClient.delete(`/admin/secrets/${secretId}/keys/${keyId}`);
        await load();
      } finally {
        setActionLoading(false);
      }
    },
    [secretId, load]
  );

  const testKey = useCallback(
    async (keyId: string) => {
      if (!secretId) return;
      setActionLoading(true);
      try {
        await apiClient.post(
          `/admin/secrets/${secretId}/keys/${keyId}/test`,
          {}
        );
        await load();
      } finally {
        setActionLoading(false);
      }
    },
    [secretId, load]
  );

  return {
    keys,
    loading,
    error,
    actionLoading,
    refresh: load,
    addKey,
    updateKeyMeta,
    replaceKeyValue,
    deleteKey,
    testKey,
  };
}
