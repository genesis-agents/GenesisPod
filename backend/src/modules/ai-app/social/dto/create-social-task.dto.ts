import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SourceRefDto {
  @IsString()
  @IsNotEmpty()
  sourceType!: string;

  @IsString()
  @IsNotEmpty()
  sourceId!: string;
}

export class CreateSocialTaskDto {
  @ValidateNested({ each: true })
  @Type(() => SourceRefDto)
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(20)
  sources!: SourceRefDto[];

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  @ArrayMaxSize(3)
  externalUrls?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  prompt?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @IsIn(['WECHAT_MP', 'XIAOHONGSHU'], { each: true })
  platforms!: string[];

  @IsObject()
  accountIds!: Record<string, string>;

  @IsOptional()
  @IsIn(['quick', 'standard', 'deep'])
  depth?: 'quick' | 'standard' | 'deep';
}
