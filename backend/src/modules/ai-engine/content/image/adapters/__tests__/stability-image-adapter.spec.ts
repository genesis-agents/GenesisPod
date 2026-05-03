/**
 * Tests for StabilityImageAdapter
 */

import { of } from "rxjs";
import { StabilityImageAdapter } from "../stability-image.adapter";
import {
  IMAGE_MODELS,
  IMAGE_PROVIDERS,
} from "../../abstractions/image-adapter.interface";

const mockPost = jest.fn();
const mockHttpService = { post: mockPost };

describe("StabilityImageAdapter", () => {
  let adapter: StabilityImageAdapter;

  beforeEach(() => {
    mockPost.mockReset();
    adapter = new StabilityImageAdapter(mockHttpService as any);
    adapter.setApiKey("sk-stability-test");
  });

  // --- basic properties ---

  it("has correct id, name, and provider", () => {
    expect(adapter.id).toBe("stability");
    expect(adapter.name).toBe("Stability AI");
    expect(adapter.provider).toBe(IMAGE_PROVIDERS.STABILITY);
  });

  it("default model is SDXL", () => {
    expect(adapter.defaultModel).toBe(IMAGE_MODELS.SDXL);
  });

  it("supports SDXL and SD3 models", () => {
    expect(adapter.supportsModel(IMAGE_MODELS.SDXL)).toBe(true);
    expect(adapter.supportsModel(IMAGE_MODELS.SD3)).toBe(true);
    expect(adapter.supportsModel("stable-diffusion-xl-1024-v1-0")).toBe(true);
  });

  it("registers model configs with correct properties", () => {
    const sdxl = adapter.getModelConfig(IMAGE_MODELS.SDXL);
    expect(sdxl).toBeDefined();
    expect(sdxl!.supportsNegativePrompt).toBe(true);
    expect(sdxl!.supportsImageToImage).toBe(true);

    const sd3 = adapter.getModelConfig(IMAGE_MODELS.SD3);
    expect(sd3).toBeDefined();
    expect(sd3!.maxWidth).toBe(1536);
  });

  // --- API key guard ---

  it("throws when API key not configured", async () => {
    const fresh = new StabilityImageAdapter(mockHttpService as any);
    await expect(fresh.generate({ prompt: "test" })).rejects.toThrow(
      "Stability API key not configured",
    );
  });

  // --- generate ---

  it("calls text-to-image endpoint and returns base64 images", async () => {
    mockPost.mockReturnValue(
      of({
        data: {
          artifacts: [{ base64: "artifact1base64", finishReason: "SUCCESS" }],
        },
      }),
    );

    const result = await adapter.generate({ prompt: "a mountain landscape" });

    expect(mockPost).toHaveBeenCalledWith(
      expect.stringContaining("text-to-image"),
      expect.objectContaining({
        text_prompts: [{ text: "a mountain landscape", weight: 1 }],
        cfg_scale: 7,
        steps: 30,
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-stability-test",
        }),
      }),
    );
    expect(result.images).toHaveLength(1);
    expect(result.images[0].isBase64).toBe(true);
    expect(result.images[0].url).toBe("data:image/png;base64,artifact1base64");
    expect(result.images[0].mimeType).toBe("image/png");
    expect(result.provider).toBe(IMAGE_PROVIDERS.STABILITY);
  });

  it("appends negative prompt with weight -1 when provided", async () => {
    mockPost.mockReturnValue(of({ data: { artifacts: [{ base64: "xyz" }] } }));

    await adapter.generate({
      prompt: "a dog",
      negativePrompt: "cat, blurry",
    });

    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text_prompts: [
          { text: "a dog", weight: 1 },
          { text: "cat, blurry", weight: -1 },
        ],
      }),
      expect.any(Object),
    );
  });

  it("throws when API response has no artifacts", async () => {
    mockPost.mockReturnValue(of({ data: { artifacts: [] } }));
    await expect(adapter.generate({ prompt: "test" })).rejects.toThrow(
      "No artifacts in Stability response",
    );
  });

  // --- dimension rounding to multiple of 64 ---

  it("rounds dimensions to nearest multiple of 64", async () => {
    mockPost.mockReturnValue(of({ data: { artifacts: [{ base64: "x" }] } }));
    await adapter.generate({ prompt: "test", width: 1000, height: 700 });

    // 1000 / 64 = 15.625 -> round to 16 -> 1024
    // 700 / 64 = 10.9375 -> round to 11 -> 704
    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ width: 1024, height: 704 }),
      expect.any(Object),
    );
  });

  it("keeps exact multiples of 64 unchanged", async () => {
    mockPost.mockReturnValue(of({ data: { artifacts: [{ base64: "x" }] } }));
    await adapter.generate({ prompt: "test", width: 1024, height: 512 });

    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ width: 1024, height: 512 }),
      expect.any(Object),
    );
  });

  // --- setBaseUrl ---

  it("uses custom base URL when set", async () => {
    adapter.setBaseUrl("https://proxy.stability.ai/v1");
    mockPost.mockReturnValue(of({ data: { artifacts: [{ base64: "x" }] } }));
    await adapter.generate({ prompt: "test" });

    expect(mockPost).toHaveBeenCalledWith(
      expect.stringContaining("https://proxy.stability.ai/v1"),
      expect.any(Object),
      expect.any(Object),
    );
  });

  // --- count option ---

  it("passes count as samples parameter", async () => {
    mockPost.mockReturnValue(of({ data: { artifacts: [{ base64: "x" }] } }));
    await adapter.generate({ prompt: "test", count: 2 });

    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ samples: 2 }),
      expect.any(Object),
    );
  });

  // --- model routing ---

  it("includes model in the URL path", async () => {
    mockPost.mockReturnValue(of({ data: { artifacts: [{ base64: "x" }] } }));
    await adapter.generate({ prompt: "test", model: IMAGE_MODELS.SD3 });

    expect(mockPost).toHaveBeenCalledWith(
      expect.stringContaining(IMAGE_MODELS.SD3),
      expect.any(Object),
      expect.any(Object),
    );
  });
});

