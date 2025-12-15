import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  MaxLength,
} from "class-validator";

export enum FeedbackTypeDto {
  BUG = "bug",
  FEATURE = "feature",
  IMPROVEMENT = "improvement",
  OTHER = "other",
}

export class CreateFeedbackDto {
  @IsEnum(FeedbackTypeDto)
  type!: FeedbackTypeDto;

  @IsString()
  @MaxLength(500)
  title!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsEmail()
  userEmail?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  @IsString()
  url?: string;
}
