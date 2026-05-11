/**
 * RAGSearchTool — 单测（2026-04-30 重写）
 *
 * 旧实现走 chunks/embeddings 表 + EmbeddingService（pgvector 路径，已废）。
 * 新实现委托 RAGPipelineService.simpleQuery，本测试覆盖：
 *   1. 工具元数据（id/category/tags/name/description）
 *   2. validateInput 边界
 *   3. doExecute:
 *      - 未传 knowledgeBaseIds → success:true + results:[] + note
 *      - 空数组 → 同上
 *      - 正常召回 → 委托 simpleQuery + 映射 SimilarityResult → RAGSearchResultItem
 *      - 阈值过滤
 *      - simpleQuery 抛 → success:false + error message
 */

import { RAGSearchTool, RAGSearchInput } from "../rag-search.tool";
import { ToolContext } from "../../../../abstractions/tool.interface";
import type { SearchResult } from "@/modules/ai-engine/rag/pipeline/rag-pipeline.interface";

type MockRAGPipeline = {
  simpleQuery: jest.MockedFunction<
    (query: string, kbIds: string[], topK?: number) => Promise<SearchResult[]>
  >;
};

function buildContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    executionId: "exec-1",
    toolId: "rag-search",
    userId: "user-1",
    createdAt: new Date(),
    ...overrides,
  };
}

function makeResult(
  id: string,
  score: number,
  content = `content-${id}`,
): SearchResult {
  return {
    childChunkId: `child-${id}`,
    parentChunkId: `parent-${id}`,
    documentId: `doc-${id}`,
    content,
    parentContent: `parent-content-${id}`,
    score,
    metadata: { sourceUrl: `https://example.com/${id}` },
  };
}

