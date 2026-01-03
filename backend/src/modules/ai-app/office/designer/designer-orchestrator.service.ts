/**
 * Designer Orchestrator Service
 *
 * AI Designer 生成总调度器
 *
 * 职责：
 * 1. 协调整个设计生成流程
 * 2. 管理内容提取、设计规划、渲染各阶段
 * 3. 支持流式输出进度
 */

import { Injectable, Logger } from "@nestjs/common";
import { Subject, Observable } from "rxjs";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import {
  ContentExtractorService,
  DataFetchingService,
} from "../../../../common/content-processing";
import {
  AiChatService,
  ChatMessage,
} from "../../../ai-engine/llm/services/ai-chat.service";
import { AIModelService } from "../core";
import {
  DesignerGenerationInput,
  DesignDocument,
  DesignSpec,
  GeneratedDesign,
  DesignerStreamEvent,
  DesignType,
  COLOR_SCHEMES,
  ASPECT_RATIO_SIZES,
  DESIGNER_TEMPLATES,
} from "./designer.types";
import { randomUUID } from "crypto";

@Injectable()
export class DesignerOrchestratorService {
  private readonly logger = new Logger(DesignerOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contentExtractor: ContentExtractorService,
    private readonly dataFetching: DataFetchingService,
    private readonly aiModelService: AIModelService,
    private readonly aiChatService: AiChatService,
  ) {}

  /**
   * 生成设计（流式）
   */
  generateDesignStream(
    input: DesignerGenerationInput,
  ): Observable<DesignerStreamEvent> {
    const subject = new Subject<DesignerStreamEvent>();

    this.executeGeneration(input, subject)
      .catch((error) => {
        this.logger.error("[generateDesignStream] Error:", error);
        subject.next({
          type: "error",
          timestamp: new Date().toISOString(),
          error: {
            code: "GENERATION_FAILED",
            message: error.message || "Design generation failed",
          },
        });
      })
      .finally(() => {
        subject.complete();
      });

    return subject.asObservable();
  }

