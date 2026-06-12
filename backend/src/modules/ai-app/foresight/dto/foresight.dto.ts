import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export const FORESIGHT_LAYERS = ["L0", "L1", "L2", "L3", "L4", "L5"] as const;
export const FORESIGHT_SENS = ["high", "mid", "low"] as const;
export const FORESIGHT_STAGES = [
  "current",
  "evolving",
  "exploring",
  "research",
] as const;

export class CreateForesightCardDto {
  @IsString()
  @MaxLength(40)
  cardKey!: string;

  @IsIn(FORESIGHT_LAYERS)
  layer!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  claim!: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  conf!: number;

  @IsIn(FORESIGHT_SENS)
  sens!: string;

  @IsInt()
  @Min(2024)
  @Max(2045)
  horizon!: number;

  @IsIn(FORESIGHT_STAGES)
  stage!: string;

  @IsOptional()
  @IsArray()
  evidence?: string[];

  @IsOptional()
  @IsArray()
  falsifiers?: string[];

  @IsOptional()
  @IsArray()
  sources?: Array<Record<string, unknown>>;

  @IsOptional()
  scenarios?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  originType?: string;
}

export class UpdateForesightCardDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  claim?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  conf?: number;

  @IsOptional()
  @IsIn(FORESIGHT_SENS)
  sens?: string;

  @IsOptional()
  @IsInt()
  @Min(2024)
  @Max(2045)
  horizon?: number;

  @IsOptional()
  @IsIn(FORESIGHT_STAGES)
  stage?: string;

  @IsOptional()
  @IsArray()
  evidence?: string[];

  @IsOptional()
  @IsArray()
  falsifiers?: string[];

  @IsOptional()
  @IsArray()
  sources?: Array<Record<string, unknown>>;

  @IsOptional()
  scenarios?: Array<Record<string, unknown>> | null;
}

export class CreateForesightEdgeDto {
  /** 上游卡片业务编号（如 A-L4-01） */
  @IsString()
  @MaxLength(40)
  fromKey!: string;

  @IsString()
  @MaxLength(40)
  toKey!: string;

  @IsString()
  @MaxLength(120)
  metric!: string;

  @IsOptional()
  @IsIn(["flow", "constrain"])
  type?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.05)
  @Max(1)
  weight?: number;
}

export class ResolveReviewDto {
  /** adjust 确认调整（修订置信度 + 入账本） | keep 维持原判 */
  @IsIn(["adjust", "keep"])
  decision!: "adjust" | "keep";
}
