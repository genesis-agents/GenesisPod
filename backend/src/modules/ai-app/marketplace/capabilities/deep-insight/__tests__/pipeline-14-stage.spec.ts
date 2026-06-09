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
  lastFinalScore: number | undefined;
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
    details?: { finalScore?: number },
  ): Promise<boolean> {
    this.applyTerminalCount++;
    this.lastTerminal = { outcome };
    if (outcome === "completed") this.lastFinalScore = details?.finalScore;
    return true;
  }
}

/**
 * 富评判 / 富组装 stub（W2.5）。
 *   - assembler：把 writer report → reportArtifact（content.fullMarkdown / sections /
 *     quality.overall），与真服务同形状但纯映射（无 LLM / 无 ReportQualityGate 依赖）。
 *   - selfEval：默认 overallOk=true（不触发补救，保证 s8b 纯通过路径）。
 *   - remediation：skipped。
 *   - reportEvaluation：10 维 overallScore（s9b 客观评分 → finalScore）。
 *   - qualityTrace：createTrace + record* 全 no-op（纯计算探针，单测不验内部）。
 */
function makeRichStubs() {
  const reportArtifactAssembler = {
    assemble: jest.fn(
      (input: {
        writerReport: {
          title?: string;
          sections?: Array<{ heading?: string; body?: string }>;
        };
      }) => {
        const wr = input.writerReport;
        const parts: string[] = [];
        if (wr.title) parts.push(`# ${wr.title}`);
        for (const s of wr.sections ?? []) {
          if (s.heading) parts.push(`## ${s.heading}`);
          if (s.body) parts.push(s.body);
        }
        const fullMarkdown = parts.join("\n\n");
        return {
          title: wr.title,
          content: {
            fullMarkdown,
            fullReportSize: Buffer.byteLength(fullMarkdown, "utf8"),
          },
          sections: (wr.sections ?? []).map((s, i) => ({
            id: `chapter-${i + 1}`,
            title: s.heading ?? "",
            content: s.body ?? "",
            citationIds: [],
            figureIds: [],
          })),
          citations: [],
          figures: [],
          quickView: {},
          factTable: [],
          metadata: {},
          quality: { overall: 75, dimensions: {}, warnings: [] },
        };
      },
    ),
  };
  const sectionSelfEval = {
    evaluateSection: jest.fn(async () => ({
      scores: {
        analytical_depth: 8,
        evidence_coverage: 8,
        actionability: 8,
        writing_quality: 8,
      },
      weakAreas: [],
      overallOk: true,
    })),
    determineRemediationActions: jest.fn(() => []),
  };
  const sectionRemediation = {
    remediate: jest.fn(async (i: { content: string }) => ({
      content: i.content,
      actionsApplied: [],
      skipped: true,
      skipReason: "no_actions_needed",
    })),
  };
  const reportEvaluation = {
    evaluateReport: jest.fn(async () => ({
      chapters: [],
      overallScore: 88,
      grade: "B",
      feedback: "ok",
      modelComparison: [],
      evaluatorModel: "",
      evaluatedAt: new Date().toISOString(),
    })),
  };
  const qualityTrace = {
    createTrace: jest.fn(() => ({ reportId: "x", dimensionOutputs: [] })),
    recordDimensionRemediationLoop: jest.fn(),
  };
  // ★ figure re-home（2026-06-09）：FigureRelevance 精排 stub。
  //   默认 identity（返回全部入参），保证不削弱既有路径；个别用例覆盖断言精排被调。
  const figureRelevance = {
    filterRelevantFigures: jest.fn(
      async (figures: Array<{ imageUrl: string }>) => figures,
    ),
  };
  return {
    reportArtifactAssembler,
    sectionSelfEval,
    sectionRemediation,
    reportEvaluation,
    qualityTrace,
    figureRelevance,
  };
}

function makeRunnerWith(
  agentRunner: ReturnType<typeof makeAgentRunner>,
  rich: ReturnType<typeof makeRichStubs>,
) {
  const pipelineRegistry = new MissionPipelineRegistry();
  const orchestrator = new MissionPipelineOrchestrator(pipelineRegistry);
  const capabilityRegistry = new CapabilityRegistry();
  const runner = new DeepInsightDefaultRunner(
    agentRunner as never,
    { chat: jest.fn() } as never,
    capabilityRegistry,
    pipelineRegistry,
    orchestrator,
    rich.reportArtifactAssembler as never,
    rich.sectionSelfEval as never,
    rich.sectionRemediation as never,
    rich.reportEvaluation as never,
    rich.qualityTrace as never,
    rich.figureRelevance as never,
  );
  runner.onModuleInit();
  return { runner, agentRunner, pipelineRegistry, capabilityRegistry, rich };
}

