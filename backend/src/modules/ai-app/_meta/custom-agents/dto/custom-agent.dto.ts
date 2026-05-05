/**
 * E R4 Phase 2 (PR-E1, 2026-05-05): 用户自定义 Agent DTO
 *
 * 5 步向导各步骤数据汇总到一个 config JSON。当前骨架阶段只校验 step 1
 * (basicInfo)；后续 PR 增量加 topicSchema / skills / pipeline / integration。
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

/**
 * 5 步向导汇总配置（每步可独立 partial fill / save）
 */
export interface CustomAgentConfig {
  basicInfo?: {
    name?: string;
    description?: string;
    language?: string;
    audience?: string;
    purpose?: string;
  };
  topicSchema?: {
    dimensions?: Array<{ name: string; description?: string }>;
    goalTemplate?: string;
  };
  skills?: {
    allowedSkillIds?: string[];
    deniedSkillIds?: string[];
  };
  pipeline?: {
    steps?: Array<{ id: string; primitive: string; roleId?: string }>;
  };
  integration?: {
    allowedTools?: string[];
    allowedModels?: string[];
  };
}

export type CustomAgentConfigKeys = keyof CustomAgentConfig;
