/**
 * 文档内容生成服务
 * 基于模板和内容特征生成高质量的文档内容
 */

import { Injectable, Logger } from "@nestjs/common";
import { AiChatService } from "../../../ai-engine/llm/services/ai-chat.service";
import { AIModelService } from "../core/ai-model.service";
import {
  DOCS_CONTENT_GENERATION_SYSTEM_PROMPT,
  DOCS_SECTION_USER_PROMPT,
} from "../prompts";
// SectionFeatures and ParagraphFeatures may be used in future content analysis
import {
  DocsTemplateType,
  ImageRequirement,
  ImageType,
  VisualBreakType,
} from "../common/template-selection.types";
import { DocsSectionPlanItem } from "../common/template-selection.service";
import { ImagePrompt } from "../common/image-matching.service";

/**
 * 生成的章节内容
 */
export interface GeneratedSectionContent {
  sectionId: string;
  templateType: DocsTemplateType;
  title: string;
  content: {
    markdown: string;
    structuredData?: Record<string, unknown>;
  };
  wordCount: number;
  imagePrompts: ImagePrompt[];
  visualBreaks: Array<{
    afterParagraph: number;
    type: VisualBreakType;
    content?: string;
  }>;
  metadata: {
    generatedAt: string;
    modelUsed: string;
    tokensUsed?: number;
  };
}

/**
 * 完整报告内容
 */
export interface GeneratedReportContent {
  title: string;
  subtitle?: string;
  sections: GeneratedSectionContent[];
  totalWordCount: number;
  totalImageCount: number;
  generationTime: number;
  metadata: {
    generatedAt: string;
    modelUsed: string;
  };
}

@Injectable()
export class DocsGeneratorService {
  private readonly logger = new Logger(DocsGeneratorService.name);

  constructor(
    private readonly aiModelService: AIModelService,
    private readonly aiChatService: AiChatService,
  ) {}

  /**
   * 生成完整报告内容
   */
  async generateReport(
    title: string,
    sourceContent: string,
    sectionPlans: DocsSectionPlanItem[],
    options: {
      language?: "zh-CN" | "en-US";
      style?: "formal" | "casual" | "technical";
      detailLevel?: 1 | 2 | 3;
      targetAudience?: string;
      modelId?: string;
    } = {},
  ): Promise<GeneratedReportContent> {
    const startTime = Date.now();
    const sections: GeneratedSectionContent[] = [];

    // 生成大纲上下文
    const outlineContext = sectionPlans
      .map((s, i) => `${i + 1}. ${s.title} (${s.templateType})`)
      .join("\n");

    // 逐章节生成
    for (let i = 0; i < sectionPlans.length; i++) {
      const plan = sectionPlans[i];
      const previousSection = i > 0 ? sectionPlans[i - 1] : null;
      const nextSection =
        i < sectionPlans.length - 1 ? sectionPlans[i + 1] : null;

      const sectionContent = await this.generateSection(plan, {
        sourceContent,
        outlineContext,
        previousSection: previousSection?.title,
        nextSection: nextSection?.title,
        ...options,
      });

      sections.push(sectionContent);

      this.logger.log(
        `Generated section ${i + 1}/${sectionPlans.length}: ${plan.title}`,
      );
    }

    // 计算统计
    const totalWordCount = sections.reduce((sum, s) => sum + s.wordCount, 0);
    const totalImageCount = sections.reduce(
      (sum, s) => sum + s.imagePrompts.length,
      0,
    );

    return {
      title,
      sections,
      totalWordCount,
      totalImageCount,
      generationTime: Date.now() - startTime,
      metadata: {
        generatedAt: new Date().toISOString(),
        modelUsed: options.modelId || "gpt-4o",
      },
    };
  }

