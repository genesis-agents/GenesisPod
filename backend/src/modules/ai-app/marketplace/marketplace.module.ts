/**
 * MarketplaceModule —— 平台共享市场模块（design.md §4.3「市场=平台共享」）。
 *
 * 中立、非某个 app：持有市场的平台级基础设施，供任意 app 消费。
 *   - CapabilityRegistry：按 manifest.id 解析"可执行能力"端口（采用引用→执行的解析器）。
 *   - （后续 P3）市场目录/API 也将从 company 迁入这里。
 *
 * @Global：与 contracts/harness registry 同样，能力家在各自 onModuleInit 注册，
 * 消费方（company 等）无需 import 本模块即可注入 CapabilityRegistry。
 */
import { Global, Module } from "@nestjs/common";
import { CapabilityRegistry } from "./capability/capability-registry";
import { DeepInsightDefaultRunner } from "./capabilities/deep-insight/deep-insight.runner";

@Global()
@Module({
  providers: [
    CapabilityRegistry,
    // 上架能力的默认执行实现（onModuleInit 自注册进 CapabilityRegistry）。
    // 依赖 AgentRunner / ChatFacade 由 @Global HarnessApiModule 提供。
    DeepInsightDefaultRunner,
  ],
  exports: [CapabilityRegistry],
})
export class MarketplaceModule {}
