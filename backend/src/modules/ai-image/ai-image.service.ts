import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { ContentExtractorService } from "./content-extractor.service";

// 处理步骤类型
export interface ProcessingStep {
  step: string;
  status: "pending" | "processing" | "completed" | "error";
  title: string;
  content?: string;
  timestamp?: string;
}

export interface GeneratedImageResult {
  id: string;
  imageUrl: string;
  prompt: string;
  enhancedPrompt?: string;
  width: number;
  height: number;
  createdAt: string;
  // 新增：处理步骤详情
  processingSteps?: ProcessingStep[];
  extractedContent?: string;
  textModelUsed?: string;
  imageModelUsed?: string;
  // 新增：错误信息（如果处理失败）
  error?: string;
}

export interface GenerateImageOptions {
  prompt?: string;
  urls?: string[]; // 支持多个URL
  content?: string;
  imageBase64?: string; // 图片 Base64
  files?: Array<{ buffer: Buffer; mimeType: string; filename: string }>; // 上传的文件
  textModelId?: string;
  imageModelId?: string;
  style?: string;
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3";
  negativePrompt?: string;
  skipEnhancement?: boolean;
  userId?: string;
}

// 提示词优化系统提示
const PROMPT_ENHANCEMENT_SYSTEM = `You are an expert AI image prompt engineer. Your task is to analyze the given content and create a highly detailed, professional image generation prompt that captures the essence of the content.

Guidelines:
1. Analyze the content (text, article summary, or description) to identify the core theme, mood, and key visual elements
2. Create a vivid, detailed image prompt that represents the content
3. Add specific visual details: lighting, composition, perspective, color palette, atmosphere
4. Include technical quality terms: 8K, photorealistic, detailed, sharp focus (when appropriate)
5. Keep the enhanced prompt concise but comprehensive (max 150 words)
6. Output ONLY the enhanced prompt in English, no explanations or prefixes

Example input: "An article about climate change and melting glaciers"
Example output: "A dramatic aerial view of a massive glacier with deep blue crevasses, chunks of ice calving into dark arctic waters, misty atmosphere, golden hour lighting breaking through storm clouds, environmental documentary style, ultra-detailed, 8K resolution, melancholic mood, stark contrast between pristine ice and rising waters"`;

@Injectable()
export class AiImageService {
  private readonly logger = new Logger(AiImageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly contentExtractor: ContentExtractorService,
  ) {}

