import { Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { AiChatService, ChatMessage } from "../../../ai-engine/llm/services/ai-chat.service";
import { AIModelService } from "../core";
import {
  DocumentsService,
  OfficeDocumentType,
  VersionTrigger,
} from "../document-management";
import { CreditsService } from "../../../credits/credits.service";

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface GenerationConfig {
  documentType: OfficeDocumentType;
  title: string;
  prompt: string;
  resourceIds?: string[];
  style?: string;
  language?: "zh-CN" | "en-US";
  detailLevel?: 1 | 2 | 3; // 1=简洁, 2=适中, 3=详细
  slideCount?: number; // PPT专用
  textModelId?: string; // 用户指定的文本模型
  imageModelId?: string; // 用户指定的图像模型
}

export interface GenerationResult {
  documentId: string;
  content: {
    markdown: string;
    structured?: any; // PPT等需要结构化数据
  };
  metadata: {
    slideCount?: number;
    wordCount: number;
    generationTime: number;
    textModel: string;
    imageModel?: string;
  };
}

export interface StreamChunk {
  type: "content" | "progress" | "error" | "done";
  content?: string;
  progress?: {
    step: string;
    percentage: number;
    message: string;
  };
  error?: string;
}

// ============================================================================
// Document Generation Service
// 双引擎架构：文本推理 + 图形渲染
// ============================================================================

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiChatService: AiChatService,
    private readonly aiModelService: AIModelService,
    private readonly documentService: DocumentsService,
    @Optional() private readonly creditsService: CreditsService,
  ) {}

  /**
   * 生成文档（流式）
   * Phase 1: 使用文本模型生成内容结构
   * Phase 2: （可选）使用图像模型生成配图
   */
  async *generateDocument(
    userId: string,
    config: GenerationConfig,
  ): AsyncGenerator<StreamChunk> {
    const startTime = Date.now();
    this.logger.log(
      `[generateDocument] Starting generation for user ${userId}`,
    );

    // 根据文档类型确定积分消耗
    const creditsMap: Record<OfficeDocumentType, number> = {
      PPT: 300,
      ARTICLE: 200,
      SPREADSHEET: 150,
      REPORT: 200,
      PROPOSAL: 250,
      RESEARCH: 300,
    };
    const estimatedCredits = creditsMap[config.documentType] || 200;

    // 积分检查
    if (this.creditsService) {
      const balanceCheck = await this.creditsService.checkBalance(
        userId,
        estimatedCredits,
      );
      if (!balanceCheck.sufficient) {
        yield {
          type: "error",
          error: `积分不足：需要 ${estimatedCredits} 积分，当前余额 ${balanceCheck.balance}`,
        };
        return;
      }
    }

    try {
      // Step 1: 获取 AI 模型配置
      yield {
        type: "progress",
        progress: {
          step: "init",
          percentage: 5,
          message: "正在初始化 AI 模型...",
        },
      };

      const textModel = await this.aiModelService.getDefaultTextModel(
        config.textModelId,
      );
      this.logger.log(
        `[generateDocument] Using text model: ${textModel.displayName}`,
      );

      // Step 2: 获取引用的资源内容
      yield {
        type: "progress",
        progress: {
          step: "resources",
          percentage: 10,
          message: "正在分析引用资源...",
        },
      };

      let resourceContext = "";
      if (config.resourceIds && config.resourceIds.length > 0) {
        const resources = await this.prisma.resource.findMany({
          where: { id: { in: config.resourceIds } },
          select: {
            id: true,
            title: true,
            type: true,
            aiSummary: true,
            abstract: true,
            content: true,
          },
        });

        resourceContext = this.buildResourceContext(resources);
        this.logger.log(
          `[generateDocument] Loaded ${resources.length} resources`,
        );
      }

      // Step 3: 构建生成 Prompt
      yield {
        type: "progress",
        progress: {
          step: "prompt",
          percentage: 15,
          message: "正在构建生成策略...",
        },
      };

      const systemPrompt = this.buildSystemPrompt(config);
      const userPrompt = this.buildUserPrompt(config, resourceContext);

      // Step 4: 调用 AI 生成内容（流式）
      yield {
        type: "progress",
        progress: {
          step: "generate",
          percentage: 20,
          message: "AI 正在生成内容...",
        },
      };

      // 调用 AI API
      const generatedContent = await this.callAIService(
        textModel,
        systemPrompt,
        userPrompt,
      );

      // Step 5: 后处理和结构化
      yield {
        type: "progress",
        progress: {
          step: "process",
          percentage: 85,
          message: "正在优化文档结构...",
        },
      };

      const processedContent = this.postProcessContent(
        config.documentType,
        generatedContent,
      );

      // Step 6: 保存文档
      yield {
        type: "progress",
        progress: {
          step: "save",
          percentage: 95,
          message: "正在保存文档...",
        },
      };

      // 计算元数据
      const slideCount =
        config.documentType === "PPT"
          ? this.countSlides(processedContent)
          : undefined;
      const wordCount = processedContent.replace(/[#\-*_\[\]()]/g, "").length;

      // 创建文档
      const document = await this.documentService.createDocument(userId, {
        title: config.title,
        type: config.documentType,
        resourceIds: config.resourceIds,
        aiConfig: {
          textModelId: textModel.id,
          imageModelId: config.imageModelId,
          temperature: 0.7,
          style: config.style ?? "genspark",
        },
      });

      // 更新文档内容
      await this.documentService.updateDocument(document.id, userId, {
        content: {
          markdown: processedContent,
        },
        markdown: processedContent,
        metadata: {
          slideCount,
          wordCount,
          generationTime: Date.now() - startTime,
        },
        status: "COMPLETED",
      });

      // 自动保存版本
      await this.documentService.createVersion(document.id, userId, {
        trigger: "AI_GENERATION" as VersionTrigger,
        triggerSource: textModel.displayName,
        description: `AI 生成 ${config.title}`,
      });

      // 扣减积分
      if (this.creditsService) {
        try {
          await this.creditsService.consumeCredits({
            userId,
            moduleType: "ai-office",
            operationType: `generate-${config.documentType.toLowerCase()}`,
            referenceId: document.id,
            description: `AI Office - 生成 ${config.documentType} "${config.title}"`,
          });
          this.logger.log(
            `[generateDocument] Credits consumed: ${estimatedCredits} for ${config.documentType}`,
          );
        } catch (creditError) {
          this.logger.warn(
            `[generateDocument] Failed to consume credits: ${creditError}`,
          );
          // 积分扣减失败不应阻止文档生成完成
        }
      }

      // 完成
      yield {
        type: "progress",
        progress: {
          step: "done",
          percentage: 100,
          message: "文档生成完成！",
        },
      };

      yield {
        type: "content",
        content: processedContent,
      };

      yield { type: "done" };

      this.logger.log(
        `[generateDocument] Generation completed in ${Date.now() - startTime}ms`,
      );
    } catch (error) {
      this.logger.error(`[generateDocument] Error: ${error}`);
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "生成失败，请重试",
      };
    }
  }

  // ==========================================================================
  // Prompt 构建
  // ==========================================================================

  private buildSystemPrompt(config: GenerationConfig): string {
    const basePrompt = `你是一个专业的文档生成助手。请根据用户的需求生成高质量的${this.getDocumentTypeLabel(config.documentType)}内容。

要求：
- 语言：${config.language === "en-US" ? "英文" : "中文"}
- 详细程度：${config.detailLevel === 1 ? "简洁扼要" : config.detailLevel === 2 ? "适中详细" : "非常详细"}
- 风格：专业、清晰、有逻辑`;

    if (config.documentType === "PPT") {
      return `${basePrompt}

PPT 生成规范：
1. 使用 Markdown 格式
2. 每张幻灯片以 "### Slide X: 标题" 开头
3. 使用 "---" 分隔不同幻灯片
4. 支持智能可视化标记：
   - <!-- FLOW --> 流程图
   - <!-- CHART:line --> 折线图
   - <!-- CHART:pie --> 饼图
   - <!-- CHART:bar --> 柱状图
   - <!-- MATRIX --> 矩阵分析
5. 内容使用列表格式，简洁专业
6. 重要数据使用 **粗体** 强调
7. 目标页数：${config.slideCount || 8} 页`;
    }

    if (config.documentType === "ARTICLE") {
      return `${basePrompt}

文章生成规范：
1. 使用 Markdown 格式
2. 包含清晰的标题层级（#, ##, ###）
3. 适当使用列表、引用、代码块
4. 段落结构清晰，逻辑连贯`;
    }

    return basePrompt;
  }

  private buildUserPrompt(
    config: GenerationConfig,
    resourceContext: string,
  ): string {
    let prompt = `请生成一份关于"${config.title}"的${this.getDocumentTypeLabel(config.documentType)}。

用户要求：
${config.prompt}`;

    if (resourceContext) {
      prompt += `

参考资料（请基于以下内容进行创作）：
${resourceContext}`;
    }

    return prompt;
  }

  private buildResourceContext(resources: any[]): string {
    return resources
      .map((r, i) => {
        const summary = r.aiSummary || r.abstract || "";
        return `【资源 ${i + 1}: ${r.title}】
类型: ${r.type}
摘要: ${summary.substring(0, 500)}${summary.length > 500 ? "..." : ""}
`;
      })
      .join("\n\n");
  }

  // ==========================================================================
  // AI 服务调用
  // ==========================================================================

  /**
   * 调用真实 AI 服务生成文档内容
   * 使用 AiChatService.generateChatCompletionWithKey 方法
   */
  private async callAIService(
    model: any,
    systemPrompt: string,
    userPrompt: string,
    onChunk?: (chunk: string) => void,
  ): Promise<string> {
    this.logger.log(
      `[callAIService] Calling ${model.provider} with model ${model.modelId}`,
    );

    try {
      // 构建消息列表
      const messages: ChatMessage[] = [{ role: "user", content: userPrompt }];

      // 调用真实 AI 服务
      const result = await this.aiChatService.generateChatCompletionWithKey({
        provider: model.provider,
        modelId: model.modelId,
        apiKey: model.apiKey || "",
        apiEndpoint: model.apiEndpoint || undefined,
        systemPrompt: systemPrompt,
        messages: messages,
        maxTokens: model.maxTokens || 4096,
        temperature: model.temperature || 0.7,
      });

      this.logger.log(
        `[callAIService] AI response received, content length: ${result.content.length}, tokens: ${result.tokensUsed}`,
      );

      // 如果提供了回调，通知内容
      if (onChunk && result.content) {
        onChunk(result.content);
      }

      return result.content;
    } catch (error) {
      this.logger.error(`[callAIService] AI call failed: ${error}`);

      // 返回错误提示内容
      return `### 生成失败

抱歉，AI 服务调用失败。

**错误信息**: ${error instanceof Error ? error.message : "未知错误"}

**可能的解决方案**:
1. 检查 AI 模型配置是否正确
2. 确认 API Key 已正确设置
3. 检查网络连接是否正常

请稍后重试或联系管理员。`;
    }
  }

  // ==========================================================================
  // 后处理
  // ==========================================================================

  private postProcessContent(
    type: OfficeDocumentType,
    content: string,
  ): string {
    // 清理多余空行
    let processed = content.replace(/\n{3,}/g, "\n\n");

    // 确保 PPT 格式正确
    if (type === "PPT") {
      // 确保幻灯片分隔符格式一致
      processed = processed.replace(/\n---\n/g, "\n\n---\n\n");
    }

    return processed.trim();
  }

  private countSlides(content: string): number {
    // 统计 "### Slide" 或 "---" 分隔的数量
    const slideHeaders = content.match(/^###\s*Slide/gm) || [];
    const separators = content.split(/^---$/m);
    return Math.max(slideHeaders.length, separators.length);
  }

  private getDocumentTypeLabel(type: OfficeDocumentType): string {
    const labels: Record<OfficeDocumentType, string> = {
      ARTICLE: "文章",
      PPT: "PPT演示文稿",
      SPREADSHEET: "数据表格",
      REPORT: "分析报告",
      PROPOSAL: "提案方案",
      RESEARCH: "研究文档",
    };
    return labels[type] || "文档";
  }
}