  /**
   * 生成单个章节内容
   */
  async generateSection(
    plan: DocsSectionPlanItem,
    context: {
      sourceContent: string;
      outlineContext: string;
      previousSection?: string;
      nextSection?: string;
      language?: "zh-CN" | "en-US";
      style?: "formal" | "casual" | "technical";
      detailLevel?: 1 | 2 | 3;
      targetAudience?: string;
      modelId?: string;
    },
  ): Promise<GeneratedSectionContent> {
    const {
      sourceContent,
      outlineContext,
      previousSection,
      nextSection,
      language = "zh-CN",
      style = "formal",
      detailLevel = 2,
      targetAudience = "专业人士",
      modelId,
    } = context;

    // 构建用户提示词
    const userPrompt = DOCS_SECTION_USER_PROMPT.replace(
      "{{sectionOrder}}",
      String(plan.order + 1),
    )
      .replace("{{templateType}}", plan.templateType)
      .replace("{{title}}", plan.title)
      .replace("{{estimatedWordCount}}", String(plan.estimatedWordCount))
      .replace("{{sourceContent}}", this.truncateContent(sourceContent, 6000))
      .replace("{{language}}", language)
      .replace("{{style}}", style)
      .replace("{{targetAudience}}", targetAudience)
      .replace("{{detailLevel}}", this.getDetailLevelDescription(detailLevel))
      .replace("{{previousSection}}", previousSection || "无")
      .replace("{{nextSection}}", nextSection || "无")
      .replace("{{outline}}", outlineContext);

    // 获取模型配置
    const model = await this.aiModelService.getDefaultTextModel(modelId);

    // 调用 AI 生成内容
    const response = await this.aiChatService.generateChatCompletionWithKey({
      provider: model.provider,
      modelId: model.modelId,
      apiKey: model.apiKey || "",
      systemPrompt: this.buildSystemPrompt(plan.templateType),
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.7,
      maxTokens: plan.estimatedWordCount * 2,
    });

    // 解析响应
    const parsedContent = this.parseGeneratedContent(
      response.content,
      plan.templateType,
    );

    // 生成图片提示词
    const imagePrompts = await this.generateImagePrompts(
      plan.imageRequirements,
      plan.title,
      parsedContent.markdown,
    );

    // 确定视觉休息点
    const visualBreaks = this.determineVisualBreaks(
      parsedContent.markdown,
      plan.visualBreaks,
    );

    return {
      sectionId: `section-${plan.order}`,
      templateType: plan.templateType,
      title: plan.title,
      content: parsedContent,
      wordCount: this.countWords(parsedContent.markdown),
      imagePrompts,
      visualBreaks,
      metadata: {
        generatedAt: new Date().toISOString(),
        modelUsed: modelId || "gpt-4o",
      },
    };
  }

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(templateType: DocsTemplateType): string {
    const templateInstructions = this.getTemplateInstructions(templateType);
    return `${DOCS_CONTENT_GENERATION_SYSTEM_PROMPT}\n\n## 当前模板要求\n\n${templateInstructions}`;
  }

