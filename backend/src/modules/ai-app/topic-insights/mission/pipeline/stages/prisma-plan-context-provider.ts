/**
 * Prisma-backed PlanContextProvider — Group F-1
 *
 * 从 Prisma 读取 `ResearchTopic` 元信息 + 通过 ChatFacade 读 available models，
 * 供 ST-01-PLAN 构造 LeaderPlannerInput。
 *
 * 替代 `StubPlanContextProvider`，由 HarnessModule 在有 Prisma/ChatFacade
 * 可注入时选用。
 */

import { Injectable, Logger } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { ChatFacade } from "@/modules/ai-engine/facade";
import { PlanContextProvider } from "./st-01-plan.stage";
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
    readonly userPrompt?: string;
    readonly availableModels: ReadonlyArray<string>;
    readonly language: string;
  }> {
    const topic = await this.prisma.researchTopic
      .findUnique({
        where: { id: identity.topicId },
        select: {
          name: true,
          type: true,
          language: true,
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
        return [] as Array<{ id: string }>;
      });

    return {
      topicName: topic?.name ?? identity.topicId,
      topicType: normalizeTopicType(topic?.type),
      availableModels: models.map((m) => m.id),
      language: topic?.language ?? "zh",
    };
  }
}
