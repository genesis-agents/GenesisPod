/**
 * Plugin Core NestJS module（v5.1 R0.5 PR-11）
 *
 * 把 plugins/core 的 plain class（HookBus / Supervisor / Registry / Loader /
 * Bridge）注册成 NestJS provider，让生产应用通过 DI 获取。
 *
 * 设计要点：
 * - @Global() 注册：所有 module 不需 import 即可注入 HookBus / LifecycleHookBridge
 * - 双轨期：本 module 单独存在不会激活 plugin 系统；生产 ai-engine/ai-harness 现有
 *   ToolPipeline/AiChatService 仍走 hookBus=undefined 路径（行为零变化）
 * - plugin 实例化：本 module 不直接 import 任何 plugin（standards/19 §四）；
 *   ai-app 通过 forFeature 形式注册（PR-12 增加）或在 onApplicationBootstrap 时
 *   由 PluginLoader 扫描 src/plugins/ 加载（R0.5-E 实现）
 */
import { Global, Module } from "@nestjs/common";
import { HookBus } from "./hook-bus";
import {
  PluginRegistry,
  PluginResolver,
  type IPluginResolver,
} from "./registry";
import { PluginSupervisor, type ISupervisedPlugin } from "./lifecycle";
import { ManifestValidator, PluginConfigService, PluginLoader } from "./loader";
import { LifecycleHookBridge } from "./bridge";

export const PLUGIN_CORE_VERSION = "1.0.0";

/**
 * 生产期 PluginConfigService 默认空配置（无 plugin 启用）
 * 实际 yaml 加载留给 R0.5-E 实现
 */
const defaultConfigService = new PluginConfigService(null);

@Global()
@Module({
  providers: [
    PluginSupervisor,
    PluginRegistry,
    {
      provide: HookBus,
      useFactory: (supervisor: PluginSupervisor) => new HookBus(supervisor),
      inject: [PluginSupervisor],
    },
    {
      provide: ManifestValidator,
      useFactory: () => new ManifestValidator(),
    },
    {
      provide: PluginConfigService,
      useValue: defaultConfigService,
    },
    {
      provide: "IPluginResolver",
      useFactory: () => new PluginResolver(),
    },
    {
      provide: PluginLoader,
      useFactory: (
        registry: PluginRegistry,
        resolver: IPluginResolver,
        validator: ManifestValidator,
        configService: PluginConfigService,
        supervisor: PluginSupervisor,
        hookBus: HookBus,
      ) =>
        new PluginLoader({
          registry,
          resolver,
          validator,
          configService,
          supervisor,
          coreVersion: PLUGIN_CORE_VERSION,
          contextFactory: (pluginId) => {
            // PR-11 最小 contextFactory：构造一个能让 plugin init 跑通的 ctx
            // 真实 ServiceProxyRegistry / Capability gate 由 R0.5-E 完整实现
            return {
              manifest: registry.get(pluginId)!.manifest,
              logger: {
                log: () => {},
                warn: () => {},
                error: () => {},
                debug: () => {},
              },
              config: configService.buildView(pluginId),
              hooks: {
                register: (hookId, handler, options) => {
                  hookBus.register(hookId, handler, {
                    pluginId,
                    required: configService.isRequired(
                      pluginId,
                      registry.get(pluginId)!.manifest.required,
                    ),
                    capabilities: registry.get(pluginId)!.manifest.capabilities,
                    priority: options?.priority,
                  });
                },
              },
              metrics: {
                counter: () => {},
                gauge: () => {},
                histogram: () => {},
              },
              events: {
                publish: () => {},
                subscribe: () => () => {},
              },
              getService: () => {
                throw new Error(
                  `getService not yet wired — ServiceProxyRegistry pending in R0.5-E`,
                );
              },
            };
          },
        }),
      inject: [
        PluginRegistry,
        "IPluginResolver",
        ManifestValidator,
        PluginConfigService,
        PluginSupervisor,
        HookBus,
      ],
    },
    {
      provide: LifecycleHookBridge,
      useFactory: (hookBus: HookBus) => {
        const bridge = new LifecycleHookBridge();
        bridge.setHookBus(hookBus);
        return bridge;
      },
      inject: [HookBus],
    },
  ],
  exports: [
    HookBus,
    PluginRegistry,
    PluginSupervisor,
    PluginLoader,
    PluginConfigService,
    ManifestValidator,
    LifecycleHookBridge,
  ],
})
export class PluginCoreModule {}

/** 类型 re-export，避免 ai-app 直接 import plugin-core 内部 */
export type { ISupervisedPlugin };
