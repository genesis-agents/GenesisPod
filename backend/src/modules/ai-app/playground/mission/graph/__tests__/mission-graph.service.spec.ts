/**
 * MissionGraphService spec — unit tests targeting all public methods and branches.
 *
 * Dependencies are fully mocked; no DB or LLM is called.
 */

import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { MissionGraphService } from "../mission-graph.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  AiChatService,
  EntityResolutionService,
  SearchService,
} from "@/modules/ai-engine/facade";
import { MissionQueryService } from "../../query/mission-query.service";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeEmptyInputs(overrides: Record<string, unknown> = {}) {
  return {
    mode: "row-loaded" as const,
    missionId: "m-1",
    row: null,
    events: [],
    resume: { resumable: false, reason: "" },
    rerunnableStages: [],
    reportVersions: [],
    composedArtifact: {
      kind: "empty-artifact",
      reason: "not-yet-materialized",
    },
    ...overrides,
  };
}

function makeComposedArtifact(overrides: Record<string, unknown> = {}) {
  return {
    version: "v2" as const,
    content: { fullMarkdown: "# Report\nSome content about AI and NVIDIA." },
    sections: [],
    quickView: { executiveSummary: { markdown: "" } },
    factTable: [],
    ...overrides,
  };
}

function makeGraphRow(overrides: Record<string, unknown> = {}) {
  return {
    missionId: "m-1",
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
    generatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

function _buildChatMock(content: string | null = null) {
  return jest.fn().mockResolvedValue({ content });
}

function makeExtractionJson(
  entities: { name: string; type: string }[] = [],
  relations: { source: string; target: string; type: string }[] = [],
) {
  return JSON.stringify({ entities, relations });
}

function makeAnalysisSummaryJson(partial: Record<string, unknown> = {}) {
  return JSON.stringify({
    keyNodes: "核心节点分析完成",
    relatedness: "关联分析完成",
    competitive: "竞争分析完成",
    community: "社区分析完成",
    supplyChain: "供应链分析完成",
    supplyChainLayers: [],
    ...partial,
  });
}

// ---------------------------------------------------------------------------
// Mock builders
// ---------------------------------------------------------------------------

function buildMocks(opts: {
  inputsOverride?: Record<string, unknown>;
  graphRow?: Record<string, unknown> | null;
  chatResponses?: (string | null)[];
  resolveResult?: Record<string, string>;
  resolveThrows?: boolean;
  searchResults?: { title: string; url: string; content: string }[];
  searchThrows?: boolean;
}) {
  const {
    inputsOverride,
    graphRow,
    chatResponses = [],
    resolveResult,
    resolveThrows = false,
    searchResults = [],
    searchThrows = false,
  } = opts;

  const chatMock = jest.fn();
  if (chatResponses.length > 0) {
    for (const r of chatResponses) {
      chatMock.mockResolvedValueOnce({ content: r });
    }
    chatMock.mockResolvedValue({ content: null });
  } else {
    chatMock.mockResolvedValue({ content: null });
  }

  const resolveEntityMock = resolveThrows
    ? jest.fn().mockRejectedValue(new Error("resolution failed"))
    : jest.fn().mockResolvedValue({
        canonicalOf: resolveResult ?? {},
      });

  const searchMock = searchThrows
    ? jest.fn().mockRejectedValue(new Error("search error"))
    : jest.fn().mockResolvedValue({ results: searchResults });

  const prismaMock = {
    playgroundMissionGraph: {
      findUnique: jest
        .fn()
        .mockResolvedValue(graphRow === undefined ? null : graphRow),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };

  const missionQueryMock = {
    loadInputs: jest
      .fn()
      .mockResolvedValue(makeEmptyInputs(inputsOverride ?? {})),
  };

  return {
    chatMock,
    resolveEntityMock,
    searchMock,
    prismaMock,
    missionQueryMock,
  };
}

async function createService(mocks: ReturnType<typeof buildMocks>) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      MissionGraphService,
      { provide: PrismaService, useValue: mocks.prismaMock },
      { provide: MissionQueryService, useValue: mocks.missionQueryMock },
      {
        provide: AiChatService,
        useValue: { chat: mocks.chatMock },
      },
      {
        provide: EntityResolutionService,
        useValue: { resolve: mocks.resolveEntityMock },
      },
      {
        provide: SearchService,
        useValue: { search: mocks.searchMock },
      },
    ],
  }).compile();

  return module.get<MissionGraphService>(MissionGraphService);
}

// ============================================================================
// Tests
// ============================================================================

