import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../../../common/guards/admin.guard";
import { OntologyService } from "@/modules/ai-engine/facade";
import type { OntologyAuditContext } from "@/modules/ai-engine/facade";
import { SetConfidenceDto } from "./dto/set-confidence.dto";
import { EditPropertyDto } from "./dto/edit-property.dto";
import { MergeObjectsDto } from "./dto/merge-objects.dto";
import { RenameObjectDto } from "./dto/rename-object.dto";
import { DedupeDto } from "./dto/dedupe.dto";
import { ListEditsQueryDto } from "./dto/list-edits-query.dto";
import { SetAutoIngestDto } from "./dto/set-auto-ingest.dto";
import { BackfillOntologyDto } from "./dto/backfill.dto";
import { ReportOntologyFillService } from "./report-ontology-fill.service";

/**
 * Ontology Write Controller — Knowledge Ontology W-B write API.
 *
 * All endpoints are behind JwtAuthGuard. The authenticated user's ID is injected
 * as actorId (actorType = "human") so the frontend never passes actor information.
 *
 * Architecture: ai-app layer, accesses OntologyService via ai-engine/facade.
 */
@ApiTags("Ontology")
@Controller("ontology")
@UseGuards(JwtAuthGuard)
export class OntologyWriteController {
  private readonly logger = new Logger(OntologyWriteController.name);

  constructor(
    private readonly ontologyService: OntologyService,
    private readonly reportOntologyFillService: ReportOntologyFillService,
  ) {}

  /**
   * Update the confidence score on an OntologyObject.
   * POST /ontology/objects/:id/confidence
   *
   * Body: { value: number (0–1), reason?: string }
   */
  @Post("objects/:id/confidence")
  @ApiOperation({ summary: "更新本体节点置信度" })
  async setObjectConfidence(
    @Param("id") id: string,
    @Body() dto: SetConfidenceDto,
    @Request() req: { user: { id: string } },
  ) {
    const audit: OntologyAuditContext = {
      actorType: "human",
      actorId: req.user.id,
      reason: dto.reason,
    };

    this.logger.debug(
      `[setObjectConfidence] objectId=${id} value=${dto.value} actor=${req.user.id}`,
    );

    await this.ontologyService.setConfidence(
      { objectId: id, value: dto.value },
      audit,
    );

    return { success: true, objectId: id, confidence: dto.value };
  }

  /**
   * Update a single property key on an OntologyObject.
   * POST /ontology/objects/:id/property
   *
   * Body: { key: string, value: unknown, reason?: string }
   */
  @Post("objects/:id/property")
  @ApiOperation({ summary: "更新本体节点属性" })
  async editObjectProperty(
    @Param("id") id: string,
    @Body() dto: EditPropertyDto,
    @Request() req: { user: { id: string } },
  ) {
    if (!dto.key) {
      throw new BadRequestException("key is required");
    }

    const audit: OntologyAuditContext = {
      actorType: "human",
      actorId: req.user.id,
      reason: dto.reason,
    };

    this.logger.debug(
      `[editObjectProperty] objectId=${id} key="${dto.key}" actor=${req.user.id}`,
    );

    return this.ontologyService.editProperty(
      { objectId: id, key: dto.key, value: dto.value },
      audit,
    );
  }

  /**
   * Rename an OntologyObject's canonical label (old label kept as alias).
   * POST /ontology/objects/:id/rename
   *
   * Body: { label: string, reason?: string }
   * 409 when a same-type sibling already carries the new label (use merge).
   */
  @Post("objects/:id/rename")
  @ApiOperation({ summary: "重命名本体节点（旧名转入别名）" })
  async renameObject(
    @Param("id") id: string,
    @Body() dto: RenameObjectDto,
    @Request() req: { user: { id: string } },
  ) {
    const audit: OntologyAuditContext = {
      actorType: "human",
      actorId: req.user.id,
      reason: dto.reason,
    };
    this.logger.debug(
      `[renameObject] objectId=${id} label="${dto.label}" actor=${req.user.id}`,
    );
    return this.ontologyService.renameObject(id, dto.label, audit);
  }

  /**
   * Soft-delete an OntologyObject (logical delete + detach links, reversible).
   * POST /ontology/objects/:id/delete
   *
   * Body: { reason?: string }. Available to any authenticated user.
   */
  @Post("objects/:id/delete")
  @ApiOperation({ summary: "删除本体节点（软删除，断开其关系边）" })
  async deleteObject(
    @Param("id") id: string,
    @Body() body: { reason?: string },
    @Request() req: { user: { id: string } },
  ) {
    const audit: OntologyAuditContext = {
      actorType: "human",
      actorId: req.user.id,
      reason: body?.reason,
    };
    this.logger.debug(`[deleteObject] objectId=${id} actor=${req.user.id}`);
    await this.ontologyService.softDeleteObject(id, audit);
    return { success: true, objectId: id };
  }

