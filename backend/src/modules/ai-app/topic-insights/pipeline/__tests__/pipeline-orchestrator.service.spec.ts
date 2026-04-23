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
    slo: { p95Ms: 1000, tokenBudget: 0, targetSuccessRate: 0.95 },
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
        execute: jest.fn(() => {
          calls.push("ST-03-WRITE");
          return Promise.resolve({});
        }),
      }),
    );
    registry.register(
      mkStage({
        id: "ST-01-PLAN",
        execute: jest.fn(() => {
          calls.push("ST-01-PLAN");
          return Promise.resolve({});
        }),
      }),
    );
    registry.register(
      mkStage({
        id: "ST-02-RESEARCH",
        dependsOn: ["ST-01-PLAN"],
        execute: jest.fn(() => {
          calls.push("ST-02-RESEARCH");
          return Promise.resolve({});
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
        execute: jest.fn(() => Promise.resolve({})),
        persist: jest.fn(async () => {
          await Promise.resolve(); // ignore
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

  describe("AG-16-MA runtime integration", () => {
    function mkAgentRegistryWithAdjuster(
      decision: "continue" | "extend_budget" | "downgrade_depth" | "abort",
      execSpy?: jest.Mock,
    ) {
      const executeSpec =
        execSpy ??
        jest.fn().mockResolvedValue({
          output: {
            decision,
            reason: "test reason exceeds min length",
            recommendedActions: [],
          },
          state: "completed",
          iterations: 1,
          tokensUsed: 0,
          costUsd: 0,
          model: "stub",
          wallTimeMs: 0,
        });
      return {
        get: jest.fn((id: string) =>
          id === "AG-16-MA" ? { executeSpec } : undefined,
        ),
      } as any;
    }

    it("QGATE 低分 → 咨询 AG-16-MA（一次）", async () => {
      const execSpy = jest.fn().mockResolvedValue({
        output: {
          decision: "continue",
          reason: "score ok but borderline",
          recommendedActions: [],
        },
        state: "completed",
        iterations: 1,
        tokensUsed: 0,
        costUsd: 0,
        model: "stub",
        wallTimeMs: 0,
      });
      const agentRegistry = mkAgentRegistryWithAdjuster("continue", execSpy);
      orchestrator = new PipelineOrchestratorService(
        registry,
        undefined,
        agentRegistry,
      );
      registry.register(
        mkStage({
          id: "ST-08-QGATE",
          execute: jest.fn().mockResolvedValue({
            score: 40,
            needsRemediate: false,
            breakdown: {},
            failedDimensions: [],
            passedDimensions: [],
          }),
        }),
      );

      await orchestrator.run(ctx());
      expect(execSpy).toHaveBeenCalledTimes(1);
      const input = execSpy.mock.calls[0][0];
      expect(input.qualityScore).toBe(40);
    });

    it("decision=abort → abort controller + next run 抛 AbortError", async () => {
      const agentRegistry = mkAgentRegistryWithAdjuster("abort");
      orchestrator = new PipelineOrchestratorService(
        registry,
        undefined,
        agentRegistry,
      );
      registry.register(
        mkStage({
          id: "ST-08-QGATE",
          execute: jest.fn().mockResolvedValue({
            score: 30,
            needsRemediate: false,
            breakdown: {},
            failedDimensions: [],
            passedDimensions: [],
          }),
        }),
      );
      registry.register(
        mkStage({ id: "ST-11-ASM", dependsOn: ["ST-08-QGATE"] }),
      );

      await expect(orchestrator.run(ctx())).rejects.toMatchObject({
        name: "AbortError",
      });
    });

    it("decision=downgrade_depth → 设置 degradationMode 跳过 thoroughOrDeep", async () => {
      const agentRegistry = mkAgentRegistryWithAdjuster("downgrade_depth");
      orchestrator = new PipelineOrchestratorService(
        registry,
        undefined,
        agentRegistry,
      );
      registry.register(
        mkStage({
          id: "ST-08-QGATE",
          execute: jest.fn().mockResolvedValue({
            score: 40,
            needsRemediate: false,
            breakdown: {},
            failedDimensions: [],
            passedDimensions: [],
          }),
        }),
      );
      registry.register(
        mkStage({
          id: "ST-06-COGLOOP",
          runsWhen: "thoroughOrDeep",
          dependsOn: ["ST-08-QGATE"],
        }),
      );

      const result = await orchestrator.run(ctx({ depth: "thorough" }));
      expect(result.skippedStages).toContain("ST-06-COGLOOP");
    });

    it("QGATE 分 >= 阈值 且未降级 → 不咨询", async () => {
      const execSpy = jest.fn();
      const agentRegistry = mkAgentRegistryWithAdjuster("continue", execSpy);
      orchestrator = new PipelineOrchestratorService(
        registry,
        undefined,
        agentRegistry,
      );
      registry.register(
        mkStage({
          id: "ST-08-QGATE",
          execute: jest.fn().mockResolvedValue({
            score: 85,
            needsRemediate: false,
            breakdown: {},
            failedDimensions: [],
            passedDimensions: [],
          }),
        }),
      );
      await orchestrator.run(ctx());
      expect(execSpy).not.toHaveBeenCalled();
    });

    it("AG-16-MA 运行失败 → 吞异常继续", async () => {
      const execSpy = jest.fn().mockRejectedValue(new Error("adjuster down"));
      const agentRegistry = mkAgentRegistryWithAdjuster("continue", execSpy);
      orchestrator = new PipelineOrchestratorService(
        registry,
        undefined,
        agentRegistry,
      );
      registry.register(
        mkStage({
          id: "ST-08-QGATE",
          execute: jest.fn().mockResolvedValue({
            score: 30,
            needsRemediate: false,
            breakdown: {},
            failedDimensions: [],
            passedDimensions: [],
          }),
        }),
      );
      const result = await orchestrator.run(ctx());
      expect(result.completedStages).toContain("ST-08-QGATE");
    });

    it("无 agentRegistry → 不咨询（向后兼容）", async () => {
      // 默认 orchestrator (beforeEach) 没注入 agentRegistry
      registry.register(
        mkStage({
          id: "ST-08-QGATE",
          execute: jest.fn().mockResolvedValue({
            score: 30,
            needsRemediate: false,
            breakdown: {},
            failedDimensions: [],
            passedDimensions: [],
          }),
        }),
      );
      await expect(orchestrator.run(ctx())).resolves.toBeDefined();
    });
  });
});
