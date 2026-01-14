/**
 * Dimension Mission Service
 *
 * 维度研究的 Mission 协调器
 *
 * 核心职责：
 * 1. 调用 Leader 规划维度分析大纲
 * 2. 按照大纲创建章节任务
 * 3. 调用 Agent 写作各章节
 * 4. 调用 Leader 审核各章节（支持多轮修订）
 * 5. 调用 Leader 整合最终结果
 *
 * 解决的问题：
 * - 避免单次 LLM 调用生成超长内容导致截断
 * - 充分发挥 Leader-Agent 协作机制
 * - 支持多轮质量审核
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  DimensionStatus,
  type ResearchTopic,
  type TopicDimension,
} from "@prisma/client";
import {
  ResearchLeaderService,
  type DimensionOutline,
  type SectionPlan,
  type IntegratedDimensionResult,
} from "./research-leader.service";
import {
  SectionWriterService,
  type SectionWriteResult,
} from "./section-writer.service";
import { DataSourceRouterService } from "./data-source-router.service";
import { ResearchEventEmitterService } from "./research-event-emitter.service";
import type {
  EvidenceData,
  DimensionAnalysisResult,
} from "../types/research.types";
import type { DataSourceResult } from "../types/data-source.types";

/**
 * 维度 Mission 执行结果
 */
export interface DimensionMissionResult {
  success: boolean;
  dimensionId: string;
  analysisResult?: DimensionAnalysisResult;
  evidenceIds: string[];
  outline?: DimensionOutline;
  sectionResults?: SectionWriteResult[];
  integratedResult?: IntegratedDimensionResult;
  error?: string;
}

/**
 * Mission 执行进度
 */
export interface MissionProgress {
  stage:
    | "planning"
    | "writing"
    | "reviewing"
    | "integrating"
    | "completed"
    | "failed";
  sectionsTotal: number;
  sectionsCompleted: number;
  currentSection?: string;
  message: string;
}

@Injectable()
export class DimensionMissionService {
  private readonly logger = new Logger(DimensionMissionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leaderService: ResearchLeaderService,
    private readonly sectionWriter: SectionWriterService,
    private readonly dataSourceRouter: DataSourceRouterService,
    private readonly eventEmitter: ResearchEventEmitterService,
  ) {}

