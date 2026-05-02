/**
 * ArxivSearchTool Unit Tests
 *
 * Tests the arxiv-search tool in isolation by mocking PolicyDataService.
 * Uses tool.execute(input, context) to exercise the full BaseTool lifecycle.
 */

import { Test, TestingModule } from "@nestjs/testing";
import {
  ArxivSearchTool,
  ArxivSearchInput,
  ArxivSearchOutput,
} from "../arxiv-search.tool";
import { PolicyDataService } from "../../policy/policy-data.service";
import {
  ToolContext,
  ToolResult,
} from "../../../../abstractions/tool.interface";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    executionId: "exec-arxiv-001",
    toolId: "arxiv-search",
    createdAt: new Date(),
    ...overrides,
  };
}

function makeArxivXmlResponse(paperCount = 1): string {
  const entries = Array.from(
    { length: paperCount },
    (_, i) => `
    <entry>
      <id>http://arxiv.org/abs/2301.0${i + 1}000v1</id>
      <title>Test Paper ${i + 1}: Advances in Machine Learning</title>
      <summary>This is the abstract for test paper ${i + 1}. It covers various ML topics.</summary>
      <author><name>John Doe</name></author>
      <author><name>Jane Smith</name></author>
      <published>2023-01-${String(i + 1).padStart(2, "0")}T00:00:00Z</published>
      <updated>2023-01-${String(i + 1).padStart(2, "0")}T00:00:00Z</updated>
      <category term="cs.LG"/>
      <category term="cs.AI"/>
      <link href="http://arxiv.org/pdf/2301.0${i + 1}000v1.pdf" title="pdf"/>
    </entry>
  `,
  ).join("");

  return `<?xml version="1.0" encoding="utf-8"?>
  <feed>
    <opensearch:totalResults>42</opensearch:totalResults>
    ${entries}
  </feed>`;
}

// ---------------------------------------------------------------------------
// Mock PolicyDataService
// ---------------------------------------------------------------------------

type PolicyDataServiceMock = Pick<PolicyDataService, "httpGet" | "getApiKey">;

