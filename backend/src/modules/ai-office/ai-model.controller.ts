import { Controller, Get, UseGuards } from "@nestjs/common";
import { AIModelService } from "./ai-model.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";

/**
 * AI 模型配置接口
 * 提供前端获取可用模型列表，用于用户选择
 */
@Controller("ai-office/models")
@UseGuards(JwtAuthGuard)
export class AIModelController {
  constructor(private readonly aiModelService: AIModelService) {}

  /**
   * 获取可用的文本模型列表
   * GET /ai-office/models/text
   */
  @Get("text")
  async getTextModels() {
    return this.aiModelService.getAvailableTextModels();
  }

  /**
   * 获取可用的图像生成模型列表
   * GET /ai-office/models/image
   */
  @Get("image")
  async getImageModels() {
    return this.aiModelService.getAvailableImageModels();
  }
}
