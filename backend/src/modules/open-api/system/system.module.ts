import { Module } from "@nestjs/common";
import { NotificationController } from "./notifications/notification.controller";
import { NotificationModule } from "../../platform/notifications/notification.module";
import {
  CreditsController,
  AdminCreditsController,
} from "./credits/credits.controller";
import { CreditsModule } from "../../platform/credits/credits.module";
import { AuthController } from "./auth/auth.controller";
import { AuthModule } from "../../platform/auth/auth.module";
// MetricsController（/metrics Prometheus 端点）：MetricsService 由 @Global MonitoringModule
// 提供，无需 import；@SkipTransform 随 controller 保留，Prometheus 抓取行为不变。
import { MetricsController } from "./metrics/metrics.controller";

/**
 * Open-API System Module（系统服务面）
 *
 * standards/16 System-HTTP 规则：System 逻辑（auth/credits/notification 等
 * 一方用户横切能力）的 service 留 L1 platform，**HTTP 入口进 L4 open-api**。
 * engine/harness/platform 永不开 HTTP。
 *
 * 本模块是「系统服务面」——承载一方 jwt 用户的系统横切端点的 HTTP 层（区别于：
 * open-api/admin = 系统管理面；open-api/public-api = 对外公共面）。各 controller
 * 的 service 仍由对应 platform 模块提供（此处 import 取用，不重复注册）。
 *
 * 2026-06-03 进驻：NotificationController（notifications）、CreditsController
 * （credits）、AdminCreditsController（admin/credits）、AuthController（auth，含
 * OAuth 回调，AuthModule 导出 GoogleAuthGuard 供注入）、MetricsController
 * （metrics，Prometheus 抓取）。platform 层至此 0 controller。
 */
@Module({
  imports: [NotificationModule, CreditsModule, AuthModule], // exports 各自 service / guard（上提的 controller 注入）
  controllers: [
    NotificationController,
    CreditsController,
    AdminCreditsController,
    AuthController,
    MetricsController,
  ],
})
export class OpenApiSystemModule {}
