/**
 * Tests for ResearchProjectSourceService
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ResearchProjectSourceService } from '../project/research-project-source.service';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { ToolRegistry } from '@/modules/ai-engine/facade';
import { FileParserService } from '../project/services/file-parser.service';

jest.mock('@prisma/client', () => ({
  PrismaClient: class MockPrismaClient {},
}));

jest.mock('../../../../common/prisma/prisma.service', () => ({
  PrismaService: jest.fn().mockImplementation(() => ({
    researchProject: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    researchProjectSource: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    resource: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  })),
}));

jest.mock('@/modules/ai-engine/facade', () => ({
  ToolRegistry: jest.fn().mockImplementation(() => ({
    tryGet: jest.fn(),
  })),
  ToolContext: jest.fn(),
}));

jest.mock('../project/services/file-parser.service', () => ({
  FileParserService: jest.fn().mockImplementation(() => ({
    parseFile: jest.fn(),
  })),
}));

jest.mock('@/common/config/app.config', () => ({
  APP_CONFIG: {
    brand: {
      userAgent: 'TestAgent/1.0',
    },
  },
}));

jest.mock('axios', () => ({
  default: {
    get: jest.fn(),
  },
}));

jest.mock('xml2js', () => ({
  Parser: jest.fn().mockImplementation(() => ({
    parseStringPromise: jest.fn(),
  })),
}));

describe('ResearchProjectSourceService', () => {
  let service: ResearchProjectSourceService;
  let prisma: jest.Mocked<PrismaService>;
  let toolRegistry: jest.Mocked<ToolRegistry>;
  let fileParserService: jest.Mocked<FileParserService>;

  const userId = 'user-123';
  const projectId = 'project-456';
  const sourceId = 'source-789';

  const mockProject = {
    id: projectId,
    userId,
    name: 'Test Project',
    sourceCount: 5,
  };

  const mockSource = {
    id: sourceId,
    projectId,
    title: 'Test Source',
    sourceType: 'WEB',
    sourceUrl: 'https://example.com/article',
    abstract: 'Test abstract',
    content: 'Test content',
    authors: ['Author 1'],
    publishedAt: new Date('2024-01-01'),
    metadata: {},
    resourceId: null,
    analysisStatus: 'COMPLETED',
    aiSummary: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrismaService = {
      researchProject: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      researchProjectSource: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      resource: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const mockToolRegistry = {
      tryGet: jest.fn(),
    };

    const mockFileParserService = {
      parseFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResearchProjectSourceService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ToolRegistry, useValue: mockToolRegistry },
        { provide: FileParserService, useValue: mockFileParserService },
      ],
    }).compile();

    service = module.get<ResearchProjectSourceService>(ResearchProjectSourceService);
    prisma = module.get(PrismaService);
    toolRegistry = module.get(ToolRegistry);
    fileParserService = module.get(FileParserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('addSource', () => {
    it('should add a source to a project', async () => {
      (prisma.researchProject.findUnique as jest.Mock).mockResolvedValue(mockProject);
      (prisma.researchProjectSource.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.researchProjectSource.create as jest.Mock).mockResolvedValue(mockSource);
      (prisma.researchProject.update as jest.Mock).mockResolvedValue(mockProject);

      const result = await service.addSource(userId, projectId, {
        title: 'Test Source',
        sourceType: 'WEB',
        sourceUrl: 'https://example.com/article',
        abstract: 'Test abstract',
        content: 'Test content',
      });

      expect(result).toBe(mockSource);
      expect(prisma.researchProjectSource.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectId,
            title: 'Test Source',
            sourceType: 'WEB',
            analysisStatus: 'PENDING',
          }),
        }),
      );
      expect(prisma.researchProject.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { sourceCount: { increment: 1 } },
        }),
      );
    });

    it('should return existing source when duplicate found', async () => {
      (prisma.researchProject.findUnique as jest.Mock).mockResolvedValue(mockProject);
      (prisma.researchProjectSource.findFirst as jest.Mock).mockResolvedValue(mockSource);

      const result = await service.addSource(userId, projectId, {
        title: 'Test Source',
        sourceType: 'WEB',
        sourceUrl: 'https://example.com/article',
      });

      expect(result).toBe(mockSource);
      expect(prisma.researchProjectSource.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when project not found', async () => {
      (prisma.researchProject.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.addSource(userId, projectId, { title: 'Test', sourceType: 'WEB' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when non-owner requests', async () => {
      (prisma.researchProject.findUnique as jest.Mock).mockResolvedValue({
        ...mockProject,
        userId: 'other-user',
      });

      await expect(
        service.addSource('non-owner', projectId, { title: 'Test', sourceType: 'WEB' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should check duplicate by resourceId when provided', async () => {
      (prisma.researchProject.findUnique as jest.Mock).mockResolvedValue(mockProject);
      (prisma.researchProjectSource.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.researchProjectSource.create as jest.Mock).mockResolvedValue(mockSource);
      (prisma.researchProject.update as jest.Mock).mockResolvedValue(mockProject);

      await service.addSource(userId, projectId, {
        title: 'Test Source',
        sourceType: 'WEB',
        resourceId: 'resource-123',
      });

      expect(prisma.researchProjectSource.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            projectId,
            OR: expect.arrayContaining([
              expect.objectContaining({ resourceId: 'resource-123' }),
            ]),
          }),
        }),
      );
    });
  });

  describe('addSources', () => {
    it('should add multiple sources and skip duplicates', async () => {
      (prisma.researchProject.findUnique as jest.Mock).mockResolvedValue(mockProject);
      // First source: no duplicate found
      // Second source: duplicate found
      (prisma.researchProjectSource.findFirst as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockSource);
      (prisma.$transaction as jest.Mock).mockResolvedValue([mockSource]);
      (prisma.researchProject.update as jest.Mock).mockResolvedValue(mockProject);

      const result = await service.addSources(userId, projectId, [
        { title: 'Source 1', sourceType: 'WEB' },
        { title: 'Test Source', sourceType: 'WEB', sourceUrl: 'https://example.com/article' },
      ]);

      expect(result).toHaveLength(1);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when all sources are duplicates', async () => {
      (prisma.researchProject.findUnique as jest.Mock).mockResolvedValue(mockProject);
      (prisma.researchProjectSource.findFirst as jest.Mock).mockResolvedValue(mockSource);

      const result = await service.addSources(userId, projectId, [
        { title: 'Test Source', sourceType: 'WEB' },
      ]);

      expect(result).toEqual([]);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when project not found', async () => {
      (prisma.researchProject.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.addSources(userId, projectId, []),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for non-owner', async () => {
      (prisma.researchProject.findUnique as jest.Mock).mockResolvedValue({
        ...mockProject,
        userId: 'other-user',
      });

      await expect(
        service.addSources('non-owner', projectId, []),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should skip batch duplicates (same title in same batch)', async () => {
      (prisma.researchProject.findUnique as jest.Mock).mockResolvedValue(mockProject);
      (prisma.researchProjectSource.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.$transaction as jest.Mock).mockResolvedValue([mockSource]);
      (prisma.researchProject.update as jest.Mock).mockResolvedValue(mockProject);

      // Two sources with same title in the batch
      const result = await service.addSources(userId, projectId, [
        { title: 'Duplicate Title', sourceType: 'WEB' },
        { title: 'Duplicate Title', sourceType: 'WEB' },
      ]);

      // Only one unique source should be created
      expect(result).toHaveLength(1);
    });
  });

  describe('getSources', () => {
    it('should return sources for a project', async () => {
      (prisma.researchProject.findUnique as jest.Mock).mockResolvedValue(mockProject);
      (prisma.researchProjectSource.findMany as jest.Mock).mockResolvedValue([mockSource]);

      const result = await service.getSources(userId, projectId);

      expect(result).toHaveLength(1);
      expect(prisma.researchProjectSource.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('should throw NotFoundException when project not found', async () => {
      (prisma.researchProject.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.getSources(userId, projectId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException for non-owner', async () => {
      (prisma.researchProject.findUnique as jest.Mock).mockResolvedValue({
        ...mockProject,
        userId: 'other-user',
      });

      await expect(service.getSources('non-owner', projectId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getSource', () => {
    it('should return a specific source', async () => {
      (prisma.researchProject.findUnique as jest.Mock).mockResolvedValue(mockProject);
      (prisma.researchProjectSource.findUnique as jest.Mock).mockResolvedValue(mockSource);

      const result = await service.getSource(userId, projectId, sourceId);

      expect(result).toBe(mockSource);
    });

    it('should throw NotFoundException when source not found', async () => {
      (prisma.researchProject.findUnique as jest.Mock).mockResolvedValue(mockProject);
      (prisma.researchProjectSource.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getSource(userId, projectId, 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when source belongs to different project', async () => {
      (prisma.researchProject.findUnique as jest.Mock).mockResolvedValue(mockProject);
      (prisma.researchProjectSource.findUnique as jest.Mock).mockResolvedValue({
        ...mockSource,
        projectId: 'other-project',
      });

      await expect(
        service.getSource(userId, projectId, sourceId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeSource', () => {
    it('should remove a source and decrement count', async () => {
      (prisma.researchProject.findUnique as jest.Mock).mockResolvedValue(mockProject);
      (prisma.researchProjectSource.findUnique as jest.Mock).mockResolvedValue(mockSource);
      (prisma.researchProjectSource.delete as jest.Mock).mockResolvedValue(mockSource);
      (prisma.researchProject.update as jest.Mock).mockResolvedValue(mockProject);

      const result = await service.removeSource(userId, projectId, sourceId);

      expect(result).toEqual({ success: true });
      expect(prisma.researchProjectSource.delete).toHaveBeenCalledWith({
        where: { id: sourceId },
      });
      expect(prisma.researchProject.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { sourceCount: { decrement: 1 } },
        }),
      );
    });

    it('should throw NotFoundException when source not found', async () => {
      (prisma.researchProject.findUnique as jest.Mock).mockResolvedValue(mockProject);
      (prisma.researchProjectSource.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.removeSource(userId, projectId, 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when project not found', async () => {
      (prisma.researchProject.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.removeSource(userId, projectId, sourceId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for non-owner', async () => {
      (prisma.researchProject.findUnique as jest.Mock).mockResolvedValue({
        ...mockProject,
        userId: 'other-user',
      });

      await expect(
        service.removeSource('non-owner', projectId, sourceId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('searchSources', () => {
    it('should run quick search by default', async () => {
      (prisma.resource.findMany as jest.Mock).mockResolvedValue([]);
      (toolRegistry.tryGet as jest.Mock).mockReturnValue(null);

      const result = await service.searchSources(userId, {
        query: 'AI technology',
      });

      expect(result.mode).toBe('quick');
      expect(result.query).toBe('AI technology');
    });

    it('should run quick search when mode is quick', async () => {
      (prisma.resource.findMany as jest.Mock).mockResolvedValue([]);
      (toolRegistry.tryGet as jest.Mock).mockReturnValue(null);

      const result = await service.searchSources(userId, {
        query: 'AI technology',
        mode: 'quick',
      });

      expect(result.mode).toBe('quick');
    });

    it('should use web-search tool when available', async () => {
      const mockTool = {
        execute: jest.fn().mockResolvedValue({
          success: true,
          data: {
            success: true,
            results: [
              { title: 'Result 1', url: 'https://example.com', content: 'Content 1', score: 0.9 },
            ],
          },
        }),
      };
      (prisma.resource.findMany as jest.Mock).mockResolvedValue([]);
      (toolRegistry.tryGet as jest.Mock).mockReturnValue(mockTool);

      const result = await service.searchSources(userId, {
        query: 'AI technology',
        sources: ['web'],
      });

      expect(result.results.length).toBeGreaterThan(0);
      expect(mockTool.execute).toHaveBeenCalled();
    });

    it('should handle web-search tool not available gracefully', async () => {
      (prisma.resource.findMany as jest.Mock).mockResolvedValue([]);
      (toolRegistry.tryGet as jest.Mock).mockReturnValue(null);

      const result = await service.searchSources(userId, {
        query: 'AI technology',
        sources: ['web'],
      });

      expect(result.results).toEqual([]);
      expect(result.mode).toBe('quick');
    });

    it('should search local DB for local sources', async () => {
      const mockResource = {
        id: 'res-1',
        type: 'PAPER',
        title: 'AI Paper',
        abstract: 'AI research',
        sourceUrl: 'https://example.com',
        publishedAt: new Date(),
        authors: ['Author'],
        qualityScore: 0.8,
        citationCount: 50,
      };
      (prisma.resource.findMany as jest.Mock).mockResolvedValue([mockResource]);
      (toolRegistry.tryGet as jest.Mock).mockReturnValue(null);

      const result = await service.searchSources(userId, {
        query: 'AI technology',
        sources: ['local'],
      });

      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].source).toBe('local');
    });

    it('should run deep search when mode is deep', async () => {
      (prisma.resource.findMany as jest.Mock).mockResolvedValue([]);
      (toolRegistry.tryGet as jest.Mock).mockReturnValue(null);

      const result = await service.searchSources(userId, {
        query: 'AI technology',
        mode: 'deep',
        sources: ['local', 'web'],
      });

      expect(result.mode).toBe('deep');
      expect(result.stats).toHaveProperty('searchRounds');
    });

    it('should include stats in search results', async () => {
      (prisma.resource.findMany as jest.Mock).mockResolvedValue([]);
      (toolRegistry.tryGet as jest.Mock).mockReturnValue(null);

      const result = await service.searchSources(userId, {
        query: 'AI',
      });

      expect(result.stats).toBeDefined();
      expect(result.stats.totalResults).toBeDefined();
      expect(result.stats.durationMs).toBeDefined();
    });
  });

  describe('uploadFiles', () => {
    it('should upload and process files', async () => {
      const mockFile = {
        originalname: 'test.pdf',
        buffer: Buffer.from('test'),
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      const mockParsed = {
        title: 'Test PDF',
        abstract: 'Abstract',
        content: 'Content',
        fileUrl: 'https://storage.example.com/test.pdf',
        metadata: { storageKey: 'key-123' },
      };

      (prisma.researchProject.findUnique as jest.Mock).mockResolvedValue(mockProject);
      (fileParserService.parseFile as jest.Mock).mockResolvedValue(mockParsed);
      (prisma.researchProjectSource.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.researchProjectSource.create as jest.Mock).mockResolvedValue({
        ...mockSource,
        title: 'Test PDF',
        sourceType: 'file',
      });
      (prisma.researchProject.update as jest.Mock).mockResolvedValue(mockProject);

      const result = await service.uploadFiles(userId, projectId, [mockFile]);

      expect(result.sources).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(prisma.researchProjectSource.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sourceType: 'file',
            analysisStatus: 'COMPLETED',
          }),
        }),
      );
    });

    it('should return existing source if file already uploaded', async () => {
      const mockFile = {
        originalname: 'existing.pdf',
        buffer: Buffer.from('test'),
      } as Express.Multer.File;

      const mockParsed = {
        title: 'Existing Source',
        abstract: 'Abstract',
        content: 'Content',
        fileUrl: 'https://storage.example.com/existing.pdf',
        metadata: { storageKey: 'key-456' },
      };

      (prisma.researchProject.findUnique as jest.Mock).mockResolvedValue(mockProject);
      (fileParserService.parseFile as jest.Mock).mockResolvedValue(mockParsed);
      (prisma.researchProjectSource.findFirst as jest.Mock).mockResolvedValue(mockSource);

      const result = await service.uploadFiles(userId, projectId, [mockFile]);

      expect(result.sources).toHaveLength(1);
      expect(result.sources[0]).toBe(mockSource);
      expect(prisma.researchProjectSource.create).not.toHaveBeenCalled();
    });

    it('should record error when file processing fails', async () => {
      const mockFile = {
        originalname: 'broken.pdf',
        buffer: Buffer.from('test'),
      } as Express.Multer.File;

      (prisma.researchProject.findUnique as jest.Mock).mockResolvedValue(mockProject);
      (fileParserService.parseFile as jest.Mock).mockRejectedValue(
        new Error('File parsing failed'),
      );

      const result = await service.uploadFiles(userId, projectId, [mockFile]);

      expect(result.sources).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].fileName).toBe('broken.pdf');
      expect(result.errors[0].error).toBe('File parsing failed');
    });

    it('should throw NotFoundException when project not found', async () => {
      (prisma.researchProject.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.uploadFiles(userId, projectId, []),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for non-owner', async () => {
      (prisma.researchProject.findUnique as jest.Mock).mockResolvedValue({
        ...mockProject,
        userId: 'other-user',
      });

      await expect(
        service.uploadFiles('non-owner', projectId, []),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateSourceAnalysis', () => {
    it('should update source analysis status', async () => {
      (prisma.researchProjectSource.update as jest.Mock).mockResolvedValue({
        ...mockSource,
        analysisStatus: 'ANALYZING',
      });

      await service.updateSourceAnalysis(sourceId, 'ANALYZING');

      expect(prisma.researchProjectSource.update).toHaveBeenCalledWith({
        where: { id: sourceId },
        data: { analysisStatus: 'ANALYZING' },
      });
    });

    it('should update with AI summary when provided', async () => {
      (prisma.researchProjectSource.update as jest.Mock).mockResolvedValue({
        ...mockSource,
        analysisStatus: 'COMPLETED',
        aiSummary: 'This is a summary',
      });

      await service.updateSourceAnalysis(sourceId, 'COMPLETED', 'This is a summary');

      expect(prisma.researchProjectSource.update).toHaveBeenCalledWith({
        where: { id: sourceId },
        data: {
          analysisStatus: 'COMPLETED',
          aiSummary: 'This is a summary',
        },
      });
    });

    it('should update with key insights when provided', async () => {
      const keyInsights = { points: ['Point 1', 'Point 2'] };
      (prisma.researchProjectSource.update as jest.Mock).mockResolvedValue({
        ...mockSource,
        analysisStatus: 'COMPLETED',
      });

      await service.updateSourceAnalysis(sourceId, 'COMPLETED', undefined, keyInsights as any);

      expect(prisma.researchProjectSource.update).toHaveBeenCalledWith({
        where: { id: sourceId },
        data: {
          analysisStatus: 'COMPLETED',
          keyInsights,
        },
      });
    });
  });
});
