/**
 * MissionGraphService — build and retrieve knowledge-graph artifacts for a
 * playground mission.
 *
 * 自 2026-06-08 起，「报告正文 → 图谱」核心 pipeline（LLM 抽取/去重/分析/摘要 +
 * 单节点画像）上抽到平台共享层 `marketplace/graph` 的 MissionGraphBuilderService，
 * 本服务只保留 playground 私有职责：加载报告正文 + ownership 校验 + 持久化到
 * playgroundMissionGraph 表。行为对前端零变化。
 *
 * Flow:
 *   1. Load mission report text via MissionQueryService（playground 私有）
 *   2-6. builder.build(userId, reportText) → {graph, analyses}（平台共享）
 *   7. Upsert to playgroundMissionGraph; return artifact
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { MissionGraphBuilderService } from "@/modules/ai-app/marketplace/graph";
import { MissionQueryService } from "../query/mission-query.service";
import {
  type MissionGraph,
  type Analyses,
  type MissionGraphArtifact,
  type NodeEnrichment,
} from "./mission-graph.types";
import type { ReportArtifactV2 } from "../../api/contracts/artifact.contract";

/** playground 报告加载共享的遥测前缀（保持历史 operationName 不漂移）。 */
const OPERATION_PREFIX = "playground.mission-graph";

// ─── helpers（playground artifact 形状解析，私有）─────────────────────────────

function isEmptySentinel(a: unknown): boolean {
  return (
    typeof a === "object" &&
    a !== null &&
    "kind" in (a as Record<string, unknown>) &&
    (a as Record<string, unknown>).kind === "empty-artifact"
  );
}

/** Collect plain text from composedArtifact or fallback reportFull V1 shape. */
function extractReportText(
  composedArtifact: unknown,
  rowReportFull: unknown,
): string {
  const parts: string[] = [];

  if (!isEmptySentinel(composedArtifact) && composedArtifact != null) {
    const artifact = composedArtifact as ReportArtifactV2;
    // Full markdown is the richest source
    if (artifact.content?.fullMarkdown) {
      return artifact.content.fullMarkdown;
    }
    // Fallback: section titles
    for (const section of artifact.sections ?? []) {
      const s = section as unknown as Record<string, unknown>;
      if (typeof s["title"] === "string") parts.push(s["title"]);
    }
    if (artifact.quickView?.executiveSummary?.markdown) {
      parts.push(artifact.quickView.executiveSummary.markdown);
    }
    for (const triple of artifact.factTable ?? []) {
      const t = triple as unknown as Record<string, unknown>;
      const pieces = [t["subject"], t["predicate"], t["object"]].filter(
        Boolean,
      );
      parts.push(pieces.join(" "));
    }
  }

  // V1 fallback
  if (parts.length === 0 && rowReportFull != null) {
    const r = rowReportFull as Record<string, unknown>;
    if (r["summary"]) parts.push(String(r["summary"]));
    for (const s of (r["sections"] as
      | Array<Record<string, unknown>>
      | undefined) ?? []) {
      if (s["body"]) parts.push(String(s["body"]));
      if (s["heading"]) parts.push(String(s["heading"]));
    }
    if (r["conclusion"]) parts.push(String(r["conclusion"]));
  }

  return parts.join("\n").trim();
}

// ─── service ──────────────────────────────────────────────────────────────────

@Injectable()
export class MissionGraphService {
  private readonly logger = new Logger(MissionGraphService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly missionQuery: MissionQueryService,
    private readonly builder: MissionGraphBuilderService,
  ) {}

  // ---------------------------------------------------------------------------
  // enrichNode —— 点击节点时按需用 web-search + LLM 综合实体画像（委托共享 builder）
  // ---------------------------------------------------------------------------

  async enrichNode(
    userId: string,
    missionId: string,
    nodeId: string,
  ): Promise<NodeEnrichment> {
    const artifact = await this.getArtifact(userId, missionId); // 内含 ownership 校验
    const node = (artifact.graph?.nodes ?? []).find((n) => n.id === nodeId);
    if (!node) {
      throw new NotFoundException(`graph node ${nodeId} not found`);
    }
    return this.builder.enrichNode(userId, node, {
      operationPrefix: OPERATION_PREFIX,
    });
  }

