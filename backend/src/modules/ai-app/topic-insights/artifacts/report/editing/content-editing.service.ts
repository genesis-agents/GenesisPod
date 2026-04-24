import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { ChatFacade } from "@/modules/ai-engine/facade";
import { sanitize } from "@/modules/ai-app/topic-insights/shared/utils/prompt-sanitizer.utils";
import {
  REPORT_EDITING_SYSTEM_PROMPT,
  buildEditPrompt,
  buildEnhancedEditPrompt,
} from "@/modules/ai-app/topic-insights/prompts";
import type { CompareReportsDto } from "@/modules/ai-app/topic-insights/api/dto";
import { ReportSynthesisService } from "../core/synthesis.service";
import { ReportDataService } from "../core/data.service";

export interface AiEditReportDto {
  operation: "rewrite" | "polish" | "expand" | "compress" | "style";
  selectedText?: string;
  context?: string;
  fullContent?: string;
  styleGuide?: string;
  selectorPrefix?: string;
  selectorSuffix?: string;
  selection?: string;
  customInstruction?: string;
  targetStyle?: "academic" | "business" | "casual" | "technical";
}

export interface UpdateReportContentDto {
  executiveSummary?: string;
  fullReport?: string;
  changeDescription?: string;
}

/**
 * ReportContentEditingService — user-facing report content mutation.
 *
 * God service split step 2. Owns:
 * - updateReportContent (manual save)
 * - aiEditReport (LLM-driven edit with selection replacement)
 * - getReportRevisions / rollbackReport
 * - compareReports (version diff)
 *
 * Distinct from ReportEditorService (editor.service.ts) which handles
 * pre-synthesis cross-dimension editing. This service is the post-synthesis,
 * user-initiated editing entry point.
 *
 * Each public method runs verifyTopicOwnership / verifyTopicReadAccess inline
 * before delegating to ReportDataService / ReportSynthesisService / ChatFacade.
 */
@Injectable()
export class ReportContentEditingService {
  private readonly logger = new Logger(ReportContentEditingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatFacade: ChatFacade,
    private readonly reportService: ReportSynthesisService,
    private readonly reportDataService: ReportDataService,
  ) {}

  async updateReportContent(
    userId: string,
    topicId: string,
    reportId: string,
    dto: UpdateReportContentDto,
  ) {
    await this.verifyTopicOwnership(userId, topicId);

    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    return this.reportDataService.updateReportContent(reportId, dto);
  }

