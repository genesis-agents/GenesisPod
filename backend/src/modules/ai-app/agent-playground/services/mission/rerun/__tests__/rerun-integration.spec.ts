/**
 * Rerun integration spec — PR-R8
 *
 * 上游：docs/architecture/ai-harness/runner/per-task-rerun-with-cascade.md v1.2 §8 (整体集成)
 *
 * 集成 LocalRerunService + StageRerunDispatcher + CtxHydratorService 端到端：
 *   1. 单 stage 重跑（s9b-objective-eval）：cascade 在 s10 placeholder 停 → best-effort partial
 *   2. cascade 链终点是 s11 + status=failed → markReopened
 *   3. cascade 链不到 s11 → 不 markReopened
 *   4. 频次 5 次后第 6 次 throw 429
 *   5. 实时 cost 守门
 *   6. dry-run smoke：runtime_version='pipeline-v1' 新建 mission 与 rerun 路径解耦
 *
 * 注：真实 e2e 需要 prisma 真表（PR-R8b 会加），本 spec 用 mocked prisma + 真服务
 *     交互验证三方协作（service-level 集成）。
 */

import { Logger } from "@nestjs/common";
import { LocalRerunService } from "../local-rerun.service";
import { StageRerunDispatcher } from "../stage-rerun.dispatcher";
import type { CtxHydratorService } from "../ctx-hydrator.service";
import type { MissionStore } from "../../lifecycle/mission-store.service";
import type { ReportEvaluationService } from "@/modules/ai-harness/facade";
import type { RerunLockRegistry } from "@/modules/ai-harness/facade";
import type { PrismaService } from "../../../../../../common/prisma/prisma.service";
import type { ReportArtifact } from "@/modules/ai-harness/facade";
import type { EmitFn } from "../../workflow/mission-deps";

beforeAll(() => {
  jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});
  jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
  jest.spyOn(Logger.prototype, "error").mockImplementation(() => {});
});

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
        "# Title\n\n## Section A\n\n" + "Body content text ".repeat(80),
      fullReportSize: 1500,
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

function buildIntegratedHarness(opts: {
  missionStatus: "failed" | "running" | "completed" | "quality-failed";
  costUsd?: number;
  maxCredits?: number;
  rerunCount?: number;
  heartbeatMsAgo?: number;
  reportArtifact?: ReportArtifact;
}) {
  const {
    missionStatus,
    costUsd = 0,
    maxCredits = 1.0,
    rerunCount = 0,
    heartbeatMsAgo = 120_000,
    reportArtifact = makeReportArtifact(),
  } = opts;

  const missionRow = {
    id: "m-int-1",
    userId: "u1",
    status: missionStatus,
    heartbeatAt: new Date(Date.now() - heartbeatMsAgo),
    costUsd,
    maxCredits,
  };

  const prismaMock = {
    $transaction: jest.fn(),
    agentPlaygroundMission: {
      findFirst: jest.fn().mockResolvedValue(missionRow),
    },
    agentPlaygroundRerunAttempt: {
      count: jest.fn().mockResolvedValue(rerunCount),
      create: jest.fn().mockResolvedValue({}),
    },
  };
  prismaMock.$transaction.mockImplementation(
    async (cb: (tx: typeof prismaMock) => Promise<unknown>) => cb(prismaMock),
  );

  const storeMock = {
    getById: jest.fn().mockResolvedValue({ status: missionStatus }),
    markReopened: jest.fn().mockResolvedValue(undefined),
    markIntermediateState: jest.fn().mockResolvedValue(undefined),
    resetFields: jest.fn().mockResolvedValue(undefined),
    markRerunPatch: jest.fn().mockResolvedValue(undefined),
  };

  const reportEvalMock = {
    evaluateReport: jest.fn().mockResolvedValue({
      overallScore: 90,
      grade: "A",
      feedback: "improved",
    }),
  };

  const lockRegMock = {
    acquire: jest.fn().mockReturnValue(true),
    release: jest.fn(),
  };

  const hydratorMock = {
    hydrate: jest.fn().mockResolvedValue({
      missionId: "m-int-1",
      userId: "u1",
      input: {
        topic: "AI",
        depth: "standard",
        language: "zh-CN",
        auditLayers: "thorough",
      },
      reportArtifact,
      __hydrated: true,
      t0: Date.now(),
    }),
  };

  const dispatcher = new StageRerunDispatcher(
    storeMock as unknown as MissionStore,
    reportEvalMock as unknown as ReportEvaluationService,
  );

  const service = new LocalRerunService(
    hydratorMock as unknown as CtxHydratorService,
    lockRegMock as unknown as RerunLockRegistry,
    dispatcher,
    prismaMock as unknown as PrismaService,
    storeMock as unknown as MissionStore,
  );

  return {
    service,
    dispatcher,
    storeMock,
    reportEvalMock,
    prismaMock,
    hydratorMock,
    lockRegMock,
  };
}

