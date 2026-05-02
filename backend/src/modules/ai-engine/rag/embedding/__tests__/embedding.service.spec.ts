import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { EmbeddingService } from "../embedding.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import { SecretsService } from "@/modules/ai-infra/secrets/secrets.service";
import { AiApiCallerService } from "../../../../llm/services/ai-api-caller.service";

// ─── Mocks ────────────────────────────────────────────────

const mockPrisma = {
  aIModel: {
    findFirst: jest.fn(),
  },
};

const mockSecretsService = {
  getValueInternal: jest.fn(),
};

const mockAiApiCallerService = {
  callOpenAICompatibleEmbeddingAPI: jest.fn(),
  callGoogleEmbeddingAPI: jest.fn(),
  callCohereEmbeddingAPI: jest.fn(),
};

const mockConfigService = {
  get: jest.fn(),
};

// ─── Fixtures ─────────────────────────────────────────────

const MOCK_EMBEDDINGS = [[0.1, 0.2, 0.3, 0.4, 0.5]];
const MOCK_EMBEDDING_RESULT = {
  embeddings: MOCK_EMBEDDINGS,
  totalTokens: 10,
};

const mockOpenAIModel = {
  modelId: "text-embedding-3-small",
  embeddingDimensions: 1536,
  apiKey: null,
  secretKey: "EMBEDDING_API_KEY",
  apiEndpoint: null,
  provider: "openai",
  apiFormat: "openai",
  isEnabled: true,
  isDefault: true,
  maxInputTokens: null,
};

