import { IsString, IsOptional, IsEnum, MaxLength } from "class-validator";
import { PlanningDepth } from "./create-plan.dto";

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  goal?: string;

  @IsOptional()
  @IsEnum(PlanningDepth)
  depth?: PlanningDepth;
}
