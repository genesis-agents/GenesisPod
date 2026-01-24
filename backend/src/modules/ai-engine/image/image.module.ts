/**
 * AI Engine - Image Module
 * 图像生成模块
 *
 * 提供统一的图像生成能力：
 * - ImageFactory: 图像生成工厂
 * - 多提供商适配器: Gemini, OpenAI, Stability, Together
 *
 * ★ 密钥管理：优先使用 Secret Manager，回退到直接存储的 apiKey
 */

import { Module, OnModuleInit, Logger } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { SecretsService } from "../../core/secrets/secrets.service";
import { SecretsModule } from "../../core/secrets/secrets.module";
import { AIModelType } from "@prisma/client";

import { ImageFactory } from "./factory/image-factory";
import { GeminiImageAdapter } from "./adapters/gemini-image-adapter";
import { OpenAIImageAdapter } from "./adapters/openai-image-adapter";
import { StabilityImageAdapter } from "./adapters/stability-image-adapter";
import { TogetherImageAdapter } from "./adapters/together-image-adapter";

@Module({
  imports: [HttpModule, PrismaModule, SecretsModule],
  providers: [
    ImageFactory,
    GeminiImageAdapter,
    OpenAIImageAdapter,
    StabilityImageAdapter,
    TogetherImageAdapter,
  ],
  exports: [
    ImageFactory,
    GeminiImageAdapter,
    OpenAIImageAdapter,
    StabilityImageAdapter,
    TogetherImageAdapter,
  ],
})
export class ImageModule implements OnModuleInit {
  private readonly logger = new Logger(ImageModule.name);

  constructor(
    private readonly imageFactory: ImageFactory,
    private readonly geminiAdapter: GeminiImageAdapter,
    private readonly openaiAdapter: OpenAIImageAdapter,
    private readonly stabilityAdapter: StabilityImageAdapter,
    private readonly togetherAdapter: TogetherImageAdapter,
    private readonly prisma: PrismaService,
    private readonly secretsService: SecretsService,
  ) {}

  async onModuleInit() {
    this.logger.log("Initializing Image module...");

    // Register all adapters
    this.imageFactory.registerAdapter(this.geminiAdapter);
    this.imageFactory.registerAdapter(this.openaiAdapter);
    this.imageFactory.registerAdapter(this.stabilityAdapter);
    this.imageFactory.registerAdapter(this.togetherAdapter);

    // Load API keys from database
    await this.loadApiKeysFromDatabase();

    this.logger.log(
      `Image module initialized with ${this.imageFactory.getAllAdapters().length} adapters`,
    );
  }

  /**
   * 从数据库加载 API Keys
   * ★ 优先使用 Secret Manager，回退到直接存储的 apiKey
   */
  private async loadApiKeysFromDatabase(): Promise<void> {
    try {
      const imageModels = await this.prisma.aIModel.findMany({
        where: {
          isEnabled: true,
          modelType: AIModelType.IMAGE_GENERATION,
        },
      });

      for (const model of imageModels) {
        const provider = model.provider.toLowerCase();

        // ★ 统一密钥获取：优先 Secret Manager，回退 apiKey
        let apiKey: string | null = null;
        if (model.secretKey) {
          apiKey = await this.secretsService.getValueInternal(model.secretKey);
          if (apiKey) {
            this.logger.debug(
              `Loaded API key from Secret Manager for ${model.name}`,
            );
          }
        }
        if (!apiKey) {
          apiKey = model.apiKey?.trim() || null;
        }

        if (!apiKey) continue;

        if (provider.includes("google") || provider.includes("gemini")) {
          this.geminiAdapter.setApiKey(apiKey);
          this.logger.debug("Loaded Gemini API key");
        } else if (provider.includes("openai")) {
          this.openaiAdapter.setApiKey(apiKey);
          if (model.apiEndpoint) {
            this.openaiAdapter.setBaseUrl(model.apiEndpoint);
          }
          this.logger.debug("Loaded OpenAI API key");
        } else if (provider.includes("stability")) {
          this.stabilityAdapter.setApiKey(apiKey);
          if (model.apiEndpoint) {
            this.stabilityAdapter.setBaseUrl(model.apiEndpoint);
          }
          this.logger.debug("Loaded Stability API key");
        } else if (provider.includes("together")) {
          this.togetherAdapter.setApiKey(apiKey);
          this.logger.debug("Loaded Together API key");
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to load API keys from database: ${error}`);
    }
  }
}
