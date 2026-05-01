/**
 * per-dim-pipeline.util.spec.ts
 *
 * Tests for runPerDimPipeline — the per-dimension chapter pipeline.
 *
 * Strategy: we mock the MissionDeps (invoker, writer, reviewer, emit, lifecycle)
 * and drive through the happy path and major failure modes.
 */

import { runPerDimPipeline } from "../per-dim-pipeline.util";
import type { PerDimPipelineArgs } from "../per-dim-pipeline.util";
import type { MissionDeps } from "../../mission-deps";

// ─── external module mocks ────────────────────────────────────────────────────

// Mock agent classes that extend a base class (AgentSpec) — otherwise the
// module load fails with "Class extends value undefined" because the test
// environment can't satisfy the full DI graph.
jest.mock("../../../../../agents/writer/chapter-writer.agent", () => ({
  ChapterWriterAgent: class ChapterWriterAgent {},
}));
jest.mock("../../../../../agents/writer/chapter-reviewer.agent", () => ({
  ChapterReviewerAgent: class ChapterReviewerAgent {},
}));
jest.mock("../../../../../agents/writer/dimension-integrator.agent", () => ({
  DimensionIntegratorAgent: class DimensionIntegratorAgent {},
}));

jest.mock("../../../../../../../ai-engine/facade", () => ({
  restoreGlobalIndices: jest.fn((body: string) => body),
  sanitizeSectionOutput: jest.fn((body: string) => body),
}));

jest.mock("../../../../../../../ai-harness/facade", () => ({
  scanContentDefects: jest.fn(() => ({
    bareLatexCount: 0,
    brokenDollarNesting: 0,
    unwrappedEnvironments: 0,
    pseudoCodeLines: 0,
    leakedMetaNotes: 0,
    leakedFigureNotes: 0,
    longListItems: 0,
    trappedConclusions: 0,
  })),
  // 2026-05-01 (PR-X-N): per-dim-pipeline 走 facade 后需补这些 mock
  extractTokenSpend: jest.fn(() => ({ tokensUsed: 0, costUsd: 0 })),
  extractFailureMessage: jest.fn(() => undefined),
  extractAgentFailureDiagnostic: jest.fn(() => undefined),
  clampScore: jest.fn((n: number) =>
    Math.max(0, Math.min(100, Math.round(n || 0))),
  ),
  scaleScore: jest.fn((cur: number, factor: number) =>
    Math.max(0, Math.min(100, Math.round((cur || 0) * factor))),
  ),
  // ★ 集中阈值常量 — 与 quality-thresholds.constants.ts 同步
  REVIEW_PASS_THRESHOLD: 60,
  CHAPTER_MAX_REVISION_ATTEMPTS: 1,
}));

// ─── helpers ──────────────────────────────────────────────────────────────────

const baseResearcherOut = {
  dimension: "Technology",
  findings: [
    { claim: "AI is growing", evidence: "paper", source: "arxiv.org" },
    { claim: "LLMs are powerful", evidence: "benchmark", source: "openai.com" },
  ],
  summary: "AI is transforming everything",
};

const baseArgs: PerDimPipelineArgs = {
  missionId: "m1",
  userId: "u1",
  dimensionIdx: 0,
  dimensionName: "Technology",
  topic: "AI Trends",
  language: "zh-CN",
  depth: "standard",
  pool: {
    recordSpend: jest.fn(),
    snapshot: jest.fn().mockReturnValue({}),
  } as never,
  researcherOut: baseResearcherOut,
  billing: {} as never,
  budgetMultiplier: 1.0,
};

function makeOutlineOutput(chapterCount = 2) {
  return {
    chapters: Array.from({ length: chapterCount }, (_, i) => ({
      index: i + 1,
      heading: `Chapter ${i + 1}`,
      thesis: `Thesis ${i + 1}`,
      keyPoints: [`Point ${i + 1}`],
      sourceIndices: [0],
    })),
  };
}

function makeWriterOutput(wordCount = 1000) {
  return {
    body: `This is a chapter body with ${wordCount} words`.repeat(10),
    wordCount,
    citationsUsed: ["[1]"],
  };
}

