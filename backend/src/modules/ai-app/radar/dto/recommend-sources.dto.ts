import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { RadarSourceTypeDto } from "./create-radar-source.dto";

export class RecommendSourcesDto {
  /**
   * 每类候选数量上限（X / YouTube / RSS / Custom 各几个），默认 5。
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  perTypeLimit?: number;
}

/**
 * 单个 AI 推荐候选项（前端把 LLM 返回的 RecommendedSource 原样回传，
 * service 层入库；nested class-validator 校验避免 SSRF / 注入）。
 */
export class RecommendedSourceCandidateDto {
  @IsEnum(RadarSourceTypeDto)
  type!: RadarSourceTypeDto;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  identifier!: string;

  @IsString()
  @MaxLength(200)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  rationale?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  confidence?: number;
}

export class AcceptRecommendedSourcesDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RecommendedSourceCandidateDto)
  candidates!: RecommendedSourceCandidateDto[];
}
