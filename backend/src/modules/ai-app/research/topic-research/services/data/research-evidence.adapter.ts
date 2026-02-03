/**
 * Research Evidence Adapter
 *
 * 将 AI Research 的证据管理需求适配到 AI Engine EvidenceModule
 * 提供统一的证据存储、检索和引用格式化能力
 *
 * 策略：双写模式
 * - 新证据同时写入 TopicEvidence（向后兼容）和 engine_evidences（统一管理）
 * - 读取优先使用 TopicEvidence（保持现有功能）
 * - 引用格式化使用 Engine Evidence（新能力）
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { EvidenceManagerService } from "@/modules/ai-engine/evidence/services/evidence-manager.service";
import { CitationFormatterService } from "@/modules/ai-engine/evidence/services/citation-formatter.service";
import {
  EvidenceType,
  CitationStyle,
  Evidence,
} from "@/modules/ai-engine/evidence/abstractions/evidence.interface";
import type { TopicEvidence } from "@prisma/client";

/**
 * 研究证据输入参数
 */
export interface ResearchEvidenceInput {
  reportId: string;
  analysisId?: string;
  url: string;
  title: string;
  snippet: string;
  sourceType: string;
  domain?: string;
  publishedAt?: Date;
  credibilityScore?: number;
}

/**
 * 证据保存结果
 */
export interface EvidenceSaveResult {
  topicEvidenceId: string;
  engineEvidenceId: string;
}

@Injectable()
export class ResearchEvidenceAdapter {
  private readonly logger = new Logger(ResearchEvidenceAdapter.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engineEvidence: EvidenceManagerService,
    private readonly citationFormatter: CitationFormatterService,
  ) {}

  // ==================== 证据保存 ====================

  /**
   * 保存研究证据（双写模式）
   * 同时写入 TopicEvidence 和 engine_evidences
   */
  async saveResearchEvidence(
    input: ResearchEvidenceInput,
  ): Promise<EvidenceSaveResult> {
    this.logger.debug(`Saving research evidence: ${input.title}`);

    // 1. 获取当前报告的最大引用索引
    const maxCitation = await this.prisma.topicEvidence.aggregate({
      where: { reportId: input.reportId },
      _max: { citationIndex: true },
    });
    const nextCitationIndex = (maxCitation._max.citationIndex ?? 0) + 1;

    // 2. 写入 TopicEvidence（向后兼容）
    const topicEvidence = await this.prisma.topicEvidence.create({
      data: {
        reportId: input.reportId,
        analysisId: input.analysisId,
        url: input.url,
        title: input.title,
        snippet: input.snippet,
        sourceType: input.sourceType,
        domain: input.domain,
        publishedAt: input.publishedAt,
        credibilityScore: input.credibilityScore,
        citationIndex: nextCitationIndex,
      },
    });

    // 3. 写入 Engine Evidence（统一管理）
    const engineEvidence = await this.engineEvidence.save({
      type: this.mapSourceTypeToEvidenceType(input.sourceType),
      source: {
        url: input.url,
        title: input.title,
        domain: input.domain,
        publishedAt: input.publishedAt,
      },
      content: {
        original: input.snippet,
        snippet: input.snippet.slice(0, 500),
      },
      associations: {
        entityType: "research_report",
        entityId: input.reportId,
        location: input.analysisId ? `analysis:${input.analysisId}` : undefined,
        context: `citation:${nextCitationIndex}`,
      },
      relevanceScore: 0.5,
      credibilityScore: input.credibilityScore
        ? input.credibilityScore / 100
        : undefined,
    });

    return {
      topicEvidenceId: topicEvidence.id,
      engineEvidenceId: engineEvidence.id,
    };
  }

