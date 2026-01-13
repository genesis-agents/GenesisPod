import {
  IsString,
  IsOptional,
  IsEnum,
  IsObject,
  MaxLength,
} from "class-validator";
import { ResearchTopicStatus, RefreshFrequency } from "../types";

export class UpdateTopicDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(ResearchTopicStatus)
  status?: ResearchTopicStatus;

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
}
