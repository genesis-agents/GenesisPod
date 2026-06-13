import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class ListEditsQueryDto {
  @ApiPropertyOptional({ description: "按 objectId 过滤" })
  @IsOptional()
  @IsString()
  objectId?: string;

  @ApiPropertyOptional({
    description: "按话题 topicId 过滤（返回该话题下所有节点的编辑记录）",
  })
  @IsOptional()
  @IsString()
  topicId?: string;

  @ApiPropertyOptional({
    description: "返回条数上限（默认 50，最大 200）",
    default: 50,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  limit?: number;
}
