/**
 * rate-limit plugin manifest（v5.1 R0.5 PR-9）
 *
 * 监听 LLM_REQUEST + TOOL_BEFORE，按 tenantId / agentType 限流。
 * 超限 → ctx.abort('rate-limited')；ToolPipeline / AiChatService 在 abort 路径
 * 仍 fire 配套 _AFTER hook（HIGH-3 abort 生命周期）让 audit/billing 记录。
 *
 * v5.1 P0-3 / standards/19 §四 规则 4：
 *   严禁按 ai-app 名限流（appName 入 hook payload 破坏 §0）
 *   只按业务无关标签：tenantId / agentType（来自 manifest.tags 或 SKILL.md frontmatter）
 *
 * Capability:
 *   service:redis（分布式限流；多 pod 共享窗口）
 *   read:llm-payload:meta（读 missionId / agentId / agentType）
 *   read:tool-payload（读 missionId / contextMeta）
 */
import type { IPluginManifest } from "@/plugins/core/abstractions";
import { CORE_HOOKS } from "@/plugins/core/abstractions";

export const RATE_LIMIT_MANIFEST: IPluginManifest = {
  id: "resilience/rate-limit",
  version: "1.0.0",
  coreVersionRange: "^1.0.0",
  description:
    "Rate-limit by tenantId / agentType (v5.1 R0.5 PR-9). " +
    "abort('rate-limited') on quota exceeded.",
  category: "resilience",
  stability: "stable",
  replaces: "rate-limit",
  hooks: [CORE_HOOKS.LLM_REQUEST, CORE_HOOKS.TOOL_BEFORE],
  capabilities: [
    `hook:${CORE_HOOKS.LLM_REQUEST}`,
    `hook:${CORE_HOOKS.TOOL_BEFORE}`,
    "read:llm-payload:meta",
    "read:tool-payload",
    "service:redis",
  ],
  payloadVersions: {
    [CORE_HOOKS.LLM_REQUEST]: [1],
    [CORE_HOOKS.TOOL_BEFORE]: [1],
  },
  phase: "bootstrap",
  required: false,
  tags: ["production-recommended"],
  // security 类不允许 ai-app override（standards/19 §九 LOW-2）
  overridable: false,
};
