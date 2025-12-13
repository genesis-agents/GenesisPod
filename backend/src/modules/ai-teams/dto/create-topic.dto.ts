import {
  IsString,
  IsOptional,
  IsEnum,
  MaxLength,
  IsArray,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { TopicType } from "@prisma/client";

export class InitialAIMemberDto {
  @IsString()
  @MaxLength(50)
  aiModel!: string;

  @IsString()
  @MaxLength(100)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  roleDescription?: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;
}

export class CreateTopicDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TopicType)
  type?: TopicType;

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memberIds?: string[]; // 初始邀请的成员ID列表

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InitialAIMemberDto)
  aiMembers?: InitialAIMemberDto[]; // 初始添加的AI成员
}
