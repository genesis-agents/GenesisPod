import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsObject,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { ResearchTopicType, RefreshFrequency } from "../types";

export class DimensionConfigDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  searchQueries?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  searchSources?: string[];

  @IsOptional()
  sortOrder?: number;

  @IsOptional()
  isEnabled?: boolean;

  @IsOptional()
  minSources?: number;
}

export class CreateTopicDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsEnum(ResearchTopicType)
  type!: ResearchTopicType;

  @IsOptional()
  @IsObject()
  topicConfig?: Record<string, any>;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  icon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @IsOptional()
  @IsEnum(RefreshFrequency)
  refreshFrequency?: RefreshFrequency;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DimensionConfigDto)
  dimensions?: DimensionConfigDto[];
}
