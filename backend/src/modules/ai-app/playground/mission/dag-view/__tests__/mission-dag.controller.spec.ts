/**
 * MissionDagController spec — unit tests covering all endpoints and branches.
 */

import { ForbiddenException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { MissionDagController } from "../mission-dag.controller";
import { MissionDagService } from "../mission-dag.service";
import { MissionOwnershipRegistry } from "@/modules/ai-harness/facade";
import { MissionStore } from "../../lifecycle/mission-store.service";
import type { RequestWithUser } from "../../../../../common/types/express-request.types";
import type {
  MissionDagGraph,
  MissionDagCascadePreview,
  MissionDagReactSnapshot,
} from "../mission-dag.types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(userId?: string): RequestWithUser {
  return {
    user: userId ? { id: userId } : undefined,
  } as RequestWithUser;
}

function makeDagGraph(): MissionDagGraph {
  return {
    nodes: [
      {
        id: "s1-budget",
        kind: "macro",
        label: "Budget Gate",
        status: "done",
        rerunable: false,
        rerunableReason: "预算闸不可重跑",
      },
    ],
    edges: [],
  };
}

function makeCascadePreview(): MissionDagCascadePreview {
  return {
    rerunable: true,
    willRerun: ["s3-researcher-collect", "s4-leader-assess"],
    willPreserve: [],
  };
}

function makeReactSnapshot(): MissionDagReactSnapshot {
  return {
    nodeId: "s8-writer",
    role: "writer",
    phase: "running",
    currentStep: "thinking",
    iter: 2,
    maxIter: 8,
    finalizeAttempts: 0,
    lastThought: "I need to write a report.",
    lastAction: null,
    lastObservation: null,
    lastError: null,
    agentId: "writer#1",
    dimension: undefined,
    note: undefined,
  };
}

function buildController(opts: {
  ownershipGetOwner?: string | null;
  ownershipAssign?: jest.Mock;
  storeGetById?: Record<string, unknown> | null;
  storeGetAccessMeta?: { userId: string; visibility: string } | null;
  dagBuildGraph?: MissionDagGraph | Error;
  dagComputeCascade?: MissionDagCascadePreview | Error;
  dagBuildReactSnapshot?: MissionDagReactSnapshot | Error;
}) {
  const ownershipMock: Partial<MissionOwnershipRegistry> = {
    getOwner: jest.fn().mockReturnValue(opts.ownershipGetOwner ?? null),
    assign: opts.ownershipAssign ?? jest.fn(),
  };

  const storeMock: Partial<MissionStore> = {
    getById: jest
      .fn()
      .mockResolvedValue(
        opts.storeGetById !== undefined ? opts.storeGetById : { id: "m-1" },
      ),
    getAccessMetaById: jest
      .fn()
      .mockResolvedValue(
        opts.storeGetAccessMeta !== undefined
          ? opts.storeGetAccessMeta
          : { userId: "u-1", visibility: "PRIVATE" },
      ),
  };

  const dagServiceMock: Partial<MissionDagService> = {
    buildGraph:
      opts.dagBuildGraph instanceof Error
        ? jest.fn().mockRejectedValue(opts.dagBuildGraph)
        : jest.fn().mockResolvedValue(opts.dagBuildGraph ?? makeDagGraph()),
    computeCascade:
      opts.dagComputeCascade instanceof Error
        ? jest.fn().mockRejectedValue(opts.dagComputeCascade)
        : jest
            .fn()
            .mockResolvedValue(opts.dagComputeCascade ?? makeCascadePreview()),
    buildReactSnapshot:
      opts.dagBuildReactSnapshot instanceof Error
        ? jest.fn().mockRejectedValue(opts.dagBuildReactSnapshot)
        : jest
            .fn()
            .mockResolvedValue(
              opts.dagBuildReactSnapshot ?? makeReactSnapshot(),
            ),
  };

  return Test.createTestingModule({
    controllers: [MissionDagController],
    providers: [
      { provide: MissionOwnershipRegistry, useValue: ownershipMock },
      { provide: MissionStore, useValue: storeMock },
      { provide: MissionDagService, useValue: dagServiceMock },
    ],
  })
    .compile()
    .then((module: TestingModule) => ({
      controller: module.get<MissionDagController>(MissionDagController),
      ownershipMock,
      storeMock,
      dagServiceMock,
    }));
}

