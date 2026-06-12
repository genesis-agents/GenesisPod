import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import {
  CreateForesightCardDto,
  CreateForesightEdgeDto,
  UpdateForesightCardDto,
} from "../dto/foresight.dto";
import { Prisma } from "@prisma/client";

/**
 * ForesightGraphService —— 判断资产 CRUD + 全量 overview 装配。
 * 所有查询强制 userId 行级隔离。
 */
@Injectable()
export class ForesightGraphService {
  constructor(private readonly prisma: PrismaService) {}

  /** 一次性返回前端工作台所需的全部数据（用户级数据量小，单请求装配最简单可靠） */
  async overview(userId: string) {
    const [cards, edges, signals, reviewItems, conclusions] = await Promise.all(
      [
        this.prisma.foresightCard.findMany({
          where: { userId },
          orderBy: [{ layer: "asc" }, { cardKey: "asc" }],
        }),
        this.prisma.foresightEdge.findMany({ where: { userId } }),
        this.prisma.foresightSignal.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.foresightReviewItem.findMany({
          where: { userId },
          orderBy: [{ status: "asc" }, { impact: "desc" }],
          take: 300,
        }),
        this.prisma.foresightConclusion.findMany({
          where: { userId },
          orderBy: { conclKey: "asc" },
        }),
      ],
    );
    return { cards, edges, signals, reviewItems, conclusions };
  }

  async createCard(userId: string, dto: CreateForesightCardDto) {
    return this.prisma.foresightCard.create({
      data: {
        userId,
        cardKey: dto.cardKey,
        layer: dto.layer,
        title: dto.title,
        claim: dto.claim,
        conf: dto.conf,
        sens: dto.sens,
        horizon: dto.horizon,
        stage: dto.stage,
        evidence: (dto.evidence ?? []) as Prisma.InputJsonValue,
        falsifiers: (dto.falsifiers ?? []) as Prisma.InputJsonValue,
        sources: (dto.sources ?? []) as Prisma.InputJsonValue,
        scenarios: dto.scenarios
          ? (dto.scenarios as Prisma.InputJsonValue)
          : undefined,
        originType: dto.originType ?? "manual",
      },
    });
  }

  async updateCard(userId: string, id: string, dto: UpdateForesightCardDto) {
    await this.requireCard(userId, id);
    const { scenarios, evidence, falsifiers, sources, ...rest } = dto;
    return this.prisma.foresightCard.update({
      where: { id },
      data: {
        ...rest,
        ...(evidence !== undefined && {
          evidence: evidence as Prisma.InputJsonValue,
        }),
        ...(falsifiers !== undefined && {
          falsifiers: falsifiers as Prisma.InputJsonValue,
        }),
        ...(sources !== undefined && {
          sources: sources as Prisma.InputJsonValue,
        }),
        ...(scenarios !== undefined && {
          scenarios:
            scenarios === null
              ? Prisma.DbNull
              : (scenarios as Prisma.InputJsonValue),
        }),
      },
    });
  }

  async deleteCard(userId: string, id: string) {
    await this.requireCard(userId, id);
    await this.prisma.foresightCard.delete({ where: { id } });
    return { deleted: true };
  }

  async ledger(userId: string, cardId: string) {
    await this.requireCard(userId, cardId);
    return this.prisma.foresightConfLog.findMany({
      where: { cardId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async createEdge(userId: string, dto: CreateForesightEdgeDto) {
    if (dto.fromKey === dto.toKey) {
      throw new BadRequestException("edge endpoints must differ");
    }
    const [from, to] = await Promise.all([
      this.prisma.foresightCard.findUnique({
        where: { userId_cardKey: { userId, cardKey: dto.fromKey } },
      }),
      this.prisma.foresightCard.findUnique({
        where: { userId_cardKey: { userId, cardKey: dto.toKey } },
      }),
    ]);
    if (!from || !to) {
      throw new NotFoundException("from/to card not found");
    }
    return this.prisma.foresightEdge.create({
      data: {
        userId,
        fromCardId: from.id,
        toCardId: to.id,
        metric: dto.metric,
        type: dto.type ?? "flow",
        weight: dto.weight ?? 0.7,
      },
    });
  }

  async deleteEdge(userId: string, id: string) {
    const edge = await this.prisma.foresightEdge.findFirst({
      where: { id, userId },
    });
    if (!edge) throw new NotFoundException("edge not found");
    await this.prisma.foresightEdge.delete({ where: { id } });
    return { deleted: true };
  }

  private async requireCard(userId: string, id: string) {
    const card = await this.prisma.foresightCard.findFirst({
      where: { id, userId },
    });
    if (!card) throw new NotFoundException("card not found");
    return card;
  }
}