describe("EmbeddingService", () => {
  let service: EmbeddingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Default: secretKey resolves to "sk-test-key" for mockOpenAIModel
    mockSecretsService.getValueInternal.mockResolvedValue("sk-test-key");

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SecretsService, useValue: mockSecretsService },
        { provide: AiApiCallerService, useValue: mockAiApiCallerService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<EmbeddingService>(EmbeddingService);
  });

  // ─── getEmbeddingConfig() ─────────────────────────────

  describe("getEmbeddingConfig()", () => {
    it("loads config from database when model exists with secretKey", async () => {
      mockPrisma.aIModel.findFirst.mockResolvedValue(mockOpenAIModel);

      const config = await service.getEmbeddingConfig();

      expect(config.modelId).toBe("text-embedding-3-small");
      expect(config.dimensions).toBe(1536);
      expect(config.apiKey).toBe("sk-test-key");
      expect(config.provider).toBe("openai");
      expect(config.apiFormat).toBe("openai");
    });

    it("resolves API key from SecretsService when secretKey is set", async () => {
      mockPrisma.aIModel.findFirst.mockResolvedValue({
        ...mockOpenAIModel,
        apiKey: null,
        secretKey: "my-secret-key",
      });
      mockSecretsService.getValueInternal.mockResolvedValue(
        "resolved-secret-key",
      );

      const config = await service.getEmbeddingConfig();

      expect(mockSecretsService.getValueInternal).toHaveBeenCalledWith(
        "my-secret-key",
      );
      expect(config.apiKey).toBe("resolved-secret-key");
    });

    it("falls back to env var when secretKey lookup returns null", async () => {
      mockPrisma.aIModel.findFirst.mockResolvedValue({
        ...mockOpenAIModel,
        secretKey: "missing-secret",
      });
      mockSecretsService.getValueInternal.mockResolvedValue(null);
      mockConfigService.get.mockReturnValue("env-fallback-key");

      const config = await service.getEmbeddingConfig();

      // No apiKey fallback — falls through to env var
      expect(config.apiKey).toBe("env-fallback-key");
    });

    it("falls back to OPENAI_API_KEY env when no database model", async () => {
      mockPrisma.aIModel.findFirst.mockResolvedValue(null);
      mockConfigService.get.mockReturnValue("env-api-key");

      const config = await service.getEmbeddingConfig();

      expect(config.modelId).toBe("text-embedding-3-small");
      expect(config.apiKey).toBe("env-api-key");
      expect(config.provider).toBe("openai");
    });

    it("throws when no model in DB and no OPENAI_API_KEY env", async () => {
      mockPrisma.aIModel.findFirst.mockResolvedValue(null);
      mockConfigService.get.mockReturnValue(undefined);

      await expect(service.getEmbeddingConfig()).rejects.toThrow(
        /No embedding model configured/,
      );
    });

    it("throws when database model has no apiKey and no secretKey", async () => {
      mockPrisma.aIModel.findFirst.mockResolvedValue({
        ...mockOpenAIModel,
        apiKey: null,
        secretKey: null,
      });
      mockConfigService.get.mockReturnValue(undefined);

      await expect(service.getEmbeddingConfig()).rejects.toThrow(
        /No embedding model configured/,
      );
    });

    it("caches config for subsequent calls within TTL", async () => {
      mockPrisma.aIModel.findFirst.mockResolvedValue(mockOpenAIModel);

      await service.getEmbeddingConfig();
      await service.getEmbeddingConfig();
      await service.getEmbeddingConfig();

      // Should only call DB once due to caching
      expect(mockPrisma.aIModel.findFirst).toHaveBeenCalledTimes(1);
    });

    it("re-fetches config after cache is cleared", async () => {
      mockPrisma.aIModel.findFirst.mockResolvedValue(mockOpenAIModel);

      await service.getEmbeddingConfig();
      service.clearConfigCache();
      await service.getEmbeddingConfig();

      expect(mockPrisma.aIModel.findFirst).toHaveBeenCalledTimes(2);
    });

    it("uses default dimensions when embeddingDimensions is null", async () => {
      mockPrisma.aIModel.findFirst.mockResolvedValue({
        ...mockOpenAIModel,
        embeddingDimensions: null,
      });

      const config = await service.getEmbeddingConfig();
      expect(config.dimensions).toBe(1536); // DEFAULT_EMBEDDING_DIMENSIONS
    });

    it("handles apiEndpoint correctly", async () => {
      mockPrisma.aIModel.findFirst.mockResolvedValue({
        ...mockOpenAIModel,
        apiEndpoint: "https://custom-api.example.com",
      });

      const config = await service.getEmbeddingConfig();
      expect(config.apiEndpoint).toBe("https://custom-api.example.com");
    });
  });

  // ─── resolveApiFormat() ────────────────────────────────

  describe("API format resolution", () => {
    it("uses google format for Google provider", async () => {
      mockPrisma.aIModel.findFirst.mockResolvedValue({
        ...mockOpenAIModel,
        provider: "google",
        apiFormat: "google",
      });
      mockSecretsService.getValueInternal.mockResolvedValue(
        "google-secret-key",
      );

      const config = await service.getEmbeddingConfig();
      expect(config.apiFormat).toBe("google");
    });

    it("uses cohere format for Cohere provider", async () => {
      mockPrisma.aIModel.findFirst.mockResolvedValue({
        ...mockOpenAIModel,
        provider: "cohere",
        apiFormat: "cohere",
      });
      mockSecretsService.getValueInternal.mockResolvedValue(
        "cohere-secret-key",
      );

      const config = await service.getEmbeddingConfig();
      expect(config.apiFormat).toBe("cohere");
    });

    it("infers google format for Gemini provider", async () => {
      mockPrisma.aIModel.findFirst.mockResolvedValue({
        ...mockOpenAIModel,
        provider: "gemini",
        apiFormat: null,
      });
      mockSecretsService.getValueInternal.mockResolvedValue(
        "gemini-secret-key",
      );

      const config = await service.getEmbeddingConfig();
      expect(config.apiFormat).toBe("google");
    });

    it("overrides openai format to inferred format for non-openai provider", async () => {
      // When provider is 'google' but apiFormat is 'openai' (misconfigured)
      mockPrisma.aIModel.findFirst.mockResolvedValue({
        ...mockOpenAIModel,
        provider: "google",
        apiFormat: "openai", // wrong format, should be overridden
      });
      mockSecretsService.getValueInternal.mockResolvedValue(
        "google-secret-key",
      );

      const config = await service.getEmbeddingConfig();
      expect(config.apiFormat).toBe("google"); // should use inferred
    });
  });

  // ─── generateEmbedding() ─────────────────────────────

  describe("generateEmbedding()", () => {
    beforeEach(() => {
      mockPrisma.aIModel.findFirst.mockResolvedValue(mockOpenAIModel);
      mockAiApiCallerService.callOpenAICompatibleEmbeddingAPI.mockResolvedValue(
        MOCK_EMBEDDING_RESULT,
      );
    });

    it("returns EmbeddingResult with text, embedding, and tokenCount", async () => {
      const result = await service.generateEmbedding("Hello world");

      expect(result.text).toBe("Hello world");
      expect(result.embedding).toEqual(MOCK_EMBEDDINGS[0]);
      expect(result.tokenCount).toBe(10);
    });

    it("calls the OpenAI compatible API for openai format", async () => {
      await service.generateEmbedding("test text");

      expect(
        mockAiApiCallerService.callOpenAICompatibleEmbeddingAPI,
      ).toHaveBeenCalledWith(
        expect.any(String), // endpoint
        "sk-test-key",
        "text-embedding-3-small",
        ["test text"],
      );
    });

    it("calls Google embedding API for google format", async () => {
      service.clearConfigCache();
      mockPrisma.aIModel.findFirst.mockResolvedValue({
        ...mockOpenAIModel,
        provider: "google",
        apiFormat: "google",
        secretKey: "GOOGLE_API_KEY",
      });
      mockSecretsService.getValueInternal.mockResolvedValue("google-key");
      mockAiApiCallerService.callGoogleEmbeddingAPI.mockResolvedValue(
        MOCK_EMBEDDING_RESULT,
      );

      await service.generateEmbedding("test");

      expect(mockAiApiCallerService.callGoogleEmbeddingAPI).toHaveBeenCalled();
    });

    it("calls Cohere embedding API for cohere format", async () => {
      service.clearConfigCache();
      mockPrisma.aIModel.findFirst.mockResolvedValue({
        ...mockOpenAIModel,
        provider: "cohere",
        apiFormat: "cohere",
        secretKey: "COHERE_API_KEY",
      });
      mockSecretsService.getValueInternal.mockResolvedValue("cohere-key");
      mockAiApiCallerService.callCohereEmbeddingAPI.mockResolvedValue(
        MOCK_EMBEDDING_RESULT,
      );

      await service.generateEmbedding("test");

      expect(mockAiApiCallerService.callCohereEmbeddingAPI).toHaveBeenCalled();
    });
  });

  // ─── generateEmbeddings() ────────────────────────────

  describe("generateEmbeddings()", () => {
    beforeEach(() => {
      mockPrisma.aIModel.findFirst.mockResolvedValue(mockOpenAIModel);
    });

    it("returns empty batch for empty input", async () => {
      const result = await service.generateEmbeddings([]);
      expect(result.texts).toHaveLength(0);
      expect(result.embeddings).toHaveLength(0);
      expect(result.totalTokens).toBe(0);
    });

    it("returns embeddings for single text", async () => {
      mockAiApiCallerService.callOpenAICompatibleEmbeddingAPI.mockResolvedValue(
        {
          embeddings: [[0.1, 0.2, 0.3]],
          totalTokens: 5,
        },
      );

      const result = await service.generateEmbeddings(["hello"]);
      expect(result.texts).toEqual(["hello"]);
      expect(result.embeddings).toHaveLength(1);
      expect(result.totalTokens).toBe(5);
    });

    it("processes multiple texts in one batch", async () => {
      const texts = ["text 1", "text 2", "text 3"];
      mockAiApiCallerService.callOpenAICompatibleEmbeddingAPI.mockResolvedValue(
        {
          embeddings: [[0.1], [0.2], [0.3]],
          totalTokens: 15,
        },
      );

      const result = await service.generateEmbeddings(texts);
      expect(result.texts).toEqual(texts);
      expect(result.embeddings).toHaveLength(3);
      expect(result.totalTokens).toBe(15);
    });

    it("processes texts in batches of 100 for non-Cohere", async () => {
      const texts = Array.from({ length: 150 }, (_, i) => `text ${i}`);
      mockAiApiCallerService.callOpenAICompatibleEmbeddingAPI.mockResolvedValue(
        {
          embeddings: Array(100).fill([0.1, 0.2]),
          totalTokens: 500,
        },
      );

      // Second batch
      mockAiApiCallerService.callOpenAICompatibleEmbeddingAPI.mockResolvedValueOnce(
        {
          embeddings: Array(100).fill([0.1, 0.2]),
          totalTokens: 500,
        },
      );
      mockAiApiCallerService.callOpenAICompatibleEmbeddingAPI.mockResolvedValueOnce(
        {
          embeddings: Array(50).fill([0.1, 0.2]),
          totalTokens: 250,
        },
      );

      await service.generateEmbeddings(texts);
      // Should be called twice (batches of 100)
      expect(
        mockAiApiCallerService.callOpenAICompatibleEmbeddingAPI,
      ).toHaveBeenCalledTimes(2);
    });

    it("processes texts in batches of 96 for Cohere", async () => {
      service.clearConfigCache();
      mockPrisma.aIModel.findFirst.mockResolvedValue({
        ...mockOpenAIModel,
        provider: "cohere",
        apiFormat: "cohere",
        secretKey: "COHERE_API_KEY",
      });
      mockSecretsService.getValueInternal.mockResolvedValue("cohere-key");

      const texts = Array.from({ length: 200 }, (_, i) => `text ${i}`);
      mockAiApiCallerService.callCohereEmbeddingAPI
        .mockResolvedValueOnce({
          embeddings: Array(96).fill([0.1]),
          totalTokens: 500,
        })
        .mockResolvedValueOnce({
          embeddings: Array(96).fill([0.1]),
          totalTokens: 500,
        })
        .mockResolvedValueOnce({
          embeddings: Array(8).fill([0.1]),
          totalTokens: 40,
        });

      await service.generateEmbeddings(texts);

      // 200 texts / 96 per batch = 3 calls (ceil(200/96) = 3)
      expect(
        mockAiApiCallerService.callCohereEmbeddingAPI,
      ).toHaveBeenCalledTimes(3);
    });

    it("throws when API call fails", async () => {
      mockAiApiCallerService.callOpenAICompatibleEmbeddingAPI.mockRejectedValue(
        new Error("API error"),
      );

      await expect(service.generateEmbeddings(["test"])).rejects.toThrow(
        "API error",
      );
    });

    it("accumulates totalTokens across batches", async () => {
      const texts = Array.from({ length: 150 }, (_, i) => `text ${i}`);
      mockAiApiCallerService.callOpenAICompatibleEmbeddingAPI
        .mockResolvedValueOnce({
          embeddings: Array(100).fill([0.1]),
          totalTokens: 1000,
        })
        .mockResolvedValueOnce({
          embeddings: Array(50).fill([0.1]),
          totalTokens: 500,
        });

      const result = await service.generateEmbeddings(texts);
      expect(result.totalTokens).toBe(1500);
    });
  });

  // ─── getDimensions() ─────────────────────────────────

  describe("getDimensions()", () => {
    it("returns configured dimensions from database model", async () => {
      mockPrisma.aIModel.findFirst.mockResolvedValue({
        ...mockOpenAIModel,
        embeddingDimensions: 3072,
      });

      const dims = await service.getDimensions();
      expect(dims).toBe(3072);
    });

    it("returns default 1536 when not specified", async () => {
      mockPrisma.aIModel.findFirst.mockResolvedValue({
        ...mockOpenAIModel,
        embeddingDimensions: null,
      });

      const dims = await service.getDimensions();
      expect(dims).toBe(1536);
    });
  });

  // ─── getModel() ───────────────────────────────────────

  describe("getModel()", () => {
    it("returns configured model ID", async () => {
      mockPrisma.aIModel.findFirst.mockResolvedValue({
        ...mockOpenAIModel,
        modelId: "text-embedding-3-large",
      });

      const model = await service.getModel();
      expect(model).toBe("text-embedding-3-large");
    });
  });

  // ─── getConfigInfo() ─────────────────────────────────

  describe("getConfigInfo()", () => {
    it("returns config info without exposing full API key", async () => {
      mockPrisma.aIModel.findFirst.mockResolvedValue(mockOpenAIModel);

      const info = await service.getConfigInfo();

      expect(info.modelId).toBe("text-embedding-3-small");
      expect(info.dimensions).toBe(1536);
      expect(info.provider).toBe("openai");
      expect(info.apiFormat).toBe("openai");
      expect(info.hasApiKey).toBe(true);
    });

    it("sets hasApiKey=false when API key is empty", async () => {
      mockPrisma.aIModel.findFirst.mockResolvedValue(null);
      mockConfigService.get.mockReturnValue("  "); // whitespace only

      // trimmed empty string should cause throw
      await expect(service.getConfigInfo()).rejects.toThrow();
    });
  });

  // ─── clearConfigCache() ───────────────────────────────

  describe("clearConfigCache()", () => {
    it("resets the config cache so next call re-fetches from DB", async () => {
      mockPrisma.aIModel.findFirst.mockResolvedValue(mockOpenAIModel);

      await service.getEmbeddingConfig();
      service.clearConfigCache();
      await service.getEmbeddingConfig();

      expect(mockPrisma.aIModel.findFirst).toHaveBeenCalledTimes(2);
    });
  });
});
