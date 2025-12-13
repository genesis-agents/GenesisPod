import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  MaxLength,
} from "class-validator";
import { Type } from "class-transformer";
import {
  MessageContentType,
  MentionType,
  AttachmentType,
} from "@prisma/client";

export class MentionDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  aiMemberId?: string;

  @IsEnum(MentionType)
  mentionType!: MentionType;
}

export class AttachmentDto {
  @IsEnum(AttachmentType)
  type!: AttachmentType;

  @IsString()
  @MaxLength(500)
  name!: string;

  @IsString()
  url!: string;

  @IsOptional()
  size?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  mimeType?: string;

  @IsOptional()
  @IsString()
  resourceId?: string; // 如果是Library资源

  @IsOptional()
  linkPreview?: {
    title?: string;
    description?: string;
    image?: string;
    favicon?: string;
  };
}

export class SendMessageDto {
  @IsString()
  content!: string;

  @IsOptional()
  @IsEnum(MessageContentType)
  contentType?: MessageContentType;

  @IsOptional()
  @IsString()
  replyToId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MentionDto)
  mentions?: MentionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];
}