  /**
   * 获取模板专用指令
   */
  private getTemplateInstructions(templateType: DocsTemplateType): string {
    const instructions: Record<DocsTemplateType, string> = {
      executiveSummary: `
### 执行摘要模板
- 300-500字概述全文核心
- 3-5个关键发现，使用要点列表
- 核心数据指标（如有）
- 主要建议（1-2条）
- 不引入正文未涉及的新信息
- 适合5分钟快速阅读`,

      introduction: `
### 引言模板
- 背景介绍：为什么这个话题重要
- 目的说明：本报告要解决什么问题
- 范围界定：覆盖哪些方面，不覆盖哪些
- 方法简述：如何进行研究/分析
- 结构预览：后续章节概要`,

      conclusion: `
### 结论模板
- 总结核心发现（3-5条）
- 重申关键建议
- 行动号召：下一步具体行动
- 前瞻展望：未来趋势或机会
- 不引入新的论证内容`,

      appendix: `
### 附录模板
- 详细数据表格
- 参考文献列表
- 术语表
- 方法论详细说明
- 补充图表`,

      analysis: `
### 深度分析模板
- 分析框架说明
- 多维度论证
- 数据支撑观点
- 逻辑推理过程
- 洞察和发现
- 图表配合文字`,

      comparison: `
### 对比分析模板
- 明确对比对象
- 统一对比维度
- 客观评价标准
- 表格化呈现
- 综合评价和建议`,

      caseStudy: `
### 案例研究模板
- 案例背景（公司/行业）
- 面临挑战
- 解决方案
- 实施过程
- 量化结果
- 经验总结
- 引用或证言`,

      dataReport: `
### 数据报告模板
- 数据来源说明
- 核心指标展示
- 趋势分析
- 异常值解读
- 数据可视化建议
- 结论和洞察`,

      statistics: `
### 统计分析模板
- 研究方法说明
- 统计指标
- 置信区间
- 相关性分析
- 结果解读
- 技术注释`,

      methodology: `
### 方法论模板
- 研究方法概述
- 步骤详解
- 工具和技术
- 数据来源
- 局限性说明
- 验证方法`,

      recommendations: `
### 建议模板
- 建议优先级排序
- 每条建议包含：标题、描述、理由
- 时间框架
- 资源需求
- 预期效果
- 依赖关系`,

      actionPlan: `
### 行动计划模板
- 目标设定
- 阶段划分
- 具体活动
- 责任人
- 时间节点
- 里程碑
- 成功标准`,

      riskAssessment: `
### 风险评估模板
- 风险识别
- 概率/影响评估
- 风险矩阵
- 缓解策略
- 应急预案
- 责任人
- 监控机制`,

      narrative: `
### 叙事模板
- 故事性开头
- 情境描述
- 发展过程
- 转折点
- 结果和影响
- 可以适当使用引用`,

      timeline: `
### 时间线模板
- 关键时间节点
- 每个节点：时间、事件、意义
- 时间线可视化建议
- 阶段性总结
- 未来展望`,

      process: `
### 流程说明模板
- 流程概述
- 步骤详解（编号）
- 每步骤：操作、输入/输出、负责人
- 注意事项
- 常见问题
- 最佳实践`,
    };

    return instructions[templateType] || "";
  }

  /**
   * 解析生成的内容
   */
  private parseGeneratedContent(
    response: string,
    templateType: DocsTemplateType,
  ): { markdown: string; structuredData?: Record<string, unknown> } {
    // 尝试提取 JSON 结构化数据
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    let structuredData: Record<string, unknown> | undefined;

    if (jsonMatch) {
      try {
        structuredData = JSON.parse(jsonMatch[1]);
      } catch {
        // 忽略解析错误
      }
    }

    // 移除 JSON 块，保留 Markdown
    let markdown = response.replace(/```json\s*[\s\S]*?\s*```/g, "").trim();

    // 如果响应主要是 JSON，从结构化数据生成 Markdown
    if (!markdown && structuredData) {
      markdown = this.structuredDataToMarkdown(structuredData, templateType);
    }

    return { markdown, structuredData };
  }

  /**
   * 结构化数据转 Markdown
   */
  private structuredDataToMarkdown(
    data: Record<string, unknown>,
    templateType: DocsTemplateType,
  ): string {
    const lines: string[] = [];

    // 根据模板类型转换
    if (templateType === "executiveSummary") {
      if (data.overview) lines.push(String(data.overview), "");
      if (Array.isArray(data.keyFindings)) {
        lines.push("## 关键发现", "");
        data.keyFindings.forEach((finding: Record<string, unknown>) => {
          lines.push(`- **${finding.title}**: ${finding.description}`);
        });
        lines.push("");
      }
      if (Array.isArray(data.recommendations)) {
        lines.push("## 主要建议", "");
        data.recommendations.forEach((rec: string) => {
          lines.push(`- ${rec}`);
        });
      }
    } else {
      // 通用转换
      Object.entries(data).forEach(([key, value]) => {
        if (typeof value === "string") {
          lines.push(value, "");
        } else if (Array.isArray(value)) {
          lines.push(`## ${key}`, "");
          value.forEach((item) => {
            if (typeof item === "string") {
              lines.push(`- ${item}`);
            } else if (typeof item === "object") {
              lines.push(`- ${JSON.stringify(item)}`);
            }
          });
          lines.push("");
        }
      });
    }

    return lines.join("\n");
  }

