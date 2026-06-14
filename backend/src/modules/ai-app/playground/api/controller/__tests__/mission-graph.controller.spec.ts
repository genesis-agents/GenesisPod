/**
 * MissionGraphController spec — unit tests covering all endpoints and branches.
 *
 * Relies on NestJS test module; all dependencies are mocked.
 */

import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { MissionGraphController } from "../mission-graph.controller";
import { MissionGraphService } from "../../../mission/graph/mission-graph.service";
import { MissionOwnershipRegistry } from "@/modules/ai-harness/facade";
import { MissionStore } from "../../../mission/lifecycle/mission-store.service";
import type { RequestWithUser } from "../../../../../common/types/express-request.types";
import type {
  MissionGraphArtifact,
  NodeEnrichment,
} from "../../../mission/graph/mission-graph.types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(userId?: string): RequestWithUser {
  return {
    user: userId ? { id: userId } : undefined,
  } as RequestWithUser;
}

function makeReadyArtifact(): MissionGraphArtifact {
  return {
    status: "READY",
    graph: {
      nodes: [{ id: "n0", label: "NVIDIA", type: "ORGANIZATION" }],
      edges: [],
      stats: { totalNodes: 1, totalEdges: 0 },
    },
    analyses: {
      keyNodes: { items: [], summary: "done" },
      relatedness: { pairs: [], summary: "" },
      competitive: { clusters: [], summary: "" },
      community: { communities: [], summary: "" },
      supplyChain: { layers: [], summary: "" },
    },
    generatedAt: "2024-01-01T00:00:00.000Z",
  };
}

function makeNoneArtifact(): MissionGraphArtifact {
  return { status: "NONE", graph: null, analyses: null, generatedAt: null };
}

function makeFailedArtifact(): MissionGraphArtifact {
  return { status: "FAILED", graph: null, analyses: null, generatedAt: null };
}

function makeNodeEnrichment(nodeId = "n0"): NodeEnrichment {
  return {
    nodeId,
    label: "NVIDIA",
    type: "ORGANIZATION",
    description: "NVIDIA是领先的AI芯片制造商。",
    facts: [{ label: "成立时间", value: "1993" }],
    sources: [{ title: "NVIDIA", url: "https://nvidia.com" }],
  };
}

/**
 * Build a controller + mocks. Registry mock controls assertOwnership:
 *  - if ownershipGetOwner === userId → owner fast path
 *  - if ownershipGetOwner !== userId → fallback to store.getById
 */
