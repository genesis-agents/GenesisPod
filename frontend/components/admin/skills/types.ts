/**
 * Skill Configuration Types
 */

export interface SkillConfig {
  id: string;
  skillId: string;
  name: string;
  displayName: string;
  description: string;
  layer: string;
  domain: string;
  enabled: boolean;
  tags: string[];
  requiredTools: string[];
  requiredSkills: string[];
  config?: Record<string, unknown>;
  // Enhanced manifest fields (optional)
  author?: string;
  version?: string;
  license?: string;
  triggers?: Array<{ type: string; condition: string; priority?: number }>;
  examples?: Array<{ title: string; input: string; output: string }>;
  permissions?: {
    network?: boolean;
    filesystem?: boolean;
    externalApis?: string[];
    dataScopes?: string[];
  };
}

export interface MarketplaceSkill {
  id: string;
  name: string;
  displayName: string;
  description: string;
  author: string;
  authorUrl?: string;
  version: string;
  layer: string;
  domain: string;
  tags: string[];
  downloads: number;
  rating: number;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
  requiredTools: string[];
  requiredSkills: string[];
  installed?: boolean;
  installedVersion?: string;
}
