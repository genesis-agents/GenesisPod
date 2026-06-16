import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class DedupeDto {
  @ApiProperty({
    description: "一组重复实体的 UUID（≥2）；将合并为一个存活节点",
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  objectIds!: string[];

  @ApiPropertyOptional({
    description: "指定存活目标 UUID；不传则自动选（置信度最高、其次最早）",
  })
  @IsOptional()
  @IsString()
  targetId?: string;

  @ApiPropertyOptional({ description: "操作原因（写入审计日志）" })
  @IsOptional()
  @IsString()
  reason?: string;
}
