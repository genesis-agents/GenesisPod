import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import type { EstimatedUsage } from "../key-requests.service";

export class CreateKeyRequestDto {
  @ApiProperty({
    description: "Provider identifier (lowercase, e.g. openai, anthropic)",
    example: "openai",
  })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: "Provider must be lowercase alphanumeric with optional dashes",
  })
  @MaxLength(50)
  provider!: string;

  @ApiPropertyOptional({ description: "Why the user needs this key" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason?: string;

  @ApiPropertyOptional({
    description: "Estimated monthly usage",
    enum: ["LIGHT", "MEDIUM", "HEAVY"],
  })
  @IsOptional()
  @IsIn(["LIGHT", "MEDIUM", "HEAVY"])
  estimatedUsage?: EstimatedUsage;

  @ApiPropertyOptional({ description: "Additional note" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
