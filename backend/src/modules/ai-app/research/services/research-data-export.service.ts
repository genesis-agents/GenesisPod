import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";

/**
 * Research 数据导出服务
 * 封装 Research 模块的数据导出能力，供 Office 等其他模块调用
 */

export interface ExportableResearchData {
  id: string;
  name: string;
  description: string | null;
  language: string | null;
  createdAt: Date;
  dimensions: Array<{
    name: string;
    description: string | null;
    sortOrder: number;
  }>;
  latestReport: {
    fullReport: string | null;
    charts: unknown;
    highlights: unknown;
    dimensionAnalyses: Array<{
      summary: string | null;
      dataPoints: unknown;
      dimension: {
        name: string;
      };
    }>;
  } | null;
}

export interface ResearchListItem {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  dimensionCount: number;
}

@Injectable()
export class ResearchDataExportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取 Research Topic 数据（用于导出到其他模块）
   */
  async getTopicForExport(
    topicId: string,
    userId: string,
  ): Promise<ExportableResearchData> {
    const topic = await this.prisma.researchTopic.findFirst({
      where: {
        id: topicId,
        userId,
      },
      include: {
        reports: {
          orderBy: { generatedAt: "desc" },
          take: 1,
          include: {
            dimensionAnalyses: {
              include: {
                dimension: true,
              },
              orderBy: { createdAt: "asc" },
            },
          },
        },
        dimensions: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!topic) {
      throw new NotFoundException(`Research topic not found: ${topicId}`);
    }

    const latestReport = topic.reports[0];

    return {
      id: topic.id,
      name: topic.name,
      description: topic.description,
      language: topic.language,
      createdAt: topic.createdAt,
      dimensions: topic.dimensions.map((d) => ({
        name: d.name,
        description: d.description,
        sortOrder: d.sortOrder,
      })),
      latestReport: latestReport
        ? {
            fullReport: latestReport.fullReport,
            charts: latestReport.charts,
            highlights: latestReport.highlights,
            dimensionAnalyses: latestReport.dimensionAnalyses.map((a) => ({
              summary: a.summary,
              dataPoints: a.dataPoints,
              dimension: {
                name: a.dimension.name,
              },
            })),
          }
        : null,
    };
  }

  /**
   * 列出用户的 Research Topics（用于其他模块的选择列表）
   */
  async listTopicsForExport(
    userId: string,
    limit = 50,
  ): Promise<ResearchListItem[]> {
    const topics = await this.prisma.researchTopic.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: {
        _count: {
          select: { dimensions: true },
        },
      },
    });

    return topics.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      createdAt: t.createdAt,
      dimensionCount: t._count.dimensions,
    }));
  }
}
