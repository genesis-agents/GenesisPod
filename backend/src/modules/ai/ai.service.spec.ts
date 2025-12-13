import { Test, TestingModule } from "@nestjs/testing";
import { AiService } from "./ai.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AiChatService } from "./ai-chat.service";
import { HttpException } from "@nestjs/common";
import { AIModelType } from "@prisma/client";

describe("AiService", () => {
  let service: AiService;
  let prismaService: jest.Mocked<PrismaService>;
  let aiChatService: jest.Mocked<AiChatService>;

  const mockAIModel = {
    id: "model-123",
    name: "gemini",
    displayName: "Gemini Pro",
    provider: "google",
    modelId: "gemini-pro",
    modelType: AIModelType.CHAT,
    icon: "gemini-icon",
    color: "#4285f4",
    description: "Google Gemini Pro model",
    isDefault: true,
    isEnabled: true,
    apiKey: "test-api-key",
    apiEndpoint: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrismaService = {
      aIModel: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    const mockAiChatService = {
      generateChatCompletionWithKey: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AiChatService, useValue: mockAiChatService },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
    prismaService = module.get(PrismaService);
    aiChatService = module.get(AiChatService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getEnabledModels", () => {
    it("should return enabled models with correct format", async () => {
      // Arrange
      const mockModels = [
        { ...mockAIModel, isDefault: true },
        {
          ...mockAIModel,
          id: "model-456",
          name: "grok",
          displayName: "Grok",
          provider: "xai",
          isDefault: false,
        },
      ];
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue(
        mockModels,
      );

      // Act
      const result = await service.getEnabledModels();

      // Assert
      expect(prismaService.aIModel.findMany).toHaveBeenCalledWith({
        where: { isEnabled: true },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        select: expect.objectContaining({
          id: true,
          name: true,
          displayName: true,
          provider: true,
          modelId: true,
          modelType: true,
        }),
      });
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("model-123");
      expect(result[0].name).toBe("Gemini Pro");
      expect(result[0].isDefault).toBe(true);
    });

    it("should return icon URL based on model name", async () => {
      // Arrange
      const models = [
        { ...mockAIModel, name: "grok-model" },
        { ...mockAIModel, id: "2", name: "gpt-4" },
        { ...mockAIModel, id: "3", name: "claude-opus" },
        { ...mockAIModel, id: "4", name: "gemini-pro" },
      ];
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue(models);

      // Act
      const result = await service.getEnabledModels();

      // Assert
      expect(result[0].iconUrl).toBe("/icons/ai/grok.svg");
      expect(result[1].iconUrl).toBe("/icons/ai/openai.svg");
      expect(result[2].iconUrl).toBe("/icons/ai/claude.svg");
      expect(result[3].iconUrl).toBe("/icons/ai/gemini.svg");
    });

    it("should return empty array when no models enabled", async () => {
      // Arrange
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await service.getEnabledModels();

      // Assert
      expect(result).toHaveLength(0);
    });
  });

  describe("translateText", () => {
    it("should translate text using CHAT_FAST model", async () => {
      // Arrange
      const chatFastModel = {
        ...mockAIModel,
        modelType: AIModelType.CHAT_FAST,
      };
      (prismaService.aIModel.findFirst as jest.Mock).mockResolvedValue(
        chatFastModel,
      );
      (
        aiChatService.generateChatCompletionWithKey as jest.Mock
      ).mockResolvedValue({
        content: "翻译后的文本",
        model: "gemini",
        tokensUsed: 100,
      });

      // Act
      const result = await service.translateText("Hello world", "en", "zh-CN");

      // Assert
      expect(result).toBe("翻译后的文本");
      expect(aiChatService.generateChatCompletionWithKey).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "google",
          modelId: "gemini-pro",
          temperature: 0.3,
        }),
      );
    });

    it("should fallback to CHAT model when CHAT_FAST not available", async () => {
      // Arrange
      // First call returns null (no CHAT_FAST default)
      // Second call returns null (no CHAT_FAST)
      // Third call returns CHAT model
      (prismaService.aIModel.findFirst as jest.Mock)
        .mockResolvedValueOnce(null) // No default CHAT_FAST
        .mockResolvedValueOnce(null) // No CHAT_FAST at all
        .mockResolvedValueOnce({ ...mockAIModel, modelType: AIModelType.CHAT }); // Fallback to CHAT

      (
        aiChatService.generateChatCompletionWithKey as jest.Mock
      ).mockResolvedValue({
        content: "Translated text",
        model: "gemini",
        tokensUsed: 50,
      });

      // Act
      const result = await service.translateText("你好", "zh-CN", "en");

      // Assert
      expect(result).toBe("Translated text");
      expect(prismaService.aIModel.findFirst).toHaveBeenCalledTimes(3);
    });

    it("should throw error when no AI model available", async () => {
      // Arrange
      (prismaService.aIModel.findFirst as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.translateText("Test", "en", "zh-CN"),
      ).rejects.toThrow(HttpException);
    });

    it("should throw HttpException on translation error", async () => {
      // Arrange
      (prismaService.aIModel.findFirst as jest.Mock).mockResolvedValue(
        mockAIModel,
      );
      (
        aiChatService.generateChatCompletionWithKey as jest.Mock
      ).mockRejectedValue(new Error("API error"));

      // Act & Assert
      await expect(
        service.translateText("Test", "en", "zh-CN"),
      ).rejects.toThrow(HttpException);
    });

    it("should map language codes to names correctly", async () => {
      // Arrange
      (prismaService.aIModel.findFirst as jest.Mock).mockResolvedValue(
        mockAIModel,
      );
      (
        aiChatService.generateChatCompletionWithKey as jest.Mock
      ).mockResolvedValue({
        content: "こんにちは",
        model: "gemini",
        tokensUsed: 30,
      });

      // Act
      await service.translateText("Hello", "en", "ja");

      // Assert
      expect(aiChatService.generateChatCompletionWithKey).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining("Japanese"),
            }),
          ]),
        }),
      );
    });
  });
});
