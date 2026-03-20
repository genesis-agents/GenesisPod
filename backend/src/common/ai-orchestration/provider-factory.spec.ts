/**
 * AIProviderFactory 单元测试
 *
 * 验证 Provider 注册、查找和任务类型匹配
 */

import { Test, TestingModule } from "@nestjs/testing";
import { HttpModule } from "@nestjs/axios";
import { AIProviderFactory } from "./providers/provider-factory";
import { AiTaskType, AiModelConfig } from "./types";

describe("AIProviderFactory", () => {
  let factory: AIProviderFactory;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [HttpModule],
      providers: [AIProviderFactory],
    }).compile();

    factory = module.get<AIProviderFactory>(AIProviderFactory);
  });

  describe("initialization", () => {
    it("should register all built-in providers", () => {
      const providerIds = factory.getAllProviderIds();

      expect(providerIds).toContain("openai");
      expect(providerIds).toContain("openai-dalle");
      expect(providerIds).toContain("anthropic");
      expect(providerIds).toContain("google-gemini");
      expect(providerIds).toContain("google-imagen");
      expect(providerIds).toContain("xai");
      expect(providerIds).toContain("groq");
      expect(providerIds).toContain("openrouter");
    });
  });

  describe("getProvider", () => {
    it("should get provider by exact ID", () => {
      const provider = factory.getProvider("openai");

      expect(provider).toBeDefined();
      expect(provider?.providerId).toBe("openai");
    });

    it("should get provider by alias", () => {
      const provider = factory.getProvider("gpt");

      expect(provider).toBeDefined();
      expect(provider?.providerId).toBe("openai");
    });

    it("should be case-insensitive", () => {
      const provider1 = factory.getProvider("OpenAI");
      const provider2 = factory.getProvider("OPENAI");
      const provider3 = factory.getProvider("openai");

      expect(provider1?.providerId).toBe("openai");
      expect(provider2?.providerId).toBe("openai");
      expect(provider3?.providerId).toBe("openai");
    });

    it("should return undefined for unknown provider", () => {
      const provider = factory.getProvider("unknown-provider");

      expect(provider).toBeUndefined();
    });

    it("should get Groq provider by ID", () => {
      const provider = factory.getProvider("groq");

      expect(provider).toBeDefined();
      expect(provider?.providerId).toBe("openai");
    });

    it("should get OpenRouter provider by ID", () => {
      const provider = factory.getProvider("openrouter");

      expect(provider).toBeDefined();
      expect(provider?.providerId).toBe("openai");
    });

    it("should get Groq provider by alias", () => {
      const provider = factory.getProvider("groq-cloud");

      expect(provider).toBeDefined();
      expect(provider?.providerId).toBe("openai");
    });

    it("should get OpenRouter provider by alias", () => {
      const provider = factory.getProvider("open-router");

      expect(provider).toBeDefined();
      expect(provider?.providerId).toBe("openai");
    });
  });

  describe("getProviderForModel", () => {
    it("should find provider by model config provider field", () => {
      const model: AiModelConfig = {
        id: "test",
        name: "Test GPT",
        displayName: "Test GPT",
        provider: "openai",
        modelId: "gpt-4",
        modelType: "TEXT" as any,
        apiKey: "test",
      };

      const provider = factory.getProviderForModel(model);

      expect(provider?.providerId).toBe("openai");
    });

    it("should find provider by model ID if provider field not matched", () => {
      const model: AiModelConfig = {
        id: "test",
        name: "Test Claude",
        displayName: "Test Claude",
        provider: "unknown",
        modelId: "claude-3-sonnet",
        modelType: "TEXT" as any,
        apiKey: "test",
      };

      const provider = factory.getProviderForModel(model);

      expect(provider?.providerId).toBe("anthropic");
    });

    it("should return undefined if no provider matches", () => {
      const model: AiModelConfig = {
        id: "test",
        name: "Unknown Model",
        displayName: "Unknown Model",
        provider: "unknown",
        modelId: "unknown-model",
        modelType: "TEXT" as any,
        apiKey: "test",
      };

      const provider = factory.getProviderForModel(model);

      expect(provider).toBeUndefined();
    });
  });

  describe("getProvidersForTaskType", () => {
    it("should get text providers for CHAT task", () => {
      const providers = factory.getProvidersForTaskType(AiTaskType.CHAT);

      expect(providers.length).toBeGreaterThan(0);
      // Should include text providers
      expect(providers.some((p) => p.providerId === "openai")).toBe(true);
      expect(providers.some((p) => p.providerId === "anthropic")).toBe(true);
      expect(providers.some((p) => p.providerId === "google-gemini")).toBe(
        true,
      );
    });

    it("should get image providers for IMAGE_GENERATION task", () => {
      const providers = factory.getProvidersForTaskType(
        AiTaskType.IMAGE_GENERATION,
      );

      expect(providers.length).toBeGreaterThan(0);
      // Should include image providers
      expect(providers.some((p) => p.providerId === "openai-dalle")).toBe(true);
      expect(providers.some((p) => p.providerId === "google-imagen")).toBe(
        true,
      );
      // Should NOT include text providers
      expect(providers.some((p) => p.providerId === "openai")).toBe(false);
    });

    it("should return empty array for unsupported task type", () => {
      // Create a fake task type that no provider supports
      const providers = factory.getProvidersForTaskType(
        "UNSUPPORTED" as AiTaskType,
      );

      expect(providers).toEqual([]);
    });
  });

  describe("getTextProviders", () => {
    it("should return all text generation providers", () => {
      const providers = factory.getTextProviders();

      expect(providers.length).toBeGreaterThanOrEqual(4); // openai, anthropic, gemini, xai
      providers.forEach((p) => {
        expect(p.supportsModel).toBeDefined();
      });
    });
  });

  describe("getImageProviders", () => {
    it("should return all image generation providers", () => {
      const providers = factory.getImageProviders();

      expect(providers.length).toBeGreaterThanOrEqual(2); // dalle, imagen
      providers.forEach((p) => {
        expect(p.supportsModel).toBeDefined();
      });
    });
  });
});