describe("MissionGraphService", () => {
  // --------------------------------------------------------------------------
  // getArtifact
  // --------------------------------------------------------------------------

  describe("getArtifact", () => {
    it("returns NONE artifact when no DB row exists", async () => {
      const mocks = buildMocks({ graphRow: null });
      const service = await createService(mocks);

      const result = await service.getArtifact("u-1", "m-1");

      expect(result.status).toBe("NONE");
      expect(result.graph).toBeNull();
      expect(result.analyses).toBeNull();
      expect(result.generatedAt).toBeNull();
    });

    it("returns artifact from DB row when found", async () => {
      const row = makeGraphRow({ status: "READY" });
      const mocks = buildMocks({ graphRow: row });
      const service = await createService(mocks);

      const result = await service.getArtifact("u-1", "m-1");

      expect(result.status).toBe("READY");
      expect(result.graph).toBeDefined();
      expect(result.generatedAt).toBe(row.generatedAt.toISOString());
    });

    it("delegates ownership check to missionQuery.loadInputs", async () => {
      const mocks = buildMocks({ graphRow: null });
      const service = await createService(mocks);

      await service.getArtifact("u-1", "m-1");

      expect(mocks.missionQueryMock.loadInputs).toHaveBeenCalledWith(
        "m-1",
        "u-1",
      );
    });

    it("propagates ForbiddenException from loadInputs", async () => {
      const mocks = buildMocks({ graphRow: null });
      mocks.missionQueryMock.loadInputs.mockRejectedValue(
        new Error("Forbidden"),
      );
      const service = await createService(mocks);

      await expect(service.getArtifact("u-1", "m-1")).rejects.toThrow(
        "Forbidden",
      );
    });
  });

  // --------------------------------------------------------------------------
  // build — top-level wrapper that catches errors
  // --------------------------------------------------------------------------

  describe("build", () => {
    it("returns FAILED artifact when report text is empty", async () => {
      // composedArtifact is empty sentinel (kind=empty-artifact), row has no reportFull
      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact: {
            kind: "empty-artifact",
            reason: "not-yet-materialized",
          },
        },
        graphRow: null,
      });
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("FAILED");
    });

    it("returns FAILED artifact when extraction fails both attempts", async () => {
      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact: makeComposedArtifact(),
        },
        chatResponses: [null, null], // both extraction attempts return null content
        graphRow: null,
      });
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("FAILED");
    });

    it("returns FAILED when _build throws unexpectedly", async () => {
      const mocks = buildMocks({ graphRow: null });
      mocks.missionQueryMock.loadInputs.mockRejectedValue(
        new Error("DB error"),
      );
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("FAILED");
    });

    it("returns READY artifact on successful build", async () => {
      const entities = [
        { name: "NVIDIA", type: "ORGANIZATION" },
        { name: "Intel", type: "ORGANIZATION" },
        { name: "AI Chip", type: "TECHNOLOGY" },
      ];
      const relations = [
        { source: "NVIDIA", target: "Intel", type: "COMPETES_WITH" },
        { source: "NVIDIA", target: "AI Chip", type: "PRODUCES" },
      ];
      const extractionJson = makeExtractionJson(entities, relations);
      const summaryJson = makeAnalysisSummaryJson({
        supplyChainLayers: [{ order: 0, description: "Layer 0 desc" }],
      });

      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact: makeComposedArtifact(),
        },
        chatResponses: [extractionJson, summaryJson],
        resolveResult: {
          NVIDIA: "NVIDIA",
          Intel: "Intel",
          "AI Chip": "AI Chip",
        },
        graphRow: null,
      });
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("READY");
      expect(result.graph).not.toBeNull();
      expect(result.graph!.nodes.length).toBeGreaterThan(0);
    });

    it("uses entity resolution canonical names for nodes", async () => {
      const entities = [
        { name: "NVIDIA Corp", type: "ORGANIZATION" },
        { name: "NVIDIA", type: "ORGANIZATION" }, // alias
        { name: "Intel", type: "ORGANIZATION" },
      ];
      const relations = [
        { source: "NVIDIA Corp", target: "Intel", type: "COMPETES_WITH" },
        { source: "NVIDIA", target: "Intel", type: "RELATED_TO" },
      ];
      const extractionJson = makeExtractionJson(entities, relations);
      const summaryJson = makeAnalysisSummaryJson();

      // resolution: both NVIDIA Corp and NVIDIA → canonical "NVIDIA"
      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact: makeComposedArtifact(),
        },
        chatResponses: [extractionJson, summaryJson],
        resolveResult: {
          "NVIDIA Corp": "NVIDIA",
          NVIDIA: "NVIDIA",
          Intel: "Intel",
        },
        graphRow: null,
      });
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("READY");
      // After dedup, only one NVIDIA node
      const nvidiaNodes = result.graph!.nodes.filter(
        (n) => n.label === "NVIDIA",
      );
      expect(nvidiaNodes).toHaveLength(1);
    });

    it("falls back to identity mapping when entity resolution throws", async () => {
      const entities = [
        { name: "Apple", type: "ORGANIZATION" },
        { name: "Google", type: "ORGANIZATION" },
      ];
      const relations = [
        { source: "Apple", target: "Google", type: "COMPETES_WITH" },
      ];
      const extractionJson = makeExtractionJson(entities, relations);
      const summaryJson = makeAnalysisSummaryJson();

      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact: makeComposedArtifact(),
        },
        chatResponses: [extractionJson, summaryJson],
        resolveThrows: true,
        graphRow: null,
      });
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("READY");
      const labels = result.graph!.nodes.map((n) => n.label).sort();
      expect(labels).toEqual(["Apple", "Google"]);
    });

    it("drops dangling edges (source/target not in node map)", async () => {
      const entities = [{ name: "Apple", type: "ORGANIZATION" }];
      const relations = [
        // target "Ghost" not in entities → dangling
        { source: "Apple", target: "Ghost", type: "RELATED_TO" },
      ];
      const extractionJson = makeExtractionJson(entities, relations);
      const summaryJson = makeAnalysisSummaryJson();

      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact: makeComposedArtifact(),
        },
        chatResponses: [extractionJson, summaryJson],
        resolveResult: { Apple: "Apple" },
        graphRow: null,
      });
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.graph!.edges).toHaveLength(0);
    });

    it("drops self-loops (source === target after canonical mapping)", async () => {
      const entities = [{ name: "Apple", type: "ORGANIZATION" }];
      const relations = [
        // after canonical mapping Apple→Apple: self-loop, should be dropped
        { source: "Apple", target: "Apple", type: "RELATED_TO" },
      ];
      const extractionJson = makeExtractionJson(entities, relations);
      const summaryJson = makeAnalysisSummaryJson();

      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact: makeComposedArtifact(),
        },
        chatResponses: [extractionJson, summaryJson],
        resolveResult: { Apple: "Apple" },
        graphRow: null,
      });
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.graph!.edges).toHaveLength(0);
    });

    it("deduplicates edges (same source|type|target key)", async () => {
      const entities = [
        { name: "Apple", type: "ORGANIZATION" },
        { name: "Google", type: "ORGANIZATION" },
      ];
      const relations = [
        { source: "Apple", target: "Google", type: "COMPETES_WITH" },
        { source: "Apple", target: "Google", type: "COMPETES_WITH" }, // duplicate
      ];
      const extractionJson = makeExtractionJson(entities, relations);
      const summaryJson = makeAnalysisSummaryJson();

      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact: makeComposedArtifact(),
        },
        chatResponses: [extractionJson, summaryJson],
        resolveResult: { Apple: "Apple", Google: "Google" },
        graphRow: null,
      });
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.graph!.edges).toHaveLength(1);
    });

    it("uses fallback summaries when LLM summary call returns null content", async () => {
      const entities = [
        { name: "Tesla", type: "ORGANIZATION" },
        { name: "Ford", type: "ORGANIZATION" },
      ];
      const relations = [
        { source: "Tesla", target: "Ford", type: "COMPETES_WITH" },
      ];
      const extractionJson = makeExtractionJson(entities, relations);

      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact: makeComposedArtifact(),
        },
        chatResponses: [extractionJson, null], // summary call returns null
        resolveResult: { Tesla: "Tesla", Ford: "Ford" },
        graphRow: null,
      });
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("READY");
      expect(result.analyses!.keyNodes.summary).toBe(
        "节点度中心性分析完成，已识别关键枢纽节点。",
      );
      expect(result.analyses!.relatedness.summary).toBe(
        "实体关联强度分析完成。",
      );
    });

    it("uses fallback summaries when LLM summary JSON parse fails", async () => {
      const entities = [
        { name: "Tesla", type: "ORGANIZATION" },
        { name: "BMW", type: "ORGANIZATION" },
      ];
      const relations = [
        { source: "Tesla", target: "BMW", type: "COMPETES_WITH" },
      ];
      const extractionJson = makeExtractionJson(entities, relations);

      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact: makeComposedArtifact(),
        },
        chatResponses: [extractionJson, "not valid json at all ~~~"],
        resolveResult: { Tesla: "Tesla", BMW: "BMW" },
        graphRow: null,
      });
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("READY");
      expect(result.analyses!.competitive.summary).toBe("竞争格局分析完成。");
    });

    it("uses fallback summaries when LLM summary call throws (Error instance)", async () => {
      const entities = [
        { name: "A", type: "ORGANIZATION" },
        { name: "B", type: "ORGANIZATION" },
      ];
      const relations = [{ source: "A", target: "B", type: "SUPPLIES" }];
      const extractionJson = makeExtractionJson(entities, relations);

      // Use chatResponses:[] and set up mock directly to avoid double-queuing
      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact: makeComposedArtifact(),
        },
        chatResponses: [], // no pre-queued responses
        resolveResult: { A: "A", B: "B" },
        graphRow: null,
      });
      // Extraction succeeds on call 1, summary call throws on call 2
      mocks.chatMock
        .mockResolvedValueOnce({ content: extractionJson }) // extraction attempt 1
        .mockRejectedValueOnce(new Error("LLM timeout")); // summary call throws Error

      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("READY");
      expect(result.analyses!.supplyChain.summary).toBe("供应链层级分析完成。");
    });

    it("retries extraction once when first attempt returns null content", async () => {
      const entities = [
        { name: "Microsoft", type: "ORGANIZATION" },
        { name: "OpenAI", type: "ORGANIZATION" },
      ];
      const relations = [
        { source: "Microsoft", target: "OpenAI", type: "PARTNERS_WITH" },
      ];
      const extractionJson = makeExtractionJson(entities, relations);
      const summaryJson = makeAnalysisSummaryJson();

      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact: makeComposedArtifact(),
        },
        chatResponses: [null, extractionJson, summaryJson],
        resolveResult: { Microsoft: "Microsoft", OpenAI: "OpenAI" },
        graphRow: null,
      });
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("READY");
      // chat was called for: failed extraction, retry extraction, summary
      expect(mocks.chatMock).toHaveBeenCalledTimes(3);
    });

    it("returns FAILED when both extraction attempts fail (invalid JSON)", async () => {
      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact: makeComposedArtifact(),
        },
        chatResponses: ["bad json", "bad json 2"],
        resolveResult: {},
        graphRow: null,
      });
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("FAILED");
    });

    it("returns FAILED when extraction returns entities=[] and relations=[]", async () => {
      const extractionJson = makeExtractionJson([], []);
      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact: makeComposedArtifact(),
        },
        chatResponses: [extractionJson, extractionJson],
        resolveResult: {},
        graphRow: null,
      });
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("FAILED");
    });

    it("upserts FAILED status when _persistFailed is called", async () => {
      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact: {
            kind: "empty-artifact",
            reason: "not-yet-materialized",
          },
        },
        graphRow: null,
      });
      const service = await createService(mocks);

      await service.build("u-1", "m-1");

      expect(
        mocks.prismaMock.playgroundMissionGraph.upsert,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ status: "FAILED" }),
        }),
      );
    });

    it("handles upsert failure in _persistFailed gracefully", async () => {
      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact: {
            kind: "empty-artifact",
            reason: "not-yet-materialized",
          },
        },
        graphRow: null,
      });
      mocks.prismaMock.playgroundMissionGraph.upsert.mockRejectedValue(
        new Error("upsert failed"),
      );
      const service = await createService(mocks);

      // Should not throw
      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("FAILED");
    });

    it("reads report text from V1 reportFull.summary when composedArtifact is empty sentinel", async () => {
      const entities = [
        { name: "Tesla", type: "ORGANIZATION" },
        { name: "Rivian", type: "ORGANIZATION" },
      ];
      const relations = [
        { source: "Tesla", target: "Rivian", type: "COMPETES_WITH" },
      ];
      const extractionJson = makeExtractionJson(entities, relations);
      const summaryJson = makeAnalysisSummaryJson();

      const v1ReportFull = {
        summary: "Electric vehicle market is growing rapidly.",
        sections: [
          { heading: "Background", body: "Tesla leads the market." },
          { heading: "Competition", body: "Rivian is a strong competitor." },
        ],
        conclusion: "Future looks bright.",
      };

      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: v1ReportFull },
          composedArtifact: {
            kind: "empty-artifact",
            reason: "not-yet-materialized",
          },
        },
        chatResponses: [extractionJson, summaryJson],
        resolveResult: { Tesla: "Tesla", Rivian: "Rivian" },
        graphRow: null,
      });
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("READY");
    });

    it("reads report text from composedArtifact sections + quickView when fullMarkdown absent", async () => {
      const entities = [{ name: "Samsung", type: "ORGANIZATION" }];
      const relations: { source: string; target: string; type: string }[] = [];
      // single entity with no relations → extraction will fail validation (0 relations is ok, but 0 entities + 0 relations fails)
      // Use at least 1 entity but let the summary work
      const extractionJson = makeExtractionJson(entities, relations);
      const summaryJson = makeAnalysisSummaryJson();

      const composedArtifact = {
        version: "v2",
        content: { fullMarkdown: null }, // no fullMarkdown
        sections: [{ title: "Section One" }],
        quickView: { executiveSummary: { markdown: "Summary text" } },
        factTable: [
          { subject: "Samsung", predicate: "makes", object: "phones" },
        ],
      };

      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact,
        },
        chatResponses: [extractionJson, summaryJson],
        resolveResult: { Samsung: "Samsung" },
        graphRow: null,
      });
      // Only 1 entity, 0 relations - both attempts fail because validation
      // of 0+0 will fail; but 1 entity + 0 relations passes (entities.length=1 > 0)
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      // Samsung alone with no relations: extraction passes (entities.length=1),
      // graph is built with 1 node, 0 edges → READY
      expect(result.status).toBe("READY");
    });

    it("merges supplyChainLayers descriptions when LLM provides them", async () => {
      const entities = [
        { name: "Supplier", type: "ORGANIZATION" },
        { name: "Manufacturer", type: "ORGANIZATION" },
        { name: "Retailer", type: "ORGANIZATION" },
      ];
      const relations = [
        { source: "Supplier", target: "Manufacturer", type: "SUPPLIES" },
        { source: "Manufacturer", target: "Retailer", type: "SUPPLIES" },
      ];
      const extractionJson = makeExtractionJson(entities, relations);
      const summaryJson = makeAnalysisSummaryJson({
        supplyChainLayers: [
          { order: 0, description: "原材料层" },
          { order: 1, description: "制造层" },
          { order: 2, description: "零售层" },
        ],
      });

      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact: makeComposedArtifact(),
        },
        chatResponses: [extractionJson, summaryJson],
        resolveResult: {
          Supplier: "Supplier",
          Manufacturer: "Manufacturer",
          Retailer: "Retailer",
        },
        graphRow: null,
      });
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("READY");
      // Supply chain should have layer descriptions merged in
      const scLayers = result.analyses!.supplyChain.layers;
      expect(scLayers.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // enrichNode
  // --------------------------------------------------------------------------

  describe("enrichNode", () => {
    const graphArtifactRow = makeGraphRow({
      graph: {
        nodes: [
          { id: "n0", label: "NVIDIA", type: "ORGANIZATION" },
          { id: "n1", label: "CUDA", type: "TECHNOLOGY" },
        ],
        edges: [],
        stats: { totalNodes: 2, totalEdges: 0 },
      },
    });

    it("throws NotFoundException when nodeId is not in graph", async () => {
      const mocks = buildMocks({ graphRow: graphArtifactRow });
      const service = await createService(mocks);

      await expect(
        service.enrichNode("u-1", "m-1", "ghost-node"),
      ).rejects.toThrow(NotFoundException);
    });

    it("returns fallback enrichment when search returns no results", async () => {
      const mocks = buildMocks({
        graphRow: graphArtifactRow,
        searchResults: [],
      });
      const service = await createService(mocks);

      const result = await service.enrichNode("u-1", "m-1", "n0");

      expect(result.nodeId).toBe("n0");
      expect(result.label).toBe("NVIDIA");
      expect(result.description).toBe("");
      expect(result.facts).toEqual([]);
      expect(result.sources).toEqual([]);
    });

    it("returns fallback enrichment when search throws", async () => {
      const mocks = buildMocks({
        graphRow: graphArtifactRow,
        searchThrows: true,
      });
      const service = await createService(mocks);

      const result = await service.enrichNode("u-1", "m-1", "n0");

      expect(result.nodeId).toBe("n0");
      expect(result.description).toBe("");
    });

    it("returns LLM enrichment on successful chat response", async () => {
      const searchResults = [
        {
          title: "NVIDIA Corporation",
          url: "https://nvidia.com",
          content: "NVIDIA makes GPUs for AI.",
        },
        {
          title: "NVIDIA Annual Report",
          url: "https://nvidia.com/report",
          content: "Revenue hit $60B in 2024.",
        },
      ];

      const llmResponse = JSON.stringify({
        description: "NVIDIA是领先的AI芯片制造商。",
        facts: [
          { label: "成立时间", value: "1993年" },
          { label: "市值", value: "$3万亿" },
        ],
        sources: [{ title: "NVIDIA Corporation", url: "https://nvidia.com" }],
      });

      const mocks = buildMocks({
        graphRow: graphArtifactRow,
        searchResults,
        chatResponses: [llmResponse],
      });
      const service = await createService(mocks);

      const result = await service.enrichNode("u-1", "m-1", "n0");

      expect(result.description).toBe("NVIDIA是领先的AI芯片制造商。");
      expect(result.facts).toHaveLength(2);
      expect(result.sources[0].url).toBe("https://nvidia.com");
    });

    it("returns fallback enrichment when LLM chat throws", async () => {
      const searchResults = [
        {
          title: "CUDA Parallel Computing",
          url: "https://developer.nvidia.com/cuda",
          content: "CUDA is NVIDIA's parallel computing platform.",
        },
      ];

      const mocks = buildMocks({
        graphRow: graphArtifactRow,
        searchResults,
      });
      mocks.chatMock.mockRejectedValue(new Error("LLM error"));
      const service = await createService(mocks);

      const result = await service.enrichNode("u-1", "m-1", "n1");

      expect(result.nodeId).toBe("n1");
      expect(result.description).toBe("");
    });

    it("returns fallback enrichment when LLM returns null content", async () => {
      const searchResults = [
        {
          title: "NVIDIA GPU",
          url: "https://nvidia.com/gpu",
          content: "A100 is NVIDIA's flagship AI GPU.",
        },
      ];

      const mocks = buildMocks({
        graphRow: graphArtifactRow,
        searchResults,
        chatResponses: [null],
      });
      const service = await createService(mocks);

      const result = await service.enrichNode("u-1", "m-1", "n0");

      expect(result.description).toBe("");
      expect(result.sources[0].url).toBe("https://nvidia.com/gpu");
    });

    it("returns fallback enrichment when LLM JSON is invalid", async () => {
      const searchResults = [
        {
          title: "CUDA",
          url: "https://developer.nvidia.com/cuda",
          content: "CUDA enables GPU computing.",
        },
      ];

      const mocks = buildMocks({
        graphRow: graphArtifactRow,
        searchResults,
        chatResponses: ["not valid json ~~~"],
      });
      const service = await createService(mocks);

      const result = await service.enrichNode("u-1", "m-1", "n1");

      expect(result.description).toBe("");
    });

    it("uses type hint in search query for known entity types", async () => {
      const mocks = buildMocks({
        graphRow: graphArtifactRow,
        searchResults: [],
      });
      const service = await createService(mocks);

      await service.enrichNode("u-1", "m-1", "n0"); // ORGANIZATION

      expect(mocks.searchMock).toHaveBeenCalledWith(
        expect.stringContaining("公司"),
        6,
      );
    });

    it("uses node type=TECHNOLOGY hint in search query", async () => {
      const mocks = buildMocks({
        graphRow: graphArtifactRow,
        searchResults: [],
      });
      const service = await createService(mocks);

      await service.enrichNode("u-1", "m-1", "n1"); // TECHNOLOGY

      expect(mocks.searchMock).toHaveBeenCalledWith(
        expect.stringContaining("技术"),
        6,
      );
    });

    it("filters out invalid facts from LLM response", async () => {
      const searchResults = [
        {
          title: "NVIDIA",
          url: "https://nvidia.com",
          content: "GPU maker.",
        },
      ];

      const llmResponse = JSON.stringify({
        description: "GPU company",
        facts: [
          { label: "Founded", value: "1993" },
          { label: 123, value: "bad label" }, // invalid: label not string
          null, // invalid: null
          { label: "CEO", value: "Jensen Huang" },
        ],
        sources: [{ title: "NVIDIA", url: "https://nvidia.com" }],
      });

      const mocks = buildMocks({
        graphRow: graphArtifactRow,
        searchResults,
        chatResponses: [llmResponse],
      });
      const service = await createService(mocks);

      const result = await service.enrichNode("u-1", "m-1", "n0");

      // Only valid facts (label and value both string)
      expect(result.facts).toHaveLength(2);
      expect(result.facts[0].label).toBe("Founded");
      expect(result.facts[1].label).toBe("CEO");
    });

    it("falls back to search sources when LLM sources array is empty", async () => {
      const searchResults = [
        {
          title: "CUDA docs",
          url: "https://developer.nvidia.com",
          content: "CUDA reference.",
        },
      ];

      const llmResponse = JSON.stringify({
        description: "A technology",
        facts: [],
        sources: [], // empty → use fallback.sources
      });

      const mocks = buildMocks({
        graphRow: graphArtifactRow,
        searchResults,
        chatResponses: [llmResponse],
      });
      const service = await createService(mocks);

      const result = await service.enrichNode("u-1", "m-1", "n1");

      // Should fall back to the search results' sources
      expect(result.sources[0].url).toBe("https://developer.nvidia.com");
    });

    it("filters out sources missing url field", async () => {
      const searchResults = [
        {
          title: "NVIDIA",
          url: "https://nvidia.com",
          content: "GPU maker.",
        },
      ];

      const llmResponse = JSON.stringify({
        description: "GPU company",
        facts: [],
        sources: [
          { title: "Good source", url: "https://good.com" },
          { title: "Bad source" }, // missing url → filtered out
          null, // null → filtered out
        ],
      });

      const mocks = buildMocks({
        graphRow: graphArtifactRow,
        searchResults,
        chatResponses: [llmResponse],
      });
      const service = await createService(mocks);

      const result = await service.enrichNode("u-1", "m-1", "n0");

      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].url).toBe("https://good.com");
    });

    it("enriches node with PERSON type hint", async () => {
      const personRow = makeGraphRow({
        graph: {
          nodes: [{ id: "p0", label: "Jensen Huang", type: "PERSON" }],
          edges: [],
          stats: { totalNodes: 1, totalEdges: 0 },
        },
      });

      const mocks = buildMocks({ graphRow: personRow, searchResults: [] });
      const service = await createService(mocks);

      await service.enrichNode("u-1", "m-1", "p0");

      expect(mocks.searchMock).toHaveBeenCalledWith(
        expect.stringContaining("人物"),
        6,
      );
    });

    it("enriches node with unknown type (no type hint)", async () => {
      const otherRow = makeGraphRow({
        graph: {
          nodes: [{ id: "x0", label: "SomeConcept", type: "OTHER" }],
          edges: [],
          stats: { totalNodes: 1, totalEdges: 0 },
        },
      });

      const mocks = buildMocks({ graphRow: otherRow, searchResults: [] });
      const service = await createService(mocks);

      const result = await service.enrichNode("u-1", "m-1", "x0");

      // OTHER type has no hint, query is just the label
      expect(mocks.searchMock).toHaveBeenCalledWith("SomeConcept", 6);
      expect(result.nodeId).toBe("x0");
    });
  });

  // --------------------------------------------------------------------------
  // extractReportText branch coverage — tested indirectly via build()
  // --------------------------------------------------------------------------

  describe("extractReportText branches", () => {
    it("handles composedArtifact with sections but no quickView.executiveSummary", async () => {
      const composedArtifact = {
        version: "v2",
        content: { fullMarkdown: null },
        sections: [{ title: "Section Title" }],
        quickView: { executiveSummary: null },
        factTable: [{ subject: "A", predicate: "does", object: "B" }],
      };

      const entities = [{ name: "A", type: "ORGANIZATION" }];
      const extractionJson = makeExtractionJson(entities, []);
      const summaryJson = makeAnalysisSummaryJson();

      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact,
        },
        chatResponses: [extractionJson, summaryJson],
        resolveResult: { A: "A" },
        graphRow: null,
      });
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("READY");
    });

    it("falls back to V1 when composedArtifact sections/factTable are empty and has no quickView content", async () => {
      // No fullMarkdown, no sections content, no quickView → falls back to V1
      const composedArtifact = {
        version: "v2",
        content: { fullMarkdown: null },
        sections: [],
        quickView: { executiveSummary: { markdown: "" } },
        factTable: [],
      };

      const v1ReportFull = {
        summary: "V1 summary text that should be picked up.",
        sections: [],
        conclusion: null,
      };

      const entities = [{ name: "SomeOrg", type: "ORGANIZATION" }];
      const extractionJson = makeExtractionJson(entities, []);
      const summaryJson = makeAnalysisSummaryJson();

      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: v1ReportFull },
          composedArtifact,
        },
        chatResponses: [extractionJson, summaryJson],
        resolveResult: { SomeOrg: "SomeOrg" },
        graphRow: null,
      });
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("READY");
    });
  });

  // --------------------------------------------------------------------------
  // fallbackSummary for unknown key
  // --------------------------------------------------------------------------

  describe("fallbackSummary for unknown key", () => {
    it("returns generic fallback when summary JSON has unknown key values", async () => {
      // Supply summaryJson with missing keys → fallbackSummary("unknownKey") = "分析完成。"
      const entities = [
        { name: "X", type: "ORGANIZATION" },
        { name: "Y", type: "ORGANIZATION" },
      ];
      const relations = [{ source: "X", target: "Y", type: "COMPETES_WITH" }];
      const extractionJson = makeExtractionJson(entities, relations);

      // summaryJson with null values to trigger fallbackSummary
      const summaryJson = JSON.stringify({
        keyNodes: null,
        relatedness: null,
        competitive: null,
        community: null,
        supplyChain: null,
        supplyChainLayers: [],
      });

      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact: makeComposedArtifact(),
        },
        chatResponses: [extractionJson, summaryJson],
        resolveResult: { X: "X", Y: "Y" },
        graphRow: null,
      });
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("READY");
      // When key is null, fallbackSummary is used
      expect(result.analyses!.keyNodes.summary).toBe(
        "节点度中心性分析完成，已识别关键枢纽节点。",
      );
    });
  });

  // --------------------------------------------------------------------------
  // mergeLayerDescriptions edge cases (tested via build() with supply chain)
  // --------------------------------------------------------------------------

  describe("mergeLayerDescriptions", () => {
    it("handles non-array supplyChainLayers in LLM JSON gracefully", async () => {
      const entities = [
        { name: "Raw", type: "ORGANIZATION" },
        { name: "Processed", type: "ORGANIZATION" },
      ];
      const relations = [
        { source: "Raw", target: "Processed", type: "SUPPLIES" },
      ];
      const extractionJson = makeExtractionJson(entities, relations);

      // supplyChainLayers is not an array
      const summaryJson = JSON.stringify({
        keyNodes: "OK",
        relatedness: "OK",
        competitive: "OK",
        community: "OK",
        supplyChain: "OK",
        supplyChainLayers: "invalid-not-array",
      });

      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact: makeComposedArtifact(),
        },
        chatResponses: [extractionJson, summaryJson],
        resolveResult: { Raw: "Raw", Processed: "Processed" },
        graphRow: null,
      });
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("READY");
      // Layers exist but no description (non-array raw → no entries in byOrder map)
      const layers = result.analyses!.supplyChain.layers;
      expect(layers.length).toBeGreaterThan(0);
      // No description key since raw was not an array
      for (const l of layers) {
        expect(l.description).toBeUndefined();
      }
    });

    it("handles supplyChainLayers items with wrong types gracefully", async () => {
      const entities = [
        { name: "A", type: "ORGANIZATION" },
        { name: "B", type: "ORGANIZATION" },
      ];
      const relations = [{ source: "A", target: "B", type: "PRODUCES" }];
      const extractionJson = makeExtractionJson(entities, relations);

      // supplyChainLayers items with wrong types
      const summaryJson = JSON.stringify({
        keyNodes: "OK",
        relatedness: "OK",
        competitive: "OK",
        community: "OK",
        supplyChain: "OK",
        supplyChainLayers: [
          { order: "not-a-number", description: "wrong order type" },
          { order: 0, description: 123 }, // description not string
          null, // null item
          { order: 0, description: "Valid layer 0 description" },
        ],
      });

      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact: makeComposedArtifact(),
        },
        chatResponses: [extractionJson, summaryJson],
        resolveResult: { A: "A", B: "B" },
        graphRow: null,
      });
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("READY");
      // Only valid item (order=0, description=string) should be merged
      const layer0 = result.analyses!.supplyChain.layers.find(
        (l) => l.order === 0,
      );
      expect(layer0?.description).toBe("Valid layer 0 description");
    });
  });

  // --------------------------------------------------------------------------
  // Branch coverage: non-Error throws in catch blocks
  // --------------------------------------------------------------------------

  describe("non-Error thrown branches in catch blocks", () => {
    const graphArtifactRow = makeGraphRow({
      graph: {
        nodes: [{ id: "n0", label: "NVIDIA", type: "ORGANIZATION" }],
        edges: [],
        stats: { totalNodes: 1, totalEdges: 0 },
      },
    });

    it("handles non-Error thrown by search (covers String(err) branch)", async () => {
      // throw a string literal (not an Error instance)
      const mocks = buildMocks({ graphRow: graphArtifactRow });
      mocks.searchMock.mockRejectedValue("string error thrown"); // not an Error
      const service = await createService(mocks);

      // Should not throw; returns fallback
      const result = await service.enrichNode("u-1", "m-1", "n0");

      expect(result.nodeId).toBe("n0");
      expect(result.description).toBe("");
    });

    it("handles non-Error thrown by enrichNode LLM chat (covers String(err) branch)", async () => {
      const searchResults = [
        {
          title: "NVIDIA",
          url: "https://nvidia.com",
          content: "AI chip maker.",
        },
      ];

      const mocks = buildMocks({
        graphRow: graphArtifactRow,
        searchResults,
      });
      // Throw a non-Error object
      mocks.chatMock.mockRejectedValue({ code: "RATE_LIMIT" });
      const service = await createService(mocks);

      const result = await service.enrichNode("u-1", "m-1", "n0");

      expect(result.nodeId).toBe("n0");
      expect(result.description).toBe("");
    });

    it("handles non-Error thrown by entity resolution (covers String(err) branch)", async () => {
      const entities = [
        { name: "Apple", type: "ORGANIZATION" },
        { name: "Google", type: "ORGANIZATION" },
      ];
      const relations = [
        { source: "Apple", target: "Google", type: "COMPETES_WITH" },
      ];
      const extractionJson = makeExtractionJson(entities, relations);
      const summaryJson = makeAnalysisSummaryJson();

      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact: makeComposedArtifact(),
        },
        chatResponses: [extractionJson, summaryJson],
        resolveResult: {},
        graphRow: null,
      });
      // Throw a non-Error (object literal) from entity resolution
      mocks.resolveEntityMock.mockRejectedValue({ code: "timeout" });
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      // Falls back to identity mapping, still succeeds
      expect(result.status).toBe("READY");
    });

    it("handles non-Error thrown by LLM summary call (covers String(err) branch)", async () => {
      const entities = [
        { name: "A", type: "ORGANIZATION" },
        { name: "B", type: "ORGANIZATION" },
      ];
      const relations = [{ source: "A", target: "B", type: "COMPETES_WITH" }];
      const extractionJson = makeExtractionJson(entities, relations);

      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact: makeComposedArtifact(),
        },
        chatResponses: [],
        resolveResult: { A: "A", B: "B" },
        graphRow: null,
      });
      // First call returns extraction JSON, second call (summary) throws a non-Error
      mocks.chatMock
        .mockResolvedValueOnce({ content: extractionJson })
        .mockRejectedValueOnce("non-error string"); // not an Error
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("READY");
      expect(result.analyses!.community.summary).toBe("社区结构分析完成。");
    });

    it("handles non-Error thrown by _persistFailed upsert (covers String(err) branch)", async () => {
      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact: {
            kind: "empty-artifact",
            reason: "not-yet-materialized",
          },
        },
        graphRow: null,
      });
      // Throw a non-Error from upsert
      mocks.prismaMock.playgroundMissionGraph.upsert.mockRejectedValue(
        "non-error upsert failure",
      );
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("FAILED");
    });
  });

  // --------------------------------------------------------------------------
  // Branch coverage: search results with null/undefined results field
  // --------------------------------------------------------------------------

  describe("search results with undefined results field", () => {
    const graphArtifactRow = makeGraphRow({
      graph: {
        nodes: [{ id: "n0", label: "NVIDIA", type: "ORGANIZATION" }],
        edges: [],
        stats: { totalNodes: 1, totalEdges: 0 },
      },
    });

    it("handles search returning {results: undefined} gracefully (covers ?? [] branch)", async () => {
      const mocks = buildMocks({ graphRow: graphArtifactRow });
      // Return object without results field → r.results is undefined → ?? [] kicks in
      mocks.searchMock.mockResolvedValue({});
      const service = await createService(mocks);

      const result = await service.enrichNode("u-1", "m-1", "n0");

      // ctx = "" → returns fallback
      expect(result.nodeId).toBe("n0");
      expect(result.description).toBe("");
    });
  });

  // --------------------------------------------------------------------------
  // Branch coverage: enrichNode when artifact.graph is null (covers ?. branch)
  // --------------------------------------------------------------------------

  describe("enrichNode when artifact.graph is null", () => {
    it("throws NotFoundException when graph is null (artifact.graph?.nodes ?? [] is [])", async () => {
      // When graph row has status NONE (graph=null), enrichNode should get
      // artifact with graph=null, then graph?.nodes → undefined → ?? [] → []
      // find() returns undefined → NotFoundException
      const mocks = buildMocks({ graphRow: null }); // no row → status NONE, graph null
      const service = await createService(mocks);

      await expect(service.enrichNode("u-1", "m-1", "n0")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // --------------------------------------------------------------------------
  // Branch coverage: Zod validation failure path (lines 538-541)
  // --------------------------------------------------------------------------

  describe("Zod validation failure path", () => {
    it("returns FAILED when extraction returns data failing Zod schema (entity with empty name)", async () => {
      // The LlmExtractionSchema validates entities[].name as z.string().min(1)
      // Construct JSON that parses fine but fails Zod validation
      const badExtractionJson = JSON.stringify({
        entities: [{ name: "", type: "ORGANIZATION" }], // empty name fails min(1)
        relations: [],
      });

      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact: makeComposedArtifact(),
        },
        chatResponses: [badExtractionJson, badExtractionJson],
        resolveResult: {},
        graphRow: null,
      });
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      // Both attempts fail Zod validation → FAILED
      expect(result.status).toBe("FAILED");
    });

    it("returns FAILED when extraction returns relation with empty source (Zod min(1) fail)", async () => {
      const badExtractionJson = JSON.stringify({
        entities: [{ name: "Apple", type: "ORGANIZATION" }],
        relations: [{ source: "", target: "Apple", type: "RELATED_TO" }], // empty source
      });

      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact: makeComposedArtifact(),
        },
        chatResponses: [badExtractionJson, badExtractionJson],
        resolveResult: {},
        graphRow: null,
      });
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("FAILED");
    });
  });

  // --------------------------------------------------------------------------
  // Branch coverage: LLM summary catch block — Error instanceof false (line 653)
  // --------------------------------------------------------------------------

  describe("LLM summary catch block line 653", () => {
    it("covers non-Error thrown in _enrichWithSummaries (String(err) path)", async () => {
      const entities = [
        { name: "Meta", type: "ORGANIZATION" },
        { name: "Snap", type: "ORGANIZATION" },
      ];
      const relations = [
        { source: "Meta", target: "Snap", type: "COMPETES_WITH" },
      ];
      const extractionJson = makeExtractionJson(entities, relations);

      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact: makeComposedArtifact(),
        },
        chatResponses: [],
        resolveResult: { Meta: "Meta", Snap: "Snap" },
        graphRow: null,
      });
      // extraction chat call succeeds, summary chat call throws a non-Error
      mocks.chatMock
        .mockResolvedValueOnce({ content: extractionJson })
        .mockRejectedValueOnce(42); // number, not Error
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("READY");
      // Fallback summaries applied
      expect(result.analyses!.keyNodes.summary).toBe(
        "节点度中心性分析完成，已识别关键枢纽节点。",
      );
    });
  });

  // --------------------------------------------------------------------------
  // Branch coverage: _build outer catch (non-Error error escalation path)
  // --------------------------------------------------------------------------

  describe("_build outer catch non-Error propagation", () => {
    it("handles non-Error thrown during loadInputs in _build wrapper", async () => {
      const mocks = buildMocks({ graphRow: null });
      // Throw a non-Error from loadInputs
      mocks.missionQueryMock.loadInputs.mockRejectedValue("string error");
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("FAILED");
    });
  });

  // --------------------------------------------------------------------------
  // Additional enrichNode branches
  // --------------------------------------------------------------------------

  describe("enrichNode additional branches", () => {
    it("covers PRODUCT, EVENT, METRIC, TREND type hints", async () => {
      const rowWithMultipleNodes = makeGraphRow({
        graph: {
          nodes: [
            { id: "p0", label: "iPhone", type: "PRODUCT" },
            { id: "e0", label: "CES 2024", type: "EVENT" },
            { id: "m0", label: "Revenue", type: "METRIC" },
            { id: "t0", label: "AI Adoption", type: "TREND" },
          ],
          edges: [],
          stats: { totalNodes: 4, totalEdges: 0 },
        },
      });

      // Test PRODUCT type hint
      const mocksProd = buildMocks({
        graphRow: rowWithMultipleNodes,
        searchResults: [],
      });
      const serviceProd = await createService(mocksProd);
      await serviceProd.enrichNode("u-1", "m-1", "p0");
      expect(mocksProd.searchMock).toHaveBeenCalledWith(
        expect.stringContaining("产品"),
        6,
      );

      // Test EVENT type hint
      const mocksEvt = buildMocks({
        graphRow: rowWithMultipleNodes,
        searchResults: [],
      });
      const serviceEvt = await createService(mocksEvt);
      await serviceEvt.enrichNode("u-1", "m-1", "e0");
      expect(mocksEvt.searchMock).toHaveBeenCalledWith(
        expect.stringContaining("事件"),
        6,
      );

      // Test METRIC type hint
      const mocksMetric = buildMocks({
        graphRow: rowWithMultipleNodes,
        searchResults: [],
      });
      const serviceMetric = await createService(mocksMetric);
      await serviceMetric.enrichNode("u-1", "m-1", "m0");
      expect(mocksMetric.searchMock).toHaveBeenCalledWith(
        expect.stringContaining("指标"),
        6,
      );

      // Test TREND type hint
      const mocksTrend = buildMocks({
        graphRow: rowWithMultipleNodes,
        searchResults: [],
      });
      const serviceTrend = await createService(mocksTrend);
      await serviceTrend.enrichNode("u-1", "m-1", "t0");
      expect(mocksTrend.searchMock).toHaveBeenCalledWith(
        expect.stringContaining("趋势"),
        6,
      );
    });

    it("covers facts with d.facts not being an array (goes to [] fallback)", async () => {
      const searchResults = [
        { title: "T", url: "https://test.com", content: "content" },
      ];

      const llmResponse = JSON.stringify({
        description: "A company",
        facts: "not-an-array", // non-array facts → falls back to []
        sources: [{ title: "T", url: "https://test.com" }],
      });

      const graphArtifactRow = makeGraphRow({
        graph: {
          nodes: [{ id: "n0", label: "NVIDIA", type: "ORGANIZATION" }],
          edges: [],
          stats: { totalNodes: 1, totalEdges: 0 },
        },
      });

      const mocks = buildMocks({
        graphRow: graphArtifactRow,
        searchResults,
        chatResponses: [llmResponse],
      });
      const service = await createService(mocks);

      const result = await service.enrichNode("u-1", "m-1", "n0");

      expect(result.facts).toEqual([]);
      expect(result.description).toBe("A company");
    });

    it("covers sources with d.sources not being an array (goes to fallback.sources)", async () => {
      const searchResults = [
        {
          title: "NVIDIA Source",
          url: "https://nvidia.com",
          content: "GPU maker.",
        },
      ];

      const llmResponse = JSON.stringify({
        description: "GPU maker",
        facts: [],
        sources: "not-an-array", // non-array sources → fallback.sources
      });

      const graphArtifactRow = makeGraphRow({
        graph: {
          nodes: [{ id: "n0", label: "NVIDIA", type: "ORGANIZATION" }],
          edges: [],
          stats: { totalNodes: 1, totalEdges: 0 },
        },
      });

      const mocks = buildMocks({
        graphRow: graphArtifactRow,
        searchResults,
        chatResponses: [llmResponse],
      });
      const service = await createService(mocks);

      const result = await service.enrichNode("u-1", "m-1", "n0");

      // fallback.sources comes from searchResults (sources = non-array → use fallback)
      expect(result.sources[0].url).toBe("https://nvidia.com");
    });

    it("covers content empty string branch (x.content || '' gives '')", async () => {
      const searchResults = [
        { title: "T1", url: "https://t1.com", content: "" }, // empty content
        { title: "T2", url: "https://t2.com", content: "Some content" },
      ];

      const llmResponse = JSON.stringify({
        description: "A company",
        facts: [],
        sources: [{ title: "T1", url: "https://t1.com" }],
      });

      const graphArtifactRow = makeGraphRow({
        graph: {
          nodes: [{ id: "n0", label: "NVIDIA", type: "ORGANIZATION" }],
          edges: [],
          stats: { totalNodes: 1, totalEdges: 0 },
        },
      });

      const mocks = buildMocks({
        graphRow: graphArtifactRow,
        searchResults,
        chatResponses: [llmResponse],
      });
      const service = await createService(mocks);

      const result = await service.enrichNode("u-1", "m-1", "n0");

      expect(result.description).toBe("A company");
    });
  });

  // --------------------------------------------------------------------------
  // Branch coverage: canonicalOf[entity.name] ?? entity.name fallback
  // --------------------------------------------------------------------------

  describe("canonical mapping ?? fallback", () => {
    it("uses entity.name fallback when canonicalOf does not contain entity.name", async () => {
      const entities = [
        { name: "Alpha", type: "ORGANIZATION" },
        { name: "Beta", type: "ORGANIZATION" },
      ];
      const relations = [{ source: "Alpha", target: "Beta", type: "SUPPLIES" }];
      const extractionJson = makeExtractionJson(entities, relations);
      const summaryJson = makeAnalysisSummaryJson();

      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact: makeComposedArtifact(),
        },
        chatResponses: [extractionJson, summaryJson],
        // Only Alpha is in canonicalOf; Beta is missing → ?? entity.name fallback
        resolveResult: { Alpha: "AlphaCanonical" },
        graphRow: null,
      });
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("READY");
      // Beta should appear with its original name as the canonical
      const labels = result.graph!.nodes.map((n) => n.label);
      expect(labels).toContain("Beta");
    });
  });

  // --------------------------------------------------------------------------
  // Branch coverage: V1 reportFull with sections that have no body/heading
  // --------------------------------------------------------------------------

  describe("V1 reportFull edge cases", () => {
    it("handles V1 reportFull with section missing body and heading", async () => {
      const v1ReportFull = {
        summary: "Summary content.",
        sections: [
          { body: "Section body content" },
          { heading: "Section Heading" },
          {}, // no body, no heading → neither pushed
        ],
        conclusion: "Final conclusion.",
      };

      const entities = [{ name: "TestOrg", type: "ORGANIZATION" }];
      const extractionJson = makeExtractionJson(entities, []);
      const summaryJson = makeAnalysisSummaryJson();

      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: v1ReportFull },
          composedArtifact: {
            kind: "empty-artifact",
            reason: "not-yet-materialized",
          },
        },
        chatResponses: [extractionJson, summaryJson],
        resolveResult: { TestOrg: "TestOrg" },
        graphRow: null,
      });
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("READY");
    });

    it("handles V1 reportFull with sections field missing entirely (r['sections'] ?? [])", async () => {
      // No sections field → r["sections"] is undefined → ?? [] kicks in
      const v1ReportFull = {
        summary: "Only summary, no sections.",
        conclusion: "Final.",
        // no sections field
      };

      const entities = [{ name: "SomeOrg2", type: "ORGANIZATION" }];
      const extractionJson = makeExtractionJson(entities, []);
      const summaryJson = makeAnalysisSummaryJson();

      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: v1ReportFull },
          composedArtifact: {
            kind: "empty-artifact",
            reason: "not-yet-materialized",
          },
        },
        chatResponses: [extractionJson, summaryJson],
        resolveResult: { SomeOrg2: "SomeOrg2" },
        graphRow: null,
      });
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("READY");
    });
  });

  // --------------------------------------------------------------------------
  // Branch coverage: composedArtifact missing sections/factTable fields
  // --------------------------------------------------------------------------

  describe("composedArtifact with undefined sections and factTable (null-coalescing branches)", () => {
    it("handles composedArtifact where sections is undefined (covers ?? [] at line 62)", async () => {
      // artifact.sections is undefined → ?? [] → skip iteration
      const composedArtifact = {
        version: "v2",
        content: { fullMarkdown: null },
        // no sections field
        quickView: { executiveSummary: { markdown: "Quick summary text!" } },
        // no factTable field
      };

      const entities = [{ name: "BrandX", type: "ORGANIZATION" }];
      const extractionJson = makeExtractionJson(entities, []);
      const summaryJson = makeAnalysisSummaryJson();

      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact,
        },
        chatResponses: [extractionJson, summaryJson],
        resolveResult: { BrandX: "BrandX" },
        graphRow: null,
      });
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("READY");
    });

    it("handles composedArtifact where factTable is undefined (covers ?? [] at line 69)", async () => {
      const composedArtifact = {
        version: "v2",
        content: { fullMarkdown: null },
        sections: [{ title: "Section A" }],
        quickView: { executiveSummary: { markdown: "Summary here" } },
        // no factTable field
      };

      const entities = [{ name: "BrandY", type: "ORGANIZATION" }];
      const extractionJson = makeExtractionJson(entities, []);
      const summaryJson = makeAnalysisSummaryJson();

      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact,
        },
        chatResponses: [extractionJson, summaryJson],
        resolveResult: { BrandY: "BrandY" },
        graphRow: null,
      });
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("READY");
    });
  });

  // --------------------------------------------------------------------------
  // Branch coverage: LLM enrichNode response with description=null (line 286)
  // --------------------------------------------------------------------------

  describe("enrichNode LLM response with description null", () => {
    const graphArtifactRow = makeGraphRow({
      graph: {
        nodes: [{ id: "n0", label: "NVIDIA", type: "ORGANIZATION" }],
        edges: [],
        stats: { totalNodes: 1, totalEdges: 0 },
      },
    });

    it("covers d.description ?? '' when description is null in LLM response", async () => {
      const searchResults = [
        { title: "NVIDIA", url: "https://nvidia.com", content: "GPU maker." },
      ];

      // description is null → String(null ?? "") = String("") = ""
      const llmResponse = JSON.stringify({
        description: null,
        facts: [],
        sources: [{ title: "NVIDIA", url: "https://nvidia.com" }],
      });

      const mocks = buildMocks({
        graphRow: graphArtifactRow,
        searchResults,
        chatResponses: [llmResponse],
      });
      const service = await createService(mocks);

      const result = await service.enrichNode("u-1", "m-1", "n0");

      // description should be empty string (String(null ?? "") = "")
      expect(result.description).toBe("");
    });
  });

  // --------------------------------------------------------------------------
  // Branch coverage: relation source/target not in canonicalOf (line 432/433)
  // --------------------------------------------------------------------------

  describe("relation canonical mapping when source/target absent from canonicalOf", () => {
    it("falls back to rel.source/rel.target when not in canonicalOf map", async () => {
      // entity resolution returns empty map → rel.source and rel.target not in map
      const entities = [
        { name: "Foo", type: "ORGANIZATION" },
        { name: "Bar", type: "ORGANIZATION" },
      ];
      const relations = [{ source: "Foo", target: "Bar", type: "RELATED_TO" }];
      const extractionJson = makeExtractionJson(entities, relations);
      const summaryJson = makeAnalysisSummaryJson();

      // canonicalOf is empty → Foo and Bar not found → fallback to entity.name via ?? rel.source
      const mocks = buildMocks({
        inputsOverride: {
          row: { reportFull: null },
          composedArtifact: makeComposedArtifact(),
        },
        chatResponses: [extractionJson, summaryJson],
        resolveResult: {}, // empty canonicalOf
        graphRow: null,
      });
      const service = await createService(mocks);

      const result = await service.build("u-1", "m-1");

      expect(result.status).toBe("READY");
      const labels = result.graph!.nodes.map((n) => n.label).sort();
      expect(labels).toEqual(["Bar", "Foo"]);
    });
  });
});