  /**
   * 生成图片提示词
   */
  private async generateImagePrompts(
    requirements: ImageRequirement[],
    sectionTitle: string,
    content: string,
  ): Promise<ImagePrompt[]> {
    const prompts: ImagePrompt[] = [];

    for (const req of requirements) {
      const prompt = this.buildImagePromptFromRequirement(
        req,
        sectionTitle,
        content,
      );
      prompts.push(prompt);
    }

    return prompts;
  }

  /**
   * 从需求构建图片提示词
   */
  private buildImagePromptFromRequirement(
    requirement: ImageRequirement,
    sectionTitle: string,
    _content: string,
  ): ImagePrompt {
    const keywords =
      requirement.keywords.length > 0
        ? requirement.keywords.join(", ")
        : sectionTitle;

    const styleMap: Record<ImageType, { prefix: string; style: string }> = {
      [ImageType.INFOGRAPHIC]: {
        prefix: "Professional business infographic showing",
        style: "infographic",
      },
      [ImageType.CHART]: {
        prefix: "Modern data visualization chart displaying",
        style: "chart",
      },
      [ImageType.DIAGRAM]: {
        prefix: "Clean technical diagram illustrating",
        style: "diagram",
      },
      [ImageType.PHOTO_BUSINESS]: {
        prefix: "Professional business photography showing",
        style: "photo",
      },
      [ImageType.ILLUSTRATION_FLAT]: {
        prefix: "Modern flat design illustration of",
        style: "illustration",
      },
      [ImageType.ICON]: {
        prefix: "Minimalist icon representing",
        style: "icon",
      },
      [ImageType.PHOTO_TECHNOLOGY]: {
        prefix: "Modern technology photograph featuring",
        style: "photo",
      },
      [ImageType.PHOTO_PEOPLE]: {
        prefix: "Professional portrait showing",
        style: "photo",
      },
      [ImageType.PHOTO_ABSTRACT]: {
        prefix: "Abstract conceptual photograph representing",
        style: "photo",
      },
      [ImageType.ILLUSTRATION_3D]: {
        prefix: "3D rendered illustration showing",
        style: "3d",
      },
      [ImageType.ILLUSTRATION_ISOMETRIC]: {
        prefix: "Isometric illustration depicting",
        style: "isometric",
      },
      [ImageType.BACKGROUND]: {
        prefix: "Abstract professional background with",
        style: "background",
      },
      [ImageType.PATTERN]: {
        prefix: "Seamless geometric pattern with",
        style: "pattern",
      },
      [ImageType.DECORATION]: {
        prefix: "Decorative graphic element featuring",
        style: "decoration",
      },
    };

    const config =
      styleMap[requirement.type] || styleMap[ImageType.ILLUSTRATION_FLAT];

    return {
      prompt: `${config.prefix} ${requirement.description}, ${keywords}, clean design, professional style, high quality`,
      promptZh: `${requirement.description}，${keywords}，简洁设计，专业风格`,
      negativePrompt: "blurry, low quality, text, watermark, distorted",
      style: config.style,
      aspectRatio: requirement.aspectRatio || "16:9",
      suggestedModel: "dalle3",
    };
  }

