/**
 * LLM Wiki API client (v1.5.3 P3a/P3b).
 *
 * Mirrors the 19 backend endpoints under /api/v1/library/wiki/* and
 * /api/v1/library/kbs/:kbId/wiki-enabled, returning typed responses.
 * No client-side filtering — server enforces wikiEnabled + hasAccess
 * + role checks per §11 v1.5.x.
 */

import apiClient from './client';

// ─── Types ────────────────────────────────────────────────────────

export type WikiPageCategory = 'ENTITY' | 'CONCEPT' | 'SUMMARY' | 'SOURCE';
export type WikiPageEditedBy = 'USER' | 'LLM' | 'IMPORT';
export type WikiDiffStatus = 'PENDING' | 'APPLIED' | 'DISMISSED' | 'CONFLICTED';
export type WikiOp = 'INGEST' | 'LINT' | 'EDIT' | 'REVERT';
export type WikiLintTypeStr =
  | 'ORPHAN'
  | 'MISSING_XREF'
  | 'STALE'
  | 'CONTRADICTION'
  | 'DATA_GAP';

export interface WikiKbSummary {
  id: string;
  name: string;
  description: string | null;
  type: 'PERSONAL' | 'TEAM';
  pageCount: number;
  lastIngestAt: string | null;
}

export interface WikiPage {
  id: string;
  knowledgeBaseId: string;
  slug: string;
  title: string;
  category: WikiPageCategory;
  body: string;
  oneLiner: string;
  contentHash: string;
  lastEditedBy: WikiPageEditedBy;
  createdAt: string;
  updatedAt: string;
}

export interface WikiPageWithLinks {
  page: WikiPage;
  outboundLinks: string[];
  backlinks: string[];
}

export interface WikiPageSearchHit {
  slug: string;
  title: string;
  oneLiner: string;
  category: WikiPageCategory;
}

export interface WikiDiffSummary {
  id: string;
  status: WikiDiffStatus;
  /**
   * Composite `slug:locale` keys (e.g. `auth:zh`, `auth:en`). Renamed from
   * `affectedSlugs` in the 2026-05-12 multi-pass-and-locale BLOCKER C2 fix
   * so two diffs touching the same slug across different locales do not
   * false-positive collide. UI rendering that wants slug-only display can
   * `s.split(':')[0]`.
   */
  affectedKeys: string[];
}

export interface WikiDiff extends WikiDiffSummary {
  knowledgeBaseId: string;
  items: {
    creates: Array<{
      slug: string;
      title: string;
      category: WikiPageCategory;
      body: string;
      oneLiner: string;
      sources: Array<{
        documentId: string;
        spanStart: number;
        spanEnd: number;
        quote: string;
      }>;
    }>;
    updates: Array<{
      slug: string;
      newBody: string;
      newOneLiner?: string;
      sources?: Array<{
        documentId: string;
        spanStart: number;
        spanEnd: number;
        quote: string;
      }>;
    }>;
    deletes: string[];
  };
  baselineHash: string;
  createdByUserId: string;
  createdAt: string;
  appliedAt: string | null;
  dismissedAt: string | null;
}

export interface WikiQueryResponse {
  answer: string;
  citations: Array<{ slug: string }>;
  usedPageIds: string[];
  branch: 'A_inline' | 'B_rag';
}

export interface WikiLintFinding {
  id: string;
  knowledgeBaseId: string;
  type: WikiLintTypeStr;
  pageId: string | null;
  detail: Record<string, unknown>;
  resolvedAt: string | null;
  createdAt: string;
}

export interface WikiLintRunResult {
  counts: Record<WikiLintTypeStr, number>;
  budgetExceeded: boolean;
}

export interface ToggleWikiEnabledResult {
  kbId: string;
  wikiEnabled: boolean;
  configCreated: boolean;
}

export interface WikiKbConfig {
  knowledgeBaseId: string;
  inlinePageCount: number;
  inlineTokenBudget: number;
  ingestMaxTokens: number;
  cronLintEnabled: boolean;
  cronLintDailyBudgetCalls: number;
  updatedAt: string;
}

