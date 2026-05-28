import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { SecretCategory } from "@prisma/client";
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

/**
 * 2026-05-28 BYOK 加固 PR-3：用户私有「工具/其它类」Key（user_credentials 表，信封加密 v2）。
 * LLM（AI_MODEL）类不走这里 —— 仍由 user_api_keys + UserApiKeysService 管。
 */
export class CreateUserCredentialDto {
  @ApiProperty({ example: "tavily-search-api-key" })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: "Tavily 搜索 Key" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayName?: string;

  @ApiProperty({ enum: SecretCategory, example: SecretCategory.SEARCH })
  @IsEnum(SecretCategory)
  category!: SecretCategory;

  @ApiPropertyOptional({ example: "tavily" })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  provider?: string;

  @ApiProperty({ description: "明文密钥值（落库前信封加密）" })
  @IsString()
  @MinLength(1)
  value!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateUserCredentialDto {
  @ApiPropertyOptional({ description: "新明文密钥值（留空表示不改值）" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  value?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** 用户凭据列表项（不含明文）。 */
export interface UserCredentialListItem {
  id: string;
  name: string;
  displayName: string;
  category: SecretCategory;
  provider: string | null;
  maskedValue: string;
  isActive: boolean;
  usageCount: number;
  testStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
}
