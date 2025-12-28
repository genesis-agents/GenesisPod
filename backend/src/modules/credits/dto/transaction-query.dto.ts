import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  Min,
  Max,
  IsDateString,
} from "class-validator";
import { Type } from "class-transformer";
import { CreditTransactionType } from "@prisma/client";

/**
 * 交易记录查询 DTO
 */
export class TransactionQueryDto {
  @IsOptional()
  @IsEnum(CreditTransactionType)
  type?: CreditTransactionType;

  @IsOptional()
  @IsString()
  moduleType?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

/**
 * 交易记录响应
 */
export interface TransactionResponse {
  id: string;
  type: CreditTransactionType;
  amount: number;
  balanceAfter: number;
  description: string;
  moduleType?: string;
  operationType?: string;
  tokenCount?: number;
  modelName?: string;
  createdAt: Date;
}

/**
 * 分页交易记录响应
 */
export interface PaginatedTransactionsResponse {
  data: TransactionResponse[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
