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
  CreatableRadarSourceTypeDto,
  CreateRadarSourceDto,
  UpdateRadarSourceDto,
} from "../../dto";
import { RadarTopicService } from "../topic/radar-topic.service";
import { assertSafeHttpUrl } from "../collectors/ssrf-util";
import { CollectorRouter } from "../collectors/collector-router.service";

@Injectable()
export class RadarSourceService {
  private readonly log = new Logger(RadarSourceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly topics: RadarTopicService,
    private readonly collectorRouter: CollectorRouter,
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
   * 批量入库 AI 推荐源。
   *
   * 2026-05-18：accept 路径新增 preflight — 复用 CollectorRouter.fanOut 真发
   * 一次拉取作为可达性探测（fan-out 并发，单源失败不阻塞）。失败的 candidate
   * silently drop（不入库），成功的入库。这样让 LLM hallucinate URL（截图
   * 35：Reuters feeds.reuters.com ENOTFOUND / The Verge 404 / NVIDIA Investor
   * 403 / YT @handle 解析失败）不再污染用户列表。
   *
   * 返回值含 `skipped`：前端提示用户"接受 N，过滤 M 个不可达"。
   */
  async bulkCreateAiRecommended(
    userId: string,
    topicId: string,
    candidates: Array<{
      type: CreatableRadarSourceTypeDto;
      identifier: string;
      label?: string;
      config?: Record<string, unknown>;
    }>,
  ): Promise<{
    created: RadarSource[];
    skipped: Array<{ type: string; identifier: string; reason: string }>;
  }> {
    await this.topics.getOwnedById(userId, topicId);

    // 1) shape 校验：DTO 已挡了 X，这里挡 identifier 格式错的（如 YT 既不是 channelId
    //    也不是 youtube.com URL，或 RSS 不是 https URL）
    const shapeOk: Array<{
      type: RadarSourceType;
      identifier: string;
      label?: string;
      config?: Record<string, unknown>;
    }> = [];
    const skipped: Array<{ type: string; identifier: string; reason: string }> =
      [];
    for (const c of candidates) {
      const identifier = c.identifier.trim();
      if (!identifier) {
        skipped.push({
          type: c.type,
          identifier: c.identifier,
          reason: "空 identifier",
        });
        continue;
      }
      const type = c.type as unknown as RadarSourceType;
      try {
        this.assertIdentifierShape(type, identifier);
        shapeOk.push({ type, identifier, label: c.label, config: c.config });
      } catch (err) {
        this.log.warn(
          `Skip shape-invalid AI candidate ${type}:${identifier} - ${(err as Error).message}`,
        );
        skipped.push({ type, identifier, reason: (err as Error).message });
      }
    }

    // 2) preflight：构造 in-memory RadarSource 跑 collector.fetch 探测；
    //    only 失败时 drop（成功 / 空数组 / 无新数据都算可达）
    if (shapeOk.length > 0) {
      const transientSources = shapeOk.map((c, i) =>
        this.buildTransientSource(topicId, c.type, c.identifier, c.config, i),
      );
      // since=未来 → 拉空数组（避免重复网络流量 / 入库），但 collector 仍走
      // 网络请求 → 真探测可达性
      const results = await this.collectorRouter.fanOut(transientSources, {
        since: new Date(Date.now() + 86_400_000),
        perSourceLimit: 1,
        userId,
      });
      const failedIdx = new Set<number>();
      results.forEach((r, i) => {
        if (r.error) {
          this.log.warn(
            `Preflight drop ${r.type}:${transientSources[i]?.identifier} - ${r.error}`,
          );
          failedIdx.add(i);
          const c = shapeOk[i];
          skipped.push({
            type: c.type,
            identifier: c.identifier,
            reason: r.error,
          });
        }
      });
      // 失败的从 shapeOk 剔除
      const live = shapeOk.filter((_, i) => !failedIdx.has(i));
      shapeOk.length = 0;
      shapeOk.push(...live);
    }

    // 3) 入库
    const created: RadarSource[] = [];
    for (const c of shapeOk) {
      try {
        const source = await this.prisma.radarSource.create({
          data: {
            topicId,
            type: c.type,
            identifier: c.identifier,
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
          skipped.push({
            type: c.type,
            identifier: c.identifier,
            reason: "已存在同 type+identifier 数据源",
          });
          continue;
        }
        throw error;
      }
    }
    return { created, skipped };
  }

  /**
   * 构造未入库的 RadarSource 临时对象供 CollectorRouter.fanOut() preflight。
   * 仅填 collector.fetch() 必读的字段；id/topicId/timestamps 用占位。
   */
  private buildTransientSource(
    topicId: string,
    type: RadarSourceType,
    identifier: string,
    config: Record<string, unknown> | undefined,
    seq: number,
  ): RadarSource {
    const now = new Date();
    return {
      id: `preflight-${seq}`,
      topicId,
      type,
      identifier,
      label: null,
      config: (config ?? null) as Prisma.JsonValue,
      enabled: true,
      isAiRecommended: true,
      health: "UNKNOWN",
      consecutiveFailures: 0,
      cooldownUntil: null,
      lastFetchAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
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
        try {
          assertSafeHttpUrl(identifier);
        } catch (err) {
          throw new BadRequestException((err as Error).message);
        }
        break;
      default:
        throw new BadRequestException(`未知 source type: ${type}`);
    }
  }
}
