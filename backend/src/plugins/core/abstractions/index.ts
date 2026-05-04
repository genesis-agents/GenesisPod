/**
 * plugins/core 抽象层桶（v5.1 R0.5 PR-0）
 *
 * 仅暴露稳定接口契约，不暴露实现细节。
 * 后续 PR-1/PR-2/PR-3 将依次补充：
 *   - PR-1: plugin.interface.ts (IPlugin / IPluginManifest / IPluginContext)
 *   - PR-1: plugin-capability.types.ts (PluginCapability)
 *   - PR-2: hook-bus.ts 接口（IHookContext / HookHandler）
 *   - PR-3: lifecycle 接口（PluginHealth / IPluginEventBus）
 */
export * from "./hooks";
export * from "./hook-payloads";
