import { IsString, IsOptional, IsNumber, IsEnum, Min } from "class-validator";
import { AnnotationType, AnnotationStatus } from "@prisma/client";

/**
 * 创建批注请求
 */
export class CreateAnnotationDto {
  @IsNumber()
  @Min(0)
  startOffset!: number;

  @IsNumber()
  @Min(0)
  endOffset!: number;

  @IsString()
  content!: string;

  @IsEnum(AnnotationType)
  @IsOptional()
  type?: AnnotationType;

  @IsString()
  @IsOptional()
  selectedText?: string;
}

/**
 * 更新批注请求
 */
export class UpdateAnnotationDto {
  @IsString()
  @IsOptional()
  content?: string;

  @IsEnum(AnnotationStatus)
  @IsOptional()
  status?: AnnotationStatus;
}

/**
 * 批注响应
 */
export interface AnnotationResponse {
  id: string;
  chapterId: string;
  startOffset: number;
  endOffset: number;
  content: string;
  type: AnnotationType;
  status: AnnotationStatus;
  selectedText: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}
