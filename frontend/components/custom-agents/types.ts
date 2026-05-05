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

/**
 * 完整性校验单条 issue —— 与后端 dto/custom-agent.dto.ts 的
 * CustomAgentCompletenessIssue 形态保持一致（前后端同算法）。
 */
export interface CustomAgentCompletenessIssue {
  step: WizardStepKey;
  field: string;
  message: string;
}

/**
 * 5 步完整性校验（前端实时反馈版本，算法与后端 validateCustomAgentCompleteness 严格同步）。
 *
 * 用途：
 * - Wizard 每步 goNext 之前预检，未通过禁用"下一步" + 显示具体缺什么
 * - Stepper 绿勾按"该步骤无 issue"上色，而非"已经走过"
 * - ReviewStep 进入后做最后一次本地预检（双保险，后端仍是权威）
 *
 * 任何调整必须同步修改：
 *   backend/src/modules/ai-app/custom-agents/dto/custom-agent.dto.ts
 *   :: validateCustomAgentCompleteness
 */
export function validateCustomAgentCompleteness(
  config: CustomAgentConfig | null | undefined
): CustomAgentCompletenessIssue[] {
  const issues: CustomAgentCompletenessIssue[] = [];
  if (!config) {
    issues.push({
      step: 'basicInfo',
      field: 'config',
      message: 'config 为空',
    });
    return issues;
  }

  if (!config.basicInfo?.name) {
    issues.push({
      step: 'basicInfo',
      field: 'basicInfo.name',
      message: 'basicInfo.name 必填',
    });
  }
  if (!config.basicInfo?.purpose) {
    issues.push({
      step: 'basicInfo',
      field: 'basicInfo.purpose',
      message: 'basicInfo.purpose 必填（agent 的目标描述）',
    });
  }

  const dims = config.topicSchema?.dimensions ?? [];
  if (dims.length < 1) {
    issues.push({
      step: 'topicSchema',
      field: 'topicSchema.dimensions',
      message: '至少配置 1 个维度',
    });
  } else if (dims.some((d) => !d.name)) {
    issues.push({
      step: 'topicSchema',
      field: 'topicSchema.dimensions[].name',
      message: '维度 name 不能为空',
    });
  }

  const allowed = config.skills?.allowedSkillIds ?? [];
  if (allowed.length < 1) {
    issues.push({
      step: 'skills',
      field: 'skills.allowedSkillIds',
      message: '至少选择 1 个 skill（白名单不能为空）',
    });
  }

  const steps = config.pipeline?.steps ?? [];
  if (steps.length < 1) {
    issues.push({
      step: 'pipeline',
      field: 'pipeline.steps',
      message: '至少配置 1 个 pipeline step',
    });
  } else if (steps.some((s) => !s.id || !s.primitive)) {
    issues.push({
      step: 'pipeline',
      field: 'pipeline.steps[].{id,primitive}',
      message: 'pipeline step 必须含 id + primitive',
    });
  }

  const models = config.integration?.allowedModels ?? [];
  if (models.length < 1) {
    issues.push({
      step: 'integration',
      field: 'integration.allowedModels',
      message: '至少允许 1 个模型',
    });
  }

  return issues;
}

/** 取某一步骤的 issues（wizard 各步骤 banner / disabled 用） */
export function issuesForStep(
  config: CustomAgentConfig | null | undefined,
  step: WizardStepKey
): CustomAgentCompletenessIssue[] {
  return validateCustomAgentCompleteness(config).filter((i) => i.step === step);
}

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
