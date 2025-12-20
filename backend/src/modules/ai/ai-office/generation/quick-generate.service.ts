import { Injectable, HttpException, HttpStatus } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";

@Injectable()
export class QuickGenerateService {
  private readonly aiServiceUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.aiServiceUrl = this.configService.get<string>(
      "AI_SERVICE_URL",
      "http://localhost:5000",
    );
  }

  async generate(params: {
    prompt: string;
    autoResearch?: boolean;
    autoMedia?: boolean;
  }) {
    try {
      // 1. 分析用户意图
      const intent = this.analyzeIntent(params.prompt);

      // 2. 调用AI服务生成文档
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.aiServiceUrl}/api/v1/ai-office/quick-generate`,
          {
            prompt: params.prompt,
            template: intent.template,
            autoResearch: params.autoResearch ?? true,
            autoMedia: params.autoMedia ?? true,
            model: "grok",
          },
          {
            timeout: 60000, // 60秒超时
          },
        ),
      );

      return response.data;
    } catch (error: any) {
      console.error("Quick generate error:", error.message);
      throw new HttpException(
        {
          message: "Document generation failed",
          error: error.response?.data?.detail || error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private analyzeIntent(prompt: string | undefined): {
    template: string;
    confidence: number;
  } {
    if (!prompt) {
      return { template: "tech-blog", confidence: 0.5 };
    }
    const promptLower = prompt.toLowerCase();

    // 商业计划
    if (
      promptLower.includes("business plan") ||
      promptLower.includes("startup") ||
      promptLower.includes("pitch deck") ||
      promptLower.includes("商业计划")
    ) {
      return { template: "business-plan", confidence: 0.9 };
    }

    // 演讲PPT
    if (
      promptLower.includes("presentation") ||
      promptLower.includes("slides") ||
      promptLower.includes("ppt") ||
      promptLower.includes("演讲") ||
      promptLower.includes("幻灯片")
    ) {
      return { template: "academic-presentation", confidence: 0.9 };
    }

    // 学术论文
    if (
      promptLower.includes("research paper") ||
      promptLower.includes("academic") ||
      promptLower.includes("thesis") ||
      promptLower.includes("论文") ||
      promptLower.includes("研究")
    ) {
      return { template: "academic-research-page", confidence: 0.85 };
    }

    // 技术博客
    if (
      promptLower.includes("blog") ||
      promptLower.includes("article") ||
      promptLower.includes("tutorial") ||
      promptLower.includes("博客") ||
      promptLower.includes("教程")
    ) {
      return { template: "tech-blog", confidence: 0.85 };
    }

    // API文档
    if (
      promptLower.includes("api") ||
      promptLower.includes("documentation") ||
      promptLower.includes("api文档")
    ) {
      return { template: "api-documentation", confidence: 0.85 };
    }

    // 对比分析
    if (
      promptLower.includes("compare") ||
      promptLower.includes("comparison") ||
      promptLower.includes("vs") ||
      promptLower.includes("对比")
    ) {
      return { template: "comparison", confidence: 0.8 };
    }

    // 趋势分析
    if (
      promptLower.includes("trend") ||
      promptLower.includes("analysis") ||
      promptLower.includes("forecast") ||
      promptLower.includes("趋势")
    ) {
      return { template: "trend", confidence: 0.8 };
    }

    // 默认使用技术博客模板
    return { template: "tech-blog", confidence: 0.5 };
  }
}
