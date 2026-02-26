/**
 * RAGSearchTool Unit Tests
 * 覆盖向量检索工具的核心执行路径和边界条件
 */

import {
  RAGSearchTool,
  RAGSearchInput,
  RAGSearchOutput,
} from "../rag-search.tool";
import { ToolContext, ToolResult } from "../../../abstractions/tool.interface";
import { EmbeddingResult } from "@/modules/ai-engine/knowledge/rag/embedding/embedding.service";

// ============================================================================
// Mock Types
// ============================================================================

type MockEmbeddingService = {
  generateEmbedding: jest.MockedFunction<
    (text: string) => Promise<EmbeddingResult>
  >;
};

type RawChunkRow = {
  chunk_id: string;
  resource_id: string;
  content: string;
  position: number;
  chunk_metadata: Record<string, unknown>;
  title: string;
  type: string;
  source_url: string;
  published_at: Date | null;
  authors: unknown;
  similarity: number;
};

type MockPrismaService = {
  $queryRawUnsafe: jest.MockedFunction<
    (...args: unknown[]) => Promise<RawChunkRow[]>
  >;
};

// ============================================================================
// Helpers
// ============================================================================

function buildContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    executionId: "test-exec-id",
    toolId: "rag-search",
    userId: "user-123",
    createdAt: new Date(),
    ...overrides,
  };
}

function buildEmbeddingResult(embedding: number[]): EmbeddingResult {
  return {
    text: "query text",
    embedding,
    tokenCount: embedding.length,
  };
}

