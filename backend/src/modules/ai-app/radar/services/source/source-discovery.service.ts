import { Injectable, Logger } from "@nestjs/common";
import { RadarSource } from "@prisma/client";
import { RadarTopicService } from "../topic/radar-topic.service";
import { RadarSourceService } from "./radar-source.service";
import {
  RecommendedSource,
  SourceCuratorAgent,
} from "../../agents/source-curator/source-curator.agent";
import { RadarSourceTypeDto } from "../../dto";

/**
 * SourceDiscoveryService —— 调 SourceCuratorAgent 生成推荐 + 接收用户确认批量入库。
 *
 * 前端流程：
 *   1. POST /topics/:id/sources/recommend → 返回 candidates: RecommendedSource[]
 *      （前端把 candidates 渲染成勾选 list，用户可见 rationale + confidence）
 *   2. POST /topics/:id/sources/recommend/accept body: { candidates: [serializedJson] }
 *      把用户勾选的候选项原样 echo 回来（避免再调一次 LLM），后端 validate + 入库
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
   * 接受 AI 推荐源批量入库。
   *
   * @param candidatesJson 前端把 RecommendedSource[] 序列化回传 -- 用 JSON.stringify
   *                       再 split 也行，这里假设前端传 JSON string 数组
   */
  async acceptCandidates(
    userId: string,
    topicId: string,
    candidatesJson: string[],
  ): Promise<RadarSource[]> {
    const parsed = candidatesJson
      .map((s) => this.tryParse(s))
      .filter((c): c is RecommendedSource => c !== null);
    if (parsed.length === 0) return [];
    return this.sources.bulkCreateAiRecommended(
      userId,
      topicId,
      parsed.map((c) => ({
        type: c.type as unknown as RadarSourceTypeDto,
        identifier: c.identifier,
        label: c.label,
        config: c.type === "CUSTOM" ? { _hint: c.rationale } : undefined,
      })),
    );
  }

  private tryParse(raw: string): RecommendedSource | null {
    try {
      const obj = JSON.parse(raw) as RecommendedSource;
      if (
        obj &&
        typeof obj.identifier === "string" &&
        (obj.type === "X" ||
          obj.type === "YOUTUBE" ||
          obj.type === "RSS" ||
          obj.type === "CUSTOM")
      ) {
        return obj;
      }
      return null;
    } catch {
      return null;
    }
  }

  private parseKeywords(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((v): v is string => typeof v === "string");
  }
}