  /**
   * 获取所有可用模型（文本模型 + 图片模型）
   */
  async getAvailableModels() {
    // 获取文本模型
    const textModels = await this.prisma.aIModel.findMany({
      where: {
        isEnabled: true,
        OR: [
          { modelId: { contains: "gpt", mode: "insensitive" } },
          { modelId: { contains: "claude", mode: "insensitive" } },
          { modelId: { contains: "gemini", mode: "insensitive" } },
          { provider: { contains: "openai", mode: "insensitive" } },
          { provider: { contains: "anthropic", mode: "insensitive" } },
          { provider: { contains: "google", mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        displayName: true,
        provider: true,
        modelId: true,
        icon: true,
        isDefault: true,
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });

    // 获取图片模型
    const imageModels = await this.prisma.aIModel.findMany({
      where: {
        isEnabled: true,
        OR: [
          { provider: { contains: "gemini", mode: "insensitive" } },
          { provider: { contains: "google", mode: "insensitive" } },
          { modelId: { contains: "gemini", mode: "insensitive" } },
          { modelId: { contains: "imagen", mode: "insensitive" } },
          { provider: { contains: "openai", mode: "insensitive" } },
          { modelId: { contains: "dall", mode: "insensitive" } },
          { provider: { contains: "stability", mode: "insensitive" } },
          { modelId: { contains: "stable", mode: "insensitive" } },
          { provider: { contains: "flux", mode: "insensitive" } },
          { modelId: { contains: "flux", mode: "insensitive" } },
          { provider: { contains: "replicate", mode: "insensitive" } },
          { provider: { contains: "together", mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        displayName: true,
        provider: true,
        modelId: true,
        icon: true,
        isDefault: true,
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });

    return {
      textModels: textModels.map((m) => ({
        id: m.id,
        name: m.displayName || m.name,
        provider: m.provider,
        modelId: m.modelId,
        icon: m.icon,
        isDefault: m.isDefault,
      })),
      imageModels: imageModels.map((m) => ({
        id: m.id,
        name: m.displayName || m.name,
        provider: m.provider,
        modelId: m.modelId,
        icon: m.icon,
        isDefault: m.isDefault,
      })),
    };
  }

  /**
   * 主方法：生成图片
   * 严格按顺序执行：
   * 1. 内容提取 (必须成功才继续)
   * 2. AI Prompt 生成 (必须成功才继续)
   * 3. 图片生成 (必须成功才返回)
   *
   * 任何一步失败都会中断并返回错误，不会继续执行后续步骤
   */
  async generateImage(
    options: GenerateImageOptions,
  ): Promise<GeneratedImageResult> {
    const {
      prompt,
      urls,
      content,
      imageBase64,
      files,
      imageModelId,
      style,
      aspectRatio,
      negativePrompt,
      skipEnhancement,
      userId,
    } = options;

    // 处理步骤记录
    const processingSteps: ProcessingStep[] = [];

    // 更新或添加步骤
    const updateStep = (
      stepId: string,
      title: string,
      status: ProcessingStep["status"],
      stepContent?: string,
    ) => {
      const existing = processingSteps.find((s) => s.step === stepId);
      if (existing) {
        existing.title = title;
        existing.status = status;
        existing.content = stepContent;
        existing.timestamp = new Date().toISOString();
      } else {
        processingSteps.push({
          step: stepId,
          title,
          status,
          content: stepContent,
          timestamp: new Date().toISOString(),
        });
      }
    };

    // 返回错误结果
    const returnError = (errorMsg: string): GeneratedImageResult => {
      this.logger.error(`Image generation stopped: ${errorMsg}`);
      return {
        id: `error-${Date.now()}`,
        imageUrl: "",
        prompt: "",
        width: 512,
        height: 512,
        createdAt: new Date().toISOString(),
        processingSteps,
        error: errorMsg,
      };
    };

    // 验证输入
    const hasUrls = urls && urls.length > 0 && urls.some((u) => u.trim());
    const hasFiles = files && files.length > 0;
    if (!prompt && !hasUrls && !content && !imageBase64 && !hasFiles) {
      updateStep(
        "validation",
        "Input Validation Failed",
        "error",
        "No input provided",
      );
      throw new BadRequestException(
        "At least one input is required: prompt, urls, content, files, or imageBase64",
      );
    }

    // ============================================================
    // 步骤1: 内容提取 (Content Extraction)
    // ============================================================
    this.logger.log("========== STEP 1: Content Extraction ==========");
    const contentParts: string[] = [];

    // 1.1 处理直接输入的提示词
    if (prompt) {
      contentParts.push(`User prompt: ${prompt}`);
      updateStep("prompt_input", "User Prompt Received", "completed", prompt);
      this.logger.log(`User prompt: ${prompt.slice(0, 100)}...`);
    }

    // 1.2 处理 URLs（YouTube、Bilibili、网页）- 必须等待完成
    // 支持 "URL 描述" 格式，例如 "https://example.com 请生成信息图"
    if (hasUrls) {
      for (const urlInput of urls!) {
        if (!urlInput.trim()) continue;

        const trimmedInput = urlInput.trim();

        // 解析 URL 和描述
        // URL 通常以 http:// 或 https:// 开头，找到第一个空格后的内容作为描述
        const urlMatch = trimmedInput.match(/^(https?:\/\/\S+)(?:\s+(.*))?$/i);
        let trimmedUrl: string;
        let userDescription: string | null = null;

        if (urlMatch) {
          trimmedUrl = urlMatch[1];
          userDescription = urlMatch[2]?.trim() || null;
          if (userDescription) {
            this.logger.log(
              `[STEP 1.2] URL with description: "${trimmedUrl}" + "${userDescription}"`,
            );
          }
        } else {
          // 没有匹配到标准 URL 格式，使用原始输入
          trimmedUrl = trimmedInput;
        }

        const isYouTube =
          trimmedUrl.includes("youtube.com") || trimmedUrl.includes("youtu.be");
        const isBilibili = trimmedUrl.includes("bilibili.com");
        const stepId = `url_${Date.now()}`;
        const stepTitle = isYouTube
          ? "Extracting YouTube Subtitles"
          : isBilibili
            ? "Extracting Bilibili Content"
            : "Extracting Web Content";

        updateStep(stepId, stepTitle, "processing", trimmedUrl);
        this.logger.log(`[STEP 1.2] Extracting content from: ${trimmedUrl}`);

        try {
          // 等待内容提取完成
          const urlContent =
            await this.contentExtractor.extractFromUrl(trimmedUrl);

          // 检查提取的内容是否有效
          const cleanContent = urlContent.replace(/\[.*?\]/g, "").trim();
          this.logger.log(
            `[STEP 1.2] Extracted ${cleanContent.length} chars from ${trimmedUrl}`,
          );

          if (cleanContent.length < 50) {
            // 内容太少，标记为失败并中断
            updateStep(
              stepId,
              `${stepTitle} - Failed`,
              "error",
              `Insufficient content extracted (${cleanContent.length} chars). The URL may not be accessible or has no subtitles.`,
            );
            return returnError(
              `Failed to extract sufficient content from ${trimmedUrl}. Only ${cleanContent.length} characters were extracted.`,
            );
          }

          // 内容提取成功
          contentParts.push(`Content from ${trimmedUrl}:\n${urlContent}`);

          // 如果用户提供了描述，添加到内容中以影响 AI 生成
          if (userDescription) {
            contentParts.push(
              `User instruction for this content: ${userDescription}`,
            );
            this.logger.log(
              `[STEP 1.2] Added user description to content: "${userDescription}"`,
            );
          }
          // 构建步骤显示内容
          let stepContent =
            urlContent.slice(0, 500) + (urlContent.length > 500 ? "..." : "");
          if (userDescription) {
            stepContent += `\n\n📝 User instruction: ${userDescription}`;
          }

          updateStep(
            stepId,
            isYouTube
              ? "YouTube Content Extracted"
              : isBilibili
                ? "Bilibili Content Extracted"
                : "Web Content Extracted",
            "completed",
            stepContent,
          );
          this.logger.log(
            `[STEP 1.2] ✓ Successfully extracted content from ${trimmedUrl}`,
          );
        } catch (error) {
          // 提取失败，标记错误并中断
          const errorMsg =
            error instanceof Error ? error.message : "Unknown error";
          updateStep(stepId, `${stepTitle} - Failed`, "error", errorMsg);
          return returnError(
            `Failed to extract content from ${trimmedUrl}: ${errorMsg}`,
          );
        }
      }
    }

    // 1.3 处理直接粘贴的文本内容
    if (content) {
      contentParts.push(`Text content:\n${content}`);
      updateStep(
        "text_content",
        "Text Content Received",
        "completed",
        content.slice(0, 300) + (content.length > 300 ? "..." : ""),
      );
      this.logger.log(
        `[STEP 1.3] ✓ Text content received: ${content.length} chars`,
      );
    }

    // 1.4 处理上传的文件
    if (hasFiles) {
      for (const file of files!) {
        const stepId = `file_${file.filename}`;
        updateStep(stepId, `Processing ${file.filename}`, "processing");
        this.logger.log(`[STEP 1.4] Processing file: ${file.filename}`);

        try {
          const fileContent = await this.contentExtractor.extractFromFile(
            file.buffer,
            file.mimeType,
            file.filename,
          );
          contentParts.push(
            `Content from file "${file.filename}":\n${fileContent}`,
          );
          updateStep(
            stepId,
            `Extracted from ${file.filename}`,
            "completed",
            fileContent.slice(0, 300) + (fileContent.length > 300 ? "..." : ""),
          );
          this.logger.log(`[STEP 1.4] ✓ Extracted from ${file.filename}`);
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : "Unknown error";
          updateStep(
            stepId,
            `Failed to process ${file.filename}`,
            "error",
            errorMsg,
          );
          return returnError(
            `Failed to process file ${file.filename}: ${errorMsg}`,
          );
        }
      }
    }

    // 1.5 处理参考图片
    if (imageBase64) {
      updateStep("image_analyze", "Analyzing Reference Image", "processing");
      this.logger.log(`[STEP 1.5] Analyzing reference image...`);

      try {
        const textModel = await this.getDefaultTextModel();
        if (!textModel?.apiKey) {
          updateStep(
            "image_analyze",
            "Image Analysis Skipped",
            "error",
            "No text model available",
          );
          return returnError("Cannot analyze image: no text model configured");
        }

        const imageDescription = await this.contentExtractor.extractFromImage(
          imageBase64,
          textModel.apiKey,
        );
        contentParts.push(`Image description:\n${imageDescription}`);
        updateStep(
          "image_analyze",
          "Image Analysis Complete",
          "completed",
          imageDescription,
        );
        this.logger.log(`[STEP 1.5] ✓ Image analysis complete`);
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        updateStep("image_analyze", "Image Analysis Failed", "error", errorMsg);
        return returnError(`Failed to analyze image: ${errorMsg}`);
      }
    }

    // 检查是否有足够的内容
    const inputContent = contentParts.join("\n\n---\n\n");
    this.logger.log(`[STEP 1] Total content: ${inputContent.length} chars`);

    // 如果用户提供了直接 prompt，跳过最小内容检查
    // 50 字符限制只针对从 URL/文件提取的内容
    const hasDirectPrompt = !!prompt && prompt.trim().length > 0;
    if (inputContent.length < 50 && !hasDirectPrompt) {
      updateStep(
        "content_check",
        "Content Check Failed",
        "error",
        "Insufficient content extracted",
      );
      return returnError("No valid content could be extracted from the input");
    }

    // 如果只有很短的 prompt 且没有其他内容，也检查一下
    if (inputContent.length < 10) {
      updateStep(
        "content_check",
        "Content Check Failed",
        "error",
        "Prompt is too short",
      );
      return returnError("Please provide a more detailed prompt");
    }

    updateStep(
      "content_check",
      "Content Extraction Complete",
      "completed",
      `${inputContent.length} characters`,
    );
    this.logger.log(
      `========== STEP 1 COMPLETE: ${inputContent.length} chars ==========`,
    );

    // ============================================================
    // 步骤2: AI Prompt 生成
    // ============================================================
    this.logger.log("========== STEP 2: AI Prompt Generation ==========");
    let enhancedPrompt: string;
    let textModelUsed: string | undefined;

    if (skipEnhancement) {
      enhancedPrompt = this.addStyleToPrompt(inputContent, style);
      updateStep(
        "prompt_generate",
        "Using Direct Input",
        "completed",
        enhancedPrompt.slice(0, 300),
      );
      this.logger.log(`[STEP 2] Using direct input as prompt`);
    } else {
      updateStep(
        "prompt_generate",
        "Generating Image Prompt with AI",
        "processing",
      );

      try {
        const textModel = await this.getDefaultTextModel();
        if (!textModel || !textModel.apiKey) {
          updateStep(
            "prompt_generate",
            "No Text Model Available",
            "error",
            "Please configure a text model",
          );
          return returnError("No text model configured for prompt enhancement");
        }

        textModelUsed = textModel.displayName || textModel.name;
        this.logger.log(`[STEP 2] Using text model: ${textModelUsed}`);

        // 调用文本模型生成 prompt
        const provider = textModel.provider.toLowerCase();
        const modelId = textModel.modelId.toLowerCase();

        if (
          provider.includes("google") ||
          provider.includes("gemini") ||
          modelId.includes("gemini")
        ) {
          enhancedPrompt = await this.callGeminiTextAPI(
            textModel.apiKey,
            textModel.modelId,
            inputContent,
          );
        } else if (provider.includes("openai") || modelId.includes("gpt")) {
          enhancedPrompt = await this.callOpenAITextAPI(
            textModel.apiKey,
            textModel.apiEndpoint,
            textModel.modelId,
            inputContent,
          );
        } else {
          enhancedPrompt = await this.callOpenAITextAPI(
            textModel.apiKey,
            textModel.apiEndpoint,
            textModel.modelId,
            inputContent,
          );
        }

        enhancedPrompt = this.addStyleToPrompt(enhancedPrompt, style);

        // 验证生成的 prompt
        if (!enhancedPrompt || enhancedPrompt.length < 20) {
          updateStep(
            "prompt_generate",
            "Prompt Generation Failed",
            "error",
            "Generated prompt is empty or too short",
          );
          return returnError("AI failed to generate a valid image prompt");
        }

        updateStep(
          "prompt_generate",
          `AI Prompt Generated (${textModelUsed})`,
          "completed",
          enhancedPrompt,
        );
        this.logger.log(
          `[STEP 2] ✓ Generated prompt: ${enhancedPrompt.slice(0, 100)}...`,
        );
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        updateStep(
          "prompt_generate",
          "Prompt Generation Failed",
          "error",
          errorMsg,
        );
        return returnError(`Failed to generate image prompt: ${errorMsg}`);
      }
    }

    this.logger.log(`========== STEP 2 COMPLETE ==========`);

    // ============================================================
    // 步骤3: 图片生成
    // ============================================================
    this.logger.log("========== STEP 3: Image Generation ==========");
    const dimensions = this.getDimensions(aspectRatio || "1:1");

    // 获取图片模型
    const imageModelConfig = imageModelId
      ? await this.getModelById(imageModelId)
      : await this.getDefaultImageModel();

    if (!imageModelConfig || !imageModelConfig.apiKey) {
      updateStep(
        "image_generate",
        "No Image Model Available",
        "error",
        "Please configure an image model",
      );
      return returnError("No image generation model configured");
    }

    const imageModelUsed =
      imageModelConfig.displayName || imageModelConfig.name;
    updateStep(
      "image_generate",
      `Generating Image with ${imageModelUsed}`,
      "processing",
    );
    this.logger.log(`[STEP 3] Using image model: ${imageModelUsed}`);

    try {
      const generatedImageUrl = await this.callImageGenerationAPI(
        imageModelConfig,
        enhancedPrompt,
        dimensions,
        negativePrompt,
      );

      // 验证生成的图片
      if (!generatedImageUrl || !generatedImageUrl.startsWith("data:image")) {
        updateStep(
          "image_generate",
          "Image Generation Failed",
          "error",
          "Invalid image data returned",
        );
        return returnError("Image generation returned invalid data");
      }

      updateStep("image_generate", "Image Generated Successfully", "completed");
      this.logger.log(`[STEP 3] ✓ Image generated successfully`);

      // 保存到数据库
      const image = await this.prisma.generatedImage.create({
        data: {
          prompt: inputContent.slice(0, 1000),
          enhancedPrompt,
          style: style || "realistic",
          aspectRatio: aspectRatio || "1:1",
          imageUrl: generatedImageUrl,
          width: dimensions.width,
          height: dimensions.height,
          provider: imageModelConfig.provider,
          userId,
        },
      });

      this.logger.log(`========== ALL STEPS COMPLETE: ${image.id} ==========`);

      return {
        id: image.id,
        imageUrl: image.imageUrl,
        prompt: image.prompt,
        enhancedPrompt: image.enhancedPrompt || undefined,
        width: image.width,
        height: image.height,
        createdAt: image.createdAt.toISOString(),
        processingSteps,
        extractedContent: inputContent.slice(0, 2000),
        textModelUsed,
        imageModelUsed,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      updateStep(
        "image_generate",
        "Image Generation Failed",
        "error",
        errorMsg,
      );
      return returnError(`Image generation failed: ${errorMsg}`);
    }
  }

  /**
   * 调用 Gemini 文本 API
   */
  private async callGeminiTextAPI(
    apiKey: string,
    modelId: string,
    content: string,
  ): Promise<string> {
    const model = modelId.includes("gemini") ? modelId : "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await firstValueFrom(
      this.httpService.post(
        url,
        {
          contents: [
            {
              parts: [
                { text: PROMPT_ENHANCEMENT_SYSTEM },
                { text: `\n\nContent to analyze:\n${content}` },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 300,
            temperature: 0.7,
          },
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 30000,
        },
      ),
    );

    const candidates = response.data.candidates;
    if (candidates?.[0]?.content?.parts?.[0]?.text) {
      return candidates[0].content.parts[0].text.trim();
    }

    throw new Error("No text in Gemini response");
  }

  /**
   * 调用 OpenAI 文本 API
   */
  private async callOpenAITextAPI(
    apiKey: string,
    apiEndpoint: string | null,
    modelId: string,
    content: string,
  ): Promise<string> {
    // 清理 endpoint URL - 确保格式正确
    let baseUrl = apiEndpoint || "https://api.openai.com/v1";
    // 移除末尾斜杠
    baseUrl = baseUrl.replace(/\/+$/, "");
    // 如果endpoint已经包含/chat/completions，不要重复添加
    const url = baseUrl.includes("/chat/completions")
      ? baseUrl
      : `${baseUrl}/chat/completions`;

    const effectiveModel = modelId || "gpt-4o-mini";
    this.logger.log(
      `Calling OpenAI text API: ${url} with model: ${effectiveModel}`,
    );

    // 新版 OpenAI 模型 (gpt-4o, gpt-5, o1, o3) 需要使用 max_completion_tokens
    const isNewerModel =
      effectiveModel.includes("gpt-4o") ||
      effectiveModel.includes("gpt-5") ||
      effectiveModel.startsWith("o1") ||
      effectiveModel.startsWith("o3");

    const tokenParam = isNewerModel
      ? { max_completion_tokens: 300 }
      : { max_tokens: 300 };

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          url,
          {
            model: effectiveModel,
            messages: [
              { role: "system", content: PROMPT_ENHANCEMENT_SYSTEM },
              { role: "user", content: `Content to analyze:\n${content}` },
            ],
            ...tokenParam,
            temperature: 0.7,
          },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            timeout: 30000,
          },
        ),
      );

      this.logger.log(
        `OpenAI response status: ${response.status}, has data: ${!!response.data}`,
      );

      const message = response.data.choices?.[0]?.message?.content;
      if (message) {
        return message.trim();
      }

      // Log full response for debugging
      this.logger.error(
        `OpenAI response has no text. Response: ${JSON.stringify(response.data).slice(0, 500)}`,
      );
      throw new Error("No text in OpenAI response");
    } catch (error: any) {
      // Handle axios errors with more details
      if (error.response) {
        this.logger.error(
          `OpenAI API error: ${error.response.status} - ${JSON.stringify(error.response.data).slice(0, 500)}`,
        );
        throw new Error(
          `OpenAI API error: ${error.response.data?.error?.message || error.response.status}`,
        );
      }
      throw error;
    }
  }

  /**
   * 调用图片生成 API
   */
  private async callImageGenerationAPI(
    modelConfig: any,
    prompt: string,
    dimensions: { width: number; height: number },
    negativePrompt?: string,
  ): Promise<string> {
    const provider = modelConfig.provider.toLowerCase();
    const endpoint = modelConfig.apiEndpoint?.toLowerCase() || "";
    const modelId = modelConfig.modelId.toLowerCase();

    if (
      provider.includes("openai") ||
      endpoint.includes("openai") ||
      modelId.includes("dall")
    ) {
      return this.generateWithOpenAI(
        modelConfig.apiKey,
        modelConfig.apiEndpoint,
        prompt,
        dimensions,
      );
    } else if (
      provider.includes("stability") ||
      endpoint.includes("stability") ||
      modelId.includes("stable")
    ) {
      return this.generateWithStability(
        modelConfig.apiKey,
        modelConfig.apiEndpoint,
        prompt,
        dimensions,
        negativePrompt,
      );
    } else if (
      provider.includes("replicate") ||
      endpoint.includes("replicate") ||
      modelId.includes("flux")
    ) {
      return this.generateWithReplicate(
        modelConfig.apiKey,
        modelConfig.modelId,
        prompt,
        dimensions,
        negativePrompt,
      );
    } else if (provider.includes("together") || endpoint.includes("together")) {
      return this.generateWithTogether(
        modelConfig.apiKey,
        modelConfig.modelId,
        prompt,
        dimensions,
      );
    } else if (
      provider.includes("google") ||
      provider.includes("gemini") ||
      modelId.includes("gemini") ||
      modelId.includes("imagen")
    ) {
      return this.generateWithGemini(
        modelConfig.apiKey,
        modelConfig.modelId,
        prompt,
        dimensions,
      );
    } else {
      // 默认尝试 OpenAI 兼容 API
      return this.generateWithOpenAICompatible(
        modelConfig.apiKey,
        modelConfig.apiEndpoint,
        modelConfig.modelId,
        prompt,
        dimensions,
      );
    }
  }

  /**
   * 获取默认文本模型
   * 优先使用用户设置的默认模型（isDefault: true），否则退回到可用的文本模型
   */
  private async getDefaultTextModel() {
    // 首先尝试获取用户设置的默认模型
    const defaultModel = await this.prisma.aIModel.findFirst({
      where: {
        isEnabled: true,
        isDefault: true,
      },
    });

    if (defaultModel) {
      this.logger.log(
        `Using user-configured default model: ${defaultModel.displayName || defaultModel.name} (${defaultModel.modelId})`,
      );
      return defaultModel;
    }

    // 如果没有明确设置默认模型，退回到可用的文本模型（优先Gemini）
    return this.prisma.aIModel.findFirst({
      where: {
        isEnabled: true,
        OR: [
          { modelId: { contains: "gemini", mode: "insensitive" } },
          { modelId: { contains: "gpt", mode: "insensitive" } },
          { provider: { contains: "google", mode: "insensitive" } },
          { provider: { contains: "openai", mode: "insensitive" } },
        ],
      },
      orderBy: [
        { provider: "asc" }, // Google/Gemini 会排在 OpenAI 前面
        { name: "asc" },
      ],
    });
  }

  /**
   * 获取默认图片模型
   */
  private async getDefaultImageModel() {
    return this.prisma.aIModel.findFirst({
      where: {
        isEnabled: true,
        OR: [
          { modelId: { contains: "gemini", mode: "insensitive" } },
          { provider: { contains: "gemini", mode: "insensitive" } },
          { provider: { contains: "google", mode: "insensitive" } },
          { modelId: { contains: "imagen", mode: "insensitive" } },
          { provider: { contains: "openai", mode: "insensitive" } },
          { modelId: { contains: "dall", mode: "insensitive" } },
          { provider: { contains: "stability", mode: "insensitive" } },
          { provider: { contains: "together", mode: "insensitive" } },
        ],
      },
      orderBy: { isDefault: "desc" },
    });
  }

  /**
   * 根据ID获取模型
   */
  private async getModelById(id: string) {
    return this.prisma.aIModel.findFirst({
      where: { id, isEnabled: true },
    });
  }

  /**
   * 添加样式到提示词
   */
  private addStyleToPrompt(prompt: string, style?: string): string {
    const styleEnhancements: Record<string, string> = {
      realistic: "photorealistic, 8k uhd, high quality, detailed",
      artistic: "artistic, painterly, vibrant colors, expressive",
      anime: "anime style, detailed, vibrant, studio quality",
      "3d": "3D render, octane render, unreal engine, highly detailed",
      sketch: "pencil sketch, detailed line art, artistic",
      watercolor: "watercolor painting, soft colors, artistic",
    };

    const enhancement = style ? styleEnhancements[style] : "";
    return enhancement ? `${prompt}, ${enhancement}` : prompt;
  }

  /**
   * 获取尺寸
   */
  private getDimensions(aspectRatio: string): {
    width: number;
    height: number;
  } {
    const dimensions: Record<string, { width: number; height: number }> = {
      "1:1": { width: 1024, height: 1024 },
      "16:9": { width: 1344, height: 768 },
      "9:16": { width: 768, height: 1344 },
      "4:3": { width: 1152, height: 896 },
    };
    return dimensions[aspectRatio] || dimensions["1:1"];
  }
  // ============ 图片生成 API 实现 ============

  /**
   * 使用 Google AI Image Generation API
   * 支持的图片生成模型:
   * - gemini-2.0-flash-exp (支持 responseModalities: IMAGE)
   * - gemini-2.0-flash-exp-image-generation
   * - imagen-3.0-generate-001 (Imagen 3)
   * - imagen-4.0-generate-preview-* (Imagen 4)
   * - imagen-4.0-ultra-generate-preview-* (Imagen 4 Ultra)
   */
  private async generateWithGemini(
    apiKey: string,
    modelId: string,
    prompt: string,
    dimensions: { width: number; height: number },
  ): Promise<string> {
    const modelLower = modelId.toLowerCase();

    // 检查是否是 Imagen 模型 (使用不同的 API)
    if (modelLower.includes("imagen")) {
      return this.generateWithImagen(apiKey, modelId, prompt, dimensions);
    }

    // Gemini 模型支持列表
    const geminiImageModels = [
      "gemini-2.0-flash-exp",
      "gemini-2.0-flash-exp-image-generation",
    ];

    // 检查是否是支持图片生成的 Gemini 模型
    const isGeminiImageCapable = geminiImageModels.some((m) =>
      modelLower.includes(m.toLowerCase()),
    );

    // 如果不是支持的模型，使用默认的图片生成模型
    const model = isGeminiImageCapable ? modelId : "gemini-2.0-flash-exp";

    this.logger.log(
      `Using Gemini model for image generation: ${model} (original: ${modelId})`,
    );

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await firstValueFrom(
      this.httpService.post(
        url,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
          },
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 120000,
        },
      ),
    );

    const candidates = response.data.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error("No candidates in Gemini response");
    }

    const parts = candidates[0].content?.parts;
    if (!parts || parts.length === 0) {
      throw new Error("No parts in Gemini response");
    }

    for (const part of parts) {
      if (part.inlineData && part.inlineData.data) {
        const mimeType = part.inlineData.mimeType || "image/png";
        return `data:${mimeType};base64,${part.inlineData.data}`;
      }
    }

    throw new Error("No image data in Gemini response");
  }

  /**
   * 使用 Imagen API 生成图片
   * Imagen 4 使用 generateImages 端点
   * 参考: https://ai.google.dev/gemini-api/docs/imagen
   */
  private async generateWithImagen(
    apiKey: string,
    modelId: string,
    prompt: string,
    dimensions: { width: number; height: number },
  ): Promise<string> {
    this.logger.log(`Using Imagen model for image generation: ${modelId}`);

    // 计算宽高比
    const aspectRatio =
      dimensions.width === dimensions.height
        ? "1:1"
        : dimensions.width > dimensions.height
          ? "16:9"
          : "9:16";

    // 尝试使用 generateImages 端点 (Imagen 4 新 API)
    const generateImagesUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateImages?key=${apiKey}`;

    this.logger.log(`Calling Imagen API: ${generateImagesUrl}`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          generateImagesUrl,
          {
            prompt: prompt,
            config: {
              numberOfImages: 1,
              aspectRatio: aspectRatio,
              outputOptions: {
                mimeType: "image/png",
              },
            },
          },
          {
            headers: { "Content-Type": "application/json" },
            timeout: 120000,
          },
        ),
      );

      this.logger.log(
        `Imagen generateImages response: ${JSON.stringify(response.data).slice(0, 300)}`,
      );

      // Imagen 4 返回格式: { generatedImages: [{ image: { imageBytes: "base64..." } }] }
      const generatedImages = response.data.generatedImages;
      if (generatedImages && generatedImages.length > 0) {
        const imageData = generatedImages[0].image?.imageBytes;
        if (imageData) {
          this.logger.log(`Imagen image generated successfully`);
          return `data:image/png;base64,${imageData}`;
        }
      }

      // 备用: 检查旧格式
      const predictions = response.data.predictions;
      if (predictions && predictions.length > 0) {
        const prediction = predictions[0];
        if (prediction.bytesBase64Encoded) {
          const mimeType = prediction.mimeType || "image/png";
          return `data:${mimeType};base64,${prediction.bytesBase64Encoded}`;
        }
      }

      this.logger.error(
        `Unexpected Imagen response format: ${JSON.stringify(response.data).slice(0, 500)}`,
      );
      throw new Error("No image data in Imagen response");
    } catch (error: any) {
      const errorStatus = error.response?.status;
      const errorData = error.response?.data;
      this.logger.error(
        `Imagen generateImages error: status=${errorStatus}, data=${JSON.stringify(errorData).slice(0, 500)}`,
      );

      // 如果 generateImages 失败，尝试使用 predict 端点 (旧 API)
      if (errorStatus === 404 || errorStatus === 400) {
        this.logger.log(
          `generateImages failed with ${errorStatus}, trying predict endpoint...`,
        );
        return this.generateWithImagenPredict(
          apiKey,
          modelId,
          prompt,
          aspectRatio,
        );
      }
      throw error;
    }
  }

  /**
   * 使用 Imagen predict 端点 (备用方案)
   * 如果 predict 也失败，回退到 Gemini 2.0 Flash 图片生成
   */
  private async generateWithImagenPredict(
    apiKey: string,
    modelId: string,
    prompt: string,
    aspectRatio: string,
  ): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:predict?key=${apiKey}`;

    this.logger.log(`Calling Imagen predict API: ${url}`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          url,
          {
            instances: [{ prompt }],
            parameters: {
              sampleCount: 1,
              aspectRatio: aspectRatio,
            },
          },
          {
            headers: { "Content-Type": "application/json" },
            timeout: 120000,
          },
        ),
      );

      this.logger.log(
        `Imagen predict response: ${JSON.stringify(response.data).slice(0, 300)}`,
      );

      const predictions = response.data.predictions;
      if (predictions && predictions.length > 0) {
        const prediction = predictions[0];
        if (prediction.bytesBase64Encoded) {
          const mimeType = prediction.mimeType || "image/png";
          return `data:${mimeType};base64,${prediction.bytesBase64Encoded}`;
        }
      }

      // 如果 Imagen 不返回结果，回退到 Gemini 2.0 Flash
      this.logger.warn(
        `Imagen predict returned no data, falling back to Gemini 2.0 Flash`,
      );
      return this.generateWithGeminiFlash(apiKey, prompt);
    } catch (error: any) {
      this.logger.error(
        `Imagen predict error: ${error.response?.status} - ${JSON.stringify(error.response?.data).slice(0, 300)}`,
      );
      // 回退到 Gemini 2.0 Flash
      this.logger.warn(
        `Imagen predict failed, falling back to Gemini 2.0 Flash`,
      );
      return this.generateWithGeminiFlash(apiKey, prompt);
    }
  }

  /**
   * 使用 Gemini 2.0 Flash 生成图片 (最后备用方案)
   */
  private async generateWithGeminiFlash(
    apiKey: string,
    prompt: string,
  ): Promise<string> {
    const model = "gemini-2.0-flash-exp";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    this.logger.log(`Falling back to Gemini 2.0 Flash for image generation`);

    const response = await firstValueFrom(
      this.httpService.post(
        url,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
          },
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 120000,
        },
      ),
    );

