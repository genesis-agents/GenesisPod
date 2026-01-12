import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsInt,
  MaxLength,
  Min,
  Max,
} from "class-validator";

export class AddDimensionDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  searchQueries?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  searchSources?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  minSources?: number;
}

export class UpdateDimensionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  searchQueries?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  searchSources?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  sortOrder?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  minSources?: number;
}

export class ReorderDimensionsDto {
  @IsArray()
  @IsString({ each: true })
  dimensionIds!: string[];
}
