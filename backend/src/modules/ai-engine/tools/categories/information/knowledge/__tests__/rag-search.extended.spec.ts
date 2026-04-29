/**
 * RAGSearchTool - Extended coverage tests
 *
 * Covers paths not hit by the base spec:
 *  - checkTablesExist() with real DB call when cache is null
 *  - tablesExist = false → early return with success=false
 *  - searchSimilarChunks with collectionId / resourceIds / filters (WHERE clauses)
 *  - searchSimilarChunks with non-relation error (rethrows)
 *  - generateEmbedding with non-Error throw
 *  - validateInput edge cases (resourceIds is not array)
 */

import { RAGSearchTool, RAGSearchInput } from "../rag-search.tool";
import { EmbeddingResult } from "@/modules/ai-engine/knowledge/rag/embedding/embedding.service";
import { ToolContext } from "../../../../abstractions/tool.interface";

type MockEmbeddingService = {
  generateEmbedding: jest.MockedFunction<
    (text: string) => Promise<EmbeddingResult>
  >;
};

type MockPrismaService = {
  $queryRawUnsafe: jest.MockedFunction<
    (...args: unknown[]) => Promise<unknown[]>
  >;
};

function buildContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    executionId: "ext-exec",
    toolId: "rag-search",
    userId: "user-ext",
    createdAt: new Date(),
    ...overrides,
  };
}

function buildEmbeddingResult(dim = 3): EmbeddingResult {
  return {
    text: "query",
    embedding: Array.from({ length: dim }, (_, i) => i * 0.1),
    tokenCount: dim,
  };
}

