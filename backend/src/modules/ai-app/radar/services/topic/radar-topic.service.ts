import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, RadarTopic, RadarTopicStatus } from "@prisma/client";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import {
  CreateRadarTopicDto,
  RadarEntityType,
  UpdateRadarTopicDto,
} from "../../dto";
import { DEFAULT_REFRESH_CRON } from "../../radar.constants";

const KEYWORD_MAX_LEN = 80;

// 5 段 cron 校验（与 DTO 同模式，service 内部 fallback）。
// 用 RegExp 构造器避免斜杠星号序列被 TSC 误判为块注释结束。
const CRON_REGEX = new RegExp(
  "^[\\d*/,-]+\\s+[\\d*/,-]+\\s+[\\d*/,-]+\\s+[\\d*/,-]+\\s+[\\d*/,-]+$",
);

@Injectable()
export class RadarTopicService {
  private readonly log = new Logger(RadarTopicService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateRadarTopicDto): Promise<RadarTopic> {
    const refreshCron = dto.refreshCron ?? DEFAULT_REFRESH_CRON;
    this.assertCron(refreshCron);
    const keywords = this.normalizeKeywords(dto.keywords);
    if (keywords.length === 0) {
      throw new BadRequestException("keywords 不能为空");
    }

    const topic = await this.prisma.radarTopic.create({
      data: {
        userId,
        name: dto.name.trim(),
        description: dto.description?.trim() ?? null,
        entityType: dto.entityType ?? null,
        keywords: keywords as Prisma.InputJsonValue,
        refreshCron,
        status: RadarTopicStatus.ACTIVE,
        // nextDueAt 不在 PR-R1 计算，留给 PR-R4 scheduler 接入 cron-parser
        nextDueAt: new Date(),
      },
    });
    this.log.log(
      `Created radar topic id=${topic.id} user=${userId} name=${topic.name}`,
    );
    return topic;
  }

  async listByUser(
    userId: string,
    opts: { status?: RadarTopicStatus; limit?: number; cursor?: string } = {},
  ): Promise<{ items: RadarTopic[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
    const items = await this.prisma.radarTopic.findMany({
      where: {
        userId,
        ...(opts.status ? { status: opts.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > limit;
    const sliced = hasMore ? items.slice(0, limit) : items;
    return {
      items: sliced,
      nextCursor: hasMore ? (sliced[sliced.length - 1]?.id ?? null) : null,
    };
  }

  async getOwnedById(userId: string, topicId: string): Promise<RadarTopic> {
    const topic = await this.prisma.radarTopic.findUnique({
      where: { id: topicId },
    });
    if (!topic) throw new NotFoundException("Radar topic not found");
    if (topic.userId !== userId) throw new ForbiddenException("Not owner");
    return topic;
  }

  async update(
    userId: string,
    topicId: string,
    dto: UpdateRadarTopicDto,
  ): Promise<RadarTopic> {
    await this.getOwnedById(userId, topicId);
    if (dto.refreshCron) this.assertCron(dto.refreshCron);
    const data: Prisma.RadarTopicUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) {
      data.description = dto.description?.trim() ?? null;
    }
    if (dto.entityType !== undefined) {
      data.entityType = (dto.entityType ?? null) as RadarEntityType | null;
    }
    if (dto.keywords !== undefined) {
      const kw = this.normalizeKeywords(dto.keywords);
      if (kw.length === 0) {
        throw new BadRequestException("keywords 不能为空");
      }
      data.keywords = kw as Prisma.InputJsonValue;
    }
    if (dto.refreshCron !== undefined) data.refreshCron = dto.refreshCron;

    return this.prisma.radarTopic.update({ where: { id: topicId }, data });
  }

  async delete(userId: string, topicId: string): Promise<void> {
    await this.getOwnedById(userId, topicId);
    await this.prisma.radarTopic.delete({ where: { id: topicId } });
    this.log.log(`Deleted radar topic id=${topicId} user=${userId}`);
  }

  async pause(userId: string, topicId: string): Promise<RadarTopic> {
    await this.getOwnedById(userId, topicId);
    return this.prisma.radarTopic.update({
      where: { id: topicId },
      data: { status: RadarTopicStatus.PAUSED, nextDueAt: null },
    });
  }

  async resume(userId: string, topicId: string): Promise<RadarTopic> {
    await this.getOwnedById(userId, topicId);
    return this.prisma.radarTopic.update({
      where: { id: topicId },
      data: { status: RadarTopicStatus.ACTIVE, nextDueAt: new Date() },
    });
  }

  async archive(userId: string, topicId: string): Promise<RadarTopic> {
    await this.getOwnedById(userId, topicId);
    return this.prisma.radarTopic.update({
      where: { id: topicId },
      data: { status: RadarTopicStatus.ARCHIVED, nextDueAt: null },
    });
  }

  /**
   * 计数关联资源，给详情页/卡片展示用。
   */
  async getCounts(topicId: string) {
    const [sources, items, runs] = await Promise.all([
      this.prisma.radarSource.count({ where: { topicId } }),
      this.prisma.radarItem.count({ where: { topicId } }),
      this.prisma.radarRun.count({ where: { topicId } }),
    ]);
    return { sources, items, runs };
  }

  private assertCron(expr: string): void {
    if (!CRON_REGEX.test(expr)) {
      throw new BadRequestException(`非法 cron 表达式: ${expr}`);
    }
  }

  private normalizeKeywords(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const set = new Set<string>();
    for (const v of raw) {
      if (typeof v !== "string") continue;
      const trimmed = v.trim();
      if (!trimmed) continue;
      if (trimmed.length > KEYWORD_MAX_LEN) continue;
      set.add(trimmed);
    }
    return Array.from(set);
  }
}
