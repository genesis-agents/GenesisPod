/**
 * Standards DTOs - 工程规范相关 DTO
 */

import {
  IsString,
  IsOptional,
  IsEnum,
  MaxLength,
  MinLength,
} from "class-validator";

export enum StandardType {
  API_DESIGN = "API_DESIGN",
  NAMING = "NAMING",
  CODE_STYLE = "CODE_STYLE",
  TESTING = "TESTING",
  SECURITY = "SECURITY",
  DOCUMENTATION = "DOCUMENTATION",
  ARCHITECTURE = "ARCHITECTURE",
  OTHER = "OTHER",
}

export enum StandardSource {
  CUSTOM = "CUSTOM",
  GITHUB = "GITHUB",
  TEMPLATE = "TEMPLATE",
}

export class CreateStandardDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsEnum(StandardType)
  type!: StandardType;

  @IsOptional()
  @IsEnum(StandardSource)
  source?: StandardSource;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  sourceUrl?: string;
}

export class UpdateStandardDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  content?: string;
}

export class ApplyTemplateDto {
  @IsString()
  templateId!: string;
}
