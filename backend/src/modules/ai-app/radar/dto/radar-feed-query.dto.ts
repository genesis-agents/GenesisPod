import { Transform } from "class-transformer";
import {
  IsBooleanString,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import { RadarSourceTypeDto } from "./create-radar-source.dto";

export class RadarFeedQueryDto {
  @IsOptional()
  @IsEnum(RadarSourceTypeDto)
  type?: RadarSourceTypeDto;

  @IsOptional()
  @IsDateString()
  since?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  @Max(100)
  minRelevance?: number;

  @IsOptional()
  @IsBooleanString()
  acceptedOnly?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}
