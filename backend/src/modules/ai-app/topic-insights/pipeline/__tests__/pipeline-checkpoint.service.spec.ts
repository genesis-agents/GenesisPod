import { PipelineCheckpointService } from "../pipeline-checkpoint.service";
import type { PipelineIdentityContext } from "../types/identity-context";

describe("PipelineCheckpointService", () => {
  function buildIdentity(
    missionId: string,
    snapshot: Record<string, unknown>,
  ): PipelineIdentityContext {
    return {
      missionId,
      topicId: "topic-1",
      reportId: "report-1",
      userId: "user-1",
      cachePrefix: "prefix",
      abortController: new AbortController(),
      budget: {
        snapshot: () => snapshot as never,
      } as never,
      depth: "standard",
      mode: "fresh",
      degradationMode: false,
      capabilities: undefined,
    };
  }

  it("returns null when prisma not injected", async () => {
    const svc = new PipelineCheckpointService();
    expect(await svc.load("m")).toBeNull();
  });

  it("saveStage + load round-trips stage outputs", async () => {
    const upsertMock = jest.fn().mockResolvedValue({});
    const findUniqueMock = jest.fn().mockResolvedValue({
      missionId: "m1",
      completedStages: ["ST-00-INIT", "ST-01-PLAN"],
      stageResults: {
        "ST-00-INIT": { initialized: true },
        "ST-01-PLAN": { plan: { dimensions: [] } },
      },
      budgetSnapshot: { tokensUsed: 42, costUsd: 0 },
      identitySnapshot: {
        reportId: "r1",
        userId: "u1",
        cachePrefix: "p",
        depth: "standard",
        mode: "fresh",
        degradationMode: false,
      },
      lastStageId: "ST-01-PLAN",
      updatedAt: new Date("2026-04-23T00:00:00Z"),
    });
    const prisma = {
      pipelineRunCheckpoint: {
        upsert: upsertMock,
        findUnique: findUniqueMock,
        deleteMany: jest.fn(),
      },
    } as never;

    const svc = new PipelineCheckpointService(prisma);
    const identity = buildIdentity("m1", { tokensUsed: 42, costUsd: 0 });

    await svc.saveStage(
      identity,
      "ST-01-PLAN",
      { plan: { dimensions: [] } },
      ["ST-00-INIT", "ST-01-PLAN"],
      { "ST-00-INIT": { initialized: true } },
    );

    expect(upsertMock).toHaveBeenCalledTimes(1);
    const call = upsertMock.mock.calls[0][0];
    expect(call.where).toEqual({ missionId: "m1" });
    expect(call.create.lastStageId).toBe("ST-01-PLAN");
    expect(call.create.stageResults).toEqual({
      "ST-00-INIT": { initialized: true },
      "ST-01-PLAN": { plan: { dimensions: [] } },
    });

    const loaded = await svc.load("m1");
    expect(loaded).not.toBeNull();
    expect(loaded!.completedStages).toEqual(["ST-00-INIT", "ST-01-PLAN"]);
    expect(loaded!.lastStageId).toBe("ST-01-PLAN");
    expect(loaded!.identitySnapshot.depth).toBe("standard");
  });

  it("load returns null when row is missing", async () => {
    const prisma = {
      pipelineRunCheckpoint: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
    } as never;
    const svc = new PipelineCheckpointService(prisma);
    expect(await svc.load("unknown")).toBeNull();
  });

  it("clear deletes the row", async () => {
    const deleteMock = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      pipelineRunCheckpoint: {
        deleteMany: deleteMock,
        upsert: jest.fn(),
        findUnique: jest.fn(),
      },
    } as never;
    const svc = new PipelineCheckpointService(prisma);
    await svc.clear("m1");
    expect(deleteMock).toHaveBeenCalledWith({ where: { missionId: "m1" } });
  });

  it("saveStage swallows db errors without throwing", async () => {
    const prisma = {
      pipelineRunCheckpoint: {
        upsert: jest.fn().mockRejectedValue(new Error("db down")),
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
      },
    } as never;
    const svc = new PipelineCheckpointService(prisma);
    const identity = buildIdentity("m1", {});
    await expect(
      svc.saveStage(identity, "ST-00-INIT", {}, [], {}),
    ).resolves.toBeUndefined();
  });
});
