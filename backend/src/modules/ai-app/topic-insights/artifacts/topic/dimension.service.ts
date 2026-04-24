import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
  Inject,
} from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  AddDimensionDto,
  UpdateDimensionDto,
  RefreshDimensionDto,
  ReorderDimensionsDto,
  GetTemplatesDto,
  CreateFromTemplateDto,
} from "@/modules/ai-app/topic-insights/api/dto";
import {
  DimensionStatus,
  ResearchMissionStatus,
  ResearchTopicStatus,
} from "@prisma/client";
import { MissionExecutionService } from "../../mission/control/execution.service";
import { toPrismaJson } from "@/common/utils/prisma-json.utils";
import { DimensionTemplatesRepository } from "./templates";

/**
 * TopicDimensionService
 *
 * 负责专题维度的管理：添加、更新、删除、重排、刷新、模板。
 * F1 restoration: /topics/templates、/topics/from-template、/dimensions/:id/refresh
 * 均走 DimensionTemplatesRepository + H3 single-dimension scope，不再返空或 501。
 */
@Injectable()
export class TopicDimensionService {
  private readonly logger = new Logger(TopicDimensionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly templateRepo: DimensionTemplatesRepository,
    @Inject(forwardRef(() => MissionExecutionService))
    private readonly missionExecution: MissionExecutionService,
  ) {}

  // ── Dimension CRUD ─────────────────────────────────────────────────────────

