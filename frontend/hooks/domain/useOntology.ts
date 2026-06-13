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

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useOntology() {
  const [items, setItems] = useState<OntologyObjectView[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

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

  return {
    items,
    total,
    loading,
    error,
    listEntities,
    getEntity,
    getRelated,
  };
}
