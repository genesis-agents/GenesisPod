/**
 * Marketplace catalog response DTOs
 *
 * Read-only projection of platform registries onto 4 shelves:
 * agents / skills / tools / workflows
 */

export interface AgentCatalogItem {
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

export interface SkillCatalogItem {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  activatesFor: string[];
}

export interface ToolCatalogItem {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  source: "builtin" | "mcp" | "openapi";
}

export interface WorkflowCatalogItem {
  id: string;
  name: string;
  description: string;
  category: string;
  teamSize: number;
  roles: string[];
  stages: string[];
}

export interface MarketplaceCatalog {
  agents: AgentCatalogItem[];
  skills: SkillCatalogItem[];
  tools: ToolCatalogItem[];
  workflows: WorkflowCatalogItem[];
}
