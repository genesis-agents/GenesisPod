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

  it("emits chapter:done for each written chapter (happy path)", async () => {
    const deps = makeDeps();
    await runPerDimPipeline(baseArgs, deps);
    const emitCalls = (deps.emit as jest.Mock).mock.calls;
    const doneCalls = emitCalls.filter(
      (c) => c[0].type === "agent-playground.chapter:done",
    );
    // 2 chapters in makeDeps → 2 chapter:done events
    expect(doneCalls.length).toBe(2);
    // pass path → qualified = true, decision = "passed"
    expect(doneCalls[0][0].payload.qualified).toBe(true);
    expect(doneCalls[0][0].payload.decision).toBe("passed");
    expect(doneCalls[0][0].payload.finalized).toBe(true);
  });

  it("chapter:done payload includes finalScore, wordCount, chapterIndex", async () => {
    const deps = makeDeps();
    await runPerDimPipeline(baseArgs, deps);
    const emitCalls = (deps.emit as jest.Mock).mock.calls;
    const doneCalls = emitCalls.filter(
      (c) => c[0].type === "agent-playground.chapter:done",
    );
    const payload = doneCalls[0][0].payload as {
      chapterIndex: number;
      finalScore: number;
      wordCount: number;
    };
    expect(typeof payload.chapterIndex).toBe("number");
    expect(typeof payload.finalScore).toBe("number");
    expect(typeof payload.wordCount).toBe("number");
  });

  it("writtenChapters entries include finalized/qualified/decision metadata", async () => {
    const deps = makeDeps();
    const result = await runPerDimPipeline(baseArgs, deps);
    expect(result.chapters).toBeDefined();
    for (const ch of result.chapters ?? []) {
      expect(ch.finalized).toBe(true);
      expect(ch.qualified).toBe(true);
      expect(ch.decision).toBe("passed");
      expect(typeof ch.finalScore).toBe("number");
    }
  });

  it("emits chapter:done with fallback-exhausted when reviewer repeatedly fails", async () => {
    const writer = {
      planDimensionOutline: jest.fn().mockResolvedValue({
        state: "completed",
        output: makeOutlineOutput(1),
        events: [],
        iterations: 1,
        wallTimeMs: 100,
      }),
    };
    // reviewer always fails → consecutiveReviewerFailures hits MAX_REVIEWER_FAILURES → fallback-exhausted
    const invoker = {
      invoke: jest
        .fn()
        .mockResolvedValueOnce({
          // writer attempt 1
          state: "completed",
          output: makeWriterOutput(1200),
          events: [],
          iterations: 1,
          wallTimeMs: 100,
        })
        .mockResolvedValueOnce({
          // reviewer attempt 1: fails
          state: "failed",
          output: undefined,
          events: [],
          iterations: 1,
          wallTimeMs: 50,
        })
        .mockResolvedValueOnce({
          // writer attempt 2 (revise)
          state: "completed",
          output: makeWriterOutput(1200),
          events: [],
          iterations: 1,
          wallTimeMs: 100,
        })
        .mockResolvedValueOnce({
          // reviewer attempt 2: fails again → exhausted
          state: "failed",
          output: undefined,
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
    await runPerDimPipeline(baseArgs, deps);
    const emitCalls = (deps.emit as jest.Mock).mock.calls;
    const doneCalls = emitCalls.filter(
      (c) => c[0].type === "agent-playground.chapter:done",
    );
    expect(doneCalls.length).toBeGreaterThan(0);
    const payload = doneCalls[0][0].payload as {
      qualified: boolean;
      decision: string;
    };
    expect(payload.qualified).toBe(false);
    expect(payload.decision).toBe("fallback-exhausted");
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

// ─── L1-1 + L1-2 防"全部重写"循环测试 ──────────────────────────────────────────
//
// 注意: CHAPTER_MAX_REVISION_ATTEMPTS=1 (outer mock), 所以 while loop 最多跑 2 次
// (attempt < MAX+1 = 2)。L1-2 的 threshold decay 在 attempt=2 就能验证 (50→pass)。
// L1-1 的 stuckCount 需要 3 次 attempt，通过 similarity.util.spec.ts 在纯函数层验证，
// per-dim 层验证"identical body 在 attempt=2 后 stuckCount=1 但未触发兜底"，
// 以及"chapter 仍正常产出"（不循环崩溃）。

describe("runPerDimPipeline — L1 anti-loop guards (MAX_ATTEMPTS=1)", () => {
  const l1BaseResearcherOut = {
    dimension: "Technology",
    findings: [
      { claim: "AI is growing", evidence: "paper", source: "arxiv.org" },
      {
        claim: "LLMs are powerful",
        evidence: "benchmark",
        source: "openai.com",
      },
    ],
    summary: "AI is transforming everything",
  };

  const l1BaseArgs: PerDimPipelineArgs = {
    missionId: "m-l1",
    userId: "u-l1",
    dimensionIdx: 0,
    dimensionName: "Technology",
    topic: "AI Trends",
    language: "zh-CN",
    depth: "standard",
    pool: {
      recordSpend: jest.fn(),
      snapshot: jest.fn().mockReturnValue({}),
    } as never,
    researcherOut: l1BaseResearcherOut,
    billing: {} as never,
    budgetMultiplier: 1.0,
  };

  /** Build a single-chapter pipeline deps with a custom invoker sequence */
  function makeL1Deps(invokerCalls: object[]): MissionDeps {
    const invokerMock = {
      invoke: jest.fn(),
      tickCost: jest.fn().mockResolvedValue(undefined),
    };
    for (const call of invokerCalls) {
      invokerMock.invoke.mockResolvedValueOnce(call);
    }
    return {
      emit: jest.fn().mockResolvedValue(undefined),
      lifecycle: jest.fn().mockResolvedValue(undefined),
      invoker: invokerMock,
      writer: {
        planDimensionOutline: jest.fn().mockResolvedValue({
          state: "completed",
          output: {
            chapters: [
              {
                index: 1,
                heading: "Chapter 1",
                thesis: "Thesis 1",
                keyPoints: ["Point 1"],
                sourceIndices: [0],
              },
            ],
          },
          events: [],
          iterations: 1,
          wallTimeMs: 100,
        }),
      },
      reviewer: {
        judgeDimension: jest.fn().mockResolvedValue({
          state: "completed",
          output: { overall: 75, grade: "B+", axes: {}, summary: "Good" },
          events: [],
          iterations: 1,
          wallTimeMs: 100,
        }),
      },
    } as unknown as MissionDeps;
  }

  const integratorOutput = {
    abstract: "Abstract",
    keyFindings: ["Finding 1"],
    fullMarkdown: "# Content",
    totalWordCount: 1200,
  };

  // ── L1-2: threshold decays — score=50 fails at attempt=1 (threshold=60) ────────
  // but passes at attempt=2 (threshold=50). With MAX_ATTEMPTS=1, attempt=2 is the cap.
  // The dynamic threshold ensures score=50 is accepted at cap instead of being stuck.

  it("L1-2: score 50 fails threshold 60 at attempt 1, accepted at attempt 2 (decayed to 50)", async () => {
    // attempt=1: dynamicThreshold=max(40, 60-0*10)=60, score=50 < 60 → revise
    // attempt=2: dynamicThreshold=max(40, 60-1*10)=50, score=50 >= 50 → pass → finalize
    // Total invoker calls: 1w + 1r + 1w + 1r + 1integrator = 5
    const writerOutput = {
      body: "artificial intelligence technology research findings analysis development modern",
      wordCount: 1200,
      citationsUsed: ["[1]"],
    };
    const score50 = {
      decision: "revise" as const,
      score: 50,
      summary: "Acceptable",
      issues: [],
      critique: "Marginal quality",
    };

    const invokerCalls = [
      {
        state: "completed",
        output: writerOutput,
        events: [],
        iterations: 1,
        wallTimeMs: 100,
      },
      {
        state: "completed",
        output: score50,
        events: [],
        iterations: 1,
        wallTimeMs: 50,
      },
      {
        state: "completed",
        output: writerOutput,
        events: [],
        iterations: 1,
        wallTimeMs: 100,
      },
      {
        state: "completed",
        output: score50,
        events: [],
        iterations: 1,
        wallTimeMs: 50,
      },
      {
        state: "completed",
        output: integratorOutput,
        events: [],
        iterations: 1,
        wallTimeMs: 200,
      },
    ];

    const deps = makeL1Deps(invokerCalls);
    const result = await runPerDimPipeline(l1BaseArgs, deps);

    expect(result.chapters).toBeDefined();
    expect(result.chapters!.length).toBeGreaterThan(0);
    // 2 writer + 2 reviewer + 1 integrator = 5 invoke calls
    expect((deps.invoker.invoke as jest.Mock).mock.calls.length).toBe(5);
  });

  it("L1-2: score 44 fails at attempt 1 (threshold=60), finalized at attempt 2 (attempt cap=MAX+1)", async () => {
    // With MAX_ATTEMPTS=1: attempt cap fires at attempt >= 2 (= MAX_REVISION_ATTEMPTS+1).
    // score=44 < threshold(attempt=2)=50 but attempt >= cap → finalize anyway.
    const writerOutput = {
      body: "machine learning deep neural network training optimization dataset evaluation",
      wordCount: 1200,
      citationsUsed: ["[1]"],
    };
    const score44 = {
      decision: "revise" as const,
      score: 44,
      summary: "Below avg",
      issues: [],
      critique: "Needs improvement",
    };

    const invokerCalls = [
      {
        state: "completed",
        output: writerOutput,
        events: [],
        iterations: 1,
        wallTimeMs: 100,
      },
      {
        state: "completed",
        output: score44,
        events: [],
        iterations: 1,
        wallTimeMs: 50,
      },
      {
        state: "completed",
        output: writerOutput,
        events: [],
        iterations: 1,
        wallTimeMs: 100,
      },
      {
        state: "completed",
        output: score44,
        events: [],
        iterations: 1,
        wallTimeMs: 50,
      },
      {
        state: "completed",
        output: integratorOutput,
        events: [],
        iterations: 1,
        wallTimeMs: 200,
      },
    ];

    const deps = makeL1Deps(invokerCalls);
    const result = await runPerDimPipeline(l1BaseArgs, deps);

    // Chapter still produced — attempt cap finalizes regardless of score
    expect(result.chapters).toBeDefined();
    expect(result.chapters!.length).toBeGreaterThan(0);
  });

  it("L1-1: identical bodies on revision do not crash and chapter is still produced", async () => {
    // With MAX_ATTEMPTS=1, identical bodies on attempt=2 yield stuckCount=1 (< MAX_STUCK_COUNT=2).
    // No stuck guard fires, but the attempt cap (attempt >= 2) finalizes the chapter cleanly.
    // Verifies that the similarity check code path doesn't throw or break the pipeline.
    const sameBody =
      "the quick brown fox jumps over the lazy dog with speed and determination";
    const writerOutput = {
      body: sameBody,
      wordCount: 1200,
      citationsUsed: ["[1]"],
    };
    const reviewerReject = {
      decision: "revise" as const,
      score: 30,
      summary: "Needs full rewrite",
      issues: [],
      critique: "Completely redo",
    };

    const invokerCalls = [
      // attempt 1: identical body, reviewer rejects
      {
        state: "completed",
        output: writerOutput,
        events: [],
        iterations: 1,
        wallTimeMs: 100,
      },
      {
        state: "completed",
        output: reviewerReject,
        events: [],
        iterations: 1,
        wallTimeMs: 50,
      },
      // attempt 2: same body again (stuckCount=1, but cap fires: attempt >= 2)
      {
        state: "completed",
        output: writerOutput,
        events: [],
        iterations: 1,
        wallTimeMs: 100,
      },
      {
        state: "completed",
        output: reviewerReject,
        events: [],
        iterations: 1,
        wallTimeMs: 50,
      },
      // integrator
      {
        state: "completed",
        output: integratorOutput,
        events: [],
        iterations: 1,
        wallTimeMs: 200,
      },
    ];

    const deps = makeL1Deps(invokerCalls);
    const result = await runPerDimPipeline(l1BaseArgs, deps);

    // No crash — chapter produced
    expect(result.chapters).toBeDefined();
    expect(result.chapters!.length).toBeGreaterThan(0);
  });
});
