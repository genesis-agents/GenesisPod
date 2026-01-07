import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";

@Injectable()
export class TimelineService {
  private readonly logger = new Logger(TimelineService.name);

  constructor(private readonly prisma: PrismaService) {
    void this.logger;
  }

  async create(bibleId: string, data: any) {
    return this.prisma.timelineEvent.create({
      data: {
        bibleId,
        eventName: data.eventName,
        description: data.description,
        storyTime: data.storyTime,
        importance: data.importance || 1,
        involvedCharacterIds: data.involvedCharacterIds || [],
        relatedChapterId: data.relatedChapterId,
      },
    });
  }

  async findAll(bibleId: string) {
    return this.prisma.timelineEvent.findMany({
      where: { bibleId },
      orderBy: { storyTime: "asc" },
    });
  }

  async update(id: string, data: any) {
    return this.prisma.timelineEvent.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    return this.prisma.timelineEvent.delete({
      where: { id },
    });
  }
}
