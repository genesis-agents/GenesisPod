import { IsString, IsOptional, IsNumber, IsEnum, Min, Max } from "class-validator";
import { WritingProjectStatus } from "@prisma/client";

export class CreateProjectDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  genre!: string;

  @IsOptional()
  @IsNumber()
  @Min(10000)
  targetWords?: number;

  @IsOptional()
  @IsString()
  writingStyle?: string;

  @IsOptional()
  @IsString()
  targetAudience?: string;

  @IsOptional()
  @IsString()
  pov?: string;

  @IsOptional()
  @IsString()
  tense?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  maxParallelWriters?: number;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  genre?: string;

  @IsOptional()
  @IsNumber()
  @Min(10000)
  targetWords?: number;

  @IsOptional()
  @IsEnum(WritingProjectStatus)
  status?: WritingProjectStatus;

  @IsOptional()
  @IsString()
  writingStyle?: string;

  @IsOptional()
  @IsString()
  targetAudience?: string;

  @IsOptional()
  @IsString()
  pov?: string;

  @IsOptional()
  @IsString()
  tense?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  maxParallelWriters?: number;
}
