import { IsString, IsEnum, IsOptional } from "class-validator";
import { SocialContentType, SocialContentSourceType } from "../types";

export class ProcessSourceDto {
  @IsEnum(SocialContentSourceType)
  sourceType!: SocialContentSourceType;

  @IsString()
  sourceId!: string;

  @IsEnum(SocialContentType)
  targetType!: SocialContentType;

  @IsOptional()
  @IsString()
  additionalInstructions?: string;
}
