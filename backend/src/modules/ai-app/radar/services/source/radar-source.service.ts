import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, RadarSource, RadarSourceType } from "@prisma/client";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import {
  CreateRadarSourceDto,
  RadarSourceTypeDto,
  UpdateRadarSourceDto,
} from "../../dto";
import { RadarTopicService } from "../topic/radar-topic.service";

const PRIVATE_HOST_REGEX =
  /^(?:localhost|127\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::1|fe80:)/i;

@Injectable()
export class RadarSourceService {
  private readonly log = new Logger(RadarSourceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly topics: RadarTopicService,
  ) {}

  async create(
    userId: string,
    topicId: string,
    dto: CreateRadarSourceDto,
  ): Promise<RadarSource> {
    await this.topics.getOwnedById(userId, topicId);
    const identifier = dto.identifier.trim();
    if (!identifier) throw new BadRequestException("identifier 不能为空");

    const type = dto.type as unknown as RadarSourceType;
    this.assertIdentifierShape(type, identifier);

    try {
      return await this.prisma.radarSource.create({
        data: {
          topicId,
          type,
          identifier,
          label: dto.label?.trim() ?? null,
          config:
            dto.config === undefined
              ? Prisma.JsonNull
              : (dto.config as Prisma.InputJsonValue),
          enabled: dto.enabled ?? true,
          isAiRecommended: false,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          "同 topic 下已有相同 type+identifier 的数据源",
        );
      }
      throw error;
    }
  }

  async listByTopic(userId: string, topicId: string): Promise<RadarSource[]> {
    await this.topics.getOwnedById(userId, topicId);
    return this.prisma.radarSource.findMany({
      where: { topicId },
      orderBy: [{ enabled: "desc" }, { createdAt: "asc" }],
    });
  }

  async getOwnedById(userId: string, sourceId: string): Promise<RadarSource> {
    const source = await this.prisma.radarSource.findUnique({
      where: { id: sourceId },
      include: { topic: true },
    });
    if (!source) throw new NotFoundException("Radar source not found");
    if (source.topic.userId !== userId) {
      throw new ForbiddenException("Not owner");
    }
    return source;
  }

  async update(
    userId: string,
    sourceId: string,
    dto: UpdateRadarSourceDto,
  ): Promise<RadarSource> {
    await this.getOwnedById(userId, sourceId);
    const data: Prisma.RadarSourceUpdateInput = {};
    if (dto.label !== undefined) data.label = dto.label?.trim() ?? null;
    if (dto.config !== undefined) {
      data.config =
        dto.config === null
          ? Prisma.JsonNull
          : (dto.config as Prisma.InputJsonValue);
    }
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    return this.prisma.radarSource.update({ where: { id: sourceId }, data });
  }

  async delete(userId: string, sourceId: string): Promise<void> {
    await this.getOwnedById(userId, sourceId);
    await this.prisma.radarSource.delete({ where: { id: sourceId } });
  }

  /**
   * 批量入库 AI 推荐源（PR-R4 调用，PR-R1 留空逻辑）。
   * skipDuplicates 由 unique 索引 (topicId, type, identifier) 保证。
   */
  async bulkCreateAiRecommended(
    userId: string,
    topicId: string,
    candidates: Array<{
      type: RadarSourceTypeDto;
      identifier: string;
      label?: string;
      config?: Record<string, unknown>;
    }>,
  ): Promise<RadarSource[]> {
    await this.topics.getOwnedById(userId, topicId);
    const created: RadarSource[] = [];
    for (const c of candidates) {
      const identifier = c.identifier.trim();
      if (!identifier) continue;
      const type = c.type as unknown as RadarSourceType;
      try {
        this.assertIdentifierShape(type, identifier);
      } catch (err) {
        this.log.warn(
          `Skip invalid AI recommended source ${type}:${identifier} - ${(err as Error).message}`,
        );
        continue;
      }
      try {
        const source = await this.prisma.radarSource.create({
          data: {
            topicId,
            type,
            identifier,
            label: c.label?.trim() ?? null,
            config:
              c.config === undefined
                ? Prisma.JsonNull
                : (c.config as Prisma.InputJsonValue),
            enabled: true,
            isAiRecommended: true,
          },
        });
        created.push(source);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          continue;
        }
        throw error;
      }
    }
    return created;
  }

  private assertIdentifierShape(
    type: RadarSourceType,
    identifier: string,
  ): void {
    switch (type) {
      case "X":
        if (!/^@?[A-Za-z0-9_]{1,30}$/.test(identifier)) {
          throw new BadRequestException(
            "X 数据源 identifier 必须是 1-30 位字母数字下划线 handle（可前缀 @）",
          );
        }
        break;
      case "YOUTUBE":
        // 接受 channelId（UC 开头 24 位）或 https://www.youtube.com/channel/UC.../@user URL
        if (
          !/^UC[A-Za-z0-9_-]{22}$/.test(identifier) &&
          !/^https?:\/\/(?:www\.)?youtube\.com\//.test(identifier)
        ) {
          throw new BadRequestException(
            "YouTube 数据源 identifier 必须是 channelId 或 youtube.com URL",
          );
        }
        break;
      case "RSS":
      case "CUSTOM":
        this.assertHttpUrl(identifier);
        break;
      default:
        throw new BadRequestException(`未知 source type: ${type}`);
    }
  }

  private assertHttpUrl(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException(`非法 URL: ${url}`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new BadRequestException("URL 必须是 http:// 或 https://");
    }
    if (PRIVATE_HOST_REGEX.test(parsed.hostname)) {
      throw new BadRequestException("禁止使用内网 / 私有 IP / loopback 地址");
    }
  }
}
