import {
  IsString,
  IsIn,
  IsOptional,
  IsArray,
  IsNumber,
  IsUUID,
  ValidateNested,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";

// ============================================================================
// Enum String Values (与 Prisma Schema 保持一致)
// 注意：当 Prisma 生成后，可以改回使用 @prisma/client 导出的 enum
// ============================================================================

export const OFFICE_DOCUMENT_TYPES = [
  "ARTICLE",
  "PPT",
  "SPREADSHEET",
  "REPORT",
  "PROPOSAL",
  "RESEARCH",
] as const;

export const OFFICE_DOCUMENT_STATUSES = [
  "DRAFT",
  "GENERATING",
  "COMPLETED",
  "FAILED",
  "ARCHIVED",
] as const;

export const VERSION_TRIGGERS = [
  "AI_GENERATION",
  "USER_EDIT",
  "MANUAL_SAVE",
  "AUTO_SAVE",
] as const;

export const RESOURCE_REF_TYPES = ["PRIMARY", "SUPPORTING", "CITED"] as const;

export type OfficeDocumentType = (typeof OFFICE_DOCUMENT_TYPES)[number];
export type OfficeDocumentStatus = (typeof OFFICE_DOCUMENT_STATUSES)[number];
export type VersionTrigger = (typeof VERSION_TRIGGERS)[number];
export type ResourceRefType = (typeof RESOURCE_REF_TYPES)[number];

// ============================================================================
// AI Config DTO
// ============================================================================

export class AIConfigDto {
  @IsOptional()
  @IsUUID()
  textModelId?: string;

  @IsOptional()
  @IsUUID()
  imageModelId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsString()
  style?: string;
}

// ============================================================================
// Document DTOs
// ============================================================================

export class CreateDocumentDto {
  @IsString()
  title: string = "";

  @IsIn(OFFICE_DOCUMENT_TYPES)
  type: OfficeDocumentType = "ARTICLE";

  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  resourceIds?: string[];

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AIConfigDto)
  aiConfig?: AIConfigDto;
}

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  content?: any;

  @IsOptional()
  @IsString()
  markdown?: string;

  @IsOptional()
  metadata?: any;

  @IsOptional()
  @IsIn(OFFICE_DOCUMENT_STATUSES)
  status?: OfficeDocumentStatus;
}

export class ListDocumentsQueryDto {
  @IsOptional()
  @IsIn(OFFICE_DOCUMENT_TYPES)
  type?: OfficeDocumentType;

  @IsOptional()
  @IsIn(OFFICE_DOCUMENT_STATUSES)
  status?: OfficeDocumentStatus;

  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  offset?: number;
}

// ============================================================================
// Version DTOs
// ============================================================================

export class CreateVersionDto {
  @IsIn(VERSION_TRIGGERS)
  trigger: VersionTrigger = "MANUAL_SAVE";

  @IsOptional()
  @IsString()
  triggerSource?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CompareVersionsDto {
  @IsUUID()
  version1Id: string = "";

  @IsUUID()
  version2Id: string = "";
}

// ============================================================================
// Resource Reference DTOs
// ============================================================================

export class AddResourceRefDto {
  @IsUUID()
  resourceId: string = "";

  @IsOptional()
  @IsIn(RESOURCE_REF_TYPES)
  refType?: ResourceRefType;
}

export class AddResourceRefsDto {
  @IsArray()
  @IsUUID("4", { each: true })
  resourceIds: string[] = [];

  @IsOptional()
  @IsIn(RESOURCE_REF_TYPES)
  refType?: ResourceRefType;
}
