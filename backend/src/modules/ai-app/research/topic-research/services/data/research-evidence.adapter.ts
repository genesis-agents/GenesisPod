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

import { Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { EvidenceManagerService } from "@/modules/ai-engine/evidence/services/evidence-manager.service";
import { CitationFormatterService } from "@/modules/ai-engine/evidence/services/citation-formatter.service";
import {
  EvidenceType,
  CitationStyle,
  Evidence,
  SaveEvidenceRequest,
} from "@/modules/ai-engine/evidence/abstractions/evidence.interface";
import { GlobalDeduplicationService } from "@/common/deduplication/deduplication.service";
import { EvidenceSyncCompensationService } from "./evidence-sync-compensation.service";
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
    @Optional()
    private readonly deduplicationService?: GlobalDeduplicationService,
    @Optional()
    private readonly compensationService?: EvidenceSyncCompensationService,
  ) {}

  // ==================== 证据保存 ====================

  /**
   * 保存研究证据（双写模式）
   * 同时写入 TopicEvidence 和 engine_evidences
   * ★ 优雅降级：如果 Engine Evidence 写入失败，不影响核心功能
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

    // 2. 写入 TopicEvidence（向后兼容，必须成功）
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

    // 3. 写入 Engine Evidence（统一管理，可选 - 失败时优雅降级 + 补偿）
    let engineEvidenceId: string | null = null;
    const engineRequest: SaveEvidenceRequest = {
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
        location: input.analysisId
          ? `analysis:${input.analysisId}`
          : undefined,
        context: `citation:${nextCitationIndex}`,
      },
      relevanceScore: 0.5,
      credibilityScore: input.credibilityScore
        ? input.credibilityScore / 100
        : undefined,
    };

    try {
      const engineEvidence = await this.engineEvidence.save(engineRequest);
      engineEvidenceId = engineEvidence.id;
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);

      // ★ 优雅降级：Engine Evidence 写入失败不影响核心功能
      this.logger.warn(
        `Engine evidence save failed (degraded mode): ${errorMsg}`,
      );

      // ★ 加入补偿队列，稍后重试
      if (this.compensationService) {
        this.compensationService.queueForRetry(
          topicEvidence.id,
          engineRequest,
          errorMsg,
        );
      }
    }

    return {
      topicEvidenceId: topicEvidence.id,
      engineEvidenceId: engineEvidenceId ?? "skipped",
    };
  }

  /**
   * 批量保存研究证据
   * ★ 使用事务 + createMany 保证批量操作原子性
   */
  async saveResearchEvidenceBatch(
    inputs: ResearchEvidenceInput[],
  ): Promise<EvidenceSaveResult[]> {
    if (inputs.length === 0) return [];

    this.logger.debug(`Batch saving ${inputs.length} research evidences`);

    const results: EvidenceSaveResult[] = [];
    const BATCH_SIZE = 50;

    // 按 reportId 分组，确保同一报告的证据在同一事务中处理
    const groupedByReport = new Map<string, ResearchEvidenceInput[]>();
    for (const input of inputs) {
      const group = groupedByReport.get(input.reportId) || [];
      group.push(input);
      groupedByReport.set(input.reportId, group);
    }

    // 逐组处理
    for (const [reportId, reportInputs] of groupedByReport) {
      // 分批处理每个报告的证据
      for (let i = 0; i < reportInputs.length; i += BATCH_SIZE) {
        const batch = reportInputs.slice(i, i + BATCH_SIZE);

        try {
          const batchResults = await this.prisma.$transaction(
            async (tx) => {
              // 1. 获取当前报告的最大引用索引
              const maxResult = await tx.topicEvidence.aggregate({
                where: { reportId },
                _max: { citationIndex: true },
              });
              let nextIndex = (maxResult._max.citationIndex ?? 0) + 1;

              // 2. 准备批量创建的数据
              const createData = batch.map((input) => ({
                reportId: input.reportId,
                analysisId: input.analysisId,
                url: input.url,
                title: input.title,
                snippet: input.snippet,
                sourceType: input.sourceType,
                domain: input.domain,
                publishedAt: input.publishedAt,
                credibilityScore: input.credibilityScore,
                citationIndex: nextIndex++,
              }));

              // 3. 批量创建 TopicEvidence（原子操作）
              await tx.topicEvidence.createMany({ data: createData });

              // 4. 查询刚创建的记录获取 ID
              const createdEvidences = await tx.topicEvidence.findMany({
                where: {
                  reportId,
                  citationIndex: {
                    gte: (maxResult._max.citationIndex ?? 0) + 1,
                    lte: nextIndex - 1,
                  },
                },
                orderBy: { citationIndex: "asc" },
              });

              // 5. 尝试批量写入 Engine Evidence（降级不影响事务）
              const engineResults = await Promise.allSettled(
                batch.map((input, idx) =>
                  this.engineEvidence.save({
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
                      location: input.analysisId
                        ? `analysis:${input.analysisId}`
                        : undefined,
                      context: `citation:${createdEvidences[idx]?.citationIndex}`,
                    },
                    relevanceScore: 0.5,
                    credibilityScore: input.credibilityScore
                      ? input.credibilityScore / 100
                      : undefined,
                  }),
                ),
              );

              // 6. 构建返回结果
              return createdEvidences.map((evidence, idx) => {
                const engineResult = engineResults[idx];
                let engineEvidenceId = "skipped";

                if (engineResult.status === "fulfilled") {
                  engineEvidenceId = engineResult.value.id;
                } else {
                  this.logger.warn(
                    `Engine evidence save failed for ${evidence.id}: ${engineResult.reason}`,
                  );
                }

                return {
                  topicEvidenceId: evidence.id,
                  engineEvidenceId,
                };
              });
            },
            { timeout: 30000 }, // 30 秒超时
          );

          results.push(...batchResults);
        } catch (error) {
          this.logger.error(
            `Batch ${i}-${i + batch.length} for report ${reportId} failed: ${error}`,
          );
          throw error;
        }
      }
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
   * ★ 使用 Prisma 枚举大写值
   */
  private mapSourceTypeToEvidenceType(sourceType: string): EvidenceType {
    const lowerType = sourceType.toLowerCase();

    switch (lowerType) {
      case "academic":
      case "journal":
      case "paper":
        return "CITATION";

      case "news":
      case "report":
      case "official":
      case "government":
        return "REFERENCE";

      case "quote":
        return "QUOTE";

      case "inspiration":
      case "idea":
        return "INSPIRATION";

      case "web":
      case "blog":
      default:
        return "FACT";
    }
  }

  /**
   * 检查 URL 是否已存在（去重）
   * ★ 使用统一的 URL 标准化服务
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
   * ★ 优先使用 GlobalDeduplicationService（更完善的标准化规则）
   * ★ 降级：如果服务不可用，使用本地简化实现
   */
  private normalizeUrl(url: string): string {
    if (!url) return "";

    // 优先使用统一的去重服务
    if (this.deduplicationService) {
      return this.deduplicationService.normalizeUrl(url);
    }

    // 降级：本地简化实现
    try {
      const parsed = new URL(url);
      // 移除 tracking 参数
      const trackingParams = [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term",
        "fbclid",
        "gclid",
        "ref",
      ];
      trackingParams.forEach((param) => parsed.searchParams.delete(param));
      // 移除尾部斜杠
      return parsed.toString().replace(/\/$/, "").toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }
}
