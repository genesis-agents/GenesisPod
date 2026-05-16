import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  MinLength,
} from "class-validator";
import { RadarEntityType } from "./create-radar-topic.dto";

const CRON_REGEX = new RegExp(
  "^[\\d*/,-]+\\s+[\\d*/,-]+\\s+[\\d*/,-]+\\s+[\\d*/,-]+\\s+[\\d*/,-]+$",
);

export class UpdateRadarTopicDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(RadarEntityType)
  entityType?: RadarEntityType;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  keywords?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Matches(CRON_REGEX, {
    message: "refreshCron 必须是 5 段标准 cron 表达式",
  })
  refreshCron?: string;
}
