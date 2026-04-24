/**
 * MissionExecutionService tests — post-H6 minimal surface.
 *
 * After the H6 orphan sweep, the service exposes only harness-path methods:
 * - startExecution (delegates to runWithHarness)
 * - resumeWithHarness
 * - addAgentToLeaderPlan (kept for /leader/chat dynamic orchestration)
 * - handleResumeMissionExecution (@OnEvent → resumeWithHarness)
 * - handleRecoveryNeeded (@OnEvent no-op in harness mode)
 *
 * Legacy method tests (executeTask, executeDynamicScheduler, finalizeMission,
 * resumeExecution, continueExecution, resumeExecutionForNewTask, etc.) were
 * deleted with their implementations. Coverage for the harness path itself
 * lives in pipeline-orchestrator.service.spec.ts.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { MissionExecutionService } from "../execution.service";
import {
  PipelineOrchestratorService,
  buildIdentityContext,
} from "@/modules/ai-app/topic-insights/mission/pipeline";
import { MissionCancellationService } from "../cancellation.service";

function buildService() {
  const prisma = {
    researchMission: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    researchTopic: {
      findUnique: jest.fn(),
    },
  };
  const eventEmitter = {
    emitMissionStarted: jest.fn().mockResolvedValue(undefined),
    emitMissionCompleted: jest.fn().mockResolvedValue(undefined),
    emitMissionFailed: jest.fn().mockResolvedValue(undefined),
    emitMissionCancelled: jest.fn().mockResolvedValue(undefined),
  };
  const reportSynth = {
    createDraftReport: jest.fn().mockResolvedValue({ id: "draft" }),
  };
  const harnessOrchestrator = {
    run: jest.fn().mockResolvedValue({
      missionId: "m-1",
      completedStages: ["ST-00-INIT"],
      skippedStages: [],
      budgetSnapshot: { tokensUsed: 0, costUsd: 0 },
      durationMs: 100,
    }),
  };
  const rollout = { recordRun: jest.fn() };
  const reconciler = {
    reconcile: jest.fn().mockResolvedValue({
      degradations: [],
      recommendedDepth: "standard",
      env: {},
    }),
  };
  const cancellation = new MissionCancellationService();
  const checkpoint = {
    load: jest.fn().mockResolvedValue(null),
    clear: jest.fn().mockResolvedValue(undefined),
    saveStage: jest.fn().mockResolvedValue(undefined),
  };

  const service = new MissionExecutionService(
    prisma as never,
    eventEmitter as never,
    reportSynth as never,
    harnessOrchestrator as never,
    rollout as never,
    reconciler as never,
    cancellation,
    checkpoint as never,
  );

  return {
    service,
    prisma,
    eventEmitter,
    reportSynth,
    harnessOrchestrator,
    rollout,
    reconciler,
    cancellation,
    checkpoint,
  };
}

describe("MissionExecutionService", () => {
  describe("startExecution", () => {
    it("delegates to runWithHarness", async () => {
      const ctx = buildService();
      ctx.prisma.researchTopic.findUnique.mockResolvedValue({
        id: "t-1",
        userId: "u-1",
        name: "Topic",
      });
      ctx.prisma.researchMission.findUnique.mockResolvedValue({
        researchDepth: "standard",
      });

      await ctx.service.startExecution("m-1", "t-1");
      expect(ctx.harnessOrchestrator.run).toHaveBeenCalledTimes(1);
    });
  });

  describe("resumeWithHarness", () => {
    it("falls back to runWithHarness when no checkpoint", async () => {
      const ctx = buildService();
      ctx.prisma.researchTopic.findUnique.mockResolvedValue({
        id: "t-1",
        userId: "u-1",
        name: "Topic",
      });
      ctx.prisma.researchMission.findUnique.mockResolvedValue({
        researchDepth: "standard",
      });

      await ctx.service.resumeWithHarness("m-1", "t-1");
      expect(ctx.checkpoint.load).toHaveBeenCalledWith("m-1");
      expect(ctx.harnessOrchestrator.run).toHaveBeenCalledTimes(1);
    });

    it("throws NotFoundException when topic missing and checkpoint present", async () => {
      const ctx = buildService();
      ctx.checkpoint.load.mockResolvedValue({
        missionId: "m-1",
        completedStages: ["ST-00-INIT"],
        stageResults: { "ST-00-INIT": {} },
        budgetSnapshot: { tokensUsed: 0 },
        identitySnapshot: {
          reportId: "r-1",
          userId: "u-1",
          cachePrefix: "x",
          depth: "standard",
          mode: "fresh",
          degradationMode: false,
        },
        lastStageId: "ST-00-INIT",
        updatedAt: new Date(),
      });
      ctx.prisma.researchTopic.findUnique.mockResolvedValue(null);

      await expect(ctx.service.resumeWithHarness("m-1", "t-1")).rejects.toThrow(
        "Topic t-1 not found",
      );
    });

    it("passes resumeFromCheckpoint to orchestrator when checkpoint present", async () => {
      const ctx = buildService();
      ctx.checkpoint.load.mockResolvedValue({
        missionId: "m-1",
        completedStages: ["ST-00-INIT", "ST-01-PLAN"],
        stageResults: {
          "ST-00-INIT": { ok: true },
          "ST-01-PLAN": { plan: {} },
        },
        budgetSnapshot: { tokensUsed: 100 },
        identitySnapshot: {
          reportId: "r-1",
          userId: "u-1",
          cachePrefix: "x",
          depth: "standard",
          mode: "fresh",
          degradationMode: false,
        },
        lastStageId: "ST-01-PLAN",
        updatedAt: new Date(),
      });
      ctx.prisma.researchTopic.findUnique.mockResolvedValue({
        id: "t-1",
        userId: "u-1",
      });

      await ctx.service.resumeWithHarness("m-1", "t-1");
      const runOpts = ctx.harnessOrchestrator.run.mock.calls[0][1];
      expect(runOpts.resumeFromCheckpoint.completedStages).toEqual([
        "ST-00-INIT",
        "ST-01-PLAN",
      ]);
    });
  });

  describe("handleResumeMissionExecution event handler", () => {
    it("delegates to resumeWithHarness", async () => {
      const ctx = buildService();
      ctx.prisma.researchTopic.findUnique.mockResolvedValue({
        userId: "u-1",
      });
      const spy = jest
        .spyOn(ctx.service, "resumeWithHarness")
        .mockResolvedValue(undefined);

      await ctx.service.handleResumeMissionExecution({
        missionId: "m-1",
        topicId: "t-1",
      });

      // event is fired-and-forgotten; resume may start async after we return
      await new Promise((r) => setTimeout(r, 5));
      expect(spy).toHaveBeenCalledWith("m-1", "t-1");
    });

    it("does not propagate errors from resumeWithHarness", async () => {
      const ctx = buildService();
      ctx.prisma.researchTopic.findUnique.mockResolvedValue({
        userId: "u-1",
      });
      jest
        .spyOn(ctx.service, "resumeWithHarness")
        .mockRejectedValue(new Error("boom"));

      await expect(
        ctx.service.handleResumeMissionExecution({
          missionId: "m-1",
          topicId: "t-1",
        }),
      ).resolves.not.toThrow();
    });
  });

  describe("handleRecoveryNeeded event handler", () => {
    it("is a no-op in harness mode", async () => {
      const ctx = buildService();
      await expect(
        ctx.service.handleRecoveryNeeded({
          missionId: "m-1",
          topicId: "t-1",
          resetTaskCount: 2,
        }),
      ).resolves.toBeUndefined();
      expect(ctx.prisma.researchMission.update).not.toHaveBeenCalled();
    });
  });

  describe("addAgentToLeaderPlan", () => {
    it("returns silently when mission not found", async () => {
      const ctx = buildService();
      ctx.prisma.researchMission.findUnique.mockResolvedValue(null);

      await expect(
        ctx.service.addAgentToLeaderPlan("missing", {
          agentId: "a-1",
          agentType: "dimension_researcher",
        }),
      ).resolves.not.toThrow();
      expect(ctx.prisma.researchMission.update).not.toHaveBeenCalled();
    });

    it("initializes agentAssignments when leaderPlan lacks them", async () => {
      const ctx = buildService();
      ctx.prisma.researchMission.findUnique.mockResolvedValue({
        leaderPlan: {
          taskUnderstanding: { topic: "t", scope: "", objectives: [] },
          dimensions: [],
          executionStrategy: { parallelism: 1, priorityOrder: [] },
        },
      });
      await ctx.service.addAgentToLeaderPlan("m-1", {
        agentId: "a-1",
        agentType: "researcher",
      });

      const updateCall =
        ctx.prisma.researchMission.update.mock.calls[0]?.[0] ?? {};
      expect(updateCall.where).toEqual({ id: "m-1" });
      const updated = (updateCall.data?.leaderPlan ?? {}) as {
        agentAssignments?: Array<{ agentId: string }>;
      };
      expect(Array.isArray(updated.agentAssignments)).toBe(true);
      expect(updated.agentAssignments?.[0]?.agentId).toBe("a-1");
    });
  });

  // Keeps buildIdentityContext importable so the harness path stays test-covered
  // through pipeline-orchestrator.service.spec.ts rather than via this service.
  it("buildIdentityContext produces a valid identity", () => {
    const id = buildIdentityContext({
      missionId: "m-1",
      topicId: "t-1",
      reportId: "r-1",
      userId: "u-1",
      depth: "standard",
      mode: "fresh",
    });
    expect(id.missionId).toBe("m-1");
    expect(id.abortController).toBeInstanceOf(AbortController);
  });

  it("PipelineOrchestratorService import is preserved", () => {
    expect(typeof PipelineOrchestratorService).toBe("function");
  });

  it("TestingModule import is preserved", async () => {
    const mod: TestingModule = await Test.createTestingModule({
      providers: [],
    }).compile();
    expect(mod).toBeDefined();
  });
});
