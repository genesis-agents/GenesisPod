/**
 * tool-timeout plugin spec (v5.1 R0.5-E W1-a)
 */
import { ToolTimeoutPlugin } from "../index";
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
        pluginId: "tool-augment/tool-timeout",
        required: false,
        capabilities,
        priority: options?.priority,
      });
    },
  };
  return {
    manifest: {
      id: "tool-augment/tool-timeout",
      version: "1.0.0",
      coreVersionRange: "^1.0.0",
      description: "test",
      category: "tool-augment",
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

describe("ToolTimeoutPlugin (v5.1 R0.5-E W1-a)", () => {
  it("manifest 含 hook:engine.tool.wrap + read:tool-payload + replaces=tool-timeout + overridable=false", () => {
    const p = new ToolTimeoutPlugin();
    expect(p.manifest.id).toBe("tool-augment/tool-timeout");
    expect(p.manifest.replaces).toBe("tool-timeout");
    expect(p.manifest.hooks).toContain(CORE_HOOKS.TOOL_WRAP);
    expect(p.manifest.capabilities).toContain(`hook:${CORE_HOOKS.TOOL_WRAP}`);
    expect(p.manifest.capabilities).toContain("read:tool-payload");
    expect(p.manifest.overridable).toBe(false);
  });

  it("默认 30s timeout：terminal 在 50ms 完成 → 透传", async () => {
    const plugin = new ToolTimeoutPlugin();
    const bus = new HookBus(silentSupervisor());
    const ctx = makeFakeContext(bus, plugin.manifest.capabilities);
    await plugin.init(ctx, {});

    const result = await bus.fire(
      CORE_HOOKS.TOOL_WRAP,
      {
        __version: 1,
        call: { toolId: "fast-tool", input: {}, contextMeta: {} },
        signal: new AbortController().signal,
        meta: { missionId: "m1", timestamp: 0 },
      },
      async () => {
        await new Promise((r) => setTimeout(r, 50));
        return "ok";
      },
    );
    expect(result).toBe("ok");
  });

  it("config defaultTimeoutMs=100 + terminal 拖 1000ms → abort('timeout')", async () => {
    const plugin = new ToolTimeoutPlugin();
    const bus = new HookBus(silentSupervisor());
    const ctx = makeFakeContext(bus, plugin.manifest.capabilities);
    await plugin.init(ctx, { defaultTimeoutMs: 100 });

    let captured: HookAbortError | null = null;
    try {
      await bus.fire(
        CORE_HOOKS.TOOL_WRAP,
        {
          __version: 1,
          call: { toolId: "slow-tool", input: {}, contextMeta: {} },
          signal: new AbortController().signal,
          meta: { missionId: "m1", timestamp: 0 },
        },
        async () => {
          await new Promise((r) => setTimeout(r, 1000));
          return "should-not-reach";
        },
      );
    } catch (err) {
      if (err instanceof HookAbortError) captured = err;
    }
    expect(captured).not.toBeNull();
    expect(captured!.reason).toBe("timeout");
    expect(captured!.abortPayload).toMatchObject({
      toolId: "slow-tool",
      timeoutMs: 100,
    });
  });

  it("timeoutByToolId 优先于 defaultTimeoutMs", async () => {
    const plugin = new ToolTimeoutPlugin();
    const bus = new HookBus(silentSupervisor());
    const ctx = makeFakeContext(bus, plugin.manifest.capabilities);
    await plugin.init(ctx, {
      defaultTimeoutMs: 5000,
      timeoutByToolId: { "slow-tool": 50 },
    });

    let captured: HookAbortError | null = null;
    try {
      await bus.fire(
        CORE_HOOKS.TOOL_WRAP,
        {
          __version: 1,
          call: { toolId: "slow-tool", input: {}, contextMeta: {} },
          signal: new AbortController().signal,
          meta: { missionId: "m1", timestamp: 0 },
        },
        async () => {
          await new Promise((r) => setTimeout(r, 500));
          return "x";
        },
      );
    } catch (err) {
      if (err instanceof HookAbortError) captured = err;
    }
    expect(captured?.abortPayload).toMatchObject({ timeoutMs: 50 });
  });

  it("contextMeta.timeout 优先于 toolId map", async () => {
    const plugin = new ToolTimeoutPlugin();
    const bus = new HookBus(silentSupervisor());
    const ctx = makeFakeContext(bus, plugin.manifest.capabilities);
    await plugin.init(ctx, {
      defaultTimeoutMs: 10_000,
      timeoutByToolId: { x: 5000 },
    });

    let captured: HookAbortError | null = null;
    try {
      await bus.fire(
        CORE_HOOKS.TOOL_WRAP,
        {
          __version: 1,
          call: {
            toolId: "x",
            input: {},
            contextMeta: { timeout: 30 },
          },
          signal: new AbortController().signal,
          meta: { missionId: "m1", timestamp: 0 },
        },
        async () => {
          await new Promise((r) => setTimeout(r, 300));
          return "x";
        },
      );
    } catch (err) {
      if (err instanceof HookAbortError) captured = err;
    }
    expect(captured?.abortPayload).toMatchObject({ timeoutMs: 30 });
  });

  it("terminal 抛错 → 错误透传，不被超时吞掉", async () => {
    const plugin = new ToolTimeoutPlugin();
    const bus = new HookBus(silentSupervisor());
    const ctx = makeFakeContext(bus, plugin.manifest.capabilities);
    await plugin.init(ctx, { defaultTimeoutMs: 1000 });

    let caught: Error | null = null;
    try {
      await bus.fire(
        CORE_HOOKS.TOOL_WRAP,
        {
          __version: 1,
          call: { toolId: "boom", input: {}, contextMeta: {} },
          signal: new AbortController().signal,
          meta: { missionId: "m1", timestamp: 0 },
        },
        async () => {
          throw new Error("real-error");
        },
      );
    } catch (err) {
      caught = err as Error;
    }
    expect(caught?.message).toBe("real-error");
    expect(caught instanceof HookAbortError).toBe(false);
  });

  it("严禁出现 ai-app 名（manifest 业务无关）", () => {
    const p = new ToolTimeoutPlugin();
    const j = JSON.stringify(p.manifest);
    expect(j).not.toMatch(/playground|research|writing|topic-insights|office/i);
  });
});
