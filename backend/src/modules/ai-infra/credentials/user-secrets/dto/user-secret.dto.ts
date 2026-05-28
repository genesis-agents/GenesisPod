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
 * 2026-05-27 BYOK：用户私有 Secret 的来源表。
 * - llm   → AI_MODEL 类，落 user_api_keys 表（复用 v1.0 KeyResolver / 捐赠池 / 多 key fallback）
 * - secret→ 工具/其他类，落 secrets 表（userId 非空 + per-user HKDF 加密）
 * 见方案 §18.1 落地铁律 1：写回按 category 分流。
 */
export type UserSecretSource = "llm" | "secret";

export class CreateUserSecretDto {
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

  @ApiProperty({ description: "明文密钥值（落库前加密）" })
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

export class UpdateUserSecretDto {
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

/** 统一列表项（UNION user_api_keys + secrets 后给前端的归一形状）。 */
export interface UserSecretListItem {
  source: UserSecretSource;
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
