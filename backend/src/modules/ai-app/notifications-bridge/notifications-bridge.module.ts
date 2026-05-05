import { Module, OnModuleInit } from "@nestjs/common";
import { NotificationBroadcastAdapter } from "./notification-broadcast-adapter";
import { NotificationModule } from "@/modules/ai-infra/notifications/notification.module";
import { HarnessModule } from "@/modules/ai-harness/harness.module";
import { DomainEventBus } from "@/modules/ai-harness/facade";
import { PrismaModule } from "@/common/prisma/prisma.module";

/**
 * NotificationsBridgeModule
 *
 * 把"业务任务完成"DomainEvent 桥接到持久化通知。
 * 业务模块（playground/research/...）只 emit DomainEvent，
 * 这里在 onModuleInit 时给 DomainEventBus 注册一个 adapter，把符合条件的事件
 * 转写到 NotificationService（落 DB / 触发 NotificationGateway 实时推送）。
 *
 * 解耦：
 *   - 不被业务模块 import；与业务侧无任何编译时耦合
 *   - 即使本模块未启用，业务事件流照常工作
 *
 * 在 ai-app 层（非 ai-infra）原因：
 *   ai-infra (L1) 不能依赖 ai-harness (L2.5)；本模块需要 DomainEventBus，
 *   故落在 ai-app (L3)。
 */
@Module({
  imports: [PrismaModule, NotificationModule, HarnessModule],
  providers: [NotificationBroadcastAdapter],
  exports: [],
})
export class NotificationsBridgeModule implements OnModuleInit {
  constructor(
    private readonly eventBus: DomainEventBus,
    private readonly adapter: NotificationBroadcastAdapter,
  ) {}

  onModuleInit(): void {
    this.eventBus.registerAdapter(this.adapter);
  }
}
