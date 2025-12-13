import { IsString, IsOptional, IsBoolean } from "class-validator";

export class QuickGenerateDto {
  @IsString()
  prompt: string = "";

  @IsOptional()
  @IsBoolean()
  autoResearch?: boolean;

  @IsOptional()
  @IsBoolean()
  autoMedia?: boolean;
}
