import {
  IsString,
  IsOptional,
  IsObject,
  MaxLength,
  MinLength,
} from "class-validator";

export class TechStackDto {
  @IsOptional()
  @IsString()
  frontend?: string;

  @IsOptional()
  @IsString()
  backend?: string;

  @IsOptional()
  @IsString()
  database?: string;

  @IsOptional()
  @IsString()
  language?: string;

  [key: string]: string | undefined;
}

export class CreateCodingProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsString()
  @MinLength(10)
  requirement!: string;

  @IsOptional()
  @IsObject()
  techStack?: TechStackDto;

  @IsOptional()
  @IsString()
  template?: string;
}
