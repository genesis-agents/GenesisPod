/**
 * useResearchIdeas - Research Ideas API Hook
 *
 * CRUD operations for research ideas within a project
 */

import { useState, useCallback, useEffect } from 'react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { logger } from '@/lib/utils/logger';

// Types
export interface ResearchIdea {
  id: string;
  projectId: string;
  sessionId: string | null;
  title: string;
  description: string;
  sourceMessageId: string | null;
  agentRole: string | null;
  agentName: string | null;
  status: 'DISCOVERED' | 'STARRED' | 'ARCHIVED';
  tags: string[];
  evidence: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  demos?: Array<{ id: string; status: string }>;
}

interface UseResearchIdeasResult {
  ideas: ResearchIdea[];
  isLoading: boolean;
  error: string | null;
  fetchIdeas: () => Promise<void>;
  createIdea: (data: {
    title: string;
    description: string;
    sessionId?: string;
    sourceMessageId?: string;
    agentRole?: string;
    agentName?: string;
    tags?: string[];
  }) => Promise<ResearchIdea | null>;
  updateIdea: (
    ideaId: string,
    data: {
      title?: string;
      description?: string;
      status?: 'DISCOVERED' | 'STARRED' | 'ARCHIVED';
      tags?: string[];
    }
  ) => Promise<ResearchIdea | null>;
  deleteIdea: (ideaId: string) => Promise<boolean>;
  extractIdeas: (sessionId: string) => Promise<ResearchIdea[]>;
}

export function useResearchIdeas(projectId: string): UseResearchIdeasResult {
  const [ideas, setIdeas] = useState<ResearchIdea[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchIdeas = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `${config.apiBaseUrl}/api/v1/ai-studio/projects/${projectId}/ideas`,
          { headers: { ...getAuthHeader() }, signal }
        );
        if (!res.ok) throw new Error('Failed to fetch ideas');
        const result = await res.json();
        const data = result?.data ?? result;
        setIdeas(Array.isArray(data) ? data : []);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const msg =
          err instanceof Error ? err.message : 'Failed to fetch ideas';
        setError(msg);
        logger.error('Failed to fetch research ideas:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [projectId]
  );

  const createIdea = useCallback(
    async (data: {
      title: string;
      description: string;
      sessionId?: string;
      sourceMessageId?: string;
      agentRole?: string;
      agentName?: string;
      tags?: string[];
    }): Promise<ResearchIdea | null> => {
      try {
        const res = await fetch(
          `${config.apiBaseUrl}/api/v1/ai-studio/projects/${projectId}/ideas`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify(data),
          }
        );
        if (!res.ok) throw new Error('Failed to create idea');
        const result = await res.json();
        const idea = result?.data ?? result;
        setIdeas((prev) => [idea, ...prev]);
        return idea;
      } catch (err) {
        logger.error('Failed to create idea:', err);
        return null;
      }
    },
    [projectId]
  );

  const updateIdea = useCallback(
    async (
      ideaId: string,
      data: {
        title?: string;
        description?: string;
        status?: 'DISCOVERED' | 'STARRED' | 'ARCHIVED';
        tags?: string[];
      }
    ): Promise<ResearchIdea | null> => {
      try {
        const res = await fetch(
          `${config.apiBaseUrl}/api/v1/ai-studio/projects/${projectId}/ideas/${ideaId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify(data),
          }
        );
        if (!res.ok) throw new Error('Failed to update idea');
        const result = await res.json();
        const updated = result?.data ?? result;
        setIdeas((prev) => prev.map((i) => (i.id === ideaId ? updated : i)));
        return updated;
      } catch (err) {
        logger.error('Failed to update idea:', err);
        return null;
      }
    },
    [projectId]
  );

  const deleteIdea = useCallback(
    async (ideaId: string): Promise<boolean> => {
      try {
        const res = await fetch(
          `${config.apiBaseUrl}/api/v1/ai-studio/projects/${projectId}/ideas/${ideaId}`,
          {
            method: 'DELETE',
            headers: { ...getAuthHeader() },
          }
        );
        if (!res.ok) throw new Error('Failed to delete idea');
        setIdeas((prev) => prev.filter((i) => i.id !== ideaId));
        return true;
      } catch (err) {
        logger.error('Failed to delete idea:', err);
        return false;
      }
    },
    [projectId]
  );

  const extractIdeas = useCallback(
    async (sessionId: string): Promise<ResearchIdea[]> => {
      try {
        const res = await fetch(
          `${config.apiBaseUrl}/api/v1/ai-studio/projects/${projectId}/ideas/sessions/${sessionId}/extract`,
          {
            method: 'POST',
            headers: { ...getAuthHeader() },
          }
        );
        if (!res.ok) throw new Error('Failed to extract ideas');
        const result = await res.json();
        const extracted = result?.data ?? result;
        const newIdeas = Array.isArray(extracted) ? extracted : [];
        // Merge with existing ideas, avoiding duplicates
        setIdeas((prev) => {
          const existingIds = new Set(prev.map((i) => i.id));
          const unique = newIdeas.filter(
            (i: ResearchIdea) => !existingIds.has(i.id)
          );
          return [...unique, ...prev];
        });
        return newIdeas;
      } catch (err) {
        logger.error('Failed to extract ideas:', err);
        return [];
      }
    },
    [projectId]
  );

  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    void fetchIdeas(controller.signal);
    return () => controller.abort();
  }, [projectId, fetchIdeas]);

  return {
    ideas,
    isLoading,
    error,
    fetchIdeas,
    createIdea,
    updateIdea,
    deleteIdea,
    extractIdeas,
  };
}

export default useResearchIdeas;
