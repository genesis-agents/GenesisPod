import { Injectable, Logger, NotFoundException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { CreateChapterDto, UpdateChapterDto, StartWritingDto } from "../../dto/chapter.dto";

@Injectable()
export class ChapterWritingService {
  private readonly _logger = new Logger(ChapterWritingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createChapter(volumeId: string, userId: string, dto: CreateChapterDto) {
    await this.verifyVolumeAccess(volumeId, userId);

    return this.prisma.writingChapter.create({
      data: {
        volumeId,
        chapterNumber: dto.chapterNumber,
        title: dto.title,
        outline: dto.outline,
        dependsOn: dto.dependsOn || [],
      },
    });
  }

  async getChapters(volumeId: string, userId: string) {
    await this.verifyVolumeAccess(volumeId, userId);

    return this.prisma.writingChapter.findMany({
      where: { volumeId },
      orderBy: { chapterNumber: "asc" },
    });
  }

  async getChapter(id: string, userId: string) {
    const chapter = await this.prisma.writingChapter.findUnique({
      where: { id },
      include: {
        volume: {
          include: {
            project: { select: { id: true, ownerId: true, name: true } },
          },
        },
        scenes: {
          orderBy: { sceneNumber: "asc" },
        },
        consistencyChecks: {
          orderBy: { checkedAt: "desc" },
          take: 5,
        },
      },
    });

    if (!chapter) {
      throw new NotFoundException("Chapter not found");
    }

    if (chapter.volume.project.ownerId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    return chapter;
  }

  async updateChapter(id: string, userId: string, dto: UpdateChapterDto) {
    // Verify access
    await this.getChapter(id, userId);

    const updateData: any = { ...dto };

    // Update word count if content is provided
    if (dto.content) {
      updateData.wordCount = this.countWords(dto.content);
    }

    return this.prisma.writingChapter.update({
      where: { id },
      data: updateData,
    });
  }

  async startWriting(id: string, userId: string, dto: StartWritingDto) {
    const chapter = await this.getChapter(id, userId);

    // Update status to WRITING
    await this.prisma.writingChapter.update({
      where: { id },
      data: {
        status: "WRITING",
        writtenAt: new Date(),
      },
    });

    // Create a writing mission
    const mission = await this.prisma.writingMission.create({
      data: {
        projectId: chapter.volume.project.id,
        missionType: "CHAPTER",
        targetId: id,
        status: "IN_PROGRESS",
        startedAt: new Date(),
        contextPackage: {
          chapterId: id,
          outline: chapter.outline,
          additionalInstructions: dto.additionalInstructions,
          targetWordCount: dto.targetWordCount,
        },
      },
    });

    return {
      message: "Writing started",
      missionId: mission.id,
      chapterId: id,
    };
  }

  private async verifyVolumeAccess(volumeId: string, userId: string) {
    const volume = await this.prisma.writingVolume.findUnique({
      where: { id: volumeId },
      include: {
        project: { select: { ownerId: true } },
      },
    });

    if (!volume) {
      throw new NotFoundException("Volume not found");
    }

    if (volume.project.ownerId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    return volume;
  }

  private countWords(text: string): number {
    // Count Chinese characters and English words
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = text.replace(/[\u4e00-\u9fa5]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 0).length;
    return chineseChars + englishWords;
  }
}
