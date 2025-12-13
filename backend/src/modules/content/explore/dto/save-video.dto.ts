import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsObject,
} from "class-validator";

export class SaveVideoDto {
  @IsString()
  @IsNotEmpty()
  videoId!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  url!: string;

  @IsArray()
  @IsOptional()
  transcript?: any[];

  @IsString()
  @IsOptional()
  translatedText?: string;

  @IsObject()
  @IsOptional()
  aiReport?: any;
}