  /**
   * Collapse one duplicate group into a single surviving node.
   * POST /ontology/dedupe  (admin — destructive merge)
   *
   * Body: { objectIds: string[], targetId?: string, reason?: string }
   */
  @Post("dedupe")
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "合并一组重复实体（破坏性，需要管理员权限）" })
  async dedupe(
    @Body() dto: DedupeDto,
    @Request() req: { user: { id: string } },
  ) {
    const audit: OntologyAuditContext = {
      actorType: "human",
      actorId: req.user.id,
      reason: dto.reason ?? "dedupe duplicates",
    };
    this.logger.debug(
      `[dedupe] objectIds=${dto.objectIds.join(",")} target=${dto.targetId ?? "auto"} actor=${req.user.id}`,
    );
    return this.ontologyService.dedupeMergeGroup(
      dto.objectIds,
      audit,
      dto.targetId,
    );
  }

  /**
   * Merge multiple source OntologyObjects into a target.
   * POST /ontology/merge
   *
   * Body: { sourceIds: string[], targetId: string, reason?: string }
   *
   * This is a destructive operation. The caller must hold the ADMIN role
   * at the application level. (Guard enforcement is handled by OntologyModule
   * wiring; see mergeObjects requiredEntitlements at the tool layer.)
   */
  @Post("merge")
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "合并本体节点（破坏性操作，需要管理员权限）" })
  async mergeObjects(
    @Body() dto: MergeObjectsDto,
    @Request() req: { user: { id: string } },
  ) {
    const audit: OntologyAuditContext = {
      actorType: "human",
      actorId: req.user.id,
      reason: dto.reason,
    };

    this.logger.debug(
      `[mergeObjects] targetId=${dto.targetId} sourceIds=${dto.sourceIds.join(",")} actor=${req.user.id}`,
    );

    return this.ontologyService.mergeObjects(
      { sourceIds: dto.sourceIds, targetId: dto.targetId },
      audit,
    );
  }

  /**
   * List OntologyEdit audit rows.
   * GET /ontology/edits?objectId=...&topicId=...&limit=...
   */
  @Get("edits")
  @ApiOperation({ summary: "查询本体编辑审计记录" })
  async listEdits(@Query() query: ListEditsQueryDto) {
    this.logger.debug(
      `[listEdits] objectId=${query.objectId ?? "-"} topicId=${query.topicId ?? "-"} limit=${query.limit ?? 50}`,
    );

    const items = await this.ontologyService.listEdits({
      objectId: query.objectId,
      topicId: query.topicId,
      limit: query.limit,
    });

    return { items };
  }

  // ─── W-E: Topic Auto-Ingest Switch ─────────────────────────────────────────

  /**
   * Get the auto-ingest switch for a topic.
   * GET /ontology/topics/:topicId/auto-ingest
   *
   * Returns { enabled: boolean }. Returns false when no setting row exists.
   */
  @Get("topics/:topicId/auto-ingest")
  @ApiOperation({ summary: "获取议题本体自动摄入开关状态" })
  async getAutoIngest(@Param("topicId") topicId: string) {
    const setting = await this.ontologyService.getTopicSetting(topicId);
    return { enabled: setting.autoIngest };
  }

  /**
   * Set the auto-ingest switch for a topic.
   * POST /ontology/topics/:topicId/auto-ingest
   *
   * Body: { enabled: boolean }
   * Actor is taken from req.user (JwtAuthGuard).
   */
  @Post("topics/:topicId/auto-ingest")
  @ApiOperation({ summary: "设置议题本体自动摄入开关" })
  async setAutoIngest(
    @Param("topicId") topicId: string,
    @Body() dto: SetAutoIngestDto,
    @Request() req: { user: { id: string } },
  ) {
    this.logger.debug(
      `[setAutoIngest] topicId=${topicId} enabled=${dto.enabled} actor=${req.user.id}`,
    );

    const setting = await this.ontologyService.setAutoIngest({
      topicId,
      enabled: dto.enabled,
      updatedBy: req.user.id,
    });

    return { enabled: setting.autoIngest };
  }

  // ─── W-E: Manual Backfill ──────────────────────────────────────────────────

  /**
   * Start a fire-and-forget batch backfill job.
   * POST /ontology/backfill
   *
   * Body: { topicId?, sourceId?, sourceKind? }
   * Returns { taskId, queued } immediately; poll /backfill/status/:taskId for progress.
   * Note: backfill is independent of the auto-ingest switch (explicit user action).
   */
  @Post("backfill")
  @ApiOperation({ summary: "手工触发既有报告本体回填（fire-and-forget）" })
  startBackfill(
    @Body() dto: BackfillOntologyDto,
    @Request() req: { user: { id: string } },
  ) {
    this.logger.log(
      `[startBackfill] userId=${req.user.id} topicId=${dto.topicId ?? "*"} sourceId=${dto.sourceId ?? "*"} sourceKind=${dto.sourceKind ?? "all"}`,
    );

    const result = this.reportOntologyFillService.startBatchFill({
      userId: req.user.id,
      topicId: dto.topicId,
      sourceId: dto.sourceId,
      sourceKind: dto.sourceKind,
    });

    return result;
  }

  /**
   * Poll the status of a running or completed backfill task.
   * GET /ontology/backfill/status/:taskId
   *
   * Returns { status, processed, total, errors } or 404 when taskId is unknown.
   */
  @Get("backfill/status/:taskId")
  @ApiOperation({ summary: "查询本体回填任务状态" })
  getBackfillStatus(@Param("taskId") taskId: string) {
    const state = this.reportOntologyFillService.getTaskStatus(taskId);
    if (!state) {
      throw new NotFoundException(`Backfill task not found: ${taskId}`);
    }
    return state;
  }
}
