import { IsString, MaxLength, IsOptional, IsEnum } from "class-validator";
import { ConsciousnessSharePermission } from "@prisma/client";

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsEnum(ConsciousnessSharePermission)
  sharePermission?: ConsciousnessSharePermission;
}