export type WikiKbConfigPatch = Partial<
  Pick<
    WikiKbConfig,
    | 'inlinePageCount'
    | 'inlineTokenBudget'
    | 'ingestMaxTokens'
    | 'cronLintEnabled'
    | 'cronLintDailyBudgetCalls'
  >
>;

export interface KbDocumentSummary {
  id: string;
  title: string;
  sourceType: string;
  status: string;
  createdAt: string;
}

export type WikiIngestCandidateState =
  | 'READY_NEW'
  | 'READY_STALE'
  | 'READY_COVERED'
  | 'BLOCKED';

export interface WikiIngestCandidate {
  id: string;
  title: string;
  sourceType: string;
  mimeType: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
  chunkCount: number;
  lastError: string | null;
  pageReferenceCount: number;
  lastCitedAt: string | null;
  ingestState: WikiIngestCandidateState;
  recommended: boolean;
  reason: string;
}

export interface WikiOperationLogEntry {
  id: string;
  op: WikiOp;
  title: string;
  meta: Record<string, unknown>;
  actorUserId: string | null;
  actorName: string | null;
  createdAt: string;
  affectedSlugs: string[];
}

// ─── Endpoints ────────────────────────────────────────────────────

// apiClient already prepends `/api/v1`; paths here are relative to that.
const base = '/library/wiki';

