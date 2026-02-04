/**
 * ResearchEvidenceAdapter Unit Tests
 *
 * 测试要点：
 * - saveResearchEvidence(): 双写模式（TopicEvidence + Engine Evidence）
 * - saveResearchEvidenceBatch(): 批量操作事务原子性
 * - 优雅降级：Engine 写入失败不影响核心功能
 * - mapSourceTypeToEvidenceType(): 类型映射正确性
 * - normalizeUrl(): URL 标准化（使用 GlobalDeduplicationService 或降级）
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ResearchEvidenceAdapter } from "../research-evidence.adapter";
import { PrismaService } from "@/common/prisma/prisma.service";
import { EvidenceManagerService } from "@/modules/ai-engine/evidence/services/evidence-manager.service";
import { CitationFormatterService } from "@/modules/ai-engine/evidence/services/citation-formatter.service";
import { GlobalDeduplicationService } from "@/common/deduplication/deduplication.service";
import { EvidenceSyncCompensationService } from "../evidence-sync-compensation.service";
import type { TopicEvidence } from "@prisma/client";

describe("ResearchEvidenceAdapter", () => {
  let adapter: ResearchEvidenceAdapter;
  let prismaService: jest.Mocked<PrismaService>;
  let engineEvidenceService: jest.Mocked<EvidenceManagerService>;
  let citationFormatterService: jest.Mocked<CitationFormatterService>;
  let deduplicationService: jest.Mocked<GlobalDeduplicationService>;
  let compensationService: jest.Mocked<EvidenceSyncCompensationService>;

  // Mock data
  const mockReportId = "report-123";
  const mockAnalysisId = "analysis-456";
  const mockTopicEvidence: TopicEvidence = {
    id: "evidence-789",
    reportId: mockReportId,
    analysisId: mockAnalysisId,
    url: "https://example.com/article",
    title: "Test Article",
    snippet: "This is a test snippet",
    sourceType: "web",
    domain: "example.com",
    publishedAt: new Date("2025-01-01"),
    credibilityScore: 85,
    citationIndex: 1,
    accessedAt: new Date("2025-02-01"),
  };

  const mockEngineEvidence = {
    id: "engine-evidence-123",
    type: "FACT" as const,
    source: {
      url: "https://example.com/article",
      title: "Test Article",
      domain: "example.com",
    },
    content: {
      original: "This is a test snippet",
      snippet: "This is a test snippet",
    },
    metadata: {
      relevanceScore: 0.5,
      credibilityScore: 0.85,
      citationCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  beforeEach(async () => {
    // Mock PrismaService
    const mockPrismaService = {
      topicEvidence: {
        aggregate: jest.fn(),
        create: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    // Mock EvidenceManagerService
    const mockEngineEvidenceService = {
      save: jest.fn(),
      getStats: jest.fn(),
    };

    // Mock CitationFormatterService
    const mockCitationFormatterService = {
      format: jest.fn(),
      formatBibliography: jest.fn(),
    };

    // Mock GlobalDeduplicationService
    const mockDeduplicationService = {
      normalizeUrl: jest.fn(),
    };

    // Mock EvidenceSyncCompensationService
    const mockCompensationService = {
      queueForRetry: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResearchEvidenceAdapter,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EvidenceManagerService, useValue: mockEngineEvidenceService },
        {
          provide: CitationFormatterService,
          useValue: mockCitationFormatterService,
        },
        {
          provide: GlobalDeduplicationService,
          useValue: mockDeduplicationService,
        },
        {
          provide: EvidenceSyncCompensationService,
          useValue: mockCompensationService,
        },
      ],
    }).compile();

    adapter = module.get<ResearchEvidenceAdapter>(ResearchEvidenceAdapter);
    prismaService = module.get(PrismaService);
    engineEvidenceService = module.get(EvidenceManagerService);
    citationFormatterService = module.get(CitationFormatterService);
    deduplicationService = module.get(GlobalDeduplicationService);
    compensationService = module.get(EvidenceSyncCompensationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==================== saveResearchEvidence ====================

  describe("saveResearchEvidence", () => {
    const validInput = {
      reportId: mockReportId,
      analysisId: mockAnalysisId,
      url: "https://example.com/article",
      title: "Test Article",
      snippet: "This is a test snippet",
      sourceType: "web",
      domain: "example.com",
      publishedAt: new Date("2025-01-01"),
      credibilityScore: 85,
    };

    it("should save evidence to both TopicEvidence and Engine Evidence (双写成功)", async () => {
      // Arrange
      (prismaService.topicEvidence.aggregate as jest.Mock).mockResolvedValue({
        _max: { citationIndex: 0 },
      });
      (prismaService.topicEvidence.create as jest.Mock).mockResolvedValue(
        mockTopicEvidence,
      );
      (engineEvidenceService.save as jest.Mock).mockResolvedValue(
        mockEngineEvidence,
      );

      // Act
      const result = await adapter.saveResearchEvidence(validInput);

      // Assert
      expect(result.topicEvidenceId).toBe(mockTopicEvidence.id);
      expect(result.engineEvidenceId).toBe(mockEngineEvidence.id);

      // Verify TopicEvidence creation
      expect(prismaService.topicEvidence.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reportId: validInput.reportId,
          url: validInput.url,
          title: validInput.title,
          citationIndex: 1,
        }),
      });

      // Verify Engine Evidence creation
      expect(engineEvidenceService.save).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "FACT",
          source: {
            url: validInput.url,
            title: validInput.title,
            domain: validInput.domain,
            publishedAt: validInput.publishedAt,
          },
          associations: {
            entityType: "research_report",
            entityId: validInput.reportId,
            location: `analysis:${validInput.analysisId}`,
            context: "citation:1",
          },
        }),
      );
    });

    it("should increment citationIndex correctly", async () => {
      // Arrange - simulate existing citations
      (prismaService.topicEvidence.aggregate as jest.Mock).mockResolvedValue({
        _max: { citationIndex: 5 },
      });
      (prismaService.topicEvidence.create as jest.Mock).mockResolvedValue({
        ...mockTopicEvidence,
        citationIndex: 6,
      });
      (engineEvidenceService.save as jest.Mock).mockResolvedValue(
        mockEngineEvidence,
      );

      // Act
      await adapter.saveResearchEvidence(validInput);

      // Assert
      expect(prismaService.topicEvidence.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          citationIndex: 6,
        }),
      });
    });

    it("should handle null analysisId correctly", async () => {
      // Arrange
      const inputWithoutAnalysisId = { ...validInput, analysisId: undefined };
      (prismaService.topicEvidence.aggregate as jest.Mock).mockResolvedValue({
        _max: { citationIndex: 0 },
      });
      (prismaService.topicEvidence.create as jest.Mock).mockResolvedValue(
        mockTopicEvidence,
      );
      (engineEvidenceService.save as jest.Mock).mockResolvedValue(
        mockEngineEvidence,
      );

      // Act
      await adapter.saveResearchEvidence(inputWithoutAnalysisId);

      // Assert
      expect(engineEvidenceService.save).toHaveBeenCalledWith(
        expect.objectContaining({
          associations: expect.objectContaining({
            location: undefined,
          }),
        }),
      );
    });

    it("should gracefully degrade when Engine Evidence save fails", async () => {
      // Arrange
      (prismaService.topicEvidence.aggregate as jest.Mock).mockResolvedValue({
        _max: { citationIndex: 0 },
      });
      (prismaService.topicEvidence.create as jest.Mock).mockResolvedValue(
        mockTopicEvidence,
      );
      (engineEvidenceService.save as jest.Mock).mockRejectedValue(
        new Error("Engine service unavailable"),
      );

      // Act
      const result = await adapter.saveResearchEvidence(validInput);

      // Assert - TopicEvidence should still succeed
      expect(result.topicEvidenceId).toBe(mockTopicEvidence.id);
      expect(result.engineEvidenceId).toBe("skipped");

      // Verify compensation service was called
      expect(compensationService.queueForRetry).toHaveBeenCalledWith(
        mockTopicEvidence.id,
        expect.any(Object),
        "Engine service unavailable",
      );
    });

    it("should handle non-Error exceptions in Engine Evidence save", async () => {
      // Arrange
      (prismaService.topicEvidence.aggregate as jest.Mock).mockResolvedValue({
        _max: { citationIndex: 0 },
      });
      (prismaService.topicEvidence.create as jest.Mock).mockResolvedValue(
        mockTopicEvidence,
      );
      (engineEvidenceService.save as jest.Mock).mockRejectedValue(
        "String error",
      );

      // Act
      const result = await adapter.saveResearchEvidence(validInput);

      // Assert
      expect(result.engineEvidenceId).toBe("skipped");
      expect(compensationService.queueForRetry).toHaveBeenCalledWith(
        mockTopicEvidence.id,
        expect.any(Object),
        "String error",
      );
    });

    it("should convert credibilityScore from 0-100 to 0-1 range", async () => {
      // Arrange
      (prismaService.topicEvidence.aggregate as jest.Mock).mockResolvedValue({
        _max: { citationIndex: 0 },
      });
      (prismaService.topicEvidence.create as jest.Mock).mockResolvedValue(
        mockTopicEvidence,
      );
      (engineEvidenceService.save as jest.Mock).mockResolvedValue(
        mockEngineEvidence,
      );

      // Act
      await adapter.saveResearchEvidence(validInput);

      // Assert
      expect(engineEvidenceService.save).toHaveBeenCalledWith(
        expect.objectContaining({
          credibilityScore: 0.85, // 85 / 100
        }),
      );
    });

    it("should truncate snippet to 500 characters for Engine Evidence", async () => {
      // Arrange
      const longSnippet = "A".repeat(1000);
      const inputWithLongSnippet = { ...validInput, snippet: longSnippet };
      (prismaService.topicEvidence.aggregate as jest.Mock).mockResolvedValue({
        _max: { citationIndex: 0 },
      });
      (prismaService.topicEvidence.create as jest.Mock).mockResolvedValue(
        mockTopicEvidence,
      );
      (engineEvidenceService.save as jest.Mock).mockResolvedValue(
        mockEngineEvidence,
      );

      // Act
      await adapter.saveResearchEvidence(inputWithLongSnippet);

      // Assert
      expect(engineEvidenceService.save).toHaveBeenCalledWith(
        expect.objectContaining({
          content: {
            original: longSnippet,
            snippet: longSnippet.slice(0, 500),
          },
        }),
      );
    });
  });

  // ==================== saveResearchEvidenceBatch ====================

  describe("saveResearchEvidenceBatch", () => {
    it("should return empty array for empty input", async () => {
      // Act
      const result = await adapter.saveResearchEvidenceBatch([]);

      // Assert
      expect(result).toEqual([]);
    });

    it("should batch save evidences within transaction", async () => {
      // Arrange
      const inputs = [
        {
          reportId: mockReportId,
          url: "https://example.com/1",
          title: "Article 1",
          snippet: "Snippet 1",
          sourceType: "web",
        },
        {
          reportId: mockReportId,
          url: "https://example.com/2",
          title: "Article 2",
          snippet: "Snippet 2",
          sourceType: "web",
        },
      ];

      const createdEvidences = [
        { ...mockTopicEvidence, id: "ev-1", citationIndex: 1 },
        { ...mockTopicEvidence, id: "ev-2", citationIndex: 2 },
      ];

      (prismaService.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          // Mock transaction context
          const tx = {
            topicEvidence: {
              aggregate: jest.fn().mockResolvedValue({
                _max: { citationIndex: 0 },
              }),
              createMany: jest.fn().mockResolvedValue({ count: 2 }),
              findMany: jest.fn().mockResolvedValue(createdEvidences),
            },
          };
          return callback(tx);
        },
      );

      (engineEvidenceService.save as jest.Mock).mockResolvedValue(
        mockEngineEvidence,
      );

      // Act
      const result = await adapter.saveResearchEvidenceBatch(inputs);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].topicEvidenceId).toBe("ev-1");
      expect(result[1].topicEvidenceId).toBe("ev-2");

      // Verify transaction was used with 30s timeout
      expect(prismaService.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        { timeout: 30000 },
      );
    });

    it("should handle Engine Evidence save failure gracefully in batch", async () => {
      // Arrange
      const inputs = [
        {
          reportId: mockReportId,
          url: "https://example.com/1",
          title: "Article 1",
          snippet: "Snippet 1",
          sourceType: "web",
        },
      ];

      const createdEvidences = [
        { ...mockTopicEvidence, id: "ev-1", citationIndex: 1 },
      ];

      (prismaService.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const tx = {
            topicEvidence: {
              aggregate: jest.fn().mockResolvedValue({
                _max: { citationIndex: 0 },
              }),
              createMany: jest.fn().mockResolvedValue({ count: 1 }),
              findMany: jest.fn().mockResolvedValue(createdEvidences),
            },
          };
          return callback(tx);
        },
      );

      // Engine save fails
      (engineEvidenceService.save as jest.Mock).mockRejectedValue(
        new Error("Engine error"),
      );

      // Act
      const result = await adapter.saveResearchEvidenceBatch(inputs);

      // Assert - TopicEvidence should still succeed
      expect(result).toHaveLength(1);
      expect(result[0].topicEvidenceId).toBe("ev-1");
      expect(result[0].engineEvidenceId).toBe("skipped");
    });

    it("should group evidences by reportId", async () => {
      // Arrange
      const inputs = [
        {
          reportId: "report-1",
          url: "https://example.com/1",
          title: "Article 1",
          snippet: "Snippet 1",
          sourceType: "web",
        },
        {
          reportId: "report-2",
          url: "https://example.com/2",
          title: "Article 2",
          snippet: "Snippet 2",
          sourceType: "web",
        },
      ];

      (prismaService.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const tx = {
            topicEvidence: {
              aggregate: jest.fn().mockResolvedValue({
                _max: { citationIndex: 0 },
              }),
              createMany: jest.fn().mockResolvedValue({ count: 1 }),
              findMany: jest.fn().mockResolvedValue([
                { ...mockTopicEvidence, citationIndex: 1 },
              ]),
            },
          };
          return callback(tx);
        },
      );

      (engineEvidenceService.save as jest.Mock).mockResolvedValue(
        mockEngineEvidence,
      );

      // Act
      await adapter.saveResearchEvidenceBatch(inputs);

      // Assert - should call transaction twice (once per report)
      expect(prismaService.$transaction).toHaveBeenCalledTimes(2);
    });

    it("should handle batch sizes correctly (split into chunks of 50)", async () => {
      // Arrange - create 120 inputs (should split into 3 batches)
      const inputs = Array.from({ length: 120 }, (_, i) => ({
        reportId: mockReportId,
        url: `https://example.com/${i}`,
        title: `Article ${i}`,
        snippet: `Snippet ${i}`,
        sourceType: "web",
      }));

      let transactionCallCount = 0;
      (prismaService.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          transactionCallCount++;
          const tx = {
            topicEvidence: {
              aggregate: jest.fn().mockResolvedValue({
                _max: { citationIndex: 0 },
              }),
              createMany: jest.fn().mockResolvedValue({ count: 50 }),
              findMany: jest.fn().mockResolvedValue([mockTopicEvidence]),
            },
          };
          return callback(tx);
        },
      );

      (engineEvidenceService.save as jest.Mock).mockResolvedValue(
        mockEngineEvidence,
      );

      // Act
      await adapter.saveResearchEvidenceBatch(inputs);

      // Assert - should have 3 batches (50 + 50 + 20)
      expect(transactionCallCount).toBe(3);
    });
  });

  // ==================== Type Mapping ====================

  describe("mapSourceTypeToEvidenceType (private method via saveResearchEvidence)", () => {
    beforeEach(() => {
      (prismaService.topicEvidence.aggregate as jest.Mock).mockResolvedValue({
        _max: { citationIndex: 0 },
      });
      (prismaService.topicEvidence.create as jest.Mock).mockResolvedValue(
        mockTopicEvidence,
      );
      (engineEvidenceService.save as jest.Mock).mockResolvedValue(
        mockEngineEvidence,
      );
    });

    it.each([
      ["academic", "CITATION"],
      ["journal", "CITATION"],
      ["paper", "CITATION"],
      ["news", "REFERENCE"],
      ["report", "REFERENCE"],
      ["official", "REFERENCE"],
      ["government", "REFERENCE"],
      ["quote", "QUOTE"],
      ["inspiration", "INSPIRATION"],
      ["idea", "INSPIRATION"],
      ["web", "FACT"],
      ["blog", "FACT"],
      ["unknown", "FACT"],
    ])("should map %s to %s", async (sourceType, expectedType) => {
      // Act
      await adapter.saveResearchEvidence({
        reportId: mockReportId,
        url: "https://example.com",
        title: "Test",
        snippet: "Test",
        sourceType,
      });

      // Assert
      expect(engineEvidenceService.save).toHaveBeenCalledWith(
        expect.objectContaining({
          type: expectedType,
        }),
      );
    });

    it("should handle case-insensitive sourceType", async () => {
      // Act
      await adapter.saveResearchEvidence({
        reportId: mockReportId,
        url: "https://example.com",
        title: "Test",
        snippet: "Test",
        sourceType: "ACADEMIC", // uppercase
      });

      // Assert
      expect(engineEvidenceService.save).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "CITATION",
        }),
      );
    });
  });

  // ==================== URL Normalization ====================

  describe("normalizeUrl (private method via isDuplicateUrl)", () => {
    it("should use GlobalDeduplicationService when available", async () => {
      // Arrange
      const testUrl = "https://example.com/article?utm_source=test";
      const normalizedUrl = "https://example.com/article";
      (deduplicationService.normalizeUrl as jest.Mock).mockReturnValue(
        normalizedUrl,
      );
      (prismaService.topicEvidence.findFirst as jest.Mock).mockResolvedValue(
        null,
      );

      // Act
      await adapter.isDuplicateUrl(mockReportId, testUrl);

      // Assert
      expect(deduplicationService.normalizeUrl).toHaveBeenCalledWith(testUrl);
      expect(prismaService.topicEvidence.findFirst).toHaveBeenCalledWith({
        where: {
          reportId: mockReportId,
          url: { contains: normalizedUrl },
        },
      });
    });

    it("should fallback to local normalization when deduplication service unavailable", async () => {
      // Arrange - create adapter without deduplication service
      const moduleWithoutDedup: TestingModule = await Test.createTestingModule(
        {
          providers: [
            ResearchEvidenceAdapter,
            { provide: PrismaService, useValue: prismaService },
            {
              provide: EvidenceManagerService,
              useValue: engineEvidenceService,
            },
            {
              provide: CitationFormatterService,
              useValue: citationFormatterService,
            },
            {
              provide: EvidenceSyncCompensationService,
              useValue: compensationService,
            },
          ],
        },
      ).compile();

      const adapterWithoutDedup =
        moduleWithoutDedup.get<ResearchEvidenceAdapter>(
          ResearchEvidenceAdapter,
        );

      const testUrl =
        "https://example.com/article?utm_source=test&fbclid=123/";
      (prismaService.topicEvidence.findFirst as jest.Mock).mockResolvedValue(
        null,
      );

      // Act
      await adapterWithoutDedup.isDuplicateUrl(mockReportId, testUrl);

      // Assert - should use fallback normalization (removes tracking params and trailing slash)
      expect(prismaService.topicEvidence.findFirst).toHaveBeenCalledWith({
        where: {
          reportId: mockReportId,
          url: {
            contains: "https://example.com/article",
          },
        },
      });
    });

    it("should handle invalid URLs in fallback normalization", async () => {
      // Arrange - create adapter without deduplication service
      const moduleWithoutDedup: TestingModule = await Test.createTestingModule(
        {
          providers: [
            ResearchEvidenceAdapter,
            { provide: PrismaService, useValue: prismaService },
            {
              provide: EvidenceManagerService,
              useValue: engineEvidenceService,
            },
            {
              provide: CitationFormatterService,
              useValue: citationFormatterService,
            },
            {
              provide: EvidenceSyncCompensationService,
              useValue: compensationService,
            },
          ],
        },
      ).compile();

      const adapterWithoutDedup =
        moduleWithoutDedup.get<ResearchEvidenceAdapter>(
          ResearchEvidenceAdapter,
        );

      const invalidUrl = "not-a-valid-url";
      (prismaService.topicEvidence.findFirst as jest.Mock).mockResolvedValue(
        null,
      );

      // Act
      await adapterWithoutDedup.isDuplicateUrl(mockReportId, invalidUrl);

      // Assert - should fallback to lowercase
      expect(prismaService.topicEvidence.findFirst).toHaveBeenCalledWith({
        where: {
          reportId: mockReportId,
          url: {
            contains: invalidUrl.toLowerCase(),
          },
        },
      });
    });

    it("should detect duplicate URLs", async () => {
      // Arrange
      const testUrl = "https://example.com/article";
      (deduplicationService.normalizeUrl as jest.Mock).mockReturnValue(testUrl);
      (prismaService.topicEvidence.findFirst as jest.Mock).mockResolvedValue(
        mockTopicEvidence,
      );

      // Act
      const isDuplicate = await adapter.isDuplicateUrl(mockReportId, testUrl);

      // Assert
      expect(isDuplicate).toBe(true);
    });

    it("should return false for non-duplicate URLs", async () => {
      // Arrange
      const testUrl = "https://example.com/new-article";
      (deduplicationService.normalizeUrl as jest.Mock).mockReturnValue(testUrl);
      (prismaService.topicEvidence.findFirst as jest.Mock).mockResolvedValue(
        null,
      );

      // Act
      const isDuplicate = await adapter.isDuplicateUrl(mockReportId, testUrl);

      // Assert
      expect(isDuplicate).toBe(false);
    });
  });

  // ==================== Citation Formatting ====================

  describe("formatCitation", () => {
    it("should format citation using CitationFormatterService", () => {
      // Arrange
      const expectedCitation = "Test Article. (2025). Retrieved from https://example.com/article";
      (citationFormatterService.format as jest.Mock).mockReturnValue(
        expectedCitation,
      );

      // Act
      const result = adapter.formatCitation(mockTopicEvidence, "apa");

      // Assert
      expect(result).toBe(expectedCitation);
      expect(citationFormatterService.format).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockTopicEvidence.id,
          type: "FACT",
          source: expect.objectContaining({
            url: mockTopicEvidence.url,
            title: mockTopicEvidence.title,
            domain: mockTopicEvidence.domain,
          }),
          content: expect.any(Object),
          associations: expect.any(Object),
          metadata: expect.any(Object),
        }),
        "apa",
      );
    });

    it("should use default APA style if not specified", () => {
      // Arrange
      (citationFormatterService.format as jest.Mock).mockReturnValue("citation");

      // Act
      adapter.formatCitation(mockTopicEvidence);

      // Assert
      expect(citationFormatterService.format).toHaveBeenCalledWith(
        expect.any(Object),
        "apa",
      );
    });
  });

  // ==================== Bibliography Generation ====================

  describe("generateBibliography", () => {
    it("should generate bibliography for all evidences", async () => {
      // Arrange
      const evidences = [
        { ...mockTopicEvidence, id: "ev-1", citationIndex: 1 },
        { ...mockTopicEvidence, id: "ev-2", citationIndex: 2 },
      ];
      (prismaService.topicEvidence.findMany as jest.Mock).mockResolvedValue(
        evidences,
      );
      (citationFormatterService.format as jest.Mock).mockReturnValue(
        "formatted citation",
      );
      (citationFormatterService.formatBibliography as jest.Mock).mockReturnValue(
        "Bibliography\n\nformatted citation\n\nformatted citation",
      );

      // Act
      const result = await adapter.generateBibliography(mockReportId, "apa");

      // Assert
      expect(result).toContain("formatted citation");
      expect(citationFormatterService.formatBibliography).toHaveBeenCalledWith(
        ["formatted citation", "formatted citation"],
        "apa",
      );
    });

    it("should return empty string when no evidences", async () => {
      // Arrange
      (prismaService.topicEvidence.findMany as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await adapter.generateBibliography(mockReportId);

      // Assert
      expect(result).toBe("");
    });
  });

  describe("generateNumberedBibliography", () => {
    it("should generate numbered bibliography", async () => {
      // Arrange
      const evidences = [
        { ...mockTopicEvidence, id: "ev-1", citationIndex: 1 },
        { ...mockTopicEvidence, id: "ev-2", citationIndex: 2 },
      ];
      (prismaService.topicEvidence.findMany as jest.Mock).mockResolvedValue(
        evidences,
      );
      (citationFormatterService.format as jest.Mock).mockReturnValue(
        "formatted citation",
      );

      // Act
      const result = await adapter.generateNumberedBibliography(
        mockReportId,
        "apa",
      );

      // Assert
      expect(result).toContain("[1] formatted citation");
      expect(result).toContain("[2] formatted citation");
    });
  });

  // ==================== Evidence Retrieval ====================

  describe("getEvidenceStats", () => {
    it("should delegate to Engine Evidence service", async () => {
      // Arrange
      const expectedStats = {
        totalCount: 10,
        byType: { FACT: 5, CITATION: 3, REFERENCE: 2 } as any,
        avgRelevanceScore: 0.75,
        avgCredibilityScore: 0.85,
      };
      (engineEvidenceService.getStats as jest.Mock).mockResolvedValue(
        expectedStats,
      );

      // Act
      const result = await adapter.getEvidenceStats(mockReportId);

      // Assert
      expect(result).toEqual(expectedStats);
      expect(engineEvidenceService.getStats).toHaveBeenCalledWith(
        "research_report",
        mockReportId,
      );
    });
  });

  describe("getHighCredibilityEvidence", () => {
    it("should filter evidences by credibility score", async () => {
      // Arrange
      const highCredibilityEvidences = [
        { ...mockTopicEvidence, credibilityScore: 85 },
        { ...mockTopicEvidence, credibilityScore: 90 },
      ];
      (prismaService.topicEvidence.findMany as jest.Mock).mockResolvedValue(
        highCredibilityEvidences,
      );

      // Act
      const result = await adapter.getHighCredibilityEvidence(mockReportId, 80);

      // Assert
      expect(result).toEqual(highCredibilityEvidences);
      expect(prismaService.topicEvidence.findMany).toHaveBeenCalledWith({
        where: {
          reportId: mockReportId,
          credibilityScore: { gte: 80 },
        },
        orderBy: { credibilityScore: "desc" },
      });
    });

    it("should use default minScore of 70", async () => {
      // Arrange
      (prismaService.topicEvidence.findMany as jest.Mock).mockResolvedValue([]);

      // Act
      await adapter.getHighCredibilityEvidence(mockReportId);

      // Assert
      expect(prismaService.topicEvidence.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            credibilityScore: { gte: 70 },
          }),
        }),
      );
    });
  });

  describe("getEvidenceBySourceType", () => {
    it("should filter evidences by source type", async () => {
      // Arrange
      const academicEvidences = [
        { ...mockTopicEvidence, sourceType: "academic" },
      ];
      (prismaService.topicEvidence.findMany as jest.Mock).mockResolvedValue(
        academicEvidences,
      );

      // Act
      const result = await adapter.getEvidenceBySourceType(
        mockReportId,
        "academic",
      );

      // Assert
      expect(result).toEqual(academicEvidences);
      expect(prismaService.topicEvidence.findMany).toHaveBeenCalledWith({
        where: {
          reportId: mockReportId,
          sourceType: "academic",
        },
        orderBy: { citationIndex: "asc" },
      });
    });
  });
});
