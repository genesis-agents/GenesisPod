import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
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
import { ListEditsQueryDto } from "./dto/list-edits-query.dto";

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

  constructor(private readonly ontologyService: OntologyService) {}

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
}