  /**
   * 执行维度研究 Mission
   *
   * 完整流程：
   * 1. Leader 规划大纲
   * 2. Agent 写作各章节（可并行）
   * 3. Leader 审核各章节（多轮修订）
   * 4. Leader 整合最终结果
   *
   * @param topic 研究专题
   * @param dimension 研究维度
   * @param reportId 报告ID（可选，用于关联证据）
   * @param missionId 任务ID（可选，用于持久化团队消息）
   * @returns Mission 执行结果
   */
  async executeDimensionMission(
    topic: ResearchTopic,
    dimension: TopicDimension,
    reportId?: string,
    missionId?: string,
  ): Promise<DimensionMissionResult> {
    this.logger.log(
      `[executeDimensionMission] Starting mission for dimension: ${dimension.name} (${dimension.id})`,
    );

    // ★ 更新维度状态为 RESEARCHING
    await this.prisma.topicDimension.update({
      where: { id: dimension.id },
      data: { status: DimensionStatus.RESEARCHING },
    });

    try {
      // 1. 获取搜索结果
      this.emitProgress(
        topic.id,
        dimension.id,
        {
          stage: "planning",
          sectionsTotal: 0,
          sectionsCompleted: 0,
          message: "正在收集资料...",
        },
        missionId,
      );

      const searchResult = await this.dataSourceRouter.fetchDataForDimension(
        dimension,
        topic,
      );

      this.logger.log(
        `[executeDimensionMission] Found ${searchResult.items.length} sources`,
      );

      // 2. 准备证据数据
      const evidenceData = this.prepareEvidenceData(searchResult.items);
      const evidenceSummary = this.createEvidenceSummary(evidenceData);

      // 3. Leader 规划大纲
      // 发送 Leader 思考事件 - 理解阶段
      // ★ 修复：使用正确的 missionId，而非 dimension.id
      await this.eventEmitter.emitLeaderThinking(topic.id, {
        missionId: missionId || dimension.id,
        phase: "understanding",
        content: `正在理解研究主题「${topic.name}」的需求，分析维度「${dimension.name}」的研究范围...`,
        progress: 10,
      });

      this.emitProgress(
        topic.id,
        dimension.id,
        {
          stage: "planning",
          sectionsTotal: 0,
          sectionsCompleted: 0,
          message: "Leader 正在规划研究大纲...",
        },
        missionId,
      );

      const outline = await this.leaderService.planDimensionOutline(
        { name: topic.name, type: topic.type, description: topic.description },
        {
          name: dimension.name,
          description: dimension.description,
          searchQueries: dimension.searchQueries,
        },
        evidenceSummary,
      );

      this.logger.log(
        `[executeDimensionMission] Outline created with ${outline.sections.length} sections`,
      );

      // 发送 Leader 规划完成事件
      await this.eventEmitter.emitLeaderPlanReady(
        topic.id,
        dimension.id,
        outline.sections.length,
        outline.sections.length, // 每个章节一个 Agent
      );

      // 发送详细的 Leader 思考事件 - 包含理解内容
      const understanding = outline.intentUnderstanding;
      // ★ 修复：使用正确的 missionId
      await this.eventEmitter.emitLeaderThinking(topic.id, {
        missionId: missionId || dimension.id,
        phase: "analyzing",
        content: `核心问题: ${understanding.coreQuestion}\n研究范围: ${understanding.scope.included.join(", ")}\n期望深度: ${understanding.expectedDepth}`,
        progress: 20,
      });

      // 4. Agent 写作各章节
      this.emitProgress(
        topic.id,
        dimension.id,
        {
          stage: "writing",
          sectionsTotal: outline.sections.length,
          sectionsCompleted: 0,
          message: "Agent 正在撰写章节...",
        },
        missionId,
      );

      const sectionResults = await this.writeSectionsWithReview(
        topic.id,
        dimension,
        outline,
        evidenceData,
        missionId,
      );

      // 5. Leader 整合结果
      this.emitProgress(
        topic.id,
        dimension.id,
        {
          stage: "integrating",
          sectionsTotal: outline.sections.length,
          sectionsCompleted: outline.sections.length,
          message: "Leader 正在整合最终报告...",
        },
        missionId,
      );

      const integratedResult =
        await this.leaderService.integrateDimensionResults(
          { name: dimension.name, description: dimension.description },
          sectionResults.map((r) => ({ title: r.title, content: r.content })),
        );

      // 6. 保存证据到数据库并替换临时ID
      let savedEvidenceIds: string[] = [];
      let finalIntegratedResult = integratedResult;
      if (reportId) {
        const { savedIds, indexMapping } = await this.saveEvidence(
          evidenceData,
          reportId,
        );
        savedEvidenceIds = savedIds;

        // ★ 替换报告内容中的临时证据ID为数字引用 [n]
        if (indexMapping.size > 0) {
          finalIntegratedResult = {
            ...integratedResult,
            content: this.replaceEvidenceIds(
              integratedResult.content,
              indexMapping,
            ),
          };
        }
      }

      // 7. 转换为标准结果格式
      const analysisResult = this.convertToAnalysisResult(
        dimension.id,
        finalIntegratedResult,
        savedEvidenceIds,
      );

      // 8. ★ 更新维度状态为 COMPLETED
      await this.prisma.topicDimension.update({
        where: { id: dimension.id },
        data: {
          status: DimensionStatus.COMPLETED,
          lastResearchedAt: new Date(),
        },
      });
      this.logger.log(
        `[executeDimensionMission] Updated dimension status to COMPLETED: ${dimension.name}`,
      );

      // 9. 完成
      this.emitProgress(
        topic.id,
        dimension.id,
        {
          stage: "completed",
          sectionsTotal: outline.sections.length,
          sectionsCompleted: outline.sections.length,
          message: "维度研究完成",
        },
        missionId,
      );

      this.logger.log(
        `[executeDimensionMission] Mission completed for dimension: ${dimension.name}`,
      );

      return {
        success: true,
        dimensionId: dimension.id,
        analysisResult,
        evidenceIds: savedEvidenceIds,
        outline,
        sectionResults,
        integratedResult: finalIntegratedResult,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `[executeDimensionMission] Mission failed for dimension: ${dimension.name}`,
        error instanceof Error ? error.stack : error,
      );

      // ★ 更新维度状态为 FAILED
      await this.prisma.topicDimension.update({
        where: { id: dimension.id },
        data: { status: DimensionStatus.FAILED },
      });

      this.emitProgress(
        topic.id,
        dimension.id,
        {
          stage: "failed",
          sectionsTotal: 0,
          sectionsCompleted: 0,
          message: `研究失败: ${errorMessage}`,
        },
        missionId,
      );

      return {
        success: false,
        dimensionId: dimension.id,
        evidenceIds: [],
        error: errorMessage,
      };
    }
  }

