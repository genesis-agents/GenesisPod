import { IsString, IsEmail, MinLength, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * 用户注册 DTO
 */
export class RegisterDto {
  @ApiProperty({ description: "用户邮箱", example: "user@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: "用户名",
    example: "john_doe",
    minLength: 1,
    maxLength: 50,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  username!: string;

  @ApiProperty({
    description: "密码",
    example: "StrongPassword123!",
    minLength: 6,
  })
  @IsString()
  @MinLength(6)
  password!: string;
}
