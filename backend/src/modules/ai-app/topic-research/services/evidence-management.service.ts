import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import type { TopicEvidence } from "@prisma/client";

/**
 * Evidence Query Options
 */
export interface EvidenceQueryOptions {
  skip?: number;
  take?: number;
  sourceType?: string;
  minCredibility?: number;
}

/**
 * Evidence Management Service
 *
 * 负责管理证据的生命周期：
 * 1. 证据查询和过滤
 * 2. 证据可信度管理
 * 3. 引用索引管理
 * 4. 证据去重
 */
@Injectable()
export class EvidenceManagementService {
  private readonly logger = new Logger(EvidenceManagementService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取报告的证据列表
   */
  async listEvidence(
    reportId: string,
    options: EvidenceQueryOptions = {},
  ): Promise<{ evidences: TopicEvidence[]; total: number }> {
    const { skip = 0, take = 50, sourceType, minCredibility } = options;

    const where: any = { reportId };

    if (sourceType) {
      where.sourceType = sourceType;
    }

    if (minCredibility !== undefined) {
      where.credibilityScore = { gte: minCredibility };
    }

    const [evidences, total] = await Promise.all([
      this.prisma.topicEvidence.findMany({
        where,
        skip,
        take,
        orderBy: { citationIndex: "asc" },
      }),
      this.prisma.topicEvidence.count({ where }),
    ]);

    return { evidences, total };
  }

  /**
   * 获取单个证据详情
   */
  async getEvidence(evidenceId: string): Promise<TopicEvidence | null> {
    return this.prisma.topicEvidence.findUnique({
      where: { id: evidenceId },
    });
  }

  /**
   * 获取维度分析的证据
   */
  async getEvidenceForAnalysis(analysisId: string): Promise<TopicEvidence[]> {
    return this.prisma.topicEvidence.findMany({
      where: { analysisId },
      orderBy: { citationIndex: "asc" },
    });
  }

  /**
   * 更新证据可信度评分
   */
  async updateCredibilityScore(
    evidenceId: string,
    score: number,
  ): Promise<TopicEvidence> {
    return this.prisma.topicEvidence.update({
      where: { id: evidenceId },
      data: { credibilityScore: Math.min(100, Math.max(0, Math.round(score))) },
    });
  }

  /**
   * 批量更新证据的引用索引
   */
  async reindexCitations(reportId: string): Promise<void> {
    const evidences = await this.prisma.topicEvidence.findMany({
      where: { reportId },
      orderBy: [{ analysisId: "asc" }, { accessedAt: "asc" }],
    });

    await this.prisma.$transaction(
      evidences.map((evidence, index) =>
        this.prisma.topicEvidence.update({
          where: { id: evidence.id },
          data: { citationIndex: index + 1 },
        }),
      ),
    );

    this.logger.log(
      `Reindexed ${evidences.length} citations for report ${reportId}`,
    );
  }

  /**
   * 检查 URL 是否已存在于报告中
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
   * 获取证据统计信息
   */
  async getEvidenceStats(reportId: string): Promise<{
    total: number;
    bySourceType: Record<string, number>;
    byCredibility: { high: number; medium: number; low: number };
    avgCredibility: number;
  }> {
    const evidences = await this.prisma.topicEvidence.findMany({
      where: { reportId },
      select: {
        sourceType: true,
        credibilityScore: true,
      },
    });

    const bySourceType: Record<string, number> = {};
    let high = 0;
    let medium = 0;
    let low = 0;
    let totalScore = 0;
    let scoredCount = 0;

    for (const e of evidences) {
      // 按来源类型统计
      const sourceType = e.sourceType || "unknown";
      bySourceType[sourceType] = (bySourceType[sourceType] || 0) + 1;

      // 按可信度统计
      if (e.credibilityScore !== null) {
        scoredCount++;
        totalScore += e.credibilityScore;
        if (e.credibilityScore >= 70) {
          high++;
        } else if (e.credibilityScore >= 40) {
          medium++;
        } else {
          low++;
        }
      }
    }

    return {
      total: evidences.length,
      bySourceType,
      byCredibility: { high, medium, low },
      avgCredibility:
        scoredCount > 0 ? Math.round(totalScore / scoredCount) : 0,
    };
  }

  /**
   * 删除孤立的证据（未关联到任何报告的证据）
   */
  async cleanupOrphanedEvidence(): Promise<number> {
    // 注意：这个操作可能会删除正在创建中的证据
    // 只删除超过24小时的孤立证据
    const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const result = await this.prisma.topicEvidence.deleteMany({
      where: {
        analysisId: null,
        accessedAt: { lt: cutoffDate },
      },
    });

    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} orphaned evidences`);
    }

    return result.count;
  }

  /**
   * URL 标准化
   */
  private normalizeUrl(url: string): string {
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
