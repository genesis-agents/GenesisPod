import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ArrayMinSize,
} from "class-validator";
import { ForwardTargetType, MergeMode } from "@prisma/client";

export class ForwardMessagesDto {
  @IsArray()
  @IsUUID("4", { each: true })
  @ArrayMinSize(1)
  messageIds!: string[];

  @IsEnum(ForwardTargetType)
  targetType!: ForwardTargetType;

  @IsOptional()
  @IsUUID("4")
  targetTopicId?: string;

  @IsOptional()
  @IsUUID("4")
  targetUserId?: string;

  @IsOptional()
  @IsEnum(MergeMode)
  mergeMode?: MergeMode;

  @IsOptional()
  @IsString()
  forwardNote?: string;
}

export class BookmarkMessageDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
