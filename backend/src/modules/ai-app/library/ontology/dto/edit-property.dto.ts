import { IsNotEmpty, IsOptional, IsString } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class EditPropertyDto {
  @ApiProperty({ description: "要更新的属性键名" })
  @IsString()
  @IsNotEmpty()
  key!: string;

  @ApiProperty({
    description: "属性新值（任意 JSON 类型；传入 null 可删除该键）",
  })
  value!: unknown;

  @ApiPropertyOptional({ description: "操作原因（可选，写入审计日志）" })
  @IsOptional()
  @IsString()
  reason?: string;
}
