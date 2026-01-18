import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  MaxLength,
  MinLength,
  IsDate,
} from "class-validator";
import { Type } from "class-transformer";
import { SecretCategory } from "@prisma/client";

export class UpdateSecretDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(200)
  displayName?: string;

  @IsEnum(SecretCategory)
  @IsOptional()
  category?: SecretCategory;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsString()
  @IsOptional()
  @MinLength(1)
  value?: string;

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
