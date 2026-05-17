import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
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

  /**
   * LLM 推荐把握度，**0-1 浮点**（与 radar-discovery.stage.ts prompt + clamp 一致）。
   * 历史 bug：DTO 误写 @IsInt() @Max(100)，撞 LLM 实际返回 0.85 类 float 导致
   * /recommend/accept 400 风暴（iPhone 用户重试循环）。本次统一 contract：
   *   - prompt: "confidence 为 0-1 浮点数"
   *   - SKILL.md: "confidence (0-1): 你对推荐质量的把握度"
   *   - DTO: @IsNumber({ allowNaN: false }) @Min(0) @Max(1)
   * service 入库不消费此字段，DTO 校验仅防 LLM hallucinate string / out-of-range。
   */
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1)
  confidence?: number;
}

export class AcceptRecommendedSourcesDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RecommendedSourceCandidateDto)
  candidates!: RecommendedSourceCandidateDto[];
}
