import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsNumber,
  Min,
  Max,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ImprovementType } from "@prisma/client";

/**
 * 创建知识条目 DTO
 */
export class CreateFeedbackKnowledgeDto {
  @ApiProperty({ description: "知识标题" })
  @IsString()
  @MaxLength(500)
  title!: string;

  @ApiProperty({ description: "知识内容" })
  @IsString()
  @MaxLength(20000)
  content!: string;

  @ApiPropertyOptional({ description: "标签", type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiProperty({ enum: ImprovementType, description: "改进类型" })
  @IsEnum(ImprovementType)
  improvementType!: ImprovementType;

  @ApiPropertyOptional({ description: "改进详情（JSON）" })
  @IsOptional()
  improvementData?: Record<string, unknown>;
}

/**
 * 更新知识条目 DTO
 */
export class UpdateFeedbackKnowledgeDto {
  @ApiPropertyOptional({ description: "知识标题" })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  title?: string;

  @ApiPropertyOptional({ description: "知识内容" })
  @IsString()
  @IsOptional()
  @MaxLength(20000)
  content?: string;

  @ApiPropertyOptional({ description: "标签", type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ description: "改进详情（JSON）" })
  @IsOptional()
  improvementData?: Record<string, unknown>;
}

/**
 * 评估效果 DTO
 */
export class EvaluateEffectDto {
  @ApiProperty({ description: "效果评分 (0-5)", minimum: 0, maximum: 5 })
  @IsNumber()
  @Min(0)
  @Max(5)
  effectScore!: number;

  @ApiPropertyOptional({ description: "效果说明" })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  effectNotes?: string;
}

/**
 * 知识查询 DTO
 */
export class KnowledgeQueryDto {
  @ApiPropertyOptional({ enum: ImprovementType, description: "改进类型筛选" })
  @IsEnum(ImprovementType)
  @IsOptional()
  improvementType?: ImprovementType;

  @ApiPropertyOptional({ description: "标签筛选", type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ description: "是否已应用" })
  @IsOptional()
  applied?: boolean;

  @ApiPropertyOptional({ description: "页码", default: 1 })
  @IsNumber()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ description: "每页数量", default: 20 })
  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}

/**
 * 改进追踪响应
 */
export interface ImprovementTrackingResponse {
  applied: number;
  pending: number;
  avgEffectScore: number;
  recentImprovements: {
    id: string;
    title: string;
    improvementType: ImprovementType;
    appliedAt: Date | null;
    effectScore: number | null;
  }[];
}

/**
 * Prompt 更新改进数据
 */
export interface PromptUpdateData {
  taskType: string;
  previousVersion: number;
  newVersion: number;
  changes: string;
  affectedPromptIds?: string[];
}

/**
 * 策略变更改进数据
 */
export interface StrategyChangeData {
  strategyName: string;
  previousConfig: Record<string, unknown>;
  newConfig: Record<string, unknown>;
  reason: string;
}

/**
 * 质量规则改进数据
 */
export interface QualityRuleData {
  ruleName: string;
  ruleType: "validation" | "scoring" | "threshold";
  ruleConfig: Record<string, unknown>;
  description: string;
}
