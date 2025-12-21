/**
 * Document DTOs - 文档生成相关 DTO
 */

import { IsOptional, IsEnum } from "class-validator";

export enum DocumentType {
  PRD = "PRD",
  DESIGN = "DESIGN",
  API = "API",
  README = "README",
  CHANGELOG = "CHANGELOG",
}

export class GetDocumentsDto {
  @IsOptional()
  @IsEnum(DocumentType)
  type?: DocumentType;
}

export class RegenerateDocumentDto {
  @IsEnum(DocumentType)
  type!: DocumentType;
}
