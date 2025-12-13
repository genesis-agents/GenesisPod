import { IsString, IsOptional, MinLength, MaxLength } from "class-validator";

/**
 * 更新用户个人信息 DTO
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsString({ each: true })
  interests?: string[];
}
