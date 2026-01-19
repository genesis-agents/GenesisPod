import { IsOptional, IsString, IsEnum, IsInt, Min, Max } from "class-validator";
import { Type } from "class-transformer";
import { SourceType } from "../types";

export class ListEvidenceDto {
  @IsOptional()
  @IsString()
  dimensionId?: string;

  @IsOptional()
  @IsEnum(SourceType)
  sourceType?: SourceType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  minCredibility?: number;

  @IsOptional()
  @IsEnum(["citationIndex", "credibilityScore", "publishedAt"])
  sortBy?: "citationIndex" | "credibilityScore" | "publishedAt";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}
