/**
 * Test script to check which Gemini models support image generation
 * Run with: npx ts-node src/scripts/test-gemini-image.ts
 */

const GOOGLE_API_KEY = process.env.GOOGLE_AI_API_KEY;

if (!GOOGLE_API_KEY) {
  console.error("Error: GOOGLE_AI_API_KEY environment variable is not set");
  console.log(
    "Usage: GOOGLE_AI_API_KEY=your_key npx ts-node src/scripts/test-gemini-image.ts",
  );
  process.exit(1);
}

// Models to test for image generation
const MODELS_TO_TEST = [
  "gemini-2.0-flash-exp",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-pro",
  "gemini-pro-vision",
  // Gemini 2.5 models
  "gemini-2.5-flash-preview-05-20",
  "gemini-2.5-pro-preview-05-06",
  // Image generation specific models
  "imagen-3.0-generate-001",
  "imagen-3.0-fast-generate-001",
  "imagen-4.0-generate-001",
  "imagen-4.0-ultra-generate-001",
];

async function testModelImageGeneration(modelId: string): Promise<{
  model: string;
  supportsImage: boolean;
  error?: string;
  responseType?: string;
}> {
  const isImagen = modelId.includes("imagen");

  try {
    let url: string;
    let body: any;
    const headers: any = {
      "Content-Type": "application/json",
    };

    if (isImagen) {
      // Imagen API format
      url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:predict`;
      headers["x-goog-api-key"] = GOOGLE_API_KEY;
      body = {
        instances: [{ prompt: "A red apple on a white background" }],
        parameters: { sampleCount: 1 },
      };
    } else {
      // Gemini API format with image generation
      url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${GOOGLE_API_KEY}`;
      body = {
        contents: [
          {
            role: "user",
            parts: [{ text: "Generate an image of a red apple" }],
          },
        ],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          maxOutputTokens: 1024,
        },
      };
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        model: modelId,
        supportsImage: false,
        error: data.error?.message || `HTTP ${response.status}`,
      };
    }

    // Check if response contains image
    if (isImagen) {
      const hasImage =
        data.predictions?.[0]?.bytesBase64Encoded ||
        data.generatedImages?.[0]?.image?.imageBytes;
      return {
        model: modelId,
        supportsImage: !!hasImage,
        responseType: hasImage ? "imagen-base64" : "no-image",
      };
    } else {
      const parts = data.candidates?.[0]?.content?.parts || [];
      const hasImage = parts.some((p: any) =>
        p.inlineData?.mimeType?.startsWith("image/"),
      );
      const hasText = parts.some((p: any) => p.text);
      return {
        model: modelId,
        supportsImage: hasImage,
        responseType: hasImage
          ? "gemini-inline-image"
          : hasText
            ? "text-only"
            : "empty",
      };
    }
  } catch (error: any) {
    return {
      model: modelId,
      supportsImage: false,
      error: error.message,
    };
  }
}

async function main() {
  console.log("=== Gemini Image Generation Model Test ===\n");
  console.log(`Testing ${MODELS_TO_TEST.length} models...\n`);

  const results: any[] = [];

  for (const model of MODELS_TO_TEST) {
    process.stdout.write(`Testing ${model}... `);
    const result = await testModelImageGeneration(model);
    results.push(result);

    if (result.supportsImage) {
      console.log(`✅ SUPPORTS IMAGE (${result.responseType})`);
    } else {
      console.log(`❌ NO IMAGE - ${result.error || result.responseType}`);
    }
  }

  console.log("\n=== Summary ===\n");

  const supported = results.filter((r) => r.supportsImage);
  const notSupported = results.filter((r) => !r.supportsImage);

  console.log("Models that support image generation:");
  if (supported.length === 0) {
    console.log("  (none found)");
  } else {
    supported.forEach((r) =>
      console.log(`  ✅ ${r.model} (${r.responseType})`),
    );
  }

  console.log("\nModels that do NOT support image generation:");
  notSupported.forEach((r) =>
    console.log(`  ❌ ${r.model}: ${r.error || r.responseType}`),
  );

  console.log("\n=== Recommendation ===");
  if (supported.length > 0) {
    console.log(
      `Use one of these models for image generation: ${supported.map((r) => r.model).join(", ")}`,
    );
  } else {
    console.log("No models support image generation with the current API key.");
    console.log(
      "Make sure your Google AI API key has access to image generation models.",
    );
  }
}

main().catch(console.error);
