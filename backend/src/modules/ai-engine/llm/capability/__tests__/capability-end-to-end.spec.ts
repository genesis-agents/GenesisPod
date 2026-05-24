/**
 * v3.1 §B 端到端 spec — capability_overrides 写入 → 读取 → resolveCapabilities 字段流入
 *
 * 验证完整链路（writer service → mock prisma → 读 capability_overrides →
 * 构造 AIModelConfig → ModelCapabilityService.resolveCapabilities）：
 *
 *   1. writer 写入 patch `{ structuredOutput: { nativeMode: 'none' } }`
 *   2. 模拟读出 AIModel.capability_overrides
 *   3. 构造 AIModelConfig.aiModelOverrides = 读到的 overrides
 *   4. ModelCapabilityService.resolveCapabilities(config).structuredOutput.nativeMode === 'none'
 *
 * 这是 architect 建议 #3 的合并补全：B.1 只验证读取面，B.2 验证写入面，B 端到端验证
 * "写完真的能被读到且最终影响 nativeMode 派生"。
 */

import { CapabilityOverridesWriterService } from "../capability-overrides-writer.service";
import { ModelCapabilityService } from "../model-capability.service";
import type { ApplyOverrideOptions } from "../capability-overrides-writer.types";
import type { AIModelConfig } from "../../types/model-config.types";

interface MockState {
  aiModel: { id: string; capabilityOverrides: unknown } | null;
  userModelConfig: {
    id: string;
    userId: string;
    capabilityOverrides: unknown;
  } | null;
  auditLogs: Array<Record<string, unknown>>;
}

function buildMockPrisma(state: MockState) {
  const tx = {
    aIModel: {
      findUnique: jest.fn(
        async ({ where: { id } }: { where: { id: string } }) =>
          state.aiModel && state.aiModel.id === id ? state.aiModel : null,
      ),
      update: jest.fn(
        async ({
          where: { id },
          data,
        }: {
          where: { id: string };
          data: { capabilityOverrides: unknown };
        }) => {
          if (state.aiModel && state.aiModel.id === id) {
            state.aiModel.capabilityOverrides = data.capabilityOverrides;
          }
          return state.aiModel;
        },
      ),
    },
    userModelConfig: {
      findUnique: jest.fn(
        async ({ where: { id } }: { where: { id: string } }) =>
          state.userModelConfig && state.userModelConfig.id === id
            ? state.userModelConfig
            : null,
      ),
      update: jest.fn(
        async ({
          where: { id },
          data,
        }: {
          where: { id: string };
          data: { capabilityOverrides: unknown };
        }) => {
          if (state.userModelConfig && state.userModelConfig.id === id) {
            state.userModelConfig.capabilityOverrides =
              data.capabilityOverrides;
          }
          return state.userModelConfig;
        },
      ),
    },
    capabilityOverrideAuditLog: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.auditLogs.push(data);
        return { id: `a-${state.auditLogs.length}`, ...data };
      }),
    },
  };
  return {
    tx,
    prisma: {
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    },
  };
}

function buildAIModelConfig(
  partial: Partial<AIModelConfig> = {},
): AIModelConfig {
  // 完整有效的 AIModelConfig 用于 ModelCapabilityService 解析
  return {
    id: "model-1",
    name: "deepseek-v4-pro",
    displayName: "DeepSeek V4 Pro",
    provider: "deepseek",
    modelId: "deepseek-v4-pro",
    apiEndpoint: "https://api.deepseek.com/v1",
    apiKey: "sk-test",
    maxTokens: 8192,
    temperature: 0.7,
    isEnabled: true,
    isDefault: false,
    ...partial,
  };
}