describe("RAGSearchTool", () => {
  let tool: RAGSearchTool;
  let mockPipeline: MockRAGPipeline;

  beforeEach(() => {
    mockPipeline = {
      simpleQuery: jest.fn(),
    };
    tool = new RAGSearchTool(mockPipeline as never);
  });

  describe("metadata", () => {
    it("exposes stable id/category/tags/name", () => {
      expect(tool.id).toBe("rag-search");
      expect(tool.category).toBe("information");
      expect(tool.tags).toEqual([
        "knowledge",
        "rag",
        "vector",
        "internal",
        "embedding",
      ]);
      expect(tool.name).toBe("向量检索");
      expect(typeof tool.description).toBe("string");
    });

    it("declares input/output schema with required query field", () => {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.required).toEqual(["query"]);
      expect(
        (tool.inputSchema.properties as Record<string, { type: string }>)
          .knowledgeBaseIds.type,
      ).toBe("array");
    });
  });

  describe("validateInput", () => {
    const baseInput: RAGSearchInput = { query: "what is RAG?" };

    it("accepts a valid query", () => {
      expect(tool.validateInput(baseInput)).toBe(true);
    });

    it("rejects empty / non-string query", () => {
      expect(tool.validateInput({ query: "" })).toBe(false);
      expect(tool.validateInput({ query: "   " })).toBe(false);
      expect(tool.validateInput({ query: 42 as never })).toBe(false);
    });

    it("rejects query > 2000 chars", () => {
      expect(tool.validateInput({ query: "x".repeat(2001) })).toBe(false);
      expect(tool.validateInput({ query: "x".repeat(2000) })).toBe(true);
    });

    it("rejects topK out of [1, 20]", () => {
      expect(tool.validateInput({ ...baseInput, topK: 0 })).toBe(false);
      expect(tool.validateInput({ ...baseInput, topK: 21 })).toBe(false);
      expect(tool.validateInput({ ...baseInput, topK: 5 })).toBe(true);
    });

    it("rejects threshold out of [0, 1]", () => {
      expect(tool.validateInput({ ...baseInput, threshold: -0.1 })).toBe(false);
      expect(tool.validateInput({ ...baseInput, threshold: 1.1 })).toBe(false);
      expect(tool.validateInput({ ...baseInput, threshold: 0.5 })).toBe(true);
    });

    it("rejects knowledgeBaseIds non-array", () => {
      expect(
        tool.validateInput({
          ...baseInput,
          knowledgeBaseIds: "kb-1" as never,
        }),
      ).toBe(false);
    });

    it("rejects knowledgeBaseIds > 10 items", () => {
      const ids = Array.from({ length: 11 }, (_, i) => `kb-${i}`);
      expect(tool.validateInput({ ...baseInput, knowledgeBaseIds: ids })).toBe(
        false,
      );
    });

    it("accepts knowledgeBaseIds = 10 items", () => {
      const ids = Array.from({ length: 10 }, (_, i) => `kb-${i}`);
      expect(tool.validateInput({ ...baseInput, knowledgeBaseIds: ids })).toBe(
        true,
      );
    });
  });

  describe("doExecute — graceful degradation", () => {
    it("returns success:true + empty results + note when knowledgeBaseIds is undefined", async () => {
      const result = await tool.execute({ query: "test" }, buildContext());

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const data = result.data!;
      expect(data.success).toBe(true);
      expect(data.results).toEqual([]);
      expect(data.totalResults).toBe(0);
      expect(data.note).toContain("no knowledgeBaseIds");
      expect(mockPipeline.simpleQuery).not.toHaveBeenCalled();
    });

    it("returns same shape when knowledgeBaseIds is empty array", async () => {
      const result = await tool.execute(
        { query: "test", knowledgeBaseIds: [] },
        buildContext(),
      );
      expect(result.success).toBe(true);
      expect(result.data!.results).toEqual([]);
      expect(result.data!.note).toContain("no knowledgeBaseIds");
      expect(mockPipeline.simpleQuery).not.toHaveBeenCalled();
    });
  });

  describe("doExecute — RAGPipeline delegation", () => {
    it("delegates to simpleQuery and maps results", async () => {
      mockPipeline.simpleQuery.mockResolvedValue([
        makeResult("a", 0.9),
        makeResult("b", 0.7),
      ]);

      const result = await tool.execute(
        { query: "RAG", knowledgeBaseIds: ["kb-1", "kb-2"], topK: 3 },
        buildContext(),
      );

      expect(mockPipeline.simpleQuery).toHaveBeenCalledWith(
        "RAG",
        ["kb-1", "kb-2"],
        3,
      );
      expect(result.success).toBe(true);
      const data = result.data!;
      expect(data.success).toBe(true);
      expect(data.totalResults).toBe(2);
      expect(data.results).toHaveLength(2);
      expect(data.results[0]).toEqual({
        chunkId: "child-a",
        documentId: "doc-a",
        content: "content-a",
        score: 0.9,
        metadata: expect.objectContaining({
          parentChunkId: "parent-a",
          parentContent: "parent-content-a",
          sourceUrl: "https://example.com/a",
        }),
      });
    });

    it("filters results below threshold", async () => {
      mockPipeline.simpleQuery.mockResolvedValue([
        makeResult("a", 0.9),
        makeResult("b", 0.4),
        makeResult("c", 0.55),
      ]);

      const result = await tool.execute(
        {
          query: "test",
          knowledgeBaseIds: ["kb-1"],
          threshold: 0.5,
        },
        buildContext(),
      );

      expect(result.data!.results).toHaveLength(2);
      expect(result.data!.results.map((r) => r.chunkId)).toEqual([
        "child-a",
        "child-c",
      ]);
    });

    it("uses default topK=5 when omitted", async () => {
      mockPipeline.simpleQuery.mockResolvedValue([]);
      await tool.execute(
        { query: "x", knowledgeBaseIds: ["kb-1"] },
        buildContext(),
      );
      expect(mockPipeline.simpleQuery).toHaveBeenCalledWith("x", ["kb-1"], 5);
    });

    it("uses default threshold=0.5 when omitted", async () => {
      mockPipeline.simpleQuery.mockResolvedValue([
        makeResult("a", 0.6),
        makeResult("b", 0.49),
      ]);
      const result = await tool.execute(
        { query: "x", knowledgeBaseIds: ["kb-1"] },
        buildContext(),
      );
      expect(result.data!.results).toHaveLength(1);
      expect(result.data!.results[0].chunkId).toBe("child-a");
    });

    it("returns success:false with error when simpleQuery throws Error", async () => {
      mockPipeline.simpleQuery.mockRejectedValue(new Error("boom"));
      const result = await tool.execute(
        { query: "x", knowledgeBaseIds: ["kb-1"] },
        buildContext(),
      );
      expect(result.success).toBe(true);
      expect(result.data!.success).toBe(false);
      expect(result.data!.error).toBe("boom");
      expect(result.data!.results).toEqual([]);
    });

    it("returns success:false with stringified error when simpleQuery throws non-Error", async () => {
      mockPipeline.simpleQuery.mockRejectedValue("opaque");
      const result = await tool.execute(
        { query: "x", knowledgeBaseIds: ["kb-1"] },
        buildContext(),
      );
      expect(result.data!.success).toBe(false);
      expect(result.data!.error).toBe("opaque");
    });
  });

  // ─── Optional KB augmentor port (PR-Wiki-Playground 2026-05-10) ───
  // When KbQueryModule is loaded, KbQueryService binds itself to the
  // KB_QUERY_AUGMENTOR token; rag-search must prefer it (wiki-first
  // routing happens inside the augmentor itself, transparent to the tool).
  describe("KB augmentor preference", () => {
    it("delegates to kbAugmentor.simpleQuery when bound, ignoring ragPipeline", async () => {
      const augmentor = {
        simpleQuery: jest.fn().mockResolvedValue([
          {
            childChunkId: "wiki-page:p1",
            parentChunkId: "wiki-page:p1",
            documentId: "doc-x",
            content: "wiki body",
            parentContent: "wiki body",
            score: 0.95,
            metadata: { source: "wiki", slug: "x" },
          },
        ]),
      };
      const toolWithAug = new RAGSearchTool(
        mockPipeline as never,
        augmentor as never,
      );

      const result = await toolWithAug.execute(
        { query: "what is x", knowledgeBaseIds: ["kb-1"], topK: 3 },
        buildContext(),
      );

      expect(augmentor.simpleQuery).toHaveBeenCalledWith(
        "what is x",
        ["kb-1"],
        3,
      );
      expect(mockPipeline.simpleQuery).not.toHaveBeenCalled();
      expect(result.data!.results).toHaveLength(1);
      expect(result.data!.results[0]).toMatchObject({
        chunkId: "wiki-page:p1",
        documentId: "doc-x",
        score: 0.95,
        metadata: expect.objectContaining({ source: "wiki", slug: "x" }),
      });
    });

    it("uses ragPipeline when augmentor is undefined (legacy chunk-only path)", async () => {
      mockPipeline.simpleQuery.mockResolvedValue([makeResult("a", 0.9)]);
      const toolNoAug = new RAGSearchTool(mockPipeline as never, undefined);

      const result = await toolNoAug.execute(
        { query: "x", knowledgeBaseIds: ["kb-1"] },
        buildContext(),
      );

      expect(mockPipeline.simpleQuery).toHaveBeenCalled();
      expect(result.data!.results).toHaveLength(1);
      expect(result.data!.results[0].chunkId).toBe("child-a");
    });

    it("propagates augmentor failure through the same friendly-error path", async () => {
      const augmentor = {
        simpleQuery: jest.fn().mockRejectedValue(new Error("429 rate limit")),
      };
      const toolWithAug = new RAGSearchTool(
        mockPipeline as never,
        augmentor as never,
      );

      const result = await toolWithAug.execute(
        { query: "x", knowledgeBaseIds: ["kb-1"] },
        buildContext(),
      );

      expect(mockPipeline.simpleQuery).not.toHaveBeenCalled();
      expect(result.data!.success).toBe(false);
      expect(result.data!.error).toMatch(/rate-?limit|限流/i);
    });
  });
});