function createMockPolicyDataService(): jest.Mocked<PolicyDataServiceMock> {
  return {
    httpGet: jest.fn(),
    getApiKey: jest.fn().mockResolvedValue(null),
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("ArxivSearchTool", () => {
  let tool: ArxivSearchTool;
  let mockPolicyDataService: jest.Mocked<PolicyDataServiceMock>;

  beforeEach(async () => {
    mockPolicyDataService = createMockPolicyDataService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArxivSearchTool,
        { provide: PolicyDataService, useValue: mockPolicyDataService },
      ],
    }).compile();

    tool = module.get<ArxivSearchTool>(ArxivSearchTool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Metadata
  // -------------------------------------------------------------------------

  describe("tool metadata", () => {
    it("should have id = 'arxiv-search'", () => {
      expect(tool.id).toBe("arxiv-search");
    });

    it("should belong to the 'information' category", () => {
      expect(tool.category).toBe("information");
    });

    it("should have the arxiv-related tags", () => {
      expect(tool.tags).toContain("academic");
      expect(tool.tags).toContain("arxiv");
    });
  });

  // -------------------------------------------------------------------------
  // validateInput
  // -------------------------------------------------------------------------

  describe("validateInput()", () => {
    it("should return true for a valid non-empty query", () => {
      expect(tool.validateInput({ query: "machine learning" })).toBe(true);
    });

    it("should return false for an empty query string", () => {
      expect(tool.validateInput({ query: "" })).toBe(false);
    });

    it("should return false for a whitespace-only query", () => {
      expect(tool.validateInput({ query: "   " })).toBe(false);
    });

    it("should return true with optional params provided", () => {
      expect(
        tool.validateInput({
          query: "transformer",
          maxResults: 5,
          category: "cs.AI",
          sortBy: "submittedDate",
        }),
      ).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe("execute() - success path", () => {
    it("should return success:true with papers array on valid XML response", async () => {
      mockPolicyDataService.httpGet.mockResolvedValue(makeArxivXmlResponse(2));

      const input: ArxivSearchInput = { query: "machine learning" };
      const result: ToolResult<ArxivSearchOutput> = await tool.execute(
        input,
        makeContext(),
      );

      expect(result.success).toBe(true);
      expect(result.data?.success).toBe(true);
      expect(result.data?.papers).toHaveLength(2);
      expect(result.data?.totalResults).toBe(42);
    });

    it("should populate paper fields correctly from XML", async () => {
      mockPolicyDataService.httpGet.mockResolvedValue(makeArxivXmlResponse(1));

      const result = await tool.execute(
        { query: "deep learning" },
        makeContext(),
      );

      const paper = result.data?.papers[0];
      expect(paper).toBeDefined();
      expect(paper?.id).toBeDefined();
      expect(paper?.title).toContain("Test Paper");
      expect(paper?.authors).toContain("John Doe");
      expect(paper?.abstract).toBeDefined();
      expect(paper?.categories).toContain("cs.LG");
      expect(paper?.pdfUrl).toBeDefined();
      expect(paper?.arxivUrl).toBeDefined();
    });

    it("should apply category filter to query when category is provided", async () => {
      mockPolicyDataService.httpGet.mockResolvedValue(makeArxivXmlResponse(1));

      await tool.execute(
        { query: "neural networks", category: "cs.AI" },
        makeContext(),
      );

      expect(mockPolicyDataService.httpGet).toHaveBeenCalledWith(
        "https://export.arxiv.org/api/query",
        expect.objectContaining({
          search_query: "neural networks AND cat:cs.AI",
        }),
      );
    });

    it("should respect maxResults parameter up to 100", async () => {
      mockPolicyDataService.httpGet.mockResolvedValue(makeArxivXmlResponse(0));

      await tool.execute(
        { query: "transformers", maxResults: 50 },
        makeContext(),
      );

      expect(mockPolicyDataService.httpGet).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ max_results: 50 }),
      );
    });

    it("should cap maxResults at 100", async () => {
      mockPolicyDataService.httpGet.mockResolvedValue(makeArxivXmlResponse(0));

      await tool.execute({ query: "LLM", maxResults: 999 }, makeContext());

      expect(mockPolicyDataService.httpGet).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ max_results: 100 }),
      );
    });

    it("should pass sortBy parameter to API", async () => {
      mockPolicyDataService.httpGet.mockResolvedValue(makeArxivXmlResponse(0));

      await tool.execute(
        { query: "RL", sortBy: "submittedDate" },
        makeContext(),
      );

      expect(mockPolicyDataService.httpGet).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ sortBy: "submittedDate" }),
      );
    });

    it("should return empty papers when feed has no entries", async () => {
      const emptyXml = `<?xml version="1.0"?>
      <feed>
        <opensearch:totalResults>0</opensearch:totalResults>
      </feed>`;
      mockPolicyDataService.httpGet.mockResolvedValue(emptyXml);

      const result = await tool.execute({ query: "xyzzy" }, makeContext());

      expect(result.success).toBe(true);
      expect(result.data?.papers).toHaveLength(0);
      expect(result.data?.totalResults).toBe(0);
    });

    it("should construct correct arxivUrl from paper id", async () => {
      mockPolicyDataService.httpGet.mockResolvedValue(makeArxivXmlResponse(1));

      const result = await tool.execute({ query: "test" }, makeContext());

      const paper = result.data?.papers[0];
      expect(paper?.arxivUrl).toMatch(/^http:\/\/arxiv\.org\/abs\//);
    });
  });

  // -------------------------------------------------------------------------
  // Error path
  // -------------------------------------------------------------------------

  describe("execute() - error path", () => {
    it("should return success:true with data.success=false when API throws", async () => {
      mockPolicyDataService.httpGet.mockRejectedValue(
        new Error("Network error"),
      );

      const result = await tool.execute({ query: "test" }, makeContext());

      expect(result.success).toBe(true);
      expect(result.data?.success).toBe(false);
      expect(result.data?.error).toContain("ArXiv 搜索失败");
      expect(result.data?.papers).toHaveLength(0);
    });

    it("should include the original error message in the error field", async () => {
      mockPolicyDataService.httpGet.mockRejectedValue(
        new Error("Connection refused"),
      );

      const result = await tool.execute({ query: "AI" }, makeContext());

      expect(result.data?.error).toContain("Connection refused");
    });
  });

  // -------------------------------------------------------------------------
  // Cancellation
  // -------------------------------------------------------------------------

  describe("execute() - cancellation", () => {
    it("should return success:false immediately when signal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      const result = await tool.execute(
        { query: "any" },
        makeContext({ signal: controller.signal }),
      );

      expect(result.success).toBe(false);
      expect(mockPolicyDataService.httpGet).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Metadata in result
  // -------------------------------------------------------------------------

  describe("execute() - result metadata", () => {
    it("should include executionId in result metadata", async () => {
      mockPolicyDataService.httpGet.mockResolvedValue(makeArxivXmlResponse(1));

      const result = await tool.execute({ query: "ml" }, makeContext());

      expect(result.metadata?.executionId).toBe("exec-arxiv-001");
      expect(result.metadata?.duration).toBeGreaterThanOrEqual(0);
    });
  });
});