function makeRunner() {
  return makeRunnerWith(makeAgentRunner(), makeRichStubs());
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
    const { runner } = makeRunnerWith(agentRunner, makeRichStubs());
    const res = await runner.run(
      { topic: "T", language: "zh-CN" },
      { userId: "u", missionId: "m-5" },
    );
    expect(res.status).toBe("failed");
  });

  // ── W2.5 富增强断言（不削弱以上 7 个断言；新增 parity 证据）──────────────────────

  it("s8 富组装：reportArtifactAssembler.assemble 被调，终稿用 artifact.content.fullMarkdown", async () => {
    const rich = makeRichStubs();
    const { runner } = makeRunnerWith(makeAgentRunner(), rich);
    const res = await runner.run(
      { topic: "AI", language: "zh-CN" },
      { userId: "u", missionId: "m-6" },
    );
    expect(res.status).toBe("completed");
    // s8 经 ReportArtifactAssembler 组装（playground 等价的富组装路径）。
    expect(rich.reportArtifactAssembler.assemble).toHaveBeenCalledTimes(1);
    // 终稿来自 artifact.content.fullMarkdown（含 writer sections）。
    expect(res.report).toContain("# 报告");
    expect(res.report).toContain("## H1");
  });

  it("s8b 富补救：长 section 跑 SectionSelfEval；overallOk 时不触发 remediation", async () => {
    const longBody = "x".repeat(400);
    const agentRunner = makeAgentRunner();
    // SingleShotWriterAgent（id 含 "writer"）产出 1 个长 body section（> 200 字触发自评）；
    // 其余角色沿用默认 routeOutput。
    agentRunner.run.mockImplementation(
      async (Spec: { name?: string }, input: unknown) => {
        const id = (Spec?.name ?? "").toLowerCase();
        const out =
          id.includes("writer") && !id.includes("outline")
            ? { title: "报告", sections: [{ heading: "H1", body: longBody }] }
            : routeOutput(id, input);
        return {
          output: out,
          state: "completed" as const,
          tokensUsed: { prompt: 1, completion: 1, total: 2 },
          costCents: 1,
        };
      },
    );
    const rich = makeRichStubs();
    const { runner } = makeRunnerWith(agentRunner, rich);
    const res = await runner.run(
      { topic: "AI", language: "zh-CN" },
      { userId: "u", missionId: "m-7" },
    );
    expect(res.status).toBe("completed");
    // 长 section → 跑 SectionSelfEval（4 维写后自评）。
    expect(rich.sectionSelfEval.evaluateSection).toHaveBeenCalled();
    // overallOk=true（stub）→ 不触发定向补救（fail-open，不退化）。
    expect(rich.sectionRemediation.remediate).not.toHaveBeenCalled();
  });

  it("s9b 富评估：ReportEvaluation.evaluateReport 被调，finalScore 取客观 overallScore", async () => {
    const rich = makeRichStubs();
    const { runner } = makeRunnerWith(makeAgentRunner(), rich);
    const probe = new ProbePersistence();
    const res = await runner.run(
      { topic: "AI", language: "zh-CN" },
      { userId: "u", missionId: "m-8", persistence: probe },
    );
    expect(res.status).toBe("completed");
    expect(rich.reportEvaluation.evaluateReport).toHaveBeenCalledTimes(1);
    // finalScore = 客观 10 维 overallScore（88），而非 reviewVerdict.score（80）。
    expect(probe.lastFinalScore).toBe(88);
  });

  // ── figure re-home 断言（s8 组装前 figureCandidates embedding 相关性精排）──────────

  it("s8 figure 精排：有 figureCandidates 时按维度调 FigureRelevance.filterRelevantFigures", async () => {
    // researcher 产出带 figureCandidates（2 张 photo）；assembler 捕获精排后入参。
    const agentRunner = makeAgentRunner();
    agentRunner.run.mockImplementation(
      async (Spec: { name?: string }, input: unknown) => {
        const id = (Spec?.name ?? "").toLowerCase();
        let out: unknown;
        if (id.includes("researcher")) {
          const dim = (input as { dimension?: string }).dimension ?? "维度";
          out = {
            dimension: dim,
            findings: [
              { claim: "c", evidence: "e", source: `https://${dim}.com` },
            ],
            summary: `summary ${dim}`,
            figureCandidates: [
              {
                sourceUrl: `https://${dim}.com/p`,
                imageUrl: `https://cdn/${dim}-1.png`,
                caption: "相关图：与主题强相关的图表说明文本",
              },
              {
                sourceUrl: `https://${dim}.com/p`,
                imageUrl: `https://cdn/${dim}-2.png`,
                caption: "无关广告 banner 图，应被精排剔除",
              },
            ],
          };
        } else {
          out = routeOutput(id, input);
        }
        return {
          output: out,
          state: "completed" as const,
          tokensUsed: { prompt: 1, completion: 1, total: 2 },
          costCents: 1,
        };
      },
    );
    const rich = makeRichStubs();
    // 精排：只保留 imageUrl 以 "-1" 结尾的（模拟相关图通过、广告图被拒）。
    rich.figureRelevance.filterRelevantFigures.mockImplementation(
      async (figures: Array<{ imageUrl: string }>) =>
        figures.filter((f) => f.imageUrl.endsWith("-1.png")),
    );
    // assembler 捕获 figure 精排后透传的 researcherResults.figureCandidates。
    let assembledFigureUrls: string[] = [];
    rich.reportArtifactAssembler.assemble.mockImplementation(
      (input: {
        writerReport: {
          title?: string;
          sections?: Array<{ heading?: string; body?: string }>;
        };
        researcherResults?: Array<{
          figureCandidates?: Array<{ imageUrl?: string }>;
        }>;
      }) => {
        assembledFigureUrls = (input.researcherResults ?? []).flatMap((r) =>
          (r.figureCandidates ?? [])
            .map((c) => c.imageUrl)
            .filter((u): u is string => typeof u === "string"),
        );
        return {
          title: input.writerReport.title,
          content: { fullMarkdown: "# 报告\n\n## H1\n\nB1", fullReportSize: 1 },
          sections: [],
          citations: [],
          figures: [],
          quickView: {},
          factTable: [],
          metadata: {},
          quality: { overall: 75, dimensions: {}, warnings: [] },
        };
      },
    );
    const { runner } = makeRunnerWith(agentRunner, rich);
    const res = await runner.run(
      { topic: "AI", language: "zh-CN" },
      { userId: "u", missionId: "m-fig-1" },
    );
    expect(res.status).toBe("completed");
    // 2 维 researcher × 各 2 候选 → 精排被调（每维一次）。
    expect(rich.figureRelevance.filterRelevantFigures).toHaveBeenCalled();
    // 精排后只剩 "-1" 候选（广告图被剔除）；组装入参不含 "-2"。
    expect(assembledFigureUrls.length).toBeGreaterThan(0);
    expect(assembledFigureUrls.every((u) => u.endsWith("-1.png"))).toBe(true);
    expect(assembledFigureUrls.some((u) => u.endsWith("-2.png"))).toBe(false);
  });

  it("s8 figure 精排 fail-open：精排抛错不阻断报告（仍 completed，保留原候选）", async () => {
    const agentRunner = makeAgentRunner();
    agentRunner.run.mockImplementation(
      async (Spec: { name?: string }, input: unknown) => {
        const id = (Spec?.name ?? "").toLowerCase();
        let out: unknown;
        if (id.includes("researcher")) {
          const dim = (input as { dimension?: string }).dimension ?? "维度";
          out = {
            dimension: dim,
            findings: [
              { claim: "c", evidence: "e", source: `https://${dim}.com` },
            ],
            summary: `s ${dim}`,
            figureCandidates: [
              {
                sourceUrl: `https://${dim}.com`,
                imageUrl: `https://cdn/${dim}.png`,
                caption: "图说明文本够长用于精排判定",
              },
            ],
          };
        } else {
          out = routeOutput(id, input);
        }
        return {
          output: out,
          state: "completed" as const,
          tokensUsed: { prompt: 1, completion: 1, total: 2 },
          costCents: 1,
        };
      },
    );
    const rich = makeRichStubs();
    rich.figureRelevance.filterRelevantFigures.mockRejectedValue(
      new Error("embedding endpoint 503"),
    );
    const { runner } = makeRunnerWith(agentRunner, rich);
    const res = await runner.run(
      { topic: "AI", language: "zh-CN" },
      { userId: "u", missionId: "m-fig-2" },
    );
    // 精排失败 fail-open：报告仍组装成功（不阻断终态）。
    expect(res.status).toBe("completed");
    expect(rich.figureRelevance.filterRelevantFigures).toHaveBeenCalled();
  });
});