function buildRawRow(overrides: Partial<RawChunkRow> = {}): RawChunkRow {
  return {
    chunk_id: "chunk-1",
    resource_id: "res-1",
    content: "Some relevant content",
    position: 0,
    chunk_metadata: {},
    title: "Resource Title",
    type: "BLOG",
    source_url: "https://example.com",
    published_at: null,
    authors: null,
    similarity: 0.85,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("RAGSearchTool", () => {
  let tool: RAGSearchTool;
  let mockEmbeddingService: MockEmbeddingService;
  let mockPrisma: MockPrismaService;

  beforeEach(() => {
    mockEmbeddingService = {
      generateEmbedding: jest.fn<Promise<EmbeddingResult>, [string]>(),
    };

    mockPrisma = {
      $queryRawUnsafe: jest.fn(),
    };

    tool = new RAGSearchTool(
      mockPrisma as unknown as ConstructorParameters<typeof RAGSearchTool>[0],
      mockEmbeddingService as unknown as ConstructorParameters<
        typeof RAGSearchTool
      >[1],
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // 1. 成功搜索
  // --------------------------------------------------------------------------
  describe("doExecute - successful search", () => {
    it("generates embedding, queries pgvector, and returns mapped results", async () => {
      const embedding = Array.from({ length: 1536 }, (_, i) => i * 0.001);
      mockEmbeddingService.generateEmbedding.mockResolvedValue(
        buildEmbeddingResult(embedding),
      );

      const row = buildRawRow({
        chunk_id: "chunk-abc",
        resource_id: "res-abc",
        content: "Deep learning overview",
        similarity: 0.92,
        published_at: new Date("2024-01-15"),
        authors: ["Alice", "Bob"],
        position: 3,
      });
      mockPrisma.$queryRawUnsafe.mockResolvedValue([row]);

      const input: RAGSearchInput = {
        query: "deep learning",
        topK: 5,
        threshold: 0.7,
      };
      const context = buildContext();

      const result: ToolResult<RAGSearchOutput> = await tool.execute(
        input,
        context,
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const data = result.data!;
      expect(data.success).toBe(true);
      expect(data.totalResults).toBe(1);
      expect(data.embeddingDimension).toBe(1536);

      const item = data.results[0];
      expect(item.chunkId).toBe("chunk-abc");
      expect(item.resourceId).toBe("res-abc");
      expect(item.content).toBe("Deep learning overview");
      expect(item.score).toBe(0.92);
      expect(item.metadata.title).toBe("Resource Title");
      expect(item.metadata.authors).toEqual(["Alice", "Bob"]);
      expect(item.metadata.position).toBe(3);
      expect(item.metadata.publishedAt).toBe("2024-01-15T00:00:00.000Z");

      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith(
        "deep learning",
      );
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    });

    it("returns empty results when query yields no rows", async () => {
      mockEmbeddingService.generateEmbedding.mockResolvedValue(
        buildEmbeddingResult([0.1, 0.2, 0.3]),
      );
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      const input: RAGSearchInput = { query: "obscure topic" };
      const result = await tool.execute(input, buildContext());

      expect(result.success).toBe(true);
      expect(result.data!.results).toHaveLength(0);
      expect(result.data!.totalResults).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 2. validateInput — query 为空时失败
  // --------------------------------------------------------------------------
  describe("validateInput", () => {
    it("returns false when query is empty string", () => {
      const input: RAGSearchInput = { query: "" };
      expect(tool.validateInput(input)).toBe(false);
    });

    it("returns false when query is whitespace only", () => {
      const input: RAGSearchInput = { query: "   " };
      expect(tool.validateInput(input)).toBe(false);
    });

    it("returns false when query exceeds 2000 characters", () => {
      const input: RAGSearchInput = { query: "a".repeat(2001) };
      expect(tool.validateInput(input)).toBe(false);
    });

    it("returns false when topK is out of range (0)", () => {
      const input: RAGSearchInput = { query: "valid query", topK: 0 };
      expect(tool.validateInput(input)).toBe(false);
    });

    it("returns false when topK exceeds 20", () => {
      const input: RAGSearchInput = { query: "valid query", topK: 21 };
      expect(tool.validateInput(input)).toBe(false);
    });

    it("returns false when threshold is outside [0, 1]", () => {
      const input: RAGSearchInput = { query: "valid query", threshold: 1.5 };
      expect(tool.validateInput(input)).toBe(false);
    });

    it("returns false when resourceIds exceeds 50", () => {
      const input: RAGSearchInput = {
        query: "valid query",
        resourceIds: Array.from({ length: 51 }, (_, i) => `id-${i}`),
      };
      expect(tool.validateInput(input)).toBe(false);
    });

    it("returns true for a valid minimal input", () => {
      const input: RAGSearchInput = { query: "valid query" };
      expect(tool.validateInput(input)).toBe(true);
    });

    it("returns true for valid input with all optional fields", () => {
      const input: RAGSearchInput = {
        query: "machine learning",
        topK: 10,
        threshold: 0.8,
        collectionId: "col-1",
        resourceIds: ["res-1", "res-2"],
      };
      expect(tool.validateInput(input)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 3. EmbeddingService 抛出异常时返回 error
  // --------------------------------------------------------------------------
  describe("doExecute - EmbeddingService failure", () => {
    it("returns ToolResult with success=false when embedding generation throws", async () => {
      mockEmbeddingService.generateEmbedding.mockRejectedValue(
        new Error("OpenAI API rate limit exceeded"),
      );

      const input: RAGSearchInput = { query: "some query" };
      const result = await tool.execute(input, buildContext());

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain("Embedding generation failed");
      expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // 4. pgvector 表不存在时返回友好错误（不抛出）
  // --------------------------------------------------------------------------
  describe("doExecute - relation does not exist", () => {
    it("wraps pgvector table-missing error with friendly message", async () => {
      mockEmbeddingService.generateEmbedding.mockResolvedValue(
        buildEmbeddingResult([0.1, 0.2]),
      );
      mockPrisma.$queryRawUnsafe.mockRejectedValue(
        new Error('relation "embeddings" does not exist'),
      );

      const input: RAGSearchInput = { query: "some query" };
      const result = await tool.execute(input, buildContext());

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain("chunks");
      expect(result.error!.message).toContain("embeddings");
    });

    it("wraps 'relation' keyword errors with friendly message", async () => {
      mockEmbeddingService.generateEmbedding.mockResolvedValue(
        buildEmbeddingResult([0.5]),
      );
      mockPrisma.$queryRawUnsafe.mockRejectedValue(
        new Error("relation not found in schema"),
      );

      const input: RAGSearchInput = { query: "query" };
      const result = await tool.execute(input, buildContext());

      expect(result.success).toBe(false);
      expect(result.error!.message).toMatch(/数据库迁移|migration/i);
    });
  });

  // --------------------------------------------------------------------------
  // 5. minSimilarity / threshold 过滤：低于阈值的结果被过滤
  // --------------------------------------------------------------------------
  describe("doExecute - threshold filtering", () => {
    it("filters out results below the threshold", async () => {
      mockEmbeddingService.generateEmbedding.mockResolvedValue(
        buildEmbeddingResult([0.1, 0.2, 0.3]),
      );

      const rows: RawChunkRow[] = [
        buildRawRow({ chunk_id: "c1", similarity: 0.9 }),
        buildRawRow({ chunk_id: "c2", similarity: 0.65 }), // below default threshold 0.7
        buildRawRow({ chunk_id: "c3", similarity: 0.72 }),
      ];
      mockPrisma.$queryRawUnsafe.mockResolvedValue(rows);

      const input: RAGSearchInput = { query: "test", threshold: 0.7 };
      const result = await tool.execute(input, buildContext());

      expect(result.success).toBe(true);
      const data = result.data!;
      expect(data.results).toHaveLength(2);
      const returnedIds = data.results.map((r) => r.chunkId);
      expect(returnedIds).toContain("c1");
      expect(returnedIds).toContain("c3");
      expect(returnedIds).not.toContain("c2");
    });

    it("returns all results when threshold is 0", async () => {
      mockEmbeddingService.generateEmbedding.mockResolvedValue(
        buildEmbeddingResult([0.1]),
      );

      const rows: RawChunkRow[] = [
        buildRawRow({ chunk_id: "c1", similarity: 0.1 }),
        buildRawRow({ chunk_id: "c2", similarity: 0.05 }),
      ];
      mockPrisma.$queryRawUnsafe.mockResolvedValue(rows);

      const input: RAGSearchInput = { query: "test", threshold: 0 };
      const result = await tool.execute(input, buildContext());

      expect(result.data!.results).toHaveLength(2);
    });
  });

  // --------------------------------------------------------------------------
  // 6. topK 限制结果数量（通过 SQL 参数传递）
  // --------------------------------------------------------------------------
  describe("doExecute - topK", () => {
    it("passes topK as limit parameter to the SQL query", async () => {
      mockEmbeddingService.generateEmbedding.mockResolvedValue(
        buildEmbeddingResult([0.1, 0.2]),
      );
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      const input: RAGSearchInput = { query: "test", topK: 3 };
      await tool.execute(input, buildContext());

      const callArgs = mockPrisma.$queryRawUnsafe.mock.calls[0];
      // The last numeric argument should be the topK value
      const numericArgs = callArgs
        .slice(1)
        .filter((a) => typeof a === "number");
      expect(numericArgs).toContain(3);
    });

    it("uses default topK of 5 when not specified", async () => {
      mockEmbeddingService.generateEmbedding.mockResolvedValue(
        buildEmbeddingResult([0.1]),
      );
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      const input: RAGSearchInput = { query: "test" };
      await tool.execute(input, buildContext());

      const callArgs = mockPrisma.$queryRawUnsafe.mock.calls[0];
      const numericArgs = callArgs
        .slice(1)
        .filter((a) => typeof a === "number");
      expect(numericArgs).toContain(5);
    });
  });

  // --------------------------------------------------------------------------
  // 7. signal.aborted 时立即返回
  // --------------------------------------------------------------------------
  describe("doExecute - cancellation", () => {
    it("returns cancelled error when AbortSignal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      const input: RAGSearchInput = { query: "test" };
      const context = buildContext({ signal: controller.signal });

      const result = await tool.execute(input, context);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      // ToolErrorCode.CANCELLED = "TOOL_3002"
      expect(result.error!.code).toBe("TOOL_3002");

      // Neither embedding nor SQL should have been called
      expect(mockEmbeddingService.generateEmbedding).not.toHaveBeenCalled();
      expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Metadata checks
  // --------------------------------------------------------------------------
  describe("ToolResult metadata", () => {
    it("includes executionId, duration, and startTime in metadata", async () => {
      mockEmbeddingService.generateEmbedding.mockResolvedValue(
        buildEmbeddingResult([0.1]),
      );
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      const context = buildContext({ executionId: "exec-xyz" });
      const result = await tool.execute({ query: "test" }, context);

      expect(result.metadata.executionId).toBe("exec-xyz");
      expect(typeof result.metadata.duration).toBe("number");
      expect(result.metadata.duration).toBeGreaterThanOrEqual(0);
      expect(result.metadata.startTime).toBeInstanceOf(Date);
    });
  });
});
