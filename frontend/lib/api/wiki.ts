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
  affectedSlugs: string[];
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

export interface KbDocumentSummary {
  id: string;
  title: string;
  sourceType: string;
  status: string;
  createdAt: string;
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
  ingest: (kbId: string, documentIds: string[]) =>
    apiClient.post<{ diff: WikiDiffSummary }>(
      `${base}/${encodeURIComponent(kbId)}/ingest`,
      { documentIds }
    ),

  getDiff: (kbId: string, diffId: string) =>
    apiClient.get<WikiDiff>(
      `${base}/${encodeURIComponent(kbId)}/diffs/${encodeURIComponent(diffId)}`
    ),

  patchDiff: (
    kbId: string,
    diffId: string,
    action: 'apply' | 'dismiss',
    selectedItemIds?: string[]
  ) =>
    apiClient.patch<WikiDiff>(
      `${base}/${encodeURIComponent(kbId)}/diffs/${encodeURIComponent(diffId)}`,
      { action, selectedItemIds }
    ),

  // Query
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
      request
    ),

  // Lint
  runLint: (kbId: string) =>
    apiClient.post<WikiLintRunResult>(
      `${base}/${encodeURIComponent(kbId)}/lint`,
      {}
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
};