  /**
   * 生成设计（非流式）
   */
  async generateDesign(
    input: DesignerGenerationInput,
  ): Promise<DesignDocument> {
    const events: DesignerStreamEvent[] = [];
    const stream = this.generateDesignStream(input);

    return new Promise((resolve, reject) => {
      stream.subscribe({
        next: (event) => events.push(event),
        error: (error) => reject(error),
        complete: () => {
          const completeEvent = events.find((e) => e.type === "complete");
          if (completeEvent?.result?.designId) {
            this.getDesignDocument(completeEvent.result.designId)
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
    input: DesignerGenerationInput,
    subject: Subject<DesignerStreamEvent>,
  ): Promise<void> {
    const startTime = Date.now();
    const designId = randomUUID();

    this.logger.log(
      `[executeGeneration] Starting design generation: ${designId}`,
    );

    // 初始化进度
    this.emitProgress(subject, "init", 0, "初始化设计...");

    // ============================================
    // Phase 1: 内容提取
    // ============================================
    this.emitProgress(subject, "extract", 5, "提取参考内容...");

    const extractedContent = await this.extractContent(input);
    this.logger.log(
      `[executeGeneration] Extracted ${extractedContent.length} characters`,
    );

    // ============================================
    // Phase 2: 智能数据获取
    // ============================================
    this.emitProgress(subject, "fetch", 15, "获取相关数据...");

    const dataResult =
      await this.dataFetching.processDataFetching(extractedContent);
    const enrichedContent = dataResult.enrichedContent;

    // ============================================
    // Phase 3: 生成设计规格
    // ============================================
    this.emitProgress(subject, "spec", 25, "规划设计方案...");

    const textModel = await this.aiModelService.getDefaultTextModel(
      input.textModelId,
    );

    const spec = await this.generateDesignSpec(
      enrichedContent,
      input,
      textModel,
    );

    this.logger.log(
      `[executeGeneration] Generated spec with ${spec.sections.length} sections`,
    );

    // 发送规格完成事件
    subject.next({
      type: "spec_complete",
      timestamp: new Date().toISOString(),
      spec,
    });

    // ============================================
    // Phase 4: 渲染设计
    // ============================================
    this.emitProgress(subject, "render", 50, "渲染设计...");

    subject.next({
      type: "render_start",
      timestamp: new Date().toISOString(),
    });

    const renderedHtml = this.renderDesignToHtml(spec);

    // 发送渲染完成事件
    subject.next({
      type: "render_complete",
      timestamp: new Date().toISOString(),
      design: {
        html: renderedHtml,
      },
    });

    // ============================================
    // Phase 5: 组装并保存文档
    // ============================================
    this.emitProgress(subject, "finalize", 90, "保存设计...");

    const design: GeneratedDesign = {
      id: randomUUID(),
      spec,
      renderedHtml,
    };

    const document = await this.assembleDocument(
      designId,
      input,
      spec,
      design,
      textModel,
    );

    // 保存到数据库
    await this.saveDocument(document);

    const duration = Date.now() - startTime;

    this.logger.log(`[executeGeneration] Completed in ${duration}ms`);

    // 发送完成事件
    subject.next({
      type: "complete",
      timestamp: new Date().toISOString(),
      progress: {
        phase: "complete",
        percentage: 100,
        message: "设计生成完成！",
      },
      result: {
        designId,
        imageUrl: "", // 可后续生成图片
        duration,
      },
    });
  }

  /**
   * 提取内容
   */
  private async extractContent(
    input: DesignerGenerationInput,
  ): Promise<string> {
    const contentParts: string[] = [];

    if (input.prompt) {
      contentParts.push(input.prompt);
    }

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

    if (input.resourceIds && input.resourceIds.length > 0) {
      const resources = await this.prisma.resource.findMany({
        where: { id: { in: input.resourceIds } },
        select: {
          title: true,
          aiSummary: true,
          abstract: true,
        },
      });

      for (const resource of resources) {
        const content = resource.aiSummary || resource.abstract || "";
        contentParts.push(
          `[资源: ${resource.title}]\n${content.substring(0, 1000)}`,
        );
      }
    }

    return contentParts.join("\n\n---\n\n");
  }

  /**
   * 生成设计规格
   */
  private async generateDesignSpec(
    content: string,
    input: DesignerGenerationInput,
    model: any,
  ): Promise<DesignSpec> {
    const designType = input.designType || "infographic";
    const style = input.style || "consulting";
    const layout = input.layout || "cards";
    const aspectRatio = input.aspectRatio || "16:9";
    const colorScheme = COLOR_SCHEMES[style];

    const template = DESIGNER_TEMPLATES.find(
      (t) => t.designType === designType,
    );

    const systemPrompt = `你是一个专业的视觉设计专家。根据用户需求生成设计规格。

设计类型: ${this.getDesignTypeLabel(designType)}
风格: ${style}
布局: ${layout}
比例: ${aspectRatio}

${template ? `参考: ${template.examplePrompt}` : ""}

输出格式（严格JSON）：
{
  "title": "设计标题",
  "subtitle": "副标题（可选）",
  "layout": "${layout}",
  "style": "${style}",
  "aspectRatio": "${aspectRatio}",
  "colorScheme": ${JSON.stringify(colorScheme)},
  "sections": [
    {
      "id": "section-1",
      "type": "header|stat|chart|text|image|icon_list|comparison|timeline_item|cta",
      "title": "标题",
      "content": "内容文字",
      "data": null
    }
  ],
  "metadata": {
    "dataPoints": 5,
    "hasChart": false,
    "hasIcons": true
  }
}

sections 类型说明:
- header: 大标题区域
- stat: 统计数字 (data: { value: "100+", label: "用户数" })
- chart: 图表 (data: { type: "bar|line|pie", values: [...] })
- text: 文字段落
- image: 图片占位
- icon_list: 图标列表 (data: { items: [{ icon: "emoji", text: "描述" }] })
- comparison: 对比表格 (data: { items: [{ left: "A", right: "B" }] })
- timeline_item: 时间轴项 (data: { date: "2024", event: "事件" })
- cta: 行动号召`;

    const userPrompt = `请为以下内容生成设计规格：

用户需求：${input.prompt}
${input.title ? `标题建议：${input.title}` : ""}

参考资料：
${content.substring(0, 3000)}

请生成适合的设计规格，包含 3-8 个 sections。`;

    try {
      const response = await this.aiChatService.generateChatCompletionWithKey({
        provider: model.provider,
        modelId: model.modelId,
        apiKey: model.apiKey || "",
        apiEndpoint: model.apiEndpoint || undefined,
        systemPrompt,
        messages: [{ role: "user", content: userPrompt }] as ChatMessage[],
        maxTokens: 3000,
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
          }));
        }
        return parsed as DesignSpec;
      }

      throw new Error("Failed to parse design spec JSON");
    } catch (error) {
      this.logger.error("Failed to generate design spec:", error);
      // 返回默认规格
      return this.getDefaultSpec(input, colorScheme);
    }
  }

  /**
   * 渲染设计为 HTML
   */
  private renderDesignToHtml(spec: DesignSpec): string {
    const size =
      ASPECT_RATIO_SIZES[spec.aspectRatio] || ASPECT_RATIO_SIZES["16:9"];
    const colors = spec.colorScheme;

    const sectionsHtml = spec.sections
      .map((section) => {
        return this.renderSection(section, colors);
      })
      .join("\n");

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: ${colors.background};
      color: ${colors.text};
      width: ${size.width}px;
      height: ${size.height}px;
      overflow: hidden;
    }

    .design-container {
      width: 100%;
      height: 100%;
      padding: 48px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .header {
      text-align: center;
      margin-bottom: 24px;
    }

    .header h1 {
      font-size: 48px;
      font-weight: 700;
      color: ${colors.primary};
      margin-bottom: 12px;
    }

    .header .subtitle {
      font-size: 20px;
      color: ${colors.secondary};
    }

    .section {
      background: rgba(255,255,255,0.05);
      border-radius: 12px;
      padding: 24px;
    }

    .stat-container {
      display: flex;
      justify-content: space-around;
      flex-wrap: wrap;
      gap: 24px;
    }

    .stat-item {
      text-align: center;
    }

    .stat-value {
      font-size: 48px;
      font-weight: 700;
      color: ${colors.accent};
    }

    .stat-label {
      font-size: 14px;
      color: ${colors.secondary};
      margin-top: 8px;
    }

    .text-section {
      font-size: 16px;
      line-height: 1.6;
    }

    .text-section h2 {
      font-size: 24px;
      font-weight: 600;
      color: ${colors.primary};
      margin-bottom: 12px;
    }

    .icon-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
    }

    .icon-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: rgba(255,255,255,0.05);
      border-radius: 8px;
    }

    .icon-item .icon {
      font-size: 24px;
    }

    .comparison-table {
      width: 100%;
      border-collapse: collapse;
    }

    .comparison-table th,
    .comparison-table td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }

    .comparison-table th {
      background: ${colors.primary};
      color: white;
    }

    .timeline {
      position: relative;
      padding-left: 40px;
    }

    .timeline::before {
      content: '';
      position: absolute;
      left: 12px;
      top: 0;
      bottom: 0;
      width: 2px;
      background: ${colors.accent};
    }

    .timeline-item {
      position: relative;
      margin-bottom: 24px;
    }

    .timeline-item::before {
      content: '';
      position: absolute;
      left: -34px;
      top: 4px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: ${colors.accent};
    }

    .timeline-date {
      font-weight: 600;
      color: ${colors.accent};
    }

    .cta {
      text-align: center;
      padding: 32px;
    }

    .cta-button {
      display: inline-block;
      padding: 16px 48px;
      background: ${colors.accent};
      color: ${colors.background};
      font-weight: 600;
      font-size: 18px;
      border-radius: 8px;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="design-container">
    <div class="header">
      <h1>${spec.title}</h1>
      ${spec.subtitle ? `<p class="subtitle">${spec.subtitle}</p>` : ""}
    </div>
    ${sectionsHtml}
  </div>
</body>
</html>`;
  }

  /**
   * 渲染单个 section
   */
  private renderSection(
    section: any,
    colors: DesignSpec["colorScheme"],
  ): string {
    switch (section.type) {
      case "stat":
        const stats = Array.isArray(section.data)
          ? section.data
          : [section.data];
        return `<div class="section stat-container">
          ${stats
            .map(
              (s: any) => `
            <div class="stat-item">
              <div class="stat-value">${s?.value || "0"}</div>
              <div class="stat-label">${s?.label || ""}</div>
            </div>
          `,
            )
            .join("")}
        </div>`;

      case "text":
        return `<div class="section text-section">
          ${section.title ? `<h2>${section.title}</h2>` : ""}
          <p>${section.content || ""}</p>
        </div>`;

      case "icon_list":
        const items = section.data?.items || [];
        return `<div class="section">
          ${section.title ? `<h2 style="margin-bottom:16px;color:${colors.primary}">${section.title}</h2>` : ""}
          <div class="icon-list">
            ${items
              .map(
                (item: any) => `
              <div class="icon-item">
                <span class="icon">${item.icon || "•"}</span>
                <span>${item.text || ""}</span>
              </div>
            `,
              )
              .join("")}
          </div>
        </div>`;

      case "comparison":
        const compItems = section.data?.items || [];
        return `<div class="section">
          ${section.title ? `<h2 style="margin-bottom:16px;color:${colors.primary}">${section.title}</h2>` : ""}
          <table class="comparison-table">
            <thead>
              <tr><th>选项 A</th><th>选项 B</th></tr>
            </thead>
            <tbody>
              ${compItems
                .map(
                  (item: any) => `
                <tr><td>${item.left || ""}</td><td>${item.right || ""}</td></tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
        </div>`;

      case "timeline_item":
        return `<div class="timeline-item">
          <div class="timeline-date">${section.data?.date || ""}</div>
          <div class="timeline-event">${section.data?.event || section.content || ""}</div>
        </div>`;

      case "cta":
        return `<div class="section cta">
          <a href="#" class="cta-button">${section.content || "了解更多"}</a>
        </div>`;

      default:
        return `<div class="section text-section">
          ${section.title ? `<h2>${section.title}</h2>` : ""}
          <p>${section.content || ""}</p>
        </div>`;
    }
  }

  /**
   * 获取默认规格
   */
  private getDefaultSpec(
    input: DesignerGenerationInput,
    colorScheme: DesignSpec["colorScheme"],
  ): DesignSpec {
    return {
      title: input.title || "设计",
      subtitle: "AI 生成的设计",
      layout: input.layout || "cards",
      style: input.style || "consulting",
      aspectRatio: input.aspectRatio || "16:9",
      colorScheme,
      sections: [
        {
          id: "section-1",
          type: "stat",
          data: [
            { value: "100+", label: "关键数据" },
            { value: "50%", label: "增长率" },
            { value: "24/7", label: "服务时间" },
          ],
        },
        {
          id: "section-2",
          type: "text",
          title: "核心内容",
          content: input.prompt || "这里是主要内容描述。",
        },
      ],
      metadata: {
        dataPoints: 3,
        hasChart: false,
        hasIcons: false,
      },
    };
  }

  /**
   * 组装文档
   */
  private async assembleDocument(
    designId: string,
    input: DesignerGenerationInput,
    spec: DesignSpec,
    design: GeneratedDesign,
    textModel: any,
  ): Promise<DesignDocument> {
    const size =
      ASPECT_RATIO_SIZES[spec.aspectRatio] || ASPECT_RATIO_SIZES["16:9"];
    const now = new Date().toISOString();

    return {
      id: designId,
      userId: input.userId || "anonymous",
      title: spec.title,
      designType: input.designType || "infographic",
      spec,
      design,
      metadata: {
        width: size.width,
        height: size.height,
        createdAt: now,
        updatedAt: now,
        generatedAt: now,
        textModelUsed: textModel?.name || "unknown",
      },
      status: "completed",
    };
  }

  /**
   * 保存文档
   */
  private async saveDocument(document: DesignDocument): Promise<void> {
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
        type: "ARTICLE", // 使用 ARTICLE 作为通用类型
        title: document.title,
        status: "COMPLETED",
        content: document as any,
        metadata: document.metadata as any,
        createdAt: new Date(document.metadata.createdAt),
        updatedAt: new Date(document.metadata.updatedAt),
      },
    });

    this.logger.log(`[saveDocument] Saved design: ${document.id}`);
  }

  /**
   * 获取设计文档
   */
  async getDesignDocument(designId: string): Promise<DesignDocument> {
    const doc = await this.prisma.officeDocument.findUnique({
      where: { id: designId },
    });

    if (!doc) {
      throw new Error(`Design not found: ${designId}`);
    }

    return doc.content as unknown as DesignDocument;
  }

  /**
   * 发送进度事件
   */
  private emitProgress(
    subject: Subject<DesignerStreamEvent>,
    phase: string,
    percentage: number,
    message: string,
  ): void {
    subject.next({
      type: "progress",
      timestamp: new Date().toISOString(),
      progress: {
        phase,
        percentage,
        message,
      },
    });
  }

  private getDesignTypeLabel(type: DesignType): string {
    const labels: Record<DesignType, string> = {
      infographic: "信息图",
      poster: "海报",
      data_viz: "数据可视化",
      process_flow: "流程图",
      comparison: "对比图",
      timeline: "时间轴",
    };
    return labels[type] || "设计";
  }
}
