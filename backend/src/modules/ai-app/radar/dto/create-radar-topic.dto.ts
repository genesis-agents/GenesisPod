import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Matches,
} from "class-validator";

export enum RadarEntityType {
  PERSON = "person",
  COMPANY = "company",
  PRODUCT = "product",
  EVENT = "event",
  TOPIC = "topic",
}

// cron 表达式简单白名单（5 段，允许数字 / 星号 / 斜杠步进 / 范围 / 列表）。
// 不接受秒级（6 段），避免高频刷新。
const CRON_REGEX = new RegExp(
  "^[\\d*/,-]+\\s+[\\d*/,-]+\\s+[\\d*/,-]+\\s+[\\d*/,-]+\\s+[\\d*/,-]+$",
);

export class CreateRadarTopicDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(RadarEntityType)
  entityType?: RadarEntityType;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  keywords!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Matches(CRON_REGEX, {
    message: "refreshCron 必须是 5 段标准 cron 表达式",
  })
  refreshCron?: string;
}
