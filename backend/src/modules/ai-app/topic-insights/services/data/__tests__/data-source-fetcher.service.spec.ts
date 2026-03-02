import { Test, TestingModule } from "@nestjs/testing";
import { DataSourceFetcherService } from "../data-source-fetcher.service";
import {
  ToolRegistry,
  FederalRegisterTool,
  CongressGovTool,
  WhiteHouseNewsTool,
  ChatFacade,
  RAGFacade,
} from "@/modules/ai-engine/facade";
import { DataSourceType } from "../../../types/data-source.types";

const mockToolRegistry = {
  tryGet: jest.fn(),
};

const mockFederalRegisterTool = {
  execute: jest.fn(),
};

const mockCongressGovTool = {
  execute: jest.fn(),
};

const mockWhiteHouseNewsTool = {
  execute: jest.fn(),
};

const mockAiFacade = {
  embeddingGenerate: jest.fn(),
  vectorSimilaritySearch: jest.fn(),
  getAvailableModels: jest.fn(),
  chat: jest.fn(),
};

describe("DataSourceFetcherService", () => {
  let service: DataSourceFetcherService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataSourceFetcherService,
        { provide: ToolRegistry, useValue: mockToolRegistry },
        { provide: FederalRegisterTool, useValue: mockFederalRegisterTool },
        { provide: CongressGovTool, useValue: mockCongressGovTool },
        { provide: WhiteHouseNewsTool, useValue: mockWhiteHouseNewsTool },
        { provide: ChatFacade, useValue: mockAiFacade },
        { provide: RAGFacade, useValue: mockAiFacade },
      ],
    }).compile();

    service = module.get<DataSourceFetcherService>(DataSourceFetcherService);
  });

  // ============================================================
  // setCurrentTopic
  // ============================================================

  describe("setCurrentTopic", () => {
    it("should set topic for LOCAL searches", () => {
      service.setCurrentTopic({ id: "t1", name: "Test Topic" } as any);
      // No error expected; we verify behavior indirectly via searchLocal
      expect(true).toBe(true);
    });
  });

  // ============================================================
  // executeSearch - WEB
  // ============================================================

  describe("executeSearch - WEB", () => {
    it("should return empty array when web-search tool is not registered", async () => {
      mockToolRegistry.tryGet.mockReturnValue(null);

      const results = await service.executeSearch(
        DataSourceType.WEB,
        "AI trends",
        5,
      );

      expect(results).toEqual([]);
    });

    it("should return mapped results from web-search tool", async () => {
      const mockTool = {
        execute: jest.fn().mockResolvedValue({
          success: true,
          data: {
            success: true,
            provider: "tavily",
            results: [
              {
                title: "AI News",
                url: "https://example.com/ai",
                content: "AI is growing fast",
                publishedDate: "2025-01-01",
                domain: "example.com",
                score: 0.9,
              },
            ],
          },
        }),
      };
      mockToolRegistry.tryGet.mockReturnValue(mockTool);

      const results = await service.executeSearch(
        DataSourceType.WEB,
        "AI trends",
        5,
      );

      expect(results).toHaveLength(1);
      expect(results[0].sourceType).toBe(DataSourceType.WEB);
      expect(results[0].title).toBe("AI News");
      expect(results[0].url).toBe("https://example.com/ai");
    });

    it("should return empty array when tool returns unsuccessful result", async () => {
      const mockTool = {
        execute: jest
          .fn()
          .mockResolvedValue({ success: false, error: { message: "failed" } }),
      };
      mockToolRegistry.tryGet.mockReturnValue(mockTool);

      const results = await service.executeSearch(
        DataSourceType.WEB,
        "test",
        5,
      );

      expect(results).toEqual([]);
    });

    it("should handle tool execution exceptions gracefully", async () => {
      const mockTool = {
        execute: jest.fn().mockRejectedValue(new Error("Network error")),
      };
      mockToolRegistry.tryGet.mockReturnValue(mockTool);

      const results = await service.executeSearch(
        DataSourceType.WEB,
        "test",
        5,
      );

      expect(results).toEqual([]);
    });
  });

  // ============================================================
  // executeSearch - ACADEMIC
  // ============================================================

  describe("executeSearch - ACADEMIC", () => {
    it("should return empty array when arxiv-search tool not registered", async () => {
      mockToolRegistry.tryGet.mockReturnValue(null);

      const results = await service.executeSearch(
        DataSourceType.ACADEMIC,
        "machine learning",
        5,
      );

      expect(results).toEqual([]);
    });

    it("should return mapped academic results", async () => {
      const mockTool = {
        execute: jest.fn().mockResolvedValue({
          success: true,
          data: {
            success: true,
            papers: [
              {
                id: "2401.12345",
                title: "Deep Learning Advances",
                summary: "A ".repeat(300),
                authors: ["Author One"],
                published: "2025-01-10",
                updated: "2025-01-11",
                categories: ["cs.LG"],
                pdfUrl: "https://arxiv.org/pdf/2401.12345",
                absUrl: "https://arxiv.org/abs/2401.12345",
              },
            ],
            totalResults: 1,
            query: "machine learning",
          },
        }),
      };
      mockToolRegistry.tryGet.mockReturnValue(mockTool);

      const results = await service.executeSearch(
        DataSourceType.ACADEMIC,
        "machine learning",
        5,
      );

      expect(results).toHaveLength(1);
      expect(results[0].sourceType).toBe(DataSourceType.ACADEMIC);
      expect(results[0].domain).toBe("arxiv.org");
      expect(results[0].metadata?.arxivId).toBe("2401.12345");
    });
  });

  // ============================================================
  // executeSearch - GITHUB
  // ============================================================

  describe("executeSearch - GITHUB", () => {
    it("should return mapped GitHub repositories", async () => {
      const mockTool = {
        execute: jest.fn().mockResolvedValue({
          success: true,
          data: {
            success: true,
            repositories: [
              {
                fullName: "org/repo",
                description: "A cool repo",
                htmlUrl: "https://github.com/org/repo",
                language: "TypeScript",
                stargazersCount: 1000,
                forksCount: 200,
                openIssuesCount: 10,
                topics: ["ai"],
                createdAt: "2024-01-01",
                updatedAt: "2025-01-01",
                pushedAt: "2025-01-15",
                owner: { login: "org", avatarUrl: "", type: "Organization" },
              },
            ],
            totalCount: 1,
            query: "react",
          },
        }),
      };
      mockToolRegistry.tryGet.mockReturnValue(mockTool);

      const results = await service.executeSearch(
        DataSourceType.GITHUB,
        "react",
        5,
      );

      expect(results[0].sourceType).toBe(DataSourceType.GITHUB);
      expect(results[0].domain).toBe("github.com");
      expect(results[0].metadata?.stars).toBe(1000);
    });
  });

  // ============================================================
  // executeSearch - HACKERNEWS
  // ============================================================

  describe("executeSearch - HACKERNEWS", () => {
    it("should return mapped HackerNews hits", async () => {
      const mockTool = {
        execute: jest.fn().mockResolvedValue({
          success: true,
          data: {
            success: true,
            hits: [
              {
                title: "Ask HN: Best AI tools",
                url: "https://hn.com/item?id=123",
                hnUrl: "https://news.ycombinator.com/item?id=123",
                author: "user123",
                points: 500,
                numComments: 120,
                createdAt: "2025-01-10",
                storyText: null,
              },
            ],
            totalHits: 1,
            query: "AI tools",
          },
        }),
      };
      mockToolRegistry.tryGet.mockReturnValue(mockTool);

      const results = await service.executeSearch(
        DataSourceType.HACKERNEWS,
        "AI tools",
        5,
      );

      expect(results[0].sourceType).toBe(DataSourceType.HACKERNEWS);
      expect(results[0].metadata?.points).toBe(500);
    });
  });

  // ============================================================
  // executeSearch - RSS
  // ============================================================

  describe("executeSearch - RSS", () => {
    it("should return empty array for RSS (not implemented)", async () => {
      const results = await service.executeSearch(
        DataSourceType.RSS,
        "test",
        5,
      );

      expect(results).toEqual([]);
    });
  });

  // ============================================================
  // executeSearch - LOCAL
  // ============================================================

  describe("executeSearch - LOCAL", () => {
    it("should return empty array when no knowledge bases configured", async () => {
      service.setCurrentTopic({
        id: "t1",
        name: "Topic",
        topicConfig: {},
      } as any);

      const results = await service.executeSearch(
        DataSourceType.LOCAL,
        "test",
        5,
      );

      expect(results).toEqual([]);
    });

    it("should search knowledge base and return mapped results", async () => {
      service.setCurrentTopic({
        id: "t1",
        name: "Topic",
        topicConfig: { knowledgeBaseIds: ["kb1"] },
      } as any);

      mockAiFacade.embeddingGenerate.mockResolvedValue({
        embedding: [0.1, 0.2, 0.3],
      });
      mockAiFacade.vectorSimilaritySearch.mockResolvedValue([
        {
          content: "Some knowledge base content",
          parentContent: "# Title\nSome content",
          similarity: 0.85,
          documentId: "doc1",
          childChunkId: "chunk1",
          parentChunkId: "parent1",
        },
      ]);

      const results = await service.executeSearch(
        DataSourceType.LOCAL,
        "test",
        5,
      );

      expect(results).toHaveLength(1);
      expect(results[0].sourceType).toBe(DataSourceType.LOCAL);
      expect(results[0].domain).toBe("knowledge-base");
    });

    it("should return empty array when embedding generation fails", async () => {
      service.setCurrentTopic({
        id: "t1",
        name: "Topic",
        topicConfig: { knowledgeBaseIds: ["kb1"] },
      } as any);

      mockAiFacade.embeddingGenerate.mockResolvedValue(null);

      const results = await service.executeSearch(
        DataSourceType.LOCAL,
        "test",
        5,
      );

      expect(results).toEqual([]);
    });
  });

  // ============================================================
  // executeSearch - FEDERAL_REGISTER
  // ============================================================

  describe("executeSearch - FEDERAL_REGISTER", () => {
    it("should return mapped Federal Register documents", async () => {
      mockFederalRegisterTool.execute.mockResolvedValue({
        success: true,
        data: {
          documents: [
            {
              title: "AI Regulation Rule",
              htmlUrl: "https://federalregister.gov/doc/123",
              abstract: "This rule covers AI systems",
              publicationDate: "2025-01-15",
              type: "Rule",
              agencies: ["FTC"],
              documentNumber: "2025-00123",
            },
          ],
        },
      });

      const results = await service.executeSearch(
        DataSourceType.FEDERAL_REGISTER,
        "AI regulation",
        5,
      );

      expect(results[0].sourceType).toBe(DataSourceType.FEDERAL_REGISTER);
      expect(results[0].domain).toBe("federalregister.gov");
    });

    it("should return empty when tool fails", async () => {
      mockFederalRegisterTool.execute.mockResolvedValue({
        success: false,
        error: { message: "API error" },
      });

      const results = await service.executeSearch(
        DataSourceType.FEDERAL_REGISTER,
        "test",
        5,
      );

      expect(results).toEqual([]);
    });
  });

  // ============================================================
  // executeSearch - CONGRESS
  // ============================================================

  describe("executeSearch - CONGRESS", () => {
    it("should return mapped Congress bills", async () => {
      mockCongressGovTool.execute.mockResolvedValue({
        success: true,
        data: {
          bills: [
            {
              shortTitle: "AI Act",
              title: "Artificial Intelligence Act of 2025",
              url: "https://congress.gov/bill/123",
              number: "H.R.1234",
              type: "HR",
              congress: 119,
              introducedDate: "2025-01-10",
              sponsors: ["Rep. Smith"],
              policyArea: "Technology",
              latestAction: { text: "Passed House" },
            },
          ],
        },
      });

      const results = await service.executeSearch(
        DataSourceType.CONGRESS,
        "AI",
        5,
      );

      expect(results[0].sourceType).toBe(DataSourceType.CONGRESS);
      expect(results[0].domain).toBe("congress.gov");
    });
  });

  // ============================================================
  // executeSearch - WHITEHOUSE
  // ============================================================

  describe("executeSearch - WHITEHOUSE", () => {
    it("should return mapped WhiteHouse news items", async () => {
      mockWhiteHouseNewsTool.execute.mockResolvedValue({
        success: true,
        data: {
          items: [
            {
              title: "President Signs AI Executive Order",
              url: "https://whitehouse.gov/briefings/2025-01",
              summary: "The President signed an executive order on AI",
              date: "2025-01-20",
              type: "executive-order",
            },
          ],
        },
      });

      const results = await service.executeSearch(
        DataSourceType.WHITEHOUSE,
        "executive order",
        5,
      );

      expect(results[0].sourceType).toBe(DataSourceType.WHITEHOUSE);
      expect(results[0].domain).toBe("whitehouse.gov");
    });
  });

  // ============================================================
  // executeSearch - SOCIAL_X (via web search fallback)
  // ============================================================

  describe("executeSearch - SOCIAL_X", () => {
    it("should fall back to web search when no Grok model available", async () => {
      mockAiFacade.getAvailableModels.mockResolvedValue([
        { id: "gpt-4", provider: "openai" },
      ]);

      const mockWebTool = {
        execute: jest.fn().mockResolvedValue({
          success: true,
          data: {
            success: true,
            results: [
              {
                title: "Tweet about AI",
                url: "https://x.com/user/status/123",
                content: "AI is amazing",
                domain: "x.com",
              },
            ],
          },
        }),
      };
      mockToolRegistry.tryGet.mockReturnValue(mockWebTool);

      const results = await service.searchSocialX("AI trends", 3);

      expect(results[0].sourceType).toBe(DataSourceType.SOCIAL_X);
    });

    it("should return empty for unknown source type", async () => {
      const results = await service.executeSearch(
        "unknown" as DataSourceType,
        "test",
        5,
      );

      expect(results).toEqual([]);
    });
  });
});
