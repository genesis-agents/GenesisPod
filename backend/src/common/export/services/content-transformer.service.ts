/**
 * 统一导出系统 - 内容转换器服务
 * 负责将各种来源的内容转换为统一格式
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  UnifiedContent,
  ContentSection,
  ContentType,
  Reference,
  ContentMetadata,
  ListItem,
} from "../types/unified-content";
import { ExportSource } from "../types/export-options";
import { marked } from "marked";
import { MissionTransformerService } from "./mission-transformer.service";

@Injectable()
export class ContentTransformerService {
  private readonly logger = new Logger(ContentTransformerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => MissionTransformerService))
    private readonly missionTransformer: MissionTransformerService,
  ) {}

  /**
   * 将导出源转换为统一内容格式
   * @param source 导出源
   * @param options 转换选项（如 simplifiedMode 用于简化导出）
   */
  async transform(
    source: ExportSource,
    options?: { simplifiedMode?: boolean },
  ): Promise<UnifiedContent> {
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
      case "MISSION":
        return this.missionTransformer.transform(
          source.missionId,
          options?.simplifiedMode,
        );
      case "PLANNING":
        return this.transformPlanning(source.planId);
      case "WRITING":
        return this.transformWriting(source.sessionId);
      case "SOCIAL":
        return this.transformSocial(source.contentId);
      case "SLIDES":
        return this.transformSlides(source.sessionId);
      default:
        throw new Error(
          `Unsupported source type: ${(source as { type: string }).type}`,
        );
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
      const content = doc.content as Record<string, unknown>;
      if (content.sections && Array.isArray(content.sections)) {
        sections = this.parseStructuredContent(content.sections);
      }
      if (content.references && Array.isArray(content.references)) {
        references = content.references as Reference[];
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
      const report = session.report as Record<string, unknown>;

      // 执行摘要
      if (
        report.executiveSummary &&
        typeof report.executiveSummary === "string"
      ) {
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
      if (report.conclusion && typeof report.conclusion === "string") {
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
    if (report.sections && Array.isArray(report.sections)) {
      const reportSections = report.sections as Array<Record<string, unknown>>;
      for (const section of reportSections) {
        if (typeof section.title === "string") {
          sections.push({
            id: `section-${section.title}`,
            type: "heading",
            content: section.title,
            level: 2,
          });
        }

        if (typeof section.content === "string") {
          const parsedSections = this.parseMarkdown(section.content);
          sections.push(...parsedSections);
        }
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
            headers: token.header.map(
              (h: Record<string, unknown>) => h.text as string,
            ),
            rows: token.rows.map((row: Array<Record<string, unknown>>) => ({
              cells: row.map(
                (cell: Record<string, unknown>) => cell.text as string,
              ),
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
  private parseListItems(items: Array<Record<string, unknown>>): ListItem[] {
    return items.map((item) => ({
      content: typeof item.text === "string" ? item.text : "",
      children: Array.isArray(item.items)
        ? this.parseListItems(item.items)
        : undefined,
    }));
  }

  /**
   * 解析结构化内容
   */
  private parseStructuredContent(
    sections: Array<Record<string, unknown>>,
  ): ContentSection[] {
    return sections.map((section, index) => {
      const baseSection: ContentSection = {
        id: typeof section.id === "string" ? section.id : `section-${index}`,
        type: (section.type as ContentType) || "paragraph",
        content:
          typeof section.content === "string" ? section.content : undefined,
        level: typeof section.level === "number" ? section.level : undefined,
      };

      // Add optional fields only if they are the correct type
      if (Array.isArray(section.items)) {
        baseSection.items = section.items as ListItem[];
      }
      if (Array.isArray(section.rows)) {
        baseSection.rows = section.rows as Array<{ cells: string[] }>;
      }
      if (Array.isArray(section.headers)) {
        baseSection.headers = section.headers as string[];
      }
      if (Array.isArray(section.citations)) {
        baseSection.citations = section.citations as number[];
      }

      return baseSection;
    });
  }

  /**
   * 转换 AI Planning 规划报告
   * Planning 使用 Topic 模型（表 topics），计划数据存储在 topic.metadata JSON 字段中
   *
   * Metadata structure (PlanningTopicMetadata):
   *   phaseStatus: Record<number, { status, summary?, completedAt?, error? }>
   *   planConfig: { goal, depth, autoAdvance }
   *   references?: PlanReference[]
   */
  private async transformPlanning(planId: string): Promise<UnifiedContent> {
    const topic = await this.prisma.topic.findFirst({
      where: {
        id: planId,
        metadata: { path: ["planningMode"], equals: true },
      },
    });

    if (!topic) {
      throw new NotFoundException(`Planning not found: ${planId}`);
    }

    const meta = (topic.metadata as Record<string, unknown>) || {};
    const phaseStatus = (meta.phaseStatus || {}) as Record<
      string,
      { status?: string; summary?: string; completedAt?: string }
    >;
    const planConfig = (meta.planConfig || {}) as Record<string, unknown>;

    const metadata: ContentMetadata = {
      title: topic.name,
      subtitle: (planConfig.goal as string) || topic.description || undefined,
      date: topic.updatedAt,
      language: "zh-CN",
    };

    const sections: ContentSection[] = [];

    const PHASE_LABELS: Record<string, string> = {
      "1": "目标分析",
      "2": "调研洞察",
      "3": "头脑风暴",
      "4": "辩论推演",
      "5": "方案综合",
      "6": "输出交付",
    };

    // Phase 6 (Delivery) is the final report — use it as primary content
    const phase6 = phaseStatus["6"];
    if (phase6?.status === "completed" && phase6.summary) {
      sections.push(...this.parseMarkdown(phase6.summary));
    }

    // If no delivery report, include all completed phase summaries
    if (sections.length === 0) {
      for (let i = 1; i <= 6; i++) {
        const phase = phaseStatus[String(i)];
        if (phase?.status === "completed" && phase.summary) {
          sections.push({
            id: `phase-${i}`,
            type: "heading",
            content: `${PHASE_LABELS[String(i)] || `Phase ${i}`}`,
            level: 1,
          });
          sections.push(...this.parseMarkdown(phase.summary));
        }
      }
    }

    // Map planning references to export Reference format
    const planRefs = (meta.references || []) as Array<{
      id: string;
      title: string;
      url?: string;
      snippet?: string;
      domain?: string;
      publishedDate?: string;
    }>;
    const references: Reference[] = planRefs.map((ref, idx) => ({
      id: idx + 1,
      title: ref.title,
      url: ref.url,
      snippet: ref.snippet,
      domain: ref.domain,
      publishedDate: ref.publishedDate,
    }));

    return {
      metadata,
      sections:
        sections.length > 0
          ? sections
          : [
              {
                id: "empty",
                type: "paragraph",
                content: "暂无报告内容",
              },
            ],
      references: references.length > 0 ? references : undefined,
      tableOfContents: { enabled: true, maxDepth: 3 },
    };
  }

  /**
   * 转换 AI Writing 写作项目
   * Writing 使用 WritingProject 模型（表 writing_projects），包含卷和章节
   */
  private async transformWriting(sessionId: string): Promise<UnifiedContent> {
    const project = await this.prisma.writingProject.findUnique({
      where: { id: sessionId },
      include: {
        volumes: {
          include: {
            chapters: {
              orderBy: { chapterNumber: "asc" },
            },
          },
          orderBy: { volumeNumber: "asc" },
        },
      },
    });

    if (!project) {
      throw new NotFoundException(`Writing project not found: ${sessionId}`);
    }

    const metadata: ContentMetadata = {
      title: project.name,
      subtitle: project.description || undefined,
      author: undefined,
      date: project.updatedAt,
      language: "zh-CN",
    };

    const sections: ContentSection[] = [];

    for (const volume of project.volumes) {
      // 卷标题
      sections.push({
        id: `volume-${volume.id}`,
        type: "heading",
        content: volume.title || `卷 ${volume.volumeNumber}`,
        level: 1,
      });

      for (const chapter of volume.chapters) {
        // 章节标题
        sections.push({
          id: `chapter-${chapter.id}`,
          type: "heading",
          content: chapter.title,
          level: 2,
        });

        // 章节内容
        if (chapter.content) {
          sections.push(...this.parseMarkdown(chapter.content));
        }
      }
    }

    return {
      metadata,
      sections:
        sections.length > 0
          ? sections
          : [
              {
                id: "empty",
                type: "paragraph",
                content: "暂无写作内容",
              },
            ],
    };
  }

  /**
   * 转换 AI Social 社交内容
   * Social 使用 SocialContent 模型（表 social_contents）
   */
  private async transformSocial(contentId: string): Promise<UnifiedContent> {
    const socialContent = await this.prisma.socialContent.findUnique({
      where: { id: contentId },
      include: {
        connection: true,
      },
    });

    if (!socialContent) {
      throw new NotFoundException(`Social content not found: ${contentId}`);
    }

    const metadata: ContentMetadata = {
      title: socialContent.title || "社交内容",
      subtitle: socialContent.contentType
        ? `类型: ${socialContent.contentType}`
        : undefined,
      author: socialContent.author || undefined,
      date: socialContent.createdAt,
      language: "zh-CN",
    };

    const sections: ContentSection[] = [];
    if (socialContent.content) {
      sections.push(...this.parseMarkdown(socialContent.content));
    }

    return { metadata, sections };
  }

  /**
   * 转换 AI Slides 演示文稿
   * Slides 使用 SlidesSession 模型（表 slides_sessions）和 SlidesCheckpoint
   */
  private async transformSlides(sessionId: string): Promise<UnifiedContent> {
    const session = await this.prisma.slidesSession.findUnique({
      where: { id: sessionId },
      include: {
        checkpoints: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!session) {
      throw new NotFoundException(`Slides session not found: ${sessionId}`);
    }

    const metadata: ContentMetadata = {
      title: session.title || "演示文稿",
      date: session.updatedAt,
      language: "zh-CN",
    };

    const sections: ContentSection[] = [];

    // 从最新检查点提取幻灯片内容
    if (session.checkpoints.length > 0) {
      const checkpoint = session.checkpoints[0];
      const state = checkpoint.stateJson as Record<string, unknown>;
      const slides = (state.slides || state.pages) as
        | Array<Record<string, unknown>>
        | undefined;

      if (Array.isArray(slides)) {
        for (const slide of slides) {
          if (typeof slide.title === "string") {
            sections.push({
              id: `slide-${slide.id || sections.length}`,
              type: "heading",
              content: slide.title,
              level: 2,
            });
          }
          if (typeof slide.content === "string") {
            sections.push(...this.parseMarkdown(slide.content));
          } else if (typeof slide.notes === "string") {
            sections.push({
              id: `slide-notes-${sections.length}`,
              type: "paragraph",
              content: slide.notes,
            });
          }
        }
      }
    }

    return {
      metadata,
      sections:
        sections.length > 0
          ? sections
          : [
              {
                id: "empty",
                type: "paragraph",
                content: "暂无幻灯片内容",
              },
            ],
    };
  }
}
