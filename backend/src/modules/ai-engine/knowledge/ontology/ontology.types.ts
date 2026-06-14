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

// ─── Meta-Model Types (W-A) ───────────────────────────────────────────────────

/** View of an OntologyObjectType meta-model row */
export interface OntologyObjectTypeView {
  id: string;
  topicId: string | null;
  key: string;
  label: string;
  /** JSON Schema (object shape) constraining node properties */
  propertySchema: Record<string, unknown>;
  color: string | null;
  createdAt: Date;
}

/** View of an OntologyLinkType meta-model row */
export interface OntologyLinkTypeView {
  id: string;
  topicId: string | null;
  key: string;
  label: string;
  /** Allowed fromNode typeKey; empty string means unconstrained */
  fromTypeKey: string;
  /** Allowed toNode typeKey; empty string means unconstrained */
  toTypeKey: string;
  directed: boolean;
  /** JSON Schema (object shape) constraining edge properties */
  propertySchema: Record<string, unknown>;
  createdAt: Date;
}

/** Input for creating or updating an OntologyObjectType */
export interface UpsertObjectTypeInput {
  topicId?: string;
  key: string;
  label: string;
  propertySchema?: Record<string, unknown>;
  color?: string;
}

/** Input for creating or updating an OntologyLinkType */
export interface UpsertLinkTypeInput {
  topicId?: string;
  key: string;
  label: string;
  fromTypeKey?: string;
  toTypeKey?: string;
  directed?: boolean;
  propertySchema?: Record<string, unknown>;
}

/** Filter for listObjectTypes / listLinkTypes */
export interface ListTypesFilter {
  topicId?: string;
}

// ─── W-B Action Inputs ────────────────────────────────────────────────────────

/** Input for setConfidence — updates the confidence score on an object or link */
export interface SetConfidenceInput {
  /** ID of the OntologyObject (mutually exclusive with linkId) */
  objectId?: string;
  /** ID of the OntologyLink (mutually exclusive with objectId) */
  linkId?: string;
  /** New confidence value, 0–1 */
  value: number;
}

/** Input for editProperty — updates a single property key on an OntologyObject */
export interface EditPropertyInput {
  /** ID of the OntologyObject to update */
  objectId: string;
  /** Property key to set */
  key: string;
  /** New property value (set to null to remove the key) */
  value: unknown;
}

/** Input for mergeObjects — merges source objects into a target object */
export interface MergeObjectsInput {
  /** IDs of the source OntologyObjects to absorb (will be marked deleted) */
  sourceIds: string[];
  /** ID of the surviving target OntologyObject */
  targetId: string;
}

/** Filter for listEdits */
export interface ListEditsFilter {
  objectId?: string;
  topicId?: string;
  limit?: number;
}

/** View of an OntologyEdit audit row */
export interface OntologyEditView {
  id: string;
  objectId: string | null;
  linkId: string | null;
  action: string;
  actorType: string;
  actorId: string;
  before: unknown;
  after: unknown;
  reason: string | null;
  createdAt: Date;
}

// ─── W-E: Topic Auto-Ingest Switch ───────────────────────────────────────────

/** View of OntologyTopicSetting */
export interface OntologyTopicSettingView {
  topicId: string;
  autoIngest: boolean;
  updatedBy: string | null;
  updatedAt: Date;
}

/** Input for setAutoIngest */
export interface SetAutoIngestInput {
  topicId: string;
  enabled: boolean;
  /** Optional actor ID for audit */
  updatedBy?: string;
}
