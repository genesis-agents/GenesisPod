import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";

import { AiEngineModule } from "../../ai-engine/ai-engine.module";
import { MarketplaceController } from "./api/controller/marketplace.controller";
import { MarketplaceCatalogService } from "./services/marketplace-catalog.service";

/**
 * CompanyModule —— 一人公司 OS（详见 docs/features/one-person-company-os/design.md §10）。
 *
 * W1a：市场目录只读 API（投影现有 registry 成四货架）。
 *   - ToolRegistry / SkillRegistry 由 AiEngineModule 提供
 *   - TeamRegistry / BuiltinSkillCatalog 由 @Global HarnessModule 提供（无需 import）
 * 后续 W2 加持久化 CRUD、W3 加 Mission 执行。
 */
@Module({
  imports: [
    AiEngineModule,
    ConfigModule,
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
  controllers: [MarketplaceController],
  providers: [MarketplaceCatalogService],
  exports: [MarketplaceCatalogService],
})
export class CompanyModule {}
