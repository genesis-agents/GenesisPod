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
import {
  StageRerunDispatcher,
  LEADER_VERDICT_AUTO_RERUN_RECOVERED,
} from "../stage-rerun.dispatcher";
import type { HydratedMissionContext } from "../ctx-hydrator.service";
import type { EmitFn } from "../../workflow/mission-deps";
import type { MissionStore } from "../../lifecycle/mission-store.service";
import type { ReportEvaluationService } from "@/modules/ai-harness/facade";
import type { ReportArtifact } from "@/modules/ai-harness/facade";
import type { PrismaService } from "../../../../../../../common/prisma/prisma.service";

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
  markCompleted: jest.Mock;
  getById: jest.Mock;
  saveReportVersion: jest.Mock;
}

function makeMockStore(): MockStore {
  return {
    markRerunPatch: jest.fn().mockResolvedValue(undefined),
    markIntermediateState: jest.fn().mockResolvedValue(undefined),
    resetFields: jest.fn().mockResolvedValue(undefined),
    markCompleted: jest.fn().mockResolvedValue(undefined),
    // ★ PR-R5b 评审 P0-A (2026-05-07): 报告版本化写入 mock
    saveReportVersion: jest.fn().mockResolvedValue(1),
    getById: jest.fn().mockResolvedValue({
      themeSummary: "test theme",
      dimensions: [],
      verdicts: [],
      reconciliationReport: null,
      userProfile: null,
      leaderJournal: null,
      leaderOverallScore: null,
      leaderSigned: null,
      leaderVerdict: null,
      tokensUsed: 0,
      costUsd: 0,
    }),
  };
}

interface MockPrisma {
  agentPlaygroundChapterDraft: { findMany: jest.Mock };
}

