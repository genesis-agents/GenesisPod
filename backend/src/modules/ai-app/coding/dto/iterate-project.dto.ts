import { IsString, MinLength } from "class-validator";

export class IterateProjectDto {
  @IsString()
  @MinLength(5)
  feedback!: string;
}
