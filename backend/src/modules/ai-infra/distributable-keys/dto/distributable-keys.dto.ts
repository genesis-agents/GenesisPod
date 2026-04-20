import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateDistributableKeyDto {
  @ApiProperty({ description: "Provider identifier", example: "openai" })
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  @MaxLength(50)
  @Transform(({ value }) =>
    typeof value === "string" ? value.toLowerCase() : value,
  )
  provider!: string;

  @ApiProperty({ description: "Human-readable label", example: "Pool 2026Q2" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label!: string;

  @ApiProperty({
    description: "Raw API key (will be encrypted before storage)",
  })
  @IsString()
  @MinLength(1)
  apiKey!: string;

  @ApiPropertyOptional({ description: "Custom API endpoint" })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  apiEndpoint?: string;

  @ApiPropertyOptional({
    description: "Monthly quota in cents (null = unlimited)",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  monthlyQuotaCents?: number;

  @ApiPropertyOptional({ description: "Expiration date ISO-8601" })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdateDistributableKeyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  apiKey?: string;

  @ApiPropertyOptional({ description: "Pass empty string to clear" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiEndpoint?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  monthlyQuotaCents?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AssignKeyDto {
  @ApiProperty({ description: "Target user ID" })
  @IsString()
  @MinLength(1)
  userId!: string;

  @ApiPropertyOptional({
    description: "User-level quota in cents (null = unlimited)",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  userQuotaCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdateAssignmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  userQuotaCents?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;

  @ApiPropertyOptional({
    enum: ["ACTIVE", "SUSPENDED"],
    description:
      "Only ACTIVE ↔ SUSPENDED transitions allowed here. To REVOKE use DELETE endpoint.",
  })
  @IsOptional()
  @IsString()
  @IsIn(["ACTIVE", "SUSPENDED"])
  status?: "ACTIVE" | "SUSPENDED";
}

export class RevokeAssignmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