function makeMockPrisma(): MockPrisma {
  return {
    agentPlaygroundChapterDraft: {
      findMany: jest.fn().mockResolvedValue([]),
    },
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
    prisma?: MockPrisma;
  } = {},
) {
  const store = args.store ?? makeMockStore();
  const reportEval = args.reportEval ?? makeMockReportEval();
  const prisma = args.prisma ?? makeMockPrisma();
  const dispatcher = new StageRerunDispatcher(
    store as unknown as MissionStore,
    reportEval as unknown as ReportEvaluationService,
    prisma as unknown as PrismaService,
  );
  return { dispatcher, store, reportEval, prisma };
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
    // ★ 收尾评审 P0-R4 (2026-05-07): 10 个 PR-R5b placeholder 全部验证 throw "PR-R5b"
    //   防个别 handler 被实装/重命名时漏网（构造期注册依赖循环 + Map.has key 拼写）
    // ★ PR-R5b 切片 (2026-05-07): s11-persist 已实装真 handler，从此 list 删
    const PR_R5B_PENDING_STEPS = [
      "s2-leader-plan",
      "s3-researcher-collect",
      "s4-leader-assess",
      "s5-reconciler",
      "s6-analyst",
      "s7-writer-outline",
      "s8-writer",
      "s8b-quality-enhancement",
      "s9-critic",
      "s10-leader-foreword-signoff",
    ];
    it.each(PR_R5B_PENDING_STEPS)(
      "%s placeholder handler 抛 [PR-R5b] 错误信息 + cascade abort 在自身位置",
      async (stepId) => {
        const { dispatcher } = makeDispatcher();
        const emit = jest.fn().mockResolvedValue(undefined) as EmitFn;
        const result = await dispatcher.runFromStageWithCascade({
          ctx: makeCtx(),
          fromStepId: stepId,
          emit,
        });
        expect(result.abortedAt).toBe(stepId);
        expect(result.completed).toEqual([]);
        expect(result.errorMessage).toMatch(/PR-R5b/);
      },
    );

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
        "u-1",
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
        "u-1",
      );
    });
  });

  // ★ PR-R5b 切片 (2026-05-07): s11-persist 真 handler 反向证据
  describe("s11-persist 真 handler (PR-R5b 切片)", () => {
    it("ctx.reportArtifact 存在 → 直接 markCompleted（不 fallback 到 chapter_drafts）", async () => {
      const { dispatcher, store, prisma } = makeDispatcher();
      const emit = jest.fn().mockResolvedValue(undefined) as EmitFn;
      // s11-persist cascade chain = [s11-persist] 仅 1 步
      const result = await dispatcher.runFromStageWithCascade({
        ctx: makeCtx(), // 含 reportArtifact
        fromStepId: "s11-persist",
        emit,
      });
      expect(result.completed).toEqual(["s11-persist"]);
      expect(result.abortedAt).toBeUndefined();
      // ★ PR-R5b 评审 P0-B (2026-05-07): markCompleted 第三参 userId 走严格隔离
      // ★ R2 共识 P1 (architect P1-5): wallTimeMs 必传（rerun 自身耗时）
      expect(store.markCompleted).toHaveBeenCalledWith(
        "m-1",
        expect.objectContaining({
          reportArtifactVersion: 2,
          wallTimeMs: expect.any(Number),
          report: expect.objectContaining({
            title: expect.any(String),
          }),
        }),
        "u-1",
      );
      // ctx.reportArtifact 已有 → 不读 chapter_drafts
      expect(
        prisma.agentPlaygroundChapterDraft.findMany,
      ).not.toHaveBeenCalled();
      // emit mission:completed
      const completedEmit = (emit as jest.Mock).mock.calls.find(
        (c) => c[0].type === "agent-playground.mission:completed",
      );
      expect(completedEmit).toBeDefined();
      expect(completedEmit[0].payload.rerunRecovered).toBe(false);
    });

    it("ctx 缺 reportArtifact → 从 chapter_drafts 重建 → markCompleted", async () => {
      const prisma = makeMockPrisma();
      prisma.agentPlaygroundChapterDraft.findMany.mockResolvedValue([
        {
          id: "d1",
          missionId: "m-1",
          dimension: "Market",
          chapterIndex: 0,
          heading: "市场规模",
          thesis: "AI 市场快速增长",
          content: "Body content ".repeat(50),
          status: "passed",
          score: 80,
          critique: null,
          attempts: 1,
          wordCount: 500,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "d2",
          missionId: "m-1",
          dimension: "Tech",
          chapterIndex: 0,
          heading: "技术演进",
          thesis: "模型快速演进",
          content: "More body ".repeat(60),
          status: "done",
          score: 85,
          critique: null,
          attempts: 1,
          wordCount: 600,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      const { dispatcher, store } = makeDispatcher({ prisma });
      const emit = jest.fn().mockResolvedValue(undefined) as EmitFn;
      const result = await dispatcher.runFromStageWithCascade({
        ctx: makeCtx({ reportArtifact: undefined }),
        fromStepId: "s11-persist",
        emit,
      });
      expect(result.completed).toEqual(["s11-persist"]);
      expect(prisma.agentPlaygroundChapterDraft.findMany).toHaveBeenCalled();
      expect(store.markCompleted).toHaveBeenCalled();
      const markArg = store.markCompleted.mock.calls[0][1];
      // 重建产物：finalScore=65（降级标记）
      expect(markArg.finalScore).toBe(65);
      const completedEmit = (emit as jest.Mock).mock.calls.find(
        (c) => c[0].type === "agent-playground.mission:completed",
      );
      expect(completedEmit[0].payload.rerunRecovered).toBe(true);
      expect(completedEmit[0].payload.rerunSource).toBe("chapter_drafts");
    });

    it("ctx 缺 reportArtifact 且 chapter_drafts 空 → throw BadRequest", async () => {
      const prisma = makeMockPrisma();
      prisma.agentPlaygroundChapterDraft.findMany.mockResolvedValue([]);
      const { dispatcher } = makeDispatcher({ prisma });
      const emit = jest.fn().mockResolvedValue(undefined) as EmitFn;
      const result = await dispatcher.runFromStageWithCascade({
        ctx: makeCtx({ reportArtifact: undefined }),
        fromStepId: "s11-persist",
        emit,
      });
      // cascade aborted（handler throw）
      expect(result.abortedAt).toBe("s11-persist");
      expect(result.errorMessage).toMatch(/无法重跑 S11 持久化/);
    });

    it("leader 没真签时 → leaderVerdict=auto-rerun-recovered（前端可识别）", async () => {
      const { dispatcher, store } = makeDispatcher();
      // store.getById mock 默认 leaderVerdict=null
      const emit = jest.fn().mockResolvedValue(undefined) as EmitFn;
      await dispatcher.runFromStageWithCascade({
        ctx: makeCtx(),
        fromStepId: "s11-persist",
        emit,
      });
      const markArg = store.markCompleted.mock.calls[0][1];
      expect(markArg.leaderVerdict).toBe("auto-rerun-recovered");
    });

    it("leader 已真签时 → 保留原 leaderVerdict", async () => {
      const store = makeMockStore();
      store.getById.mockResolvedValue({
        themeSummary: "test",
        dimensions: [],
        verdicts: [],
        leaderOverallScore: 85,
        leaderSigned: true,
        leaderVerdict: "good",
        tokensUsed: 1000,
        costUsd: 0.5,
      });
      const { dispatcher } = makeDispatcher({ store });
      const emit = jest.fn().mockResolvedValue(undefined) as EmitFn;
      await dispatcher.runFromStageWithCascade({
        ctx: makeCtx(),
        fromStepId: "s11-persist",
        emit,
      });
      const markArg = store.markCompleted.mock.calls[0][1];
      expect(markArg.leaderVerdict).toBe("good");
      expect(markArg.leaderSigned).toBe(true);
      expect(markArg.leaderOverallScore).toBe(85);
    });

    it("getById 返回 null（mission 不存在/非 owner） → throw", async () => {
      const store = makeMockStore();
      store.getById.mockResolvedValue(null);
      const { dispatcher } = makeDispatcher({ store });
      const emit = jest.fn().mockResolvedValue(undefined) as EmitFn;
      const result = await dispatcher.runFromStageWithCascade({
        ctx: makeCtx(),
        fromStepId: "s11-persist",
        emit,
      });
      expect(result.abortedAt).toBe("s11-persist");
      expect(result.errorMessage).toMatch(/mission.*不存在或非 owner/);
    });

    // ★ PR-R5b 评审 P0-A (2026-05-07): 反向证据 — markCompleted 后必须 saveReportVersion
    it("成功路径 → saveReportVersion 被调用（triggerType='todo-rerun'）", async () => {
      const { dispatcher, store } = makeDispatcher();
      const emit = jest.fn().mockResolvedValue(undefined) as EmitFn;
      await dispatcher.runFromStageWithCascade({
        ctx: makeCtx(),
        fromStepId: "s11-persist",
        emit,
      });
      expect(store.saveReportVersion).toHaveBeenCalledTimes(1);
      const arg = store.saveReportVersion.mock.calls[0][0];
      expect(arg.missionId).toBe("m-1");
      expect(arg.triggerType).toBe("todo-rerun");
      expect(arg.report).toBeDefined();
    });

    // ★ PR-R5b 评审 P0-A (2026-05-07): saveReportVersion 失败不阻断 markCompleted（fire-and-forget）
    it("saveReportVersion 抛错 → markCompleted 仍成功（fire-and-forget catch）", async () => {
      const store = makeMockStore();
      store.saveReportVersion.mockRejectedValue(new Error("DB transient"));
      const { dispatcher } = makeDispatcher({ store });
      const emit = jest.fn().mockResolvedValue(undefined) as EmitFn;
      const result = await dispatcher.runFromStageWithCascade({
        ctx: makeCtx(),
        fromStepId: "s11-persist",
        emit,
      });
      expect(result.completed).toEqual(["s11-persist"]);
      expect(result.abortedAt).toBeUndefined();
      expect(store.markCompleted).toHaveBeenCalled();
    });

    // ★ PR-R5b 评审 P0-C (2026-05-07): rebuildArtifactFromDrafts 包含 'failed-finalized'
    it("chapter_drafts 'failed-finalized' 也被纳入重建（c195035f 类用例核心）", async () => {
      const prisma = makeMockPrisma();
      // 模拟 c195035f 类：13 章节是 'failed-finalized'（S11 guard 拒之前 writer 已落库），
      // 1 章节是 'passed'。fallback 路径必须把全 14 章节都收回来。
      prisma.agentPlaygroundChapterDraft.findMany.mockImplementation(
        async (args: { where?: { status?: { in?: string[] } } }) => {
          const allowed = args.where?.status?.in ?? [];
          // 反向证据：dispatcher 必须传 'failed-finalized' 进 where.status.in
          if (!allowed.includes("failed-finalized")) {
            throw new Error(
              "dispatcher 没把 failed-finalized 包含进 where.status.in — P0-C regression",
            );
          }
          return [
            {
              id: "d1",
              missionId: "m-1",
              dimension: "Market",
              chapterIndex: 0,
              heading: "市场规模",
              content: "Body content ".repeat(50),
              status: "failed-finalized",
              attempts: 3,
              wordCount: 500,
            },
          ];
        },
      );
      const { dispatcher, store } = makeDispatcher({ prisma });
      const emit = jest.fn().mockResolvedValue(undefined) as EmitFn;
      const result = await dispatcher.runFromStageWithCascade({
        ctx: makeCtx({ reportArtifact: undefined }),
        fromStepId: "s11-persist",
        emit,
      });
      expect(result.completed).toEqual(["s11-persist"]);
      expect(store.markCompleted).toHaveBeenCalled();
      // findMany 第一参 where.status.in 必须含 'failed-finalized'
      const findCall = prisma.agentPlaygroundChapterDraft.findMany.mock
        .calls[0][0] as { where: { status: { in: string[] } } };
      expect(findCall.where.status.in).toContain("failed-finalized");
      expect(findCall.where.status.in).toContain("passed");
      expect(findCall.where.status.in).toContain("done");
    });

    // ★ PR-R5b 评审 P1 (2026-05-07): 常量 export 反向证据
    it("LEADER_VERDICT_AUTO_RERUN_RECOVERED 常量与 dispatcher 写入值一致（防漂移）", async () => {
      expect(LEADER_VERDICT_AUTO_RERUN_RECOVERED).toBe("auto-rerun-recovered");
      const { dispatcher, store } = makeDispatcher();
      const emit = jest.fn().mockResolvedValue(undefined) as EmitFn;
      await dispatcher.runFromStageWithCascade({
        ctx: makeCtx(),
        fromStepId: "s11-persist",
        emit,
      });
      const markArg = store.markCompleted.mock.calls[0][1];
      expect(markArg.leaderVerdict).toBe(LEADER_VERDICT_AUTO_RERUN_RECOVERED);
    });

    // ★ R2 共识 P1 (tester): getById 抛错（非 null）的场景 — cascade abort 不 throw
    it("getById 抛 DB error → cascade abort + errorMessage 含错误", async () => {
      const store = makeMockStore();
      store.getById.mockRejectedValue(new Error("DB transient"));
      const { dispatcher } = makeDispatcher({ store });
      const emit = jest.fn().mockResolvedValue(undefined) as EmitFn;
      const result = await dispatcher.runFromStageWithCascade({
        ctx: makeCtx(),
        fromStepId: "s11-persist",
        emit,
      });
      expect(result.abortedAt).toBe("s11-persist");
      expect(result.errorMessage).toMatch(/DB transient/);
    });

    // ★ R2 共识 P0 (architect P0-1): rebuild 路径必须打 recoveryDegraded + recoveryMode
    it("rebuild 路径产物含 quality.recoveryDegraded=true + metadata.recoveryMode='chapter_drafts_rebuild'", async () => {
      const prisma = makeMockPrisma();
      prisma.agentPlaygroundChapterDraft.findMany.mockResolvedValue([
        {
          id: "d1",
          missionId: "m-1",
          dimension: "X",
          chapterIndex: 0,
          heading: "标题",
          content: "Body content ".repeat(50),
          status: "failed-finalized",
          attempts: 3,
          wordCount: 500,
        },
      ]);
      const { dispatcher, store } = makeDispatcher({ prisma });
      const emit = jest.fn().mockResolvedValue(undefined) as EmitFn;
      await dispatcher.runFromStageWithCascade({
        ctx: makeCtx({ reportArtifact: undefined }),
        fromStepId: "s11-persist",
        emit,
      });
      // markCompleted 收到的 report payload 含 recovery flags
      const markArg = store.markCompleted.mock.calls[0][1];
      const report = markArg.report;
      expect(report.quality.recoveryDegraded).toBe(true);
      expect(report.metadata.recoveryMode).toBe("chapter_drafts_rebuild");
    });

    // ★ R2 共识 P1 (reviewer P1-3): 错误信息含 missionId + userId 上下文
    it("errorMessage 含 missionId + userId 上下文（线上排查友好）", async () => {
      const prisma = makeMockPrisma();
      prisma.agentPlaygroundChapterDraft.findMany.mockResolvedValue([]);
      const { dispatcher } = makeDispatcher({ prisma });
      const emit = jest.fn().mockResolvedValue(undefined) as EmitFn;
      const ctx = makeCtx({ reportArtifact: undefined });
      const result = await dispatcher.runFromStageWithCascade({
        ctx,
        fromStepId: "s11-persist",
        emit,
      });
      expect(result.abortedAt).toBe("s11-persist");
      expect(result.errorMessage).toContain("missionId=m-1");
      expect(result.errorMessage).toContain("userId=u-1");
    });
  });
});
