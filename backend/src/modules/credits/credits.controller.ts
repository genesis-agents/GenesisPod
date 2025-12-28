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
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../common/guards/admin.guard";
import { CreditsService } from "./credits.service";
import { CheckinService } from "./services/checkin.service";
import { CreditRulesService } from "./services/credit-rules.service";
import { TransactionQueryDto } from "./dto/transaction-query.dto";
import {
  AdminGrantCreditsDto,
  BatchGrantCreditsDto,
} from "./dto/grant-credits.dto";

/**
 * 积分控制器
 */
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
  async getAccount(@Request() req: any) {
    const account = await this.creditsService.getOrCreateAccount(req.user.sub);
    return {
      success: true,
      data: account,
    };
  }

  /**
   * 获取积分余额（轻量级）
   */
  @Get("balance")
  async getBalance(@Request() req: any) {
    const balance = await this.creditsService.getBalance(req.user.sub);
    return {
      success: true,
      data: balance,
    };
  }

  /**
   * 获取积分统计
   */
  @Get("stats")
  async getStats(@Request() req: any) {
    const stats = await this.creditsService.getCreditsStats(req.user.sub);
    return {
      success: true,
      data: stats,
    };
  }

  /**
   * 获取交易记录
   */
  @Get("transactions")
  async getTransactions(
    @Request() req: any,
    @Query() query: TransactionQueryDto,
  ) {
    const transactions = await this.creditsService.getTransactions(
      req.user.sub,
      query,
    );
    return {
      success: true,
      ...transactions,
    };
  }

  /**
   * 获取签到状态
   */
  @Get("checkin/status")
  async getCheckinStatus(@Request() req: any) {
    const status = await this.checkinService.getCheckinStatus(req.user.sub);
    return {
      success: true,
      data: status,
    };
  }

  /**
   * 执行签到
   */
  @Post("checkin")
  @HttpCode(HttpStatus.OK)
  async performCheckin(@Request() req: any, @Ip() ip: string) {
    const result = await this.checkinService.performCheckin(req.user.sub, ip);
    return {
      success: result.success,
      data: result,
    };
  }

  /**
   * 获取签到历史
   */
  @Get("checkin/history")
  async getCheckinHistory(@Request() req: any, @Query("limit") limit?: number) {
    const history = await this.checkinService.getCheckinHistory(
      req.user.sub,
      limit || 30,
    );
    return {
      success: true,
      data: history,
    };
  }

  /**
   * 获取积分规则
   */
  @Get("rules")
  async getRules() {
    const rules = await this.creditRulesService.getAllRules();
    return {
      success: true,
      data: rules.map((r) => ({
        moduleType: r.moduleType,
        operationType: r.operationType,
        baseCredits: r.baseCredits,
        name: r.name,
        isActive: r.isActive,
      })),
    };
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
      success: true,
      data: {
        estimatedCredits: credits,
        moduleType,
        operationType,
      },
    };
  }
}

/**
 * 管理员积分控制器
 */
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
    const result = await this.creditsService.grantCredits(
      dto.userId,
      dto.amount,
      dto.type!,
      dto.description,
    );
    return {
      success: true,
      data: result,
    };
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
            "ADMIN_GRANT" as any,
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
      success: true,
      data: {
        total: dto.userIds.length,
        successCount,
        failedCount: dto.userIds.length - successCount,
        results,
      },
    };
  }

  /**
   * 冻结账户
   */
  @Post("freeze")
  @HttpCode(HttpStatus.OK)
  async freezeAccount(@Body() body: { userId: string; reason: string }) {
    await this.creditsService.freezeAccount(body.userId, body.reason);
    return {
      success: true,
      message: "Account frozen successfully",
    };
  }

  /**
   * 解冻账户
   */
  @Post("unfreeze")
  @HttpCode(HttpStatus.OK)
  async unfreezeAccount(@Body() body: { userId: string }) {
    await this.creditsService.unfreezeAccount(body.userId);
    return {
      success: true,
      message: "Account unfrozen successfully",
    };
  }

  /**
   * 获取用户账户详情
   */
  @Get("account/:userId")
  async getUserAccount(@Param("userId") userId: string) {
    const account = await this.creditsService.getAccount(userId);
    const stats = await this.creditsService.getCreditsStats(userId);

    return {
      success: true,
      data: {
        account,
        stats,
      },
    };
  }

  /**
   * 更新积分规则
   */
  @Post("rules/update")
  @HttpCode(HttpStatus.OK)
  async updateRule(
    @Body()
    body: {
      moduleType: string;
      operationType: string;
      baseCredits?: number;
      tokenMultiplier?: number;
      isActive?: boolean;
    },
  ) {
    const { moduleType, operationType, ...data } = body;
    const rule = await this.creditRulesService.updateRule(
      moduleType,
      operationType,
      data,
    );
    return {
      success: true,
      data: rule,
    };
  }

  /**
   * 刷新规则缓存
   */
  @Post("rules/refresh")
  @HttpCode(HttpStatus.OK)
  async refreshRulesCache() {
    await this.creditRulesService.refreshCache();
    return {
      success: true,
      message: "Rules cache refreshed",
    };
  }
}
