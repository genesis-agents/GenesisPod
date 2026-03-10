import {
  IsString,
  IsInt,
  IsOptional,
  Min,
  Max,
  IsEnum,
  MaxLength,
} from "class-validator";
import { CreditTransactionType } from "@prisma/client";

/**
 * 管理员发放积分 DTO
 */
export class AdminGrantCreditsDto {
  @IsString()
  userId!: string;

  @IsInt()
  @Min(1)
  @Max(2_000_000_000, {
    message: "Single grant amount cannot exceed 2,000,000,000 (INT4 limit)",
  })
  amount!: number;

  @IsOptional()
  @IsEnum(CreditTransactionType)
  type?: CreditTransactionType = CreditTransactionType.ADMIN_GRANT;

  @IsString()
  @MaxLength(500)
  description!: string;
}

/**
 * 批量发放积分 DTO
 */
export class BatchGrantCreditsDto {
  @IsString({ each: true })
  userIds!: string[];

  @IsInt()
  @Min(1)
  @Max(2_000_000_000, {
    message: "Single grant amount cannot exceed 2,000,000,000 (INT4 limit)",
  })
  amount!: number;

  @IsString()
  @MaxLength(500)
  description!: string;
}

/**
 * 发放结果
 */
export interface GrantCreditsResult {
  success: boolean;
  userId: string;
  amount: number;
  balanceAfter: number;
  transactionId: string;
}
