import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsUUID,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ResearchFeedbackSource,
  ResearchFeedbackCategory,
  ResearchFeedbackItemStatus,
  FeedbackPriority,
} from "@prisma/client";

/**
 * 创建反馈 DTO
 */
export class CreateFeedbackItemDto {
  @ApiProperty({ description: "反馈内容" })
  @IsString()
  @MaxLength(10000)
  content!: string;

  @ApiPropertyOptional({ description: "选中的文本" })
  @IsString()
  @IsOptional()
  @MaxLength(5000)
  selectedText?: string;

  @ApiProperty({
    enum: ResearchFeedbackSource,
    description: "反馈来源",
    default: ResearchFeedbackSource.MANUAL,
  })
  @IsEnum(ResearchFeedbackSource)
  @IsOptional()
  sourceType?: ResearchFeedbackSource = ResearchFeedbackSource.MANUAL;

  @ApiPropertyOptional({ description: "来源 ID（如批注 ID）" })
  @IsString()
  @IsOptional()
  sourceId?: string;

  @ApiPropertyOptional({ description: "关联的研究专题 ID" })
  @IsUUID()
  @IsOptional()
  topicId?: string;

  @ApiPropertyOptional({ description: "关联的报告 ID" })
  @IsUUID()
  @IsOptional()
  reportId?: string;

  @ApiPropertyOptional({ description: "关联的报告章节 ID" })
  @IsString()
  @IsOptional()
  sectionId?: string;

  @ApiPropertyOptional({
    enum: ResearchFeedbackCategory,
    description: "反馈分类（可选，AI 会自动分析）",
  })
  @IsEnum(ResearchFeedbackCategory)
  @IsOptional()
  category?: ResearchFeedbackCategory;
}

/**
 * 从批注创建反馈 DTO
 */
export class CreateFromAnnotationDto {
  @ApiProperty({ description: "批注 ID" })
  @IsString()
  annotationId!: string;

  @ApiPropertyOptional({ description: "额外备注" })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  additionalNotes?: string;
}

/**
 * 更新反馈 DTO
 */
export class UpdateFeedbackItemDto {
  @ApiPropertyOptional({ description: "反馈内容" })
  @IsString()
  @IsOptional()
  @MaxLength(10000)
  content?: string;

  @ApiPropertyOptional({
    enum: ResearchFeedbackItemStatus,
    description: "处理状态",
  })
  @IsEnum(ResearchFeedbackItemStatus)
  @IsOptional()
  status?: ResearchFeedbackItemStatus;

  @ApiPropertyOptional({
    enum: ResearchFeedbackCategory,
    description: "反馈分类",
  })
  @IsEnum(ResearchFeedbackCategory)
  @IsOptional()
  category?: ResearchFeedbackCategory;

  @ApiPropertyOptional({ description: "子分类" })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  subcategory?: string;

  @ApiPropertyOptional({ enum: FeedbackPriority, description: "优先级" })
  @IsEnum(FeedbackPriority)
  @IsOptional()
  priority?: FeedbackPriority;

  @ApiPropertyOptional({ description: "分配给的处理人 ID" })
  @IsUUID()
  @IsOptional()
  assignedTo?: string;

  @ApiPropertyOptional({ description: "采取的措施描述" })
  @IsString()
  @IsOptional()
  @MaxLength(5000)
  actionTaken?: string;
}

/**
 * 反馈查询 DTO
 */
export class FeedbackQueryDto {
  @ApiPropertyOptional({
    enum: ResearchFeedbackItemStatus,
    description: "状态筛选",
  })
  @IsEnum(ResearchFeedbackItemStatus)
  @IsOptional()
  status?: ResearchFeedbackItemStatus;

  @ApiPropertyOptional({
    enum: ResearchFeedbackCategory,
    description: "分类筛选",
  })
  @IsEnum(ResearchFeedbackCategory)
  @IsOptional()
  category?: ResearchFeedbackCategory;

  @ApiPropertyOptional({ enum: FeedbackPriority, description: "优先级筛选" })
  @IsEnum(FeedbackPriority)
  @IsOptional()
  priority?: FeedbackPriority;

  @ApiPropertyOptional({ description: "专题 ID 筛选" })
  @IsUUID()
  @IsOptional()
  topicId?: string;

  @ApiPropertyOptional({ description: "报告 ID 筛选" })
  @IsUUID()
  @IsOptional()
  reportId?: string;

  @ApiPropertyOptional({ description: "分配给的处理人 ID" })
  @IsUUID()
  @IsOptional()
  assignedTo?: string;

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
 * AI 分析结果
 */
export interface AIAnalysisResult {
  summary: string;
  rootCause: string;
  suggestedAction: string;
  confidence: number;
  relatedFeedback?: string[];
  improvementSuggestions?: string[];
}

/**
 * 反馈统计响应
 */
export interface FeedbackStatsResponse {
  total: number;
  byCategory: Record<ResearchFeedbackCategory, number>;
  byStatus: Record<ResearchFeedbackItemStatus, number>;
  byPriority: Record<FeedbackPriority, number>;
  recentTrend: { date: string; count: number }[];
}

/**
 * 反馈聚类结果
 */
export interface FeedbackCluster {
  clusterId: string;
  theme: string;
  feedbackIds: string[];
  count: number;
  priority: FeedbackPriority;
  suggestedCategory: ResearchFeedbackCategory;
}
