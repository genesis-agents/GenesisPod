/**
 * useFavoritesList — FC-6
 *
 * GET /api/v1/radar/favorites?limit=N
 * 返回带 signal 内容的丰富列表
 */
import { useApiGet } from '@/hooks/core';
import type { ApiError } from '@/lib/api/client';

interface DailySignalForFavorite {
  id: string;
  tier: 1 | 2 | 3;
  title: string;
  oneLineTakeaway: string;
  whyItMatters: string;
  whatsNext: string;
  signalTags: string[];
  entities: string[];
  evidenceItemIds: string[];
  narrativeId?: string;
}

export interface FavoriteWithSignalView {
  signalId: string;
  topicId: string;
  topicName: string;
  favoritedAt: string;
  signal: DailySignalForFavorite | null;
  briefingDate: string | null;
}

export function useFavoritesList(limit = 50): {
  data: FavoriteWithSignalView[];
  loading: boolean;
  error: ApiError | null;
  refresh: () => Promise<void>;
} {
  const path = `/api/v1/radar/favorites?limit=${limit}`;
  const { data, loading, error, refresh } = useApiGet<FavoriteWithSignalView[]>(
    path,
    { immediate: true, deps: [limit] },
  );
  return {
    data: data ?? [],
    loading,
    error,
    refresh: async () => {
      await refresh();
    },
  };
}
