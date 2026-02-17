/**
 * AI Slides V5.0 - Data Import Service
 *
 * Unified service for importing content from various platform sources:
 * - AI Research: Deep research reports with structured sections and findings
 * - AI Writing: Creative writing drafts with chapters and outlines
 * - AI Teams: Multi-agent debate results with diverse perspectives
 * - Library: User's resource library (images, documents)
 */

import { Injectable, Logger, NotFoundException, Inject } from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import {
  RESEARCH_DATA_EXPORT,
  WRITING_DATA_EXPORT,
  IResearchDataExport,
  IWritingDataExport,
} from "../../interfaces/data-export.interface";
import {
  SlidesSourceData,
  SlidesSourceType,
  SourceSection,
  SourceChartData,
  Asset,
  Reference,
  SourceListItem,
  ChartType,
} from "../types";

// Configuration constants for data import limits
const IMPORT_CONFIG = {
  // List query limits
  DEFAULT_LIST_LIMIT: 50,
  LIBRARY_LIST_LIMIT: 100,

  // Extraction limits
  MAX_SECTIONS: 100,
  MAX_CHARTS: 20,
  MAX_KEY_FINDINGS: 5,
  MAX_REFERENCES: 10,
  MAX_ASSETS: 50,

  // Content length limits
  MAX_CONTENT_LENGTH: 100000,
  MAX_URL_LENGTH: 2000,

  // Allowed URL protocols for references
  ALLOWED_URL_PROTOCOLS: ["http:", "https:"],
} as const;

@Injectable()
export class SlidesDataImportService {
  private readonly logger = new Logger(SlidesDataImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(RESEARCH_DATA_EXPORT)
    private readonly researchExport: IResearchDataExport,
    @Inject(WRITING_DATA_EXPORT)
    private readonly writingExport: IWritingDataExport,
  ) {}

  // ============================================
  // Import from AI Research
  // ============================================

  /**
   * Import data from AI Research topic/report
   * @param topicId - Research topic ID
   * @param userId - User ID for access control
   * @returns Unified SlidesSourceData structure
   */
  async importFromResearch(
    topicId: string,
    userId: string,
  ): Promise<SlidesSourceData> {
    this.logger.log(`Importing from Research topic: ${topicId}`);

    const data = await this.researchExport.getTopicForExport(topicId, userId);

    // Extract sections from dimension analyses (from the latest report)
    const sections: SourceSection[] = [];
    if (data.latestReport?.dimensionAnalyses) {
      data.latestReport.dimensionAnalyses.forEach((analysis, index) => {
        sections.push({
          title: analysis.dimension.name,
          content: analysis.summary || "",
          order: index,
          data: analysis.dataPoints as Record<string, unknown> | undefined,
        });
      });
    } else {
      // Fallback: use dimensions without analysis content
      data.dimensions.forEach((dim, index) => {
        sections.push({
          title: dim.name,
          content: dim.description || "",
          order: index,
        });
      });
    }

    // Extract charts from report (convert null to undefined for type compat)
    const reportForExtract = data.latestReport
      ? {
          ...data.latestReport,
          fullReport: data.latestReport.fullReport ?? undefined,
        }
      : null;
    const charts = this.extractChartsFromReport(reportForExtract);
    const keyFindings = this.extractKeyFindingsFromReport(reportForExtract);
    const references = this.extractReferences(
      data.latestReport?.fullReport || "",
    );

    return {
      sourceText: data.latestReport?.fullReport || data.description || "",
      sourceType: "research",
      sourceId: topicId,
      sections,
      charts,
      keyFindings,
      references,
      metadata: {
        title: data.name,
        createdAt: data.createdAt,
        language: data.language || "zh",
      },
    };
  }

  // ============================================
  // Import from AI Writing
  // ============================================

