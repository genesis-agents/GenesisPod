/**
 * ResearchMissionOrchestrator unit tests
 *
 * 验证 L3 business wrapper 正确把 L2 MissionOrchestrator 与业务 stores / protocols /
 * replanner / consensus / llm 绑定，并在 finalize 时正确更新 ResearchMission 行。
 */

import { Test } from "@nestjs/testing";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  MissionOrchestrator,
  type QueueStats,
} from "@/modules/ai-engine/harness/runtime";
import { ResearchMissionOrchestrator } from "../orchestrator/research-mission-orchestrator";
import { ResearchDynamicReplanner } from "../orchestrator/research-dynamic-replanner";
import { ChatFacadeLLMCaller } from "../orchestrator/chat-facade-llm-caller";
import { ProtocolRegistry } from "../protocols/protocol-registry";
import { PrismaStepStore } from "../adapters/prisma-step-store";
import { PrismaCheckpointStore } from "../adapters/prisma-checkpoint-store";
import { PrismaVerificationStore } from "../adapters/prisma-verification-store";
import { ResearchTaskStore } from "../adapters/research-task-store";
import { ResearchTaskQueue } from "../adapters/research-task-queue";

describe("ResearchMissionOrchestrator", () => {
  let orch: ResearchMissionOrchestrator;
  let prismaUpdate: jest.Mock;
  let runnerOrchestrate: jest.Mock;

  beforeEach(async () => {
    prismaUpdate = jest.fn().mockResolvedValue({});
    runnerOrchestrate = jest.fn();

    const module = await Test.createTestingModule({
      providers: [
        ResearchMissionOrchestrator,
        {
          provide: PrismaService,
          useValue: {
            researchMission: { update: prismaUpdate },
            researchTask: { findMany: jest.fn().mockResolvedValue([]) },
          },
        },
        {
          provide: MissionOrchestrator,
          useValue: { orchestrate: runnerOrchestrate },
        },
        { provide: ChatFacadeLLMCaller, useValue: {} },
        { provide: ProtocolRegistry, useValue: { get: jest.fn() } },
        {
          provide: ResearchDynamicReplanner,
          useValue: { onTaskCompleted: jest.fn() },
        },
        { provide: PrismaStepStore, useValue: {} },
        { provide: PrismaCheckpointStore, useValue: {} },
        { provide: PrismaVerificationStore, useValue: {} },
        { provide: ResearchTaskStore, useValue: {} },
        { provide: ResearchTaskQueue, useValue: { cancel: jest.fn() } },
      ],
    }).compile();

    orch = module.get(ResearchMissionOrchestrator);
  });

  it("builds scope + scopeMetadata from missionId/topicId and forwards to L2 orchestrator", async () => {
    const finalStats: QueueStats = {
      pending: 0,
      queued: 0,
      scheduled: 0,
      running: 0,
      completed: 3,
      failed: 0,
      cancelled: 0,
      awaitingHuman: 0,
      total: 3,
    };
    runnerOrchestrate.mockImplementation(async (opts) => {
      await opts.onFinalize?.(opts.scope, finalStats, opts.scopeMetadata);
      return finalStats;
    });

    const result = await orch.run({
      missionId: "mission-1",
      topicId: "topic-1",
      initialTaskIds: ["t1", "t2"],
    });

    expect(runnerOrchestrate).toHaveBeenCalledTimes(1);
    const [options, enqueueTaskIds] = runnerOrchestrate.mock.calls[0];
    expect(options.scope).toBe("mission-1");
    expect(options.scopeMetadata).toEqual({
      missionId: "mission-1",
      topicId: "topic-1",
    });
    expect(enqueueTaskIds).toEqual(["t1", "t2"]);
    expect(result).toBe(finalStats);

    // onFinalize flipped mission to COMPLETED with correct progressPercent
    expect(prismaUpdate).toHaveBeenCalledWith({
      where: { id: "mission-1" },
      data: expect.objectContaining({
        status: "COMPLETED",
        completedTasks: 3,
        totalTasks: 3,
        progressPercent: 100,
      }),
    });
  });

  it("marks mission FAILED when every task failed", async () => {
    const allFail: QueueStats = {
      pending: 0,
      queued: 0,
      scheduled: 0,
      running: 0,
      completed: 0,
      failed: 2,
      cancelled: 0,
      awaitingHuman: 0,
      total: 2,
    };
    runnerOrchestrate.mockImplementation(async (opts) => {
      await opts.onFinalize?.(opts.scope, allFail, opts.scopeMetadata);
      return allFail;
    });

    await orch.run({
      missionId: "m2",
      topicId: "t2",
      initialTaskIds: ["a"],
    });

    expect(prismaUpdate).toHaveBeenCalledWith({
      where: { id: "m2" },
      data: expect.objectContaining({
        status: "FAILED",
        completedTasks: 0,
        progressPercent: 0,
      }),
    });
  });

  it("marks mission REVIEWING if any tasks are awaiting human input", async () => {
    const hitl: QueueStats = {
      pending: 0,
      queued: 0,
      scheduled: 0,
      running: 0,
      completed: 1,
      failed: 0,
      cancelled: 0,
      awaitingHuman: 1,
      total: 2,
    };
    runnerOrchestrate.mockImplementation(async (opts) => {
      await opts.onFinalize?.(opts.scope, hitl, opts.scopeMetadata);
      return hitl;
    });

    await orch.run({
      missionId: "m3",
      topicId: "t3",
      initialTaskIds: ["x"],
    });

    expect(prismaUpdate).toHaveBeenCalledWith({
      where: { id: "m3" },
      data: expect.objectContaining({
        status: "REVIEWING",
        progressPercent: 50,
      }),
    });
  });
});
