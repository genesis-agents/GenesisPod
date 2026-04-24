import { Test } from "@nestjs/testing";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ResearchMissionStatus } from "@prisma/client";

import { PrismaService } from "@/common/prisma/prisma.service";
import { ResearchEventEmitterService } from "@/modules/ai-app/topic-insights/mission/realtime/event-emitter.service";

import { MissionAmendmentService } from "../amendment.service";
import { MissionCancellationService } from "../cancellation.service";
import { MissionExecutionService } from "../execution.service";

function build() {
  const prisma = {
    researchMission: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    researchTask: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    topicDimension: {
      create: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    leaderDecision: { create: jest.fn() },
    $transaction: jest.fn(async (cb: unknown) => {
      if (typeof cb === "function") {
        return (cb as (tx: unknown) => Promise<unknown>)(prisma);
      }
      return cb;
    }),
  };

  const events = {
    emitResearchPaused: jest.fn().mockResolvedValue(undefined),
    emitResearchResumed: jest.fn().mockResolvedValue(undefined),
    emitDimensionAdded: jest.fn().mockResolvedValue(undefined),
    emitDimensionRemoved: jest.fn().mockResolvedValue(undefined),
  };

  const cancellation = {
    cancel: jest.fn().mockReturnValue(true),
  };

  const execution = {
    startExecution: jest.fn().mockResolvedValue(undefined),
  };

  return { prisma, events, cancellation, execution };
}

async function makeSvc(deps: ReturnType<typeof build>) {
  const mod = await Test.createTestingModule({
    providers: [
      MissionAmendmentService,
      { provide: PrismaService, useValue: deps.prisma },
      { provide: ResearchEventEmitterService, useValue: deps.events },
      { provide: MissionCancellationService, useValue: deps.cancellation },
      { provide: MissionExecutionService, useValue: deps.execution },
    ],
  }).compile();
  return mod.get(MissionAmendmentService);
}

describe("MissionAmendmentService", () => {
  it("throws NotFoundException when mission is missing", async () => {
    const deps = build();
    deps.prisma.researchMission.findUnique.mockResolvedValue(null);
    const svc = await makeSvc(deps);

    await expect(
      svc.pauseAndAmend("user-1", "missing", {
        addDimensions: [{ name: "x" }],
        requestedBy: "user-1",
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it("throws ForbiddenException when caller is not the topic owner", async () => {
    const deps = build();
    deps.prisma.researchMission.findUnique.mockResolvedValue({
      id: "m-1",
      status: ResearchMissionStatus.EXECUTING,
      topic: { id: "t-1", userId: "other-user" },
    });
    const svc = await makeSvc(deps);

    await expect(
      svc.pauseAndAmend("user-1", "m-1", {
        addDimensions: [{ name: "x" }],
        requestedBy: "user-1",
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("throws BadRequestException for missions in a terminal status", async () => {
    const deps = build();
    deps.prisma.researchMission.findUnique.mockResolvedValue({
      id: "m-1",
      status: ResearchMissionStatus.COMPLETED,
      topic: { id: "t-1", userId: "user-1" },
    });
    const svc = await makeSvc(deps);

    await expect(
      svc.pauseAndAmend("user-1", "m-1", {
        addDimensions: [{ name: "x" }],
        requestedBy: "user-1",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException when amendment is empty", async () => {
    const deps = build();
    deps.prisma.researchMission.findUnique.mockResolvedValue({
      id: "m-1",
      status: ResearchMissionStatus.EXECUTING,
      topic: { id: "t-1", userId: "user-1" },
    });
    const svc = await makeSvc(deps);

    await expect(
      svc.pauseAndAmend("user-1", "m-1", { requestedBy: "user-1" }),
    ).rejects.toThrow(BadRequestException);
  });

  it("creates TopicDimension rows + ResearchTask rows for addDimensions", async () => {
    const deps = build();
    deps.prisma.researchMission.findUnique.mockResolvedValue({
      id: "m-1",
      status: ResearchMissionStatus.EXECUTING,
      topic: { id: "t-1", userId: "user-1" },
    });
    deps.prisma.topicDimension.findFirst.mockResolvedValue({ sortOrder: 3 });
    deps.prisma.topicDimension.create.mockImplementation(
      async ({ data }: { data: { name: string } }) => ({
        id: `dim-new-${data.name}`,
        name: data.name,
        sortOrder: 4,
      }),
    );
    const svc = await makeSvc(deps);

    const result = await svc.pauseAndAmend("user-1", "m-1", {
      addDimensions: [{ name: "政策" }, { name: "资本" }],
      reason: "补充研究范围",
      requestedBy: "user-1",
    });

    expect(result.addedDimensionIds).toHaveLength(2);
    expect(deps.prisma.topicDimension.create).toHaveBeenCalledTimes(2);
    expect(deps.prisma.researchTask.create).toHaveBeenCalledTimes(2);
    expect(deps.events.emitResearchPaused).toHaveBeenCalled();
    expect(deps.events.emitDimensionAdded).toHaveBeenCalledTimes(2);
    // Resume fires as fire-and-forget; wait a tick
    await new Promise((r) => setImmediate(r));
    expect(deps.execution.startExecution).toHaveBeenCalledWith(
      "m-1",
      "t-1",
      expect.objectContaining({
        dimensionScope: expect.arrayContaining(result.addedDimensionIds),
      }),
    );
  });

  it("deletes TopicDimension + pending ResearchTask rows for removeDimensions", async () => {
    const deps = build();
    deps.prisma.researchMission.findUnique.mockResolvedValue({
      id: "m-1",
      status: ResearchMissionStatus.EXECUTING,
      topic: { id: "t-1", userId: "user-1" },
    });
    deps.prisma.topicDimension.findFirst.mockResolvedValue({
      id: "dim-42",
      name: "旧维度",
    });
    const svc = await makeSvc(deps);

    const result = await svc.pauseAndAmend("user-1", "m-1", {
      removeDimensions: ["dim-42"],
      requestedBy: "user-1",
    });

    expect(result.removedDimensionIds).toEqual(["dim-42"]);
    expect(deps.prisma.researchTask.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        missionId: "m-1",
        dimensionId: "dim-42",
      }),
    });
    expect(deps.prisma.topicDimension.delete).toHaveBeenCalledWith({
      where: { id: "dim-42" },
    });
    expect(deps.events.emitDimensionRemoved).toHaveBeenCalled();
  });

  it("records focusAreas without mutating dimensions", async () => {
    const deps = build();
    deps.prisma.researchMission.findUnique.mockResolvedValue({
      id: "m-1",
      status: ResearchMissionStatus.EXECUTING,
      topic: { id: "t-1", userId: "user-1" },
    });
    const svc = await makeSvc(deps);

    const result = await svc.pauseAndAmend("user-1", "m-1", {
      focusAreas: ["技术", "政策"],
      requestedBy: "user-1",
    });

    expect(result.focusAreasRecorded).toEqual(["技术", "政策"]);
    expect(deps.prisma.topicDimension.create).not.toHaveBeenCalled();
    expect(deps.prisma.topicDimension.delete).not.toHaveBeenCalled();
    expect(deps.prisma.leaderDecision.create).toHaveBeenCalled();
  });
});