  async listDimensions(userId: string, topicId: string) {
    await this.verifyTopicReadAccess(userId, topicId);

    const dimensions = await this.prisma.topicDimension.findMany({
      where: { topicId },
      orderBy: { sortOrder: "asc" },
      include: {
        analyses: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    return dimensions.map((dim) => {
      const latestAnalysis = dim.analyses?.[0];
      return {
        ...dim,
        analyses: undefined,
        dataPoints: latestAnalysis
          ? {
              summary: latestAnalysis.summary,
              keyFindings: latestAnalysis.keyFindings,
              dataPoints: latestAnalysis.dataPoints,
              dimensionAnalysis: (
                latestAnalysis.dataPoints as Record<string, unknown>
              )?.dimensionAnalysis,
              detailedContent: (
                latestAnalysis.dataPoints as Record<string, unknown>
              )?.detailedContent,
            }
          : null,
      };
    });
  }

  async addDimension(userId: string, topicId: string, dto: AddDimensionDto) {
    await this.verifyTopicOwnership(userId, topicId);

    let sortOrder = dto.sortOrder;
    if (!sortOrder) {
      const maxDimension = await this.prisma.topicDimension.findFirst({
        where: { topicId },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      sortOrder = (maxDimension?.sortOrder || 0) + 1;
    }

    const dimension = await this.prisma.topicDimension.create({
      data: {
        topicId,
        name: dto.name,
        description: dto.description,
        sortOrder,
        searchQueries: dto.searchQueries || [],
        searchSources: dto.searchSources || [],
        minSources: dto.minSources ?? 5,
        isEnabled: true,
        status: DimensionStatus.PENDING,
      },
    });

    this.logger.log(`Added dimension ${dimension.id} to topic ${topicId}`);
    return dimension;
  }

  async updateDimension(
    userId: string,
    topicId: string,
    dimensionId: string,
    dto: UpdateDimensionDto,
  ) {
    await this.verifyTopicOwnership(userId, topicId);

    const existing = await this.prisma.topicDimension.findFirst({
      where: { id: dimensionId, topicId },
    });

    if (!existing) {
      throw new NotFoundException(
        `Dimension ${dimensionId} not found in topic ${topicId}`,
      );
    }

    const updated = await this.prisma.topicDimension.update({
      where: { id: dimensionId },
      data: {
        name: dto.name,
        description: dto.description,
        isEnabled: dto.isEnabled,
        searchQueries: dto.searchQueries,
        searchSources: dto.searchSources,
        sortOrder: dto.sortOrder,
        minSources: dto.minSources,
      },
    });

    this.logger.log(`Updated dimension ${dimensionId}`);
    return updated;
  }

  async deleteDimension(userId: string, topicId: string, dimensionId: string) {
    await this.verifyTopicOwnership(userId, topicId);

    const existing = await this.prisma.topicDimension.findFirst({
      where: { id: dimensionId, topicId },
    });

    if (!existing) {
      throw new NotFoundException(
        `Dimension ${dimensionId} not found in topic ${topicId}`,
      );
    }

    await this.prisma.topicDimension.delete({ where: { id: dimensionId } });
    this.logger.log(`Deleted dimension ${dimensionId}`);
    return { success: true };
  }

  async reorderDimensions(
    userId: string,
    topicId: string,
    dto: ReorderDimensionsDto,
  ) {
    await this.verifyTopicOwnership(userId, topicId);

    const dimensions = await this.prisma.topicDimension.findMany({
      where: { id: { in: dto.dimensionIds }, topicId },
    });

    if (dimensions.length !== dto.dimensionIds.length) {
      throw new NotFoundException("Some dimensions not found in this topic");
    }

    await this.prisma.$transaction(
      dto.dimensionIds.map((dimensionId, index) =>
        this.prisma.topicDimension.update({
          where: { id: dimensionId },
          data: { sortOrder: index + 1 },
        }),
      ),
    );

    this.logger.log(
      `Reordered ${dto.dimensionIds.length} dimensions in topic ${topicId}`,
    );
    return { success: true };
  }

  // ── H3 single-dimension refresh ────────────────────────────────────────────

  /**
   * Kick off an incremental mission scoped to a single dimension.
   *
   * Uses H3 primitive (PipelineIdentityContext.dimensionScope). The harness
   * pipeline's RESEARCH / WRITE / REVIEW / INTEGRATE / REMEDIATE stages see
   * the scope and skip non-matching dimensions.
   */
  async refreshDimension(
    userId: string,
    topicId: string,
    dimensionId: string,
    _dto: RefreshDimensionDto,
  ) {
    await this.verifyTopicOwnership(userId, topicId);

    const dimension = await this.prisma.topicDimension.findFirst({
      where: { id: dimensionId, topicId },
    });
    if (!dimension) {
      throw new NotFoundException(
        `Dimension ${dimensionId} not found in topic ${topicId}`,
      );
    }

    // Block double-starts: a mission for this topic already active.
    const activeMission = await this.prisma.researchMission.findFirst({
      where: {
        topicId,
        status: {
          in: [
            ResearchMissionStatus.PLANNING,
            ResearchMissionStatus.PLAN_READY,
            ResearchMissionStatus.EXECUTING,
            ResearchMissionStatus.REVIEWING,
          ],
        },
      },
      select: { id: true, status: true },
    });
    if (activeMission) {
      throw new BadRequestException(
        `Topic has an active mission (${activeMission.id} · ${activeMission.status}); ` +
          `refresh blocked until it completes or is cancelled.`,
      );
    }

    const mission = await this.prisma.researchMission.create({
      data: {
        topicId,
        status: ResearchMissionStatus.EXECUTING,
        userPrompt: `Refresh dimension: ${dimension.name}`,
        researchDepth: "standard",
        startedAt: new Date(),
      },
    });

    this.logger.log(
      `[refreshDimension] mission=${mission.id} topic=${topicId} dim=${dimensionId} (${dimension.name})`,
    );

    // Fire-and-forget; client tracks via /missions/:id/progress.
    void this.missionExecution
      .startExecution(mission.id, topicId, {
        dimensionScope: [dimensionId],
      })
      .catch(async (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `[refreshDimension] execution failed mission=${mission.id}: ${msg}`,
        );
        await this.prisma.researchMission
          .update({
            where: { id: mission.id },
            data: {
              status: ResearchMissionStatus.FAILED,
              completedAt: new Date(),
            },
          })
          .catch((updateErr: unknown) => {
            this.logger.error(
              `[refreshDimension] failed to mark mission FAILED: ${updateErr}`,
            );
          });
      });

    return {
      missionId: mission.id,
      dimensionId,
      dimensionName: dimension.name,
      status: ResearchMissionStatus.EXECUTING,
    };
  }

  // ── Templates ──────────────────────────────────────────────────────────────

  /**
   * List templates for a topicType. The response keeps a back-compat `dimensions`
   * array pointing to the default template so existing callers don't break.
   */
  async getTemplates(query: GetTemplatesDto) {
    const templates = this.templateRepo.listByType(query.type);

    return {
      type: query.type,
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        defaultLanguage: t.defaultLanguage,
        defaultIcon: t.defaultIcon,
        defaultColor: t.defaultColor,
        dimensions: t.dimensions.map((d) => ({
          id: d.id,
          name: d.name,
          description: d.description,
          purpose: d.purpose,
          queryTemplates: [...d.queryTemplates],
          dataSources: [...d.dataSources],
          minSources: d.minSources,
          sortOrder: d.sortOrder,
        })),
      })),
      // Back-compat shape for callers predating F1.
      dimensions:
        templates[0]?.dimensions.map((d) => ({
          id: d.id,
          name: d.name,
          description: d.description,
          searchQueries: [...d.queryTemplates],
          searchSources: [...d.dataSources],
          minSources: d.minSources,
          sortOrder: d.sortOrder,
        })) ?? [],
    };
  }

  /**
   * Create a fresh topic + dimensions from a template. Applies
   * `customizations.dimensions.{add,remove}` if supplied.
   */
  async createFromTemplate(userId: string, dto: CreateFromTemplateDto) {
    const template = this.templateRepo.getById(dto.templateId);
    if (!template) {
      throw new NotFoundException(`Template ${dto.templateId} not found`);
    }

    const rendered = [...this.templateRepo.renderTemplate(template, dto.name)];

    // Remove by dimension name (case-sensitive; matches DB UNIQUE semantics).
    const removeNames = new Set(dto.customizations?.dimensions?.remove ?? []);
    let finalDims = rendered.filter((d) => !removeNames.has(d.name));

    // Append user-provided extras with sortOrder continuing from template.
    const extras = dto.customizations?.dimensions?.add ?? [];
    if (extras.length > 0) {
      const baseOrder =
        finalDims.length > 0
          ? Math.max(...finalDims.map((d) => d.sortOrder))
          : 0;
      finalDims = [
        ...finalDims,
        ...extras.map((extra, idx) => ({
          name: extra.name,
          description: extra.description ?? "",
          searchQueries: extra.searchQueries ?? [],
          searchSources: [] as string[],
          minSources: 5,
          sortOrder: baseOrder + idx + 1,
        })),
      ];
    }

    const { topic, dimensionCount } = await this.prisma.$transaction(
      async (tx) => {
        const created = await tx.researchTopic.create({
          data: {
            userId,
            name: dto.name,
            type: template.topicType,
            language: template.defaultLanguage,
            icon: template.defaultIcon,
            color: template.defaultColor,
            description: template.description,
            status: ResearchTopicStatus.DRAFT,
            topicConfig: dto.topicConfig
              ? toPrismaJson(dto.topicConfig)
              : toPrismaJson({}),
          },
        });

        if (finalDims.length > 0) {
          await tx.topicDimension.createMany({
            data: finalDims.map((d) => ({
              topicId: created.id,
              name: d.name,
              description: d.description,
              sortOrder: d.sortOrder,
              searchQueries: [...d.searchQueries],
              searchSources: [...d.searchSources],
              minSources: d.minSources,
              isEnabled: true,
              status: DimensionStatus.PENDING,
            })),
          });
        }

        return { topic: created, dimensionCount: finalDims.length };
      },
    );

    this.logger.log(
      `[createFromTemplate] topic=${topic.id} template=${template.id} dims=${dimensionCount} user=${userId}`,
    );

    return {
      topicId: topic.id,
      templateId: template.id,
      topic,
      dimensionCount,
    };
  }

  // ── Access control ─────────────────────────────────────────────────────────

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

    if (topic.userId === userId) return;

    const hasAccess = await this.checkTopicAccess(
      userId,
      topicId,
      topic.userId,
    );
    if (!hasAccess) {
      throw new ForbiddenException(
        "You do not have permission to access this topic",
      );
    }
  }

  private async checkTopicAccess(
    userId: string,
    topicId: string,
    ownerId: string,
  ): Promise<boolean> {
    if (userId === ownerId) return true;

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

    if (!result.length) return false;
    const { visibility, is_collaborator } = result[0];
    if (visibility === "PUBLIC") return true;
    if (visibility === "SHARED" && is_collaborator) return true;
    return false;
  }
}
