import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { ReportSynthesisService } from "./services";

/**
 * 报告编辑服务
 * 集成 ReportChangeService 和 ReportAnnotationService
 * 提供给 TopicResearchService 使用
 */
@Injectable()
export class TopicResearchEditingService {
  private readonly logger = new Logger(TopicResearchEditingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reportService: ReportSynthesisService,
  ) {}

  /**
   * 验证专题所有权
   */
  private async verifyTopicOwnership(
    userId: string,
    topicId: string,
  ): Promise<void> {
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
      select: { userId: true },
    });

    if (!topic) {
      throw new NotFoundException(`Topic ${topicId} not found`);
    }

    if (topic.userId !== userId) {
      throw new NotFoundException(
        "You do not have permission to access this topic",
      );
    }
  }

  /**
   * 获取报告变更列表
   */
  async getReportChanges(_userId: string, topicId: string, reportId: string) {
    // TODO: Implement with ReportChangeService
    this.logger.log(
      `Getting changes for report ${reportId} in topic ${topicId}`,
    );
    return [];
  }

  /**
   * Checkin 单条变更
   */
  async checkinChange(
    userId: string,
    topicId: string,
    reportId: string,
    changeId: string,
  ) {
    await this.verifyTopicOwnership(userId, topicId);

    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    // TODO: Implement with ReportChangeService
    this.logger.log(`Checking in change ${changeId}`);
    return { success: true };
  }

  /**
   * 批量 Checkin 变更
   */
  async checkinAllChanges(
    userId: string,
    topicId: string,
    reportId: string,
    changeIds?: string[],
  ) {
    await this.verifyTopicOwnership(userId, topicId);

    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    // TODO: Implement with ReportChangeService
    this.logger.log(`Checking in all changes for report ${reportId}`, {
      changeIds,
    });
    return { count: 0 };
  }

  /**
   * 获取报告批注列表
   */
  async getReportAnnotations(
    userId: string,
    topicId: string,
    reportId: string,
    status?: string,
  ) {
    await this.verifyTopicOwnership(userId, topicId);

    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    // TODO: Implement with ReportAnnotationService
    this.logger.log(`Getting annotations for report ${reportId}`, { status });
    return [];
  }

  /**
   * 创建批注
   */
  async createAnnotation(
    userId: string,
    topicId: string,
    reportId: string,
    dto: any,
  ) {
    await this.verifyTopicOwnership(userId, topicId);

    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    // TODO: Implement with ReportAnnotationService
    this.logger.log(`Creating annotation for report ${reportId}`, dto);
    return { id: "temp", ...dto };
  }

  /**
   * 更新批注
   */
  async updateAnnotation(
    userId: string,
    topicId: string,
    reportId: string,
    annotationId: string,
    dto: any,
  ) {
    await this.verifyTopicOwnership(userId, topicId);

    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    // TODO: Implement with ReportAnnotationService
    this.logger.log(`Updating annotation ${annotationId}`, dto);
    return { id: annotationId, ...dto };
  }

  /**
   * 删除批注
   */
  async deleteAnnotation(
    userId: string,
    topicId: string,
    reportId: string,
    annotationId: string,
  ) {
    await this.verifyTopicOwnership(userId, topicId);

    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    // TODO: Implement with ReportAnnotationService
    this.logger.log(`Deleting annotation ${annotationId}`);
    return { success: true };
  }

  /**
   * 解决批注
   */
  async resolveAnnotation(
    userId: string,
    topicId: string,
    reportId: string,
    annotationId: string,
  ) {
    await this.verifyTopicOwnership(userId, topicId);

    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    // TODO: Implement with ReportAnnotationService
    this.logger.log(`Resolving annotation ${annotationId}`);
    return { id: annotationId, status: "RESOLVED" };
  }

  /**
   * 批量解决批注
   */
  async resolveAllAnnotations(
    userId: string,
    topicId: string,
    reportId: string,
    annotationIds?: string[],
  ) {
    await this.verifyTopicOwnership(userId, topicId);

    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    // TODO: Implement with ReportAnnotationService
    this.logger.log(`Resolving all annotations for report ${reportId}`, {
      annotationIds,
    });
    return { count: 0 };
  }
}
