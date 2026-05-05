/**
 * E R4 Phase 2 (PR-E2, 2026-05-05): 用户自定义 Agent DTO
 *
 * 5 步向导汇总配置：basicInfo / topicSchema / skills / pipeline / integration。
 * 每步可独立 partial fill；publish 前 service.validateCompleteness 强制全 5 步。
 */
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

export class CreateCustomAgentDto {
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: "slug must be kebab-case" })
  @MaxLength(64)
  slug!: string;

  @IsString()
  @MaxLength(128)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsObject()
  config!: CustomAgentConfig;

  @IsOptional()
  @IsString()
  workspaceId?: string;
}

export class UpdateCustomAgentDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsObject()
  config?: Partial<CustomAgentConfig>;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^(DRAFT|PUBLISHED|ARCHIVED)$/)
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
}

/** Step 1 — 基础信息 */
export interface CustomAgentBasicInfo {
  name?: string;
  description?: string;
  language?: "zh" | "en";
  audience?: "general" | "executive" | "technical" | "academic";
  purpose?: string;
}

/** Step 2 — 话题维度（leader S2 plan 时作为 hint，最终由 leader 决定） */
export interface CustomAgentTopicSchema {
  dimensions?: Array<{ name: string; description?: string }>;
  /** 启动 mission 时拼到 topic 后："{user_topic}（聚焦：{goalTemplate}）" */
  goalTemplate?: string;
}

/** Step 3 — Skills 白/黑名单（投递到 mission 启动时的 skill ACL） */
export interface CustomAgentSkillsConfig {
  allowedSkillIds?: string[];
  deniedSkillIds?: string[];
}

/** Step 4 — Pipeline 元信息（PR-E2 仅记录用户意图；当前 mission pipeline 14 stage 固定） */
export interface CustomAgentPipelineConfig {
  steps?: Array<{
    id: string;
    primitive: CustomAgentPrimitive;
    roleId?: string;
  }>;
  notes?: string;
}

/** Step 5 — 集成（mission 启动时作为 ACL hint） */
export interface CustomAgentIntegrationConfig {
  allowedTools?: string[];
  allowedModels?: string[];
  defaultDepth?: "quick" | "standard" | "deep";
  defaultLength?: "brief" | "standard" | "deep" | "extended" | "epic" | "mega";
  defaultBudget?: "low" | "medium" | "high" | "unlimited";
}

/** 9 个 primitive（与 ai-harness MissionPipelineConfig 对齐） */
export type CustomAgentPrimitive =
  | "plan"
  | "research"
  | "assess"
  | "synthesize"
  | "draft"
  | "review"
  | "signoff"
  | "persist"
  | "learn";

export const CUSTOM_AGENT_PRIMITIVES: ReadonlyArray<{
  id: CustomAgentPrimitive;
  label: string;
  description: string;
}> = [
  { id: "plan", label: "Plan", description: "Leader 规划维度 / 大纲" },
  { id: "research", label: "Research", description: "Researcher 收集证据" },
  {
    id: "assess",
    label: "Assess",
    description: "Leader 评估并决策 retry/abort",
  },
  {
    id: "synthesize",
    label: "Synthesize",
    description: "跨维度对账 / 主题归纳",
  },
  { id: "draft", label: "Draft", description: "Writer 起草报告" },
  {
    id: "review",
    label: "Review",
    description: "Critic / Objective evaluator",
  },
  { id: "signoff", label: "Signoff", description: "Leader 签字 + 前言" },
  { id: "persist", label: "Persist", description: "终态落库 + 配额扣减" },
  { id: "learn", label: "Learn", description: "Postmortem + memory 索引" },
];

export interface CustomAgentConfig {
  basicInfo?: CustomAgentBasicInfo;
  topicSchema?: CustomAgentTopicSchema;
  skills?: CustomAgentSkillsConfig;
  pipeline?: CustomAgentPipelineConfig;
  integration?: CustomAgentIntegrationConfig;
}

export type CustomAgentConfigKeys = keyof CustomAgentConfig;

export interface CustomAgentCompletenessIssue {
  step: CustomAgentConfigKeys;
  field: string;
  message: string;
}

/**
 * 5 步完整性校验 —— publish 前执行。
 * 返回为空数组表示完整；否则列出每个缺失项。
 */
export function validateCustomAgentCompleteness(
  config: CustomAgentConfig | null | undefined,
): CustomAgentCompletenessIssue[] {
  const issues: CustomAgentCompletenessIssue[] = [];
  if (!config) {
    issues.push({
      step: "basicInfo",
      field: "config",
      message: "config 为空",
    });
    return issues;
  }

  // Step 1 basic info
  if (!config.basicInfo?.name) {
    issues.push({
      step: "basicInfo",
      field: "basicInfo.name",
      message: "basicInfo.name 必填",
    });
  }
  if (!config.basicInfo?.purpose) {
    issues.push({
      step: "basicInfo",
      field: "basicInfo.purpose",
      message: "basicInfo.purpose 必填（agent 的目标描述）",
    });
  }

  // Step 2 topic schema
  const dims = config.topicSchema?.dimensions ?? [];
  if (dims.length < 1) {
    issues.push({
      step: "topicSchema",
      field: "topicSchema.dimensions",
      message: "至少配置 1 个维度",
    });
  } else if (dims.some((d) => !d.name)) {
    issues.push({
      step: "topicSchema",
      field: "topicSchema.dimensions[].name",
      message: "维度 name 不能为空",
    });
  }

  // Step 3 skills
  const allowed = config.skills?.allowedSkillIds ?? [];
  if (allowed.length < 1) {
    issues.push({
      step: "skills",
      field: "skills.allowedSkillIds",
      message: "至少选择 1 个 skill（白名单不能为空）",
    });
  }

  // Step 4 pipeline
  const steps = config.pipeline?.steps ?? [];
  if (steps.length < 1) {
    issues.push({
      step: "pipeline",
      field: "pipeline.steps",
      message: "至少配置 1 个 pipeline step",
    });
  } else if (steps.some((s) => !s.id || !s.primitive)) {
    issues.push({
      step: "pipeline",
      field: "pipeline.steps[].{id,primitive}",
      message: "pipeline step 必须含 id + primitive",
    });
  }

  // Step 5 integration（allowedModels 至少 1，让 mission 启动时有可用模型；
  //   tools 留空表示走默认全集，不强制）
  const models = config.integration?.allowedModels ?? [];
  if (models.length < 1) {
    issues.push({
      step: "integration",
      field: "integration.allowedModels",
      message: "至少允许 1 个模型",
    });
  }

  return issues;
}
