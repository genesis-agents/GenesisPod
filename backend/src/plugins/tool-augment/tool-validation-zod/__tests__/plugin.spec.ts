/**
 * tool-validation-zod plugin spec (v5.1 R0.5-E W1-a)
 */
import { ToolValidationZodPlugin } from "../index";
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
        pluginId: "tool-augment/tool-validation-zod",
        required: false,
        capabilities,
        priority: options?.priority,
      });
    },
  };
  return {
    manifest: {
      id: "tool-augment/tool-validation-zod",
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

const stringSchema = { type: "string", minLength: 1 };
const userSchema = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    age: { type: "integer", minimum: 0 },
  },
  required: ["name"],
};

describe("ToolValidationZodPlugin (v5.1 R0.5-E W1-a)", () => {
  beforeEach(() => {
    delete process.env.STRICT_OUTPUT_VALIDATION_MODE;
    delete process.env.STRICT_OUTPUT_VALIDATION;
  });

  it("manifest 含 TOOL_BEFORE+TOOL_AFTER hook + replaces=tool-validation + overridable=false", () => {
    const p = new ToolValidationZodPlugin();
    expect(p.manifest.id).toBe("tool-augment/tool-validation-zod");
    expect(p.manifest.replaces).toBe("tool-validation");
    expect(p.manifest.hooks).toContain(CORE_HOOKS.TOOL_BEFORE);
    expect(p.manifest.hooks).toContain(CORE_HOOKS.TOOL_AFTER);
    expect(p.manifest.overridable).toBe(false);
  });

  it("input 符合 schema → 透传 next", async () => {
    const plugin = new ToolValidationZodPlugin();
    const bus = new HookBus(silentSupervisor());
    const ctx = makeFakeContext(bus, plugin.manifest.capabilities);
    await plugin.init(ctx, {});

    let ran = false;
    await bus.fire(
      CORE_HOOKS.TOOL_BEFORE,
      {
        __version: 1,
        call: {
          toolId: "t",
          input: { name: "Alice", age: 30 },
          contextMeta: {},
          inputSchema: userSchema,
        },
        meta: { missionId: "m1", timestamp: 0 },
      },
      async () => {
        ran = true;
      },
    );
    expect(ran).toBe(true);
  });

  it("input 缺 required 字段 → abort('validation-failed', { phase: 'input' })", async () => {
    const plugin = new ToolValidationZodPlugin();
    const bus = new HookBus(silentSupervisor());
    const ctx = makeFakeContext(bus, plugin.manifest.capabilities);
    await plugin.init(ctx, {});

    let captured: HookAbortError | null = null;
    try {
      await bus.fire(
        CORE_HOOKS.TOOL_BEFORE,
        {
          __version: 1,
          call: {
            toolId: "t",
            input: { age: 30 }, // missing name
            contextMeta: {},
            inputSchema: userSchema,
          },
          meta: { missionId: "m1", timestamp: 0 },
        },
        async () => undefined,
      );
    } catch (err) {
      if (err instanceof HookAbortError) captured = err;
    }
    expect(captured?.reason).toBe("validation-failed");
    expect(captured?.abortPayload).toMatchObject({
      phase: "input",
      toolId: "t",
    });
  });

  it("input minLength 校验失败 → abort", async () => {
    const plugin = new ToolValidationZodPlugin();
    const bus = new HookBus(silentSupervisor());
    const ctx = makeFakeContext(bus, plugin.manifest.capabilities);
    await plugin.init(ctx, {});

    let aborted = false;
    try {
      await bus.fire(
        CORE_HOOKS.TOOL_BEFORE,
        {
          __version: 1,
          call: {
            toolId: "t",
            input: "",
            contextMeta: {},
            inputSchema: stringSchema,
          },
          meta: { missionId: "m1", timestamp: 0 },
        },
        async () => undefined,
      );
    } catch (err) {
      if (err instanceof HookAbortError && err.reason === "validation-failed") {
        aborted = true;
      }
    }
    expect(aborted).toBe(true);
  });

  it("无 inputSchema → 跳过校验", async () => {
    const plugin = new ToolValidationZodPlugin();
    const bus = new HookBus(silentSupervisor());
    const ctx = makeFakeContext(bus, plugin.manifest.capabilities);
    await plugin.init(ctx, {});

    let ran = false;
    await bus.fire(
      CORE_HOOKS.TOOL_BEFORE,
      {
        __version: 1,
        call: {
          toolId: "t",
          input: "anything",
          contextMeta: {},
        },
        meta: { missionId: "m1", timestamp: 0 },
      },
      async () => {
        ran = true;
      },
    );
    expect(ran).toBe(true);
  });

  it("output strict + 不符合 → abort('validation-failed', { phase: 'output' })", async () => {
    const plugin = new ToolValidationZodPlugin();
    const bus = new HookBus(silentSupervisor());
    const ctx = makeFakeContext(bus, plugin.manifest.capabilities);
    await plugin.init(ctx, { mode: "strict" });

    let captured: HookAbortError | null = null;
    try {
      await bus.fire(
        CORE_HOOKS.TOOL_AFTER,
        {
          __version: 1,
          call: {
            toolId: "t",
            input: {},
            contextMeta: {},
            outputSchema: userSchema,
          },
          result: {
            success: true,
            data: { age: 99 }, // missing name
          },
          meta: { missionId: "m1", timestamp: 0 },
        },
        async () => undefined,
      );
    } catch (err) {
      if (err instanceof HookAbortError) captured = err;
    }
    expect(captured?.abortPayload).toMatchObject({
      phase: "output",
      toolId: "t",
    });
  });

  it("output lenient mode → 仅 warn，不 abort", async () => {
    const plugin = new ToolValidationZodPlugin();
    const bus = new HookBus(silentSupervisor());
    const ctx = makeFakeContext(bus, plugin.manifest.capabilities);
    await plugin.init(ctx, { mode: "lenient" });

    let ran = false;
    await bus.fire(
      CORE_HOOKS.TOOL_AFTER,
      {
        __version: 1,
        call: {
          toolId: "t",
          input: {},
          contextMeta: {},
          outputSchema: userSchema,
        },
        result: { success: true, data: { age: 99 } },
        meta: { missionId: "m1", timestamp: 0 },
      },
      async () => {
        ran = true;
      },
    );
    expect(ran).toBe(true); // lenient → next() 跑完
  });

  it("output coerce mode：缺 optional 字段补默认值 → 透传", async () => {
    const plugin = new ToolValidationZodPlugin();
    const bus = new HookBus(silentSupervisor());
    const ctx = makeFakeContext(bus, plugin.manifest.capabilities);
    await plugin.init(ctx, { mode: "coerce" });

    const schemaWithOptional = {
      type: "object",
      properties: {
        name: { type: "string" },
        nickname: { type: "string" }, // optional
      },
      required: ["name"],
    };

    let ran = false;
    await bus.fire(
      CORE_HOOKS.TOOL_AFTER,
      {
        __version: 1,
        call: {
          toolId: "t",
          input: {},
          contextMeta: {},
          outputSchema: schemaWithOptional,
        },
        result: { success: true, data: { name: "x" } },
        meta: { missionId: "m1", timestamp: 0 },
      },
      async () => {
        ran = true;
      },
    );
    expect(ran).toBe(true);
  });

  it("STRICT_OUTPUT_VALIDATION=0 → lenient 行为", async () => {
    process.env.STRICT_OUTPUT_VALIDATION = "0";
    const plugin = new ToolValidationZodPlugin();
    const bus = new HookBus(silentSupervisor());
    const ctx = makeFakeContext(bus, plugin.manifest.capabilities);
    await plugin.init(ctx, {});

    let ran = false;
    await bus.fire(
      CORE_HOOKS.TOOL_AFTER,
      {
        __version: 1,
        call: {
          toolId: "t",
          input: {},
          contextMeta: {},
          outputSchema: userSchema,
        },
        result: { success: true, data: {} },
        meta: { missionId: "m1", timestamp: 0 },
      },
      async () => {
        ran = true;
      },
    );
    expect(ran).toBe(true);
    delete process.env.STRICT_OUTPUT_VALIDATION;
  });

  it("output abort 路径不再校验（avoid double-abort）", async () => {
    const plugin = new ToolValidationZodPlugin();
    const bus = new HookBus(silentSupervisor());
    const ctx = makeFakeContext(bus, plugin.manifest.capabilities);
    await plugin.init(ctx, {});

    let ran = false;
    await bus.fire(
      CORE_HOOKS.TOOL_AFTER,
      {
        __version: 1,
        call: {
          toolId: "t",
          input: {},
          contextMeta: {},
          outputSchema: userSchema,
        },
        result: undefined,
        abortReason: "rate-limited",
        meta: { missionId: "m1", timestamp: 0 },
      },
      async () => {
        ran = true;
      },
    );
    expect(ran).toBe(true);
  });

  it("$ref 等不支持字段 → 跳过校验（保守）", async () => {
    const plugin = new ToolValidationZodPlugin();
    const bus = new HookBus(silentSupervisor());
    const ctx = makeFakeContext(bus, plugin.manifest.capabilities);
    await plugin.init(ctx, {});

    let ran = false;
    await bus.fire(
      CORE_HOOKS.TOOL_BEFORE,
      {
        __version: 1,
        call: {
          toolId: "t",
          input: { anything: 1 },
          contextMeta: {},
          inputSchema: { $ref: "#/components/schemas/Foo" },
        },
        meta: { missionId: "m1", timestamp: 0 },
      },
      async () => {
        ran = true;
      },
    );
    expect(ran).toBe(true);
  });

  it("严禁出现 ai-app 名（manifest 业务无关）", () => {
    const p = new ToolValidationZodPlugin();
    const j = JSON.stringify(p.manifest);
    expect(j).not.toMatch(/playground|research|writing|topic-insights|office/i);
  });
});
