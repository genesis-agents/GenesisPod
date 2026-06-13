import { IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class SetConfidenceDto {
  @ApiProperty({ description: "新的置信度得分（0–1）", minimum: 0, maximum: 1 })
  @IsNumber()
  @Min(0)
  @Max(1)
  value!: number;

  @ApiPropertyOptional({ description: "操作原因（可选，写入审计日志）" })
  @IsOptional()
  @IsString()
  reason?: string;
}
