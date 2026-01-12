import {
  IsOptional,
  IsInt,
  IsString,
  IsEnum,
  IsBoolean,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";

export class ListReportsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}

export class ExportReportDto {
  @IsEnum(["pdf", "docx"])
  format!: "pdf" | "docx";

  @IsOptional()
  @IsBoolean()
  includeEvidence?: boolean;

  @IsOptional()
  @IsBoolean()
  includeMetadata?: boolean;
}

export class CompareReportsDto {
  @IsInt()
  @Min(1)
  from!: number;

  @IsInt()
  @Min(1)
  to!: number;
}
