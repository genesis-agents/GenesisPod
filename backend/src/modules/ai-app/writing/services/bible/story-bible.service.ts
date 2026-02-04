import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";

@Injectable()
export class StoryBibleService {
  private readonly logger = new Logger(StoryBibleService.name);

  constructor(private readonly prisma: PrismaService) {
    void this.logger;
  }

  async getByProject(projectId: string, userId: string) {
    const project = await this.prisma.writingProject.findFirst({
      where: { id: projectId, ownerId: userId },
    });

    if (!project) {
      throw new ForbiddenException("Project not found or access denied");
    }

    return this.prisma.storyBible.findUnique({
      where: { projectId },
      include: {
        characters: {
          orderBy: { createdAt: "asc" },
        },
        worldSettings: {
          orderBy: { createdAt: "asc" },
        },
        terminologies: true,
        timelineEvents: {
          orderBy: { storyTime: "asc" },
        },
        factions: true,
      },
    });
  }

  async update(projectId: string, userId: string, dto: any) {
    const project = await this.prisma.writingProject.findFirst({
      where: { id: projectId, ownerId: userId },
    });

    if (!project) {
      throw new ForbiddenException("Project not found or access denied");
    }

    return this.prisma.storyBible.update({
      where: { projectId },
      data: {
        premise: dto.premise,
        theme: dto.theme,
        tone: dto.tone,
        worldType: dto.worldType,
        version: { increment: 1 },
        lastSyncAt: new Date(),
      },
    });
  }

  async getSnapshot(projectId: string) {
    const bible = await this.prisma.storyBible.findUnique({
      where: { projectId },
      include: {
        characters: {
          orderBy: { createdAt: "asc" },
        },
        worldSettings: {
          orderBy: { createdAt: "asc" },
        },
        terminologies: true,
        timelineEvents: {
          orderBy: { storyTime: "asc" },
        },
        factions: true,
      },
    });

    if (!bible) {
      throw new NotFoundException("Story Bible not found");
    }

    return {
      ...bible,
      snapshotAt: new Date(),
    };
  }

  async getCharactersByIds(bibleId: string, characterIds: string[]) {
    return this.prisma.writingCharacter.findMany({
      where: {
        bibleId,
        id: { in: characterIds },
      },
    });
  }

  async getWorldSettings(bibleId: string, categories?: string[]) {
    const where: any = { bibleId };
    if (categories?.length) {
      where.category = { in: categories };
    }
    return this.prisma.worldSetting.findMany({ where });
  }

  async getTerminology(bibleId: string, terms?: string[]) {
    const where: any = { bibleId };
    if (terms?.length) {
      where.term = { in: terms };
    }
    return this.prisma.terminology.findMany({ where });
  }

  async getTimelineContext(bibleId: string, _storyTime?: string) {
    return this.prisma.timelineEvent.findMany({
      where: { bibleId },
      orderBy: { storyTime: "asc" },
    });
  }
}
