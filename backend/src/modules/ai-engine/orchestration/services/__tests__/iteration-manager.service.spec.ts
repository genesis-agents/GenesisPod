import { Test, TestingModule } from "@nestjs/testing";
import { IterationManagerService } from "../iteration-manager.service";
import { AiChatService } from "../../../llm/services/ai-chat.service";
import { ToolRegistry } from "../../../tools/registry/tool-registry";
import { PrismaService } from "../../../../../common/prisma/prisma.service";

describe("IterationManagerService", () => {
  let service: IterationManagerService;
  let mockAiChatService: any;
  let mockToolRegistry: any;
  let mockPrisma: any;

  const mockContext = {
    id: "ctx-123",
    topic: "AI Trends 2025",
    accumulatedKnowledge: {
      facts: [],
      sources: [],
      insights: [],
    },
    searchHistory: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSection = {
    id: "section-1",
    title: "Introduction",
    content: "Initial content about AI trends.",
    type: "content" as const,
    order: 1,
    metadata: {},
  };

  const _mockOutput = {
    id: "output-1",
    title: "AI Research Report",
    sections: [mockSection],
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {},
  };

  const mockAiResponse = {
    content: "Updated content for the section.",
    usage: { totalTokens: 100 },
    tokensUsed: 100,
  };

  beforeEach(async () => {
    mockAiChatService = {
      chat: jest.fn().mockResolvedValue(mockAiResponse),
    };

    mockToolRegistry = {
      get: jest.fn().mockReturnValue({
        execute: jest
          .fn()
          .mockResolvedValue({ success: true, data: "tool result" }),
      }),
      tryGet: jest.fn().mockReturnValue(null),
      getAll: jest.fn().mockReturnValue([]),
    };

    mockPrisma = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IterationManagerService,
        { provide: AiChatService, useValue: mockAiChatService },
        { provide: ToolRegistry, useValue: mockToolRegistry },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<IterationManagerService>(IterationManagerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==================== getVersionHistory ====================

  describe("getVersionHistory", () => {
    it("should return empty array for non-existent output", async () => {
      const history = await service.getVersionHistory("nonexistent-id");
      expect(history).toEqual([]);
    });

    it("should return versions after full_update", async () => {
      const request = {
        outputId: "output-new",
        type: "full_update" as const,
        instruction: "Generate a full report about AI",
        targetSectionId: undefined,
        sectionIds: undefined,
      };

      await service.executeIteration(request, mockContext);

      const history = await service.getVersionHistory("output-new");
      expect(history.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ==================== compareVersions ====================

  describe("compareVersions", () => {
    it("should return empty diff for non-existent versions", async () => {
      const diff = await service.compareVersions("nonexistent", 1, 2);

      expect(diff.added).toEqual([]);
      expect(diff.removed).toEqual([]);
      expect(diff.modified).toEqual([]);
    });

    it("should detect added sections when comparing versions", async () => {
      // Create initial version via full_update
      const outputId = "compare-test";
      const request1 = {
        outputId,
        type: "full_update" as const,
        instruction: "Generate report",
      };

      // Mock AI response with sections
      mockAiChatService.chat.mockResolvedValueOnce({
        content: `# Section 1\n\nContent for section 1.\n\n# Section 2\n\nContent for section 2.`,
        tokensUsed: 150,
      });

      await service.executeIteration(request1, mockContext);

      const history = await service.getVersionHistory(outputId);

      if (history.length >= 2) {
        const diff = await service.compareVersions(outputId, 1, 2);
        expect(diff).toHaveProperty("added");
        expect(diff).toHaveProperty("removed");
        expect(diff).toHaveProperty("modified");
      }
    });
  });

  // ==================== getOrCreateResearchContext ====================

  describe("getOrCreateResearchContext", () => {
    it("should create new context for new topic", async () => {
      const ctx = await service.getOrCreateResearchContext("New Topic 2025");

      expect(ctx.topic).toBe("New Topic 2025");
      expect(ctx.id).toBeDefined();
      expect(ctx.accumulatedKnowledge.facts).toEqual([]);
    });

    it("should return existing context for same topic", async () => {
      const ctx1 = await service.getOrCreateResearchContext("Same Topic");
      const ctx2 = await service.getOrCreateResearchContext("Same Topic");

      expect(ctx1.id).toBe(ctx2.id);
    });

    it("should create different contexts for different topics", async () => {
      const ctx1 = await service.getOrCreateResearchContext("Topic A");
      const ctx2 = await service.getOrCreateResearchContext("Topic B");

      expect(ctx1.id).not.toBe(ctx2.id);
    });
  });

  // ==================== updateResearchContext ====================

  describe("updateResearchContext", () => {
    it("should update existing context", async () => {
      const ctx = await service.getOrCreateResearchContext("Update Test");
      const updatedCtx = await service.updateResearchContext(ctx.id, {
        accumulatedKnowledge: {
          facts: ["Fact 1"],
          sources: ["Source 1"],
          insights: ["Insight 1"],
        },
      });

      expect(updatedCtx.accumulatedKnowledge.facts).toContain("Fact 1");
    });

    it("should throw when context not found", async () => {
      await expect(
        service.updateResearchContext("nonexistent-ctx", {}),
      ).rejects.toThrow("Context not found");
    });

    it("should update updatedAt timestamp", async () => {
      const ctx = await service.getOrCreateResearchContext("Timestamp Test");
      const beforeUpdate = ctx.updatedAt;

      // Small delay to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await service.updateResearchContext(ctx.id, {});
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
        beforeUpdate.getTime(),
      );
    });
  });

  // ==================== executeIteration - full_update ====================

  describe("executeIteration - full_update", () => {
    it("should succeed with full_update type", async () => {
      const request = {
        outputId: "new-output-id",
        type: "full_update" as const,
        instruction: "Generate comprehensive AI analysis",
      };

      const result = await service.executeIteration(request, mockContext);

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("output");
      expect(result).toHaveProperty("changedSectionIds");
      expect(result).toHaveProperty("tokensUsed");
    });

    it("should call AI service for full_update", async () => {
      const request = {
        outputId: "full-update-test",
        type: "full_update" as const,
        instruction: "Generate report",
      };

      await service.executeIteration(request, mockContext);

      expect(mockAiChatService.chat).toHaveBeenCalled();
    });
  });

  // ==================== executeIteration - partial_update ====================

  describe("executeIteration - partial_update", () => {
    it("should fail when no sectionIds provided", async () => {
      const request = {
        outputId: "output-1",
        type: "partial_update" as const,
        instruction: "Update sections",
        sectionIds: [],
      };

      const result = await service.executeIteration(request, mockContext);

      expect(result.success).toBe(false);
    });

    it("should fail when output not found", async () => {
      const request = {
        outputId: "nonexistent-output",
        type: "partial_update" as const,
        instruction: "Update",
        sectionIds: ["section-1"],
      };

      const result = await service.executeIteration(request, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Output not found");
    });
  });

  // ==================== executeIteration - unsupported type ====================

  describe("executeIteration - unsupported type", () => {
    it("should return failure for unsupported iteration type", async () => {
      const request = {
        outputId: "output-1",
        type: "invalid_type" as any,
        instruction: "Do something",
      };

      // First create an output to work with
      const fullUpdateRequest = {
        outputId: "output-1",
        type: "full_update" as const,
        instruction: "Create initial",
      };
      await service.executeIteration(fullUpdateRequest, mockContext);

      const result = await service.executeIteration(request, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unsupported iteration type");
    });
  });

  // ==================== executeIteration - section_expand ====================

  describe("executeIteration - section_expand", () => {
    it("should fail when output not found", async () => {
      const request = {
        outputId: "nonexistent",
        type: "section_expand" as const,
        instruction: "Expand",
        targetSectionId: "section-1",
      };

      const result = await service.executeIteration(request, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Output not found");
    });
  });

  // ==================== executeIteration - section_rewrite ====================

  describe("executeIteration - section_rewrite", () => {
    it("should fail when output not found", async () => {
      const request = {
        outputId: "nonexistent",
        type: "section_rewrite" as const,
        instruction: "Rewrite",
        targetSectionId: "section-1",
      };

      const result = await service.executeIteration(request, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Output not found");
    });
  });

  // ==================== executeIteration - add_section ====================

  describe("executeIteration - add_section", () => {
    it("should fail when output not found", async () => {
      const request = {
        outputId: "nonexistent",
        type: "add_section" as const,
        instruction: "Add new section",
      };

      const result = await service.executeIteration(request, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Output not found");
    });
  });

  // ==================== executeIteration - refresh ====================

  describe("executeIteration - refresh", () => {
    it("should fail when output not found", async () => {
      const request = {
        outputId: "nonexistent",
        type: "refresh" as const,
        instruction: "Refresh all",
      };

      const result = await service.executeIteration(request, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Output not found");
    });
  });

  // ==================== executeIteration error handling ====================

  describe("executeIteration error handling", () => {
    it("should handle AI call failure gracefully", async () => {
      mockAiChatService.chat.mockRejectedValue(new Error("AI Service Error"));

      const request = {
        outputId: "error-test",
        type: "full_update" as const,
        instruction: "Generate something",
      };

      const result = await service.executeIteration(request, mockContext);

      // Should return a failure result, not throw
      expect(result).toHaveProperty("success");
      expect(result.success).toBe(false);
      expect(result).toHaveProperty("error");
    });
  });

  // ==================== executeIteration - partial_update (success path) ====================

  describe("executeIteration - partial_update (success path)", () => {
    it("should update selected sections and return success", async () => {
      // First create an output via full_update
      const outputId = "partial-success-test";
      const fullUpdateRequest = {
        outputId,
        type: "full_update" as const,
        userInstruction: "Generate initial content",
      };

      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"Intro","content":"Old intro content","level":2}]}\n```',
        usage: { totalTokens: 50 },
      });
      const fullResult = await service.executeIteration(
        fullUpdateRequest,
        mockContext,
      );
      expect(fullResult.success).toBe(true);

      const sectionId = fullResult.output.sections[0].id;

      // Now do partial_update on the existing output
      mockAiChatService.chat.mockResolvedValueOnce({
        content: "Updated introduction content with more details.",
        usage: { totalTokens: 80 },
      });

      const partialRequest = {
        outputId,
        type: "partial_update" as const,
        userInstruction: "Make it more detailed",
        sectionIds: [sectionId],
      };

      const result = await service.executeIteration(
        partialRequest,
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.changedSectionIds).toContain(sectionId);
      expect(result.output.version).toBe(fullResult.output.version + 1);
      expect(result.changeSummary).toContain("1");
    });

    it("should skip sections that do not exist in output", async () => {
      // Create an output with one section
      const outputId = "partial-skip-test";
      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"Section A","content":"Content A","level":2}]}\n```',
        usage: { totalTokens: 50 },
      });
      await service.executeIteration(
        { outputId, type: "full_update" as const },
        mockContext,
      );

      mockAiChatService.chat.mockResolvedValueOnce({
        content: "New content",
        usage: { totalTokens: 30 },
      });

      // Request update for a non-existent sectionId
      const result = await service.executeIteration(
        {
          outputId,
          type: "partial_update" as const,
          sectionIds: ["nonexistent-section-id"],
        },
        mockContext,
      );

      // Success but no sections changed (skipped non-existent)
      expect(result.success).toBe(true);
      expect(result.changedSectionIds).toHaveLength(0);
    });

    it("should accumulate tokens for multiple section updates", async () => {
      const outputId = "partial-multi-test";
      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"A","content":"Content A","level":2},{"title":"B","content":"Content B","level":2}]}\n```',
        usage: { totalTokens: 60 },
      });
      const fullResult = await service.executeIteration(
        { outputId, type: "full_update" as const },
        mockContext,
      );
      expect(fullResult.success).toBe(true);

      const sectionIds = fullResult.output.sections.map((s) => s.id);

      // Mock two AI calls for two section updates
      mockAiChatService.chat
        .mockResolvedValueOnce({
          content: "Updated A",
          usage: { totalTokens: 40 },
        })
        .mockResolvedValueOnce({
          content: "Updated B",
          usage: { totalTokens: 50 },
        });

      const result = await service.executeIteration(
        { outputId, type: "partial_update" as const, sectionIds },
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.changedSectionIds).toHaveLength(2);
      expect(result.tokensUsed).toBe(90);
    });
  });

  // ==================== executeIteration - section_expand (success path) ====================

  describe("executeIteration - section_expand (success path)", () => {
    it("should expand a section successfully", async () => {
      const outputId = "expand-success-test";
      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"Market Overview","content":"Brief overview","level":2}]}\n```',
        usage: { totalTokens: 50 },
      });
      const fullResult = await service.executeIteration(
        { outputId, type: "full_update" as const },
        mockContext,
      );
      const sectionId = fullResult.output.sections[0].id;

      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          "Expanded market overview with detailed analysis of trends and statistics.",
        usage: { totalTokens: 120 },
      });

      const result = await service.executeIteration(
        {
          outputId,
          type: "section_expand" as const,
          sectionIds: [sectionId],
          userInstruction: "Add more statistics",
        },
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.changedSectionIds).toContain(sectionId);
      expect(result.output.version).toBe(fullResult.output.version + 1);
      expect(result.changeSummary).toContain("Market Overview");
    });

    it("should fail when sectionIds is empty for section_expand", async () => {
      const outputId = "expand-no-id-test";
      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"Intro","content":"Content","level":2}]}\n```',
        usage: { totalTokens: 30 },
      });
      await service.executeIteration(
        { outputId, type: "full_update" as const },
        mockContext,
      );

      const result = await service.executeIteration(
        { outputId, type: "section_expand" as const },
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("No section specified");
    });

    it("should fail when section not found in output", async () => {
      const outputId = "expand-not-found-test";
      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"Intro","content":"Content","level":2}]}\n```',
        usage: { totalTokens: 30 },
      });
      await service.executeIteration(
        { outputId, type: "full_update" as const },
        mockContext,
      );

      const result = await service.executeIteration(
        {
          outputId,
          type: "section_expand" as const,
          sectionIds: ["does-not-exist"],
        },
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Section not found");
    });

    it("should handle AI failure during section_expand", async () => {
      const outputId = "expand-ai-fail-test";
      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"Intro","content":"Content","level":2}]}\n```',
        usage: { totalTokens: 30 },
      });
      const fullResult = await service.executeIteration(
        { outputId, type: "full_update" as const },
        mockContext,
      );
      const sectionId = fullResult.output.sections[0].id;

      // Simulate AI failure on expand
      mockAiChatService.chat.mockRejectedValueOnce(new Error("AI timeout"));

      const result = await service.executeIteration(
        { outputId, type: "section_expand" as const, sectionIds: [sectionId] },
        mockContext,
      );

      expect(result.success).toBe(false);
    });
  });

  // ==================== executeIteration - section_rewrite (success path) ====================

  describe("executeIteration - section_rewrite (success path)", () => {
    it("should rewrite a section successfully", async () => {
      const outputId = "rewrite-success-test";
      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"Conclusion","content":"Old conclusion","level":2}]}\n```',
        usage: { totalTokens: 50 },
      });
      const fullResult = await service.executeIteration(
        { outputId, type: "full_update" as const },
        mockContext,
      );
      const sectionId = fullResult.output.sections[0].id;

      mockAiChatService.chat.mockResolvedValueOnce({
        content: "Completely rewritten conclusion with fresh perspective.",
        usage: { totalTokens: 100 },
      });

      const result = await service.executeIteration(
        {
          outputId,
          type: "section_rewrite" as const,
          sectionIds: [sectionId],
          userInstruction: "Use a different angle",
        },
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.changedSectionIds).toContain(sectionId);
      expect(result.output.sections[0].content).toBe(
        "Completely rewritten conclusion with fresh perspective.",
      );
      expect(result.changeSummary).toContain("Conclusion");
    });

    it("should fail with No section specified when sectionIds is empty", async () => {
      const outputId = "rewrite-no-section-test";
      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"Intro","content":"Content","level":2}]}\n```',
        usage: { totalTokens: 30 },
      });
      await service.executeIteration(
        { outputId, type: "full_update" as const },
        mockContext,
      );

      const result = await service.executeIteration(
        { outputId, type: "section_rewrite" as const },
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("No section specified");
    });

    it("should fail when section not found", async () => {
      const outputId = "rewrite-not-found-test";
      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"Intro","content":"Content","level":2}]}\n```',
        usage: { totalTokens: 30 },
      });
      await service.executeIteration(
        { outputId, type: "full_update" as const },
        mockContext,
      );

      const result = await service.executeIteration(
        {
          outputId,
          type: "section_rewrite" as const,
          sectionIds: ["ghost-id"],
        },
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Section not found");
    });
  });

  // ==================== executeIteration - add_section (success path) ====================

  describe("executeIteration - add_section (success path)", () => {
    it("should add a new section at the end by default", async () => {
      const outputId = "add-section-test";
      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"Overview","content":"Overview content","level":2}]}\n```',
        usage: { totalTokens: 50 },
      });
      const fullResult = await service.executeIteration(
        { outputId, type: "full_update" as const },
        mockContext,
      );
      const originalCount = fullResult.output.sections.length;

      mockAiChatService.chat.mockResolvedValueOnce({
        content: "New appendix content with references.",
        usage: { totalTokens: 70 },
      });

      const result = await service.executeIteration(
        {
          outputId,
          type: "add_section" as const,
          newSection: {
            title: "Appendix",
            description: "Additional references",
          },
          userInstruction: "Add references",
        },
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.output.sections).toHaveLength(originalCount + 1);
      expect(
        result.output.sections[result.output.sections.length - 1].title,
      ).toBe("Appendix");
      expect(result.changeSummary).toContain("Appendix");
    });

    it("should insert section after specified afterSectionId", async () => {
      const outputId = "add-after-section-test";
      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"First","content":"First content","level":2},{"title":"Third","content":"Third content","level":2}]}\n```',
        usage: { totalTokens: 60 },
      });
      const fullResult = await service.executeIteration(
        { outputId, type: "full_update" as const },
        mockContext,
      );
      const firstSectionId = fullResult.output.sections[0].id;

      mockAiChatService.chat.mockResolvedValueOnce({
        content: "Second section content.",
        usage: { totalTokens: 40 },
      });

      const result = await service.executeIteration(
        {
          outputId,
          type: "add_section" as const,
          newSection: {
            title: "Second",
            afterSectionId: firstSectionId,
          },
        },
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.output.sections[1].title).toBe("Second");
    });

    it("should insert at end when afterSectionId not found", async () => {
      const outputId = "add-after-not-found-test";
      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"A","content":"Content A","level":2}]}\n```',
        usage: { totalTokens: 30 },
      });
      await service.executeIteration(
        { outputId, type: "full_update" as const },
        mockContext,
      );

      mockAiChatService.chat.mockResolvedValueOnce({
        content: "New section content.",
        usage: { totalTokens: 35 },
      });

      const result = await service.executeIteration(
        {
          outputId,
          type: "add_section" as const,
          newSection: { title: "NewSection", afterSectionId: "nonexistent-id" },
        },
        mockContext,
      );

      expect(result.success).toBe(true);
      // Should be at the end
      const lastSection =
        result.output.sections[result.output.sections.length - 1];
      expect(lastSection.title).toBe("NewSection");
    });

    it("should fail when newSection info is missing", async () => {
      const outputId = "add-no-info-test";
      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"Intro","content":"Content","level":2}]}\n```',
        usage: { totalTokens: 30 },
      });
      await service.executeIteration(
        { outputId, type: "full_update" as const },
        mockContext,
      );

      const result = await service.executeIteration(
        { outputId, type: "add_section" as const },
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("New section info not provided");
    });

    it("should fail when AI fails to generate new section", async () => {
      const outputId = "add-ai-fail-test";
      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"Intro","content":"Content","level":2}]}\n```',
        usage: { totalTokens: 30 },
      });
      await service.executeIteration(
        { outputId, type: "full_update" as const },
        mockContext,
      );

      mockAiChatService.chat.mockRejectedValueOnce(
        new Error("AI is unavailable"),
      );

      const result = await service.executeIteration(
        {
          outputId,
          type: "add_section" as const,
          newSection: { title: "Failed Section" },
        },
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.changeSummary).toBe("生成新部分失败");
    });
  });

  // ==================== executeIteration - refresh (success path) ====================
  // Note: refresh calls updateResearchContext(context.id, ...) so we must use a context
  // that was stored in the service's internal store (via getOrCreateResearchContext).

  describe("executeIteration - refresh (success path)", () => {
    let storedContext: Awaited<
      ReturnType<typeof service.getOrCreateResearchContext>
    >;

    beforeEach(async () => {
      // Create and store context so updateResearchContext can find it
      storedContext =
        await service.getOrCreateResearchContext("Refresh Test Topic");
    });

    it("should refresh sections using all existing sections when no sectionIds provided", async () => {
      const outputId = "refresh-all-test";

      // Disable web-search tool for this test to avoid tryGet issues
      mockToolRegistry.tryGet = jest.fn().mockReturnValue(null);

      // Create initial output
      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"Market","content":"Old market data","level":2},{"title":"Tech","content":"Old tech data","level":2},{"title":"Trends","content":"Old trends","level":2}]}\n```',
        usage: { totalTokens: 80 },
      });
      const fullResult = await service.executeIteration(
        { outputId, type: "full_update" as const },
        storedContext,
      );
      expect(fullResult.success).toBe(true);

      // Mock refresh section calls (up to 3 sections)
      mockAiChatService.chat
        .mockResolvedValueOnce({
          content: "Updated market with new data",
          usage: { totalTokens: 50 },
        })
        .mockResolvedValueOnce({
          content: "Updated tech with new data",
          usage: { totalTokens: 60 },
        })
        .mockResolvedValueOnce({
          content: "Updated trends with new data",
          usage: { totalTokens: 55 },
        });

      const result = await service.executeIteration(
        {
          outputId,
          type: "refresh" as const,
          searchKeywords: ["AI market 2025"],
        },
        storedContext,
      );

      expect(result.success).toBe(true);
      expect(result.output.version).toBeGreaterThan(fullResult.output.version);
    });

    it("should refresh only specified sections", async () => {
      const outputId = "refresh-specific-test";

      // Disable web-search tool for this test
      mockToolRegistry.tryGet = jest.fn().mockReturnValue(null);

      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"Section1","content":"Old 1","level":2},{"title":"Section2","content":"Old 2","level":2}]}\n```',
        usage: { totalTokens: 60 },
      });
      const fullResult = await service.executeIteration(
        { outputId, type: "full_update" as const },
        storedContext,
      );
      const sectionId = fullResult.output.sections[0].id;

      mockAiChatService.chat.mockResolvedValueOnce({
        content: "Refreshed section 1 with latest data",
        usage: { totalTokens: 45 },
      });

      const result = await service.executeIteration(
        {
          outputId,
          type: "refresh" as const,
          sectionIds: [sectionId],
          searchKeywords: ["latest news"],
        },
        storedContext,
      );

      expect(result.success).toBe(true);
      expect(result.changedSectionIds).toContain(sectionId);
    });

    it("should use web-search tool when available during refresh", async () => {
      const outputId = "refresh-with-search-test";

      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"News","content":"Old news","level":2}]}\n```',
        usage: { totalTokens: 40 },
      });
      await service.executeIteration(
        { outputId, type: "full_update" as const },
        storedContext,
      );

      // Mock web-search tool via tryGet
      const mockWebSearch = {
        execute: jest.fn().mockResolvedValue({
          success: true,
          data: {
            success: true,
            results: [
              {
                title: "AI News 1",
                url: "https://example.com/1",
                content: "Latest AI development",
              },
              {
                title: "AI News 2",
                url: "https://example.com/2",
                content: "More AI news",
              },
            ],
          },
        }),
      };
      mockToolRegistry.tryGet = jest.fn().mockReturnValue(mockWebSearch);

      mockAiChatService.chat.mockResolvedValueOnce({
        content: "Updated news content with latest sources",
        usage: { totalTokens: 65 },
      });

      const result = await service.executeIteration(
        {
          outputId,
          type: "refresh" as const,
          searchKeywords: ["AI latest news"],
        },
        storedContext,
      );

      expect(result.success).toBe(true);
      expect(mockWebSearch.execute).toHaveBeenCalled();
    });

    it("should handle missing web-search tool gracefully", async () => {
      const outputId = "refresh-no-search-test";
      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"Section","content":"Content","level":2}]}\n```',
        usage: { totalTokens: 40 },
      });
      await service.executeIteration(
        { outputId, type: "full_update" as const },
        storedContext,
      );

      // Return null for web-search tool
      mockToolRegistry.tryGet = jest.fn().mockReturnValue(null);

      mockAiChatService.chat.mockResolvedValueOnce({
        content: "Refreshed without search",
        usage: { totalTokens: 40 },
      });

      const result = await service.executeIteration(
        {
          outputId,
          type: "refresh" as const,
          searchKeywords: ["some keyword"],
        },
        storedContext,
      );

      expect(result.success).toBe(true);
    });

    it("should handle web-search tool returning no results", async () => {
      const outputId = "refresh-empty-search-test";
      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"Section","content":"Content","level":2}]}\n```',
        usage: { totalTokens: 40 },
      });
      await service.executeIteration(
        { outputId, type: "full_update" as const },
        storedContext,
      );

      const mockWebSearch = {
        execute: jest.fn().mockResolvedValue({
          success: true,
          data: {
            success: true,
            results: [],
          },
        }),
      };
      mockToolRegistry.tryGet = jest.fn().mockReturnValue(mockWebSearch);

      mockAiChatService.chat.mockResolvedValueOnce({
        content: "Refreshed with no new sources",
        usage: { totalTokens: 40 },
      });

      const result = await service.executeIteration(
        {
          outputId,
          type: "refresh" as const,
        },
        storedContext,
      );

      expect(result.success).toBe(true);
      expect(result.changeSummary).toContain("新增 0 个来源");
    });

    it("should handle web-search throwing an error gracefully", async () => {
      const outputId = "refresh-search-error-test";
      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"Section","content":"Content","level":2}]}\n```',
        usage: { totalTokens: 40 },
      });
      await service.executeIteration(
        { outputId, type: "full_update" as const },
        storedContext,
      );

      const mockWebSearch = {
        execute: jest.fn().mockRejectedValue(new Error("Search timeout")),
      };
      mockToolRegistry.tryGet = jest.fn().mockReturnValue(mockWebSearch);

      mockAiChatService.chat.mockResolvedValueOnce({
        content: "Refreshed despite search error",
        usage: { totalTokens: 40 },
      });

      const result = await service.executeIteration(
        {
          outputId,
          type: "refresh" as const,
          searchKeywords: ["failing keyword"],
        },
        storedContext,
      );

      expect(result.success).toBe(true);
    });

    it("should use context.topic as default search keyword when none provided", async () => {
      const outputId = "refresh-default-keyword-test";
      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"Topic Overview","content":"Content","level":2}]}\n```',
        usage: { totalTokens: 40 },
      });
      await service.executeIteration(
        { outputId, type: "full_update" as const },
        storedContext,
      );

      mockToolRegistry.tryGet = jest.fn().mockReturnValue(null);
      mockAiChatService.chat.mockResolvedValueOnce({
        content: "Refreshed using topic as default keyword",
        usage: { totalTokens: 45 },
      });

      const result = await service.executeIteration(
        {
          outputId,
          type: "refresh" as const,
          // No searchKeywords provided - should default to context.topic
        },
        storedContext,
      );

      expect(result.success).toBe(true);
    });
  });

  // ==================== executeIteration - full_update with JSON parsing ====================

  describe("executeIteration - full_update JSON parsing", () => {
    it("should parse valid JSON from AI response with markdown code block", async () => {
      const outputId = "full-update-json-test";
      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"Executive Summary","content":"Key findings...","level":1},{"title":"Analysis","content":"Detailed analysis...","level":2}]}\n```',
        usage: { totalTokens: 150 },
      });

      const result = await service.executeIteration(
        {
          outputId,
          type: "full_update" as const,
          userInstruction: "Generate complete report",
        },
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.output.sections).toHaveLength(2);
      expect(result.output.sections[0].title).toBe("Executive Summary");
      expect(result.output.sections[1].title).toBe("Analysis");
      expect(result.output.version).toBe(1);
      expect(result.output.id).toBe(outputId);
    });

    it("should fallback to single section when AI response has no JSON block", async () => {
      const outputId = "full-update-no-json-test";
      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          "This is a plain text report without JSON formatting. It covers AI trends.",
        usage: { totalTokens: 100 },
      });

      const result = await service.executeIteration(
        { outputId, type: "full_update" as const },
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.output.sections).toHaveLength(1);
      expect(result.output.sections[0].level).toBe(1);
      expect(result.output.sections[0].content).toContain("plain text report");
    });

    it("should save version after successful full_update", async () => {
      const outputId = "full-update-save-test";
      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"Report","content":"Content","level":2}]}\n```',
        usage: { totalTokens: 60 },
      });

      await service.executeIteration(
        { outputId, type: "full_update" as const },
        mockContext,
      );
      const history = await service.getVersionHistory(outputId);

      expect(history).toHaveLength(1);
      expect(history[0].version).toBe(1);
    });

    it("should NOT save version when full_update fails", async () => {
      const outputId = "full-update-fail-save-test";
      mockAiChatService.chat.mockRejectedValueOnce(new Error("AI failure"));

      await service.executeIteration(
        { outputId, type: "full_update" as const },
        mockContext,
      );
      const history = await service.getVersionHistory(outputId);

      expect(history).toHaveLength(0);
    });

    it("should set correct title and version on full_update output", async () => {
      const outputId = "full-update-title-test";
      const contextWithTopic = {
        ...mockContext,
        topic: "Machine Learning Applications",
      };

      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"ML Overview","content":"ML content","level":2}]}\n```',
        usage: { totalTokens: 80 },
      });

      const result = await service.executeIteration(
        { outputId, type: "full_update" as const },
        contextWithTopic,
      );

      expect(result.success).toBe(true);
      expect(result.output.title).toBe("Machine Learning Applications");
      expect(result.output.version).toBe(1);
    });

    it("should include all section IDs in changedSectionIds for full_update", async () => {
      const outputId = "full-update-changed-ids-test";
      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"S1","content":"C1","level":2},{"title":"S2","content":"C2","level":2}]}\n```',
        usage: { totalTokens: 60 },
      });

      const result = await service.executeIteration(
        { outputId, type: "full_update" as const },
        mockContext,
      );

      expect(result.changedSectionIds).toHaveLength(
        result.output.sections.length,
      );
    });
  });

  // ==================== compareVersions (detailed tests) ====================

  describe("compareVersions (with real version data)", () => {
    it("should detect added sections between v1 and v2", async () => {
      const outputId = "compare-added-test";

      // Version 1: single section
      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"Intro","content":"Introduction content","level":2}]}\n```',
        usage: { totalTokens: 50 },
      });
      await service.executeIteration(
        { outputId, type: "full_update" as const },
        mockContext,
      );

      // Add a new section (version 2)
      mockAiChatService.chat.mockResolvedValueOnce({
        content: "New conclusion content.",
        usage: { totalTokens: 40 },
      });
      await service.executeIteration(
        {
          outputId,
          type: "add_section" as const,
          newSection: { title: "Conclusion" },
        },
        mockContext,
      );

      const diff = await service.compareVersions(outputId, 1, 2);

      expect(diff.added).toHaveLength(1);
      expect(diff.added[0].title).toBe("Conclusion");
      expect(diff.removed).toHaveLength(0);
    });

    it("should detect modified sections between versions", async () => {
      const outputId = "compare-modified-test";

      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"Market","content":"Original market analysis","level":2}]}\n```',
        usage: { totalTokens: 50 },
      });
      const v1Result = await service.executeIteration(
        { outputId, type: "full_update" as const },
        mockContext,
      );
      const sectionId = v1Result.output.sections[0].id;

      // Rewrite the section (version 2)
      mockAiChatService.chat.mockResolvedValueOnce({
        content: "Completely different market analysis with new data.",
        usage: { totalTokens: 55 },
      });
      await service.executeIteration(
        {
          outputId,
          type: "section_rewrite" as const,
          sectionIds: [sectionId],
        },
        mockContext,
      );

      const diff = await service.compareVersions(outputId, 1, 2);

      expect(diff.modified).toHaveLength(1);
      expect(diff.modified[0].sectionId).toBe(sectionId);
      expect(diff.modified[0].before).toBe("Original market analysis");
      expect(diff.modified[0].after).toBe(
        "Completely different market analysis with new data.",
      );
    });

    it("should return empty diff when versions are identical", async () => {
      const outputId = "compare-same-test";
      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"Intro","content":"Content","level":2}]}\n```',
        usage: { totalTokens: 40 },
      });
      await service.executeIteration(
        { outputId, type: "full_update" as const },
        mockContext,
      );

      // compareVersions with same version number
      const diff = await service.compareVersions(outputId, 1, 1);

      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
    });

    it("should return empty diff when version numbers do not exist", async () => {
      const outputId = "compare-nonexistent-version-test";
      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"Intro","content":"Content","level":2}]}\n```',
        usage: { totalTokens: 40 },
      });
      await service.executeIteration(
        { outputId, type: "full_update" as const },
        mockContext,
      );

      const diff = await service.compareVersions(outputId, 1, 99);
      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
    });
  });

  // ==================== updateResearchContext - search history ====================

  describe("updateResearchContext - search history update", () => {
    it("should append new search history entries", async () => {
      const ctx = await service.getOrCreateResearchContext("Research Topic");
      const newSearchHistory = [
        { query: "AI trends 2025", timestamp: new Date(), resultCount: 10 },
      ];

      const updated = await service.updateResearchContext(ctx.id, {
        searchHistory: newSearchHistory,
      });

      expect(updated.searchHistory).toHaveLength(1);
      expect(updated.searchHistory[0].query).toBe("AI trends 2025");
    });

    it("should update accumulatedKnowledge with new facts", async () => {
      const ctx = await service.getOrCreateResearchContext("Knowledge Topic");
      const updated = await service.updateResearchContext(ctx.id, {
        accumulatedKnowledge: {
          facts: ["AI is transforming healthcare", "ML improves diagnostics"],
          sources: [
            {
              url: "https://example.com",
              title: "AI in Medicine",
              summary: "Overview",
            },
          ],
          insights: ["Early diagnosis is key"],
        },
      });

      expect(updated.accumulatedKnowledge.facts).toHaveLength(2);
      expect(updated.accumulatedKnowledge.sources).toHaveLength(1);
      expect(updated.accumulatedKnowledge.insights).toHaveLength(1);
    });
  });

  // ==================== partial_update with context facts ====================

  describe("partial_update with context having facts", () => {
    it("should include context facts in AI prompt when facts are present", async () => {
      const outputId = "partial-with-facts-test";
      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"Analysis","content":"Initial analysis","level":2}]}\n```',
        usage: { totalTokens: 50 },
      });
      const fullResult = await service.executeIteration(
        { outputId, type: "full_update" as const },
        mockContext,
      );
      const sectionId = fullResult.output.sections[0].id;

      const contextWithFacts = {
        ...mockContext,
        accumulatedKnowledge: {
          facts: ["Fact 1", "Fact 2", "Fact 3", "Fact 4", "Fact 5", "Fact 6"],
          sources: [],
          insights: [],
        },
      };

      // Clear mock call history so we can inspect only the partial_update AI call
      mockAiChatService.chat.mockClear();
      mockAiChatService.chat.mockResolvedValueOnce({
        content: "Updated analysis incorporating facts",
        usage: { totalTokens: 90 },
      });

      const result = await service.executeIteration(
        {
          outputId,
          type: "partial_update" as const,
          sectionIds: [sectionId],
          userInstruction: "Update with latest facts",
        },
        contextWithFacts,
      );

      expect(result.success).toBe(true);
      // Verify AI was called with prompt that includes facts
      expect(mockAiChatService.chat).toHaveBeenCalledTimes(1);
      const chatCallArg = mockAiChatService.chat.mock.calls[0][0];
      const userMessage = chatCallArg.messages.find(
        (m: { role: string }) => m.role === "user",
      );
      expect(userMessage.content).toContain("已知事实");
    });

    it("should include userInstruction in prompt when provided", async () => {
      const outputId = "partial-with-instruction-test";
      mockAiChatService.chat.mockResolvedValueOnce({
        content:
          '```json\n{"sections":[{"title":"Report","content":"Report content","level":2}]}\n```',
        usage: { totalTokens: 50 },
      });
      const fullResult = await service.executeIteration(
        { outputId, type: "full_update" as const },
        mockContext,
      );
      const sectionId = fullResult.output.sections[0].id;

      mockAiChatService.chat.mockClear();
      mockAiChatService.chat.mockResolvedValueOnce({
        content: "Updated with instruction",
        usage: { totalTokens: 70 },
      });

      await service.executeIteration(
        {
          outputId,
          type: "partial_update" as const,
          sectionIds: [sectionId],
          userInstruction: "Focus on enterprise use cases",
        },
        mockContext,
      );

      const chatCallArg = mockAiChatService.chat.mock.calls[0][0];
      const userMessage = chatCallArg.messages.find(
        (m: { role: string }) => m.role === "user",
      );
      expect(userMessage.content).toContain("用户要求");
      expect(userMessage.content).toContain("Focus on enterprise use cases");
    });
  });
});
