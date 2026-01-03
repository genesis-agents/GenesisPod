/**
 * 统一导出系统 - 内容转换器服务
 * 负责将各种来源的内容转换为统一格式
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  UnifiedContent,
  ContentSection,
  ContentType,
  Reference,
  ContentMetadata,
} from "../types/unified-content";
import { ExportSource } from "../types/export-options";
import { marked } from "marked";

@Injectable()
export class ContentTransformerService {
  private readonly logger = new Logger(ContentTransformerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 将导出源转换为统一内容格式
   */
  async transform(source: ExportSource): Promise<UnifiedContent> {
    this.logger.debug(`Transforming source: ${source.type}`);

    switch (source.type) {
      case "DOCUMENT":
        return this.transformDocument(source.documentId);
      case "RESEARCH":
        return this.transformResearch(source.sessionId);
      case "REPORT":
        return this.transformReport(source.reportId);
      case "RAW":
        return this.transformRaw(
          source.content,
          source.contentType,
          source.title,
        );
      default:
        throw new Error(`Unsupported source type: ${(source as any).type}`);
    }
  }

  /**
   * 转换 AI Office 文档
   */
  private async transformDocument(documentId: string): Promise<UnifiedContent> {
    const doc = await this.prisma.officeDocument.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      throw new NotFoundException(`Document not found: ${documentId}`);
    }

    const metadata: ContentMetadata = {
      title: doc.title,
      date: doc.createdAt,
      language: "zh-CN",
    };

    // 根据文档类型解析内容
    let sections: ContentSection[] = [];
    let references: Reference[] = [];

    if (doc.markdown) {
      // 从 Markdown 解析
      sections = this.parseMarkdown(doc.markdown);
    } else if (doc.content) {
      // 从结构化内容解析
      const content = doc.content as any;
      if (content.sections) {
        sections = this.parseStructuredContent(content.sections);
      }
      if (content.references) {
        references = content.references;
      }
    }

    return {
      metadata,
      sections,
      references: references.length > 0 ? references : undefined,
    };
  }

  /**
   * 转换 Deep Research 会话
   */
  private async transformResearch(sessionId: string): Promise<UnifiedContent> {
    const session = await this.prisma.deepResearchSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Research session not found: ${sessionId}`);
    }

    const metadata: ContentMetadata = {
      title: `深度研究报告: ${session.query.slice(0, 50)}`,
      subtitle: session.query,
      date: session.completedAt || session.createdAt,
      language: "zh-CN",
    };

    const sections: ContentSection[] = [];
    const references: Reference[] = [];

    // 解析研究报告
    if (session.report) {
      const report = session.report as any;

      // 执行摘要
      if (report.executiveSummary) {
        sections.push({
          id: "executive-summary",
          type: "heading",
          content: "执行摘要",
          level: 1,
        });
        sections.push({
          id: "executive-summary-content",
          type: "paragraph",
          content: report.executiveSummary,
        });
      }

      // 各章节
      if (report.sections && Array.isArray(report.sections)) {
        for (const section of report.sections) {
          sections.push({
            id: `section-${section.title}`,
            type: "heading",
            content: section.title,
            level: 2,
          });

          // 解析章节内容中的 Markdown
          const parsedSections = this.parseMarkdown(section.content);
          sections.push(...parsedSections);

          // 添加引用标记
          if (section.citations && section.citations.length > 0) {
            sections[sections.length - 1].citations = section.citations;
          }
        }
      }

      // 结论
      if (report.conclusion) {
        sections.push({
          id: "conclusion",
          type: "heading",
          content: "结论",
          level: 1,
        });
        sections.push({
          id: "conclusion-content",
          type: "paragraph",
          content: report.conclusion,
        });
      }

      // 参考文献
      if (report.references && Array.isArray(report.references)) {
        for (const ref of report.references) {
          references.push({
            id: ref.id,
            title: ref.title,
            url: ref.url,
            snippet: ref.snippet,
            accessedAt: ref.accessedAt ? new Date(ref.accessedAt) : undefined,
          });
        }
      }
    }

    return {
      metadata,
      sections,
      references: references.length > 0 ? references : undefined,
      tableOfContents: {
        enabled: true,
        maxDepth: 2,
      },
    };
  }

  /**
   * 转换 Content Report
   */
  private async transformReport(reportId: string): Promise<UnifiedContent> {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException(`Report not found: ${reportId}`);
    }

    const metadata: ContentMetadata = {
      title: report.title,
      date: report.createdAt,
      language: "zh-CN",
    };

    const sections: ContentSection[] = [];

    // 摘要
    if (report.summary) {
      sections.push({
        id: "summary",
        type: "heading",
        content: "摘要",
        level: 1,
      });
      sections.push({
        id: "summary-content",
        type: "paragraph",
        content: report.summary,
      });
    }

    // 各章节
    if (report.sections) {
      const reportSections = report.sections as any[];
      for (const section of reportSections) {
        sections.push({
          id: `section-${section.title}`,
          type: "heading",
          content: section.title,
          level: 2,
        });

        const parsedSections = this.parseMarkdown(section.content);
        sections.push(...parsedSections);
      }
    }

    return {
      metadata,
      sections,
    };
  }

  /**
   * 转换原始内容
   */
  private async transformRaw(
    content: string,
    contentType: "markdown" | "html" | "json",
    title?: string,
  ): Promise<UnifiedContent> {
    const metadata: ContentMetadata = {
      title: title || "导出文档",
      date: new Date(),
    };

    let sections: ContentSection[] = [];

    switch (contentType) {
      case "markdown":
        sections = this.parseMarkdown(content);
        break;
      case "html":
        // TODO: HTML 解析
        sections = [
          {
            id: "raw-content",
            type: "paragraph",
            content: content,
          },
        ];
        break;
      case "json":
        try {
          const parsed = JSON.parse(content);
          if (parsed.sections) {
            sections = this.parseStructuredContent(parsed.sections);
          }
        } catch {
          sections = [
            {
              id: "raw-content",
              type: "code",
              content: content,
              codeLanguage: "json",
            },
          ];
        }
        break;
    }

    return {
      metadata,
      sections,
    };
  }

  /**
   * 解析 Markdown 为内容节点
   */
  private parseMarkdown(markdown: string): ContentSection[] {
    const sections: ContentSection[] = [];
    const tokens = marked.lexer(markdown);
    let sectionIndex = 0;

    for (const token of tokens) {
      sectionIndex++;
      const id = `section-${sectionIndex}`;

      switch (token.type) {
        case "heading":
          sections.push({
            id,
            type: "heading",
            content: token.text,
            level: token.depth,
          });
          break;

        case "paragraph":
          sections.push({
            id,
            type: "paragraph",
            content: token.text,
          });
          break;

        case "list":
          sections.push({
            id,
            type: "list",
            ordered: token.ordered,
            items: this.parseListItems(token.items),
          });
          break;

        case "table":
          sections.push({
            id,
            type: "table",
            headers: token.header.map((h: any) => h.text),
            rows: token.rows.map((row: any) => ({
              cells: row.map((cell: any) => cell.text),
            })),
          });
          break;

        case "code":
          sections.push({
            id,
            type: "code",
            content: token.text,
            codeLanguage: token.lang || undefined,
          });
          break;

        case "blockquote":
          sections.push({
            id,
            type: "quote",
            content: token.text,
          });
          break;

        case "hr":
          sections.push({
            id,
            type: "divider",
          });
          break;
      }
    }

    return sections;
  }

  /**
   * 解析列表项
   */
  private parseListItems(
    items: any[],
  ): { content: string; children?: any[] }[] {
    return items.map((item) => ({
      content: item.text,
      children: item.items ? this.parseListItems(item.items) : undefined,
    }));
  }

  /**
   * 解析结构化内容
   */
  private parseStructuredContent(sections: any[]): ContentSection[] {
    return sections.map((section, index) => ({
      id: section.id || `section-${index}`,
      type: (section.type as ContentType) || "paragraph",
      content: section.content,
      level: section.level,
      items: section.items,
      rows: section.rows,
      headers: section.headers,
      citations: section.citations,
    }));
  }
}
