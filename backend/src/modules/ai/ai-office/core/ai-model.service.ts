import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { AIModelType } from "@prisma/client";

/**
 * AI 模型动态配置服务
 * 严禁硬编码模型名称！所有模型选择都通过此服务获取
 */
@Injectable()
export class AIModelService {
  private readonly logger = new Logger(AIModelService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取默认文本模型 (用于推理、生成)
   * 优先级: 用户选择 > 系统默认 (isDefault=true) > 任意启用的模型
   *
   * @param userModelId 用户指定的模型ID (可选)
   * @returns AIModel 实体
   */
  async getDefaultTextModel(userModelId?: string) {
    this.logger.debug(
      `[getDefaultTextModel] Looking for text model, userModelId: ${userModelId || "none"}`,
    );

    // 1. 用户指定了模型
    if (userModelId) {
      const userModel = await this.prisma.aIModel.findFirst({
        where: { id: userModelId, isEnabled: true },
      });
      if (userModel) {
        this.logger.debug(
          `[getDefaultTextModel] Using user specified model: ${userModel.displayName}`,
        );
        return userModel;
      }
      this.logger.warn(
        `[getDefaultTextModel] User specified model ${userModelId} not found or disabled`,
      );
    }

    // 2. 查找系统默认文本模型
    const defaultModel = await this.prisma.aIModel.findFirst({
      where: {
        modelType: AIModelType.CHAT,
        isDefault: true,
        isEnabled: true,
      },
    });
    if (defaultModel) {
      this.logger.debug(
        `[getDefaultTextModel] Using system default model: ${defaultModel.displayName}`,
      );
      return defaultModel;
    }

    // 3. Fallback: 任意启用的文本模型
    const anyModel = await this.prisma.aIModel.findFirst({
      where: {
        modelType: AIModelType.CHAT,
        isEnabled: true,
      },
    });
    if (!anyModel) {
      this.logger.error("[getDefaultTextModel] No text model configured!");
      throw new Error(
        "No text model configured. Please configure at least one CHAT model.",
      );
    }

    this.logger.debug(
      `[getDefaultTextModel] Using fallback model: ${anyModel.displayName}`,
    );
    return anyModel;
  }

  /**
   * 获取默认图形生成模型
   *
   * @param userModelId 用户指定的模型ID (可选)
   * @returns AIModel 实体
   */
  async getDefaultImageModel(userModelId?: string) {
    this.logger.debug(
      `[getDefaultImageModel] Looking for image model, userModelId: ${userModelId || "none"}`,
    );

    // 1. 用户指定了模型
    if (userModelId) {
      const userModel = await this.prisma.aIModel.findFirst({
        where: { id: userModelId, isEnabled: true },
      });
      if (userModel) {
        this.logger.debug(
          `[getDefaultImageModel] Using user specified model: ${userModel.displayName}`,
        );
        return userModel;
      }
    }

    // 2. 查找系统默认图像生成模型
    const defaultModel = await this.prisma.aIModel.findFirst({
      where: {
        modelType: AIModelType.IMAGE_GENERATION,
        isDefault: true,
        isEnabled: true,
      },
    });
    if (defaultModel) {
      this.logger.debug(
        `[getDefaultImageModel] Using system default model: ${defaultModel.displayName}`,
      );
      return defaultModel;
    }

    // 3. Fallback: 任意启用的图像生成模型
    const anyModel = await this.prisma.aIModel.findFirst({
      where: {
        modelType: AIModelType.IMAGE_GENERATION,
        isEnabled: true,
      },
    });
    if (!anyModel) {
      this.logger.error("[getDefaultImageModel] No image model configured!");
      throw new Error(
        "No image generation model configured. Please configure at least one IMAGE_GENERATION model.",
      );
    }

    this.logger.debug(
      `[getDefaultImageModel] Using fallback model: ${anyModel.displayName}`,
    );
    return anyModel;
  }

  /**
   * 获取所有可用的文本模型列表 (用于前端下拉选择)
   */
  async getAvailableTextModels() {
    return this.prisma.aIModel.findMany({
      where: {
        modelType: AIModelType.CHAT,
        isEnabled: true,
      },
      select: {
        id: true,
        name: true,
        displayName: true,
        provider: true,
        modelId: true,
        isDefault: true,
        icon: true,
        color: true,
      },
      orderBy: [{ isDefault: "desc" }, { displayName: "asc" }],
    });
  }

  /**
   * 获取所有可用的图像生成模型列表
   */
  async getAvailableImageModels() {
    return this.prisma.aIModel.findMany({
      where: {
        modelType: AIModelType.IMAGE_GENERATION,
        isEnabled: true,
      },
      select: {
        id: true,
        name: true,
        displayName: true,
        provider: true,
        modelId: true,
        isDefault: true,
        icon: true,
        color: true,
      },
      orderBy: [{ isDefault: "desc" }, { displayName: "asc" }],
    });
  }
}
