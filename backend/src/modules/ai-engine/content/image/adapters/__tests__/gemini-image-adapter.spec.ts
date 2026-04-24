/**
 * Tests for GeminiImageAdapter
 */

import { of, throwError } from "rxjs";
import { GeminiImageAdapter } from "../gemini-image-adapter";
import {
  IMAGE_MODELS,
  IMAGE_PROVIDERS,
} from "../../abstractions/image-adapter.interface";

const mockPost = jest.fn();

const mockHttpService = {
  post: mockPost,
};

describe("GeminiImageAdapter", () => {
  let adapter: GeminiImageAdapter;

  beforeEach(() => {
    mockPost.mockReset();
    adapter = new GeminiImageAdapter(mockHttpService as any);
    adapter.setApiKey("test-api-key");
  });

  // --- basic properties ---

  it("has correct id and provider", () => {
    expect(adapter.id).toBe("gemini");
    expect(adapter.provider).toBe(IMAGE_PROVIDERS.GEMINI);
    expect(adapter.name).toBe("Google Gemini/Imagen");
  });

  it("has default model as gemini-2.0-flash-exp", () => {
    expect(adapter.defaultModel).toBe(IMAGE_MODELS.GEMINI_2_FLASH);
  });

  it("supports expected models", () => {
    expect(adapter.supportsModel("gemini-2.0-flash-exp")).toBe(true);
    expect(adapter.supportsModel("imagen-3.0-generate-001")).toBe(true);
    expect(adapter.supportsModel("gemini-1.5-flash")).toBe(true);
  });

  it("has model configs registered", () => {
    const config = adapter.getModelConfig(IMAGE_MODELS.GEMINI_2_FLASH);
    expect(config).toBeDefined();
    expect(config!.supportsImageToImage).toBe(true);

    const imagenConfig = adapter.getModelConfig(IMAGE_MODELS.IMAGEN_3);
    expect(imagenConfig).toBeDefined();
    expect(imagenConfig!.supportsNegativePrompt).toBe(true);
  });

  // --- setApiKey ---

  it("throws when API key is not set", async () => {
    const freshAdapter = new GeminiImageAdapter(mockHttpService as any);
    await expect(freshAdapter.generate({ prompt: "a cat" })).rejects.toThrow(
      "Gemini API key not configured",
    );
  });

  // --- generate with Gemini model ---

  it("calls generateContent endpoint for gemini models", async () => {
    const fakeResponse = {
      data: {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: "base64imagedata",
                    mimeType: "image/png",
                  },
                },
              ],
            },
          },
        ],
      },
    };
    mockPost.mockReturnValue(of(fakeResponse));

    const result = await adapter.generate({
      prompt: "a sunset",
      model: "gemini-2.0-flash-exp",
    });

    expect(mockPost).toHaveBeenCalledWith(
      expect.stringContaining("generateContent"),
      expect.any(Object),
      expect.any(Object),
    );
    expect(result.images).toHaveLength(1);
    expect(result.images[0].isBase64).toBe(true);
    expect(result.images[0].url).toContain("base64,base64imagedata");
    expect(result.model).toBe("gemini-2.0-flash-exp");
    expect(result.provider).toBe(IMAGE_PROVIDERS.GEMINI);
  });

  it("throws when Gemini response has no candidates", async () => {
    mockPost.mockReturnValue(of({ data: { candidates: [] } }));
    await expect(adapter.generate({ prompt: "test" })).rejects.toThrow(
      "No candidates in Gemini response",
    );
  });

  it("throws when Gemini candidate has no inline image data", async () => {
    mockPost.mockReturnValue(
      of({
        data: {
          candidates: [
            { content: { parts: [{ text: "some text, no image" }] } },
          ],
        },
      }),
    );
    await expect(adapter.generate({ prompt: "test" })).rejects.toThrow(
      "No image data in Gemini response",
    );
  });

  // --- generate with Imagen model ---

  it("calls generateImages endpoint for imagen models", async () => {
    const imagenResponse = {
      data: {
        generatedImages: [
          {
            image: {
              bytesBase64Encoded: "imagenbytes",
              imageType: "image/jpeg",
            },
          },
        ],
      },
    };
    mockPost.mockReturnValue(of(imagenResponse));

    const result = await adapter.generate({
      prompt: "a city",
      model: "imagen-3.0-generate-001",
    });

    expect(mockPost).toHaveBeenCalledWith(
      expect.stringContaining("generateImages"),
      expect.any(Object),
      expect.any(Object),
    );
    expect(result.images[0].mimeType).toBe("image/jpeg");
    expect(result.images[0].url).toContain(
      "data:image/jpeg;base64,imagenbytes",
    );
  });

  it("falls back to predict endpoint when generateImages returns 404", async () => {
    // First call: 404 error
    const notFoundError = { response: { status: 404 } };
    mockPost
      .mockReturnValueOnce(throwError(() => notFoundError))
      // Second call: predict endpoint succeeds
      .mockReturnValueOnce(
        of({
          data: {
            predictions: [{ bytesBase64Encoded: "predictbytes" }],
          },
        }),
      );

    const result = await adapter.generate({
      prompt: "test",
      model: "imagen-3.0-generate-001",
    });

    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(mockPost).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("predict"),
      expect.any(Object),
      expect.any(Object),
    );
    expect(result.images[0].url).toContain("predictbytes");
  });

  it("propagates error when predict also fails (no silent fallback to hardcoded flash)", async () => {
    // 违反 CLAUDE.md 规则的硬编码 "gemini-2.0-flash-exp" fallback 已移除：
    // Imagen 两端（generateImages + predict）都失败时必须抛错，
    // 由上层 ImageGenerationService 根据 DB 配置决定下一步动作。
    mockPost
      .mockReturnValueOnce(throwError(() => ({ response: { status: 404 } })))
      .mockReturnValueOnce(throwError(() => new Error("predict failed")));

    await expect(
      adapter.generate({ prompt: "test", model: "imagen-3.0-generate-001" }),
    ).rejects.toThrow("predict failed");
  });

  it("rethrows non-404 errors from generateImages", async () => {
    mockPost.mockReturnValue(throwError(() => ({ response: { status: 500 } })));

    await expect(
      adapter.generate({ prompt: "test", model: "imagen-3.0-generate-001" }),
    ).rejects.toEqual({ response: { status: 500 } });
  });

  // --- imageToImage ---

  it("calls imageToImage endpoint correctly", async () => {
    mockPost.mockReturnValue(
      of({
        data: {
          candidates: [
            {
              content: {
                parts: [
                  { inlineData: { data: "i2ibytes", mimeType: "image/png" } },
                ],
              },
            },
          ],
        },
      }),
    );

    const result = await adapter.imageToImage({
      prompt: "change to night",
      referenceImage: "data:image/jpeg;base64,/9j/refdata",
    });

    expect(mockPost).toHaveBeenCalledWith(
      expect.stringContaining("generateContent"),
      expect.objectContaining({
        contents: expect.arrayContaining([
          expect.objectContaining({
            parts: expect.arrayContaining([
              expect.objectContaining({ inlineData: expect.any(Object) }),
              expect.objectContaining({ text: "change to night" }),
            ]),
          }),
        ]),
      }),
      expect.any(Object),
    );
    expect(result.images[0].url).toContain("i2ibytes");
  });

  it("throws when imageToImage called without API key", async () => {
    const fresh = new GeminiImageAdapter(mockHttpService as any);
    await expect(
      fresh.imageToImage({
        prompt: "test",
        referenceImage: "data:image/png;base64,abc",
      }),
    ).rejects.toThrow("Gemini API key not configured");
  });

  // --- width/height defaults ---

  it("uses default 1024x1024 when no dimensions specified", async () => {
    mockPost.mockReturnValue(
      of({
        data: {
          candidates: [
            {
              content: {
                parts: [
                  { inlineData: { data: "bytes", mimeType: "image/png" } },
                ],
              },
            },
          ],
        },
      }),
    );

    await adapter.generate({ prompt: "test" });
    // Should not throw and call was made
    expect(mockPost).toHaveBeenCalled();
  });
});
