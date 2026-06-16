import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class RenameObjectDto {
  @ApiProperty({ description: "新的规范名（label）；旧名自动转入别名" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  label!: string;

  @ApiPropertyOptional({ description: "操作原因（建议填写，写入审计日志）" })
  @IsOptional()
  @IsString()
  reason?: string;
}
