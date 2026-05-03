/**
 * Tests for BaseImageAdapter
 */

import { BaseImageAdapter } from "../base-image.adapter";
import {
  ImageProvider,
  IMAGE_PROVIDERS,
  ImageGenerationResult,
} from "../../abstractions/image-adapter.interface";

// Concrete subclass for testing the abstract BaseImageAdapter
class TestImageAdapter extends BaseImageAdapter {
  readonly id = "test";
  readonly name = "Test Adapter";
  readonly provider: ImageProvider = IMAGE_PROVIDERS.GEMINI;
  readonly supportedModels = ["model-a", "model-b", "special-model-xyz"];
  readonly defaultModel = "model-a";

  async generate(
    _options: ImageGenerationOptions,
  ): Promise<ImageGenerationResult> {
    return {
      images: [{ url: "https://example.com/image.png", isBase64: false }],
      model: this.defaultModel,
      provider: this.provider,
    };
  }
}

describe("BaseImageAdapter", () => {
  let adapter: TestImageAdapter;

  beforeEach(() => {
    adapter = new TestImageAdapter();
  });

  // --- supportsModel ---

  describe("supportsModel", () => {
    it("returns true for exact model match", () => {
      expect(adapter.supportsModel("model-a")).toBe(true);
    });

    it("is case-insensitive for exact match", () => {
      expect(adapter.supportsModel("MODEL-A")).toBe(true);
    });

    it("returns true when request model contains a supported model substring", () => {
      // "model-a-extended" includes "model-a"
      expect(adapter.supportsModel("model-a-extended")).toBe(true);
    });

    it("returns true when supported model contains the requested model as substring", () => {
      // supported "special-model-xyz" includes "special"
      expect(adapter.supportsModel("special")).toBe(true);
    });

    it("returns false for unsupported model", () => {
      expect(adapter.supportsModel("unknown-model")).toBe(false);
    });

    it("returns true for empty string (every string includes empty)", () => {
      // The implementation uses string.includes("") which is always true
      // This is an edge case of the implementation behavior
      expect(adapter.supportsModel("")).toBe(true);
    });
  });

  // --- getModelConfig ---

  describe("getModelConfig", () => {
    it("returns undefined when no config is registered for the model", () => {
      expect(adapter.getModelConfig("model-a")).toBeUndefined();
    });

    it("returns config after registerModelConfig is called", () => {
      // Access via subclass to call protected method
      class ConfigurableAdapter extends TestImageAdapter {
        registerConfig() {
          this.registerModelConfig({
            id: "model-a",
            name: "Model A",
            maxWidth: 1024,
            maxHeight: 1024,
            supportedAspectRatios: ["1:1"],
            supportsNegativePrompt: false,
            supportsImageToImage: false,
          });
        }
      }
      const a = new ConfigurableAdapter();
      a.registerConfig();
      const config = a.getModelConfig("model-a");
      expect(config).toBeDefined();
      expect(config!.id).toBe("model-a");
      expect(config!.maxWidth).toBe(1024);
    });
  });

  // --- getEffectiveModel ---

  describe("getEffectiveModel (via generate reflection)", () => {
    it("uses defaultModel when no model is requested", () => {
      class EffectiveModelAdapter extends TestImageAdapter {
        getEffective(model?: string): string {
          return this.getEffectiveModel(model);
        }
      }
      const a = new EffectiveModelAdapter();
      expect(a.getEffective(undefined)).toBe("model-a");
    });

    it("returns requested model when it is supported", () => {
      class EffectiveModelAdapter extends TestImageAdapter {
        getEffective(model?: string): string {
          return this.getEffectiveModel(model);
        }
      }
      const a = new EffectiveModelAdapter();
      expect(a.getEffective("model-b")).toBe("model-b");
    });

    it("falls back to defaultModel when requested model is not supported", () => {
      class EffectiveModelAdapter extends TestImageAdapter {
        getEffective(model?: string): string {
          return this.getEffectiveModel(model);
        }
      }
      const a = new EffectiveModelAdapter();
      expect(a.getEffective("unsupported-xyz")).toBe("model-a");
    });
  });

  // --- calculateAspectRatio ---

  describe("calculateAspectRatio", () => {
    class AspectAdapter extends TestImageAdapter {
      calcAspect(w: number, h: number): string {
        return this.calculateAspectRatio(w, h);
      }
    }

    let a: AspectAdapter;
    beforeEach(() => {
      a = new AspectAdapter();
    });

    it("returns 1:1 for square dimensions", () => {
      expect(a.calcAspect(1024, 1024)).toBe("1:1");
    });

    it("returns 16:9 for wide landscape (ratio >= 1.7)", () => {
      expect(a.calcAspect(1920, 1080)).toBe("16:9");
    });

    it("returns 4:3 for moderate landscape (ratio >= 1.3)", () => {
      expect(a.calcAspect(1333, 1000)).toBe("4:3");
    });

    it("returns 3:2 for slight landscape (ratio < 1.3)", () => {
      // 1200/1000 = 1.2, which is < 1.3 and > 1.0 → 3:2
      expect(a.calcAspect(1200, 1000)).toBe("3:2");
    });

    it("returns 9:16 for tall portrait (ratio >= 1.7)", () => {
      expect(a.calcAspect(1080, 1920)).toBe("9:16");
    });

    it("returns 3:4 for moderate portrait (ratio >= 1.3)", () => {
      expect(a.calcAspect(1000, 1333)).toBe("3:4");
    });

    it("returns 2:3 for slight portrait (ratio < 1.3)", () => {
      // 1200/1000 = 1.2, which is < 1.3 → 2:3
      expect(a.calcAspect(1000, 1200)).toBe("2:3");
    });
  });

  // --- getDefaultDimensions ---

  describe("getDefaultDimensions", () => {
    it("returns 1024x1024 default", () => {
      class DimAdapter extends TestImageAdapter {
        getDims() {
          return this.getDefaultDimensions();
        }
      }
      const a = new DimAdapter();
      expect(a.getDims()).toEqual({ width: 1024, height: 1024 });
    });
  });

  // --- imageToImage optional method ---

  it("does not implement imageToImage by default", () => {
    expect(adapter.imageToImage).toBeUndefined();
  });
});

