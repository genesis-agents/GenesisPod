/**
 * MissionPipelineConfig + Registry + Orchestrator spec (v5.1 R1-B)
 */
import {
  defineMissionPipeline,
  validatePipelineConfig,
  MissionPipelineRegistry,
  MissionPipelineOrchestrator,
} from "../index";
import type {
  PipelineStepConfig,
  PipelineRoleConfig,
  MissionEvent,
} from "../index";

function makeRole(id: string): PipelineRoleConfig {
  return {
    id,
    skillSpec: {
      id,
      systemPrompt: `you are ${id}`,
      allowedToolIds: [],
      allowedModels: [],
      outputSchema: { safeParse: () => ({ success: true }) } as never,
      meta: {},
    },
  };
}

function makeStep(
  id: string,
  primitive: PipelineStepConfig["primitive"],
  overrides: Partial<PipelineStepConfig> = {},
): PipelineStepConfig {
  return {
    id,
    primitive,
    ...overrides,
  };
}

describe("defineMissionPipeline / validatePipelineConfig (R1-B)", () => {
  it("frozen + validated", () => {
    const config = defineMissionPipeline({
      id: "test-pipeline",
      roles: [makeRole("leader")],
      steps: [makeStep("s1", "plan", { roleId: "leader" })],
    });
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.steps)).toBe(true);
  });

  it("空 steps → 抛错", () => {
    expect(() =>
      defineMissionPipeline({ id: "x", roles: [], steps: [] }),
    ).toThrow(/steps cannot be empty/);
  });

  it("缺 id → 抛错", () => {
    expect(() =>
      defineMissionPipeline({
        id: "",
        roles: [],
        steps: [makeStep("s1", "plan")],
      }),
    ).toThrow(/id is required/);
  });

  it("重复 role id → 抛错", () => {
    expect(() =>
      validatePipelineConfig({
        id: "x",
        roles: [makeRole("a"), makeRole("a")],
        steps: [makeStep("s1", "plan")],
      }),
    ).toThrow(/duplicate role id/);
  });

  it("重复 step id → 抛错", () => {
    expect(() =>
      validatePipelineConfig({
        id: "x",
        roles: [],
        steps: [makeStep("s1", "plan"), makeStep("s1", "review")],
      }),
    ).toThrow(/duplicate step id/);
  });

  it("step.roleId 引用不存在的 role → 抛错", () => {
    expect(() =>
      validatePipelineConfig({
        id: "x",
        roles: [],
        steps: [makeStep("s1", "plan", { roleId: "ghost" })],
      }),
    ).toThrow(/unknown roleId/);
  });
});

describe("MissionPipelineRegistry (R1-B)", () => {
  it("register / get / has / size / listIds", () => {
    const r = new MissionPipelineRegistry();
    const cfg = defineMissionPipeline({
      id: "p1",
      roles: [],
      steps: [makeStep("s1", "plan")],
    });
    r.register(cfg);
    expect(r.has("p1")).toBe(true);
    expect(r.get("p1")).toBe(cfg);
    expect(r.size()).toBe(1);
    expect(r.listIds()).toEqual(["p1"]);
  });

  it("duplicate id 抛错", () => {
    const r = new MissionPipelineRegistry();
    const cfg = defineMissionPipeline({
      id: "p1",
      roles: [],
      steps: [makeStep("s1", "plan")],
    });
    r.register(cfg);
    expect(() => r.register(cfg)).toThrow(/duplicate pipeline id/);
  });

  it("get 不存在抛错（fail-fast）", () => {
    const r = new MissionPipelineRegistry();
    expect(() => r.get("missing")).toThrow(/pipeline "missing" not found/);
  });

  it("step.primitive 未知 → 注册时抛错", () => {
    const r = new MissionPipelineRegistry();
    expect(() =>
      r.register({
        id: "x",
        roles: [],
        steps: [
          {
            id: "s1",
            primitive: "fake-primitive" as never,
          },
        ],
      }),
    ).toThrow(/unknown primitive/);
  });

  it("resolvePrimitive 把 'plan' / 'persist' 等映射到对应 IStagePrimitive", () => {
    const r = new MissionPipelineRegistry();
    const plan = r.resolvePrimitive("plan");
    const persist = r.resolvePrimitive("persist");
    expect(plan.id).toBe("plan");
    expect(persist.id).toBe("persist");
  });
});

