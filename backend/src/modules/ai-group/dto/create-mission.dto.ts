import {
  IsString,
  IsOptional,
  IsArray,
  MaxLength,
  IsBoolean,
} from "class-validator";

export class CreateMissionDto {
  @IsString()
  @MaxLength(500)
  title!: string;

  @IsString()
  description!: string;

  @IsString()
  leaderId!: string; // 指定的 Leader AI Member ID

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  objectives?: string[]; // 任务目标列表

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  constraints?: string[]; // 约束条件

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  deliverables?: string[]; // 期望交付物

  @IsOptional()
  @IsBoolean()
  autoStart?: boolean; // 是否自动开始（默认 true）
}
