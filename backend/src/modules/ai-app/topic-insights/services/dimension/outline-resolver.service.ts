/**
 * Outline Resolver Service
 *
 * 从全局大纲中查找维度对应的大纲，如果找不到则退化到本地规划。
 * 抽取自 DimensionWriteHandler，让 Handler 保持纯适配器。
 */

import { Injectable, Logger } from "@nestjs/common";
import type { ResearchLeaderService } from "../core/research/research-leader.service";
import type { GlobalOutline, DimensionOutline } from "../../types/leader.types";

@Injectable()
export class OutlineResolverService {
  private readonly logger = new Logger(OutlineResolverService.name);

  constructor(private readonly researchLeaderService: ResearchLeaderService) {}

  /**
   * 解析维度大纲：优先从全局大纲匹配，退化到本地规划
   */
  async resolve(
    globalOutline: GlobalOutline | null,
    topic: {
      name: string;
      type: string;
      description?: string | null;
      language?: string | null;
    },
    dimension: {
      id: string;
      name: string;
      description: string | null;
      searchQueries: string[] | unknown;
    },
    evidenceSummary: string,
    figuresSummary?: string,
    allDimensions?: Array<{ name: string; description?: string | null }>,
  ): Promise<DimensionOutline> {
    // 1. 尝试从全局大纲匹配
    if (globalOutline) {
      const coordinated = globalOutline.dimensions.find(
        (d) =>
          d.dimensionId === dimension.id || d.dimensionName === dimension.name,
      );
      if (coordinated) {
        this.logger.log(
          `[resolve] Using global coordinated outline for: ${dimension.name}`,
        );
        return coordinated.outline;
      }
    }

    // 2. 退化到本地规划
    this.logger.log(
      `[resolve] Falling back to local outline planning for: ${dimension.name}`,
    );
    return this.researchLeaderService.planDimensionOutline(
      topic,
      dimension,
      evidenceSummary,
      figuresSummary,
      allDimensions,
    );
  }
}