  /**
   * 写作所有章节并进行审核
   *
   * 支持：
   * - 按依赖关系分组执行
   * - 同组内并行写作
   * - 每个章节审核 + 修订循环
   */
  private async writeSectionsWithReview(
    topicId: string,
    dimension: TopicDimension,
    outline: DimensionOutline,
    evidenceData: EvidenceData[],
    missionId?: string,
  ): Promise<SectionWriteResult[]> {
    const sectionResults: SectionWriteResult[] = [];
    const sectionMap = new Map<string, SectionWriteResult>();

    // 按并行组执行
    for (const group of outline.executionPlan.parallelGroups) {
      this.logger.log(
        `[writeSectionsWithReview] Processing group: ${group.join(", ")}`,
      );

      // 获取当前组的章节
      const groupSections = outline.sections.filter((s) =>
        group.includes(s.id),
      );

      // 并行写作
      const writeInputs = groupSections.map((section) => ({
        section,
        evidenceData,
        previousSections: this.getPreviousSections(
          section,
          sectionMap,
          outline,
        ),
      }));

      const groupResults =
        await this.sectionWriter.writeSectionsParallel(writeInputs);

      // 逐个审核和修订
      for (let i = 0; i < groupResults.length; i++) {
        const section = groupSections[i];
        let result = groupResults[i];

        // 审核循环
        let revisionCount = 0;
        while (revisionCount < 3) {
          const review = await this.leaderService.reviewSectionOutput(
            section,
            result.content,
            revisionCount,
          );

          if (review.approved) {
            this.logger.log(
              `[writeSectionsWithReview] Section ${section.title} approved (score: ${review.score})`,
            );
            break;
          }

          // 需要修订
          this.logger.log(
            `[writeSectionsWithReview] Section ${section.title} needs revision (score: ${review.score})`,
          );

          result = await this.sectionWriter.reviseSection({
            section,
            originalContent: result.content,
            reviewFeedback: review.feedback,
            revisionInstructions: review.revisionInstructions || "",
            evidenceData,
          });

          revisionCount++;
        }

        // 保存结果
        sectionMap.set(section.id, result);
        sectionResults.push(result);

        // 发送进度
        this.emitProgress(
          topicId,
          dimension.id,
          {
            stage: "reviewing",
            sectionsTotal: outline.sections.length,
            sectionsCompleted: sectionResults.length,
            currentSection: section.title,
            message: `已完成章节: ${section.title}`,
          },
          missionId,
        );
      }
    }

    return sectionResults;
  }

  /**
   * 获取前置章节（用于保持连贯性）
   */
  private getPreviousSections(
    section: SectionPlan,
    sectionMap: Map<string, SectionWriteResult>,
    _outline: DimensionOutline,
  ): Array<{ title: string; content: string }> {
    if (!section.dependsOn || section.dependsOn.length === 0) {
      return [];
    }

    const previousSections: Array<{ title: string; content: string }> = [];
    for (const depId of section.dependsOn) {
      const depResult = sectionMap.get(depId);
      if (depResult) {
        previousSections.push({
          title: depResult.title,
          content: depResult.content,
        });
      }
    }

    return previousSections;
  }

  /**
   * 准备证据数据
   */
  private prepareEvidenceData(searchItems: DataSourceResult[]): EvidenceData[] {
    return searchItems.map((item, index) => ({
      id: `temp-${index}-${Date.now()}`,
      title: item.title,
      url: item.url,
      domain: item.domain || null,
      snippet: item.snippet || null,
      sourceType: item.sourceType,
      publishedAt: item.publishedAt || null,
      credibilityScore: null,
    }));
  }

  /**
   * 创建证据摘要（用于 Leader 规划大纲）
   */
  private createEvidenceSummary(evidenceData: EvidenceData[]): string {
    const summary = evidenceData
      .slice(0, 10) // 只取前10条，避免过长
      .map(
        (e, i) =>
          `${i + 1}. [${e.sourceType || "web"}] ${e.title} (${e.domain || "未知来源"})`,
      )
      .join("\n");

    return `共收集到 ${evidenceData.length} 条证据，摘要如下：\n${summary}\n${evidenceData.length > 10 ? `...还有 ${evidenceData.length - 10} 条` : ""}`;
  }

