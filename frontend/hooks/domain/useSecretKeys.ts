/**
 * 多 KEY 管理 hook（admin /admin/secrets/:secretId/keys/*）
 *
 * 一个 secret 下 N 个 KEY 行 CRUD + test。
 * 与 useAdminSecrets 是兄弟关系，独立加载。
 */

import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '@/lib/api/client';
import { toast } from '@/stores';

export interface SecretKeyRow {
  id: string;
  secretId: string;
  label: string;
  keyHint: string | null;
  isActive: boolean;
  priority: number;
  testStatus: 'success' | 'failed' | null;
  lastTestedAt: string | null;
  /** ★ 2026-05-06: 归一化错误码 — AUTH_FAILED / RATE_LIMIT_KEY / QUOTA_EXCEEDED /
   *   PROVIDER_DOWN / TIMEOUT / NETWORK_ERROR / DECRYPTION_FAILED / UNKNOWN */
  lastErrorCode: string | null;
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

  const runAction = useCallback(
    async (verb: string, fn: () => Promise<unknown>) => {
      setActionLoading(true);
      try {
        await fn();
        await load();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : `Failed to ${verb} key`;
        toast.error(msg);
        throw err;
      } finally {
        setActionLoading(false);
      }
    },
    [load]
  );

  const addKey = useCallback(
    async (input: AddKeyInput) => {
      if (!secretId) return;
      await runAction('add', () =>
        apiClient.post(`/admin/secrets/${secretId}/keys`, input)
      );
    },
    [secretId, runAction]
  );

  const updateKeyMeta = useCallback(
    async (keyId: string, meta: UpdateKeyMetaInput) => {
      if (!secretId) return;
      await runAction('update', () =>
        apiClient.patch(`/admin/secrets/${secretId}/keys/${keyId}`, meta)
      );
    },
    [secretId, runAction]
  );

  const replaceKeyValue = useCallback(
    async (keyId: string, value: string) => {
      if (!secretId) return;
      await runAction('replace', () =>
        apiClient.put(`/admin/secrets/${secretId}/keys/${keyId}/value`, {
          value,
        })
      );
    },
    [secretId, runAction]
  );

  const deleteKey = useCallback(
    async (keyId: string) => {
      if (!secretId) return;
      await runAction('delete', () =>
        apiClient.delete(`/admin/secrets/${secretId}/keys/${keyId}`)
      );
    },
    [secretId, runAction]
  );

  const testKey = useCallback(
    async (keyId: string) => {
      if (!secretId) return;
      await runAction('test', () =>
        apiClient.post(`/admin/secrets/${secretId}/keys/${keyId}/test`, {})
      );
    },
    [secretId, runAction]
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
