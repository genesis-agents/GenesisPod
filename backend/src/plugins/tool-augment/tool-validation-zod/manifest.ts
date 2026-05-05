/**
 * tool-validation-zod plugin manifest（v5.1 R0.5-E W1-a）
 *
 * 监听 TOOL_BEFORE（input 校验）+ TOOL_AFTER（output 校验，validateOutput=strict 时）。
 * 触发：input 不符 schema → ctx.abort('validation-failed', { phase, errors })。
 *
 * 替代并删除旧 `engine/tools/middleware/validation.middleware.ts`（单轨）。
 *
 * Capability：read:tool-payload（读 call.input / call.inputSchema / result.data /
 * call.outputSchema）。不需要 write:* —— 校验失败短路 abort 即可。
 */
import type { IPluginManifest } from "@/plugins/core/abstractions";
import { CORE_HOOKS } from "@/plugins/core/abstractions";

export const TOOL_VALIDATION_ZOD_MANIFEST: IPluginManifest = {
  id: "tool-augment/tool-validation-zod",
  version: "1.0.0",
  coreVersionRange: "^1.0.0",
  description:
    "JSON-Schema input/output validation via zod (v5.1 R0.5-E W1-a); abort('validation-failed') on mismatch",
  category: "tool-augment",
  stability: "stable",
  replaces: "tool-validation",
  hooks: [CORE_HOOKS.TOOL_BEFORE, CORE_HOOKS.TOOL_AFTER],
  capabilities: [
    `hook:${CORE_HOOKS.TOOL_BEFORE}`,
    `hook:${CORE_HOOKS.TOOL_AFTER}`,
    "read:tool-payload",
  ],
  payloadVersions: {
    [CORE_HOOKS.TOOL_BEFORE]: [1],
    [CORE_HOOKS.TOOL_AFTER]: [1],
  },
  phase: "bootstrap",
  required: false,
  tags: ["production-recommended"],
  // 校验类不允许 ai-app 关闭（standards/19 §九 LOW-2，安全语义）
  overridable: false,
};
