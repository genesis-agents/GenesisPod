/**
 * Prisma-backed PlanContextProvider — Group F-1 + baseline L189-L262 对齐。
 *
 * 从 Prisma 读取 `ResearchTopic` 元信息（含 description / topicConfig / dimensions）
 * + 通过 ChatFacade 读 available models（过滤 isAvailable + 按 id 去重），
 * 供 ST-01-PLAN 构造 LeaderPlannerInput。
 *
 * 替代 `StubPlanContextProvider`，由 HarnessModule 在有 Prisma/ChatFacade
 * 可注入时选用。
 */

import { Injectable, Logger } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { ChatFacade } from "@/modules/ai-engine/facade";
import { formatAnchorContentForPrompt } from "@/modules/ai-app/topic-insights/shared/utils/event-source-parser.utils";
import {
  PlanContextProvider,
  type ExistingDimensionSummary,
} from "./st-01-plan.stage";
import type { PipelineIdentityContext } from "../types";

const TOPIC_TYPE_WHITELIST = [
  "MACRO",
  "TECHNOLOGY",
  "COMPANY",
  "EVENT",
] as const;

type TopicType = (typeof TOPIC_TYPE_WHITELIST)[number];

function normalizeTopicType(raw: string | null | undefined): TopicType {
  if (!raw) return "MACRO";
  const upper = raw.toUpperCase();
  return (TOPIC_TYPE_WHITELIST as readonly string[]).includes(upper)
    ? (upper as TopicType)
    : "MACRO";
}

@Injectable()
export class PrismaPlanContextProvider extends PlanContextProvider {
  private readonly logger = new Logger(PrismaPlanContextProvider.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatFacade: ChatFacade,
  ) {
    super();
  }

  async load(identity: PipelineIdentityContext): Promise<{
    readonly topicName: string;
    readonly topicType: TopicType;
    readonly topicDescription?: string;
    readonly userPrompt?: string;
    readonly availableModels: ReadonlyArray<string>;
    readonly language: string;
    readonly existingDimensions?: ReadonlyArray<ExistingDimensionSummary>;
    readonly anchorContent?: string;
  }> {
    const topic = await this.prisma.researchTopic
      .findUnique({
        where: { id: identity.topicId },
        select: {
          name: true,
          type: true,
          language: true,
          description: true,
          topicConfig: true,
          dimensions: {
            select: {
              id: true,
              name: true,
              description: true,
              status: true,
              searchQueries: true,
            },
          },
        },
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `load(${identity.topicId}) failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      });

    const models = await this.chatFacade
      .getAvailableModelsExtended(AIModelType.CHAT)
      .catch((err: unknown) => {
        this.logger.warn(
          `getAvailableModelsExtended failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return [] as Array<{ id: string; isAvailable?: boolean }>;
      });

    // ★ baseline L209-L219：过滤不可用模型（API key 过期/熔断器）+ 按 id 去重
    const reachable = models.filter((m) => m.isAvailable !== false);
    const unique: Array<{ id: string }> = [];
    const seen = new Set<string>();
    for (const m of reachable) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        unique.push(m);
      }
    }
    if (reachable.length < models.length) {
      this.logger.warn(
        `[load] Filtered out ${models.length - reachable.length} unavailable models`,
      );
    }

    const topicType = normalizeTopicType(topic?.type);

    // ★ baseline L276-L283：EVENT 类型的锚文章格式化
    const anchorContent =
      topicType === "EVENT" &&
      topic?.topicConfig &&
      typeof topic.topicConfig === "object"
        ? formatAnchorContentForPrompt(
            topic.topicConfig as Record<string, unknown>,
          )
        : "";

    // ★ baseline L253-L262：existingDimensions 摘要（name/description/status/searchQueries）
    const existingDimensions: ReadonlyArray<ExistingDimensionSummary> =
      topic?.dimensions?.map((d) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        status: d.status,
        searchQueries: Array.isArray(d.searchQueries)
          ? (d.searchQueries as unknown[]).filter(
              (x): x is string => typeof x === "string",
            )
          : [],
      })) ?? [];

    return {
      topicName: topic?.name ?? identity.topicId,
      topicType,
      topicDescription: topic?.description ?? undefined,
      availableModels: unique.map((m) => m.id),
      language: topic?.language ?? "zh",
      existingDimensions,
      anchorContent,
    };
  }
}
