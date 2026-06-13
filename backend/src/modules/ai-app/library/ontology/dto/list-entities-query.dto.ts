import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";

/** Sort options for the entity list endpoint. */
export type OntologyEntitySortBy = "confidence" | "updated" | "relations";

export class ListEntitiesQueryDto {
  @IsOptional()
  @IsString()
  topicId?: string;

  @IsOptional()
  @IsString()
  typeKey?: string;

  /** Full-text filter against label (case-insensitive contains). */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(["confidence", "updated", "relations"])
  sortBy?: OntologyEntitySortBy;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}