  async aiEditReport(
    userId: string,
    topicId: string,
    reportId: string,
    dto: AiEditReportDto,
  ) {
    await this.verifyTopicOwnership(userId, topicId);

    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    const useNewMode = Boolean(dto.selectedText);
    const textToEdit = dto.selectedText || dto.selection || report.fullReport;

    let prompt: string;
    if (useNewMode) {
      prompt = buildEnhancedEditPrompt(dto.operation, textToEdit, {
        userInstruction: dto.context ? sanitize(dto.context) : undefined,
        fullContent: dto.fullContent,
        styleGuide: dto.styleGuide,
        targetStyle: dto.targetStyle,
      });
    } else {
      prompt = buildEditPrompt(dto.operation, textToEdit, {
        targetStyle: dto.targetStyle,
        customInstruction: dto.customInstruction
          ? sanitize(dto.customInstruction)
          : undefined,
      });
    }

    const aiResponse = await this.chatFacade.chat({
      operationName: "报告编辑",
      messages: [
        { role: "system", content: REPORT_EDITING_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      modelType: AIModelType.CHAT,
      taskProfile: {
        creativity: dto.operation === "rewrite" ? "high" : "medium",
        outputLength: dto.operation === "compress" ? "short" : "medium",
      },
      billing: {
        userId,
        moduleType: "topic-insights",
        operationType: "ai-edit",
        referenceId: reportId,
        description: `AI 编辑报告 (${dto.operation})`,
      },
    });

    const editedContent = aiResponse.content || "";

    const selectionToReplace = dto.selectedText || dto.selection;
    let newFullReport = report.fullReport;

    if (selectionToReplace) {
      let selectionIndex = -1;

      if (dto.selectorPrefix || dto.selectorSuffix) {
        const prefix = dto.selectorPrefix || "";
        const suffix = dto.selectorSuffix || "";
        const contextPattern = prefix + selectionToReplace + suffix;
        const contextIndex = report.fullReport.indexOf(contextPattern);

        if (contextIndex !== -1) {
          selectionIndex = contextIndex + prefix.length;
          this.logger.debug(
            `Context-based match found at index ${selectionIndex}`,
          );
        } else {
          this.logger.warn(`Context pattern not found, falling back`);
        }
      }

      if (selectionIndex === -1) {
        selectionIndex = report.fullReport.indexOf(selectionToReplace);
      }

      if (selectionIndex !== -1) {
        newFullReport =
          report.fullReport.substring(0, selectionIndex) +
          editedContent +
          report.fullReport.substring(
            selectionIndex + selectionToReplace.length,
          );
      } else {
        this.logger.warn(`Selection not found in report ${reportId}`);
      }
    } else {
      newFullReport = editedContent;
    }

    const changeDescription = dto.context
      ? `AI ${dto.operation}: ${dto.context.slice(0, 50)}`
      : `AI ${dto.operation} 操作`;
    const updatedReport = await this.reportDataService.saveAiEditRevision(
      reportId,
      report.fullReport,
      newFullReport,
      changeDescription,
      dto.operation,
    );

    return {
      report: updatedReport,
      editedContent,
      operation: dto.operation,
    };
  }

  async getReportRevisions(userId: string, topicId: string, reportId: string) {
    await this.verifyTopicReadAccess(userId, topicId);

    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    return this.reportDataService.getReportRevisions(reportId);
  }

  async rollbackReport(
    userId: string,
    topicId: string,
    reportId: string,
    revisionNumber: number,
  ) {
    await this.verifyTopicOwnership(userId, topicId);

    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    return this.reportDataService.rollbackToRevision(
      reportId,
      revisionNumber,
      report.fullReport,
    );
  }

  async compareReports(
    userId: string,
    topicId: string,
    dto: CompareReportsDto,
  ) {
    await this.verifyTopicOwnership(userId, topicId);

    const [fromReport, toReport] = await Promise.all([
      this.prisma.topicReport.findFirst({
        where: { topicId, version: dto.from },
        select: { id: true },
      }),
      this.prisma.topicReport.findFirst({
        where: { topicId, version: dto.to },
        select: { id: true },
      }),
    ]);

    if (!fromReport || !toReport) {
      throw new NotFoundException("One or both report versions not found");
    }

    return this.reportService.compareReports(
      topicId,
      fromReport.id,
      toReport.id,
    );
  }

  // ─── Access helpers (inlined to match sibling services' pattern) ────────────

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
      throw new ForbiddenException(
        "You do not have permission to access this topic",
      );
    }
  }

  private async verifyTopicReadAccess(
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

    if (topic.userId === userId) {
      return;
    }

    const hasAccess = await this.checkTopicAccess(userId, topicId);
    if (!hasAccess) {
      throw new ForbiddenException(
        "You do not have permission to access this topic",
      );
    }
  }

  private async checkTopicAccess(
    userId: string,
    topicId: string,
  ): Promise<boolean> {
    const result = await this.prisma.$queryRaw<
      { visibility: string; is_collaborator: boolean }[]
    >`
      SELECT
        rt.visibility,
        EXISTS(
          SELECT 1 FROM research_topic_collaborators tc
          WHERE tc."topic_id" = rt.id
            AND tc."user_id" = ${userId}
            AND tc."is_active" = true
        ) as is_collaborator
      FROM research_topics rt
      WHERE rt.id = ${topicId}
    `;

    if (!result.length) {
      return false;
    }

    const { visibility, is_collaborator } = result[0];

    if (visibility === "PUBLIC") {
      return true;
    }

    if (visibility === "SHARED" && is_collaborator) {
      return true;
    }

    return false;
  }
}
