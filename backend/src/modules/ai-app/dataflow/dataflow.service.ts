/**
 * DataFlowService —— 系统数据流图数据源
 *
 * 三类「真实数据」：
 *   ① 真实拓扑：声明式 nodes/edges（dataflow.topology.ts）+ Registry 校验 live
 *   ② 真实流量：AIUsageLog 按 capabilityId 聚合真实调用量（窗口可选）
 *   ③ 实时流动：前端轮询 getMetrics 增量驱动粒子（详见前端 useDataFlowLive）
 *
 * 架构边界：只 import ai-engine/facade 暴露的 Registry 类型（不穿透内部路径）。
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  ToolRegistry,
  ContentSourceRegistry,
} from "@/modules/ai-engine/facade";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  DATAFLOW_EDGES,
  DATAFLOW_LAYERS,
  DATAFLOW_NODES,
  type DataFlowEdgeDef,
  type DataFlowLayerDef,
  type DataFlowNodeDef,
} from "./dataflow.topology";

export interface DataFlowGraphNode extends DataFlowNodeDef {
  /** 该节点是否有真实运行时实体在线（registry 校验）。无对应实体时为 null。 */
  live: boolean | null;
}

export interface DataFlowGraph {
  layers: DataFlowLayerDef[];
  nodes: DataFlowGraphNode[];
  edges: DataFlowEdgeDef[];
  generatedAt: string;
}

export interface DataFlowNodeMetric {
  calls: number;
  errors: number;
  avgMs: number | null;
  tokens: number;
}

export interface DataFlowMetrics {
  /** 统计窗口（小时） */
  windowHours: number;
  generatedAt: string;
  /** nodeId → 指标（仅含有 capabilityId 且窗口内有调用的节点） */
  nodes: Record<string, DataFlowNodeMetric>;
  totalCalls: number;
}

@Injectable()
export class DataFlowService {
  private readonly logger = new Logger(DataFlowService.name);

  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly contentSourceRegistry: ContentSourceRegistry,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * ① 真实拓扑：声明式骨架 + Registry 实时校验 live。
   */
  getGraph(): DataFlowGraph {
    const nodes: DataFlowGraphNode[] = DATAFLOW_NODES.map((n) => ({
      ...n,
      live: this.resolveLive(n),
    }));

    return {
      layers: DATAFLOW_LAYERS,
      nodes,
      edges: DATAFLOW_EDGES,
      generatedAt: new Date().toISOString(),
    };
  }

  private resolveLive(node: DataFlowNodeDef): boolean | null {
    if (node.capabilityId) {
      try {
        return this.toolRegistry.isAvailable(node.capabilityId);
      } catch {
        return false;
      }
    }
    if (node.sourceId) {
      try {
        return this.contentSourceRegistry.get(node.sourceId) !== undefined;
      } catch {
        return false;
      }
    }
    return null; // 声明式节点，无对应运行时实体
  }

  /**
   * ② 真实流量统计：AIUsageLog 按 capabilityId 聚合。
   * @param windowHours 回看窗口（默认 24h，范围 1..720）
   */
  async getMetrics(windowHours = 24): Promise<DataFlowMetrics> {
    const win = Math.min(Math.max(Math.round(windowHours), 1), 720);
    const since = new Date(Date.now() - win * 60 * 60 * 1000);

    // capabilityId → nodeId 映射（仅有真实工具/能力的节点参与聚合）
    const capToNode = new Map<string, string>();
    for (const n of DATAFLOW_NODES) {
      if (n.capabilityId) capToNode.set(n.capabilityId, n.id);
    }
    const capabilityIds = Array.from(capToNode.keys());

    const nodes: Record<string, DataFlowNodeMetric> = {};
    let totalCalls = 0;

    if (capabilityIds.length === 0) {
      return {
        windowHours: win,
        generatedAt: new Date().toISOString(),
        nodes,
        totalCalls,
      };
    }

    try {
      const [grouped, failed] = await Promise.all([
        this.prisma.aIUsageLog.groupBy({
          by: ["capabilityId"],
          where: {
            createdAt: { gte: since },
            capabilityId: { in: capabilityIds },
          },
          _count: { _all: true },
          _avg: { duration: true },
          _sum: { tokensUsed: true },
        }),
        this.prisma.aIUsageLog.groupBy({
          by: ["capabilityId"],
          where: {
            createdAt: { gte: since },
            capabilityId: { in: capabilityIds },
            success: false,
          },
          _count: { _all: true },
        }),
      ]);

      const errorByCap = new Map<string, number>();
      for (const row of failed) {
        if (row.capabilityId) errorByCap.set(row.capabilityId, row._count._all);
      }

      for (const row of grouped) {
        const capId = row.capabilityId;
        if (!capId) continue;
        const nodeId = capToNode.get(capId);
        if (!nodeId) continue;
        const calls = row._count._all;
        totalCalls += calls;
        nodes[nodeId] = {
          calls,
          errors: errorByCap.get(capId) ?? 0,
          avgMs:
            row._avg.duration != null ? Math.round(row._avg.duration) : null,
          tokens: row._sum.tokensUsed ?? 0,
        };
      }
    } catch (err) {
      // 聚合失败不阻断页面——返回空指标，拓扑仍可展示
      this.logger.warn(
        `getMetrics aggregation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return {
      windowHours: win,
      generatedAt: new Date().toISOString(),
      nodes,
      totalCalls,
    };
  }
}
