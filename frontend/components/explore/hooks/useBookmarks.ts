/**
 * Custom hook for managing bookmarks
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getAuthHeader } from '@/lib/utils/auth';
import { config } from '@/lib/utils/config';

import { logger } from '@/lib/utils/logger';
export function useBookmarks() {
  const { user } = useAuth();
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [defaultCollectionId, setDefaultCollectionId] = useState<string | null>(
    null
  );

  const loadBookmarks = useCallback(async () => {
    // Only load bookmarks if user is authenticated
    if (!user) {
      return;
    }

    try {
      const authHeaders = getAuthHeader();

      // Get all collections
      const response = await fetch(`${config.apiBaseUrl}/api/v1/collections`, {
        headers: authHeaders,
      });

      if (response.ok) {
        const collections = await response.json();

        // Find or create default collection
        let defaultCollection = collections.find(
          (c) => c.name === '我的收藏'
        );

        if (!defaultCollection) {
          // Create default collection
          const createResponse = await fetch(
            `${config.apiBaseUrl}/api/v1/collections`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...authHeaders,
              },
              body: JSON.stringify({
                name: '我的收藏',
                description: '默认收藏集',
                isPublic: false,
              }),
            }
          );

          if (createResponse.ok) {
            defaultCollection = await createResponse.json();
          }
        }

        if (defaultCollection) {
          setDefaultCollectionId(defaultCollection.id);

          // Load bookmarked resource IDs
          const bookmarkedIds = new Set<string>(
            (defaultCollection.items || []).map(
              (item) => item.resourceId as string
            )
          );
          setBookmarks(bookmarkedIds);
        }
      }
    } catch (err) {
      logger.error('Failed to load bookmarks:', err);
    }
  }, [user]);

  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

  const isBookmarked = (resourceId: string) => {
    return bookmarks.has(resourceId);
  };

  const toggleBookmark = async (
    resourceId: string,
    e?: React.MouseEvent
  ): Promise<void> => {
    if (e) {
      e.stopPropagation();
    }

    if (!user) {
      alert('请先登录');
      return;
    }

    if (!defaultCollectionId) {
      alert('未找到默认收藏集');
      return;
    }

    try {
      const isCurrentlyBookmarked = bookmarks.has(resourceId);

      if (isCurrentlyBookmarked) {
        // Remove from collection
        const response = await fetch(
          `${config.apiBaseUrl}/api/v1/collections/${defaultCollectionId}/items/${resourceId}`,
          {
            method: 'DELETE',
            headers: getAuthHeader(),
          }
        );

        if (response.ok) {
          setBookmarks((prev) => {
            const newSet = new Set(prev);
            newSet.delete(resourceId);
            return newSet;
          });
        }
      } else {
        // Add to collection
        const response = await fetch(
          `${config.apiBaseUrl}/api/v1/collections/${defaultCollectionId}/items`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...getAuthHeader(),
            },
            body: JSON.stringify({ resourceId }),
          }
        );

        if (response.ok) {
          setBookmarks((prev) => new Set([...prev, resourceId]));
        }
      }
    } catch (err) {
      logger.error('Failed to toggle bookmark:', err);
    }
  };

  return {
    bookmarks,
    defaultCollectionId,
    isBookmarked,
    toggleBookmark,
    loadBookmarks,
  };
}
