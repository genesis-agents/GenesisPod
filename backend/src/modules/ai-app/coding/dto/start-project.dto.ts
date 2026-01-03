import { IsOptional, IsObject } from "class-validator";

export class StartProjectDto {
  @IsOptional()
  @IsObject()
  options?: {
    skipPm?: boolean;
    skipArchitect?: boolean;
    skipQa?: boolean;
    modelOverride?: string;
  };
}
