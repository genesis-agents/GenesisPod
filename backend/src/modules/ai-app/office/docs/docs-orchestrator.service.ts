/**
 * Docs Orchestrator Service
 *
 * AI Docs 生成总调度器
 *
 * 职责：
 * 1. 协调整个文档生成流程
 * 2. 管理内容提取、大纲生成、章节生成各阶段
 * 3. 支持流式输出进度
 * 4. 处理错误和重试
 */

import { Injectable, Logger } from "@nestjs/common";
import { Subject, Observable } from "rxjs";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import {
  ContentExtractorService,
  DataFetchingService,
} from "../../../../common/content-processing";
import { AiChatService, ChatMessage } from "../../../ai-engine/llm/services/ai-chat.service";
import { AIModelService } from "../core";
import {
  DocsGenerationInput,
  DocsDocument,
  DocsOutline,
  DocsSection,
  DocsStreamEvent,
  DocsType,
  DOCS_TEMPLATES,
} from "./docs.types";
import { randomUUID } from "crypto";

@Injectable()
export class DocsOrchestratorService {
  private readonly logger = new Logger(DocsOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contentExtractor: ContentExtractorService,
    private readonly dataFetching: DataFetchingService,
    private readonly aiModelService: AIModelService,
    private readonly aiChatService: AiChatService,
  ) {}

  /**
   * 生成文档（流式）
   */
  generateDocsStream(input: DocsGenerationInput): Observable<DocsStreamEvent> {
    const subject = new Subject<DocsStreamEvent>();

    this.executeGeneration(input, subject)
      .catch((error) => {
        this.logger.error("[generateDocsStream] Error:", error);
        subject.next({
          type: "error",
          timestamp: new Date().toISOString(),
          error: {
            code: "GENERATION_FAILED",
            message: error.message || "Document generation failed",
          },
        });
      })
      .finally(() => {
        subject.complete();
      });

    return subject.asObservable();
  }

  /**
   * 生成文档（非流式）
   */
  async generateDocs(input: DocsGenerationInput): Promise<DocsDocument> {
    const events: DocsStreamEvent[] = [];
    const stream = this.generateDocsStream(input);

    return new Promise((resolve, reject) => {
      stream.subscribe({
        next: (event) => events.push(event),
        error: (error) => reject(error),
        complete: () => {
          const completeEvent = events.find((e) => e.type === "complete");
          if (completeEvent?.result?.docId) {
            this.getDocsDocument(completeEvent.result.docId)
              .then(resolve)
              .catch(reject);
          } else {
            const errorEvent = events.find((e) => e.type === "error");
            reject(
              new Error(errorEvent?.error?.message || "Generation failed"),
            );
          }
        },
      });
    });
  }