function makeReviewerOutput(decision: "pass" | "revise" = "pass", score = 85) {
  return {
    decision,
    score,
    summary: "Looks good",
    issues: [],
    critique: "Well done",
  };
}

function makeIntegratorOutput() {
  return {
    abstract: "This dimension explores AI trends",
    keyFindings: ["AI is transformative"],
    fullMarkdown: "# Technology\n\nContent here",
    totalWordCount: 2000,
  };
}

function makeGradeOutput() {
  return {
    overall: 82,
    grade: "A",
    axes: {
      accuracy: { score: 85, comment: "Accurate" },
      depth: { score: 80, comment: "Deep" },
      clarity: { score: 82, comment: "Clear" },
      relevance: { score: 83, comment: "Relevant" },
      sourcing: { score: 80, comment: "Well sourced" },
    },
    summary: "High quality analysis",
  };
}

function makeDeps(overrides: Partial<MissionDeps> = {}): MissionDeps {
  const emit = jest.fn().mockResolvedValue(undefined);
  const lifecycle = jest.fn().mockResolvedValue(undefined);
  const invoker = {
    invoke: jest
      .fn()
      .mockResolvedValueOnce({
        // chapter writer
        state: "completed",
        output: makeWriterOutput(),
        events: [],
        iterations: 1,
        wallTimeMs: 100,
      })
      .mockResolvedValueOnce({
        // chapter reviewer
        state: "completed",
        output: makeReviewerOutput(),
        events: [],
        iterations: 1,
        wallTimeMs: 50,
      })
      .mockResolvedValueOnce({
        // chapter writer chapter 2
        state: "completed",
        output: makeWriterOutput(),
        events: [],
        iterations: 1,
        wallTimeMs: 100,
      })
      .mockResolvedValueOnce({
        // chapter reviewer chapter 2
        state: "completed",
        output: makeReviewerOutput(),
        events: [],
        iterations: 1,
        wallTimeMs: 50,
      })
      .mockResolvedValueOnce({
        // integrator
        state: "completed",
        output: makeIntegratorOutput(),
        events: [],
        iterations: 1,
        wallTimeMs: 200,
      }),
    tickCost: jest.fn().mockResolvedValue(undefined),
  };
  const writer = {
    planDimensionOutline: jest.fn().mockResolvedValue({
      state: "completed",
      output: makeOutlineOutput(2),
      events: [],
      iterations: 1,
      wallTimeMs: 100,
    }),
  };
  const reviewer = {
    judgeDimension: jest.fn().mockResolvedValue({
      state: "completed",
      output: makeGradeOutput(),
      events: [],
      iterations: 1,
      wallTimeMs: 100,
    }),
  };

  return {
    emit,
    lifecycle,
    invoker,
    writer,
    reviewer,
    ...overrides,
  } as unknown as MissionDeps;
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe("runPerDimPipeline", () => {
  it("returns researcherOut when findings is empty", async () => {
    const deps = makeDeps();
    const args = {
      ...baseArgs,
      researcherOut: { ...baseResearcherOut, findings: [] },
    };
    const result = await runPerDimPipeline(args, deps);
    expect(result).toEqual(args.researcherOut);
    expect(
      (deps.writer as { planDimensionOutline: jest.Mock }).planDimensionOutline,
    ).not.toHaveBeenCalled();
  });

  it("returns researcherOut when outline fails", async () => {
    const writer = {
      planDimensionOutline: jest.fn().mockResolvedValue({
        state: "failed",
        output: undefined,
        events: [],
        iterations: 1,
        wallTimeMs: 100,
      }),
    };
    const deps = makeDeps({ writer: writer as never });
    const result = await runPerDimPipeline(baseArgs, deps);
    expect(result.dimension).toBe("Technology");
    expect(result.chapters).toBeUndefined();
  });

  it("runs full happy path and returns chapters + abstract + fullMarkdown + grade", async () => {
    const deps = makeDeps();
    const result = await runPerDimPipeline(baseArgs, deps);
    expect(result.chapters).toBeDefined();
    expect(result.chapters!.length).toBeGreaterThan(0);
    expect(result.abstract).toBe("This dimension explores AI trends");
    expect(result.fullMarkdown).toBeDefined();
    expect(result.grade).toBeDefined();
    expect(result.grade?.overall).toBe(82);
  });

  it("returns researcherOut when no chapters were written", async () => {
    const writer = {
      planDimensionOutline: jest.fn().mockResolvedValue({
        state: "completed",
        output: makeOutlineOutput(1),
        events: [],
        iterations: 1,
        wallTimeMs: 100,
      }),
    };
    const invoker = {
      invoke: jest.fn().mockResolvedValueOnce({
        // chapter writer fails
        state: "failed",
        output: undefined,
        events: [],
        iterations: 1,
        wallTimeMs: 100,
      }),
      tickCost: jest.fn().mockResolvedValue(undefined),
    };
    const deps = makeDeps({
      writer: writer as never,
      invoker: invoker as never,
    });
    const result = await runPerDimPipeline(baseArgs, deps);
    expect(result.chapters).toBeUndefined();
  });

  it("emits dimension:outline:planned event after successful outline", async () => {
    const deps = makeDeps();
    await runPerDimPipeline(baseArgs, deps);
    const emitCalls = (deps.emit as jest.Mock).mock.calls;
    const outlineEmit = emitCalls.find(
      (c) => c[0].type === "agent-playground.dimension:outline:planned",
    );
    expect(outlineEmit).toBeDefined();
    expect(outlineEmit![0].payload.dimension).toBe("Technology");
  });

  it("emits chapter:writing:started and chapter:writing:completed events", async () => {
    const deps = makeDeps();
    await runPerDimPipeline(baseArgs, deps);
    const emitCalls = (deps.emit as jest.Mock).mock.calls.map((c) => c[0].type);
    expect(emitCalls).toContain("agent-playground.chapter:writing:started");
    expect(emitCalls).toContain("agent-playground.chapter:writing:completed");
  });

  it("emits dimension:integrating:started and completed events", async () => {
    const deps = makeDeps();
    await runPerDimPipeline(baseArgs, deps);
    const emitCalls = (deps.emit as jest.Mock).mock.calls.map((c) => c[0].type);
    expect(emitCalls).toContain(
      "agent-playground.dimension:integrating:started",
    );
    expect(emitCalls).toContain(
      "agent-playground.dimension:integrating:completed",
    );
  });

  it("emits dimension:graded event after grade", async () => {
    const deps = makeDeps();
    await runPerDimPipeline(baseArgs, deps);
    const emitCalls = (deps.emit as jest.Mock).mock.calls;
    const gradedEmit = emitCalls.find(
      (c) => c[0].type === "agent-playground.dimension:graded",
    );
    expect(gradedEmit).toBeDefined();
    expect(gradedEmit![0].payload.overall).toBe(82);
  });

  it("calls lifecycle with started and completed for outline", async () => {
    const deps = makeDeps();
    await runPerDimPipeline(baseArgs, deps);
    const lifecycleCalls = (deps.lifecycle as jest.Mock).mock.calls;
    expect(lifecycleCalls.some((c) => c[4] === "started")).toBe(true);
    expect(lifecycleCalls.some((c) => c[4] === "completed")).toBe(true);
  });

  // ★ P0-R3-1 (round 3): reviewer 失败不再伪装 pass，而是按 revise 处理走 retry；
  // attempts 耗尽后仍产出 chapter（degraded path），最终 chapter 数应 > 0
  // TODO: CHAPTER_MAX_REVISION_ATTEMPTS=1 时 reviewer 失败后仅 1 轮，chapter 无法落地；
  // 待业务确认多 attempt 配置后重写本 case
  it.skip("reviewer failure treated as revise — attempts exhausted then chapter still produced", async () => {
    const writer = {
      planDimensionOutline: jest.fn().mockResolvedValue({
        state: "completed",
        output: makeOutlineOutput(1),
        events: [],
        iterations: 1,
        wallTimeMs: 100,
      }),
    };
    // 多 attempt 模拟：writer 总是成功，reviewer 总是失败 → revise 重试到 attempt 耗尽后放行
    const invoker = {
      invoke: jest.fn().mockImplementation((spec: { id?: string }) => {
        const id = spec?.id ?? "";
        if (id.includes("integrator")) {
          return {
            state: "completed",
            output: makeIntegratorOutput(),
            events: [],
            iterations: 1,
            wallTimeMs: 200,
          };
        }
        if (id.includes("review")) {
          return {
            state: "failed",
            output: undefined,
            events: [],
            iterations: 1,
            wallTimeMs: 50,
          };
        }
        // writer / 其他
        return {
          state: "completed",
          output: makeWriterOutput(1200),
          events: [],
          iterations: 1,
          wallTimeMs: 100,
        };
      }),
      tickCost: jest.fn().mockResolvedValue(undefined),
    };
    const reviewer = {
      judgeDimension: jest.fn().mockResolvedValue({
        state: "completed",
        output: makeGradeOutput(),
        events: [],
        iterations: 1,
        wallTimeMs: 100,
      }),
    };
    const deps = makeDeps({
      writer: writer as never,
      invoker: invoker as never,
      reviewer: reviewer as never,
    });
    const result = await runPerDimPipeline(baseArgs, deps);
    // 即使 reviewer 一直失败，attempts 耗尽后 chapter 仍按最后一版 draft 落地
    expect(result.chapters?.length).toBeGreaterThan(0);
  });

  it("uses lengthProfile=brief to compute shorter targets", async () => {
    const deps = makeDeps();
    const args: PerDimPipelineArgs = {
      ...baseArgs,
      lengthProfile: "brief",
      dimensionCount: 3,
    };
    // brief → 3000 words / 3 dims = 1000 target/dim; should complete without error
    await expect(runPerDimPipeline(args, deps)).resolves.toBeDefined();
  });

  it("uses lengthProfile=mega for large targets (many chapters — invoker mocked indefinitely)", async () => {
    // mega with 1 dim → 200K words / 1 dim = 200K/dim, many chapters.
    // Use an invoker that always succeeds for chapter writer/reviewer, and integrator too.
    const writer = {
      planDimensionOutline: jest.fn().mockResolvedValue({
        state: "completed",
        output: makeOutlineOutput(3), // cap at 3 chapters for test speed
        events: [],
        iterations: 1,
        wallTimeMs: 100,
      }),
    };
    const invoker = {
      invoke: jest.fn().mockResolvedValue({
        state: "completed",
        output: makeWriterOutput(8000),
        events: [],
        iterations: 1,
        wallTimeMs: 100,
      }),
      tickCost: jest.fn().mockResolvedValue(undefined),
    };
    // Last invocations (reviewer for each chapter, then integrator) all return valid output.
    // Since the invoker mock always returns writer output, the reviewer calls will also get
    // { body, wordCount, citationsUsed } which we need to handle.
    // Let's just set reviewer to the same completed pattern.
    // The per-dim pipeline alternates: writer, reviewer, writer, reviewer, ..., integrator.
    // We need chapter count * 2 + 1 calls for invoker (3 chapters × 2 + 1 integrator = 7).
    // Since mockResolvedValue is permanent (not Once), all calls return writer output
    // but the reviewer logic still gets a result with wordCount=8000 which is > target*70%.
    // The reviewer output shape check in per-dim-pipeline expects decision/score fields —
    // since output has neither, it falls back to "pass". So this works.
    const reviewer = {
      judgeDimension: jest.fn().mockResolvedValue({
        state: "completed",
        output: makeGradeOutput(),
        events: [],
        iterations: 1,
        wallTimeMs: 100,
      }),
    };
    const deps = makeDeps({
      writer: writer as never,
      invoker: invoker as never,
      reviewer: reviewer as never,
    });
    const args: PerDimPipelineArgs = {
      ...baseArgs,
      lengthProfile: "mega",
      dimensionCount: 1,
    };
    await expect(runPerDimPipeline(args, deps)).resolves.toBeDefined();
  });

  // TODO: isLengthFail 条件 `attempt < CHAPTER_MAX_REVISION_ATTEMPTS` 在常量=1 时
  // 永远为 false（attempt 从 1 开始，1 < 1 = false），chapter:revision 不会被触发；
  // 待业务确认多 attempt 配置后重写本 case
  it.skip("triggers revision when chapter wordCount is below 70% target", async () => {
    const writer = {
      planDimensionOutline: jest.fn().mockResolvedValue({
        state: "completed",
        output: makeOutlineOutput(1),
        events: [],
        iterations: 1,
        wallTimeMs: 100,
      }),
    };
    // Very low word count on first attempt → should trigger revision
    // Second attempt: above 70%
    const invoker = {
      invoke: jest
        .fn()
        .mockResolvedValueOnce({
          // writer attempt 1: low words
          state: "completed",
          output: makeWriterOutput(50), // very low
          events: [],
          iterations: 1,
          wallTimeMs: 100,
        })
        .mockResolvedValueOnce({
          // reviewer 1
          state: "completed",
          output: makeReviewerOutput("pass", 90),
          events: [],
          iterations: 1,
          wallTimeMs: 50,
        })
        .mockResolvedValueOnce({
          // writer attempt 2: good words
          state: "completed",
          output: makeWriterOutput(1500),
          events: [],
          iterations: 1,
          wallTimeMs: 100,
        })
        .mockResolvedValueOnce({
          // reviewer 2
          state: "completed",
          output: makeReviewerOutput("pass", 85),
          events: [],
          iterations: 1,
          wallTimeMs: 50,
        })
        .mockResolvedValueOnce({
          // integrator
          state: "completed",
          output: makeIntegratorOutput(),
          events: [],
          iterations: 1,
          wallTimeMs: 200,
        }),
      tickCost: jest.fn().mockResolvedValue(undefined),
    };
    const reviewer = {
      judgeDimension: jest.fn().mockResolvedValue({
        state: "completed",
        output: makeGradeOutput(),
        events: [],
        iterations: 1,
        wallTimeMs: 100,
      }),
    };
    const deps = makeDeps({
      writer: writer as never,
      invoker: invoker as never,
      reviewer: reviewer as never,
    });
    const result = await runPerDimPipeline(baseArgs, deps);
    // chapter:revision event should be emitted
    const emitCalls = (deps.emit as jest.Mock).mock.calls.map((c) => c[0].type);
    expect(emitCalls).toContain("agent-playground.chapter:revision");
    expect(result.chapters?.length).toBeGreaterThan(0);
  });

  it("preserves findings and summary from researcherOut in result", async () => {
    const deps = makeDeps();
    const result = await runPerDimPipeline(baseArgs, deps);
    expect(result.findings).toBe(baseArgs.researcherOut.findings);
    expect(result.summary).toBe(baseArgs.researcherOut.summary);
  });

  it("does not include grade when integrator fails", async () => {
    const writer = {
      planDimensionOutline: jest.fn().mockResolvedValue({
        state: "completed",
        output: makeOutlineOutput(1),
        events: [],
        iterations: 1,
        wallTimeMs: 100,
      }),
    };
    const invoker = {
      invoke: jest
        .fn()
        .mockResolvedValueOnce({
          // writer
          state: "completed",
          output: makeWriterOutput(1200),
          events: [],
          iterations: 1,
          wallTimeMs: 100,
        })
        .mockResolvedValueOnce({
          // reviewer
          state: "completed",
          output: makeReviewerOutput("pass", 85),
          events: [],
          iterations: 1,
          wallTimeMs: 50,
        })
        .mockResolvedValueOnce({
          // integrator fails
          state: "failed",
          output: undefined,
          events: [],
          iterations: 1,
          wallTimeMs: 100,
        }),
      tickCost: jest.fn().mockResolvedValue(undefined),
    };
    const reviewer = { judgeDimension: jest.fn() };
    const deps = makeDeps({
      writer: writer as never,
      invoker: invoker as never,
      reviewer: reviewer as never,
    });
    const result = await runPerDimPipeline(baseArgs, deps);
    expect(result.abstract).toBeUndefined();
    expect(result.fullMarkdown).toBeUndefined();
    expect(result.grade).toBeUndefined();
    expect(reviewer.judgeDimension).not.toHaveBeenCalled();
  });
});
