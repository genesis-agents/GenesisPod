'use client';

import { useState, useCallback } from 'react';
import { apiClient } from '@/lib/api/client';
import { logger } from '@/lib/utils/logger';

// ─── View types (mirrors backend OntologyObjectView / OntologyLinkView) ────────

export interface OntologyObjectView {
  id: string;
  topicId: string | null;
  typeKey: string;
  label: string;
  aliases: string[];
  properties: Record<string, unknown>;
  confidence: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface OntologyLinkView {
  id: string;
  topicId: string | null;
  linkTypeKey: string;
  fromId: string;
  toId: string;
  properties: Record<string, unknown>;
  confidence: number;
  createdAt: string;
}

export interface OntologyListResult {
  items: OntologyObjectView[];
  /** Count of rows on the current page (not grand total — see API note). */
  total: number;
}

export interface OntologySubgraphResult {
  nodes: OntologyObjectView[];
  links: OntologyLinkView[];
}

export interface ListEntitiesParams {
  topicId?: string;
  typeKey?: string;
  /** Mapped to labelContains in the DTO */
  search?: string;
  sortBy?: string;
  page?: number;
  limit?: number;
}

// ─── Meta-model types ─────────────────────────────────────────────────────────

export interface ObjectType {
  key: string;
  label: string;
  description?: string;
  color?: string;
  createdAt?: string;
}

export interface LinkType {
  key: string;
  label: string;
  description?: string;
  directed?: boolean;
  createdAt?: string;
}

export interface OntologyEdit {
  id: string;
  objectId?: string | null;
  linkId?: string | null;
  action: string;
  actorType: string;
  actorId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
  createdAt: string;
}

export interface ListEditsParams {
  objectId?: string;
  topicId?: string;
  limit?: number;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useOntology() {
  const [items, setItems] = useState<OntologyObjectView[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // ── read: entities ──────────────────────────────────────────────────────────

  const listEntities = useCallback(async (params: ListEntitiesParams = {}) => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (params.topicId) query.set('topicId', params.topicId);
      if (params.typeKey) query.set('typeKey', params.typeKey);
      if (params.search) query.set('search', params.search);
      if (params.sortBy) query.set('sortBy', params.sortBy);
      if (params.page != null) query.set('page', String(params.page));
      if (params.limit != null) query.set('limit', String(params.limit));

      const qs = query.toString();
      const data = await apiClient.get<OntologyListResult>(
        `/ontology/entities${qs ? `?${qs}` : ''}`
      );
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      return data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      logger.error('[useOntology] listEntities failed', { error: e.message });
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const getEntity = useCallback(async (id: string) => {
    try {
      return await apiClient.get<OntologyObjectView>(
        `/ontology/entities/${id}`
      );
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      logger.error('[useOntology] getEntity failed', { id, error: e.message });
      throw e;
    }
  }, []);

  const getRelated = useCallback(async (id: string, depth?: number) => {
    const qs = depth != null ? `?depth=${depth}` : '';
    try {
      return await apiClient.get<OntologyObjectView[]>(
        `/ontology/entities/${id}/related${qs}`
      );
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      logger.error('[useOntology] getRelated failed', { id, error: e.message });
      throw e;
    }
  }, []);

  // ── read: meta-model ────────────────────────────────────────────────────────

  const listTypes = useCallback(async () => {
    try {
      const data = await apiClient.get<{ items: ObjectType[] }>(
        '/ontology/types'
      );
      return data.items ?? [];
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      logger.error('[useOntology] listTypes failed', { error: e.message });
      throw e;
    }
  }, []);

  const listLinkTypes = useCallback(async () => {
    try {
      const data = await apiClient.get<{ items: LinkType[] }>(
        '/ontology/link-types'
      );
      return data.items ?? [];
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      logger.error('[useOntology] listLinkTypes failed', { error: e.message });
      throw e;
    }
  }, []);

  // ── read: edits ─────────────────────────────────────────────────────────────

  const listEdits = useCallback(async (params: ListEditsParams = {}) => {
    try {
      const query = new URLSearchParams();
      if (params.objectId) query.set('objectId', params.objectId);
      if (params.topicId) query.set('topicId', params.topicId);
      if (params.limit != null) query.set('limit', String(params.limit));
      const qs = query.toString();
      const data = await apiClient.get<{ items: OntologyEdit[] }>(
        `/ontology/edits${qs ? `?${qs}` : ''}`
      );
      return data.items ?? [];
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      logger.error('[useOntology] listEdits failed', { error: e.message });
      throw e;
    }
  }, []);

  // ── write: set confidence ───────────────────────────────────────────────────

  const setConfidence = useCallback(
    async (id: string, value: number, reason?: string) => {
      try {
        await apiClient.post<void>(`/ontology/objects/${id}/confidence`, {
          value,
          ...(reason ? { reason } : {}),
        });
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        logger.error('[useOntology] setConfidence failed', {
          id,
          error: e.message,
        });
        throw e;
      }
    },
    []
  );

  // ── write: edit property ────────────────────────────────────────────────────

  const editProperty = useCallback(
    async (id: string, key: string, value: unknown, reason?: string) => {
      try {
        await apiClient.post<void>(`/ontology/objects/${id}/property`, {
          key,
          value,
          ...(reason ? { reason } : {}),
        });
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        logger.error('[useOntology] editProperty failed', {
          id,
          key,
          error: e.message,
        });
        throw e;
      }
    },
    []
  );

  // ── write: merge objects ────────────────────────────────────────────────────

  const mergeObjects = useCallback(
    async (sourceIds: string[], targetId: string, reason?: string) => {
      try {
        await apiClient.post<void>('/ontology/merge', {
          sourceIds,
          targetId,
          ...(reason ? { reason } : {}),
        });
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        logger.error('[useOntology] mergeObjects failed', {
          sourceIds,
          targetId,
          error: e.message,
        });
        throw e;
      }
    },
    []
  );

  return {
    items,
    total,
    loading,
    error,
    listEntities,
    getEntity,
    getRelated,
    listTypes,
    listLinkTypes,
    listEdits,
    setConfidence,
    editProperty,
    mergeObjects,
  };
}
