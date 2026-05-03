/**
 * Tests for ImageFactory
 */

import { ImageFactory } from "../image.factory";
import {
  IImageAdapter,
  IMAGE_PROVIDERS,
  IMAGE_MODELS,
  ImageGenerationResult,
  ImageProvider,
} from "../../abstractions/image-adapter.interface";

// Helper to build a mock adapter
function buildMockAdapter(
  id: string,
  provider: ImageProvider,
  models: string[],
): jest.Mocked<IImageAdapter> {
  return {
    id,
    name: `${id} Adapter`,
    provider,
    supportedModels: models,
    defaultModel: models[0],
    generate: jest.fn(),
    supportsModel: jest.fn((model: string) =>
      models.some(
        (m) =>
          m.toLowerCase() === model.toLowerCase() ||
          model.toLowerCase().includes(m.toLowerCase()) ||
          m.toLowerCase().includes(model.toLowerCase()),
      ),
    ),
    getModelConfig: jest.fn().mockReturnValue(undefined),
  };
}

describe("ImageFactory", () => {
  let factory: ImageFactory;

  beforeEach(() => {
    factory = new ImageFactory();
  });

  // --- registerAdapter / getAdapter ---

  it("registers an adapter and retrieves it by id", () => {
    const adapter = buildMockAdapter("gemini", IMAGE_PROVIDERS.GEMINI, [
      "gemini-2.0-flash-exp",
    ]);
    factory.registerAdapter(adapter);
    expect(factory.getAdapter("gemini")).toBe(adapter);
  });

  it("returns undefined when adapter not registered", () => {
    expect(factory.getAdapter("nonexistent")).toBeUndefined();
  });

  it("returns default provider adapter when no id provided", () => {
    const geminiAdapter = buildMockAdapter("gemini", IMAGE_PROVIDERS.GEMINI, [
      "gemini-2.0-flash-exp",
    ]);
    factory.registerAdapter(geminiAdapter);
    factory.initialize({ defaultProvider: IMAGE_PROVIDERS.GEMINI });
    expect(factory.getAdapter()).toBe(geminiAdapter);
  });

  // --- getAdapterForModel ---

  it("finds adapter that supports the given model", () => {
    const openaiAdapter = buildMockAdapter("openai", IMAGE_PROVIDERS.OPENAI, [
      "dall-e-3",
      "dall-e-2",
    ]);
    factory.registerAdapter(openaiAdapter);
    const found = factory.getAdapterForModel("dall-e-3");
    expect(found).toBe(openaiAdapter);
  });

  it("returns undefined when no adapter supports the model", () => {
    const openaiAdapter = buildMockAdapter("openai", IMAGE_PROVIDERS.OPENAI, [
      "dall-e-3",
    ]);
    factory.registerAdapter(openaiAdapter);
    expect(factory.getAdapterForModel("unknown-model-xyz")).toBeUndefined();
  });

  // --- initialize ---

  it("sets default provider and model via initialize", () => {
    factory.initialize({
      defaultProvider: IMAGE_PROVIDERS.OPENAI,
      defaultModel: IMAGE_MODELS.DALLE_3,
    });
    expect(factory.getDefaultModel()).toBe(IMAGE_MODELS.DALLE_3);
  });

  it("stores provider configs via initialize", () => {
    factory.initialize({
      providers: {
        [IMAGE_PROVIDERS.GEMINI]: { apiKey: "gemini-key", enabled: true },
      } as any,
    });
    const config = factory.getProviderConfig(IMAGE_PROVIDERS.GEMINI);
    expect(config).toBeDefined();
    expect(config!.apiKey).toBe("gemini-key");
  });

  // --- generate ---

  it("generate calls adapter.generate and sets duration", async () => {
    const mockResult: ImageGenerationResult = {
      images: [{ url: "https://example.com/img.png", isBase64: false }],
      model: "gemini-2.0-flash-exp",
      provider: IMAGE_PROVIDERS.GEMINI,
    };
    const adapter = buildMockAdapter("gemini", IMAGE_PROVIDERS.GEMINI, [
      "gemini-2.0-flash-exp",
    ]);
    (adapter.generate as jest.Mock).mockResolvedValue(mockResult);
    factory.registerAdapter(adapter);
    factory.initialize({ defaultProvider: IMAGE_PROVIDERS.GEMINI });

    const result = await factory.generate({ prompt: "a landscape" });

    expect(adapter.generate).toHaveBeenCalledWith({ prompt: "a landscape" });
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result.images).toHaveLength(1);
  });

  it("generate routes to correct adapter by model", async () => {
    const openaiAdapter = buildMockAdapter("openai", IMAGE_PROVIDERS.OPENAI, [
      "dall-e-3",
    ]);
    (openaiAdapter.generate as jest.Mock).mockResolvedValue({
      images: [{ url: "https://example.com/dalle.png", isBase64: false }],
      model: "dall-e-3",
      provider: IMAGE_PROVIDERS.OPENAI,
    });
    factory.registerAdapter(openaiAdapter);

    const result = await factory.generate({
      prompt: "test",
      model: "dall-e-3",
    });
    expect(openaiAdapter.generate).toHaveBeenCalled();
    expect(result.provider).toBe(IMAGE_PROVIDERS.OPENAI);
  });

  it("throws when no adapter available for generate", async () => {
    await expect(factory.generate({ prompt: "test" })).rejects.toThrow(
      "No image adapter available",
    );
  });

  // --- imageToImage ---

  it("imageToImage delegates to adapter and sets duration", async () => {
    const mockResult: ImageGenerationResult = {
      images: [{ url: "data:image/png;base64,abc", isBase64: true }],
      model: "gemini-2.0-flash-exp",
      provider: IMAGE_PROVIDERS.GEMINI,
    };
    const adapter = buildMockAdapter("gemini", IMAGE_PROVIDERS.GEMINI, [
      "gemini-2.0-flash-exp",
    ]);
    (adapter as any).imageToImage = jest.fn().mockResolvedValue(mockResult);
    factory.registerAdapter(adapter);
    factory.initialize({ defaultProvider: IMAGE_PROVIDERS.GEMINI });

    const result = await factory.imageToImage({
      prompt: "change style",
      referenceImage: "data:image/jpeg;base64,ref",
    });

    expect((adapter as any).imageToImage).toHaveBeenCalled();
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it("throws when no adapter available for imageToImage", async () => {
    await expect(
      factory.imageToImage({
        prompt: "test",
        referenceImage: "data:image/png;base64,abc",
      }),
    ).rejects.toThrow("No image adapter available");
  });

  it("throws when adapter does not support imageToImage", async () => {
    const adapter = buildMockAdapter("openai", IMAGE_PROVIDERS.OPENAI, [
      "dall-e-3",
    ]);
    // No imageToImage method
    factory.registerAdapter(adapter);
    factory.initialize({ defaultProvider: IMAGE_PROVIDERS.OPENAI });

    await expect(
      factory.imageToImage({
        prompt: "test",
        referenceImage: "data:image/png;base64,abc",
      }),
    ).rejects.toThrow("Image-to-image not supported by adapter");
  });

  // --- getAllAdapters / getSupportedModels ---

  it("getAllAdapters returns all registered adapters", () => {
    const a1 = buildMockAdapter("gemini", IMAGE_PROVIDERS.GEMINI, ["m1"]);
    const a2 = buildMockAdapter("openai", IMAGE_PROVIDERS.OPENAI, ["m2"]);
    factory.registerAdapter(a1);
    factory.registerAdapter(a2);
    expect(factory.getAllAdapters()).toHaveLength(2);
  });

  it("getSupportedModels returns deduplicated model list", () => {
    const a1 = buildMockAdapter("gemini", IMAGE_PROVIDERS.GEMINI, [
      "model-x",
      "model-y",
    ]);
    const a2 = buildMockAdapter("openai", IMAGE_PROVIDERS.OPENAI, [
      "model-y",
      "model-z",
    ]);
    factory.registerAdapter(a1);
    factory.registerAdapter(a2);
    const models = factory.getSupportedModels();
    expect(models).toContain("model-x");
    expect(models).toContain("model-y");
    expect(models).toContain("model-z");
    // model-y should appear only once
    expect(models.filter((m) => m === "model-y")).toHaveLength(1);
  });

  // --- setDefaultModel / getDefaultModel ---

  it("setDefaultModel updates the default model", () => {
    factory.setDefaultModel(IMAGE_MODELS.DALLE_3);
    expect(factory.getDefaultModel()).toBe(IMAGE_MODELS.DALLE_3);
  });

  // --- isProviderAvailable / getAvailableProviders ---

  it("isProviderAvailable returns false when provider not configured", () => {
    expect(factory.isProviderAvailable(IMAGE_PROVIDERS.OPENAI)).toBe(false);
  });

  it("isProviderAvailable returns false when enabled is false", () => {
    factory.initialize({
      providers: {
        [IMAGE_PROVIDERS.OPENAI]: { apiKey: "key", enabled: false },
      } as any,
    });
    expect(factory.isProviderAvailable(IMAGE_PROVIDERS.OPENAI)).toBe(false);
  });

  it("isProviderAvailable returns false when apiKey is missing", () => {
    factory.initialize({
      providers: {
        [IMAGE_PROVIDERS.OPENAI]: { enabled: true },
      } as any,
    });
    expect(factory.isProviderAvailable(IMAGE_PROVIDERS.OPENAI)).toBe(false);
  });

  it("isProviderAvailable returns true when enabled and apiKey provided", () => {
    factory.initialize({
      providers: {
        [IMAGE_PROVIDERS.OPENAI]: { apiKey: "sk-test", enabled: true },
      } as any,
    });
    expect(factory.isProviderAvailable(IMAGE_PROVIDERS.OPENAI)).toBe(true);
  });

  it("getAvailableProviders returns only providers with apiKey and enabled", () => {
    factory.initialize({
      providers: {
        [IMAGE_PROVIDERS.OPENAI]: { apiKey: "sk-test", enabled: true },
        [IMAGE_PROVIDERS.GEMINI]: { enabled: false },
      } as any,
    });
    const available = factory.getAvailableProviders();
    expect(available).toContain(IMAGE_PROVIDERS.OPENAI);
    expect(available).not.toContain(IMAGE_PROVIDERS.GEMINI);
  });
});

