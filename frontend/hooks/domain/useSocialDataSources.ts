/**
 * useSocialDataSources — 列出当前注册的所有 social data sources（descriptor 列表）
 *
 * GET /api/v1/ai-social/data-sources → { items: SocialDataSourceDescriptor[] }
 * 由 SocialDataSourceRegistry 自动发现（@nestjs/core DiscoveryService）。
 */

import useSWR from 'swr';
import { listSocialDataSources } from '@/services/ai-social/task-api';
import type { SocialDataSourceDescriptor } from '@/services/ai-social/task-types';
import { logger } from '@/lib/utils/logger';

const KEY = ['ai-social', 'data-sources'] as const;

export function useSocialDataSources() {
  const { data, error, isLoading, mutate } = useSWR<{
    items: SocialDataSourceDescriptor[];
  }>(
    KEY,
    async () => {
      try {
        const result = await listSocialDataSources();
        logger.info(
          '[useSocialDataSources]',
          `response items=${result?.items?.length ?? 0}`,
          result
        );
        return result;
      } catch (err) {
        logger.error('[useSocialDataSources] fetch failed:', err);
        throw err;
      }
    },
    {
      revalidateOnFocus: false,
      revalidateIfStale: true, // 允许重新拉取，应对部署期临时空
      refreshInterval: 30000, // 30s 兜底刷一次（部署完后自动恢复）
    }
  );

  return {
    sources: data?.items ?? [],
    error,
    isLoading,
    refresh: mutate,
  };
}
