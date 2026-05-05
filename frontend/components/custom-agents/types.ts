/**
 * E R4 Phase 2 (PR-E2, 2026-05-05): Custom Agent 前端类型
 *
 * 与后端 dto/custom-agent.dto.ts 形态保持一致。
 */

export type CustomAgentPrimitive =
  | 'plan'
  | 'research'
  | 'assess'
  | 'synthesize'
  | 'draft'
  | 'review'
  | 'signoff'
  | 'persist'
  | 'learn';

export interface CustomAgentBasicInfo {
  name?: string;
  description?: string;
  language?: 'zh' | 'en';
  audience?: 'general' | 'executive' | 'technical' | 'academic';
  purpose?: string;
}

export interface CustomAgentTopicSchema {
  dimensions?: Array<{ name: string; description?: string }>;
  goalTemplate?: string;
}

export interface CustomAgentSkillsConfig {
  allowedSkillIds?: string[];
  deniedSkillIds?: string[];
}

export interface CustomAgentPipelineConfig {
  steps?: Array<{
    id: string;
    primitive: CustomAgentPrimitive;
    roleId?: string;
  }>;
  notes?: string;
}

export interface CustomAgentIntegrationConfig {
  allowedTools?: string[];
  allowedModels?: string[];
  defaultDepth?: 'quick' | 'standard' | 'deep';
  defaultLength?: 'brief' | 'standard' | 'deep' | 'extended' | 'epic' | 'mega';
  defaultBudget?: 'low' | 'medium' | 'high' | 'unlimited';
}

export interface CustomAgentConfig {
  basicInfo?: CustomAgentBasicInfo;
  topicSchema?: CustomAgentTopicSchema;
  skills?: CustomAgentSkillsConfig;
  pipeline?: CustomAgentPipelineConfig;
  integration?: CustomAgentIntegrationConfig;
}

export interface CustomAgentRecord {
  id: string;
  slug: string;
  displayName: string;
  description?: string | null;
  config: CustomAgentConfig;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  version: number;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomAgentOptions {
  primitives: Array<{
    id: CustomAgentPrimitive;
    label: string;
    description: string;
  }>;
  skills: Array<{
    id: string;
    name: string;
    domain: string;
    layer: string;
    description: string;
  }>;
  tools: Array<{
    id: string;
    name: string;
    category: string;
    description: string;
  }>;
  models: Array<{
    provider: string;
    modelType: string;
    patterns: string[];
    source: string;
  }>;
  enums: {
    languages: string[];
    audiences: string[];
    depths: string[];
    lengthProfiles: string[];
    budgetProfiles: string[];
    styleProfiles: string[];
  };
}

export type WizardStepKey =
  | 'basicInfo'
  | 'topicSchema'
  | 'skills'
  | 'pipeline'
  | 'integration'
  | 'review';

export const WIZARD_STEPS: ReadonlyArray<{
  key: WizardStepKey;
  title: string;
  subtitle: string;
}> = [
  {
    key: 'basicInfo',
    title: '基础信息',
    subtitle: 'Agent 名称 / 用途 / 受众 / 语言',
  },
  {
    key: 'topicSchema',
    title: '话题维度',
    subtitle: '研究维度 + 目标模板（leader 规划时作为 hint）',
  },
  {
    key: 'skills',
    title: '技能',
    subtitle: 'Skill 白/黑名单（mission 启动时的 ACL）',
  },
  {
    key: 'pipeline',
    title: '流水线',
    subtitle: 'Primitive 步骤序列（PR-E2 仅记录意图）',
  },
  {
    key: 'integration',
    title: '集成',
    subtitle: '允许的工具 / 模型 + 默认参数',
  },
  {
    key: 'review',
    title: '复核与发布',
    subtitle: '检查配置后 publish',
  },
];
