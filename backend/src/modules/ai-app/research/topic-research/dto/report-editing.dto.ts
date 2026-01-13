import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsEnum,
  IsOptional,
  IsNumber,
  IsArray,
} from "class-validator";

// ==================== Annotation DTOs ====================

export enum AnnotationType {
  COMMENT = "COMMENT",
  SUGGESTION = "SUGGESTION",
  ISSUE = "ISSUE",
  REFERENCE = "REFERENCE",
}

export enum AnnotationStatus {
  OPEN = "OPEN",
  RESOLVED = "RESOLVED",
  DISMISSED = "DISMISSED",
}

export class CreateAnnotationDto {
  @ApiProperty({ description: "批注内容" })
  @IsString()
  content!: string;

  @ApiProperty({
    description: "批注类型",
    enum: AnnotationType,
  })
  @IsEnum(AnnotationType)
  type!: AnnotationType;

  @ApiPropertyOptional({ description: "选中的文本" })
  @IsString()
  @IsOptional()
  selectedText?: string;

  @ApiProperty({ description: "起始偏移量" })
  @IsNumber()
  startOffset!: number;

  @ApiProperty({ description: "结束偏移量" })
  @IsNumber()
  endOffset!: number;
}

export class UpdateAnnotationDto {
  @ApiPropertyOptional({ description: "批注内容" })
  @IsString()
  @IsOptional()
  content?: string;

  @ApiPropertyOptional({
    description: "批注状态",
    enum: AnnotationStatus,
  })
  @IsEnum(AnnotationStatus)
  @IsOptional()
  status?: AnnotationStatus;
}

// ==================== Change DTOs ====================

export enum ChangeType {
  ADDED = "ADDED",
  MODIFIED = "MODIFIED",
  DELETED = "DELETED",
}

export class CheckinChangeDto {
  @ApiPropertyOptional({ description: "Checkin 备注" })
  @IsString()
  @IsOptional()
  comment?: string;
}

export class CheckinAllChangesDto {
  @ApiPropertyOptional({
    description:
      "要 Checkin 的变更 ID 列表，如果为空则 Checkin 所有未确认的变更",
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  changeIds?: string[];
}