// ============================================================================
// Tests
// ============================================================================

describe("MissionDagController", () => {
  // --------------------------------------------------------------------------
  // GET /missions/:id/dag
  // --------------------------------------------------------------------------

  describe("getDag", () => {
    it("returns DAG graph for authenticated owner", async () => {
      const { controller } = await buildController({
        ownershipGetOwner: "u-1",
      });
      const req = makeReq("u-1");

      const result = await controller.getDag("m-1", req);

      expect(result.nodes).toBeDefined();
      expect(result.nodes[0].id).toBe("s1-budget");
    });

    it("throws ForbiddenException when no userId on request (user undefined)", async () => {
      const { controller } = await buildController({});
      const req = makeReq(undefined);

      await expect(controller.getDag("m-1", req)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("throws ForbiddenException when req.user is null (covers ?.id null branch)", async () => {
      const { controller } = await buildController({});
      const req = { user: null } as unknown as RequestWithUser;

      await expect(controller.getDag("m-1", req)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("throws ForbiddenException when user does not own mission (registry miss + store returns null)", async () => {
      const { controller } = await buildController({
        ownershipGetOwner: null,
        storeGetById: null,
      });
      const req = makeReq("u-2");

      await expect(controller.getDag("m-1", req)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("delegates to dagService.buildGraph with correct missionId and userId", async () => {
      const { controller, dagServiceMock } = await buildController({
        ownershipGetOwner: "u-1",
      });
      const req = makeReq("u-1");

      await controller.getDag("m-1", req);

      expect(dagServiceMock.buildGraph).toHaveBeenCalledWith("m-1", "u-1");
    });

    it("propagates errors from dagService.buildGraph", async () => {
      const { controller } = await buildController({
        ownershipGetOwner: "u-1",
        dagBuildGraph: new Error("service error"),
      });
      const req = makeReq("u-1");

      await expect(controller.getDag("m-1", req)).rejects.toThrow(
        "service error",
      );
    });

    it("uses fallback ownership check via store.getById when registry misses", async () => {
      const { controller, storeMock, dagServiceMock } = await buildController({
        ownershipGetOwner: null,
        storeGetById: { id: "m-1", userId: "u-1" },
      });
      const req = makeReq("u-1");

      const result = await controller.getDag("m-1", req);

      expect(storeMock.getById).toHaveBeenCalledWith("m-1", "u-1");
      expect(result).toBeDefined();
      expect(dagServiceMock.buildGraph).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // GET /missions/:id/dag/cascade
  // --------------------------------------------------------------------------

  describe("getCascadePreview", () => {
    it("returns cascade preview for authenticated owner", async () => {
      const { controller } = await buildController({
        ownershipGetOwner: "u-1",
      });
      const req = makeReq("u-1");

      const result = await controller.getCascadePreview(
        "m-1",
        "s3-researcher-collect",
        req,
      );

      expect(result.rerunable).toBe(true);
      expect(result.willRerun).toContain("s3-researcher-collect");
    });

    it("throws ForbiddenException when no userId", async () => {
      const { controller } = await buildController({});
      const req = makeReq(undefined);

      await expect(
        controller.getCascadePreview("m-1", "s2-leader-plan", req),
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws ForbiddenException when req.user is null (cascade)", async () => {
      const { controller } = await buildController({});
      const req = { user: null } as unknown as RequestWithUser;

      await expect(
        controller.getCascadePreview("m-1", "s2", req),
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws ForbiddenException when nodeId (from) query param is missing/empty", async () => {
      const { controller } = await buildController({
        ownershipGetOwner: "u-1",
      });
      const req = makeReq("u-1");

      await expect(
        controller.getCascadePreview("m-1", "", req),
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws ForbiddenException when nodeId is undefined (cast to falsy)", async () => {
      const { controller } = await buildController({
        ownershipGetOwner: "u-1",
      });
      const req = makeReq("u-1");

      // Simulate missing query param → NestJS passes undefined
      await expect(
        controller.getCascadePreview(
          "m-1",
          undefined as unknown as string,
          req,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it("delegates to dagService.computeCascade with correct params", async () => {
      const { controller, dagServiceMock } = await buildController({
        ownershipGetOwner: "u-1",
      });
      const req = makeReq("u-1");

      await controller.getCascadePreview("m-1", "s2-leader-plan", req);

      expect(dagServiceMock.computeCascade).toHaveBeenCalledWith(
        "m-1",
        "u-1",
        "s2-leader-plan",
      );
    });

    it("propagates errors from dagService.computeCascade", async () => {
      const { controller } = await buildController({
        ownershipGetOwner: "u-1",
        dagComputeCascade: new Error("cascade error"),
      });
      const req = makeReq("u-1");

      await expect(
        controller.getCascadePreview("m-1", "s2-leader-plan", req),
      ).rejects.toThrow("cascade error");
    });

    it("throws ForbiddenException when non-owner calls cascade", async () => {
      const { controller } = await buildController({
        ownershipGetOwner: "u-1", // owner is u-1
      });
      const req = makeReq("u-2"); // requester is u-2

      await expect(
        controller.getCascadePreview("m-1", "s2", req),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // --------------------------------------------------------------------------
  // GET /missions/:id/dag/react/:nodeId
  // --------------------------------------------------------------------------

  describe("getReactSnapshot", () => {
    it("returns react snapshot for authenticated owner", async () => {
      const { controller } = await buildController({
        ownershipGetOwner: "u-1",
      });
      const req = makeReq("u-1");

      const result = await controller.getReactSnapshot("m-1", "s8-writer", req);

      expect(result.role).toBe("writer");
      expect(result.phase).toBe("running");
    });

    it("throws ForbiddenException when no userId", async () => {
      const { controller } = await buildController({});
      const req = makeReq(undefined);

      await expect(
        controller.getReactSnapshot("m-1", "s8-writer", req),
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws ForbiddenException when req.user is null (react snapshot)", async () => {
      const { controller } = await buildController({});
      const req = { user: null } as unknown as RequestWithUser;

      await expect(
        controller.getReactSnapshot("m-1", "s8-writer", req),
      ).rejects.toThrow(ForbiddenException);
    });

    it("delegates to dagService.buildReactSnapshot with correct params", async () => {
      const { controller, dagServiceMock } = await buildController({
        ownershipGetOwner: "u-1",
      });
      const req = makeReq("u-1");

      await controller.getReactSnapshot(
        "m-1",
        "s3-researcher-collect::d1",
        req,
      );

      expect(dagServiceMock.buildReactSnapshot).toHaveBeenCalledWith(
        "m-1",
        "u-1",
        "s3-researcher-collect::d1",
      );
    });

    it("propagates errors from dagService.buildReactSnapshot", async () => {
      const { controller } = await buildController({
        ownershipGetOwner: "u-1",
        dagBuildReactSnapshot: new Error("snapshot error"),
      });
      const req = makeReq("u-1");

      await expect(
        controller.getReactSnapshot("m-1", "s8-writer", req),
      ).rejects.toThrow("snapshot error");
    });

    it("throws ForbiddenException for non-owner accessing snapshot", async () => {
      const { controller } = await buildController({
        ownershipGetOwner: "u-1",
      });
      const req = makeReq("u-99"); // different user

      await expect(
        controller.getReactSnapshot("m-1", "s8-writer", req),
      ).rejects.toThrow(ForbiddenException);
    });

    it("uses store fallback when registry does not have owner", async () => {
      const { controller, storeMock } = await buildController({
        ownershipGetOwner: null, // registry miss
        storeGetById: { id: "m-1", userId: "u-1" },
      });
      const req = makeReq("u-1");

      await controller.getReactSnapshot("m-1", "s1-budget", req);

      expect(storeMock.getById).toHaveBeenCalledWith("m-1", "u-1");
    });
  });
});