  /**
   * 执行生成流程
   */
  private async executeGeneration(
    input: DocsGenerationInput,
    subject: Subject<DocsStreamEvent>,
  ): Promise<void> {
    const startTime = Date.now();
    const docId = randomUUID();

    this.logger.log(
      `[executeGeneration] Starting document generation: ${docId}`,
    );

    // 初始化进度
    this.emitProgress(subject, "init", 0, "初始化生成...");

    // ============================================
    // Phase 1: 内容提取
    // ============================================
    this.emitProgress(subject, "extract", 5, "提取参考内容...");

    const extractedContent = await this.extractContent(input);
    this.logger.log(
      `[executeGeneration] Extracted ${extractedContent.length} characters`,
    );

    // ============================================
    // Phase 1.5: 智能数据获取
    // ============================================
    this.emitProgress(subject, "fetch", 10, "获取相关数据...");

    const dataResult =
      await this.dataFetching.processDataFetching(extractedContent);
    const enrichedContent = dataResult.enrichedContent;

    if (dataResult.needsFetching) {
      this.logger.log(
        `[executeGeneration] Fetched ${dataResult.fetchedData.length} data items`,
      );
    }

    // ============================================
    // Phase 2: 生成大纲
    // ============================================
    this.emitProgress(subject, "outline", 15, "生成文档大纲...");

    const textModel = await this.aiModelService.getDefaultTextModel(
      input.textModelId,
    );

    const outline = await this.generateOutline(
      enrichedContent,
      input,
      textModel,
    );

    this.logger.log(
      `[executeGeneration] Generated outline with ${outline.sections.length} sections`,
    );

    // 发送大纲完成事件
    subject.next({
      type: "outline_complete",
      timestamp: new Date().toISOString(),
      outline,
    });

    // ============================================
    // Phase 3: 逐章节生成内容
    // ============================================
    this.emitProgress(subject, "content", 25, "生成文档内容...");

    const sections: DocsSection[] = [];
    const totalSections = outline.sections.length;

    for (let i = 0; i < outline.sections.length; i++) {
      const sectionOutline = outline.sections[i];
      const progressBase = 25 + (i / totalSections) * 60;

      this.emitProgress(
        subject,
        "content",
        progressBase,
        `生成章节 ${i + 1}/${totalSections}: ${sectionOutline.title}`,
        i + 1,
        totalSections,
      );

      // 发送章节开始事件
      subject.next({
        type: "section_start",
        timestamp: new Date().toISOString(),
        section: {
          index: i,
          title: sectionOutline.title,
        },
      });

      // 生成章节内容
      const sectionContent = await this.generateSection(
        sectionOutline,
        enrichedContent,
        input,
        textModel,
        outline.title,
      );

      const section: DocsSection = {
        id: sectionOutline.id,
        title: sectionOutline.title,
        level: sectionOutline.level,
        content: sectionContent,
        wordCount: sectionContent.length,
      };

      sections.push(section);

      // 发送章节完成事件
      subject.next({
        type: "section_complete",
        timestamp: new Date().toISOString(),
        section: {
          index: i,
          title: sectionOutline.title,
          content: sectionContent,
        },
      });
    }

    // ============================================
    // Phase 4: 组装并保存文档
    // ============================================
    this.emitProgress(subject, "finalize", 90, "整理文档...");

    const fullMarkdown = this.assembleMarkdown(outline, sections);

    const document = await this.assembleDocument(
      docId,
      input,
      outline,
      sections,
      fullMarkdown,
      textModel,
    );

    // 保存到数据库
    await this.saveDocument(document);

    const duration = Date.now() - startTime;

    this.logger.log(
      `[executeGeneration] Completed in ${duration}ms, ${sections.length} sections`,
    );

    // 发送完成事件
    subject.next({
      type: "complete",
      timestamp: new Date().toISOString(),
      progress: {
        phase: "complete",
        percentage: 100,
        message: "文档生成完成！",
      },
      result: {
        docId,
        totalSections: sections.length,
        wordCount: document.metadata.wordCount,
        duration,
      },
    });
  }

  /**
   * 提取内容
   */
  private async extractContent(input: DocsGenerationInput): Promise<string> {
    const contentParts: string[] = [];

    // 1. 直接提示词
    if (input.prompt) {
      contentParts.push(input.prompt);
    }

    // 2. URL 内容提取
    if (input.urls && input.urls.length > 0) {
      for (const url of input.urls) {
        try {
          const urlContent = await this.contentExtractor.extractFromUrl(url);
          contentParts.push(`[来源: ${url}]\n${urlContent}`);
        } catch (error) {
          this.logger.warn(`Failed to extract from URL: ${url}`, error);
        }
      }
    }

    // 3. 文件内容提取
    if (input.files && input.files.length > 0) {
      for (const file of input.files) {
        try {
          const fileContent = await this.contentExtractor.extractFromFile(
            file.buffer,
            file.mimeType,
            file.filename,
          );
          contentParts.push(`[文件: ${file.filename}]\n${fileContent}`);
        } catch (error) {
          this.logger.warn(
            `Failed to extract from file: ${file.filename}`,
            error,
          );
        }
      }
    }

    // 4. 资源内容
    if (input.resourceIds && input.resourceIds.length > 0) {
      const resources = await this.prisma.resource.findMany({
        where: { id: { in: input.resourceIds } },
        select: {
          title: true,
          aiSummary: true,
          abstract: true,
          content: true,
        },
      });

      for (const resource of resources) {
        const content =
          resource.aiSummary || resource.abstract || resource.content || "";
        contentParts.push(
          `[资源: ${resource.title}]\n${content.substring(0, 2000)}`,
        );
      }
    }

    return contentParts.join("\n\n---\n\n");
  }

