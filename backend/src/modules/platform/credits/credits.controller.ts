import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
  Ip,
  HttpCode,
  HttpStatus,
  Param,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../../common/guards/admin.guard";
import { CreditTransactionType } from "@prisma/client";
import { CreditsService } from "./credits.service";
import { CheckinService } from "./rewards/checkin.service";
import { CreditRulesService } from "./policy/credit-rules.service";
import { TransactionQueryDto } from "./dto/transaction-query.dto";
import {
  AdminGrantCreditsDto,
  BatchGrantCreditsDto,
} from "./dto/grant-credits.dto";
import {
  FreezeAccountDto,
  UnfreezeAccountDto,
  UpdateCreditRuleDto,
} from "./dto/admin-credits.dto";

interface AuthenticatedRequest {
  user: { id: string; email: string };
}

/**
 * 积分控制器
 */
@ApiTags("Credits")
@Controller("credits")
@UseGuards(JwtAuthGuard)
export class CreditsController {
  constructor(
    private creditsService: CreditsService,
    private checkinService: CheckinService,
    private creditRulesService: CreditRulesService,
  ) {}

  /**
   * 获取积分账户信息
   */
  @Get()
  async getAccount(@Request() req: AuthenticatedRequest) {
    return this.creditsService.getOrCreateAccount(req.user.id);
  }

  /**
   * 获取积分余额（轻量级）
   */
  @Get("balance")
  async getBalance(@Request() req: AuthenticatedRequest) {
    return this.creditsService.getBalance(req.user.id);
  }

  /**
   * 获取积分统计
   */
  @Get("stats")
  async getStats(@Request() req: AuthenticatedRequest) {
    return this.creditsService.getCreditsStats(req.user.id);
  }

  /**
   * 获取交易记录
   */
  @Get("transactions")
  async getTransactions(
    @Request() req: AuthenticatedRequest,
    @Query() query: TransactionQueryDto,
  ) {
    return this.creditsService.getTransactions(req.user.id, query);
  }

  /**
   * 获取签到状态
   */
  @Get("checkin/status")
  async getCheckinStatus(@Request() req: AuthenticatedRequest) {
    return this.checkinService.getCheckinStatus(req.user.id);
  }

  /**
   * 执行签到
   */
  @Post("checkin")
  @HttpCode(HttpStatus.OK)
  async performCheckin(@Request() req: AuthenticatedRequest, @Ip() ip: string) {
    return this.checkinService.performCheckin(req.user.id, ip);
  }

  /**
   * 获取签到历史
   */
  @Get("checkin/history")
  async getCheckinHistory(
    @Request() req: AuthenticatedRequest,
    @Query("limit") limit?: number,
  ) {
    return this.checkinService.getCheckinHistory(req.user.id, limit || 30);
  }

  /**
   * 获取积分规则
   */
  @Get("rules")
  async getRules() {
    const rules = await this.creditRulesService.getAllRules();
    return rules.map((r) => ({
      moduleType: r.moduleType,
      operationType: r.operationType,
      baseCredits: r.baseCredits,
      name: r.name,
      isActive: r.isActive,
    }));
  }

  /**
   * 预估积分消耗
   */
  @Get("estimate")
  async estimateCredits(
    @Query("moduleType") moduleType: string,
    @Query("operationType") operationType: string,
    @Query("tokenCount") tokenCount?: number,
    @Query("modelName") modelName?: string,
  ) {
    const credits = await this.creditsService.estimateCredits(
      moduleType,
      operationType,
      tokenCount ? Number(tokenCount) : undefined,
      modelName,
    );
    return {
      estimatedCredits: credits,
      moduleType,
      operationType,
    };
  }
}

/**
 * 管理员积分控制器
 */
@ApiTags("Credits")
@Controller("admin/credits")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminCreditsController {
  constructor(
    private creditsService: CreditsService,
    private creditRulesService: CreditRulesService,
  ) {}

  /**
   * 管理员发放积分
   */
  @Post("grant")
  @HttpCode(HttpStatus.OK)
  async grantCredits(@Body() dto: AdminGrantCreditsDto) {
    return this.creditsService.grantCredits(
      dto.userId,
      dto.amount,
      dto.type!,
      dto.description,
    );
  }

  /**
   * 批量发放积分
   */
  @Post("grant/batch")
  @HttpCode(HttpStatus.OK)
  async batchGrantCredits(@Body() dto: BatchGrantCreditsDto) {
    const results = await Promise.all(
      dto.userIds.map((userId) =>
        this.creditsService
          .grantCredits(
            userId,
            dto.amount,
            CreditTransactionType.ADMIN_GRANT,
            dto.description,
          )
          .then((result) => ({
            ...result,
            userId,
            success: true,
          }))
          .catch((error) => ({
            userId,
            success: false,
            error: error.message,
          })),
      ),
    );

    const successCount = results.filter((r) => r.success).length;

    return {
      total: dto.userIds.length,
      successCount,
      failedCount: dto.userIds.length - successCount,
      results,
    };
  }

  /**
   * 冻结账户
   */
  @Post("freeze")
  @HttpCode(HttpStatus.OK)
  async freezeAccount(@Body() dto: FreezeAccountDto) {
    await this.creditsService.freezeAccount(dto.userId, dto.reason);
    return { message: "Account frozen successfully" };
  }

  /**
   * 解冻账户
   */
  @Post("unfreeze")
  @HttpCode(HttpStatus.OK)
  async unfreezeAccount(@Body() dto: UnfreezeAccountDto) {
    await this.creditsService.unfreezeAccount(dto.userId);
    return { message: "Account unfrozen successfully" };
  }

  /**
   * 获取用户账户详情
   */
  @Get("account/:userId")
  async getUserAccount(@Param("userId") userId: string) {
    const account = await this.creditsService.getAccount(userId);
    const stats = await this.creditsService.getCreditsStats(userId);
    return { account, stats };
  }

  /**
   * 更新积分规则
   */
  @Post("rules/update")
  @HttpCode(HttpStatus.OK)
  async updateRule(@Body() dto: UpdateCreditRuleDto) {
    const { moduleType, operationType, ...data } = dto;
    return this.creditRulesService.updateRule(moduleType, operationType, data);
  }

  /**
   * 刷新规则缓存
   */
  @Post("rules/refresh")
  @HttpCode(HttpStatus.OK)
  async refreshRulesCache() {
    await this.creditRulesService.refreshCache();
    return { message: "Rules cache refreshed" };
  }

  /**
   * 为所有现有用户初始化积分账户
   */
  @Post("init-all")
  @HttpCode(HttpStatus.OK)
  async initAllUserAccounts() {
    return this.creditsService.initializeAllUserAccounts();
  }
}
