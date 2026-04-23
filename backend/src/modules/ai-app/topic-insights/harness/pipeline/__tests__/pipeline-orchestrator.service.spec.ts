/**
 * Pipeline Orchestrator 骨架测试
 *
 * 验证：
 * - 无 stage 注册 → 空 pipeline 正常返回
 * - 单 stage 线性 pipeline 跑完 prepare/execute/persist
 * - dependsOn 拓扑排序正确
 * - runsWhen 条件跳过 stage
 * - Budget 耗尽抛 BudgetExhaustedError
 * - signal.aborted 中断执行
 */

import { PipelineOrchestratorService, buildIdentityContext } from "..";
import { StageRegistry } from "../stage-registry";
import {
  BudgetExhaustedError,
  type Stage,
  type PipelineIdentityContext,
  type StageId,
} from "../types";

function mkStage(overrides: Partial<Stage> & { id: StageId }): Stage {
  return {
    name: overrides.id,
    dependsOn: [],
    runsWhen: "always",
    slo: { p95Ms: 1000, maxTokens: 0, targetSuccessRate: 0.95 },
    emitsEvents: [],
    prepare: jest.fn().mockResolvedValue({}),
    execute: jest.fn().mockResolvedValue({ ok: true }),
    persist: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as Stage;
}

describe("PipelineOrchestratorService", () => {
  let registry: StageRegistry;
  let orchestrator: PipelineOrchestratorService;

  beforeEach(() => {
    registry = new StageRegistry();
    orchestrator = new PipelineOrchestratorService(registry);
  });

  function ctx(
    overrides: Partial<PipelineIdentityContext> = {},
  ): PipelineIdentityContext {
    const base = buildIdentityContext({
      missionId: "m-1",
      topicId: "t-1",
      reportId: "r-1",
      userId: "u-1",
      depth: "standard",
      mode: "fresh",
    });
    return { ...base, ...overrides };
  }

  it("无 stage 注册 → 返回空结果", async () => {
    const result = await orchestrator.run(ctx());
    expect(result.completedStages).toEqual([]);
    expect(result.skippedStages).toEqual([]);
  });

  it("单 stage 跑完 prepare/execute/persist", async () => {
    const s = mkStage({ id: "ST-00-INIT" });
    registry.register(s);

    const result = await orchestrator.run(ctx());
    expect(result.completedStages).toEqual(["ST-00-INIT"]);
    expect(s.prepare).toHaveBeenCalled();
    expect(s.execute).toHaveBeenCalled();
    expect(s.persist).toHaveBeenCalled();
  });

  it("dependsOn 拓扑排序：plan → research → write", async () => {
    const calls: StageId[] = [];
    registry.register(
      mkStage({
        id: "ST-03-WRITE",
        dependsOn: ["ST-01-PLAN"],
        execute: jest.fn(async () => {
          calls.push("ST-03-WRITE");
          return {};
        }),
      }),
    );
    registry.register(
      mkStage({
        id: "ST-01-PLAN",
        execute: jest.fn(async () => {
          calls.push("ST-01-PLAN");
          return {};
        }),
      }),
    );
    registry.register(
      mkStage({
        id: "ST-02-RESEARCH",
        dependsOn: ["ST-01-PLAN"],
        execute: jest.fn(async () => {
          calls.push("ST-02-RESEARCH");
          return {};
        }),
      }),
    );

    const result = await orchestrator.run(ctx());
    // plan 必须在 research / write 之前
    expect(calls.indexOf("ST-01-PLAN")).toBeLessThan(
      calls.indexOf("ST-02-RESEARCH"),
    );
    expect(calls.indexOf("ST-01-PLAN")).toBeLessThan(
      calls.indexOf("ST-03-WRITE"),
    );
    expect(result.completedStages.length).toBe(3);
  });

  it("runsWhen='thoroughOrDeep' + depth=standard → skip", async () => {
    registry.register(
      mkStage({ id: "ST-06-COGLOOP", runsWhen: "thoroughOrDeep" }),
    );
    const result = await orchestrator.run(ctx({ depth: "standard" }));
    expect(result.skippedStages).toContain("ST-06-COGLOOP");
    expect(result.completedStages).not.toContain("ST-06-COGLOOP");
  });

  it("runsWhen='thoroughOrDeep' + depth=thorough → run", async () => {
    registry.register(
      mkStage({ id: "ST-06-COGLOOP", runsWhen: "thoroughOrDeep" }),
    );
    const result = await orchestrator.run(ctx({ depth: "thorough" }));
    expect(result.completedStages).toContain("ST-06-COGLOOP");
  });

  it("degradationMode=true 时跳过 thoroughOrDeep stage", async () => {
    registry.register(
      mkStage({ id: "ST-06-COGLOOP", runsWhen: "thoroughOrDeep" }),
    );
    const c = ctx({ depth: "thorough" });
    c.degradationMode = true;
    const result = await orchestrator.run(c);
    expect(result.skippedStages).toContain("ST-06-COGLOOP");
  });

  it("Budget 超 100% 抛 BudgetExhaustedError", async () => {
    registry.register(
      mkStage({
        id: "ST-01-PLAN",
        execute: jest.fn(async () => {
          return {};
        }),
        persist: jest.fn(async () => {
          // ignore
        }),
      }),
    );

    const c = ctx();
    // 手动把 token 已用数提升到 100%
    c.budget.charge({ tokens: c.budget.config.maxTotalTokens });

    await expect(orchestrator.run(c)).rejects.toBeInstanceOf(
      BudgetExhaustedError,
    );
  });

  it("AbortSignal 已 abort 时抛 AbortError", async () => {
    registry.register(mkStage({ id: "ST-01-PLAN" }));
    registry.register(
      mkStage({ id: "ST-02-RESEARCH", dependsOn: ["ST-01-PLAN"] }),
    );

    const c = ctx();
    c.abortController.abort();

    await expect(orchestrator.run(c)).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("only='ST-01-PLAN' 只跑指定 stage（enabledStages）", async () => {
    registry.register(mkStage({ id: "ST-01-PLAN" }));
    registry.register(mkStage({ id: "ST-02-RESEARCH" }));

    const result = await orchestrator.run(ctx(), {
      enabledStages: new Set(["ST-01-PLAN"]),
    });

    expect(result.completedStages).toEqual(["ST-01-PLAN"]);
  });

  it("cleanup 在 stage 失败时被调用", async () => {
    const cleanup = jest.fn().mockResolvedValue(undefined);
    registry.register(
      mkStage({
        id: "ST-01-PLAN",
        execute: jest.fn().mockRejectedValue(new Error("boom")),
        cleanup,
      }),
    );

    await expect(orchestrator.run(ctx())).rejects.toThrow("boom");
    expect(cleanup).toHaveBeenCalled();
  });
});
