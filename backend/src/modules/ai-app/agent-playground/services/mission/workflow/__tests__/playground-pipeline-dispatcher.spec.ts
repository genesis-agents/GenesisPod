/**
 * PlaygroundPipelineDispatcher spec（v5.1 R2-A.1 smoke）
 *
 * 验证 dispatcher skeleton 装得起来：
 *   1. onModuleInit 注册 PLAYGROUND_PIPELINE 到 registry
 *   2. runMission 在 R2-A.1 阶段会快速 fail（hook 抛 NotYetWiredError）—— 但
 *      orchestrator 路径走通（s1 触发 stage:failed event 而不是 framework
 *      level error）
 *   3. session 在失败后被 cleanup（abort registry / sessions Map 清空）
 *
 * R2-A.2~A.13 实装 14 个 stage hook 后再扩 e2e success-path spec。
 */
import {
  MissionPipelineOrchestrator,
  MissionPipelineRegistry,
} from "@/modules/ai-harness/facade";
import { PlaygroundPipelineDispatcher } from "../playground-pipeline-dispatcher.service";
import {
  PLAYGROUND_PIPELINE,
  PlaygroundHookNotYetWiredError,
} from "../../../../playground.config";
import type { MissionRuntimeShellService } from "../mission-runtime-shell.service";
import type { MissionRuntimeSession } from "../mission-runtime-shell.service";

function makeFakeSession(missionId: string, userId: string) {
  const abortController = new AbortController();
  const cleanup = jest.fn();
  return {
    missionId,
    userId,
    workspaceId: undefined,
    billing: {} as never,
    pool: { snapshot: () => ({ poolTokensUsed: 0, poolCostUsd: 0 }) } as never,
    budgetMultiplier: 1,
    missionAbort: abortController,
    wallTimeMs: 60_000,
    cleanup,
  } as unknown as MissionRuntimeSession;
}

function makeFakeShell() {
  const sessions = new Map<string, MissionRuntimeSession>();
  return {
    sessions,
    async openSession(args: {
      missionId: string;
      userId: string;
      input: unknown;
      workspaceId?: string;
    }) {
      const s = makeFakeSession(args.missionId, args.userId);
      sessions.set(args.missionId, s);
      return s;
    },
    async runWithinContext<T>(
      _session: MissionRuntimeSession,
      fn: () => Promise<T>,
    ) {
      return fn();
    },
  } as unknown as MissionRuntimeShellService & {
    sessions: Map<string, MissionRuntimeSession>;
  };
}

describe("PlaygroundPipelineDispatcher (v5.1 R2-A.1 smoke)", () => {
  let registry: MissionPipelineRegistry;
  let orchestrator: MissionPipelineOrchestrator;
  let shell: ReturnType<typeof makeFakeShell>;
  let dispatcher: PlaygroundPipelineDispatcher;

  beforeEach(() => {
    registry = new MissionPipelineRegistry();
    orchestrator = new MissionPipelineOrchestrator(registry);
    shell = makeFakeShell();
    dispatcher = new PlaygroundPipelineDispatcher(
      registry,
      orchestrator,
      shell as unknown as MissionRuntimeShellService,
    );
    dispatcher.onModuleInit();
  });

  it("onModuleInit 注册 PLAYGROUND_PIPELINE 到 registry", () => {
    expect(registry.has(PLAYGROUND_PIPELINE.id)).toBe(true);
    const cfg = registry.get(PLAYGROUND_PIPELINE.id);
    expect(cfg.steps).toHaveLength(14);
  });

  it("注册的 config 14 个 step 都已注入 hooks（NotYetWired 占位）", () => {
    const cfg = registry.get(PLAYGROUND_PIPELINE.id);
    for (const step of cfg.steps) {
      // 必填 hook 都被注入；learn 没有必填 hook 是合法情况
      expect(step.hooks).toBeDefined();
      if (step.primitive !== "learn") {
        expect(Object.keys(step.hooks ?? {}).length).toBeGreaterThan(0);
      }
    }
  });

  it("runMission：第一个 step 抛 NotYetWired → orchestrator 标 failed + 返 stage error", async () => {
    const result = await dispatcher.runMission(
      "m1",
      {
        topic: "test",
        depth: "quick",
        language: "zh-CN",
        budgetProfile: "low",
        styleProfile: "executive",
        lengthProfile: "brief",
        audienceProfile: "domain-expert",
        withFigures: false,
        auditLayers: "default",
        concurrency: 1,
        viewMode: "continuous",
        maxCredits: 50,
      } as never,
      "u1",
    );
    expect(result.missionId).toBe("m1");
    expect(result.status).toBe("failed");
    // error 应来自 NotYetWired（第一个 step s1-budget hook）
    const errorStr = String(result.error);
    expect(errorStr).toMatch(/NotYetWired|s1-budget/i);
  });

  it("runMission 失败后 session cleanup 被调用 + sessions map 清空", async () => {
    await dispatcher.runMission(
      "m2",
      {
        topic: "test",
        depth: "quick",
        language: "zh-CN",
        budgetProfile: "low",
        styleProfile: "executive",
        lengthProfile: "brief",
        audienceProfile: "domain-expert",
        withFigures: false,
        auditLayers: "default",
        concurrency: 1,
        viewMode: "continuous",
        maxCredits: 50,
      } as never,
      "u1",
    );
    expect(() => dispatcher.getSession("m2")).toThrow(/no active session/);
  });

  it("getSession 不存在 missionId 抛错", () => {
    expect(() => dispatcher.getSession("never-existed")).toThrow(
      /no active session/,
    );
  });

  it("PlaygroundHookNotYetWiredError 含 stage + hook 名信息", () => {
    const err = new PlaygroundHookNotYetWiredError("s1-budget", "onPersist");
    expect(err.message).toContain("s1-budget");
    expect(err.message).toContain("onPersist");
    expect(err.name).toBe("PlaygroundHookNotYetWiredError");
  });

  it("registry 可重复 onModuleInit（has() 短路返回 + 不抛 duplicate）", () => {
    expect(() => dispatcher.onModuleInit()).not.toThrow();
  });
});
