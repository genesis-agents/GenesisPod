import { IsIn, IsOptional, IsString } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

/** Source kind selector for the backfill batch. */
export type BackfillSourceKind =
  | "topic-report"
  | "team-mission"
  | "kb-document"
  | "playground-mission";

export class BackfillOntologyDto {
  /**
   * Scope to a single topic (applies to topic-report + team-mission sources).
   * When omitted the batch covers all records of the requested sourceKind.
   */
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: "议题 ID（可选，限定回填范围）" })
  topicId?: string;

  /**
   * Scope to a single report / mission / document by ID.
   * When provided the batch contains exactly this one record.
   */
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: "单条来源 ID（可选，精确单条回填）" })
  sourceId?: string;

  /**
   * Which content source to scan.
   * When omitted all three source kinds are run in sequence.
   */
  @IsOptional()
  @IsIn(["topic-report", "team-mission", "kb-document", "playground-mission"])
  @ApiPropertyOptional({
    description: "来源类型（可选，不填则扫全部）",
    enum: ["topic-report", "team-mission", "kb-document", "playground-mission"],
  })
  sourceKind?: BackfillSourceKind;
}
