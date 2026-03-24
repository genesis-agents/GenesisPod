import { IsString, IsNotEmpty, MaxLength, IsOptional } from "class-validator";

export class CreateProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
