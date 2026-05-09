import { IsArray, IsEnum, IsOptional, IsString, IsUUID } from "class-validator";

export class IngestWikiDto {
  @IsArray()
  @IsUUID("4", { each: true })
  documentIds!: string[];
}

export class PatchWikiDiffDto {
  @IsEnum(["apply", "dismiss"])
  action!: "apply" | "dismiss";

  /** For action=apply: optional subset of diff item ids to apply. Omit = apply all. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedItemIds?: string[];
}

export class PatchWikiLintFindingDto {
  @IsEnum(["resolve", "dismiss"])
  action!: "resolve" | "dismiss";
}
