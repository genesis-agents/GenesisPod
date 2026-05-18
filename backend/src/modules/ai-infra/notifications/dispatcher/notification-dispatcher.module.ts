import { Module, forwardRef } from "@nestjs/common";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
import { NotificationModule } from "../notification.module";
import { NotificationDispatcher } from "./notification-dispatcher.service";
import { SiteChannel } from "./channels/site-channel.adapter";
import { ChannelResolver } from "./preferences/channel-resolver";
import { NotificationPreferenceService } from "./preferences/notification-preference.service";
import { RadarMissionCompletePreset } from "./presets/radar-mission-complete.preset";

/**
 * NotificationDispatcherModule（PR-DR1a）
 *
 * 来源：daily-briefing-redesign-2026-05-18.md §8.6
 *
 * 依赖：
 * - PrismaModule —— NotificationPreferenceService 读 NotificationPreference 表
 * - NotificationModule —— SiteChannel 注入 NotificationService（既有，复用）
 *
 * 暴露：
 * - NotificationDispatcher —— 唯一对外入口（caller 通过 dispatch() 触发）
 * - NotificationPreferenceService —— 偏好 service（caller 自检 quietHours 等场景）
 *
 * 后续 PR 扩展（不需要改本文件）：
 * - PR-DR1b: EmailChannel 在 EmailModule 内 providers + provide: 'EMAIL_CHANNEL'
 * - PR-DR3:  WechatChannel 在 SocialModule 内 providers + provide: 'WECHAT_CHANNEL'
 *   只要被 NestJS 容器扫描到且 token 匹配，dispatcher constructor @Optional() 自动注入
 */
@Module({
  imports: [PrismaModule, forwardRef(() => NotificationModule)],
  providers: [
    NotificationDispatcher,
    SiteChannel,
    ChannelResolver,
    NotificationPreferenceService,
    RadarMissionCompletePreset,
  ],
  exports: [
    NotificationDispatcher,
    NotificationPreferenceService,
    RadarMissionCompletePreset,
  ],
})
export class NotificationDispatcherModule {}
