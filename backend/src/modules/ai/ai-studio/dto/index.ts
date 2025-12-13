import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsUrl,
  IsBoolean,
  MaxLength,
  IsObject,
} from "class-validator";

// ==================== Research Project DTOs ====================

export class CreateProjectDto {
  @IsString()
  @MaxLength(500)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  icon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  icon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @IsOptional()
  @IsEnum(["ACTIVE", "ARCHIVED"])
  status?: "ACTIVE" | "ARCHIVED";
}

// ==================== Source DTOs ====================

export class AddSourceDto {
  @IsString()
  @MaxLength(1000)
  title!: string;

  @IsString()
  @MaxLength(50)
  sourceType!: string; // paper, github, news, blog, video, file

  @IsOptional()
  @IsUrl()
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  abstract?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsArray()
  authors?: string[];

  @IsOptional()
  @IsString()
  publishedAt?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  resourceId?: string; // Link to existing resource
}

export class AddSourcesDto {
  @IsArray()
  sources!: AddSourceDto[];
}

// ==================== Note DTOs ====================

export class CreateNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  sourceType?: string; // manual, ai-chat, generated

  @IsOptional()
  @IsString()
  chatId?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}

export class UpdateNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}

// ==================== Chat DTOs ====================

export class SendChatMessageDto {
  @IsString()
  message!: string;

  @IsOptional()
  @IsArray()
  selectedSourceIds?: string[];

  @IsOptional()
  @IsString()
  model?: string;
}

// ==================== Output DTOs ====================

export type OutputTypeValue =
  | "STUDY_GUIDE"
  | "BRIEFING_DOC"
  | "FAQ"
  | "TIMELINE"
  | "AUDIO_OVERVIEW"
  | "TREND_REPORT"
  | "COMPARISON"
  | "KNOWLEDGE_GRAPH"
  | "CUSTOM";

export class GenerateOutputDto {
  @IsEnum([
    "STUDY_GUIDE",
    "BRIEFING_DOC",
    "FAQ",
    "TIMELINE",
    "AUDIO_OVERVIEW",
    "TREND_REPORT",
    "COMPARISON",
    "KNOWLEDGE_GRAPH",
    "CUSTOM",
  ])
  type!: OutputTypeValue;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  customTitle?: string;

  @IsOptional()
  @IsArray()
  selectedSourceIds?: string[];

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsObject()
  options?: Record<string, unknown>;
}

// ==================== Search DTOs ====================

export class SearchSourcesDto {
  @IsString()
  query!: string;

  @IsOptional()
  @IsEnum(["quick", "deep"])
  mode?: "quick" | "deep";

  @IsOptional()
  @IsArray()
  sources?: string[]; // arxiv, github, news, blog, local

  @IsOptional()
  @IsBoolean()
  includeInternet?: boolean;
}
