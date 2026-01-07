import { IsString, IsOptional, IsNumber, IsArray, IsEnum, Min } from "class-validator";
import { ChapterStatus } from "@prisma/client";

export class CreateChapterDto {
  @IsNumber()
  @Min(1)
  chapterNumber!: number;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  outline?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependsOn?: string[];
}

export class UpdateChapterDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  outline?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsEnum(ChapterStatus)
  status?: ChapterStatus;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependsOn?: string[];
}

export class StartWritingDto {
  @IsOptional()
  @IsString()
  additionalInstructions?: string;

  @IsOptional()
  @IsNumber()
  @Min(1000)
  targetWordCount?: number;
}