  /**
   * 保存证据到数据库
   * ★ 返回 promptIndex -> actualCitationIndex 映射
   * promptIndex 是 LLM 在 prompt 中看到的序号 (1, 2, 3...)
   * actualCitationIndex 是证据在数据库中的实际引用编号
   */
  private async saveEvidence(
    evidenceData: EvidenceData[],
    reportId: string,
  ): Promise<{
    savedIds: string[];
    idMapping: Map<string, string>;
    indexMapping: Map<number, number>; // ★ 改为 promptIndex -> actualCitationIndex
  }> {
    if (evidenceData.length === 0) {
      return { savedIds: [], idMapping: new Map(), indexMapping: new Map() };
    }

    // ★ 获取当前报告的最大 citationIndex，以便从正确位置开始编号
    const maxIndexResult = await this.prisma.topicEvidence.aggregate({
      where: { reportId },
      _max: { citationIndex: true },
    });
    const startIndex = (maxIndexResult._max.citationIndex || 0) + 1;

    // 评估可信度
    const evidenceWithCredibility = evidenceData.map((e, index) => ({
      ...e,
      credibilityScore: this.assessCredibility(e),
      citationIndex: startIndex + index, // ★ 设置引用编号
    }));

    // 批量创建
    const created = await this.prisma.$transaction(
      evidenceWithCredibility.map((evidence) =>
        this.prisma.topicEvidence.create({
          data: {
            title: evidence.title,
            url: evidence.url,
            domain: evidence.domain,
            snippet: evidence.snippet,
            sourceType: evidence.sourceType,
            publishedAt: evidence.publishedAt,
            credibilityScore: evidence.credibilityScore,
            citationIndex: evidence.citationIndex, // ★ 保存引用编号
            reportId,
          },
          select: { id: true, citationIndex: true },
        }),
      ),
    );

    // 构建 tempId -> actualId 映射
    const idMapping = new Map<string, string>();
    // ★ 构建 promptIndex -> actualCitationIndex 映射
    // promptIndex 是 LLM 看到的 [1], [2], [3]...
    // actualCitationIndex 是数据库中的实际编号
    const indexMapping = new Map<number, number>();
    evidenceData.forEach((e, index) => {
      idMapping.set(e.id, created[index].id);
      // promptIndex = index + 1 (从1开始)
      // actualCitationIndex = created[index].citationIndex
      indexMapping.set(index + 1, created[index].citationIndex!);
    });

    return { savedIds: created.map((e) => e.id), idMapping, indexMapping };
  }

  /**
   * 替换内容中的 prompt 引用为实际的 citationIndex
   * ★ LLM 输出 [1], [2], [3]... 需要替换为实际的数据库 citationIndex
   * 例如：如果第一个维度有10条证据，第二个维度的 [1] 需要变成 [11]
   */
  private replaceEvidenceIds(
    content: string,
    indexMapping: Map<number, number>,
  ): string {
    let result = content;
    // 从大到小替换，避免 [1] 被替换后影响 [10], [11] 等
    const sortedEntries = Array.from(indexMapping.entries()).sort(
      (a, b) => b[0] - a[0],
    );
    for (const [promptIndex, actualCitationIndex] of sortedEntries) {
      // 只有当 promptIndex 和 actualCitationIndex 不同时才需要替换
      if (promptIndex !== actualCitationIndex) {
        const pattern = new RegExp(`\\[${promptIndex}\\]`, "g");
        result = result.replace(pattern, `[${actualCitationIndex}]`);
      }
    }
    return result;
  }

  /**
   * 评估证据可信度
   */
  private assessCredibility(evidence: EvidenceData): number {
    let score = 50;

    // 域名权威性
    if (evidence.domain) {
      const highAuthority = [
        "gov",
        "edu",
        "nature.com",
        "science.org",
        "arxiv.org",
      ];
      const mediumAuthority = ["reuters.com", "bloomberg.com", "wsj.com"];
      if (highAuthority.some((auth) => evidence.domain!.includes(auth))) {
        score += 30;
      } else if (
        mediumAuthority.some((auth) => evidence.domain!.includes(auth))
      ) {
        score += 20;
      }
    }

    // 来源类型
    if (evidence.sourceType === "academic") score += 20;
    else if (evidence.sourceType === "news") score += 10;

    return Math.min(100, score);
  }

  /**
   * 转换为标准分析结果格式
   */
  private convertToAnalysisResult(
    dimensionId: string,
    integratedResult: IntegratedDimensionResult,
    evidenceIds: string[],
  ): DimensionAnalysisResult {
    return {
      dimensionId,
      summary: integratedResult.metadata.summary,
      keyFindings: integratedResult.metadata.keyFindings.map((finding) => ({
        finding,
        significance: "medium" as const,
        implication: "",
        evidenceIds: [],
      })),
      trends: [],
      challenges: [],
      opportunities: [],
      evidenceUsed: evidenceIds.length,
      confidenceLevel: integratedResult.metadata.confidenceLevel,
      detailedContent: integratedResult.content,
    };
  }

  /**
   * 发送进度事件
   */
  private emitProgress(
    topicId: string,
    _dimensionId: string,
    progress: MissionProgress,
    missionId?: string,
  ): void {
    // 使用维度研究进度事件
    this.eventEmitter.emitDimensionResearchProgress(
      topicId,
      progress.currentSection || "维度研究",
      Math.round(
        (progress.sectionsCompleted / Math.max(progress.sectionsTotal, 1)) *
          100,
      ),
      progress.message,
      missionId,
    );
  }
}
