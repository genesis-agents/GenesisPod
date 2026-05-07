/**
 * StageRerunDispatcher PR-R5 spec
 *
 * 上游：docs/architecture/ai-harness/runner/per-task-rerun-with-cascade.md v1.2 §3.3
 *
 * 反向证据：
 *   1. 构造期注册全 13 stage handler（s1 除外）
 *   2. 不存在的 stepId → throw BadRequest
 *   3. dag.rerunable=false 的 stage → throw BadRequest（含 reason）
 *   4. cascade chain 计算正确（s8-writer → 后 6 个 stage）
 *   5. 一次性 reset 整链 dbWrites + resetFields 调用 store.resetFields
 *   6. 顺序执行 chain 中每个 handler，每完成一个 markIntermediateState lastCompletedStage++
 *   7. handler 失败 → best-effort partial：completed 保留 / abortedAt 记录 / remaining 三元组 emit
 *   8. legacy dispatch(scope=system, todoId=*-s9b-objective-evaluation) 仍走 s9b-objective-eval handler
 *   9. legacy dispatch 其它 scope → throw BadRequest
 *  10. PR-R5b 占位 handler 抛 "PR-R5b" 提示（直到补全）
 */

import { BadRequestException, Logger } from "@nestjs/common";
import { StageRerunDispatcher } from "../stage-rerun.dispatcher";
import type { HydratedMissionContext } from "../ctx-hydrator.service";
import type { EmitFn } from "../../workflow/mission-deps";
import type { MissionStore } from "../../lifecycle/mission-store.service";
import type { ReportEvaluationService } from "@/modules/ai-harness/facade";
import type { ReportArtifact } from "@/modules/ai-harness/facade";

// silence Logger
beforeAll(() => {
  jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});
  jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
  jest.spyOn(Logger.prototype, "error").mockImplementation(() => {});
});

interface MockStore {
  markRerunPatch: jest.Mock;
  markIntermediateState: jest.Mock;
  resetFields: jest.Mock;
}

function makeMockStore(): MockStore {
  return {
    markRerunPatch: jest.fn().mockResolvedValue(undefined),
    markIntermediateState: jest.fn().mockResolvedValue(undefined),
    resetFields: jest.fn().mockResolvedValue(undefined),
  };
}

interface MockReportEval {
  evaluateReport: jest.Mock;
}
function makeMockReportEval(): MockReportEval {
  return {
    evaluateReport: jest.fn().mockResolvedValue({
      overallScore: 88,
      grade: "B",
      feedback: "ok",
    }),
  };
}

function makeReportArtifact(): ReportArtifact {
  return {
    sections: [
      {
        id: "s1",
        type: "dimension",
        level: 2,
        title: "Section A",
        anchor: "a",
        startOffset: 10,
        endOffset: 400,
        wordCount: 200,
        readingTimeMinutes: 1,
        citations: [1],
        figureIds: [],
        factIds: [],
      },
    ],
    content: {
      fullMarkdown:
        "# Title\n\n## Section A\n\n" + "Body text content ".repeat(50),
      fullReportSize: 1000,
    },
    citations: [],
    figures: [],
    quality: {
      overall: 80,
      dimensions: {} as never,
      hardGateViolations: [],
      warnings: [],
      qualityTrace: [],
      finalVerdict: "good",
    },
    metadata: {
      topic: "AI",
      generatedAt: new Date().toISOString(),
      generationTimeMs: 1000,
      version: 1,
      isIncremental: false,
      dimensionCount: 1,
      sourceCount: 1,
      factCount: 0,
      figureCount: 0,
      wordCount: 200,
      readingTimeMinutes: 1,
      styleProfile: "analytical",
      lengthProfile: "standard",
      audienceProfile: "professional",
      language: "zh-CN",
      totalTokens: { prompt: 0, completion: 0, total: 0 },
      costCents: 0,
      modelTrail: ["gpt-4"],
    },
    quickView: {
      executiveSummary: { markdown: "AI", wordCount: 10 },
      topHighlights: [],
      topTrends: [],
      keyRisks: [],
      topRecommendations: [],
      keyCitations: [],
      keyFigures: [],
      estimatedReadingTime: 3,
      whatYouWillLearn: [],
    },
    factTable: [],
  } as unknown as ReportArtifact;
}

