import {
  IsEnum,
  IsString,
  IsOptional,
  IsObject,
  MaxLength,
} from "class-validator";
import { ResearchTopicType } from "../types";

export class GetTemplatesDto {
  @IsEnum(ResearchTopicType)
  type!: ResearchTopicType;
}

export class CreateFromTemplateDto {
  @IsString()
  templateId!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsObject()
  topicConfig?: Record<string, any>;

  @IsOptional()
  @IsObject()
  customizations?: {
    dimensions?: {
      add?: Array<{
        name: string;
        description?: string;
        searchQueries?: string[];
      }>;
      remove?: string[];
    };
  };
}
