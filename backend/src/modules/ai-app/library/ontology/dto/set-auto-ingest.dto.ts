import { IsBoolean } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class SetAutoIngestDto {
  @ApiProperty({ description: "是否开启自动摄入", example: true })
  @IsBoolean()
  enabled!: boolean;
}
