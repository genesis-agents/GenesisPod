import { IsString, IsOptional, IsEnum, MaxLength } from "class-validator";
import { TopicType } from "@prisma/client";

export class UpdateTopicDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

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
  settings?: Record<string, any>;
}
