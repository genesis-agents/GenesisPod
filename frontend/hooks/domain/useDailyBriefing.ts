import { useCallback } from 'react';
import { useApiGet } from '@/hooks/core';
import type { ApiError } from '@/lib/api/client';

export interface DailySignalView {
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

export interface DailyBriefingView {
  id: string;
  topicId: string;
  briefingDate: string;
  status: 'completed' | 'no_signals' | 'generating';
  signals: DailySignalView[];
  generationRunId?: string;
}

export function useDailyBriefing(
  topicId: string | null,
  date?: string
): {
  data: DailyBriefingView | null;
  loading: boolean;
  error: ApiError | null;
  refresh: () => Promise<void>;
} {
  const params = date ? `?date=${date}` : '';
  const path = topicId
    ? `/api/v1/radar/topics/${topicId}/daily-briefing${params}`
    : '';

  const {
    data,
    loading,
    error,
    refresh: apiRefresh,
  } = useApiGet<DailyBriefingView>(path, {
    immediate: !!topicId,
    deps: [topicId, date],
  });

  const refresh = useCallback(async () => {
    if (topicId) {
      await apiRefresh();
    }
  }, [topicId, apiRefresh]);

  return {
    data: data ?? null,
    loading: topicId ? loading : false,
    error: error,
    refresh,
  };
}
