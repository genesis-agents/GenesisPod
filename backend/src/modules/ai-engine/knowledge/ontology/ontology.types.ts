/**
 * Ontology Service Types — Knowledge Ontology v1
 * DTO, input, and view types for OntologyService.
 * Zero agent/mission state; pure engine primitives.
 */

// ─── Audit Context ────────────────────────────────────────────────────────────

/**
 * Audit context passed into every write operation.
 * The caller (ai-app layer, import pipeline, agent task runner) is responsible
 * for supplying actor information. OntologyService never reads from request context.
 */
export interface AuditContext {
  /** "human" | "agent" | "import" | "system" */
  actorType: string;
  /** ID of the actor (user ID, agent run ID, import job ID, etc.) */
  actorId: string;
  /** Optional soft-link to an Evidence row (no FK — cross-table audit coupling avoided) */
  sourceId?: string;
  /** Human-readable reason for the operation */
  reason?: string;
}

// ─── Inputs ────────────────────────────────────────────────────────────────────

/**
 * Input for creating or updating an ontology object (node).
 * upsert key: (topicId?, typeKey, label) after entity resolution.
 */
export interface UpsertObjectInput {
  /** Optional topic scoping (foresight topicId, research sessionId, etc.) */
  topicId?: string;
  /** Node type key — free-form string, e.g. "company", "technology", "person" */
  typeKey: string;
  /** Primary label for this node */
  label: string;
  /** Alternative names / aliases for entity resolution */
  aliases?: string[];
  /** Arbitrary structured properties */
  properties?: Record<string, unknown>;
  /** Confidence score 0–1 (default 1.0) */
  confidence?: number;
  /** Caller identity for createdBy audit field */
  createdBy: string;
}

/**
 * Input for adding a directed relationship (edge) between two objects.
 * Semantics: fromId --[linkTypeKey]--> toId
 */
export interface AddLinkInput {
  /** Optional topic scoping */
  topicId?: string;
  /** Relationship type key — e.g. "depends_on", "related_to", "parent_of" */
  linkTypeKey: string;
  /** ID of the source OntologyObject */
  fromId: string;
  /** ID of the target OntologyObject */
  toId: string;
  /** Arbitrary edge properties */
  properties?: Record<string, unknown>;
  /** Confidence score 0–1 (default 1.0) */
  confidence?: number;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export interface ListObjectsFilter {
  topicId?: string;
  typeKey?: string;
  createdBy?: string;
  /** Simple full-text filter against label (case-insensitive contains) */
  labelContains?: string;
  limit?: number;
  offset?: number;
}

export interface SubgraphOptions {
  /** Include OntologyLink rows (default true) */
  includeLinks?: boolean;
  /** Filter nodes by typeKey */
  typeKeys?: string[];
  /** Max nodes returned (default 200) */
  maxNodes?: number;
}

// ─── View Types ───────────────────────────────────────────────────────────────

/** Lightweight view of an OntologyObject (Prisma row mapped out) */
export interface OntologyObjectView {
  id: string;
  topicId: string | null;
  typeKey: string;
  label: string;
  aliases: string[];
  properties: Record<string, unknown>;
  confidence: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Lightweight view of an OntologyLink (Prisma row mapped out) */
export interface OntologyLinkView {
  id: string;
  topicId: string | null;
  linkTypeKey: string;
  fromId: string;
  toId: string;
  properties: Record<string, unknown>;
  confidence: number;
  createdAt: Date;
}

/** Subgraph result: nodes + edges for a given topicId */
export interface SubgraphResult {
  nodes: OntologyObjectView[];
  links: OntologyLinkView[];
}
