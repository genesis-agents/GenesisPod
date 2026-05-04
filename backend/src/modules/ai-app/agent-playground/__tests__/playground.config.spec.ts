/**
 * playground.config + runtime-flag spec（v5.1 R2-A.0 scaffolding）
 *
 * 验证：
 *   1. PLAYGROUND_PIPELINE 13 step 顺序 + primitive id 与 v5.1 §5 映射对齐
 *   2. 8 role + 每 role.skillSpec 从 SKILL.md 加载（systemPrompt 非空 / id 正确）
 *   3. registry.register 不抛错（所有 primitive id 解析得到）
 *   4. PlaygroundRuntimeFlagService：env / user 白名单 / forceRuntime 优先级
 *
 * 注意：本 PR 只是 scaffolding —— hooks 未接入，pipeline-v1 真实跑会抛
 * NotYetWiredError；spec 不跑 orchestrator.run，只验证声明合法性。
 */
import { MissionPipelineRegistry } from "@/modules/ai-harness/facade";
import { PLAYGROUND_PIPELINE } from "../playground.config";
import { PlaygroundRuntimeFlagService } from "../playground-runtime-flag.service";

describe("PLAYGROUND_PIPELINE (v5.1 R2-A.0)", () => {
  it("pipeline id == agent-playground", () => {
    expect(PLAYGROUND_PIPELINE.id).toBe("agent-playground");
  });

  it("14 个 step（v5.1 §5 stage 映射 / 含 s8b + s9b）", () => {
    expect(PLAYGROUND_PIPELINE.steps).toHaveLength(14);
    expect(PLAYGROUND_PIPELINE.steps.map((s) => s.id)).toEqual([
      "s1-budget",
      "s2-leader-plan",
      "s3-researcher-collect",
      "s4-leader-assess",
      "s5-reconciler",
      "s6-analyst",
      "s7-writer-outline",
      "s8-writer",
      "s8b-quality-enhancement",
      "s9-critic",
      "s9b-objective-eval",
      "s10-leader-foreword-signoff",
      "s11-persist",
      "s12-self-evolution",
    ]);
  });

  it("step → primitive 映射正确", () => {
    const map = Object.fromEntries(
      PLAYGROUND_PIPELINE.steps.map((s) => [s.id, s.primitive]),
    );
    expect(map["s1-budget"]).toBe("persist");
    expect(map["s2-leader-plan"]).toBe("plan");
    expect(map["s3-researcher-collect"]).toBe("research");
    expect(map["s4-leader-assess"]).toBe("assess");
    expect(map["s5-reconciler"]).toBe("synthesize");
    expect(map["s6-analyst"]).toBe("synthesize");
    expect(map["s7-writer-outline"]).toBe("draft");
    expect(map["s8-writer"]).toBe("draft");
    expect(map["s8b-quality-enhancement"]).toBe("review");
    expect(map["s9-critic"]).toBe("review");
    expect(map["s9b-objective-eval"]).toBe("review");
    expect(map["s10-leader-foreword-signoff"]).toBe("signoff");
    expect(map["s11-persist"]).toBe("persist");
    expect(map["s12-self-evolution"]).toBe("learn");
  });

  it("8 role 全部声明 + skillSpec 从 SKILL.md 加载", () => {
    expect(PLAYGROUND_PIPELINE.roles).toHaveLength(8);
    const roleIds = PLAYGROUND_PIPELINE.roles.map((r) => r.id).sort();
    expect(roleIds).toEqual([
      "analyst",
      "leader",
      "reconciler",
      "researcher",
      "reviewer",
      "steward",
      "verifier",
      "writer",
    ]);
    for (const role of PLAYGROUND_PIPELINE.roles) {
      expect(role.skillSpec.id).toBe(`agent-playground.${role.id}`);
      expect(role.skillSpec.systemPrompt.length).toBeGreaterThan(100);
      expect(role.skillSpec.allowedModels.length).toBeGreaterThan(0);
    }
  });

  it("leader 是 stateful（plan/assess/foreword/signoff 4 milestone 跨 stage 累计 decisions）", () => {
    const leader = PLAYGROUND_PIPELINE.roles.find((r) => r.id === "leader");
    expect(leader?.stateful).toBe(true);
  });

  it("registry.register 不抛错（primitive id + role id 全可解析）", () => {
    const registry = new MissionPipelineRegistry();
    expect(() => registry.register(PLAYGROUND_PIPELINE)).not.toThrow();
    expect(registry.has("agent-playground")).toBe(true);
  });

  it("meta 含 eventPrefix + runtimeVersion 元数据", () => {
    expect(PLAYGROUND_PIPELINE.meta?.eventPrefix).toBe("agent-playground");
    expect(PLAYGROUND_PIPELINE.meta?.runtimeVersion).toBe("pipeline-v1");
  });
});

describe("PlaygroundRuntimeFlagService (v5.1 R2-A.0)", () => {
  let svc: PlaygroundRuntimeFlagService;
  const origEnv = { ...process.env };

  beforeEach(() => {
    svc = new PlaygroundRuntimeFlagService();
    delete process.env.PLAYGROUND_RUNTIME;
    delete process.env.PLAYGROUND_PIPELINE_V1_USER_IDS;
  });
  afterAll(() => {
    process.env = origEnv;
  });

  it("默认 → legacy（无 env / 无白名单 / 无 force）", () => {
    expect(svc.resolve({})).toBe("legacy");
  });

  it("env=pipeline-v1 → pipeline-v1", () => {
    process.env.PLAYGROUND_RUNTIME = "pipeline-v1";
    expect(svc.resolve({})).toBe("pipeline-v1");
  });

  it("env=非法值 → legacy（fail-soft，不抛错）", () => {
    process.env.PLAYGROUND_RUNTIME = "wat";
    expect(svc.resolve({})).toBe("legacy");
  });

  it("forceRuntime 优先级最高（覆盖 env）", () => {
    process.env.PLAYGROUND_RUNTIME = "pipeline-v1";
    expect(svc.resolve({ forceRuntime: "legacy" })).toBe("legacy");
  });

  it("forceRuntime=非法值 → legacy 兜底（不污染 caller）", () => {
    expect(svc.resolve({ forceRuntime: "bogus" as never })).toBe("legacy");
  });

  it("用户白名单：在白名单内 → pipeline-v1", () => {
    process.env.PLAYGROUND_PIPELINE_V1_USER_IDS = "u1,u2,u3";
    expect(svc.resolve({ userId: "u2" })).toBe("pipeline-v1");
  });

  it("用户白名单：不在白名单内 + env=legacy → legacy", () => {
    process.env.PLAYGROUND_PIPELINE_V1_USER_IDS = "u1";
    expect(svc.resolve({ userId: "OTHER" })).toBe("legacy");
  });

  it("白名单优先级低于 forceRuntime", () => {
    process.env.PLAYGROUND_PIPELINE_V1_USER_IDS = "u1";
    expect(svc.resolve({ userId: "u1", forceRuntime: "legacy" })).toBe(
      "legacy",
    );
  });

  it("defaultRuntime() 不看用户白名单", () => {
    process.env.PLAYGROUND_PIPELINE_V1_USER_IDS = "u1";
    expect(svc.defaultRuntime()).toBe("legacy");
    process.env.PLAYGROUND_RUNTIME = "pipeline-v1";
    expect(svc.defaultRuntime()).toBe("pipeline-v1");
  });
});