  /**
   * 生成大纲
   */
  private async generateOutline(
    content: string,
    input: DocsGenerationInput,
    model: any,
  ): Promise<DocsOutline> {
    const documentType = input.documentType || "ARTICLE";
    const template = DOCS_TEMPLATES.find(
      (t) => t.documentType === documentType,
    );

    const systemPrompt = `你是一个专业的文档规划专家。根据用户需求生成结构清晰的文档大纲。

要求：
- 语言: ${input.language === "en-US" ? "英文" : "中文"}
- 文档类型: ${this.getDocTypeLabel(documentType)}
- 详细程度: ${this.getDetailLevelLabel(input.detailLevel || 2)}

${template ? `参考模板: ${template.outlinePrompt}` : ""}

输出格式（严格JSON）：
{
  "title": "文档标题",
  "abstract": "100字以内的摘要",
  "sections": [
    {
      "id": "section-1",
      "title": "章节标题",
      "level": 1,
      "description": "章节简介"
    }
  ],
  "estimatedWordCount": 2000,
  "suggestedStyle": "professional"
}`;

    const userPrompt = `请为以下内容生成文档大纲：

用户需求：${input.prompt}
${input.title ? `标题建议：${input.title}` : ""}

参考资料：
${content.substring(0, 4000)}`;

    try {
      const response = await this.aiChatService.generateChatCompletionWithKey({
        provider: model.provider,
        modelId: model.modelId,
        apiKey: model.apiKey || "",
        apiEndpoint: model.apiEndpoint || undefined,
        systemPrompt,
        messages: [{ role: "user", content: userPrompt }] as ChatMessage[],
        maxTokens: 2000,
        temperature: 0.7,
      });

      // 解析 JSON
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // 确保 sections 有 id
        if (parsed.sections) {
          parsed.sections = parsed.sections.map((s: any, i: number) => ({
            ...s,
            id: s.id || `section-${i + 1}`,
            level: s.level || 1,
          }));
        }
        return parsed as DocsOutline;
      }

      throw new Error("Failed to parse outline JSON");
    } catch (error) {
      this.logger.error("Failed to generate outline:", error);
      // 返回默认大纲
      return {
        title: input.title || "文档",
        abstract: "AI 生成的文档",
        sections: [
          {
            id: "section-1",
            title: "引言",
            level: 1,
            description: "介绍背景和目的",
          },
          {
            id: "section-2",
            title: "主要内容",
            level: 1,
            description: "核心论述",
          },
          {
            id: "section-3",
            title: "总结",
            level: 1,
            description: "结论和展望",
          },
        ],
        estimatedWordCount: 1500,
        suggestedStyle: "professional",
      };
    }
  }

  /**
   * 生成章节内容
   */
  private async generateSection(
    sectionOutline: DocsOutline["sections"][0],
    content: string,
    input: DocsGenerationInput,
    model: any,
    docTitle: string,
  ): Promise<string> {
    const detailLevel = input.detailLevel || 2;
    const wordTarget = detailLevel === 1 ? 200 : detailLevel === 2 ? 400 : 800;

    const systemPrompt = `你是一个专业的文档撰写专家。请撰写文档的一个章节。

要求：
- 语言: ${input.language === "en-US" ? "英文" : "中文"}
- 目标字数: 约 ${wordTarget} 字
- 风格: 专业、清晰、有逻辑
- 使用 Markdown 格式
- 可以使用列表、引用、代码块等

输出：直接输出章节内容（Markdown格式），不要包含章节标题本身。`;

    const userPrompt = `文档标题: ${docTitle}
章节: ${sectionOutline.title}
章节描述: ${sectionOutline.description}

${content.length > 0 ? `参考资料:\n${content.substring(0, 3000)}` : ""}

请撰写这个章节的内容。`;

    try {
      const response = await this.aiChatService.generateChatCompletionWithKey({
        provider: model.provider,
        modelId: model.modelId,
        apiKey: model.apiKey || "",
        apiEndpoint: model.apiEndpoint || undefined,
        systemPrompt,
        messages: [{ role: "user", content: userPrompt }] as ChatMessage[],
        maxTokens: 2000,
        temperature: 0.7,
      });

      return response.content.trim();
    } catch (error) {
      this.logger.error(
        `Failed to generate section: ${sectionOutline.title}`,
        error,
      );
      return `*此章节生成失败，请重试。*`;
    }
  }

  /**
   * 组装 Markdown
   */
  private assembleMarkdown(
    outline: DocsOutline,
    sections: DocsSection[],
  ): string {
    const parts: string[] = [];

    // 标题
    parts.push(`# ${outline.title}\n`);

    // 摘要
    if (outline.abstract) {
      parts.push(`> ${outline.abstract}\n`);
    }

    // 目录
    parts.push("## 目录\n");
    for (const section of outline.sections) {
      const indent = "  ".repeat(section.level - 1);
      parts.push(
        `${indent}- [${section.title}](#${this.slugify(section.title)})`,
      );
    }
    parts.push("");

    // 正文
    for (const section of sections) {
      const heading = "#".repeat(section.level + 1);
      parts.push(`${heading} ${section.title}\n`);
      parts.push(section.content);
      parts.push("");
    }

    return parts.join("\n");
  }

  /**
   * 组装文档对象
   */
  private async assembleDocument(
    docId: string,
    input: DocsGenerationInput,
    outline: DocsOutline,
    sections: DocsSection[],
    fullMarkdown: string,
    textModel: any,
  ): Promise<DocsDocument> {
    const now = new Date().toISOString();
    const wordCount = sections.reduce((acc, s) => acc + s.wordCount, 0);

    return {
      id: docId,
      userId: input.userId || "anonymous",
      title: outline.title,
      documentType: input.documentType || "ARTICLE",
      outline,
      sections,
      fullMarkdown,
      metadata: {
        wordCount,
        sectionCount: sections.length,
        createdAt: now,
        updatedAt: now,
        generatedAt: now,
        textModelUsed: textModel?.name || "unknown",
      },
      status: "completed",
    };
  }

  /**
   * 保存文档到数据库
   */
  private async saveDocument(document: DocsDocument): Promise<void> {
    let validUserId = document.userId;
    if (validUserId === "anonymous" || !validUserId) {
      const systemUser = await this.prisma.user.findFirst({
        select: { id: true },
      });
      if (systemUser) {
        validUserId = systemUser.id;
      } else {
        this.logger.warn("[saveDocument] No users found, skipping save");
        return;
      }
    }

    await this.prisma.officeDocument.create({
      data: {
        id: document.id,
        userId: validUserId,
        type: "ARTICLE",
        title: document.title,
        status: "COMPLETED",
        content: document as any,
        markdown: document.fullMarkdown,
        metadata: document.metadata as any,
        createdAt: new Date(document.metadata.createdAt),
        updatedAt: new Date(document.metadata.updatedAt),
      },
    });

    this.logger.log(`[saveDocument] Saved document: ${document.id}`);
  }

  /**
   * 获取文档
   */
  async getDocsDocument(docId: string): Promise<DocsDocument> {
    const doc = await this.prisma.officeDocument.findUnique({
      where: { id: docId },
    });

    if (!doc) {
      throw new Error(`Document not found: ${docId}`);
    }

    return doc.content as unknown as DocsDocument;
  }

  /**
   * 发送进度事件
   */
  private emitProgress(
    subject: Subject<DocsStreamEvent>,
    phase: string,
    percentage: number,
    message: string,
    currentSection?: number,
    totalSections?: number,
  ): void {
    subject.next({
      type: "progress",
      timestamp: new Date().toISOString(),
      progress: {
        phase,
        percentage,
        message,
        currentSection,
        totalSections,
      },
    });
  }

  private getDocTypeLabel(type: DocsType): string {
    const labels: Record<DocsType, string> = {
      ARTICLE: "文章",
      RESEARCH: "研究报告",
      PROPOSAL: "商业提案",
      REPORT: "报告",
      MEETING_MINUTES: "会议纪要",
    };
    return labels[type] || "文档";
  }

  private getDetailLevelLabel(level: number): string {
    const labels: Record<number, string> = {
      1: "简洁扼要",
      2: "适中详细",
      3: "非常详细",
    };
    return labels[level] || "适中";
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]+/g, "-")
      .replace(/^-|-$/g, "");
  }
}
