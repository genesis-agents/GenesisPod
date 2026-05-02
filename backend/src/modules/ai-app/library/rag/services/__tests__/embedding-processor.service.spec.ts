import { Test, TestingModule } from "@nestjs/testing";
import { EmbeddingProcessorService } from "../embedding-processor.service";
import { PrismaService } from "../../../../../../common/prisma/prisma.service";
import { RAGFacade } from "@/modules/ai-harness/facade";

describe("EmbeddingProcessorService", () => {
  let service: EmbeddingProcessorService;
  let prisma: jest.Mocked<PrismaService>;

  const mockEmbeddingService = {
    getModel: jest.fn().mockResolvedValue("text-embedding-3-small"),
    generateEmbeddings: jest.fn().mockResolvedValue({
      embeddings: [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ],
    }),
  };

  const mockVectorService = {
    storeEmbedding: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const mockPrisma = {
      childChunk: {
        findMany: jest.fn(),
      },
    };

    const mockAiFacade = {
      embedding: mockEmbeddingService,
      vector: mockVectorService,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingProcessorService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RAGFacade, useValue: mockAiFacade },
      ],
    }).compile();

    service = module.get<EmbeddingProcessorService>(EmbeddingProcessorService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Reset once-queues to prevent bleed-through between tests
    mockEmbeddingService.generateEmbeddings.mockReset();
    mockEmbeddingService.getModel.mockReset();
    // Re-apply default implementations
    mockEmbeddingService.generateEmbeddings.mockResolvedValue({
      embeddings: [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ],
    });
    mockEmbeddingService.getModel.mockResolvedValue("text-embedding-3-small");
    mockVectorService.storeEmbedding.mockReset();
    mockVectorService.storeEmbedding.mockResolvedValue(undefined);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("generateEmbeddingsForKnowledgeBase", () => {
    it("should return 0 when no chunks need embeddings", async () => {
      (prisma.childChunk.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.generateEmbeddingsForKnowledgeBase("kb-1");

      expect(result).toBe(0);
      expect(mockEmbeddingService.generateEmbeddings).not.toHaveBeenCalled();
    });

    it("should generate embeddings for chunks without embeddings", async () => {
      const chunks = [
        { id: "chunk-1", content: "First chunk content" },
        { id: "chunk-2", content: "Second chunk content" },
      ];
      (prisma.childChunk.findMany as jest.Mock).mockResolvedValue(chunks);
      mockEmbeddingService.generateEmbeddings.mockResolvedValue({
        embeddings: [
          [0.1, 0.2, 0.3],
          [0.4, 0.5, 0.6],
        ],
      });

      const result = await service.generateEmbeddingsForKnowledgeBase("kb-1");

      expect(result).toBe(2);
      expect(mockEmbeddingService.generateEmbeddings).toHaveBeenCalledWith([
        "First chunk content",
        "Second chunk content",
      ]);
      expect(mockVectorService.storeEmbedding).toHaveBeenCalledTimes(2);
    });

    it("should skip chunks with empty embeddings", async () => {
      const chunks = [{ id: "chunk-1", content: "Chunk content" }];
      (prisma.childChunk.findMany as jest.Mock).mockResolvedValue(chunks);
      mockEmbeddingService.generateEmbeddings.mockResolvedValue({
        embeddings: [[]], // Empty embedding array
      });

      const result = await service.generateEmbeddingsForKnowledgeBase("kb-1");

      expect(result).toBe(0);
      expect(mockVectorService.storeEmbedding).not.toHaveBeenCalled();
    });

    it("should continue processing when one batch fails", async () => {
      // Create more than BATCH_SIZE (50) chunks to test batch processing
      const chunks = Array.from({ length: 3 }, (_, i) => ({
        id: `chunk-${i}`,
        content: `Content ${i}`,
      }));
      (prisma.childChunk.findMany as jest.Mock).mockResolvedValue(chunks);
      mockEmbeddingService.generateEmbeddings
        .mockRejectedValueOnce(new Error("Batch error"))
        .mockResolvedValueOnce({ embeddings: [[0.1]] });

      // Should not throw but continue
      const result = await service.generateEmbeddingsForKnowledgeBase("kb-1");

      // First batch fails, second call is not made as all chunks fit in one batch (< 50)
      expect(result).toBe(0);
    });
  });

  describe("generateEmbeddingsForDocument", () => {
    it("should return 0 when no chunks need embeddings", async () => {
      (prisma.childChunk.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.generateEmbeddingsForDocument("doc-1");

      expect(result).toBe(0);
    });

    it("should generate embeddings for document chunks", async () => {
      const chunks = [
        { id: "chunk-1", content: "Document chunk 1" },
        { id: "chunk-2", content: "Document chunk 2" },
      ];
      (prisma.childChunk.findMany as jest.Mock).mockResolvedValue(chunks);
      mockEmbeddingService.generateEmbeddings.mockResolvedValue({
        embeddings: [
          [0.1, 0.2],
          [0.3, 0.4],
        ],
      });

      const result = await service.generateEmbeddingsForDocument("doc-1");

      expect(result).toBe(2);
      expect(mockVectorService.storeEmbedding).toHaveBeenCalledTimes(2);
      expect(mockVectorService.storeEmbedding).toHaveBeenCalledWith(
        "chunk-1",
        [0.1, 0.2],
        "text-embedding-3-small",
      );
    });

    it("should throw when embedding generation fails", async () => {
      const chunks = [{ id: "chunk-1", content: "Content" }];
      (prisma.childChunk.findMany as jest.Mock).mockResolvedValue(chunks);
      mockEmbeddingService.generateEmbeddings.mockRejectedValue(
        new Error("Embedding API error"),
      );

      await expect(
        service.generateEmbeddingsForDocument("doc-1"),
      ).rejects.toThrow("Embedding API error");
    });

    it("should store embeddings with the correct model name", async () => {
      const chunks = [{ id: "chunk-1", content: "Content" }];
      (prisma.childChunk.findMany as jest.Mock).mockResolvedValue(chunks);
      mockEmbeddingService.getModel.mockResolvedValue("custom-embedding-model");
      mockEmbeddingService.generateEmbeddings.mockResolvedValue({
        embeddings: [[0.5, 0.6, 0.7]],
      });

      await service.generateEmbeddingsForDocument("doc-1");

      expect(mockVectorService.storeEmbedding).toHaveBeenCalledWith(
        "chunk-1",
        [0.5, 0.6, 0.7],
        "custom-embedding-model",
      );
    });
  });
});
