import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { CreditsService } from "./credits.service";
import {
  CreditsController,
  AdminCreditsController,
} from "./credits.controller";
import { CreditRulesService } from "./policy/credit-rules.service";
import { CheckinService } from "./rewards/checkin.service";

/**
 * 积分模块
 * 管理用户积分账户、积分消耗、签到奖励等功能
 */
@Module({
  imports: [PrismaModule],
  controllers: [CreditsController, AdminCreditsController],
  providers: [CreditsService, CreditRulesService, CheckinService],
  exports: [CreditsService, CreditRulesService, CheckinService],
})
export class CreditsModule {}
