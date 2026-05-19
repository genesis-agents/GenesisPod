/**
 * useSocialDataSources — 列出当前注册的所有 social data sources（descriptor 列表）
 *
 * GET /api/v1/ai-social/data-sources → { items: SocialDataSourceDescriptor[] }
 * 由 SocialDataSourceRegistry 自动发现（@nestjs/core DiscoveryService）。
 */

import useSWR from 'swr';
import { listSocialDataSources } from '@/services/ai-social/task-api';
import type { SocialDataSourceDescriptor } from '@/services/ai-social/task-types';

const KEY = ['ai-social', 'data-sources'] as const;

export function useSocialDataSources() {
  const { data, error, isLoading, mutate } = useSWR<{
    items: SocialDataSourceDescriptor[];
  }>(KEY, listSocialDataSources, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });

  return {
    sources: data?.items ?? [],
    error,
    isLoading,
    refresh: mutate,
  };
}
