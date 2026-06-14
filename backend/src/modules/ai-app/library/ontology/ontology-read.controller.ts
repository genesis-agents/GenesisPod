import {
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import { OntologyService } from "@/modules/ai-engine/facade";
import type { OntologyListTypesFilter } from "@/modules/ai-engine/facade";
import { ListEntitiesQueryDto } from "./dto/list-entities-query.dto";

/**
 * Ontology Read Controller — Knowledge Ontology v1.1 read API.
 *
 * All endpoints are scoped behind JwtAuthGuard (authenticated users only).
 * The controller is read-only; all writes are handled by the engine layer
 * (OntologyService.upsertObject / addLink) and are not exposed here.
 *
 * Architecture: ai-app layer, accesses OntologyService via ai-engine/facade.
 */
@ApiTags("Ontology")
@Controller("ontology")
@UseGuards(JwtAuthGuard)
export class OntologyReadController {
  private readonly logger = new Logger(OntologyReadController.name);

  constructor(private readonly ontologyService: OntologyService) {}

  /**
   * List ontology entities with optional filtering and pagination.
   * GET /ontology/entities
   *
   * `total` now reflects the true DB count (not just the page size).
   */
  @Get("entities")
  async listEntities(@Query() query: ListEntitiesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const offset = (page - 1) * limit;

    const filter = {
      topicId: query.topicId,
      typeKey: query.typeKey,
      labelContains: query.search,
      limit,
      offset,
    };

    const [items, total] = await Promise.all([
      this.ontologyService.listObjects(filter),
      this.ontologyService.countObjects(filter),
    ]);

    return { items, total };
  }

  /**
   * Get a single ontology entity by ID.
   * GET /ontology/entities/:id
   */
  @Get("entities/:id")
  async getEntity(@Param("id") id: string) {
    const entity = await this.ontologyService.getObject(id);
    if (!entity) {
      throw new NotFoundException(`Ontology entity not found: ${id}`);
    }
    return entity;
  }

  /**
   * Get related entities (BFS subgraph) for a given entity.
   * GET /ontology/entities/:id/related
   * Query: depth (default 2, max 4)
   */
  @Get("entities/:id/related")
  async getRelated(@Param("id") id: string, @Query("depth") rawDepth?: string) {
    const depth = rawDepth !== undefined ? parseInt(rawDepth, 10) : 2;
    const safeDepth = Number.isNaN(depth) ? 2 : Math.min(Math.max(depth, 1), 4);

    this.logger.debug(`[getRelated] id=${id} depth=${safeDepth}`);

    return this.ontologyService.findRelated(id, safeDepth);
  }

  /**
   * Get the full subgraph for a topic.
   * GET /ontology/subgraph?topicId=...&maxNodes=...
   */
  @Get("subgraph")
  async getSubgraph(
    @Query("topicId") topicId?: string,
    @Query("maxNodes") rawMaxNodes?: string,
  ) {
    // topicId 可选：缺省=全局封顶子图（本体浏览器全局浏览出图，不再 400）。
    const maxNodes =
      rawMaxNodes !== undefined ? parseInt(rawMaxNodes, 10) : undefined;
    const safeMaxNodes =
      maxNodes !== undefined && !Number.isNaN(maxNodes) && maxNodes > 0
        ? maxNodes
        : undefined;

    this.logger.debug(
      `[getSubgraph] topicId=${topicId} maxNodes=${safeMaxNodes ?? "default"}`,
    );

    return this.ontologyService.querySubgraphByTopic(topicId, {
      maxNodes: safeMaxNodes,
    });
  }

  /**
   * List declared OntologyObjectType meta-model entries.
   * GET /ontology/types?topicId=...
   *
   * Returns global types (topicId=null) and, when topicId is provided,
   * topic-scoped types as well.
   */
  @Get("types")
  async listObjectTypes(@Query("topicId") topicId?: string) {
    const filter: OntologyListTypesFilter = topicId ? { topicId } : {};
    this.logger.debug(`[listObjectTypes] topicId=${topicId ?? "global"}`);
    return this.ontologyService.listObjectTypes(filter);
  }

  /**
   * List declared OntologyLinkType meta-model entries.
   * GET /ontology/link-types?topicId=...
   *
   * Returns global types (topicId=null) and, when topicId is provided,
   * topic-scoped types as well.
   */
  @Get("link-types")
  async listLinkTypes(@Query("topicId") topicId?: string) {
    const filter: OntologyListTypesFilter = topicId ? { topicId } : {};
    this.logger.debug(`[listLinkTypes] topicId=${topicId ?? "global"}`);
    return this.ontologyService.listLinkTypes(filter);
  }
}
