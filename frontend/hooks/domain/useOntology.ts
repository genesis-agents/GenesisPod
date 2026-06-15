'use client';

import { useState, useCallback } from 'react';
import { apiClient } from '@/lib/api/client';
import { logger } from '@/lib/utils/logger';

/**
 * Normalise an unknown thrown value to an Error. The API client throws plain
 * `ApiError` objects ({ message, code, status }), not Error instances, so a
 * naive `new Error(String(err))` yields "[object Object]". Extract `.message`.
 */
function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  if (
    err &&
    typeof err === 'object' &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string'
  ) {
    return new Error((err as { message: string }).message);
  }
  return new Error(String(err));
}

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

export interface EntityTypeCount {
  typeKey: string;
  count: number;
}

export interface EntityTypeCountsResult {
  counts: EntityTypeCount[];
  /** Sum across all types (true DB total for the current topic/search). */
  total: number;
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

// ─── Auto-ingest / backfill types ────────────────────────────────────────────

export interface AutoIngestConfig {
  enabled: boolean;
}

export type BackfillSourceKind =
  | 'topic-report'
  | 'team-mission'
  | 'kb-document';

export interface StartBackfillParams {
  topicId?: string;
  sourceKind?: BackfillSourceKind;
}

export interface BackfillStartResult {
  taskId: string;
  queued: number;
}

export interface BackfillStatus {
  status: string;
  processed: number;
  total: number;
  errors: string[];
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

  const listTypeCounts = useCallback(
    async (params: { topicId?: string; search?: string } = {}) => {
      try {
        const query = new URLSearchParams();
        if (params.topicId) query.set('topicId', params.topicId);
        if (params.search) query.set('search', params.search);
        const qs = query.toString();
        const data = await apiClient.get<EntityTypeCountsResult>(
          `/ontology/entity-type-counts${qs ? `?${qs}` : ''}`
        );
        return {
          counts: data?.counts ?? [],
          total: data?.total ?? 0,
        };
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        logger.error('[useOntology] listTypeCounts failed', {
          error: e.message,
        });
        throw e;
      }
    },
    []
  );

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
      // Backend returns a SubgraphResult ({ nodes, links }), not a flat array.
      // Flatten to the related entities (nodes minus the seed) for the drawer.
      const data = await apiClient.get<OntologySubgraphResult>(
        `/ontology/entities/${id}/related${qs}`
      );
      const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
      return nodes.filter((n) => n.id !== id);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      logger.error('[useOntology] getRelated failed', { id, error: e.message });
      throw e;
    }
  }, []);

  // ── read: meta-model ────────────────────────────────────────────────────────

  const listTypes = useCallback(async () => {
    try {
      // Backend returns a bare array; tolerate a legacy { items } wrapper too.
      const data = await apiClient.get<ObjectType[] | { items: ObjectType[] }>(
        '/ontology/types'
      );
      return Array.isArray(data) ? data : (data?.items ?? []);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      logger.error('[useOntology] listTypes failed', { error: e.message });
      throw e;
    }
  }, []);

  const listLinkTypes = useCallback(async () => {
    try {
      // Backend returns a bare array; tolerate a legacy { items } wrapper too.
      const data = await apiClient.get<LinkType[] | { items: LinkType[] }>(
        '/ontology/link-types'
      );
      return Array.isArray(data) ? data : (data?.items ?? []);
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

  // ── auto-ingest: get ────────────────────────────────────────────────────────

  const getAutoIngest = useCallback(async (topicId: string) => {
    try {
      return await apiClient.get<AutoIngestConfig>(
        `/ontology/topics/${topicId}/auto-ingest`
      );
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      logger.error('[useOntology] getAutoIngest failed', {
        topicId,
        error: e.message,
      });
      throw e;
    }
  }, []);

  // ── auto-ingest: set ────────────────────────────────────────────────────────

  const setAutoIngest = useCallback(
    async (topicId: string, enabled: boolean) => {
      try {
        await apiClient.post<void>(`/ontology/topics/${topicId}/auto-ingest`, {
          enabled,
        });
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        logger.error('[useOntology] setAutoIngest failed', {
          topicId,
          enabled,
          error: e.message,
        });
        throw e;
      }
    },
    []
  );

  // ── backfill: start ─────────────────────────────────────────────────────────

  const startBackfill = useCallback(async (params: StartBackfillParams) => {
    try {
      return await apiClient.post<BackfillStartResult>(
        '/ontology/backfill',
        params
      );
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      logger.error('[useOntology] startBackfill failed', { error: e.message });
      throw e;
    }
  }, []);

  // ── backfill: status ────────────────────────────────────────────────────────

  const getBackfillStatus = useCallback(async (taskId: string) => {
    try {
      return await apiClient.get<BackfillStatus>(
        `/ontology/backfill/status/${taskId}`
      );
    } catch (err) {
      const e = toError(err);
      logger.error('[useOntology] getBackfillStatus failed', {
        taskId,
        error: e.message,
      });
      throw e;
    }
  }, []);

  return {
    items,
    total,
    loading,
    error,
    listEntities,
    listTypeCounts,
    getEntity,
    getRelated,
    listTypes,
    listLinkTypes,
    listEdits,
    setConfidence,
    editProperty,
    mergeObjects,
    getAutoIngest,
    setAutoIngest,
    startBackfill,
    getBackfillStatus,
  };
}
