import { Module } from "@nestjs/common";
import { NotificationController } from "./notifications/notification.controller";
import { NotificationModule } from "../../platform/notifications/notification.module";

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
 * 2026-06-03 首个进驻：NotificationController（notifications，jwt 一方用户）。
 */
@Module({
  imports: [NotificationModule], // exports NotificationService（NotificationController 注入）
  controllers: [NotificationController],
})
export class OpenApiSystemModule {}
