import { IsString, IsOptional, IsArray, IsEnum } from "class-validator";
import { SocialContentType, SocialContentSourceType } from "../types";

export class CreateContentDto {
  @IsEnum(SocialContentType)
  contentType!: SocialContentType;

  @IsOptional()
  @IsEnum(SocialContentSourceType)
  sourceType?: SocialContentSourceType;

  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @IsString()
  title!: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  author?: string;

  @IsOptional()
  @IsString()
  digest?: string;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  location?: string;
}
