import { Module, type OnModuleInit } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";

import { AiEngineModule } from "../../ai-engine/ai-engine.module";
import { PrismaModule } from "@/common/prisma/prisma.module";
import { EventRegistry } from "@/modules/ai-harness/facade";
import { MarketplaceController } from "./api/controller/marketplace.controller";
import { CompanyController } from "./api/controller/company.controller";
import { CompanyMissionGateway } from "./api/controller/company-mission.gateway";
import { MarketplaceCatalogService } from "./services/marketplace-catalog.service";
import { CompanyRepository } from "./services/company.repository";
import { CompanyService } from "./services/company.service";
import { CompanyMissionService } from "./services/company-mission.service";
import { COMPANY_MISSION_EVENTS } from "./events/company.events";

/**
 * CompanyModule —— 一人公司 OS（详见 docs/features/one-person-company-os/design.md §10）。
 *
 * W1a：市场目录只读 API（投影现有 registry 成四货架）。
 *   - ToolRegistry / SkillRegistry 由 AiEngineModule 提供
 *   - TeamRegistry / BuiltinSkillCatalog 由 @Global HarnessModule 提供（无需 import）
 * W2：持久化 CRUD（CompanyProfile / HiredAgent / Team / Workflow）。
 */
@Module({
  imports: [
    AiEngineModule,
    ConfigModule,
    PrismaModule,
    // JwtService for JwtAuthGuard（WS / 后续 gateway 复用）
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: { expiresIn: "7d" },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [MarketplaceController, CompanyController],
  providers: [
    MarketplaceCatalogService,
    CompanyRepository,
    CompanyService,
    CompanyMissionService,
    CompanyMissionGateway,
  ],
  exports: [MarketplaceCatalogService],
})
export class CompanyModule implements OnModuleInit {
  constructor(private readonly eventRegistry: EventRegistry) {}

  onModuleInit(): void {
    // 注册 company.* mission 事件类型，否则 EventBus.emit 会 drop+warn、WS 收不到
    this.eventRegistry.registerAll(COMPANY_MISSION_EVENTS);
  }
}
