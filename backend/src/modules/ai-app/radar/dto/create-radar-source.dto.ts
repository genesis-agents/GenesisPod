import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export enum RadarSourceTypeDto {
  X = "X",
  YOUTUBE = "YOUTUBE",
  RSS = "RSS",
  CUSTOM = "CUSTOM",
}

/**
 * 数据源 config（类型特定，自由 JSON，service 内做类型分发校验）：
 *
 * - X       : `{ mode?: 'user' | 'search' }`（默认 user：拉指定 handle timeline；search 走关键词搜索）
 * - YOUTUBE : `{ fetchTranscript?: boolean, region?: string }`
 * - RSS     : 无额外配置（identifier 即 URL）
 * - CUSTOM  : `{ listSelector: string, titleSelector?: string, linkSelector?: string, dateSelector?: string }`
 */
export class CreateRadarSourceDto {
  @IsEnum(RadarSourceTypeDto)
  type!: RadarSourceTypeDto;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  identifier!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
