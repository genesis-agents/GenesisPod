import {
  IsOptional,
  IsInt,
  IsString,
  IsEnum,
  IsBoolean,
  Min,
  Max,
  IsNotEmpty,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

// ==================== Report Update DTOs ====================

/**
 * 更新报告内容 DTO
 */
export class UpdateReportContentDto {
  @ApiPropertyOptional({
    description: "执行摘要",
    example: "本研究聚焦于 AI 大模型的发展趋势...",
  })
  @IsOptional()
  @IsString()
  executiveSummary?: string;

  @ApiPropertyOptional({
    description: "完整报告 (Markdown)",
    example: "# 研究报告\n\n## 摘要\n...",
  })
  @IsOptional()
  @IsString()
  fullReport?: string;

  @ApiPropertyOptional({
    description: "修改描述",
    example: "更新了市场分析部分",
  })
  @IsOptional()
  @IsString()
  changeDescription?: string;
}

/**
 * AI 编辑报告 DTO
 */
export class AIEditReportDto {
  @ApiProperty({
    description: "AI 编辑操作类型",
    enum: ["rewrite", "polish", "expand", "compress", "style"],
    example: "polish",
  })
  @IsEnum(["rewrite", "polish", "expand", "compress", "style"])
  @IsNotEmpty()
  operation!: "rewrite" | "polish" | "expand" | "compress" | "style";

  @ApiPropertyOptional({
    description: "选中的文本（仅编辑选中部分）",
    example: "本研究聚焦于...",
  })
  @IsOptional()
  @IsString()
  selection?: string;

  @ApiPropertyOptional({
    description: "额外的用户指令",
    example: "更加专业化，使用学术风格",
  })
  @IsOptional()
  @IsString()
  customInstruction?: string;

  @ApiPropertyOptional({
    description: "目标风格（仅 style 操作）",
    enum: ["academic", "business", "casual", "technical"],
    example: "business",
  })
  @IsOptional()
  @IsEnum(["academic", "business", "casual", "technical"])
  targetStyle?: "academic" | "business" | "casual" | "technical";
}

/**
 * 回滚报告版本 DTO
 */
export class RollbackReportDto {
  @ApiProperty({
    description: "要回滚到的修订版本号",
    example: 3,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  revisionNumber!: number;
}

// ==================== Report Query DTOs ====================

export class ListReportsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}

export class ExportReportDto {
  @IsEnum(["pdf", "docx"])
  format!: "pdf" | "docx";

  @IsOptional()
  @IsBoolean()
  includeEvidence?: boolean;

  @IsOptional()
  @IsBoolean()
  includeMetadata?: boolean;
}

export class CompareReportsDto {
  @IsInt()
  @Min(1)
  from!: number;

  @IsInt()
  @Min(1)
  to!: number;
}