  /**
   * 批量保存研究证据
   */
  async saveResearchEvidenceBatch(
    inputs: ResearchEvidenceInput[],
  ): Promise<EvidenceSaveResult[]> {
    this.logger.debug(`Batch saving ${inputs.length} research evidences`);

    const results: EvidenceSaveResult[] = [];

    // 分组处理，每批 50 条
    const BATCH_SIZE = 50;
    for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
      const batch = inputs.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((input) => this.saveResearchEvidence(input)),
      );
      results.push(...batchResults);
    }

    return results;
  }

  // ==================== 引用格式化 ====================

  /**
   * 格式化单个证据的引用
   */
  formatCitation(
    evidence: TopicEvidence,
    style: CitationStyle = "apa",
  ): string {
    // 将 TopicEvidence 转换为 Engine Evidence 格式
    const engineFormat: Evidence = {
      id: evidence.id,
      type: this.mapSourceTypeToEvidenceType(evidence.sourceType || "web"),
      source: {
        url: evidence.url,
        title: evidence.title,
        domain: evidence.domain ?? undefined,
        publishedAt: evidence.publishedAt ?? undefined,
      },
      content: {
        original: evidence.snippet || "",
        snippet: (evidence.snippet || "").slice(0, 500),
      },
      associations: {
        entityType: "research_report",
        entityId: evidence.reportId,
      },
      metadata: {
        relevanceScore: 0.5,
        credibilityScore: evidence.credibilityScore
          ? evidence.credibilityScore / 100
          : undefined,
        citationCount: 0,
        createdAt: evidence.accessedAt,
        updatedAt: evidence.accessedAt,
      },
    };

    return this.citationFormatter.format(engineFormat, style);
  }

  /**
   * 生成报告的完整参考文献列表
   */
  async generateBibliography(
    reportId: string,
    style: CitationStyle = "apa",
  ): Promise<string> {
    // 获取报告的所有证据
    const evidences = await this.prisma.topicEvidence.findMany({
      where: { reportId },
      orderBy: { citationIndex: "asc" },
    });

    if (evidences.length === 0) {
      return "";
    }

    // 格式化每个引用
    const citations = evidences.map((e) => this.formatCitation(e, style));

    // 使用 CitationFormatter 生成参考文献列表
    return this.citationFormatter.formatBibliography(citations, style);
  }

  /**
   * 生成带编号的参考文献列表
   */
  async generateNumberedBibliography(
    reportId: string,
    style: CitationStyle = "apa",
  ): Promise<string> {
    const evidences = await this.prisma.topicEvidence.findMany({
      where: { reportId },
      orderBy: { citationIndex: "asc" },
    });

    if (evidences.length === 0) {
      return "";
    }

    const lines = evidences.map((e, index) => {
      const citation = this.formatCitation(e, style);
      return `[${index + 1}] ${citation}`;
    });

    return lines.join("\n\n");
  }

  // ==================== 证据检索 ====================

  /**
   * 获取报告的证据统计（使用 Engine 能力）
   */
  async getEvidenceStats(reportId: string): Promise<{
    totalCount: number;
    byType: Record<EvidenceType, number>;
    avgRelevanceScore: number;
    avgCredibilityScore: number;
  }> {
    return this.engineEvidence.getStats("research_report", reportId);
  }

  /**
   * 根据可信度筛选证据
   */
  async getHighCredibilityEvidence(
    reportId: string,
    minScore: number = 70,
  ): Promise<TopicEvidence[]> {
    return this.prisma.topicEvidence.findMany({
      where: {
        reportId,
        credibilityScore: { gte: minScore },
      },
      orderBy: { credibilityScore: "desc" },
    });
  }

  /**
   * 根据来源类型筛选证据
   */
  async getEvidenceBySourceType(
    reportId: string,
    sourceType: string,
  ): Promise<TopicEvidence[]> {
    return this.prisma.topicEvidence.findMany({
      where: { reportId, sourceType },
      orderBy: { citationIndex: "asc" },
    });
  }

  // ==================== 工具方法 ====================

  /**
   * 将来源类型映射到证据类型
   */
  private mapSourceTypeToEvidenceType(sourceType: string): EvidenceType {
    const lowerType = sourceType.toLowerCase();

    switch (lowerType) {
      case "academic":
      case "journal":
      case "paper":
        return "citation";

      case "news":
      case "report":
      case "official":
      case "government":
        return "reference";

      case "quote":
        return "quote";

      case "inspiration":
      case "idea":
        return "inspiration";

      case "web":
      case "blog":
      default:
        return "fact";
    }
  }

  /**
   * 检查 URL 是否已存在（去重）
   */
  async isDuplicateUrl(reportId: string, url: string): Promise<boolean> {
    const normalizedUrl = this.normalizeUrl(url);
    const existing = await this.prisma.topicEvidence.findFirst({
      where: {
        reportId,
        url: { contains: normalizedUrl },
      },
    });
    return !!existing;
  }

  /**
   * URL 标准化
   */
  private normalizeUrl(url: string): string {
    if (!url) return "";
    try {
      const parsed = new URL(url);
      // 移除 tracking 参数
      parsed.searchParams.delete("utm_source");
      parsed.searchParams.delete("utm_medium");
      parsed.searchParams.delete("utm_campaign");
      parsed.searchParams.delete("ref");
      // 移除尾部斜杠
      return parsed.toString().replace(/\/$/, "").toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }
}