const noopEmit: EmitFn = jest.fn().mockResolvedValue(undefined) as EmitFn;

describe("Rerun integration (PR-R8)", () => {
  describe("场景 1: s9b-objective-eval cascade（链 = [s9b, s10, s11]）", () => {
    it("成功跑 s9b → 在 s10 placeholder 停 → best-effort partial", async () => {
      const h = buildIntegratedHarness({ missionStatus: "completed" });
      const emit = jest.fn().mockResolvedValue(undefined) as EmitFn;
      const result = await h.service.run(
        {
          missionId: "m-int-1",
          userId: "u1",
          todoId: "todo-x",
          origin: "manual",
          scope: "system",
          stepId: "s9b-objective-eval",
        },
        emit,
      );

      // 整链 reset 调过
      expect(h.storeMock.resetFields).toHaveBeenCalledTimes(1);
      // s9b 真 handler 写了 reportFull
      expect(h.storeMock.markRerunPatch).toHaveBeenCalledWith(
        "m-int-1",
        expect.objectContaining({ reportArtifactVersion: 2 }),
      );
      // best-effort partial：cascade 中止在 s10
      expect(result.cascade?.completed).toContain("s9b-objective-eval");
      expect(result.cascade?.abortedAt).toBe("s10-leader-foreword-signoff");
      // 频次表写过
      expect(
        h.prismaMock.agentPlaygroundRerunAttempt.create,
      ).toHaveBeenCalled();
      // emit cascade 三元组
      const types = (emit as jest.Mock).mock.calls.map((c) => c[0].type);
      expect(types).toContain("agent-playground.rerun:stage-started");
      expect(types).toContain("agent-playground.rerun:cascade-aborted");
      expect(types).toContain("agent-playground.mission:rerun-completed");
    });
  });

  describe("场景 2: cascade 终点 = s11 + status=failed → markReopened", () => {
    it("failed mission 重跑 s9b → 终点 s11-persist + markReopened 调过", async () => {
      const h = buildIntegratedHarness({ missionStatus: "failed" });
      h.storeMock.getById.mockResolvedValue({ status: "failed" });
      await h.service.run(
        {
          missionId: "m-int-1",
          userId: "u1",
          todoId: "todo-x",
          origin: "manual",
          scope: "system",
          stepId: "s9b-objective-eval",
        },
        noopEmit,
      );
      expect(h.storeMock.markReopened).toHaveBeenCalledWith("m-int-1", "u1");
    });

    it("quality-failed 也走 reopen", async () => {
      const h = buildIntegratedHarness({ missionStatus: "quality-failed" });
      h.storeMock.getById.mockResolvedValue({ status: "quality-failed" });
      await h.service.run(
        {
          missionId: "m-int-1",
          userId: "u1",
          todoId: "todo-x",
          origin: "manual",
          scope: "system",
          stepId: "s9b-objective-eval",
        },
        noopEmit,
      );
      expect(h.storeMock.markReopened).toHaveBeenCalledWith("m-int-1", "u1");
    });

    it("completed mission（已成功）不需要 reopen", async () => {
      const h = buildIntegratedHarness({ missionStatus: "completed" });
      h.storeMock.getById.mockResolvedValue({ status: "completed" });
      await h.service.run(
        {
          missionId: "m-int-1",
          userId: "u1",
          todoId: "todo-x",
          origin: "manual",
          scope: "system",
          stepId: "s9b-objective-eval",
        },
        noopEmit,
      );
      expect(h.storeMock.markReopened).not.toHaveBeenCalled();
    });
  });

  describe("场景 3: 频次 + cost 闸（5/24h + cost guard）", () => {
    it("第 6 次（已用 5）→ throw 429", async () => {
      const h = buildIntegratedHarness({
        missionStatus: "completed",
        rerunCount: 5,
      });
      await expect(
        h.service.run(
          {
            missionId: "m-int-1",
            userId: "u1",
            todoId: "todo-x",
            origin: "manual",
            scope: "system",
            stepId: "s9b-objective-eval",
          },
          noopEmit,
        ),
      ).rejects.toMatchObject({ status: 429 });
    });

    it("cost_usd >= max_credits → throw（防累积超支）", async () => {
      const h = buildIntegratedHarness({
        missionStatus: "completed",
        costUsd: 1.5,
        maxCredits: 1.0,
      });
      await expect(
        h.service.run(
          {
            missionId: "m-int-1",
            userId: "u1",
            todoId: "todo-x",
            origin: "manual",
            scope: "system",
            stepId: "s9b-objective-eval",
          },
          noopEmit,
        ),
      ).rejects.toThrow(/累积 cost.*已达 maxCredits/);
    });

    it("running + heartbeat < 60s → 拒（in-flight 不允许）", async () => {
      const h = buildIntegratedHarness({
        missionStatus: "running",
        heartbeatMsAgo: 30_000,
      });
      await expect(
        h.service.run(
          {
            missionId: "m-int-1",
            userId: "u1",
            todoId: "todo-x",
            origin: "manual",
            scope: "system",
            stepId: "s9b-objective-eval",
          },
          noopEmit,
        ),
      ).rejects.toThrow(/还在跑/);
    });
  });

  describe("场景 4: cascade 链不到 s11 → 不 markReopened（safety）", () => {
    it("scope=system + s9b 老路径（无 stepId）→ 不走 cascade 也不 reopen", async () => {
      const h = buildIntegratedHarness({ missionStatus: "failed" });
      h.storeMock.getById.mockResolvedValue({ status: "failed" });
      await h.service.run(
        {
          missionId: "m-int-1",
          userId: "u1",
          todoId: "todo-x:s9b-objective-evaluation",
          origin: "manual",
          scope: "system",
          // 故意不传 stepId
        },
        noopEmit,
      );
      expect(h.storeMock.markReopened).not.toHaveBeenCalled();
      // 老 dispatch 走的是 markRerunPatch，与 cascade 路径区分
      expect(h.storeMock.markRerunPatch).toHaveBeenCalled();
    });
  });

  describe("场景 5: dry-run smoke — 黑名单 / 未知 step 阻断", () => {
    it("stepId=s1-budget → 黑名单 throw（第一道闸即拦）", async () => {
      const h = buildIntegratedHarness({ missionStatus: "completed" });
      await expect(
        h.service.run(
          {
            missionId: "m-int-1",
            userId: "u1",
            todoId: "todo-x",
            origin: "manual",
            scope: "system",
            stepId: "s1-budget",
          },
          noopEmit,
        ),
      ).rejects.toThrow(/不可重跑/);
      // 没走到 dispatcher
      expect(h.storeMock.resetFields).not.toHaveBeenCalled();
    });

    it("origin=leader-assess-abort → 拒（已放弃维度）", async () => {
      const h = buildIntegratedHarness({ missionStatus: "completed" });
      await expect(
        h.service.run(
          {
            missionId: "m-int-1",
            userId: "u1",
            todoId: "todo-x",
            origin: "leader-assess-abort",
            scope: "dimension",
            stepId: "s3-researcher-collect",
          },
          noopEmit,
        ),
      ).rejects.toThrow(/已放弃/);
    });
  });

  describe("场景 6: c195035f mission backfill 模拟", () => {
    it("mission status=failed + stepId=s9b → cascade 重跑 + reopen + best-effort partial", async () => {
      // 模拟 c195035f-d6fd-4dae-a9a0-d5176048e4e6 真实 case：
      // - mission 状态 failed（S11 chapter_content_incomplete guard 拒了）
      // - reportArtifact 已存在（v1.7 装配成功）
      // - 用户从前端 todo 卡片选 s9b-objective-eval 重跑（最低代价路径）
      const h = buildIntegratedHarness({ missionStatus: "failed" });
      h.storeMock.getById.mockResolvedValue({ status: "failed" });
      const emit = jest.fn().mockResolvedValue(undefined) as EmitFn;

      const result = await h.service.run(
        {
          missionId: "c195035f-d6fd-4dae-a9a0-d5176048e4e6",
          userId: "u1",
          todoId: "todo-c195-s9b",
          origin: "manual",
          scope: "system",
          stepId: "s9b-objective-eval",
        },
        emit,
      );

      // 结果断言
      expect(result.ok).toBe(true);
      expect(result.cascade?.completed).toContain("s9b-objective-eval");
      // reopen 调过（cascade 终点 = s11）
      expect(h.storeMock.markReopened).toHaveBeenCalledWith(
        "c195035f-d6fd-4dae-a9a0-d5176048e4e6",
        "u1",
      );
      // s9b 真 handler 调用了 evaluateReport + markRerunPatch
      expect(h.reportEvalMock.evaluateReport).toHaveBeenCalledTimes(1);
      expect(h.storeMock.markRerunPatch).toHaveBeenCalled();
      // 频次表写一笔
      expect(
        h.prismaMock.agentPlaygroundRerunAttempt.create,
      ).toHaveBeenCalledWith({
        data: expect.objectContaining({
          missionId: "c195035f-d6fd-4dae-a9a0-d5176048e4e6",
          stepId: "s9b-objective-eval",
        }),
      });
    });
  });
});
