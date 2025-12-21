import {
  IsString,
  IsOptional,
  IsObject,
  MaxLength,
  MinLength,
} from "class-validator";
import { TechStackDto } from "./create-project.dto";

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  requirement?: string;

  @IsOptional()
  @IsObject()
  techStack?: TechStackDto;

  @IsOptional()
  @IsString()
  template?: string;
}
