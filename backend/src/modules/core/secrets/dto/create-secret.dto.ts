import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  MaxLength,
  MinLength,
  Matches,
  IsDate,
} from "class-validator";
import { Type } from "class-transformer";
import { SecretCategory } from "@prisma/client";

export class CreateSecretDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/, {
    message: "name must be lowercase alphanumeric with hyphens only",
  })
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName!: string;

  @IsEnum(SecretCategory)
  category!: SecretCategory;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsString()
  @MinLength(1)
  value!: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  provider?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  expiresAt?: Date;
}
