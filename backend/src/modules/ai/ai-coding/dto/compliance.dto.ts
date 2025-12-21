/**
 * Compliance DTOs - 合规性检查相关 DTO
 */

import { IsString, IsOptional, IsArray } from "class-validator";

export class CheckComplianceDto {
  @IsOptional()
  @IsString()
  iterationId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  standardIds?: string[];
}