  // ---------------------------------------------------------------------------
  // getArtifact
  // ---------------------------------------------------------------------------

  async getArtifact(
    userId: string,
    missionId: string,
  ): Promise<MissionGraphArtifact> {
    // Ownership check: will throw ForbiddenException if not authorized
    await this.missionQuery.loadInputs(missionId, userId);

    const row = await this.prisma.playgroundMissionGraph.findUnique({
      where: { missionId },
    });

    if (!row) {
      return { status: "NONE", graph: null, analyses: null, generatedAt: null };
    }

    return {
      status: row.status as MissionGraphArtifact["status"],
      graph: row.graph as unknown as MissionGraph,
      analyses: row.analyses as unknown as Analyses,
      generatedAt: row.generatedAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // build
  // ---------------------------------------------------------------------------

  async build(
    userId: string,
    missionId: string,
  ): Promise<MissionGraphArtifact> {
    try {
      return await this._build(userId, missionId);
    } catch (err: unknown) {
      this.logger.warn(
        `[graph:build] unexpected error mission=${missionId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return this._persistFailed(missionId, userId);
    }
  }

  private async _build(
    userId: string,
    missionId: string,
  ): Promise<MissionGraphArtifact> {
    // Step 1: load report text（playground 私有）
    const inputs = await this.missionQuery.loadInputs(missionId, userId);
    const reportText = extractReportText(
      inputs.composedArtifact,
      inputs.row?.reportFull ?? null,
    );

    if (!reportText) {
      this.logger.warn(
        `[graph:build] empty report text for mission=${missionId}`,
      );
      return this._persistFailed(missionId, userId);
    }

    // Step 2-6: 平台共享构建器
    const built = await this.builder.build(userId, reportText, {
      operationPrefix: OPERATION_PREFIX,
    });
    if (!built) {
      return this._persistFailed(missionId, userId);
    }

    // Step 7: Upsert
    const now = new Date();
    await this.prisma.playgroundMissionGraph.upsert({
      where: { missionId },
      create: {
        missionId,
        ownerId: userId,
        status: "READY",
        graph: built.graph as unknown as Prisma.InputJsonValue,
        analyses: built.analyses as unknown as Prisma.InputJsonValue,
        generatedAt: now,
      },
      update: {
        ownerId: userId,
        status: "READY",
        graph: built.graph as unknown as Prisma.InputJsonValue,
        analyses: built.analyses as unknown as Prisma.InputJsonValue,
        generatedAt: now,
      },
    });

    return {
      status: "READY",
      graph: built.graph,
      analyses: built.analyses,
      generatedAt: now.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // persist FAILED
  // ---------------------------------------------------------------------------

  private async _persistFailed(
    missionId: string,
    userId: string,
  ): Promise<MissionGraphArtifact> {
    const emptyGraph: MissionGraph = {
      nodes: [],
      edges: [],
      stats: { totalNodes: 0, totalEdges: 0 },
    };
    const emptyAnalyses: Analyses = {
      keyNodes: { items: [], summary: "" },
      relatedness: { pairs: [], summary: "" },
      competitive: { clusters: [], summary: "" },
      community: { communities: [], summary: "" },
      supplyChain: { layers: [], summary: "" },
    };

    try {
      await this.prisma.playgroundMissionGraph.upsert({
        where: { missionId },
        create: {
          missionId,
          ownerId: userId,
          status: "FAILED",
          graph: emptyGraph as unknown as Prisma.InputJsonValue,
          analyses: emptyAnalyses as unknown as Prisma.InputJsonValue,
          generatedAt: new Date(),
        },
        update: {
          status: "FAILED",
          graph: emptyGraph as unknown as Prisma.InputJsonValue,
          analyses: emptyAnalyses as unknown as Prisma.InputJsonValue,
          generatedAt: new Date(),
        },
      });
    } catch (persistErr: unknown) {
      this.logger.warn(
        `[graph:persistFailed] upsert failed for mission=${missionId}: ${
          persistErr instanceof Error ? persistErr.message : String(persistErr)
        }`,
      );
    }

    return { status: "FAILED", graph: null, analyses: null, generatedAt: null };
  }
}
