import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ArrayMinSize,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class MergeObjectsDto {
  @ApiProperty({
    description: "要被吸收的源节点 UUID 列表（这些节点将被标记删除）",
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  sourceIds!: string[];

  @ApiProperty({ description: "合并目标（存活）节点的 UUID" })
  @IsString()
  @IsNotEmpty()
  targetId!: string;

  @ApiPropertyOptional({ description: "操作原因（建议填写，写入审计日志）" })
  @IsOptional()
  @IsString()
  reason?: string;
}