describe("RAGSearchTool (extended coverage)", () => {
  let tool: RAGSearchTool;
  let mockEmbeddingService: MockEmbeddingService;
  let mockPrisma: MockPrismaService;

  function makeTool(): RAGSearchTool {
    return new RAGSearchTool(
      mockPrisma as unknown as ConstructorParameters<typeof RAGSearchTool>[0],
      mockEmbeddingService as unknown as ConstructorParameters<
        typeof RAGSearchTool
      >[1],
    );
  }

  beforeEach(() => {
    mockEmbeddingService = {
      generateEmbedding: jest.fn<Promise<EmbeddingResult>, [string]>(),
    };
    mockPrisma = {
      $queryRawUnsafe: jest.fn(),
    };
    tool = makeTool();
    // Pre-populate cache to avoid table-check queries in most tests
    (tool as unknown as { tablesExistCache: boolean }).tablesExistCache = true;
  });

  afterEach(() => jest.clearAllMocks());

  // =========================================================================
  // checkTablesExist() — tables not present (cache=false)
  // =========================================================================

  describe("checkTablesExist() - tables do not exist", () => {
    it("returns {success:false, results:[]} when tablesExist=false", async () => {
      const freshTool = makeTool();
      // Let checkTablesExist run a real DB call
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ cnt: BigInt(0) }]) // for table check
        .mockResolvedValue([]);

      const result = await freshTool.execute(
        { query: "hello" },
        buildContext(),
      );

      // First call was checkTablesExist, should short-circuit with success:false
      expect(result.success).toBe(true);
      expect(result.data?.success).toBe(false);
      expect(result.data?.results).toHaveLength(0);
    });

    it("caches result of checkTablesExist after first call", async () => {
      const freshTool = makeTool();
      // First call: table check returns 0 → cache set to false
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ cnt: BigInt(0) }]);

      await freshTool.execute({ query: "hello" }, buildContext());
      await freshTool.execute({ query: "world" }, buildContext());

      // Only 1 DB call for the table check (cached on 2nd call)
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    });

    it("handles checkTablesExist DB error by setting cache=false", async () => {
      const freshTool = makeTool();
      mockPrisma.$queryRawUnsafe.mockRejectedValueOnce(
        new Error("DB connection failed"),
      );

      const result = await freshTool.execute(
        { query: "hello" },
        buildContext(),
      );

      // Should not throw; short-circuit returns success=false
      expect(result.success).toBe(true);
      expect(result.data?.success).toBe(false);
    });
  });

  // =========================================================================
  // searchSimilarChunks — WHERE clause coverage via filters
  // =========================================================================

  describe("searchSimilarChunks with filters (WHERE clause paths)", () => {
    beforeEach(() => {
      mockEmbeddingService.generateEmbedding.mockResolvedValue(
        buildEmbeddingResult(),
      );
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    });

    it("includes collectionId filter in query params", async () => {
      const input: RAGSearchInput = {
        query: "machine learning",
        collectionId: "col-123",
      };

      await tool.execute(input, buildContext());

      const callArgs = mockPrisma.$queryRawUnsafe.mock.calls[0];
      expect(callArgs).toContain("col-123");
    });

    it("includes resourceIds filter in query params", async () => {
      const resourceIds = ["res-1", "res-2"];
      const input: RAGSearchInput = {
        query: "test",
        resourceIds,
      };

      await tool.execute(input, buildContext());

      const callArgs = mockPrisma.$queryRawUnsafe.mock.calls[0];
      expect(callArgs).toContain(resourceIds);
    });

    it("includes resourceTypes filter in query params", async () => {
      const resourceTypes = ["BLOG", "PAPER"];
      const input: RAGSearchInput = {
        query: "test",
        filters: { resourceTypes },
      };

      await tool.execute(input, buildContext());

      const callArgs = mockPrisma.$queryRawUnsafe.mock.calls[0];
      const found = callArgs.some(
        (arg) =>
          Array.isArray(arg) &&
          JSON.stringify(arg) === JSON.stringify(resourceTypes),
      );
      expect(found).toBe(true);
    });

    it("includes dateRange start filter in query params", async () => {
      const startDate = "2024-01-01";
      const input: RAGSearchInput = {
        query: "test",
        filters: { dateRange: { start: startDate } },
      };

      await tool.execute(input, buildContext());

      const callArgs = mockPrisma.$queryRawUnsafe.mock.calls[0];
      const hasDateParam = callArgs.some(
        (arg) =>
          arg instanceof Date && arg.toISOString().startsWith("2024-01-01"),
      );
      expect(hasDateParam).toBe(true);
    });

    it("includes dateRange end filter in query params", async () => {
      const endDate = "2024-12-31";
      const input: RAGSearchInput = {
        query: "test",
        filters: { dateRange: { end: endDate } },
      };

      await tool.execute(input, buildContext());

      const callArgs = mockPrisma.$queryRawUnsafe.mock.calls[0];
      const hasDateParam = callArgs.some(
        (arg) => arg instanceof Date && arg.getFullYear() === 2024,
      );
      expect(hasDateParam).toBe(true);
    });

    it("includes tags filter in query params", async () => {
      const tags = ["ai", "nlp"];
      const input: RAGSearchInput = {
        query: "test",
        filters: { tags },
      };

      await tool.execute(input, buildContext());

      const callArgs = mockPrisma.$queryRawUnsafe.mock.calls[0];
      expect(callArgs).toContain(tags);
    });

    it("includes userId in WHERE when context has userId", async () => {
      const input: RAGSearchInput = { query: "user-filtered search" };
      const context = buildContext({ userId: "user-999" });

      await tool.execute(input, context);

      const callArgs = mockPrisma.$queryRawUnsafe.mock.calls[0];
      expect(callArgs).toContain("user-999");
    });

    it("handles multiple filters combined", async () => {
      const input: RAGSearchInput = {
        query: "combined filters",
        collectionId: "col-abc",
        resourceIds: ["res-x"],
        filters: {
          resourceTypes: ["BLOG"],
          tags: ["science"],
          dateRange: { start: "2023-01-01", end: "2024-01-01" },
        },
      };

      const result = await tool.execute(input, buildContext({ userId: "u1" }));

      expect(result.success).toBe(true);
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // searchSimilarChunks — non-relation error (re-throw path)
  // =========================================================================

  describe("searchSimilarChunks — non-relation error re-throws", () => {
    it("propagates non-relation errors as ToolResult failure", async () => {
      mockEmbeddingService.generateEmbedding.mockResolvedValue(
        buildEmbeddingResult(),
      );
      mockPrisma.$queryRawUnsafe.mockRejectedValue(
        new Error("Memory limit exceeded"),
      );

      const result = await tool.execute({ query: "test" }, buildContext());

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("Memory limit exceeded");
    });
  });

  // =========================================================================
  // generateEmbedding — non-Error throw
  // =========================================================================

  describe("generateEmbedding — non-Error throw", () => {
    it("wraps non-Error thrown from embeddingService", async () => {
      mockEmbeddingService.generateEmbedding.mockRejectedValue("string error");

      const result = await tool.execute({ query: "test" }, buildContext());

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("Embedding generation failed");
    });
  });

  // =========================================================================
  // validateInput — resourceIds is not an array
  // =========================================================================

  describe("validateInput — resourceIds type check", () => {
    it("returns false when resourceIds is not an array", () => {
      const input = {
        query: "test",
        resourceIds: "not-an-array" as unknown as string[],
      };
      expect(tool.validateInput(input)).toBe(false);
    });

    it("returns false when resourceIds is null", () => {
      const input = {
        query: "test",
        resourceIds: null as unknown as string[],
      };
      expect(tool.validateInput(input)).toBe(false);
    });
  });

  // =========================================================================
  // checkTablesExist — tables exist (cnt === 2)
  // =========================================================================

  describe("checkTablesExist() - tables exist", () => {
    it("proceeds with search when both tables are present", async () => {
      const freshTool = makeTool();
      mockEmbeddingService.generateEmbedding.mockResolvedValue(
        buildEmbeddingResult(),
      );
      // First call: table check returns 2 (both tables present)
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ cnt: BigInt(2) }])
        .mockResolvedValue([]);

      const result = await freshTool.execute(
        { query: "hello" },
        buildContext(),
      );

      expect(result.success).toBe(true);
      expect(result.data?.success).toBe(true);
    });
  });
});
