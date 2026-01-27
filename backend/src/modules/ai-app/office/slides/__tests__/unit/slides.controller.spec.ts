// @ts-nocheck
/**
 * SlidesController Unit Tests
 *
 * Tests for authentication, authorization, rate limiting, and DTO validation.
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { SlidesController } from "../../orchestrator/slides.controller";
import { SlidesEngineService } from "../../services/slides-engine.service";
import { SlidesDataImportService } from "../../services/data-import.service";
import { AIEditService } from "../../services/ai-edit.service";
import { CheckpointService } from "../../checkpoint/checkpoint.service";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import {
  RateLimitGuard,
  RATE_LIMIT_KEY,
} from "@/common/guards/rate-limit.guard";

import { createMockPrisma, createMockEventEmitter } from "../mocks";
import {
  mockAuthenticatedRequest,
  mockSession,
  mockSessions,
  mockGenerateDto,
  mockUserId,
} from "../fixtures/slides.fixture";

describe("SlidesController", () => {
  let controller: SlidesController;
  let slidesEngine: jest.Mocked<SlidesEngineService>;
  let checkpointService: jest.Mocked<CheckpointService>;
  let dataImportService: jest.Mocked<SlidesDataImportService>;
  let aiEditService: jest.Mocked<AIEditService>;

  beforeEach(async () => {
    // Create mock services
    const mockSlidesEngine = {
      generateSlides: jest.fn(),
      rerenderPage: jest.fn(),
    };

    const mockCheckpointService = {
      getSessions: jest.fn(),
      getSession: jest.fn(),
      createSession: jest.fn(),
      updateSessionTitle: jest.fn(),
      deleteSession: jest.fn(),
      getLatestCheckpoint: jest.fn(),
      list: jest.fn(),
      create: jest.fn(),
      restore: jest.fn(),
    };

    const mockDataImportService = {
      listResearchTopics: jest.fn(),
      listWritingProjects: jest.fn(),
      listTeamsTopics: jest.fn(),
      listLibraryResources: jest.fn(),
      importFromResearch: jest.fn(),
      importFromWriting: jest.fn(),
      importFromTeams: jest.fn(),
      importFromLibrary: jest.fn(),
    };

    const mockAiEditService = {
      fixLayout: jest.fn(),
      polishContent: jest.fn(),
      factCheck: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SlidesController],
      providers: [
        { provide: SlidesEngineService, useValue: mockSlidesEngine },
        { provide: CheckpointService, useValue: mockCheckpointService },
        { provide: SlidesDataImportService, useValue: mockDataImportService },
        { provide: AIEditService, useValue: mockAiEditService },
        { provide: Reflector, useValue: new Reflector() },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(RateLimitGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<SlidesController>(SlidesController);
    slidesEngine = module.get(SlidesEngineService);
    checkpointService = module.get(CheckpointService);
    dataImportService = module.get(SlidesDataImportService);
    aiEditService = module.get(AIEditService);
  });

  describe("Authentication", () => {
    it("should have JwtAuthGuard applied to the controller", () => {
      const guards = Reflect.getMetadata("__guards__", SlidesController);
      expect(guards).toBeDefined();
      expect(
        guards.some(
          (guard) => guard === JwtAuthGuard || guard.name === "JwtAuthGuard",
        ),
      ).toBe(true);
    });

    it("should have RateLimitGuard applied to the controller", () => {
      const guards = Reflect.getMetadata("__guards__", SlidesController);
      expect(guards).toBeDefined();
      expect(
        guards.some(
          (guard) =>
            guard === RateLimitGuard || guard.name === "RateLimitGuard",
        ),
      ).toBe(true);
    });
  });

  describe("getSessions", () => {
    it("should get sessions for authenticated user", async () => {
      checkpointService.getSessions.mockResolvedValue(mockSessions);

      const result = await controller.getSessions(
        mockAuthenticatedRequest as any,
        undefined,
        undefined,
      );

      expect(checkpointService.getSessions).toHaveBeenCalledWith({
        userId: mockUserId,
        status: undefined,
        limit: 50,
      });
      expect(result.sessions).toHaveLength(mockSessions.length);
    });

    it("should filter sessions by status", async () => {
      checkpointService.getSessions.mockResolvedValue([mockSession]);

      await controller.getSessions(
        mockAuthenticatedRequest as any,
        "active",
        "10",
      );

      expect(checkpointService.getSessions).toHaveBeenCalledWith({
        userId: mockUserId,
        status: "active",
        limit: 10,
      });
    });
  });

  describe("listResearchSources", () => {
    it("should list research sources for authenticated user", async () => {
      const mockSources = [{ id: "topic-1", title: "Research 1" }];
      dataImportService.listResearchTopics.mockResolvedValue(mockSources);

      const result = await controller.listResearchSources(
        mockAuthenticatedRequest as any,
      );

      expect(dataImportService.listResearchTopics).toHaveBeenCalledWith(
        mockUserId,
      );
      expect(result).toEqual({ sources: mockSources });
    });
  });

  describe("importFromResearch", () => {
    it("should import from research with authenticated user", async () => {
      const mockData = { sourceText: "content", sections: [] };
      dataImportService.importFromResearch.mockResolvedValue(mockData);

      const result = await controller.importFromResearch(
        mockAuthenticatedRequest as any,
        "topic-123",
      );

      expect(dataImportService.importFromResearch).toHaveBeenCalledWith(
        "topic-123",
        mockUserId,
      );
      expect(result).toEqual({ data: mockData });
    });
  });

  describe("fixLayout", () => {
    it("should fix layout with authenticated user", async () => {
      const mockResult = {
        success: true,
        originalHtml: "<div>old</div>",
        fixedHtml: "<div>new</div>",
        issuesFound: 2,
        issuesFixed: 2,
        criticalIssues: 0,
      };
      aiEditService.fixLayout.mockResolvedValue(mockResult);

      const result = await controller.fixLayout(
        mockAuthenticatedRequest as any,
        "mission-123",
        "0",
      );

      expect(aiEditService.fixLayout).toHaveBeenCalledWith(
        "mission-123",
        0,
        mockUserId,
      );
      expect(result).toEqual({ data: mockResult });
    });
  });

  describe("polishContent", () => {
    it("should polish content with authenticated user", async () => {
      const mockResult = {
        success: true,
        pagesPolished: 5,
        totalChanges: 10,
        pages: [],
      };
      aiEditService.polishContent.mockResolvedValue(mockResult);

      const result = await controller.polishContent(
        mockAuthenticatedRequest as any,
        "mission-123",
        { targetTone: "formal" },
      );

      expect(aiEditService.polishContent).toHaveBeenCalledWith(
        "mission-123",
        { targetTone: "formal" },
        mockUserId,
      );
      expect(result).toEqual({ data: mockResult });
    });
  });

  describe("factCheck", () => {
    it("should fact check with authenticated user", async () => {
      const mockResult = {
        success: true,
        totalClaims: 10,
        verifiedCount: 8,
        disputedCount: 1,
        needsCitationCount: 1,
        overallCredibility: 0.85,
        pageResults: [],
      };
      aiEditService.factCheck.mockResolvedValue(mockResult);

      const result = await controller.factCheck(
        mockAuthenticatedRequest as any,
        "mission-123",
        "true",
      );

      expect(aiEditService.factCheck).toHaveBeenCalledWith(
        "mission-123",
        true,
        mockUserId,
      );
      expect(result).toEqual({ data: mockResult });
    });

    it("should default to non-strict mode when strictMode is undefined", async () => {
      const mockResult = {
        success: true,
        totalClaims: 10,
        verifiedCount: 8,
        disputedCount: 1,
        needsCitationCount: 1,
        overallCredibility: 0.85,
        pageResults: [],
      };
      aiEditService.factCheck.mockResolvedValue(mockResult);

      await controller.factCheck(
        mockAuthenticatedRequest as any,
        "mission-123",
        undefined,
      );

      expect(aiEditService.factCheck).toHaveBeenCalledWith(
        "mission-123",
        false,
        mockUserId,
      );
    });
  });

  describe("Rate Limiting", () => {
    it("should have rate limit metadata on generateSlidesPost", () => {
      const metadata = Reflect.getMetadata(
        RATE_LIMIT_KEY,
        SlidesController.prototype.generateSlidesPost,
      );
      expect(metadata).toBeDefined();
      expect(metadata.maxRequests).toBe(10);
      expect(metadata.windowSeconds).toBe(60);
    });

    it("should have rate limit metadata on fixLayout", () => {
      const metadata = Reflect.getMetadata(
        RATE_LIMIT_KEY,
        SlidesController.prototype.fixLayout,
      );
      expect(metadata).toBeDefined();
      expect(metadata.maxRequests).toBe(30);
      expect(metadata.windowSeconds).toBe(60);
    });

    it("should have rate limit metadata on factCheck", () => {
      const metadata = Reflect.getMetadata(
        RATE_LIMIT_KEY,
        SlidesController.prototype.factCheck,
      );
      expect(metadata).toBeDefined();
      expect(metadata.maxRequests).toBe(10);
      expect(metadata.windowSeconds).toBe(60);
    });
  });
});
