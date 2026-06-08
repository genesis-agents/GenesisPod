/**
 * Company OS — write-operation DTOs (W2 CRUD)
 *
 * All DTOs use class-validator decorators.
 */

import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

// ─── Hire ─────────────────────────────────────────────────────────────────────

export class HireAgentDto {
  @ApiProperty({ description: "Marketplace listing id of the agent to hire" })
  @IsString()
  listingId!: string;
}

// ─── HiredAgent update ────────────────────────────────────────────────────────

export class UpdateHiredAgentDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  models?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoFallback?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skillIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  toolIds?: string[];
}

// ─── CEO ──────────────────────────────────────────────────────────────────────

export class SetCeoDto {
  @ApiPropertyOptional({
    description: "Id of a hired agent to appoint as CEO, or null to unset",
    nullable: true,
  })
  @IsOptional()
  @IsString()
  hiredAgentId?: string | null;
}

// ─── Team ─────────────────────────────────────────────────────────────────────

export class CreateTeamDto {
  @ApiProperty()
  @IsString()
  name!: string;
}

export class UpdateTeamDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;
}

// ─── Team member ──────────────────────────────────────────────────────────────

export class AddTeamMemberDto {
  @ApiProperty({ description: "Id of the hired agent to add to the team" })
  @IsString()
  hiredAgentId!: string;
}

// ─── Team leader ──────────────────────────────────────────────────────────────

export class SetTeamLeaderDto {
  @ApiProperty({ description: "Id of the hired agent to set as team leader" })
  @IsString()
  hiredAgentId!: string;
}

// ─── Mission ──────────────────────────────────────────────────────────────────

export class CreateMissionDto {
  @ApiProperty({ description: "Mission title / prompt (2–200 chars)" })
  @IsString()
  title!: string;
}

// ─── Team workflow ────────────────────────────────────────────────────────────

export class SetTeamWorkflowDto {
  @ApiPropertyOptional({
    description: "Id of a workflow to assign to the team, or null to unset",
    nullable: true,
  })
  @IsOptional()
  @IsString()
  workflowId?: string | null;
}

// ─── Workflow ─────────────────────────────────────────────────────────────────

export class AcquireWorkflowDto {
  @ApiProperty({ description: "Marketplace listing id of the workflow" })
  @IsString()
  sourceListingId!: string;
}

export class UpdateWorkflowDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  stages?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  teamSize?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;
}
