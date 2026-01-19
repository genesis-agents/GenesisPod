import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  MaxLength,
  MinLength,
  Matches,
  IsDateString,
} from "class-validator";
import { SecretCategory } from "@prisma/client";

export class CreateSecretDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @Matches(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/, {
    message: "name must be lowercase alphanumeric with hyphens only",
  })
  name!: string;

  @IsString()
  @MaxLength(200)
  displayName!: string;

  @IsString()
  value!: string;

  @IsOptional()
  @IsEnum(SecretCategory)
  category?: SecretCategory;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  provider?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
