import {
  IsString,
  IsEnum,
  IsOptional,
  IsUrl,
  MaxLength,
} from "class-validator";
import { SocialContentType } from "@prisma/client";

export class ProcessUrlDto {
  @IsString()
  @IsUrl({}, { message: "请提供有效的 URL" })
  @MaxLength(2048, { message: "URL 过长（最大 2048 字符）" })
  url!: string;

  @IsEnum(SocialContentType)
  targetType!: SocialContentType;

  @IsOptional()
  @IsString()
  additionalInstructions?: string;
}
