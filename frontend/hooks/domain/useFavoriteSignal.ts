import { useState, useCallback } from 'react';
import { useApiPost } from '@/hooks/core';
import type { ApiError } from '@/lib/api/client';

interface FavoriteToggleResponse {
  // 后端返回字段（与 favorite.service.ts toggle 返回值对齐）
  favorited: boolean;
}

interface FavoriteToggleBody {
  signalId: string;
  topicId: string;
}

export function useFavoriteSignal(
  signalId: string | null,
  topicId: string | null
): {
  isFavorited: boolean;
  loading: boolean;
  error: ApiError | null;
  toggle: () => Promise<void>;
} {
  const [isFavorited, setIsFavorited] = useState(false);

  const {
    loading,
    error,
    execute: toggleApi,
  } = useApiPost<FavoriteToggleResponse, FavoriteToggleBody>(
    '/api/v1/radar/favorites/toggle'
  );

  const toggle = useCallback(async () => {
    if (!signalId || !topicId) return;

    // Optimistic update
    const previous = isFavorited;
    setIsFavorited(!previous);

    const result = await toggleApi({ signalId, topicId });
    if (result === undefined) {
      // Request failed — rollback
      setIsFavorited(previous);
    } else {
      setIsFavorited(result.favorited);
    }
  }, [signalId, topicId, isFavorited, toggleApi]);

  return {
    isFavorited: signalId ? isFavorited : false,
    loading,
    error,
    toggle,
  };
}
