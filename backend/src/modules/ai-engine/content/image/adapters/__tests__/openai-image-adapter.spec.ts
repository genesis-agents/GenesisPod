/**
 * Tests for OpenAIImageAdapter
 */

import { of } from "rxjs";
import { OpenAIImageAdapter } from "../openai-image.adapter";
import {
  IMAGE_MODELS,
  IMAGE_PROVIDERS,
} from "../../abstractions/image-adapter.interface";

const mockPost = jest.fn();
const mockHttpService = { post: mockPost };

describe("OpenAIImageAdapter", () => {
  let adapter: OpenAIImageAdapter;

  beforeEach(() => {
    mockPost.mockReset();
    adapter = new OpenAIImageAdapter(mockHttpService as any);
    adapter.setApiKey("sk-test-key");
  });

  // --- basic properties ---

  it("has correct id, name, and provider", () => {
    expect(adapter.id).toBe("openai");
    expect(adapter.name).toBe("OpenAI DALL-E");
    expect(adapter.provider).toBe(IMAGE_PROVIDERS.OPENAI);
  });

  it("default model is dall-e-3", () => {
    expect(adapter.defaultModel).toBe(IMAGE_MODELS.DALLE_3);
  });

  it("supports dall-e-3 and dall-e-2", () => {
    expect(adapter.supportsModel("dall-e-3")).toBe(true);
    expect(adapter.supportsModel("dall-e-2")).toBe(true);
  });

  it("registers model configs for DALL-E 3 and DALL-E 2", () => {
    const dalle3 = adapter.getModelConfig(IMAGE_MODELS.DALLE_3);
    expect(dalle3).toBeDefined();
    expect(dalle3!.supportsImageToImage).toBe(false);

    const dalle2 = adapter.getModelConfig(IMAGE_MODELS.DALLE_2);
    expect(dalle2).toBeDefined();
    expect(dalle2!.supportsImageToImage).toBe(true);
  });

  // --- API key guard ---

  it("throws when API key not configured", async () => {
    const fresh = new OpenAIImageAdapter(mockHttpService as any);
    await expect(fresh.generate({ prompt: "test" })).rejects.toThrow(
      "OpenAI API key not configured",
    );
  });

  // --- generate ---

  it("calls images/generations endpoint and returns images", async () => {
    mockPost.mockReturnValue(
      of({
        data: {
          data: [
            {
              url: "https://oaidalleapiprodscus.blob.core.windows.net/img1.png",
              revised_prompt: "revised",
            },
          ],
        },
      }),
    );

    const result = await adapter.generate({ prompt: "a futuristic city" });

    expect(mockPost).toHaveBeenCalledWith(
      expect.stringContaining("/images/generations"),
      expect.objectContaining({
        model: IMAGE_MODELS.DALLE_3,
        prompt: "a futuristic city",
        quality: "hd",
        response_format: "url",
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test-key",
        }),
      }),
    );
    expect(result.images).toHaveLength(1);
    expect(result.images[0].url).toContain("img1.png");
    expect(result.images[0].isBase64).toBe(false);
    expect(result.images[0].revisedPrompt).toBe("revised");
    expect(result.provider).toBe(IMAGE_PROVIDERS.OPENAI);
  });

  it("throws when API response contains no images", async () => {
    mockPost.mockReturnValue(of({ data: { data: [] } }));
    await expect(adapter.generate({ prompt: "test" })).rejects.toThrow(
      "No images in OpenAI response",
    );
  });

  // --- size selection ---

  it("uses 1024x1024 for square dimensions", async () => {
    mockPost.mockReturnValue(
      of({ data: { data: [{ url: "https://example.com/img.png" }] } }),
    );
    await adapter.generate({ prompt: "test", width: 1024, height: 1024 });

    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ size: "1024x1024" }),
      expect.any(Object),
    );
  });

  it("uses 1792x1024 for landscape dimensions", async () => {
    mockPost.mockReturnValue(
      of({ data: { data: [{ url: "https://example.com/img.png" }] } }),
    );
    await adapter.generate({ prompt: "test", width: 1792, height: 1024 });

    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ size: "1792x1024" }),
      expect.any(Object),
    );
  });

  it("uses 1024x1792 for portrait dimensions", async () => {
    mockPost.mockReturnValue(
      of({ data: { data: [{ url: "https://example.com/img.png" }] } }),
    );
    await adapter.generate({ prompt: "test", width: 1024, height: 1792 });

    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ size: "1024x1792" }),
      expect.any(Object),
    );
  });

  it("always uses 1024x1024 for DALL-E 2 regardless of dimensions", async () => {
    mockPost.mockReturnValue(
      of({ data: { data: [{ url: "https://example.com/img.png" }] } }),
    );
    await adapter.generate({
      prompt: "test",
      model: IMAGE_MODELS.DALLE_2,
      width: 512,
      height: 512,
    });

    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ size: "1024x1024" }),
      expect.any(Object),
    );
  });

  // --- setBaseUrl ---

  it("uses custom base URL when set", async () => {
    adapter.setBaseUrl("https://custom.openai.proxy.com/v1");
    mockPost.mockReturnValue(
      of({ data: { data: [{ url: "https://example.com/img.png" }] } }),
    );
    await adapter.generate({ prompt: "test" });

    expect(mockPost).toHaveBeenCalledWith(
      "https://custom.openai.proxy.com/v1/images/generations",
      expect.any(Object),
      expect.any(Object),
    );
  });

  // --- count option ---

  it("passes count option as n parameter", async () => {
    mockPost.mockReturnValue(
      of({ data: { data: [{ url: "https://example.com/img.png" }] } }),
    );
    await adapter.generate({ prompt: "test", count: 3 });

    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ n: 3 }),
      expect.any(Object),
    );
  });

  // --- timeout option ---

  it("uses provided timeout", async () => {
    mockPost.mockReturnValue(
      of({ data: { data: [{ url: "https://example.com/img.png" }] } }),
    );
    await adapter.generate({ prompt: "test", timeout: 30000 });

    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({ timeout: 30000 }),
    );
  });
});

