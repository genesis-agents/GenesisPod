/**
 * rate-limit plugin spec (v5.1 R0.5 PR-9)
 */
import { RateLimitPlugin, InMemoryTokenBucketStore } from "../index";
import { HookBus } from "@/plugins/core/hook-bus";
import { CORE_HOOKS, HookAbortError } from "@/plugins/core/abstractions";
import type {
  IPluginContext,
  IPluginLogger,
  IPluginConfigView,
  IHookRegistrar,
  IMetricsEmitter,
  IPluginEventBus,
} from "@/plugins/core/abstractions";

function silentSupervisor() {
  return { onPluginError: () => {}, isCircuitOpen: () => false };
}

function makeFakeContext(bus: HookBus, capabilities: string[]): IPluginContext {
  const logger: IPluginLogger = {
    log: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
  const config: IPluginConfigView = { value: {}, profile: "test" };
  const metrics: IMetricsEmitter = {
    counter: () => {},
    gauge: () => {},
    histogram: () => {},
  };
  const events: IPluginEventBus = {
    publish: () => {},
    subscribe: () => () => {},
  };
  const hooks: IHookRegistrar = {
    register: (hookId, handler, options) => {
      bus.register(hookId, handler, {
        pluginId: "resilience/rate-limit",
        required: false,
        capabilities,
        priority: options?.priority,
      });
    },
  };
  return {
    manifest: {
      id: "resilience/rate-limit",
      version: "1.0.0",
      coreVersionRange: "^1.0.0",
      description: "test",
      category: "resilience",
      stability: "stable",
      hooks: [],
      capabilities: [],
      phase: "bootstrap",
      required: false,
    },
    logger,
    config,
    hooks,
    metrics,
    events,
    getService: () => {
      throw new Error("not stubbed");
    },
  };
}

describe("RateLimitPlugin (v5.1 R0.5 PR-9)", () => {
  it("manifest 含 service:redis + read:llm-payload:meta + replaces=rate-limit + overridable=false", () => {
    const p = new RateLimitPlugin();
    expect(p.manifest.id).toBe("resilience/rate-limit");
    expect(p.manifest.replaces).toBe("rate-limit");
    expect(p.manifest.capabilities).toContain("service:redis");
    expect(p.manifest.capabilities).toContain("read:llm-payload:meta");
    expect(p.manifest.capabilities).toContain("read:tool-payload");
    // standards/19 LOW-2: security 类不允许 ai-app override
    expect(p.manifest.overridable).toBe(false);
    // 不应申请 :full（HIGH-1）
    expect(p.manifest.capabilities).not.toContain("read:llm-payload:full");
  });

  it("LLM_REQUEST 在 quota 内透传 next", async () => {
    const store = new InMemoryTokenBucketStore();
    const plugin = new RateLimitPlugin(store);
    const bus = new HookBus(silentSupervisor());
    const ctx = makeFakeContext(bus, plugin.manifest.capabilities);
    await plugin.init(ctx, { globalRpm: 60 });

    let terminalRan = false;
    await bus.fire(
      CORE_HOOKS.LLM_REQUEST,
      {
        __version: 1,
        request: {},
        meta: { missionId: "m1", timestamp: 0 },
      },
      async () => {
        terminalRan = true;
        return undefined;
      },
    );
    expect(terminalRan).toBe(true);
  });

  it("global quota 耗尽 → abort('rate-limited', { scope: 'global' })", async () => {
    const store = new InMemoryTokenBucketStore();
    store.setForTest("global:llm", 0);
    const plugin = new RateLimitPlugin(store);
    const bus = new HookBus(silentSupervisor());
    const ctx = makeFakeContext(bus, plugin.manifest.capabilities);
    await plugin.init(ctx, { globalRpm: 60 });

    let terminalRan = false;
    let captured = null;
    try {
      await bus.fire(
        CORE_HOOKS.LLM_REQUEST,
        {
          __version: 1,
          request: {},
          meta: { missionId: "m1", timestamp: 0 },
        },
        async () => {
          terminalRan = true;
        },
      );
    } catch (err) {
      if (err instanceof HookAbortError) {
        captured = err.abortPayload;
      }
    }
    expect(terminalRan).toBe(false);
    expect(captured).toMatchObject({ scope: "global", domain: "llm" });
  });

  it("per-tenant quota：tenantA 耗尽不影响 tenantB", async () => {
    const store = new InMemoryTokenBucketStore();
    const plugin = new RateLimitPlugin(store);
    const bus = new HookBus(silentSupervisor());
    const ctx = makeFakeContext(bus, plugin.manifest.capabilities);
    await plugin.init(ctx, {
      globalRpm: 1000, // 留充足空间
      perTenantRpm: 60,
    });

    // tenantA 耗尽
    store.setForTest("tenant:tenantA:llm", 0);

    let abortedA = false;
    try {
      await bus.fire(
        CORE_HOOKS.LLM_REQUEST,
        {
          __version: 1,
          request: {},
          meta: { missionId: "m1", tenantId: "tenantA", timestamp: 0 },
        },
        async () => undefined,
      );
    } catch (err) {
      if (err instanceof HookAbortError) abortedA = true;
    }
    expect(abortedA).toBe(true);

    // tenantB 不受影响
    let bRan = false;
    await bus.fire(
      CORE_HOOKS.LLM_REQUEST,
      {
        __version: 1,
        request: {},
        meta: { missionId: "m2", tenantId: "tenantB", timestamp: 0 },
      },
      async () => {
        bRan = true;
        return undefined;
      },
    );
    expect(bRan).toBe(true);
  });

  it("per-agent-type quota：业务无关标签限流（research-style 单独配置）", async () => {
    const store = new InMemoryTokenBucketStore();
    const plugin = new RateLimitPlugin(store);
    const bus = new HookBus(silentSupervisor());
    const ctx = makeFakeContext(bus, plugin.manifest.capabilities);
    await plugin.init(ctx, {
      globalRpm: 1000,
      perAgentTypeRpm: { "research-style": 30 },
    });

    store.setForTest("agentType:research-style:llm", 0);

    let captured = null;
    try {
      await bus.fire(
        CORE_HOOKS.LLM_REQUEST,
        {
          __version: 1,
          request: {},
          meta: {
            missionId: "m1",
            agentType: "research-style",
            timestamp: 0,
          },
        },
        async () => undefined,
      );
    } catch (err) {
      if (err instanceof HookAbortError) captured = err.abortPayload;
    }
    expect(captured).toMatchObject({
      scope: "agentType",
      agentType: "research-style",
    });
  });

  it("TOOL_BEFORE 也按相同维度限流", async () => {
    const store = new InMemoryTokenBucketStore();
    store.setForTest("global:tool", 0);
    const plugin = new RateLimitPlugin(store);
    const bus = new HookBus(silentSupervisor());
    const ctx = makeFakeContext(bus, plugin.manifest.capabilities);
    await plugin.init(ctx, { globalRpm: 60 });

    let aborted = false;
    try {
      await bus.fire(
        CORE_HOOKS.TOOL_BEFORE,
        {
          __version: 1,
          call: { toolId: "t", input: {}, contextMeta: {} },
          meta: { missionId: "m1", timestamp: 0 },
        },
        async () => undefined,
      );
    } catch (err) {
      if (err instanceof HookAbortError && err.reason === "rate-limited") {
        aborted = true;
      }
    }
    expect(aborted).toBe(true);
  });

  it("redis store 异常时 fail-open（不阻塞调用方）", async () => {
    const brokenStore = {
      tryConsume: async () => {
        throw new Error("redis down");
      },
    };
    const plugin = new RateLimitPlugin(brokenStore);
    const bus = new HookBus(silentSupervisor());
    const ctx = makeFakeContext(bus, plugin.manifest.capabilities);
    await plugin.init(ctx, { globalRpm: 60 });

    let terminalRan = false;
    await bus.fire(
      CORE_HOOKS.LLM_REQUEST,
      {
        __version: 1,
        request: {},
        meta: { missionId: "m1", timestamp: 0 },
      },
      async () => {
        terminalRan = true;
        return undefined;
      },
    );
    expect(terminalRan).toBe(true); // fail-open
  });

  it("严禁出现 ai-app 名（业务无关，仅按 tenantId/agentType 维度）", () => {
    // manifest 不含任何 ai-app 名
    const p = new RateLimitPlugin();
    const j = JSON.stringify(p.manifest);
    expect(j).not.toMatch(/playground|research|writing|topic-insights|office/i);
  });
});
