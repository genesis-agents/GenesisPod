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
  /** 技能原始指令正文预览（.skill.md body，截断），让市场详情看到"教什么" */
  instructionsPreview: string;
  /** 技能声明可用的工具白名单（frontmatter.allowedTools） */
  allowedTools: string[];
}

export interface ToolCatalogItem {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  source: "builtin" | "mcp" | "openapi";
  /** 真实副作用（ITool.sideEffect）：none=只读 / idempotent=幂等写 / destructive=破坏性 */
  sideEffect: "none" | "idempotent" | "destructive";
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