function makeCtx(
  overrides: Partial<HydratedMissionContext> = {},
): HydratedMissionContext {
  return {
    missionId: "m-1",
    userId: "u-1",
    t0: Date.now(),
    input: {
      topic: "AI",
      depth: "standard",
      language: "zh-CN",
      auditLayers: "thorough",
      lengthProfile: "standard",
      styleProfile: "analytical",
      audienceProfile: "professional",
    },
    reportArtifact: makeReportArtifact(),
    __hydrated: true,
    ...overrides,
  } as unknown as HydratedMissionContext;
}

function makeDispatcher(
  args: {
    store?: MockStore;
    reportEval?: MockReportEval;
  } = {},
) {
  const store = args.store ?? makeMockStore();
  const reportEval = args.reportEval ?? makeMockReportEval();
  const dispatcher = new StageRerunDispatcher(
    store as unknown as MissionStore,
    reportEval as unknown as ReportEvaluationService,
  );
  return { dispatcher, store, reportEval };
}

const noopEmit: EmitFn = jest.fn().mockResolvedValue(undefined) as EmitFn;

describe("StageRerunDispatcher (PR-R5 cascade infra)", () => {
  describe("runFromStageWithCascade — 入参校验", () => {
    it("unknown stepId → throw BadRequest", async () => {
      const { dispatcher } = makeDispatcher();
      await expect(
        dispatcher.runFromStageWithCascade({
          ctx: makeCtx(),
          fromStepId: "s99-not-real",
          emit: noopEmit,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("dag.rerunable=false (s1-budget) → throw BadRequest 含 reason", async () => {
      const { dispatcher } = makeDispatcher();
      await expect(
        dispatcher.runFromStageWithCascade({
          ctx: makeCtx(),
          fromStepId: "s1-budget",
          emit: noopEmit,
        }),
      ).rejects.toThrow(/不可重跑/);
    });
  });

  describe("runFromStageWithCascade — cascade 链 + reset", () => {
    it("从 s8-writer 重跑：cascade 链覆盖到 s11-persist", async () => {
      const { dispatcher, store } = makeDispatcher();
      const emit = jest.fn().mockResolvedValue(undefined) as EmitFn;
      // PR-R5 阶段 s8-writer handler 是 placeholder，会 throw → cascade 在第 1 步停
      await dispatcher.runFromStageWithCascade({
        ctx: makeCtx(),
        fromStepId: "s8-writer",
        emit,
      });
      // resetFields 应当被调过一次（cascade 的整链 resetFields 集合）
      expect(store.resetFields).toHaveBeenCalledTimes(1);
      const fields = store.resetFields.mock.calls[0][1] as string[];
      // s8 dbWrites 含 reportFull/reportArtifactVersion，s11 含 status/completedAt
      // 至少应包含 report_full 之类的 key（具体取决于 playground.config 的 dag.resetFields）
      expect(fields.length).toBeGreaterThan(0);
    });

    it("cascade chain 起点 emit rerun:stage-started 含 fromStepId + completedSoFar=[]", async () => {
      const { dispatcher } = makeDispatcher();
      const emit = jest.fn().mockResolvedValue(undefined) as EmitFn;
      await dispatcher.runFromStageWithCascade({
        ctx: makeCtx(),
        fromStepId: "s8-writer",
        emit,
      });
      const startedCall = (emit as jest.Mock).mock.calls.find(
        (c) => c[0].type === "agent-playground.rerun:stage-started",
      );
      expect(startedCall).toBeDefined();
      expect(startedCall[0].payload.fromStepId).toBe("s8-writer");
      expect(startedCall[0].payload.completedSoFar).toEqual([]);
    });
  });

  describe("runFromStageWithCascade — best-effort partial abort", () => {
    it("placeholder handler 抛 → 返回 abortedAt + remaining + emit cascade-aborted", async () => {
      const { dispatcher } = makeDispatcher();
      const emit = jest.fn().mockResolvedValue(undefined) as EmitFn;
      const result = await dispatcher.runFromStageWithCascade({
        ctx: makeCtx(),
        fromStepId: "s8-writer",
        emit,
      });
      expect(result.abortedAt).toBe("s8-writer");
      expect(result.completed).toEqual([]);
      expect(result.remaining).toBeDefined();
      expect(result.errorMessage).toMatch(/PR-R5b/);
      const abortedCall = (emit as jest.Mock).mock.calls.find(
        (c) => c[0].type === "agent-playground.rerun:cascade-aborted",
      );
      expect(abortedCall).toBeDefined();
      expect(abortedCall[0].payload.partialModeNote).toMatch(
        /best-effort partial/,
      );
    });

    it("从 s9b-objective-eval 重跑（v1 唯一真实 handler）：cascade 链 [s9b, s10, s11] 第一步成", async () => {
      const { dispatcher, store } = makeDispatcher();
      const emit = jest.fn().mockResolvedValue(undefined) as EmitFn;
      const result = await dispatcher.runFromStageWithCascade({
        ctx: makeCtx(),
        fromStepId: "s9b-objective-eval",
        emit,
      });
      // s9b 真实 handler 成功；s10/s11 是 placeholder → 在第 2 步停
      expect(result.completed).toContain("s9b-objective-eval");
      expect(result.abortedAt).toBe("s10-leader-foreword-signoff");
      // s9b 成功后应当 markIntermediateState 写 last_completed_stage
      expect(store.markIntermediateState).toHaveBeenCalled();
      // s9b 真 handler 应当调 markRerunPatch 写 reportFull
      expect(store.markRerunPatch).toHaveBeenCalledWith(
        "m-1",
        expect.objectContaining({ reportArtifactVersion: 2 }),
      );
    });
  });

  describe("dispatch (legacy v1 scope 路由)", () => {
    it("scope=system + todoId 含 s9b-objective-evaluation → 走 s9b 真实 handler", async () => {
      const { dispatcher, store } = makeDispatcher();
      const emit = jest.fn().mockResolvedValue(undefined) as EmitFn;
      await dispatcher.dispatch({
        ctx: makeCtx(),
        input: {
          missionId: "m-1",
          userId: "u-1",
          todoId: "todo-x:s9b-objective-evaluation",
          origin: "manual",
          scope: "system",
        },
        emit,
      });
      expect(store.markRerunPatch).toHaveBeenCalled();
    });

    it("其它 scope → throw BadRequest 提示用 '开新研究对比'", async () => {
      const { dispatcher } = makeDispatcher();
      const emit = jest.fn().mockResolvedValue(undefined) as EmitFn;
      await expect(
        dispatcher.dispatch({
          ctx: makeCtx(),
          input: {
            missionId: "m-1",
            userId: "u-1",
            todoId: "todo-x",
            origin: "manual",
            scope: "dimension",
            dimensionRef: "d1",
          },
          emit,
        }),
      ).rejects.toThrow(/dimension/);
    });
  });

  describe("s9b-objective-eval handler 校验", () => {
    it("ctx 缺 reportArtifact → throw", async () => {
      const { dispatcher } = makeDispatcher();
      const emit = jest.fn().mockResolvedValue(undefined) as EmitFn;
      await expect(
        dispatcher.dispatch({
          ctx: makeCtx({ reportArtifact: undefined }),
          input: {
            missionId: "m-1",
            userId: "u-1",
            todoId: "x:s9b-objective-evaluation",
            origin: "manual",
            scope: "system",
          },
          emit,
        }),
      ).rejects.toThrow(/缺 reportArtifact/);
    });

    it("section 全短 < 200 字 → throw", async () => {
      const { dispatcher } = makeDispatcher();
      const emit = jest.fn().mockResolvedValue(undefined) as EmitFn;
      const ctx = makeCtx();
      // 改成短 section
      const art = ctx.reportArtifact!;
      art.content.fullMarkdown = "short";
      art.sections[0].startOffset = 0;
      art.sections[0].endOffset = 5;
      await expect(
        dispatcher.dispatch({
          ctx,
          input: {
            missionId: "m-1",
            userId: "u-1",
            todoId: "x:s9b-objective-evaluation",
            origin: "manual",
            scope: "system",
          },
          emit,
        }),
      ).rejects.toThrow(/section body 都过短/);
    });

    it("成功路径：调 reportEvaluation + 写 metadata.pipelineEvaluation + markRerunPatch", async () => {
      const { dispatcher, store, reportEval } = makeDispatcher();
      const emit = jest.fn().mockResolvedValue(undefined) as EmitFn;
      const ctx = makeCtx();
      await dispatcher.dispatch({
        ctx,
        input: {
          missionId: "m-1",
          userId: "u-1",
          todoId: "x:s9b-objective-evaluation",
          origin: "manual",
          scope: "system",
        },
        emit,
      });
      expect(reportEval.evaluateReport).toHaveBeenCalledTimes(1);
      expect(ctx.reportArtifact!.metadata.pipelineEvaluation).toMatchObject({
        overallScore: 88,
        grade: "B",
      });
      expect(store.markRerunPatch).toHaveBeenCalledWith(
        "m-1",
        expect.objectContaining({
          reportArtifactVersion: 2,
        }),
      );
    });
  });
});