  /**
   * Import data from AI Writing project/chapter
   * @param projectId - Writing project ID
   * @param userId - User ID for access control
   * @returns Unified SlidesSourceData structure
   */
  async importFromWriting(
    projectId: string,
    userId: string,
  ): Promise<SlidesSourceData> {
    this.logger.log(`Importing from Writing project: ${projectId}`);

    const data = await this.writingExport.getProjectForExport(
      projectId,
      userId,
    );

    // Extract sections from chapters
    const sections: SourceSection[] = [];
    let sectionIndex = 0;

    for (const volume of data.volumes) {
      for (const chapter of volume.chapters) {
        sections.push({
          title: chapter.title,
          content: chapter.content || "",
          order: sectionIndex++,
        });
      }
    }

    // Build outline from volume/chapter structure
    const outline = data.volumes.map((volume) => ({
      id: volume.id,
      title: volume.title,
      level: 1,
      children: volume.chapters.map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        level: 2,
      })),
    }));

    // Calculate total word count
    const totalWords = sections.reduce((sum, s) => {
      return sum + (s.content?.length || 0);
    }, 0);

    return {
      sourceText: sections.map((s) => s.content).join("\n\n"),
      sourceType: "writing",
      sourceId: projectId,
      sections,
      outline,
      metadata: {
        title: data.name,
        genre: data.genre || undefined,
        style: data.writingStyle || undefined,
        wordCount: totalWords,
        createdAt: data.createdAt,
      },
    };
  }

  // ============================================
  // Import from AI Teams
  // ============================================

  /**
   * Import data from AI Teams debate/discussion
   * @param topicId - Teams topic ID
   * @param userId - User ID for access control
   * @returns Unified SlidesSourceData structure
   */
  async importFromTeams(
    topicId: string,
    userId: string,
  ): Promise<SlidesSourceData> {
    this.logger.log(`Importing from Teams topic: ${topicId}`);

    const topic = await this.prisma.topic.findFirst({
      where: {
        id: topicId,
        members: {
          some: { userId },
        },
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            sender: {
              select: { id: true, fullName: true },
            },
            aiMember: {
              select: { id: true, displayName: true, roleDescription: true },
            },
          },
        },
        aiMembers: {
          select: { id: true, displayName: true },
        },
      },
    });

    if (!topic) {
      throw new NotFoundException(`Teams topic not found: ${topicId}`);
    }

    // Group messages by sender to form sections (different perspectives)
    const senderMap = new Map<
      string,
      { name: string; perspective?: string; messages: string[] }
    >();

    for (const msg of topic.messages) {
      const senderId = msg.aiMemberId || msg.senderId || "unknown";
      const senderName =
        msg.aiMember?.displayName || msg.sender?.fullName || "Unknown Sender";
      const perspective = msg.aiMember?.roleDescription || undefined;

      if (!senderMap.has(senderId)) {
        senderMap.set(senderId, {
          name: senderName,
          perspective,
          messages: [],
        });
      }

      if (msg.content) {
        senderMap.get(senderId)!.messages.push(msg.content);
      }
    }

    // Convert to sections
    const sections: SourceSection[] = [];
    let sectionIndex = 0;

    for (const [, sender] of senderMap) {
      sections.push({
        title: sender.name,
        content: sender.messages.join("\n\n"),
        order: sectionIndex++,
        perspective: sender.perspective,
      });
    }

    // Collect all message content
    const allContent = topic.messages.map((m) => m.content || "").join("\n\n");

    return {
      sourceText: allContent,
      sourceType: "teams",
      sourceId: topicId,
      sections,
      metadata: {
        title: topic.name,
        topic: topic.description || undefined,
        agents: topic.aiMembers.map((a) => a.displayName),
        createdAt: topic.createdAt,
      },
    };
  }

  // ============================================
  // Import from Library
  // ============================================

  /**
   * Import resources from Library
   * @param resourceIds - Array of resource IDs
   * @param _userId - User ID for access control (reserved for future use)
   * @returns Array of Asset objects
   */
  async importFromLibrary(
    resourceIds: string[],
    _userId: string,
  ): Promise<Asset[]> {
    this.logger.log(`Importing ${resourceIds.length} resources from Library`);

    const resources = await this.prisma.resource.findMany({
      where: {
        id: { in: resourceIds },
      },
    });

    return resources.map((r) => ({
      id: r.id,
      type: this.mapResourceType(r.type),
      url: r.sourceUrl,
      title: r.title || undefined,
      description: r.abstract || undefined,
      thumbnailUrl: r.thumbnailUrl || undefined,
    }));
  }

  // ============================================
  // List Available Sources (for UI)
  // ============================================

  /**
   * List available Research topics for import
   */
  async listResearchTopics(userId: string): Promise<SourceListItem[]> {
    const topics = await this.researchExport.listTopicsForExport(
      userId,
      IMPORT_CONFIG.DEFAULT_LIST_LIMIT,
    );

    return topics.map((t) => ({
      id: t.id,
      title: t.name,
      type: "research" as SlidesSourceType,
      preview: t.description || undefined,
      createdAt: t.createdAt,
      metadata: {
        pageCount: t.dimensionCount,
      },
    }));
  }

  /**
   * List available Writing projects for import
   */
  async listWritingProjects(userId: string): Promise<SourceListItem[]> {
    const projects = await this.writingExport.listProjectsForExport(
      userId,
      IMPORT_CONFIG.DEFAULT_LIST_LIMIT,
    );

    return projects.map((p) => ({
      id: p.id,
      title: p.name,
      type: "writing" as SlidesSourceType,
      preview: p.genre || undefined,
      createdAt: p.createdAt,
      metadata: {
        pageCount: p.volumeCount,
      },
    }));
  }

  /**
   * List available Teams topics for import
   */
  async listTeamsTopics(userId: string): Promise<SourceListItem[]> {
    const topics = await this.prisma.topic.findMany({
      where: {
        members: {
          some: { userId },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: IMPORT_CONFIG.DEFAULT_LIST_LIMIT,
      include: {
        _count: {
          select: { messages: true, aiMembers: true },
        },
      },
    });

    return topics.map((t) => ({
      id: t.id,
      title: t.name,
      type: "teams" as SlidesSourceType,
      preview: t.description || undefined,
      createdAt: t.createdAt,
      metadata: {
        pageCount: t._count.messages,
      },
    }));
  }

  /**
   * List available Library resources for import
   */
  async listLibraryResources(
    _userId: string,
    type?: string,
  ): Promise<SourceListItem[]> {
    const resources = await this.prisma.resource.findMany({
      where: type ? { type: type as never } : undefined,
      orderBy: { createdAt: "desc" },
      take: IMPORT_CONFIG.LIBRARY_LIST_LIMIT,
      select: {
        id: true,
        title: true,
        abstract: true,
        thumbnailUrl: true,
        type: true,
        createdAt: true,
      },
    });

    return resources.map((r) => ({
      id: r.id,
      title: r.title || "Untitled",
      type: "library" as SlidesSourceType,
      preview: r.abstract || undefined,
      thumbnailUrl: r.thumbnailUrl || undefined,
      createdAt: r.createdAt,
    }));
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Extract chart data from research report with validation
   * @param report - Report object containing charts field
   * @returns Array of validated chart data structures
   */
  private extractChartsFromReport(
    report: { charts: unknown } | null | undefined,
  ): SourceChartData[] {
    if (!report?.charts) {
      return [];
    }

    const charts: SourceChartData[] = [];

    // Validate charts is an array
    if (!Array.isArray(report.charts)) {
      this.logger.warn(
        "[extractChartsFromReport] Charts field is not an array",
      );
      return charts;
    }

    const validChartTypes: ChartType[] = [
      "bar",
      "line",
      "pie",
      "donut",
      "radar",
      "treemap",
      "funnel",
      "area",
      "scatter",
    ];

    for (const chart of report.charts) {
      // Enforce limit
      if (charts.length >= IMPORT_CONFIG.MAX_CHARTS) {
        break;
      }

      // Skip if not a valid object
      if (!chart || typeof chart !== "object") {
        continue;
      }

      const chartObj = chart as Record<string, unknown>;

      // Validate required fields
      if (!chartObj.type || !chartObj.title) {
        continue;
      }

      // Validate type is a valid chart type
      const chartType = String(chartObj.type).toLowerCase() as ChartType;
      if (!validChartTypes.includes(chartType)) {
        this.logger.debug(
          `[extractChartsFromReport] Invalid chart type: ${chartObj.type}`,
        );
        continue;
      }

      // Validate title is a string
      const title = String(chartObj.title || "").slice(0, 200);
      if (!title) {
        continue;
      }

      // Safely extract labels and series
      const labels = Array.isArray(chartObj.labels)
        ? chartObj.labels.map((l) => String(l)).slice(0, 100)
        : [];

      const series = Array.isArray(chartObj.series)
        ? chartObj.series.slice(0, 20)
        : [];

      charts.push({
        type: chartType,
        title,
        data: {
          labels,
          series: series as never[],
        },
        source: "research",
      });
    }

    return charts;
  }

  /**
   * Extract key findings from report highlights with validation
   * @param report - Report object containing highlights and fullReport
   * @returns Array of validated key findings strings
   */
  private extractKeyFindingsFromReport(
    report: { highlights: unknown; fullReport?: string } | null | undefined,
  ): string[] {
    const findings: string[] = [];

    if (!report) {
      return findings;
    }

    // First, try to extract from structured highlights
    if (report.highlights && Array.isArray(report.highlights)) {
      for (const h of report.highlights) {
        if (findings.length >= IMPORT_CONFIG.MAX_KEY_FINDINGS) {
          break;
        }

        let text = "";
        if (typeof h === "string") {
          text = h;
        } else if (h && typeof h === "object" && "text" in h) {
          text = String((h as { text: unknown }).text || "");
        }

        // Validate and sanitize text
        text = text.trim().slice(0, 500);
        if (text.length >= 10) {
          findings.push(text);
        }
      }
    }

    // If no highlights, extract from full report text
    if (
      findings.length === 0 &&
      report.fullReport &&
      typeof report.fullReport === "string"
    ) {
      // Use a safe substring to prevent memory issues with very long content
      const content = report.fullReport.slice(
        0,
        IMPORT_CONFIG.MAX_CONTENT_LENGTH,
      );

      // Use simpler, safer patterns to prevent ReDoS
      const patterns = [
        /(?:关键发现|Key Findings?|主要结论)[:：]\s*([^\n]{10,300})/gi,
        /(?:•|●|◆|-)\s*([^\n]{20,200})/g,
      ];

      for (const pattern of patterns) {
        if (findings.length >= IMPORT_CONFIG.MAX_KEY_FINDINGS) {
          break;
        }

        const matches = content.matchAll(pattern);
        for (const match of matches) {
          if (findings.length >= IMPORT_CONFIG.MAX_KEY_FINDINGS) {
            break;
          }
          if (match[1]) {
            const text = match[1].trim();
            if (text.length >= 10 && !findings.includes(text)) {
              findings.push(text);
            }
          }
        }
      }
    }

    return findings.slice(0, IMPORT_CONFIG.MAX_KEY_FINDINGS);
  }

  /**
   * Extract references from report content with validation
   * @param content - Report content to extract URLs from
   * @returns Array of validated reference objects
   */
  private extractReferences(content: string): Reference[] {
    const references: Reference[] = [];

    if (!content || typeof content !== "string") {
      return references;
    }

    // Use a safe URL pattern with reasonable length limit to prevent ReDoS
    const urlPattern = /https?:\/\/[^\s\])"'<>]{1,500}/g;
    const matches = content.match(urlPattern) || [];

    // Deduplicate and validate URLs
    const seenUrls = new Set<string>();

    for (const rawUrl of matches) {
      if (references.length >= IMPORT_CONFIG.MAX_REFERENCES) {
        break;
      }

      // Skip if URL is too long
      if (rawUrl.length > IMPORT_CONFIG.MAX_URL_LENGTH) {
        continue;
      }

      // Skip duplicates
      if (seenUrls.has(rawUrl)) {
        continue;
      }

      // Validate URL
      try {
        const parsedUrl = new URL(rawUrl);

        // Only allow http/https protocols
        if (
          !(IMPORT_CONFIG.ALLOWED_URL_PROTOCOLS as readonly string[]).includes(
            parsedUrl.protocol,
          )
        ) {
          continue;
        }

        // Skip localhost and private IPs for security
        const hostname = parsedUrl.hostname.toLowerCase();
        if (
          hostname === "localhost" ||
          hostname === "127.0.0.1" ||
          hostname.startsWith("192.168.") ||
          hostname.startsWith("10.") ||
          hostname.startsWith("172.")
        ) {
          continue;
        }

        seenUrls.add(rawUrl);
        references.push({
          id: `ref-${references.length}`,
          title: this.extractTitleFromUrl(parsedUrl),
          url: rawUrl,
        });
      } catch {
        // Invalid URL, skip silently
        this.logger.debug(
          `[extractReferences] Invalid URL skipped: ${rawUrl.slice(0, 50)}...`,
        );
      }
    }

    return references;
  }

  /**
   * Extract a readable title from URL
   */
  private extractTitleFromUrl(url: URL): string {
    // Try to get a meaningful title from the URL path
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length > 0) {
      const lastPart = pathParts[pathParts.length - 1];
      // Remove file extension and decode
      const title = decodeURIComponent(lastPart.replace(/\.[^.]+$/, ""))
        .replace(/[-_]/g, " ")
        .trim();
      if (title.length > 3) {
        return title.charAt(0).toUpperCase() + title.slice(1);
      }
    }
    return url.hostname;
  }

  /**
   * Map resource type string to Asset type
   */
  private mapResourceType(
    type: string,
  ): "image" | "document" | "video" | "audio" {
    const typeMap: Record<string, "image" | "document" | "video" | "audio"> = {
      IMAGE: "image",
      DOCUMENT: "document",
      VIDEO: "video",
      AUDIO: "audio",
      PDF: "document",
      ARTICLE: "document",
    };

    return typeMap[type.toUpperCase()] || "document";
  }
}