  /**
   * 确定视觉休息点
   */
  private determineVisualBreaks(
    markdown: string,
    plannedBreaks: VisualBreakType[],
  ): Array<{
    afterParagraph: number;
    type: VisualBreakType;
    content?: string;
  }> {
    const paragraphs = markdown.split(/\n\s*\n/).filter((p) => p.trim());
    const breaks: Array<{
      afterParagraph: number;
      type: VisualBreakType;
      content?: string;
    }> = [];

    // 每3-4段插入一个视觉休息
    const breakFrequency = 3;
    let breakIndex = 0;

    for (
      let i = breakFrequency;
      i < paragraphs.length;
      i += breakFrequency + 1
    ) {
      const breakType =
        plannedBreaks[breakIndex % plannedBreaks.length] ||
        VisualBreakType.DIVIDER;
      breaks.push({
        afterParagraph: i,
        type: breakType,
      });
      breakIndex++;
    }

    return breaks;
  }

  /**
   * 截断内容
   */
  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + "\n\n[内容已截断...]";
  }

  /**
   * 获取详细程度描述
   */
  private getDetailLevelDescription(level: 1 | 2 | 3): string {
    switch (level) {
      case 1:
        return "简洁版 - 只保留核心要点，适合快速阅读";
      case 2:
        return "标准版 - 包含必要的论证和数据支撑";
      case 3:
        return "详尽版 - 深度分析，完整论证，丰富案例";
      default:
        return "标准版";
    }
  }

  /**
   * 计算字数
   */
  private countWords(text: string): number {
    // 中文按字符，英文按单词
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    return chineseChars + englishWords;
  }

  /**
   * 流式生成报告（用于实时反馈）
   */
  async *generateReportStream(
    title: string,
    sourceContent: string,
    sectionPlans: DocsSectionPlanItem[],
    options: {
      language?: "zh-CN" | "en-US";
      style?: "formal" | "casual" | "technical";
      detailLevel?: 1 | 2 | 3;
      targetAudience?: string;
      modelId?: string;
    } = {},
  ): AsyncGenerator<{
    type: "progress" | "section_complete" | "complete" | "error";
    data: unknown;
  }> {
    const startTime = Date.now();
    const sections: GeneratedSectionContent[] = [];

    const outlineContext = sectionPlans
      .map((s, i) => `${i + 1}. ${s.title} (${s.templateType})`)
      .join("\n");

    try {
      for (let i = 0; i < sectionPlans.length; i++) {
        const plan = sectionPlans[i];

        // 发送进度
        yield {
          type: "progress",
          data: {
            currentSection: i + 1,
            totalSections: sectionPlans.length,
            sectionTitle: plan.title,
            percentage: Math.round((i / sectionPlans.length) * 100),
          },
        };

        const previousSection = i > 0 ? sectionPlans[i - 1] : null;
        const nextSection =
          i < sectionPlans.length - 1 ? sectionPlans[i + 1] : null;

        const sectionContent = await this.generateSection(plan, {
          sourceContent,
          outlineContext,
          previousSection: previousSection?.title,
          nextSection: nextSection?.title,
          ...options,
        });

        sections.push(sectionContent);

        // 发送章节完成
        yield {
          type: "section_complete",
          data: {
            sectionIndex: i,
            sectionId: sectionContent.sectionId,
            title: sectionContent.title,
            wordCount: sectionContent.wordCount,
          },
        };
      }

      // 发送完成
      const totalWordCount = sections.reduce((sum, s) => sum + s.wordCount, 0);
      const totalImageCount = sections.reduce(
        (sum, s) => sum + s.imagePrompts.length,
        0,
      );

      yield {
        type: "complete",
        data: {
          title,
          totalSections: sections.length,
          totalWordCount,
          totalImageCount,
          generationTime: Date.now() - startTime,
        },
      };
    } catch (error) {
      yield {
        type: "error",
        data: {
          message: error instanceof Error ? error.message : "Unknown error",
        },
      };
    }
  }
}
