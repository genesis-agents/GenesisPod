/**
 * Slides Engine v3.0 - Sessions Hook
 *
 * 从后端加载、管理用户的会话列表
 */

import { useCallback, useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { config } from '@/lib/utils/config';
import type { SlidesSession } from '@/types/slides-v3';

const API_BASE = config.apiUrl || '';
const API_OFFICE_BASE = `${API_BASE}/ai-office/slides-v3`;

export interface SessionWithCheckpoint extends SlidesSession {
  latestCheckpoint?: {
    id: string;
    type: string;
    timestamp: Date;
    pagesCount: number;
  } | null;
}

interface UseSessionsOptions {
  autoLoad?: boolean;
  status?: 'active' | 'completed' | 'archived';
  limit?: number;
}

export function useSessions(options: UseSessionsOptions = {}) {
  const { autoLoad = true, status, limit = 50 } = options;
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionWithCheckpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 从后端加载会话列表
   */
  const loadSessions = useCallback(async () => {
    if (!user?.id) {
      console.warn('[useSessions] No user ID');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        userId: user.id,
      });
      if (status) {
        params.append('status', status);
      }
      if (limit) {
        params.append('limit', limit.toString());
      }

      const response = await fetch(
        `${API_BASE}/ai-office/slides-v3/sessions?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error('Failed to load sessions');
      }

      const data = await response.json();

      // 转换日期字段
      const sessionsData = (data.sessions || []).map((session: any) => ({
        ...session,
        createdAt: new Date(session.createdAt),
        updatedAt: new Date(session.updatedAt),
        latestCheckpoint: session.latestCheckpoint
          ? {
              ...session.latestCheckpoint,
              timestamp: new Date(session.latestCheckpoint.timestamp),
            }
          : null,
      }));

      setSessions(sessionsData);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : '加载会话列表失败';
      setError(errorMessage);
      console.error('[useSessions] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, status, limit]);

  /**
   * 刷新会话列表
   */
  const refresh = useCallback(() => {
    return loadSessions();
  }, [loadSessions]);

  /**
   * 更新会话标题
   */
  const updateSession = useCallback(
    async (sessionId: string, title: string): Promise<boolean> => {
      try {
        const response = await fetch(
          `${API_OFFICE_BASE}/sessions/${sessionId}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ title }),
          }
        );

        if (!response.ok) {
          throw new Error('Failed to update session');
        }

        // 更新本地状态
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, title } : s))
        );

        return true;
      } catch (err) {
        console.error('[useSessions] Update error:', err);
        setError(err instanceof Error ? err.message : '更新会话失败');
        return false;
      }
    },
    []
  );

  /**
   * 删除会话
   */
  const deleteSession = useCallback(
    async (sessionId: string): Promise<boolean> => {
      try {
        const response = await fetch(
          `${API_OFFICE_BASE}/sessions/${sessionId}`,
          {
            method: 'DELETE',
          }
        );

        if (!response.ok) {
          throw new Error('Failed to delete session');
        }

        // 从本地状态移除
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));

        return true;
      } catch (err) {
        console.error('[useSessions] Delete error:', err);
        setError(err instanceof Error ? err.message : '删除会话失败');
        return false;
      }
    },
    []
  );

  // 自动加载
  useEffect(() => {
    if (autoLoad && user?.id) {
      loadSessions();
    }
  }, [autoLoad, user?.id, loadSessions]);

  return {
    sessions,
    loading,
    error,
    loadSessions,
    refresh,
    updateSession,
    deleteSession,
  };
}

export default useSessions;