    const candidates = response.data.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error("No candidates in Gemini response");
    }

    const parts = candidates[0].content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          const mimeType = part.inlineData.mimeType || "image/png";
          this.logger.log(`Gemini 2.0 Flash image generated successfully`);
          return `data:${mimeType};base64,${part.inlineData.data}`;
        }
      }
    }

    throw new Error("No image data in Gemini 2.0 Flash response");
  }

  /**
   * 使用 OpenAI DALL-E API
   */
  private async generateWithOpenAI(
    apiKey: string,
    apiEndpoint: string | null,
    prompt: string,
    dimensions: { width: number; height: number },
  ): Promise<string> {
    const baseUrl = apiEndpoint || "https://api.openai.com/v1";
    const url = `${baseUrl}/images/generations`;

    const size =
      dimensions.width === dimensions.height
        ? "1024x1024"
        : dimensions.width > dimensions.height
          ? "1792x1024"
          : "1024x1792";

    const response = await firstValueFrom(
      this.httpService.post(
        url,
        {
          model: "dall-e-3",
          prompt,
          n: 1,
          size,
          quality: "hd",
          response_format: "url",
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
        },
      ),
    );

    return response.data.data[0].url;
  }

  /**
   * 使用 Stability AI API
   */
  private async generateWithStability(
    apiKey: string,
    apiEndpoint: string | null,
    prompt: string,
    dimensions: { width: number; height: number },
    negativePrompt?: string,
  ): Promise<string> {
    const url =
      apiEndpoint ||
      "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image";

    const response = await firstValueFrom(
      this.httpService.post(
        url,
        {
          text_prompts: [
            { text: prompt, weight: 1 },
            ...(negativePrompt ? [{ text: negativePrompt, weight: -1 }] : []),
          ],
          cfg_scale: 7,
          width: dimensions.width,
          height: dimensions.height,
          samples: 1,
          steps: 30,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
        },
      ),
    );

    const base64Image = response.data.artifacts[0].base64;
    return `data:image/png;base64,${base64Image}`;
  }

  /**
   * 使用 Replicate API
   */
  private async generateWithReplicate(
    apiKey: string,
    modelId: string,
    prompt: string,
    dimensions: { width: number; height: number },
    negativePrompt?: string,
  ): Promise<string> {
    const createResponse = await firstValueFrom(
      this.httpService.post(
        "https://api.replicate.com/v1/predictions",
        {
          version: modelId.includes(":")
            ? modelId.split(":")[1]
            : "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
          input: {
            prompt,
            negative_prompt: negativePrompt || "",
            width: dimensions.width,
            height: dimensions.height,
            num_outputs: 1,
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Token ${apiKey}`,
          },
        },
      ),
    );

    const predictionId = createResponse.data.id;
    let result = createResponse.data;
    let attempts = 0;
    const maxAttempts = 60;

    while (
      result.status !== "succeeded" &&
      result.status !== "failed" &&
      attempts < maxAttempts
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const pollResponse = await firstValueFrom(
        this.httpService.get(
          `https://api.replicate.com/v1/predictions/${predictionId}`,
          {
            headers: { Authorization: `Token ${apiKey}` },
          },
        ),
      );
      result = pollResponse.data;
      attempts++;
    }

    if (result.status === "failed" || attempts >= maxAttempts) {
      throw new Error("Replicate generation failed or timed out");
    }

    return result.output[0];
  }

  /**
   * 使用 Together AI API
   */
  private async generateWithTogether(
    apiKey: string,
    modelId: string,
    prompt: string,
    dimensions: { width: number; height: number },
  ): Promise<string> {
    const response = await firstValueFrom(
      this.httpService.post(
        "https://api.together.xyz/v1/images/generations",
        {
          model: modelId || "black-forest-labs/FLUX.1-schnell-Free",
          prompt,
          width: dimensions.width,
          height: dimensions.height,
          n: 1,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
        },
      ),
    );

    return response.data.data[0].url || response.data.data[0].b64_json
      ? `data:image/png;base64,${response.data.data[0].b64_json}`
      : response.data.data[0].url;
  }

  /**
   * OpenAI 兼容 API
   */
  private async generateWithOpenAICompatible(
    apiKey: string,
    apiEndpoint: string | null,
    modelId: string,
    prompt: string,
    dimensions: { width: number; height: number },
  ): Promise<string> {
    const baseUrl = apiEndpoint || "https://api.openai.com/v1";
    const url = `${baseUrl}/images/generations`;

    const response = await firstValueFrom(
      this.httpService.post(
        url,
        {
          model: modelId,
          prompt,
          n: 1,
          size: `${dimensions.width}x${dimensions.height}`,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
        },
      ),
    );

    return (
      response.data.data[0].url ||
      (response.data.data[0].b64_json
        ? `data:image/png;base64,${response.data.data[0].b64_json}`
        : null)
    );
  }

  // ============ 历史记录 ============

  /**
   * 获取用户生成历史
   */
  async getHistory(userId?: string): Promise<GeneratedImageResult[]> {
    const images = await this.prisma.generatedImage.findMany({
      where: userId ? { userId } : {},
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return images.map((img) => ({
      id: img.id,
      imageUrl: img.imageUrl,
      prompt: img.prompt,
      enhancedPrompt: img.enhancedPrompt || undefined,
      width: img.width,
      height: img.height,
      isBookmarked: img.isBookmarked || false,
      createdAt: img.createdAt.toISOString(),
    }));
  }

  /**
   * 获取单个图片
   */
  async getImage(id: string): Promise<GeneratedImageResult | null> {
    const image = await this.prisma.generatedImage.findUnique({
      where: { id },
    });

    if (!image) return null;

    return {
      id: image.id,
      imageUrl: image.imageUrl,
      prompt: image.prompt,
      enhancedPrompt: image.enhancedPrompt || undefined,
      width: image.width,
      height: image.height,
      createdAt: image.createdAt.toISOString(),
    };
  }

  /**
   * 删除图片
   */
  async deleteImage(
    id: string,
    userId?: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      // 验证图片存在且属于该用户
      const image = await this.prisma.generatedImage.findUnique({
        where: { id },
      });

      if (!image) {
        return { success: false, message: "Image not found" };
      }

      if (userId && image.userId && image.userId !== userId) {
        return {
          success: false,
          message: "Not authorized to delete this image",
        };
      }

      await this.prisma.generatedImage.delete({
        where: { id },
      });

      this.logger.log(`Deleted image: ${id}`);
      return { success: true, message: "Image deleted successfully" };
    } catch (error) {
      this.logger.error(`Failed to delete image ${id}:`, error);
      return { success: false, message: "Failed to delete image" };
    }
  }

  /**
   * 获取用户收藏的图片
   */
  async getBookmarkedImages(userId?: string) {
    try {
      const images = await this.prisma.generatedImage.findMany({
        where: {
          userId,
          isBookmarked: true,
        },
        orderBy: { createdAt: "desc" },
      });

      return images.map((img) => ({
        id: img.id,
        prompt: img.prompt,
        enhancedPrompt: img.enhancedPrompt,
        imageUrl: img.imageUrl,
        width: img.width,
        height: img.height,
        createdAt: img.createdAt,
        isBookmarked: img.isBookmarked,
      }));
    } catch (error) {
      this.logger.error("Failed to get bookmarked images:", error);
      return [];
    }
  }

  /**
   * 添加书签
   */
  async addBookmark(
    id: string,
    _userId?: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const image = await this.prisma.generatedImage.findUnique({
        where: { id },
      });

      if (!image) {
        return { success: false, message: "Image not found" };
      }

      await this.prisma.generatedImage.update({
        where: { id },
        data: { isBookmarked: true },
      });

      this.logger.log(`Bookmarked image: ${id}`);
      return { success: true, message: "Image bookmarked" };
    } catch (error) {
      this.logger.error(`Failed to bookmark image ${id}:`, error);
      return { success: false, message: "Failed to bookmark image" };
    }
  }

  /**
   * 移除书签
   */
  async removeBookmark(
    id: string,
    _userId?: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const image = await this.prisma.generatedImage.findUnique({
        where: { id },
      });

      if (!image) {
        return { success: false, message: "Image not found" };
      }

      await this.prisma.generatedImage.update({
        where: { id },
        data: { isBookmarked: false },
      });

      this.logger.log(`Removed bookmark from image: ${id}`);
      return { success: true, message: "Bookmark removed" };
    } catch (error) {
      this.logger.error(`Failed to remove bookmark from image ${id}:`, error);
      return { success: false, message: "Failed to remove bookmark" };
    }
  }
}