async function buildController(opts: {
  ownershipGetOwner?: string | null;
  storeGetById?: Record<string, unknown> | null;
  storeGetAccessMeta?: { userId: string; visibility: string } | null;
  getArtifactResult?: MissionGraphArtifact | Error;
  buildResult?: MissionGraphArtifact | Error;
  enrichNodeResult?: NodeEnrichment | Error;
}) {
  const ownershipMock: Partial<MissionOwnershipRegistry> = {
    getOwner: jest.fn().mockReturnValue(opts.ownershipGetOwner ?? null),
    assign: jest.fn(),
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

  const graphServiceMock: Partial<MissionGraphService> = {
    getArtifact:
      opts.getArtifactResult instanceof Error
        ? jest.fn().mockRejectedValue(opts.getArtifactResult)
        : jest
            .fn()
            .mockResolvedValue(opts.getArtifactResult ?? makeReadyArtifact()),
    build:
      opts.buildResult instanceof Error
        ? jest.fn().mockRejectedValue(opts.buildResult)
        : jest.fn().mockResolvedValue(opts.buildResult ?? makeReadyArtifact()),
    enrichNode:
      opts.enrichNodeResult instanceof Error
        ? jest.fn().mockRejectedValue(opts.enrichNodeResult)
        : jest
            .fn()
            .mockResolvedValue(opts.enrichNodeResult ?? makeNodeEnrichment()),
  };

  const module: TestingModule = await Test.createTestingModule({
    controllers: [MissionGraphController],
    providers: [
      { provide: MissionOwnershipRegistry, useValue: ownershipMock },
      { provide: MissionStore, useValue: storeMock },
      { provide: MissionGraphService, useValue: graphServiceMock },
    ],
  }).compile();

  return {
    controller: module.get<MissionGraphController>(MissionGraphController),
    ownershipMock,
    storeMock,
    graphServiceMock,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("MissionGraphController", () => {
  // --------------------------------------------------------------------------
  // GET /missions/:id/graph (getGraph)
  // --------------------------------------------------------------------------

  describe("getGraph", () => {
    it("returns READY artifact for authenticated owner", async () => {
      const { controller } = await buildController({
        ownershipGetOwner: "u-1",
      });
      const req = makeReq("u-1");

      const result = await controller.getGraph("m-1", req);

      expect(result.status).toBe("READY");
      expect(result.graph).not.toBeNull();
    });

    it("returns NONE artifact when graph was never built", async () => {
      const { controller } = await buildController({
        ownershipGetOwner: "u-1",
        getArtifactResult: makeNoneArtifact(),
      });
      const req = makeReq("u-1");

      const result = await controller.getGraph("m-1", req);

      expect(result.status).toBe("NONE");
      expect(result.graph).toBeNull();
    });

    it("throws ForbiddenException when no userId on request (user undefined)", async () => {
      const { controller } = await buildController({});
      const req = makeReq(undefined);

      await expect(controller.getGraph("m-1", req)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("throws ForbiddenException when req.user is null (covers ?.id null branch)", async () => {
      const { controller } = await buildController({});
      const req = { user: null } as unknown as RequestWithUser;

      await expect(controller.getGraph("m-1", req)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("throws ForbiddenException when user does not own and store.getById returns null", async () => {
      const { controller } = await buildController({
        ownershipGetOwner: null,
        storeGetById: null,
        storeGetAccessMeta: null,
      });
      const req = makeReq("u-2");

      await expect(controller.getGraph("m-1", req)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("delegates to graphService.getArtifact with userId and missionId", async () => {
      const { controller, graphServiceMock } = await buildController({
        ownershipGetOwner: "u-1",
      });
      const req = makeReq("u-1");

      await controller.getGraph("m-1", req);

      expect(graphServiceMock.getArtifact).toHaveBeenCalledWith("u-1", "m-1");
    });

    it("propagates errors from graphService.getArtifact", async () => {
      const { controller } = await buildController({
        ownershipGetOwner: "u-1",
        getArtifactResult: new Error("DB error"),
      });
      const req = makeReq("u-1");

      await expect(controller.getGraph("m-1", req)).rejects.toThrow("DB error");
    });

    it("grants read access for PUBLIC mission owned by different user", async () => {
      const { controller } = await buildController({
        ownershipGetOwner: null, // registry miss
        storeGetById: null, // no getById match (u-2 is not owner)
        storeGetAccessMeta: { userId: "u-1", visibility: "PUBLIC" },
        getArtifactResult: makeReadyArtifact(),
      });
      const req = makeReq("u-2"); // reader, not owner

      // Should succeed because mission is PUBLIC
      const result = await controller.getGraph("m-1", req);

      expect(result.status).toBe("READY");
    });

    it("uses fast path when ownership registry matches userId", async () => {
      const { controller, storeMock } = await buildController({
        ownershipGetOwner: "u-1",
      });
      const req = makeReq("u-1");

      await controller.getGraph("m-1", req);

      // Fast path: no store access needed
      expect(storeMock.getAccessMetaById).not.toHaveBeenCalled();
    });

    it("assigns ownership to registry after store confirms ownership", async () => {
      const { controller, ownershipMock } = await buildController({
        ownershipGetOwner: null,
        storeGetById: null,
        storeGetAccessMeta: { userId: "u-1", visibility: "PRIVATE" },
      });
      const req = makeReq("u-1");

      await controller.getGraph("m-1", req);

      expect(ownershipMock.assign).toHaveBeenCalledWith("m-1", "u-1");
    });
  });

  // --------------------------------------------------------------------------
  // POST /missions/:id/graph (buildGraph)
  // --------------------------------------------------------------------------

  describe("buildGraph", () => {
    it("returns READY artifact after build", async () => {
      const { controller } = await buildController({
        ownershipGetOwner: "u-1",
      });
      const req = makeReq("u-1");

      const result = await controller.buildGraph("m-1", req);

      expect(result.status).toBe("READY");
    });

    it("returns FAILED artifact when build encounters errors", async () => {
      const { controller } = await buildController({
        ownershipGetOwner: "u-1",
        buildResult: makeFailedArtifact(),
      });
      const req = makeReq("u-1");

      const result = await controller.buildGraph("m-1", req);

      expect(result.status).toBe("FAILED");
    });

    it("throws ForbiddenException when no userId", async () => {
      const { controller } = await buildController({});
      const req = makeReq(undefined);

      await expect(controller.buildGraph("m-1", req)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("throws ForbiddenException when req.user is null in buildGraph", async () => {
      const { controller } = await buildController({});
      const req = { user: null } as unknown as RequestWithUser;

      await expect(controller.buildGraph("m-1", req)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("throws ForbiddenException when ownership check fails", async () => {
      const { controller } = await buildController({
        ownershipGetOwner: null,
        storeGetById: null,
        storeGetAccessMeta: null,
      });
      const req = makeReq("u-2");

      await expect(controller.buildGraph("m-1", req)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("delegates to graphService.build with userId and missionId", async () => {
      const { controller, graphServiceMock } = await buildController({
        ownershipGetOwner: "u-1",
      });
      const req = makeReq("u-1");

      await controller.buildGraph("m-1", req);

      expect(graphServiceMock.build).toHaveBeenCalledWith("u-1", "m-1");
    });

    it("propagates errors thrown by graphService.build", async () => {
      const { controller } = await buildController({
        ownershipGetOwner: "u-1",
        buildResult: new Error("build failed"),
      });
      const req = makeReq("u-1");

      await expect(controller.buildGraph("m-1", req)).rejects.toThrow(
        "build failed",
      );
    });

    it("uses store fallback for ownership when registry misses", async () => {
      const { controller, storeMock } = await buildController({
        ownershipGetOwner: null,
        storeGetById: { id: "m-1" },
        storeGetAccessMeta: { userId: "u-1", visibility: "PRIVATE" },
      });
      const req = makeReq("u-1");

      await controller.buildGraph("m-1", req);

      // assertReadAccess uses getAccessMetaById for non-registry path
      expect(storeMock.getAccessMetaById).toHaveBeenCalledWith("m-1");
    });
  });

  // --------------------------------------------------------------------------
  // GET /missions/:id/graph/node/:nodeId/enrich (enrichNode)
  // --------------------------------------------------------------------------

  describe("enrichNode", () => {
    it("returns node enrichment for authenticated owner", async () => {
      const { controller } = await buildController({
        ownershipGetOwner: "u-1",
      });
      const req = makeReq("u-1");

      const result = await controller.enrichNode("m-1", "n0", req);

      expect(result.nodeId).toBe("n0");
      expect(result.label).toBe("NVIDIA");
      expect(result.description).toBeTruthy();
    });

    it("throws ForbiddenException when no userId", async () => {
      const { controller } = await buildController({});
      const req = makeReq(undefined);

      await expect(controller.enrichNode("m-1", "n0", req)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("throws ForbiddenException when req.user is null in enrichNode", async () => {
      const { controller } = await buildController({});
      const req = { user: null } as unknown as RequestWithUser;

      await expect(controller.enrichNode("m-1", "n0", req)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("throws ForbiddenException when ownership check fails", async () => {
      const { controller } = await buildController({
        ownershipGetOwner: null,
        storeGetById: null,
        storeGetAccessMeta: null,
      });
      const req = makeReq("u-99");

      await expect(controller.enrichNode("m-1", "n0", req)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("delegates to graphService.enrichNode with userId, missionId, nodeId", async () => {
      const { controller, graphServiceMock } = await buildController({
        ownershipGetOwner: "u-1",
        enrichNodeResult: makeNodeEnrichment("n1"),
      });
      const req = makeReq("u-1");

      const result = await controller.enrichNode("m-1", "n1", req);

      expect(graphServiceMock.enrichNode).toHaveBeenCalledWith(
        "u-1",
        "m-1",
        "n1",
      );
      expect(result.nodeId).toBe("n1");
    });

    it("propagates NotFoundException from graphService.enrichNode", async () => {
      const { controller } = await buildController({
        ownershipGetOwner: "u-1",
        enrichNodeResult: new NotFoundException("graph node n99 not found"),
      });
      const req = makeReq("u-1");

      await expect(controller.enrichNode("m-1", "n99", req)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("propagates generic errors from graphService.enrichNode", async () => {
      const { controller } = await buildController({
        ownershipGetOwner: "u-1",
        enrichNodeResult: new Error("enrichment failed"),
      });
      const req = makeReq("u-1");

      await expect(controller.enrichNode("m-1", "n0", req)).rejects.toThrow(
        "enrichment failed",
      );
    });

    it("allows PUBLIC mission reader to enrich node", async () => {
      const { controller } = await buildController({
        ownershipGetOwner: null,
        storeGetById: null,
        storeGetAccessMeta: { userId: "u-1", visibility: "PUBLIC" },
        enrichNodeResult: makeNodeEnrichment("n0"),
      });
      const req = makeReq("u-2"); // reader, not owner

      const result = await controller.enrichNode("m-1", "n0", req);

      expect(result.nodeId).toBe("n0");
    });

    it("returns enrichment for a different node ID", async () => {
      const { controller } = await buildController({
        ownershipGetOwner: "u-1",
        enrichNodeResult: makeNodeEnrichment("cuda-node"),
      });
      const req = makeReq("u-1");

      const result = await controller.enrichNode("m-1", "cuda-node", req);

      expect(result.nodeId).toBe("cuda-node");
    });
  });
});
