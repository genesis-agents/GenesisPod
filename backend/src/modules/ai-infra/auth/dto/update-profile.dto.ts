import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsUrl,
  ArrayMaxSize,
} from "class-validator";

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
  @MaxLength(100)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  avatarUrl?: string;

  @IsOptional()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @ArrayMaxSize(20)
  interests?: string[];

  // 用户偏好设置
  @IsOptional()
  preferences?: {
    language?: string;
    timezone?: string;
    theme?: "light" | "dark" | "system";
  };
}
