/**
 * Tests for TogetherImageAdapter
 */

import { of } from "rxjs";
import { TogetherImageAdapter } from "../together-image.adapter";
import {
  IMAGE_MODELS,
  IMAGE_PROVIDERS,
} from "../../abstractions/image-adapter.interface";

const mockPost = jest.fn();
const mockHttpService = { post: mockPost };

describe("TogetherImageAdapter", () => {
  let adapter: TogetherImageAdapter;

  beforeEach(() => {
    mockPost.mockReset();
    adapter = new TogetherImageAdapter(mockHttpService as any);
    adapter.setApiKey("together-test-key");
  });

  // --- basic properties ---

  it("has correct id, name, and provider", () => {
    expect(adapter.id).toBe("together");
    expect(adapter.name).toBe("Together AI");
    expect(adapter.provider).toBe(IMAGE_PROVIDERS.TOGETHER);
  });

  it("default model is FLUX_SCHNELL", () => {
    expect(adapter.defaultModel).toBe(IMAGE_MODELS.FLUX_SCHNELL);
  });

  it("supports FLUX models", () => {
    expect(adapter.supportsModel(IMAGE_MODELS.FLUX_SCHNELL)).toBe(true);
    expect(adapter.supportsModel(IMAGE_MODELS.FLUX_PRO)).toBe(true);
    expect(adapter.supportsModel("black-forest-labs/FLUX.1-schnell")).toBe(
      true,
    );
  });

  it("registers model configs", () => {
    const schnell = adapter.getModelConfig(IMAGE_MODELS.FLUX_SCHNELL);
    expect(schnell).toBeDefined();
    expect(schnell!.supportsNegativePrompt).toBe(false);

    const pro = adapter.getModelConfig(IMAGE_MODELS.FLUX_PRO);
    expect(pro).toBeDefined();
    expect(pro!.supportsImageToImage).toBe(true);
  });

  // --- API key guard ---

  it("throws when API key not configured", async () => {
    const fresh = new TogetherImageAdapter(mockHttpService as any);
    await expect(fresh.generate({ prompt: "test" })).rejects.toThrow(
      "Together API key not configured",
    );
  });

  // --- generate with URL response ---

  it("calls together API and returns URL-based images", async () => {
    mockPost.mockReturnValue(
      of({
        data: {
          data: [{ url: "https://together.ai/images/output.png" }],
        },
      }),
    );

    const result = await adapter.generate({ prompt: "a dragon" });

    expect(mockPost).toHaveBeenCalledWith(
      "https://api.together.xyz/v1/images/generations",
      expect.objectContaining({
        model: IMAGE_MODELS.FLUX_SCHNELL,
        prompt: "a dragon",
        width: 1024,
        height: 1024,
        n: 1,
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer together-test-key",
        }),
      }),
    );
    expect(result.images).toHaveLength(1);
    expect(result.images[0].url).toBe("https://together.ai/images/output.png");
    expect(result.images[0].isBase64).toBe(false);
    expect(result.provider).toBe(IMAGE_PROVIDERS.TOGETHER);
  });

  // --- generate with base64 response ---

  it("handles b64_json images in response", async () => {
    mockPost.mockReturnValue(
      of({
        data: {
          data: [{ b64_json: "base64imagedata" }],
        },
      }),
    );

    const result = await adapter.generate({ prompt: "test" });

    expect(result.images[0].isBase64).toBe(true);
    expect(result.images[0].url).toBe("data:image/png;base64,base64imagedata");
    expect(result.images[0].mimeType).toBe("image/png");
  });

  it("handles mixed URL and base64 images in same response", async () => {
    mockPost.mockReturnValue(
      of({
        data: {
          data: [
            { b64_json: "b64data" },
            { url: "https://example.com/img.png" },
          ],
        },
      }),
    );

    const result = await adapter.generate({ prompt: "test" });

    expect(result.images).toHaveLength(2);
    expect(result.images[0].isBase64).toBe(true);
    expect(result.images[1].isBase64).toBe(false);
  });

  it("throws when response contains no images", async () => {
    mockPost.mockReturnValue(of({ data: { data: [] } }));
    await expect(adapter.generate({ prompt: "test" })).rejects.toThrow(
      "No images in Together response",
    );
  });

  // --- dimensions ---

  it("uses provided dimensions in request", async () => {
    mockPost.mockReturnValue(
      of({ data: { data: [{ url: "https://example.com/img.png" }] } }),
    );
    await adapter.generate({ prompt: "test", width: 768, height: 512 });

    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ width: 768, height: 512 }),
      expect.any(Object),
    );
  });

  it("defaults to 1024x1024 when dimensions not specified", async () => {
    mockPost.mockReturnValue(
      of({ data: { data: [{ url: "https://example.com/img.png" }] } }),
    );
    await adapter.generate({ prompt: "test" });

    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ width: 1024, height: 1024 }),
      expect.any(Object),
    );
  });

  // --- count ---

  it("passes count as n parameter", async () => {
    mockPost.mockReturnValue(
      of({ data: { data: [{ url: "https://example.com/img.png" }] } }),
    );
    await adapter.generate({ prompt: "test", count: 4 });

    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ n: 4 }),
      expect.any(Object),
    );
  });

  // --- model selection ---

  it("uses FLUX_PRO model when specified", async () => {
    mockPost.mockReturnValue(
      of({ data: { data: [{ url: "https://example.com/img.png" }] } }),
    );
    await adapter.generate({ prompt: "test", model: IMAGE_MODELS.FLUX_PRO });

    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ model: IMAGE_MODELS.FLUX_PRO }),
      expect.any(Object),
    );
  });
});