export const wikiApi = {
  // Admin / KB selector
  listKbs: () => apiClient.get<{ items: WikiKbSummary[] }>(`${base}/kbs`),

  /**
   * List documents in a KB (used by Ingest picker). Reuses the existing
   * RAG controller endpoint — no new wiki-specific endpoint needed.
   */
  listKbDocuments: (kbId: string) =>
    apiClient.get<{ items: KbDocumentSummary[] } | KbDocumentSummary[]>(
      `/rag/knowledge-bases/${encodeURIComponent(kbId)}/documents`
    ),

  /**
   * List ALL user-accessible KBs (not just wikiEnabled ones), so the
   * "enable Wiki" modal can show disabled KBs. Reuses RAG controller endpoint.
   */
  listAllKbs: () =>
    apiClient.get<
      | {
          items: Array<{
            id: string;
            name: string;
            type: string;
            wikiEnabled?: boolean;
          }>;
        }
      | Array<{ id: string; name: string; type: string; wikiEnabled?: boolean }>
    >(`/rag/knowledge-bases`),

  toggleWikiEnabled: (kbId: string, enabled: boolean) =>
    apiClient.patch<ToggleWikiEnabledResult>(
      `/library/kbs/${encodeURIComponent(kbId)}/wiki-enabled`,
      { enabled }
    ),

  search: (kbId: string, q: string, limit = 20) => {
    const params = new URLSearchParams({ q, limit: String(limit) });
    return apiClient.get<{ items: WikiPageSearchHit[] }>(
      `${base}/kbs/${encodeURIComponent(kbId)}/pages/search?${params.toString()}`
    );
  },

  // Pages
  listPages: (kbId: string, category?: WikiPageCategory, limit = 200) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (category) params.set('category', category);
    return apiClient.get<{ items: WikiPage[] }>(
      `${base}/${encodeURIComponent(kbId)}/pages?${params.toString()}`
    );
  },

  getPage: (kbId: string, slug: string) =>
    apiClient.get<WikiPageWithLinks>(
      `${base}/${encodeURIComponent(kbId)}/pages/${encodeURIComponent(slug)}`
    ),

  createPage: (
    kbId: string,
    payload: {
      slug: string;
      title: string;
      category: WikiPageCategory;
      body: string;
      oneLiner: string;
    }
  ) =>
    apiClient.post<{ page: WikiPage }>(
      `${base}/${encodeURIComponent(kbId)}/pages`,
      payload
    ),

  updatePage: (
    kbId: string,
    slug: string,
    payload: {
      action?: 'edit' | 'revert';
      title?: string;
      category?: WikiPageCategory;
      body?: string;
      oneLiner?: string;
      toRevisionId?: string;
    }
  ) =>
    apiClient.patch<{ page: WikiPage }>(
      `${base}/${encodeURIComponent(kbId)}/pages/${encodeURIComponent(slug)}`,
      payload
    ),

  deletePage: (kbId: string, slug: string) =>
    apiClient.delete<void>(
      `${base}/${encodeURIComponent(kbId)}/pages/${encodeURIComponent(slug)}`
    ),

  // Ingest / Diff
  // Wiki ingest triggers a single-turn LLM call against full doc context;
  // typical latency is 10-60s, so override the default 30s apiClient timeout.
  ingest: (kbId: string, documentIds: string[]) =>
    apiClient.post<{ diff: WikiDiffSummary }>(
      `${base}/${encodeURIComponent(kbId)}/ingest`,
      { documentIds },
      { timeout: 180_000 }
    ),

  listIngestCandidates: (kbId: string) =>
    apiClient.get<{ items: WikiIngestCandidate[] }>(
      `${base}/${encodeURIComponent(kbId)}/ingest-candidates`
    ),

  getDiff: (kbId: string, diffId: string) =>
    apiClient.get<WikiDiff>(
      `${base}/${encodeURIComponent(kbId)}/diffs/${encodeURIComponent(diffId)}`
    ),

  patchDiff: (
    kbId: string,
    diffId: string,
    action: 'apply' | 'dismiss',
    selectedItemIds?: string[],
    options?: { supersedeConflictingDiffs?: boolean }
  ) =>
    apiClient.patch<WikiDiff>(
      `${base}/${encodeURIComponent(kbId)}/diffs/${encodeURIComponent(diffId)}`,
      {
        action,
        selectedItemIds,
        ...(options?.supersedeConflictingDiffs
          ? { supersedeConflictingDiffs: true }
          : {}),
      }
    ),

  // Query
  // Wiki query also calls an LLM (inline or RAG branch); 30s default is too
  // tight when the model is busy or the inline budget is large.
  query: (
    kbId: string,
    request: {
      question: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
      mode?: 'inline' | 'rag' | 'auto';
    }
  ) =>
    apiClient.post<WikiQueryResponse>(
      `${base}/${encodeURIComponent(kbId)}/query`,
      request,
      { timeout: 120_000 }
    ),

  // Config (KB-level wiki settings)
  getConfig: (kbId: string) =>
    apiClient.get<WikiKbConfig>(`${base}/${encodeURIComponent(kbId)}/config`),

  updateConfig: (kbId: string, patch: WikiKbConfigPatch) =>
    apiClient.patch<WikiKbConfig>(
      `${base}/${encodeURIComponent(kbId)}/config`,
      patch
    ),

  // Lint
  // runLint触发的全量 lint 检查在大 KB 下也会跑数十秒。
  runLint: (kbId: string) =>
    apiClient.post<WikiLintRunResult>(
      `${base}/${encodeURIComponent(kbId)}/lint`,
      {},
      { timeout: 120_000 }
    ),

  listLintFindings: (
    kbId: string,
    options: { type?: WikiLintTypeStr; resolved?: boolean } = {}
  ) => {
    const params = new URLSearchParams();
    if (options.type) params.set('type', options.type);
    if (options.resolved !== undefined)
      params.set('resolved', String(options.resolved));
    const qs = params.toString();
    return apiClient.get<{ items: WikiLintFinding[] }>(
      `${base}/${encodeURIComponent(kbId)}/lint-findings${qs ? `?${qs}` : ''}`
    );
  },

  patchLintFinding: (
    kbId: string,
    findingId: string,
    action: 'resolve' | 'dismiss'
  ) =>
    apiClient.patch<WikiLintFinding>(
      `${base}/${encodeURIComponent(kbId)}/lint-findings/${encodeURIComponent(findingId)}`,
      { action }
    ),

  batchPatchLintFindings: (
    kbId: string,
    body: {
      action: 'resolve' | 'dismiss';
      ids?: string[];
      filterAll?: boolean;
      type?: WikiLintTypeStr;
    }
  ) =>
    apiClient.post<{ updated: number }>(
      `${base}/${encodeURIComponent(kbId)}/lint-findings/batch`,
      body
    ),

  // Operation log (Log drawer — ingest / lint / edit / revert history)
  listOperations: (kbId: string, limit = 50) => {
    const params = new URLSearchParams({ limit: String(limit) });
    return apiClient.get<{ items: WikiOperationLogEntry[] }>(
      `${base}/${encodeURIComponent(kbId)}/operations?${params.toString()}`
    );
  },
};
