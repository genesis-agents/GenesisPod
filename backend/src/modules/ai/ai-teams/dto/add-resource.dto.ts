import { IsString, IsOptional, IsEnum, MaxLength } from "class-validator";
import { TopicResourceType } from "@prisma/client";

export class AddResourceDto {
  @IsEnum(TopicResourceType)
  type!: TopicResourceType;

  @IsString()
  @MaxLength(500)
  name!: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  resourceId?: string; // 如果是Library资源

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  fileSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  mimeType?: string;

  @IsOptional()
  @IsString()
  sourceMessageId?: string; // 来源消息ID
}