describe("MissionPipelineOrchestrator (R1-B)", () => {
  function makeOrchestrator() {
    const registry = new MissionPipelineRegistry();
    const orchestrator = new MissionPipelineOrchestrator(registry);
    return { registry, orchestrator };
  }

  it("顺序执行 steps，emit mission:started/completed + stage:started/completed", async () => {
    const { registry, orchestrator } = makeOrchestrator();
    registry.register(
      defineMissionPipeline({
        id: "test",
        roles: [makeRole("leader")],
        steps: [
          makeStep("s1", "persist", {
            hooks: { persist: async () => undefined },
          }),
          makeStep("s2", "persist", {
            hooks: { persist: async () => undefined },
          }),
        ],
      }),
    );

    const events: MissionEvent[] = [];
    const result = await orchestrator.run({
      missionId: "m1",
      pipelineId: "test",
      input: {},
      onEvent: (e) => {
        events.push(e);
      },
    });

    expect(result.status).toBe("completed");
    expect(result.stageOutputs.s1).toEqual({ persisted: true });
    expect(result.stageOutputs.s2).toEqual({ persisted: true });

    const types = events.map((e) => e.type);
    expect(types).toEqual([
      "mission:started",
      "stage:started",
      "stage:completed",
      "stage:started",
      "stage:completed",
      "mission:completed",
    ]);
  });

  it("step 抛错 → mission:failed + stage:failed event + result.status=failed", async () => {
    const { registry, orchestrator } = makeOrchestrator();
    registry.register(
      defineMissionPipeline({
        id: "test",
        roles: [],
        steps: [
          makeStep("s1", "persist", {
            hooks: {
              persist: async () => {
                throw new Error("boom");
              },
            },
          }),
        ],
      }),
    );

    const events: MissionEvent[] = [];
    const result = await orchestrator.run({
      missionId: "m1",
      pipelineId: "test",
      input: {},
      onEvent: (e) => {
        events.push(e);
      },
    });

    expect(result.status).toBe("failed");
    expect(events.some((e) => e.type === "stage:failed")).toBe(true);
    expect(events[events.length - 1].type).toBe("mission:failed");
  });

  it("StageAbortError → mission:aborted + result.status=aborted", async () => {
    const { registry, orchestrator } = makeOrchestrator();
    registry.register(
      defineMissionPipeline({
        id: "test",
        roles: [makeRole("leader")],
        steps: [
          makeStep("s1", "assess", {
            roleId: "leader",
            hooks: {
              runRole: async () => ({}),
              parseDecision: () => "abort-mission",
            },
          }),
        ],
      }),
    );

    const result = await orchestrator.run({
      missionId: "m1",
      pipelineId: "test",
      input: {},
    });
    expect(result.status).toBe("aborted");
  });

  it("crossStageState 在 step 间共享", async () => {
    const { registry, orchestrator } = makeOrchestrator();
    registry.register(
      defineMissionPipeline({
        id: "test",
        roles: [makeRole("leader")],
        steps: [
          makeStep("s1", "assess", {
            roleId: "leader",
            hooks: {
              runRole: async () => ({}),
              parseDecision: () => "patch-then-retry",
              dispatchAssessActions: ({ crossStageState }) => {
                crossStageState.incr("playground.s4PatchRound");
              },
            },
          }),
          makeStep("s2", "persist", {
            hooks: {
              persist: async ({ crossStageState }) => {
                crossStageState.set("persisted", true);
              },
            },
          }),
        ],
      }),
    );

    const result = await orchestrator.run({
      missionId: "m1",
      pipelineId: "test",
      input: {},
    });
    expect(result.crossStageState["playground.s4PatchRound"]).toBe(1);
    expect(result.crossStageState["persisted"]).toBe(true);
  });

  it("step.timeoutMs 超时 → StageAbortError → mission:aborted", async () => {
    const { registry, orchestrator } = makeOrchestrator();
    registry.register(
      defineMissionPipeline({
        id: "test",
        roles: [],
        steps: [
          makeStep("slow", "persist", {
            timeoutMs: 30,
            hooks: {
              persist: () =>
                new Promise<void>((resolve) =>
                  setTimeout(() => resolve(), 200),
                ),
            },
          }),
        ],
      }),
    );

    const result = await orchestrator.run({
      missionId: "m1",
      pipelineId: "test",
      input: {},
    });
    expect(result.status).toBe("aborted");
  });

  it("AbortSignal 在 step 间隙触发 → mission:aborted", async () => {
    const { registry, orchestrator } = makeOrchestrator();
    registry.register(
      defineMissionPipeline({
        id: "test",
        roles: [],
        steps: [
          makeStep("s1", "persist", {
            hooks: {
              persist: async () => undefined,
            },
          }),
          makeStep("s2", "persist", {
            hooks: { persist: async () => undefined },
          }),
        ],
      }),
    );

    const ctrl = new AbortController();
    // s1 完成后立即 abort
    const result = await orchestrator.run({
      missionId: "m1",
      pipelineId: "test",
      input: {},
      signal: ctrl.signal,
      onEvent: (e) => {
        if (e.type === "stage:completed" && e.stepId === "s1") {
          ctrl.abort();
        }
      },
    });
    expect(result.status).toBe("aborted");
    expect(result.stageOutputs.s1).toBeDefined();
    expect(result.stageOutputs.s2).toBeUndefined();
  });

  it("resumeFromStepId：从指定 step 之后续跑", async () => {
    const { registry, orchestrator } = makeOrchestrator();
    let s1Called = false;
    let s2Called = false;
    registry.register(
      defineMissionPipeline({
        id: "test",
        roles: [],
        steps: [
          makeStep("s1", "persist", {
            hooks: {
              persist: async () => {
                s1Called = true;
              },
            },
          }),
          makeStep("s2", "persist", {
            hooks: {
              persist: async () => {
                s2Called = true;
              },
            },
          }),
        ],
      }),
    );

    const result = await orchestrator.run({
      missionId: "m1",
      pipelineId: "test",
      input: {},
      resumeFromStepId: "s1",
      initialStageOutputs: { s1: { persisted: true } },
    });
    expect(s1Called).toBe(false); // 跳过
    expect(s2Called).toBe(true);
    expect(result.stageOutputs.s1).toEqual({ persisted: true });
    expect(result.status).toBe("completed");
  });

  it("event listener 抛错不影响 mission 主流程", async () => {
    const { registry, orchestrator } = makeOrchestrator();
    registry.register(
      defineMissionPipeline({
        id: "test",
        roles: [],
        steps: [
          makeStep("s1", "persist", {
            hooks: { persist: async () => undefined },
          }),
        ],
      }),
    );

    const result = await orchestrator.run({
      missionId: "m1",
      pipelineId: "test",
      input: {},
      onEvent: () => {
        throw new Error("listener boom");
      },
    });
    expect(result.status).toBe("completed");
  });
});
