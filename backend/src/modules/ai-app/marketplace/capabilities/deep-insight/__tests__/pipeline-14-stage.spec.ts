/**
 * deep-insight 14 阶段执行内核 spec（W2）。
 *
 * 验证：
 *   1. runner.run 经 MissionPipelineOrchestrator + recipe 跑真 13 step（s1-budget …
 *      s11-persist），stage:started/completed 序列覆盖全部 recipe stepId。
 *   2. crossStageState 逐级传递（plan → researcherResults → analyst → report …），
 *      终态产出 completed + 报告 + 引用 + 算力。
 *   3. 缺 ctx.persistence → 用内存端口纯跑，0 真实 DB 写（持久化端口探针计数为内存）。
 *   4. telemetry.systemStageId 填 stepId（前端 14-chip 锚点）。
 *   5. reviewVerdict 合成（company 验收 gate 不退化）。
 *
 * 不依赖 NestJS DI：手动构造 MissionPipelineRegistry + MissionPipelineOrchestrator
 * + mock AgentRunner（按 spec id 路由产出）。
 */
import { MissionPipelineRegistry } from "@/modules/ai-harness/facade";
import { MissionPipelineOrchestrator } from "@/modules/ai-harness/facade";
import { CapabilityRegistry } from "../../../capability/capability-registry";
import { DeepInsightDefaultRunner } from "../deep-insight.runner";
import { DEEP_INSIGHT_PIPELINE } from "../recipe/deep-insight.recipe";
import type {
  CapabilityRunContext,
  MissionPersistencePort,
} from "../runner-deps";

/** 据 @DefineAgent id 路由 mock 产出（agentRunner.run(new Spec(), input, opts)）。 */
function makeAgentRunner() {
  const calls: Array<{ agentId: string; input: unknown }> = [];
  const run = jest.fn(async (Spec: { name?: string }, input: unknown) => {
    // runner 传 @DefineAgent 类（非实例）；mock 用类名（小写）路由。
    const agentId = (Spec?.name ?? "unknown").toLowerCase();
    calls.push({ agentId, input });
    const out = routeOutput(agentId, input);
    return {
      output: out,
      state: "completed" as const,
      tokensUsed: { prompt: 1, completion: 1, total: 2 },
      costCents: 1,
    };
  });
  return { run, calls };
}

function routeOutput(agentId: string, input: unknown): unknown {
  const phase = (input as { phase?: string }).phase;
  if (agentId.includes("leader") || phase) {
    if (phase === "plan") {
      return {
        themeSummary: "theme",
        dimensions: [
          { id: "d1", name: "维度一", rationale: "r1" },
          { id: "d2", name: "维度二", rationale: "r2" },
        ],
      };
    }
    if (phase === "assess-research") return { decision: "continue" };
    if (phase === "signoff")
      return { signed: true, leaderOverallScore: 82, verdict: "approve" };
    return {};
  }
  if (agentId.includes("researcher")) {
    const dim = (input as { dimension?: string }).dimension ?? "维度";
    return {
      dimension: dim,
      findings: [
        {
          claim: "c",
          evidence: "e",
          source: `https://${dim}.com`,
          sourceTitle: dim,
        },
      ],
      summary: `summary ${dim}`,
    };
  }
  if (agentId.includes("reconciler"))
    return { reconciliationReport: "rec", factTable: [] };
  if (agentId.includes("analyst"))
    return {
      insights: [
        {
          headline: "i1",
          narrative: "n1",
          supportingDimensions: ["维度一"],
          confidence: 0.8,
        },
      ],
      themeSummary: "theme",
    };
  if (agentId.includes("outline"))
    // MissionOutlinePlannerAgent
    return { chapterOutlines: [], targetWordsPerChapter: {} };
  if (agentId.includes("critic"))
    // MissionCriticAgent
    return { overallVerdict: "pass", rationale: "ok rationale here" };
  if (agentId.includes("reviewer"))
    // MissionReviewerAgent
    return { score: 80, verdict: "approve", notes: ["good"] };
  // SingleShotWriterAgent
  return { title: "报告", sections: [{ heading: "H1", body: "B1" }] };
}

/** 内存持久化探针：记录调用次数，断言无"真实 DB"语义（这里全内存）。 */
class ProbePersistence implements MissionPersistencePort {
  saveCheckpointCount = 0;
  applyTerminalCount = 0;
  lastTerminal: { outcome: string } | null = null;
  private cp = new Map<string, unknown>();

  async markStageProgress(): Promise<void> {}
  async saveCheckpoint(missionId: string, snapshot: unknown): Promise<boolean> {
    this.saveCheckpointCount++;
    this.cp.set(missionId, snapshot);
    return true;
  }
  async loadCheckpoint(): Promise<null> {
    return null;
  }
  async clearCheckpoint(missionId: string): Promise<void> {
    this.cp.delete(missionId);
  }
  async applyTerminalIfRunning(
    _missionId: string,
    outcome: "completed" | "failed" | "cancelled",
  ): Promise<boolean> {
    this.applyTerminalCount++;
    this.lastTerminal = { outcome };
    return true;
  }
}

