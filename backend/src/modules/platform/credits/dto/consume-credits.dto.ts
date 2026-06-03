import { IsString, IsInt, IsOptional, Min } from "class-validator";

/**
 * 消耗积分 DTO
 */
export class ConsumeCreditsDto {
  @IsString()
  moduleType!: string; // ai-ask, deep-research, ai-teams, ai-office, notes, collections

  @IsString()
  operationType!: string; // chat, research-quick, ai-reply

  @IsOptional()
  @IsInt()
  @Min(0)
  tokenCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  inputTokens?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  outputTokens?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cacheCreationTokens?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cacheReadTokens?: number;

  @IsOptional()
  @IsString()
  modelName?: string;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

/**
 * 内部消耗积分参数
 */
export interface ConsumeCreditsParams {
  userId: string;
  moduleType: string;
  operationType: string;
  tokenCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  modelName?: string;
  referenceId?: string;
  description?: string;
  idempotencyKey?: string;
}

/**
 * 消耗结果
 */
export interface ConsumeCreditsResult {
  consumed: number;
  balanceAfter: number;
  transactionId: string;
}