describe("v3.1 §B end-to-end — write override → read → resolveCapabilities", () => {
  let state: MockState;
  let writer: CapabilityOverridesWriterService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let capabilityService: ModelCapabilityService;

  beforeEach(() => {
    state = {
      aiModel: { id: "model-1", capabilityOverrides: null },
      userModelConfig: {
        id: "config-1",
        userId: "user-1",
        capabilityOverrides: null,
      },
      auditLogs: [],
    };
    mockPrisma = buildMockPrisma(state);
    writer = new CapabilityOverridesWriterService(mockPrisma.prisma as never);
    capabilityService = new ModelCapabilityService();
  });

  it("admin writes nativeMode='tool_use' → resolveCapabilities reflects 'tool_use' (overrides catalog 'json_mode')", async () => {
    // STEP 1: admin 写入 override（用 'tool_use'，与 deepseek catalog 默认 'json_mode' 不同）
    //
    // v3.1 §B 子片 2 review-fix (2026-05-24)：'none' 占位语义已移除，
    // 显式 nativeMode='none' override 现在会真覆盖 catalog（见下面 self-heal e2e）。
    const writeOpts: ApplyOverrideOptions = {
      target: { kind: "ai_model", id: "model-1" },
      scope: "ADMIN",
      actor: { id: "admin-1", role: "admin" },
      patch: { structuredOutput: { nativeMode: "tool_use" } },
      source: "admin-override",
      reason:
        "Admin switches deepseek-v4-pro to tool_use mode for testing structured output alt path",
    };
    const writeResult = await writer.applyOverrideTransactional(writeOpts);
    expect(writeResult.after).toEqual({
      structuredOutput: { nativeMode: "tool_use" },
    });

    // STEP 2: 模拟 ai-model-config.service.buildModelConfig 读取 capability_overrides
    //         并填入 AIModelConfig.aiModelOverrides（B.2 已实现的字段流入）
    const readBack = state.aiModel?.capabilityOverrides;
    expect(readBack).toEqual({ structuredOutput: { nativeMode: "tool_use" } });

    const config = buildAIModelConfig({
      aiModelOverrides: readBack as never,
    });

    // STEP 3: ModelCapabilityService 解析得到最终能力
    const caps = capabilityService.resolveCapabilities(config);

    // STEP 4: 验证 aiModelOverrides 优先级 #2 真的盖住 catalog/derive 的 nativeMode
    expect(caps.structuredOutput.nativeMode).toBe("tool_use");

    // 附加：派生的 structured-output chain 仍兜底 'prompt'（永不空）
    const chain = capabilityService.deriveStructuredOutputChain(caps);
    expect(chain).toContain("prompt");
  });

  it("BYOK user override (优先级 #1) 覆盖 admin override (优先级 #2)", async () => {
    // 同一个 deepseek-v4-pro：admin 写 'tool_use'，user 写 'json_schema'
    // 优先级 #1 (userOverrides) > #2 (aiModelOverrides) → 最终 'json_schema'
    await writer.applyOverrideTransactional({
      target: { kind: "ai_model", id: "model-1" },
      scope: "ADMIN",
      actor: { id: "admin-1", role: "admin" },
      patch: { structuredOutput: { nativeMode: "tool_use" } },
      source: "admin-override",
      reason:
        "Admin sets deepseek-v4-pro to tool_use globally as a fleet-wide compatibility default",
    });
    await writer.applyOverrideTransactional({
      target: { kind: "user_model_config", id: "config-1" },
      scope: "PERSONAL",
      actor: { id: "user-1", role: "user" },
      patch: { structuredOutput: { nativeMode: "json_schema" } },
      source: "admin-override",
      reason:
        "User opts into json_schema because their proxy supports strict mode - personal preference",
    });

    const config = buildAIModelConfig({
      aiModelOverrides: state.aiModel?.capabilityOverrides as never,
      userOverrides: state.userModelConfig?.capabilityOverrides as never,
    });
    const caps = capabilityService.resolveCapabilities(config);

    // userOverrides 优先级最高 → 应是 'json_schema' 不是 'tool_use'
    expect(caps.structuredOutput.nativeMode).toBe("json_schema");
  });

  it("self-heal patch 写入 + audit + 列存储完整（nativeMode='none' 显式 override 真覆盖 catalog）", async () => {
    // 模拟 self-heal 产生的 patch（CapabilitySelfHealService.buildSelfHealPatch 形态）
    //
    // v3.1 §B 子片 2 review-fix (2026-05-24)：'none' 占位语义已移除，
    // nativeMode='none' 现在是显式 override 语义，resolveCapabilities 真会把
    // nativeMode 派生为 'none'（self-heal 显式降级生效）。
    await writer.applyOverrideTransactional({
      target: { kind: "user_model_config", id: "config-1" },
      scope: "SYSTEM",
      actor: { id: "system", role: "system" },
      patch: {
        structuredOutput: { nativeMode: "none" },
        __meta: {
          autoDowngraded: true,
          selfHealedAt: "2026-05-24T12:00:00Z",
          selfHealedReason: "400_unsupported_response_format",
          source: "self-heal-user",
        },
      },
      source: "self-heal-user",
      reason:
        "auto self-heal: HTTP 400 unsupported_response_format observed 3 times in 10 minutes",
    });

    // AuditLog：source + scopeKey 正确
    expect(state.auditLogs).toHaveLength(1);
    expect(state.auditLogs[0].source).toBe("self-heal-user");
    expect(state.auditLogs[0].scopeKey).toBe(
      "user:user-1:user_model_config:config-1",
    );
    expect(state.auditLogs[0].actorId).toBe("system");
    expect(state.auditLogs[0].actorRole).toBe("system");

    // 列存储：JSONB 真的写进去了 + __meta 保留
    const stored = state.userModelConfig?.capabilityOverrides as Record<
      string,
      unknown
    >;
    expect(
      (stored.structuredOutput as Record<string, unknown>).nativeMode,
    ).toBe("none");
    expect((stored.__meta as Record<string, unknown>).autoDowngraded).toBe(
      true,
    );
    expect((stored.__meta as Record<string, unknown>).source).toBe(
      "self-heal-user",
    );

    // AuditLog.afterValue 与 DB 列同步（事务一致性）
    expect(state.auditLogs[0].afterValue).toEqual(stored);

    // v3.1 §B 子片 2 review-fix：验证 'none' 显式 override 真覆盖 catalog
    // （deepseek-v4-pro catalog 默认 nativeMode='json_mode'，self-heal 显式降级到 'none'）
    const config = buildAIModelConfig({
      userOverrides: stored as never,
    });
    const caps = capabilityService.resolveCapabilities(config);
    expect(caps.structuredOutput.nativeMode).toBe("none");
    // 派生链 → 仅 'prompt' 兜底（nativeMode='none' 被 deriveStructuredOutputChain 跳过）
    expect(capabilityService.deriveStructuredOutputChain(caps)).toEqual([
      "prompt",
    ]);
  });
});