function makeRunner() {
  const agentRunner = makeAgentRunner();
  const pipelineRegistry = new MissionPipelineRegistry();
  const orchestrator = new MissionPipelineOrchestrator(pipelineRegistry);
  const capabilityRegistry = new CapabilityRegistry();
  const runner = new DeepInsightDefaultRunner(
    agentRunner as never,
    { chat: jest.fn() } as never,
    capabilityRegistry,
    pipelineRegistry,
    orchestrator,
  );
  runner.onModuleInit();
  return { runner, agentRunner, pipelineRegistry, capabilityRegistry };
}

describe("deep-insight 14 阶段执行内核（W2）", () => {
  it("runner 派生 id=deep-insight 注册 13 step（与 playground 私有 id 区分）", () => {
    const { pipelineRegistry } = makeRunner();
    expect(pipelineRegistry.has("deep-insight")).toBe(true);
    expect(DEEP_INSIGHT_PIPELINE.steps).toHaveLength(13);
  });

  it("onModuleInit 注册进 CapabilityRegistry，按 manifest.id 解析", () => {
    const { runner, capabilityRegistry } = makeRunner();
    expect(capabilityRegistry.resolve("deep-insight")).toBe(runner);
    expect(runner.manifest.kind).toBe("workflow");
  });

  it("跑通真 13 step：stage 序列覆盖全部 recipe stepId + telemetry.systemStageId", async () => {
    const { runner } = makeRunner();
    const stageStarted: string[] = [];
    const stageCompleted: string[] = [];
    const systemStageIds = new Set<string>();
    let started = false;
    let completed = false;

    const ctx: CapabilityRunContext = {
      userId: "u1",
      missionId: "m-1",
      onEvent: (e) => {
        if (e.type === "started") started = true;
        if (e.type === "completed") completed = true;
        if (e.type === "stage:started" && e.stepId) stageStarted.push(e.stepId);
        if (e.type === "stage:completed" && e.stepId)
          stageCompleted.push(e.stepId);
        if (e.telemetry?.systemStageId)
          systemStageIds.add(e.telemetry.systemStageId);
      },
    };

    const res = await runner.run(
      { topic: "AI 2026", depth: "standard", language: "zh-CN" },
      ctx,
    );

    expect(started).toBe(true);
    expect(completed).toBe(true);
    expect(res.status).toBe("completed");

    const recipeStepIds = DEEP_INSIGHT_PIPELINE.steps.map((s) => s.id);
    for (const id of recipeStepIds) {
      expect(stageStarted).toContain(id);
      expect(stageCompleted).toContain(id);
      expect(systemStageIds.has(id)).toBe(true);
    }
  });

  it("crossState 逐级传递 → 终态报告 + 引用 + 算力 + reviewVerdict", async () => {
    const { runner } = makeRunner();
    const res = await runner.run(
      { topic: "AI", language: "zh-CN" },
      { userId: "u", missionId: "m-2" },
    );
    expect(res.status).toBe("completed");
    expect(res.report).toContain("# 报告");
    expect(res.report).toContain("## H1");
    // 2 维 researcher → 2 个去重 source
    expect(res.references?.length).toBe(2);
    expect(res.usage?.totalTokens).toBeGreaterThan(0);
    // reviewVerdict 合成（company gate 不退化）
    expect(res.reviewVerdict?.score).toBe(80);
    expect(res.reviewVerdict?.verdict).toBe("approve");
  });

  it("缺 ctx.persistence → 内存纯跑（不抛错、completed）", async () => {
    const { runner } = makeRunner();
    const res = await runner.run(
      { topic: "T", language: "en-US" },
      { userId: "u", missionId: "m-3" },
    );
    expect(res.status).toBe("completed");
  });

  it("注入 persistence 端口 → checkpoint + 终态仲裁经端口（0 app DB，全内存探针）", async () => {
    const { runner } = makeRunner();
    const probe = new ProbePersistence();
    const res = await runner.run(
      { topic: "T", language: "zh-CN" },
      { userId: "u", missionId: "m-4", persistence: probe },
    );
    expect(res.status).toBe("completed");
    // 每 stage 完成存一次 checkpoint（13 step）
    expect(probe.saveCheckpointCount).toBeGreaterThanOrEqual(13);
    expect(probe.applyTerminalCount).toBe(1);
    expect(probe.lastTerminal?.outcome).toBe("completed");
  });

  it("全 researcher 失败 → failed（不伪装成功）", async () => {
    const agentRunner = makeAgentRunner();
    // researcher 全返回 null output（ReActLoop 未 finalize 的真实形态）
    agentRunner.run.mockImplementation(
      async (Spec: { name?: string }, input: unknown) => {
        const id = (Spec?.name ?? "").toLowerCase();
        if (id.includes("researcher")) {
          return {
            output: null,
            state: "completed" as const,
            tokensUsed: { prompt: 0, completion: 0, total: 0 },
            costCents: 0,
          };
        }
        return {
          output: routeOutput(id, input),
          state: "completed" as const,
          tokensUsed: { prompt: 1, completion: 1, total: 2 },
          costCents: 1,
        };
      },
    );
    const pipelineRegistry = new MissionPipelineRegistry();
    const orchestrator = new MissionPipelineOrchestrator(pipelineRegistry);
    const runner = new DeepInsightDefaultRunner(
      agentRunner as never,
      { chat: jest.fn() } as never,
      new CapabilityRegistry(),
      pipelineRegistry,
      orchestrator,
    );
    runner.onModuleInit();
    const res = await runner.run(
      { topic: "T", language: "zh-CN" },
      { userId: "u", missionId: "m-5" },
    );
    expect(res.status).toBe("failed");
  });
});
