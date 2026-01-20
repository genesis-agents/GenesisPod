import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsBoolean,
  IsEnum,
  MaxLength,
  Matches,
} from "class-validator";
import { Type, Transform } from "class-transformer";
import { SecretCategory } from "@prisma/client";

export class QuerySecretsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsEnum(SecretCategory)
  category?: SecretCategory;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: "Search term cannot exceed 200 characters" })
  @Matches(/^[a-zA-Z0-9\s\-_]*$/, {
    message: "Search term contains invalid characters",
  })
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: "Provider filter cannot exceed 100 characters" })
  provider?: string;

  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  isActive?: boolean;
}
