import { IsString, IsEnum, IsOptional } from "class-validator";
import { SocialContentType } from "@prisma/client";

export class ProcessUrlDto {
  @IsString()
  url!: string;

  @IsEnum(SocialContentType)
  targetType!: SocialContentType;

  @IsOptional()
  @IsString()
  additionalInstructions?: string;
}
