/**
 * DailyBriefing controller — PR-DR2 P0-7 (X8 review finding)
 *
 * 来源：daily-briefing-redesign-2026-05-18.md §4 / §6
 *
 * 路由：
 * - GET /api/v1/radar/topics/:topicId/daily-briefing[?date=YYYY-MM-DD]
 *   返回当日 briefing（无 date 则取 latest completed）
 *
 * 安全：JwtAuthGuard + ownership 校验（topics.getOwnedById）
 */
import {
  Controller,
  Get,
  Param,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import type { RequestWithUser } from "../../../../common/types/express-request.types";
import {
  DailySignal,
  RadarDailyBriefingRepo,
} from "../services/briefing/radar-daily-briefing.repo";
import { RadarTopicService } from "../services/topic/radar-topic.service";

export interface DailySignalDto {
  id: string;
  tier: 1 | 2 | 3;
  title: string;
  oneLineTakeaway: string;
  whyItMatters: string;
  whatsNext: string;
  signalTags: string[];
  entities: string[];
  evidenceItemIds: string[];
  narrativeId?: string;
}

export interface DailyBriefingDto {
  id: string;
  topicId: string;
  briefingDate: string;
  status: "completed" | "no_signals" | "generating";
  signals: DailySignalDto[];
  generationRunId?: string;
}

@Controller("radar/topics")
@UseGuards(JwtAuthGuard)
export class DailyBriefingController {
  constructor(
    private readonly repo: RadarDailyBriefingRepo,
    private readonly topics: RadarTopicService,
  ) {}

  @Get(":topicId/daily-briefing")
  async get(
    @Request() req: RequestWithUser,
    @Param("topicId") topicId: string,
    @Query("date") date?: string,
  ): Promise<DailyBriefingDto | null> {
    await this.topics.getOwnedById(req.user.id, topicId);

    const row = date
      ? await this.repo.findByTopicAndDate(topicId, parseDate(date))
      : await this.repo.findLatestForTopic(topicId);
    if (!row) return null;

    const signals = (row.signals as unknown as DailySignal[]) ?? [];
    return {
      id: row.id,
      topicId: row.topicId,
      briefingDate: row.briefingDate.toISOString().slice(0, 10),
      status: row.status as DailyBriefingDto["status"],
      signals: signals.map((s) => ({
        id: s.id,
        tier: s.tier,
        title: s.title,
        oneLineTakeaway: s.oneLineTakeaway,
        whyItMatters: s.whyItMatters,
        whatsNext: s.whatsNext,
        signalTags: s.signalTags ?? [],
        entities: s.entities ?? [],
        evidenceItemIds: s.evidenceItemIds ?? [],
        narrativeId: s.narrativeId,
      })),
      generationRunId: row.generationRunId ?? undefined,
    };
  }
}

function parseDate(s: string): Date {
  // 'YYYY-MM-DD' → UTC 00:00 Date（Prisma @db.Date 不带时间）
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`invalid date: ${s}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}
