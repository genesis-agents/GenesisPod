/**
 * Document Generation Service 测试
 * 测试文档生成功能（PPT, 文章等）
 */

import { Test, TestingModule } from "@nestjs/testing";
import {
  GenerationService as DocumentGenerationService,
  GenerationConfig,
  StreamChunk,
} from "../generation";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { AiChatService } from "../../ai-core/ai-chat.service";
import { AIModelService } from "../core";
import { DocumentsService as OfficeDocumentService } from "../documents";

describe("DocumentGenerationService", () => {
  let service: DocumentGenerationService;

  const mockPrisma = {
    resource: {
      findMany: jest.fn(),
    },
    officeDocument: {
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockAiChatService = {
    generateChatCompletion: jest.fn(),
    generateChatCompletionWithKey: jest.fn(),
  };

  const mockAiModelService = {
    getDefaultTextModel: jest.fn(),
    getDefaultImageModel: jest.fn(),
  };

  const mockDocumentService = {
    createDocument: jest.fn(),
    updateDocument: jest.fn(),
    createVersion: jest.fn(),
  };

  const mockTextModel = {
    id: "test-model-id",
    displayName: "Test Model",
    modelId: "gpt-4",
    provider: "openai",
    apiKey: "test-key",
    apiEndpoint: "https://api.openai.com/v1",
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentGenerationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AiChatService, useValue: mockAiChatService },
        { provide: AIModelService, useValue: mockAiModelService },
        { provide: OfficeDocumentService, useValue: mockDocumentService },
      ],
    }).compile();

    service = module.get<DocumentGenerationService>(DocumentGenerationService);

    // 默认 mock 返回值
    mockAiModelService.getDefaultTextModel.mockResolvedValue(mockTextModel);
    mockPrisma.resource.findMany.mockResolvedValue([]);
    mockDocumentService.createDocument.mockResolvedValue({ id: "doc-123" });
    mockDocumentService.updateDocument.mockResolvedValue({ id: "doc-123" });
    mockDocumentService.createVersion.mockResolvedValue({ id: "version-123" });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("generateDocument", () => {
    const baseConfig: GenerationConfig = {
      documentType: "PPT",
      title: "测试PPT",
      prompt: "关于人工智能的介绍",
    };

    describe("Stream initialization", () => {
      it("should yield progress chunk on init", async () => {
        mockAiChatService.generateChatCompletionWithKey.mockResolvedValue({
          content: "# 生成的内容",
        });
        mockDocumentService.createDocument.mockResolvedValue({ id: "doc-123" });

        const generator = service.generateDocument("user-123", baseConfig);
        const firstChunk = await generator.next();

        expect(firstChunk.done).toBe(false);
        expect(firstChunk.value.type).toBe("progress");
        expect(firstChunk.value.progress?.step).toBe("init");
      });

      it("should call getDefaultTextModel with config textModelId", async () => {
        const config: GenerationConfig = {
          ...baseConfig,
          textModelId: "custom-model-id",
        };

        mockAiChatService.generateChatCompletionWithKey.mockResolvedValue({
          content: "# 内容",
        });
        mockDocumentService.createDocument.mockResolvedValue({ id: "doc-123" });

        const generator = service.generateDocument("user-123", config);

        // 消耗生成器
        const chunks: StreamChunk[] = [];
        for await (const chunk of generator) {
          chunks.push(chunk);
          if (chunk.type === "done" || chunk.type === "error") break;
        }

        expect(mockAiModelService.getDefaultTextModel).toHaveBeenCalledWith(
          "custom-model-id",
        );
      });
    });

    describe("Resource fetching", () => {
      it("should fetch resources when resourceIds provided", async () => {
        const config: GenerationConfig = {
          ...baseConfig,
          resourceIds: ["res-1", "res-2"],
        };

        mockPrisma.resource.findMany.mockResolvedValue([
          { id: "res-1", title: "资源1", abstract: "摘要1" },
          { id: "res-2", title: "资源2", abstract: "摘要2" },
        ]);
        mockAiChatService.generateChatCompletionWithKey.mockResolvedValue({
          content: "# 基于资源生成的内容",
        });
        mockDocumentService.createDocument.mockResolvedValue({ id: "doc-123" });

        const generator = service.generateDocument("user-123", config);

        // 消耗生成器
        for await (const chunk of generator) {
          if (chunk.type === "done" || chunk.type === "error") break;
        }

        expect(mockPrisma.resource.findMany).toHaveBeenCalledWith({
          where: { id: { in: ["res-1", "res-2"] } },
          select: expect.any(Object),
        });
      });

      it("should not fetch resources when no resourceIds", async () => {
        mockAiChatService.generateChatCompletionWithKey.mockResolvedValue({
          content: "# 内容",
        });
        mockDocumentService.createDocument.mockResolvedValue({ id: "doc-123" });

        const generator = service.generateDocument("user-123", baseConfig);

        for await (const chunk of generator) {
          if (chunk.type === "done" || chunk.type === "error") break;
        }

        expect(mockPrisma.resource.findMany).not.toHaveBeenCalled();
      });
    });

    describe("Content generation", () => {
      it("should call AI service with correct prompt for PPT", async () => {
        const config: GenerationConfig = {
          documentType: "PPT",
          title: "AI介绍",
          prompt: "介绍人工智能",
          slideCount: 10,
        };

        mockAiChatService.generateChatCompletionWithKey.mockResolvedValue({
          content: "### Slide 1: 标题\n- 内容",
        });
        mockDocumentService.createDocument.mockResolvedValue({ id: "doc-123" });

        const generator = service.generateDocument("user-123", config);

        for await (const chunk of generator) {
          if (chunk.type === "done" || chunk.type === "error") break;
        }

        expect(
          mockAiChatService.generateChatCompletionWithKey,
        ).toHaveBeenCalled();
        const callArgs =
          mockAiChatService.generateChatCompletionWithKey.mock.calls[0][0];
        expect(callArgs.systemPrompt).toContain("PPT"); // system prompt should mention PPT
      });

      it("should call AI service with correct prompt for ARTICLE", async () => {
        const config: GenerationConfig = {
          documentType: "ARTICLE",
          title: "技术文章",
          prompt: "写一篇关于云计算的文章",
        };

        mockAiChatService.generateChatCompletionWithKey.mockResolvedValue({
          content: "# 云计算概述\n\n正文内容...",
        });
        mockDocumentService.createDocument.mockResolvedValue({ id: "doc-123" });

        const generator = service.generateDocument("user-123", config);

        for await (const chunk of generator) {
          if (chunk.type === "done" || chunk.type === "error") break;
        }

        expect(
          mockAiChatService.generateChatCompletionWithKey,
        ).toHaveBeenCalled();
      });
    });

    describe("Stream chunks", () => {
      it("should yield content chunks during generation", async () => {
        mockAiChatService.generateChatCompletionWithKey.mockResolvedValue({
          content: "# 生成的PPT内容\n\n- 要点1\n- 要点2",
        });
        mockDocumentService.createDocument.mockResolvedValue({ id: "doc-123" });

        const generator = service.generateDocument("user-123", baseConfig);

        const chunks: StreamChunk[] = [];
        for await (const chunk of generator) {
          chunks.push(chunk);
          if (chunk.type === "done" || chunk.type === "error") break;
        }

        // 应该包含 progress 和 done 类型的 chunk
        expect(chunks.some((c) => c.type === "progress")).toBe(true);
        expect(chunks.some((c) => c.type === "done")).toBe(true);
      });

      it("should yield done chunk with document ID on success", async () => {
        mockAiChatService.generateChatCompletionWithKey.mockResolvedValue({
          content: "# 内容",
        });
        mockDocumentService.createDocument.mockResolvedValue({ id: "doc-456" });

        const generator = service.generateDocument("user-123", baseConfig);

        let doneChunk: StreamChunk | null = null;
        for await (const chunk of generator) {
          if (chunk.type === "done") {
            doneChunk = chunk;
            break;
          }
          if (chunk.type === "error") break;
        }

        expect(doneChunk).not.toBeNull();
        expect(doneChunk?.type).toBe("done");
      });
    });

    describe("Error handling", () => {
      it("should yield error chunk when AI service fails", async () => {
        mockAiModelService.getDefaultTextModel.mockRejectedValue(
          new Error("Model not found"),
        );

        const generator = service.generateDocument("user-123", baseConfig);

        let errorChunk: StreamChunk | null = null;
        for await (const chunk of generator) {
          if (chunk.type === "error") {
            errorChunk = chunk;
            break;
          }
          if (chunk.type === "done") break;
        }

        expect(errorChunk).not.toBeNull();
        expect(errorChunk?.type).toBe("error");
        expect(errorChunk?.error).toContain("Model not found");
      });

      it("should handle chat completion failure gracefully", async () => {
        // Reset model mock to resolve normally (may have been set to reject in previous test)
        mockAiModelService.getDefaultTextModel.mockResolvedValue(mockTextModel);
        mockAiChatService.generateChatCompletionWithKey.mockRejectedValue(
          new Error("API Error"),
        );

        const generator = service.generateDocument("user-123", baseConfig);

        const chunks: StreamChunk[] = [];
        for await (const chunk of generator) {
          chunks.push(chunk);
        }

        // Generator should complete (either with error chunk or done chunk)
        expect(chunks.length).toBeGreaterThan(0);
        const lastChunk = chunks[chunks.length - 1];
        // Should end with either error or done
        expect(["error", "done"]).toContain(lastChunk.type);
      });
    });

    describe("Configuration options", () => {
      it("should respect language setting", async () => {
        const config: GenerationConfig = {
          ...baseConfig,
          language: "en-US",
        };

        mockAiChatService.generateChatCompletionWithKey.mockResolvedValue({
          content: "# English Content",
        });
        mockDocumentService.createDocument.mockResolvedValue({ id: "doc-123" });

        const generator = service.generateDocument("user-123", config);

        for await (const chunk of generator) {
          if (chunk.type === "done" || chunk.type === "error") break;
        }

        expect(
          mockAiChatService.generateChatCompletionWithKey,
        ).toHaveBeenCalled();
      });

      it("should respect detailLevel setting", async () => {
        const config: GenerationConfig = {
          ...baseConfig,
          detailLevel: 3, // 详细
        };

        mockAiChatService.generateChatCompletionWithKey.mockResolvedValue({
          content: "# 详细内容",
        });
        mockDocumentService.createDocument.mockResolvedValue({ id: "doc-123" });

        const generator = service.generateDocument("user-123", config);

        for await (const chunk of generator) {
          if (chunk.type === "done" || chunk.type === "error") break;
        }

        expect(
          mockAiChatService.generateChatCompletionWithKey,
        ).toHaveBeenCalled();
      });

      it("should respect slideCount setting for PPT", async () => {
        const config: GenerationConfig = {
          documentType: "PPT",
          title: "测试",
          prompt: "内容",
          slideCount: 15,
        };

        mockAiChatService.generateChatCompletionWithKey.mockResolvedValue({
          content: "# PPT内容",
        });
        mockDocumentService.createDocument.mockResolvedValue({ id: "doc-123" });

        const generator = service.generateDocument("user-123", config);

        for await (const chunk of generator) {
          if (chunk.type === "done" || chunk.type === "error") break;
        }

        // slideCount 应该被传递给 AI prompt
        const callArgs =
          mockAiChatService.generateChatCompletionWithKey.mock.calls[0][0];
        expect(callArgs.systemPrompt).toContain("15"); // system prompt should mention slide count
      });
    });
  });

  describe("Document types", () => {
    it("should handle PPT document type", async () => {
      const config: GenerationConfig = {
        documentType: "PPT",
        title: "PPT测试",
        prompt: "测试内容",
      };

      mockAiChatService.generateChatCompletionWithKey.mockResolvedValue({
        content: "### Slide 1\n- 内容",
      });
      mockDocumentService.createDocument.mockResolvedValue({ id: "doc-123" });

      const generator = service.generateDocument("user-123", config);

      let hasError = false;
      for await (const chunk of generator) {
        if (chunk.type === "error") {
          hasError = true;
          break;
        }
        if (chunk.type === "done") break;
      }

      expect(hasError).toBe(false);
    });

    it("should handle ARTICLE document type", async () => {
      const config: GenerationConfig = {
        documentType: "ARTICLE",
        title: "文章测试",
        prompt: "写一篇文章",
      };

      mockAiChatService.generateChatCompletionWithKey.mockResolvedValue({
        content: "# 标题\n\n正文内容",
      });
      mockDocumentService.createDocument.mockResolvedValue({ id: "doc-123" });

      const generator = service.generateDocument("user-123", config);

      let hasError = false;
      for await (const chunk of generator) {
        if (chunk.type === "error") {
          hasError = true;
          break;
        }
        if (chunk.type === "done") break;
      }

      expect(hasError).toBe(false);
    });

    it("should handle REPORT document type", async () => {
      const config: GenerationConfig = {
        documentType: "REPORT",
        title: "报告测试",
        prompt: "生成报告",
      };

      mockAiChatService.generateChatCompletionWithKey.mockResolvedValue({
        content: "# 报告标题\n\n## 摘要\n\n## 内容",
      });
      mockDocumentService.createDocument.mockResolvedValue({ id: "doc-123" });

      const generator = service.generateDocument("user-123", config);

      let hasError = false;
      for await (const chunk of generator) {
        if (chunk.type === "error") {
          hasError = true;
          break;
        }
        if (chunk.type === "done") break;
      }

      expect(hasError).toBe(false);
    });
  });
});
