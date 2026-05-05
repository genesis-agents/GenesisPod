/**
 * tool-timeout plugin manifest（v5.1 R0.5-E W1-a）
 *
 * 监听 TOOL_WRAP（v5.1 P0-1 引入），在 wrap 终结调用上 race 超时。
 * 触发：执行超时 → ctx.abort('timeout', { toolId, timeoutMs })。
 *
 * 替代并删除旧 `engine/tools/middleware/timeout.middleware.ts`（单轨）。
 *
 * Capability：read:tool-payload（读 call.toolId / contextMeta 决定超时）。
 */
import type { IPluginManifest } from "@/plugins/core/abstractions";
import { CORE_HOOKS } from "@/plugins/core/abstractions";

export const TOOL_TIMEOUT_MANIFEST: IPluginManifest = {
  id: "tool-augment/tool-timeout",
  version: "1.0.0",
  coreVersionRange: "^1.0.0",
  description:
    "Tool execution timeout via TOOL_WRAP race; abort('timeout') on deadline (v5.1 R0.5-E W1-a)",
  category: "tool-augment",
  stability: "stable",
  replaces: "tool-timeout",
  hooks: [CORE_HOOKS.TOOL_WRAP],
  capabilities: [`hook:${CORE_HOOKS.TOOL_WRAP}`, "read:tool-payload"],
  payloadVersions: {
    [CORE_HOOKS.TOOL_WRAP]: [1],
  },
  phase: "bootstrap",
  required: false,
  tags: ["production-recommended"],
  // tool resilience，业务无关；ai-app override 时只能改 timeoutMs，不能禁用
  overridable: false,
};
