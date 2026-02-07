import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsObject,
  MaxLength,
  ValidateNested,
  IsIn,
  IsNotEmpty,
} from "class-validator";
import { Type } from "class-transformer";
import { ResearchTopicType, RefreshFrequency } from "../types";
import { TopicVisibility } from "./collaborator.dto";

export class DimensionConfigDto {
  @IsString()
  @IsNotEmpty()
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
  @IsNotEmpty()
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
  topicConfig?: Record<string, unknown>;

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
  @IsEnum(TopicVisibility)
  visibility?: TopicVisibility;

  @IsOptional()
  @IsString()
  @IsIn(["zh", "en"])
  @MaxLength(10)
  language?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DimensionConfigDto)
  dimensions?: DimensionConfigDto[];
}
