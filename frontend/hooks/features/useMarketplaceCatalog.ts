/**
 * useMarketplaceCatalog
 *
 * Fetches the real platform catalog from GET /company/marketplace and adapts
 * the backend DTO shapes into the frontend AnyListing types used by the market
 * shelf components.
 *
 * UI-only fields that the backend does not provide:
 *   - avatarGradient: derived from the item id via a deterministic hash into AVATAR_GRADIENTS
 *   - publisher:      always '官方'
 *   - installs:       0 (backend has no usage stats yet)
 *   - rating:         0 (backend has no rating yet)
 *   - tagline:        falls back to the first sentence of description (truncated)
 *   - seniority:      defaults to 'mid' for agents
 *   - costPerRun:     defaults to 0 for agents
 *   - sideEffect:     defaults to 'none' for tools
 */

import { useEffect } from 'react';
import { useApiGet } from '@/hooks/core';
import { AVATAR_GRADIENTS } from '@/lib/design/tokens';
import {
  setMarketplaceCatalog,
  type CatalogStore,
} from '@/components/marketplace/marketplace.mock';
import type {
  AgentListing,
  SkillListing,
  ToolListing,
  WorkflowListing,
} from '@/components/marketplace/marketplace.types';

// ─── Backend DTO shapes (mirror of backend marketplace.dto.ts) ────────────────

interface AgentCatalogItem {
  id: string;
  name: string;
  description: string;
  role: string;
  category: string;
  tags: string[];
  capabilities: string[];
  skillIds: string[];
  toolIds: string[];
  defaultModel: string;
}

interface SkillCatalogItem {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  activatesFor: string[];
}

interface ToolCatalogItem {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  source: 'builtin' | 'mcp' | 'openapi';
}

interface WorkflowCatalogItem {
  id: string;
  name: string;
  description: string;
  category: string;
  teamSize: number;
  roles: string[];
  stages: string[];
}

interface MarketplaceCatalog {
  agents: AgentCatalogItem[];
  skills: SkillCatalogItem[];
  tools: ToolCatalogItem[];
  workflows: WorkflowCatalogItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Deterministic index into AVATAR_GRADIENTS based on string id. */
function avatarGradientFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[idx];
}

/** Derive a short tagline from description when the backend does not supply one. */
function taglineFrom(description: string): string {
  const first = description.split(/[。！？.!?]/)[0] ?? description;
  return first.length > 40 ? first.slice(0, 40) + '…' : first;
}

// ─── Adapters ─────────────────────────────────────────────────────────────────

function adaptAgent(item: AgentCatalogItem): AgentListing {
  return {
    id: item.id,
    kind: 'agent',
    name: item.name,
    tagline: taglineFrom(item.description),
    description: item.description,
    category: item.category,
    tags: item.tags,
    publisher: '官方',
    installs: 0,
    rating: 0,
    role: item.role,
    seniority: 'mid',
    avatarGradient: avatarGradientFor(item.id),
    skillIds: item.skillIds,
    toolIds: item.toolIds,
    defaultModel: item.defaultModel,
    costPerRun: 0,
  };
}

function adaptSkill(item: SkillCatalogItem): SkillListing {
  return {
    id: item.id,
    kind: 'skill',
    name: item.name,
    tagline: taglineFrom(item.description),
    description: item.description,
    category: item.category,
    tags: item.tags,
    publisher: '官方',
    installs: 0,
    rating: 0,
    activatesFor: item.activatesFor,
  };
}

function adaptTool(item: ToolCatalogItem): ToolListing {
  return {
    id: item.id,
    kind: 'tool',
    name: item.name,
    tagline: taglineFrom(item.description),
    description: item.description,
    category: item.category,
    tags: item.tags,
    publisher: '官方',
    installs: 0,
    rating: 0,
    source: item.source,
    sideEffect: 'none',
  };
}

function adaptWorkflow(item: WorkflowCatalogItem): WorkflowListing {
  return {
    id: item.id,
    kind: 'workflow',
    name: item.name,
    tagline: taglineFrom(item.description),
    description: item.description,
    category: item.category,
    tags: [],
    publisher: '官方',
    installs: 0,
    rating: 0,
    teamSize: item.teamSize,
    roles: item.roles,
    stages: item.stages,
  };
}

function adaptCatalog(raw: MarketplaceCatalog): CatalogStore {
  return {
    agent: raw.agents.map(adaptAgent),
    skill: raw.skills.map(adaptSkill),
    tool: raw.tools.map(adaptTool),
    workflow: raw.workflows.map(adaptWorkflow),
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseMarketplaceCatalogResult {
  loading: boolean;
  error: { message?: string } | null;
  refresh: () => void;
}

export function useMarketplaceCatalog(): UseMarketplaceCatalogResult {
  const { data, loading, error, execute } = useApiGet<MarketplaceCatalog>(
    '/company/marketplace',
    {
      immediate: true,
      cacheKey: 'marketplace-catalog',
      cacheTTL: 5 * 60 * 1000,
    }
  );

  useEffect(() => {
    if (data) {
      setMarketplaceCatalog(adaptCatalog(data));
    }
  }, [data]);

  return { loading, error, refresh: execute };
}
