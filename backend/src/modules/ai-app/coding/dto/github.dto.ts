/**
 * GitHub DTOs - GitHub 集成相关 DTO
 */

import {
  IsString,
  IsOptional,
  IsBoolean,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateRepoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;
}

export class PushToRepoDto {
  @IsOptional()
  @IsString()
  branch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  commitMessage?: string;
}

export class CreateBranchDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  branchName!: string;

  @IsOptional()
  @IsString()
  baseBranch?: string;
}

export class CreatePRDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  body?: string;

  @IsString()
  headBranch!: string;

  @IsOptional()
  @IsString()
  baseBranch?: string;

  @IsOptional()
  @IsString()
  iterationId?: string;
}

export class GithubCallbackDto {
  @IsString()
  code!: string;

  @IsString()
  state!: string;
}
