'use client';

/**
 * E R4 Phase 2 (PR-E2, 2026-05-05): 拉 5 步向导选项的 hook
 *
 * skills / tools / models 来自 ai-engine registry，每次 mount 调用一次。
 */
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import type { CustomAgentOptions } from './types';

export function useCustomAgentOptions(): {
  options: CustomAgentOptions | null;
  loading: boolean;
  error: string | null;
} {
  const [options, setOptions] = useState<CustomAgentOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient
      .get<CustomAgentOptions>('/user/custom-agents/options')
      .then((data) => {
        if (cancelled) return;
        setOptions(data);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : '加载选项失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { options, loading, error };
}
