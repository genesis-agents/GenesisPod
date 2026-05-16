import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

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

export class AcceptRecommendedSourcesDto {
  @IsArray()
  @IsString({ each: true })
  candidates!: string[];
}
