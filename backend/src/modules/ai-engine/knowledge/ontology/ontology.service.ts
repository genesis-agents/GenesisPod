/**
 * Ontology Service — Knowledge Ontology v1 (P1 Engine Core)
 *
 * Manages the knowledge graph (OntologyObject nodes + OntologyLink edges)
 * with full audit trail via OntologyEdit.
 *
 * Design constraints (CLAUDE.md):
 * - Zero agent/mission state. All write operations accept AuditContext param;
 *   no reading of current-user from request context.
 * - Entity resolution via EntityResolutionService to detect same-entity aliases
 *   before upsert (canonical name identified by longest member per resolve()).
 * - Injected: PrismaService (DB) + EntityResolutionService (alias dedup).
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { EntityResolutionService } from "../entity-resolution/entity-resolution.service";
import type {
  AuditContext,
  UpsertObjectInput,
  AddLinkInput,
  ListObjectsFilter,
  SubgraphOptions,
  OntologyObjectView,
  OntologyLinkView,
  SubgraphResult,
} from "./ontology.types";

@Injectable()
export class OntologyService {
  private readonly logger = new Logger(OntologyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entityResolution: EntityResolutionService,
  ) {}

  // ─── Object Operations ─────────────────────────────────────────────────────

  /**
   * Upsert a knowledge node.
   *
   * Resolution flow:
   *   1. Collect label + aliases as candidate names.
   *   2. Run EntityResolutionService.resolve() to find the canonical name
   *      (longest member in the resolved cluster).
   *   3. Look up existing OntologyObject by (topicId, typeKey, canonical label).
   *   4. Create or update; write one OntologyEdit for audit.
   *
   * Note: EntityResolutionService.resolve() returns canonical *names* (strings),
   * not UUIDs. The Prisma PK uuid is auto-generated on insert. Canonical name is
   * stored as `label`; raw aliases are merged into the `aliases` JSON array.
   */
  async upsertObject(
    input: UpsertObjectInput,
    audit: AuditContext,
  ): Promise<OntologyObjectView> {
    // Step 1: resolve canonical label via entity resolution
    const candidateNames = [input.label, ...(input.aliases ?? [])].filter(
      Boolean,
    );
    const resolvedCanonical = await this.resolveCanonicalLabel(candidateNames);

    const now = new Date();

    // Step 2: find + create/update wrapped in a transaction to prevent duplicate
    // rows under concurrent writes.
    // Note: topicId is always non-null in v1 write paths. NULL-distinct edge
    // (two rows with topicId=NULL) is not a concern for current callers, but
    // the @@unique constraint on (topicId, typeKey, label) covers the common case.
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.ontologyObject.findFirst({
          where: {
            topicId: input.topicId ?? null,
            typeKey: input.typeKey,
            label: resolvedCanonical,
          },
        });

        if (existing) {
          // Update: merge aliases, update properties/confidence if changed
          const existingAliases = this.parseJsonArray(existing.aliases);
          const incomingAliases = input.aliases ?? [];
          const mergedAliases = Array.from(
            new Set(
              [...existingAliases, ...incomingAliases, input.label].filter(
                (a) => a !== resolvedCanonical,
              ),
            ),
          );

          const newProperties =
            input.properties !== undefined
              ? {
                  ...this.parseJsonObject(existing.properties),
                  ...input.properties,
                }
              : this.parseJsonObject(existing.properties);

          const newConfidence = input.confidence ?? existing.confidence;

          const before: Record<string, unknown> = {
            label: existing.label,
            aliases: existingAliases,
            properties: this.parseJsonObject(existing.properties),
            confidence: existing.confidence,
          };

          const updated = await tx.ontologyObject.update({
            where: { id: existing.id },
            data: {
              aliases: mergedAliases as unknown as Prisma.InputJsonValue,
              properties: newProperties as unknown as Prisma.InputJsonValue,
              confidence: newConfidence,
              updatedAt: now,
            },
          });

          await tx.ontologyEdit.create({
            data: {
              objectId: existing.id,
              action: "update",
              actorType: audit.actorType,
              actorId: audit.actorId,
              before: before as unknown as Prisma.InputJsonValue,
              after: {
                label: updated.label,
                aliases: mergedAliases,
                properties: newProperties,
                confidence: newConfidence,
              } as unknown as Prisma.InputJsonValue,
              reason: audit.reason ?? null,
              evidenceId: audit.sourceId ?? null,
            },
          });

          this.logger.debug(
            `[upsertObject] updated id=${existing.id} label="${resolvedCanonical}"`,
          );
          return this.mapObject(updated);
        } else {
          // Create new
          const aliases = (input.aliases ?? []).filter(
            (a) => a !== resolvedCanonical,
          );
          if (input.label !== resolvedCanonical) {
            aliases.push(input.label);
          }
          const uniqueAliases = Array.from(new Set(aliases));

          const created = await tx.ontologyObject.create({
            data: {
              topicId: input.topicId ?? null,
              typeKey: input.typeKey,
              label: resolvedCanonical,
              aliases: uniqueAliases as unknown as Prisma.InputJsonValue,
              properties: (input.properties ??
                {}) as unknown as Prisma.InputJsonValue,
              confidence: input.confidence ?? 1.0,
              createdBy: input.createdBy,
            },
          });

          await tx.ontologyEdit.create({
            data: {
              objectId: created.id,
              action: "create",
              actorType: audit.actorType,
              actorId: audit.actorId,
              before: Prisma.JsonNull,
              after: {
                label: created.label,
                aliases: uniqueAliases,
                properties: input.properties ?? {},
                confidence: created.confidence,
              } as unknown as Prisma.InputJsonValue,
              reason: audit.reason ?? null,
              evidenceId: audit.sourceId ?? null,
            },
          });

          this.logger.debug(
            `[upsertObject] created id=${created.id} label="${resolvedCanonical}"`,
          );
          return this.mapObject(created);
        }
      });
    } catch (e) {
      // P2002 = unique constraint violation: concurrent insert raced ahead of us.
      // Retry as an update using the unique key (topicId, typeKey, label).
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        this.logger.warn(
          `[upsertObject] P2002 race on label="${resolvedCanonical}", retrying as update`,
        );
        const raceWinner = await this.prisma.ontologyObject.findFirst({
          where: {
            topicId: input.topicId ?? null,
            typeKey: input.typeKey,
            label: resolvedCanonical,
          },
        });
        if (!raceWinner) {
          // Should not happen — the P2002 guarantees a row exists; re-throw to be safe
          throw e;
        }
        const mergedAliases = Array.from(
          new Set(
            [
              ...this.parseJsonArray(raceWinner.aliases),
              ...(input.aliases ?? []),
              input.label,
            ].filter((a) => a !== resolvedCanonical),
          ),
        );
        const newProperties =
          input.properties !== undefined
            ? {
                ...this.parseJsonObject(raceWinner.properties),
                ...input.properties,
              }
            : this.parseJsonObject(raceWinner.properties);
        const updated = await this.prisma.ontologyObject.update({
          where: { id: raceWinner.id },
          data: {
            aliases: mergedAliases as unknown as Prisma.InputJsonValue,
            properties: newProperties as unknown as Prisma.InputJsonValue,
            confidence: input.confidence ?? raceWinner.confidence,
            updatedAt: now,
          },
        });
        return this.mapObject(updated);
      }
      throw e;
    }
  }

  /**
   * Fetch a single ontology object by ID.
   * Returns null if not found.
   */
  async getObject(id: string): Promise<OntologyObjectView | null> {
    const obj = await this.prisma.ontologyObject.findUnique({
      where: { id },
    });
    return obj ? this.mapObject(obj) : null;
  }

  /**
   * List ontology objects with optional filtering.
   */
  async listObjects(filter: ListObjectsFilter): Promise<OntologyObjectView[]> {
    const where: Prisma.OntologyObjectWhereInput = {};

    if (filter.topicId !== undefined) where.topicId = filter.topicId;
    if (filter.typeKey !== undefined) where.typeKey = filter.typeKey;
    if (filter.createdBy !== undefined) where.createdBy = filter.createdBy;
    if (filter.labelContains !== undefined) {
      where.label = { contains: filter.labelContains, mode: "insensitive" };
    }

    const rows = await this.prisma.ontologyObject.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filter.limit ?? 50,
      skip: filter.offset ?? 0,
    });

    return rows.map((r) => this.mapObject(r));
  }

  // ─── Link Operations ────────────────────────────────────────────────────────

  /**
   * Add a directed link between two ontology objects.
   * Uses upsert semantics: if the (fromId, toId, linkTypeKey) triple already
   * exists, update properties/confidence; otherwise create.
   * Writes one OntologyEdit for audit in both cases.
   */
  async addLink(
    input: AddLinkInput,
    audit: AuditContext,
  ): Promise<OntologyLinkView> {
    // Validate that both endpoint objects exist before attempting any write.
    // Without this check a missing node would surface as a bare Prisma P2003
    // foreign-key error with no actionable message for the caller.
    const [fromObj, toObj] = await Promise.all([
      this.prisma.ontologyObject.findUnique({
        where: { id: input.fromId },
        select: { id: true },
      }),
      this.prisma.ontologyObject.findUnique({
        where: { id: input.toId },
        select: { id: true },
      }),
    ]);
    if (!fromObj) {
      throw new NotFoundException(
        `OntologyObject not found for fromId="${input.fromId}"`,
      );
    }
    if (!toObj) {
      throw new NotFoundException(
        `OntologyObject not found for toId="${input.toId}"`,
      );
    }

    const existing = await this.prisma.ontologyLink.findUnique({
      where: {
        fromId_toId_linkTypeKey: {
          fromId: input.fromId,
          toId: input.toId,
          linkTypeKey: input.linkTypeKey,
        },
      },
    });

    if (existing) {
      const newProperties =
        input.properties !== undefined
          ? {
              ...this.parseJsonObject(existing.properties),
              ...input.properties,
            }
          : this.parseJsonObject(existing.properties);
      const newConfidence = input.confidence ?? existing.confidence;

      const before: Record<string, unknown> = {
        properties: this.parseJsonObject(existing.properties),
        confidence: existing.confidence,
      };

      const updated = await this.prisma.ontologyLink.update({
        where: { id: existing.id },
        data: {
          properties: newProperties as unknown as Prisma.InputJsonValue,
          confidence: newConfidence,
        },
      });

      await this.prisma.ontologyEdit.create({
        data: {
          linkId: existing.id,
          action: "update",
          actorType: audit.actorType,
          actorId: audit.actorId,
          before: before as unknown as Prisma.InputJsonValue,
          after: {
            properties: newProperties,
            confidence: newConfidence,
          } as unknown as Prisma.InputJsonValue,
          reason: audit.reason ?? null,
          evidenceId: audit.sourceId ?? null,
        },
      });

      return this.mapLink(updated);
    } else {
      const created = await this.prisma.ontologyLink.create({
        data: {
          topicId: input.topicId ?? null,
          linkTypeKey: input.linkTypeKey,
          fromId: input.fromId,
          toId: input.toId,
          properties: (input.properties ??
            {}) as unknown as Prisma.InputJsonValue,
          confidence: input.confidence ?? 1.0,
        },
      });

      await this.prisma.ontologyEdit.create({
        data: {
          linkId: created.id,
          action: "create",
          actorType: audit.actorType,
          actorId: audit.actorId,
          before: Prisma.JsonNull,
          after: {
            fromId: input.fromId,
            toId: input.toId,
            linkTypeKey: input.linkTypeKey,
            properties: input.properties ?? {},
            confidence: created.confidence,
          } as unknown as Prisma.InputJsonValue,
          reason: audit.reason ?? null,
          evidenceId: audit.sourceId ?? null,
        },
      });

      this.logger.debug(
        `[addLink] created id=${created.id} ${input.fromId}->${input.toId} [${input.linkTypeKey}]`,
      );
      return this.mapLink(created);
    }
  }

  // ─── Graph Query ───────────────────────────────────────────────────────────

  /**
   * Return all nodes (and optionally links) scoped to a topicId.
   * Useful for rendering the full knowledge graph for a given research topic.
   */
  async querySubgraphByTopic(
    topicId: string,
    opts: SubgraphOptions = {},
  ): Promise<SubgraphResult> {
    const includeLinks = opts.includeLinks !== false;
    const maxNodes = opts.maxNodes ?? 200;

    const nodeWhere: Prisma.OntologyObjectWhereInput = { topicId };
    if (opts.typeKeys?.length) {
      nodeWhere.typeKey = { in: opts.typeKeys };
    }

    const nodes = await this.prisma.ontologyObject.findMany({
      where: nodeWhere,
      orderBy: { createdAt: "asc" },
      take: maxNodes,
    });

    if (!includeLinks || nodes.length === 0) {
      return { nodes: nodes.map((n) => this.mapObject(n)), links: [] };
    }

    const nodeIds = nodes.map((n) => n.id);
    // Cap edge retrieval to prevent unbounded result sets on dense graphs.
    // maxNodes * 10 is a generous heuristic; real graphs rarely exceed it.
    const LINK_TAKE_CAP = maxNodes * 10;
    const links = await this.prisma.ontologyLink.findMany({
      where: {
        fromId: { in: nodeIds },
        toId: { in: nodeIds },
      },
      take: LINK_TAKE_CAP,
    });

    if (links.length === LINK_TAKE_CAP) {
      this.logger.warn(
        `[querySubgraphByTopic] link result truncated at ${LINK_TAKE_CAP} for topicId="${topicId}". Consider increasing maxNodes or paginating.`,
      );
    }

    return {
      nodes: nodes.map((n) => this.mapObject(n)),
      links: links.map((l) => this.mapLink(l)),
    };
  }

  /**
   * BFS/DFS expansion from a seed object up to `depth` hops.
   * Returns all reachable nodes and the links traversed.
   * Default depth is 2; capped at 4 to avoid explosive graph traversal.
   */
  async findRelated(objectId: string, depth = 2): Promise<SubgraphResult> {
    const cappedDepth = Math.min(depth, 4);
    const visitedIds = new Set<string>([objectId]);
    const allNodes: OntologyObjectView[] = [];
    const allLinks: OntologyLinkView[] = [];

    const frontier = [objectId];

    for (let hop = 0; hop < cappedDepth && frontier.length > 0; hop++) {
      const links = await this.prisma.ontologyLink.findMany({
        where: {
          OR: [{ fromId: { in: frontier } }, { toId: { in: frontier } }],
        },
      });

      const newIds: string[] = [];
      for (const link of links) {
        allLinks.push(this.mapLink(link));
        for (const neighborId of [link.fromId, link.toId]) {
          if (!visitedIds.has(neighborId)) {
            visitedIds.add(neighborId);
            newIds.push(neighborId);
          }
        }
      }

      if (newIds.length > 0) {
        const newNodes = await this.prisma.ontologyObject.findMany({
          where: { id: { in: newIds } },
        });
        allNodes.push(...newNodes.map((n) => this.mapObject(n)));
      }

      frontier.length = 0;
      frontier.push(...newIds);
    }

    // Include seed node itself
    const seedNode = await this.prisma.ontologyObject.findUnique({
      where: { id: objectId },
    });
    if (seedNode) {
      allNodes.unshift(this.mapObject(seedNode));
    }

    // Deduplicate links (BFS may revisit edges from both directions)
    const seenLinkIds = new Set<string>();
    const uniqueLinks = allLinks.filter((l) => {
      if (seenLinkIds.has(l.id)) return false;
      seenLinkIds.add(l.id);
      return true;
    });

    return { nodes: allNodes, links: uniqueLinks };
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Use EntityResolutionService to find the canonical label for a set of
   * candidate names. Returns the canonical name (longest member in the resolved
   * cluster). Falls back to the first name if resolution returns no result.
   *
   * EntityResolutionService.resolve() works on names (strings) and returns
   * EntityResolutionResult.canonicalOf[name] → canonical string. It does NOT
   * produce UUIDs. The OntologyObject uuid PK is managed by Prisma @default(uuid()).
   */
  private async resolveCanonicalLabel(names: string[]): Promise<string> {
    if (names.length === 0) return "";
    if (names.length === 1) return names[0];

    try {
      const result = await this.entityResolution.resolve(names);
      // canonicalOf maps every original name to its cluster's canonical name
      const canonical = result.canonicalOf[names[0]];
      return canonical ?? names[0];
    } catch (err) {
      this.logger.warn(
        `[resolveCanonicalLabel] entity resolution failed, falling back to first name: ${err}`,
      );
      return names[0];
    }
  }

  private parseJsonArray(value: Prisma.JsonValue): string[] {
    if (Array.isArray(value)) return value as string[];
    return [];
  }

  private parseJsonObject(value: Prisma.JsonValue): Record<string, unknown> {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private mapObject(row: {
    id: string;
    topicId: string | null;
    typeKey: string;
    label: string;
    aliases: Prisma.JsonValue;
    properties: Prisma.JsonValue;
    confidence: number;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
  }): OntologyObjectView {
    return {
      id: row.id,
      topicId: row.topicId,
      typeKey: row.typeKey,
      label: row.label,
      aliases: this.parseJsonArray(row.aliases),
      properties: this.parseJsonObject(row.properties),
      confidence: row.confidence,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapLink(row: {
    id: string;
    topicId: string | null;
    linkTypeKey: string;
    fromId: string;
    toId: string;
    properties: Prisma.JsonValue;
    confidence: number;
    createdAt: Date;
  }): OntologyLinkView {
    return {
      id: row.id,
      topicId: row.topicId,
      linkTypeKey: row.linkTypeKey,
      fromId: row.fromId,
      toId: row.toId,
      properties: this.parseJsonObject(row.properties),
      confidence: row.confidence,
      createdAt: row.createdAt,
    };
  }
}
