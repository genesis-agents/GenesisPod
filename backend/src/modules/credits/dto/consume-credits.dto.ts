import { IsString, IsInt, IsOptional, Min } from "class-validator";

/**
 * 消耗积分 DTO
 */
export class ConsumeCreditsDto {
  @IsString()
  moduleType!: string; // ai-ask, ai-studio, ai-teams, ai-office

  @IsString()
  operationType!: string; // chat, research-quick, ai-reply

  @IsOptional()
  @IsInt()
  @Min(0)
  tokenCount?: number;

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
