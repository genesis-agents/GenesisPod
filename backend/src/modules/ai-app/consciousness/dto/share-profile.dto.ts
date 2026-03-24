import { IsString, IsNotEmpty, IsOptional, IsBoolean } from "class-validator";

export class ShareProfileDto {
  @IsString()
  @IsNotEmpty()
  sharedWithUserId!: string;

  @IsOptional()
  @IsBoolean()
  canChat?: boolean;

  @IsOptional()
  @IsBoolean()
  canViewMemories?: boolean;
}
