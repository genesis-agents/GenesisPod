/**
 * Industry Chain Service
 *
 * 产业链分析业务编排 + 落库（留 app 层）。
 *   - analyze：创建 chain + 经 ai-harness facade 发起动态编排 mission（运行时/部署态验证）。
 *   - persistExtraction：抽取结果 → 实体消歧去重 → 落库实体 + 关系（M2 映射 + M8 校验）。
 *   - getGraph / getEntity：带 ownerId 越权过滤（M6），输出 {nodes,edges,stats} 供 KnowledgeGraphView。
 *
 * 所有 engine/harness 能力经 facade 复用：
 *   - EntityResolutionService（实体消歧，engine facade）
 *   - MissionPipelineOrchestrator / Registry（动态编排，harness facade）
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "@/common/prisma/prisma.service";
import { EntityResolutionService } from "@/modules/ai-engine/facade";
import {
  MissionPipelineOrchestrator,
  MissionPipelineRegistry,
} from "@/modules/ai-harness/facade";
import {
  ChainExtractionResult,
  ChainExtractionResultSchema,
  buildRelationRows,
  sanitizeSourceRefs,
  ENTITY_TYPES,
} from "./chain-extraction";
import { INDUSTRY_CHAIN_PIPELINE_ID } from "./pipeline/industry-chain.pipeline";

export interface ChainGraphNode {
  id: string;
  label: string;
  type: string; // SEGMENT | COMPANY | PRODUCT
  segment?: string | null;
}
export interface ChainGraphEdge {
  source: string;
  target: string;
  type: string;
  weight?: number | null;
}
export interface ChainGraph {
  nodes: ChainGraphNode[];
  edges: ChainGraphEdge[];
  stats: { totalNodes: number; totalEdges: number; segments: number; companies: number };
}

@Injectable()
export class IndustryChainService {
  private readonly logger = new Logger(IndustryChainService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entityResolution: EntityResolutionService,
    private readonly orchestrator: MissionPipelineOrchestrator,
    private readonly registry: MissionPipelineRegistry,
  ) {}

  /** 创建产业链 + 异步发起动态编排 mission。返回 {chainId, missionId}。 */
  async analyze(userId: string, topic: string): Promise<{ chainId: string; missionId: string }> {
    const missionId = randomUUID();
    const chain = await this.prisma.industryChain.create({
      data: { topic, status: "RUNNING", ownerId: userId, missionId },
    });

    // fire-and-forget：编排在后台跑，前端经事件/轮询看进度（运行时/部署态验证）
    void this.runMission(chain.id, missionId, userId, topic);

    return { chainId: chain.id, missionId };
  }

  /** 后台执行编排 mission（部署态行为：需 LLM + SEC egress）。 */
  private async runMission(
    chainId: string,
    missionId: string,
    userId: string,
    topic: string,
  ): Promise<void> {
    try {
      const result = await this.orchestrator.run<{ topic: string; chainId: string }>({
        pipelineId: INDUSTRY_CHAIN_PIPELINE_ID,
        missionId,
        userId,
        input: { topic, chainId },
      });
      // 编排产出在 persist 步已落库；这里只收尾状态
      await this.prisma.industryChain.update({
        where: { id: chainId },
        data: { status: result?.status === "failed" ? "FAILED" : "COMPLETED" },
      });
    } catch (error) {
      this.logger.error(
        `[runMission] chain=${chainId} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.prisma.industryChain
        .update({ where: { id: chainId }, data: { status: "FAILED" } })
        .catch((e) => this.logger.error(`[runMission] status update failed: ${e}`));
    }
  }

  /**
   * 抽取结果落库：实体消歧去重 → 落库实体 → 映射+校验关系 → 落库关系。
   * 供编排 persist 步调用，也可独立测试。
   */
  async persistExtraction(
    chainId: string,
    raw: unknown,
  ): Promise<{ entities: number; relations: number; dropped: number }> {
    const result: ChainExtractionResult = ChainExtractionResultSchema.parse(raw);

    // ── 1. 环节实体（按 name 直接去重，不做语义消歧）────────────────────────
    const canonicalToId = new Map<string, string>();
    const segmentNames = Array.from(
      new Set(result.segments.map((s) => s.name.trim()).filter(Boolean)),
    );
    for (const seg of result.segments) {
      const name = seg.name.trim();
      if (!name || canonicalToId.has(name)) continue;
      const ent = await this.prisma.industryEntity.create({
        data: {
          chainId,
          name,
          type: "SEGMENT" satisfies (typeof ENTITY_TYPES)[number],
          segment: name,
          description: seg.description ?? null,
        },
      });
      canonicalToId.set(name, ent.id);
    }

    // ── 2. 公司实体（语义消歧去重）──────────────────────────────────────────
    const companyNames = result.companies.map((c) => c.name);
    const resolution = await this.entityResolution.resolve(companyNames);
    // canonical → 合并后的公司元数据
    const byCanonical = new Map<string, (typeof result.companies)[number]>();
    for (const c of result.companies) {
      const canonical = resolution.canonicalOf[c.name] ?? c.name;
      const existing = byCanonical.get(canonical);
      // 合并：保留首个，补全缺失字段
      if (!existing) {
        byCanonical.set(canonical, { ...c, name: canonical });
      } else {
        byCanonical.set(canonical, {
          ...existing,
          cik: existing.cik ?? c.cik,
          segment: existing.segment ?? c.segment,
          description: existing.description ?? c.description,
          sourceRefs: [
            ...(existing.sourceRefs ?? []),
            ...(c.sourceRefs ?? []),
          ],
        });
      }
    }
    for (const [canonical, c] of byCanonical) {
      if (canonicalToId.has(canonical)) continue;
      const ent = await this.prisma.industryEntity.create({
        data: {
          chainId,
          name: canonical,
          type: "COMPANY" satisfies (typeof ENTITY_TYPES)[number],
          cik: c.cik ?? null,
          segment: c.segment ?? null,
          description: c.description ?? null,
          sourceRefs: sanitizeSourceRefs(c.sourceRefs) as object,
        },
      });
      canonicalToId.set(canonical, ent.id);
    }

    // ── 3. 关系映射 + M8 校验 + 落库 ────────────────────────────────────────
    const { rows, dropped } = buildRelationRows(
      result.relations,
      resolution.canonicalOf,
      canonicalToId,
    );
    if (dropped.length) {
      this.logger.warn(`[persistExtraction] chain=${chainId} dropped ${dropped.length} invalid relations`);
    }
    for (const row of rows) {
      await this.prisma.industryRelation.create({
        data: {
          chainId,
          sourceId: row.sourceId,
          targetId: row.targetId,
          relationType: row.relationType,
          weight: row.weight,
          evidence: row.evidence,
          validFrom: new Date(),
        },
      });
    }

    void segmentNames; // 保留以便未来 segment 顺序校验
    return { entities: canonicalToId.size, relations: rows.length, dropped: dropped.length };
  }

  /** 取图（M6 ownerId 越权过滤）。 */
  async getGraph(userId: string, chainId: string): Promise<ChainGraph> {
    const chain = await this.prisma.industryChain.findFirst({
      where: { id: chainId, ownerId: userId },
      include: { entities: true, relations: true },
    });
    if (!chain) {
      throw new NotFoundException("产业链不存在或无访问权限");
    }
    const nodes: ChainGraphNode[] = chain.entities.map((e) => ({
      id: e.id,
      label: e.name,
      type: e.type,
      segment: e.segment,
    }));
    const edges: ChainGraphEdge[] = chain.relations
      .filter((r) => r.validTo === null) // 仅当前有效边
      .map((r) => ({
        source: r.sourceId,
        target: r.targetId,
        type: r.relationType,
        weight: r.weight,
      }));
    return {
      nodes,
      edges,
      stats: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        segments: nodes.filter((n) => n.type === "SEGMENT").length,
        companies: nodes.filter((n) => n.type === "COMPANY").length,
      },
    };
  }

  /** 取单实体详情（M6 ownerId 越权过滤，经 chain 归属）。 */
  async getEntity(userId: string, entityId: string) {
    const entity = await this.prisma.industryEntity.findFirst({
      where: { id: entityId, chain: { ownerId: userId } },
    });
    if (!entity) {
      throw new NotFoundException("实体不存在或无访问权限");
    }
    return entity;
  }

  /** 取产业链元信息（M6 ownerId 越权过滤）。 */
  async getChain(userId: string, chainId: string) {
    const chain = await this.prisma.industryChain.findFirst({
      where: { id: chainId, ownerId: userId },
    });
    if (!chain) {
      throw new NotFoundException("产业链不存在或无访问权限");
    }
    return chain;
  }

  /** 确保产业链 pipeline 已注册（模块 onModuleInit 调用）。 */
  ensurePipelineRegistered(config: Parameters<MissionPipelineRegistry["register"]>[0]): void {
    try {
      this.registry.register(config);
    } catch {
      // 已注册 → 幂等忽略
    }
  }
}
