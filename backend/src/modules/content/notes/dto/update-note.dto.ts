import { IsString, IsOptional, IsArray, IsBoolean } from "class-validator";

/**
 * 更新笔记DTO
 */
export class UpdateNoteDto {
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsArray()
  highlights?: any[];

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  aiInsights?: any;

  @IsOptional()
  @IsArray()
  graphNodes?: any[];
}
