import { Injectable, Logger } from "@nestjs/common";
import { RadarSource } from "@prisma/client";
import { RadarTopicService } from "../topic/radar-topic.service";
import { RadarSourceService } from "./radar-source.service";
import {
  RecommendedSource,
  SourceCuratorAgent,
} from "../../agents/source-curator/source-curator.agent";
import { RecommendedSourceCandidateDto } from "../../dto";

/**
 * SourceDiscoveryService —— 调 SourceCuratorAgent 生成推荐 + 接收用户确认批量入库。
 *
 * 前端流程：
 *   1. POST /topics/:id/sources/recommend → candidates: RecommendedSource[]
 *   2. POST /topics/:id/sources/recommend/accept body: { candidates: [Candidate] }
 *      候选项走 class-validator nested 校验后入库（避免 SSRF 注入）
 */
@Injectable()
export class SourceDiscoveryService {
  private readonly log = new Logger(SourceDiscoveryService.name);

  constructor(
    private readonly topics: RadarTopicService,
    private readonly sources: RadarSourceService,
    private readonly curator: SourceCuratorAgent,
  ) {}

  async recommend(
    userId: string,
    topicId: string,
    opts: { perTypeLimit?: number } = {},
  ): Promise<RecommendedSource[]> {
    const topic = await this.topics.getOwnedById(userId, topicId);
    const existing = await this.sources.listByTopic(userId, topicId);
    const keywords = this.parseKeywords(topic.keywords);
    const candidates = await this.curator.recommend(
      {
        name: topic.name,
        description: topic.description,
        keywords,
        entityType: topic.entityType,
        existing: existing.map((s) => ({
          type: s.type,
          identifier: s.identifier,
        })),
      },
      { userId, perTypeLimit: opts.perTypeLimit },
    );
    this.log.log(
      `Source curator → ${candidates.length} candidates for topic=${topicId}`,
    );
    return candidates;
  }

  /**
   * 接受 AI 推荐源批量入库（已通过 class-validator nested 校验）。
   */
  async acceptCandidates(
    userId: string,
    topicId: string,
    candidates: RecommendedSourceCandidateDto[],
  ): Promise<RadarSource[]> {
    if (candidates.length === 0) return [];
    return this.sources.bulkCreateAiRecommended(
      userId,
      topicId,
      candidates.map((c) => ({
        type: c.type,
        identifier: c.identifier,
        label: c.label,
        config:
          c.type === ("CUSTOM" as RecommendedSourceCandidateDto["type"])
            ? { _hint: c.rationale ?? "" }
            : undefined,
      })),
    );
  }

  private parseKeywords(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((v): v is string => typeof v === "string");
  }
}
