import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import {
  CreateChapterDto,
  UpdateChapterDto,
  StartWritingDto,
} from "../../dto/chapter.dto";
import {
  WritingMissionService,
  WritingMissionInput,
} from "../mission/writing-mission.service";
import type { MissionEvent } from "../../../../ai-engine/facade";

@Injectable()
export class ChapterWritingService {
  private readonly logger = new Logger(ChapterWritingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly writingMissionService: WritingMissionService,
  ) {}

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

    const updateData: Prisma.WritingChapterUpdateInput = { ...dto };

    // Update word count if content is provided
    if (dto.content) {
      updateData.wordCount = this.countWords(dto.content);
    }

    return this.prisma.writingChapter.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * 开始章节写作（使用 AI Teams Mission 机制）
   */
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

    // 构建写作任务输入
    const missionInput: WritingMissionInput = {
      projectId: chapter.volume.project.id,
      missionType: "chapter",
      chapterId: id,
      volumeId: chapter.volumeId,
      userPrompt:
        dto.additionalInstructions ||
        `请根据大纲写作第${chapter.chapterNumber}章：${chapter.title}`,
      targetWordCount: dto.targetWordCount || 3000,
      additionalInstructions: chapter.outline || undefined,
      parallelWriters: 1,
    };

    this.logger.log(`Starting AI writing mission for chapter ${id}`);

    // 返回任务启动信息（实际执行由 executeWritingStream 处理）
    return {
      message: "Writing mission prepared",
      chapterId: id,
      missionInput,
    };
  }

  /**
   * 执行写作任务（流式输出）
   */
  async *executeWritingStream(
    id: string,
    userId: string,
    missionInput: WritingMissionInput,
  ): AsyncGenerator<MissionEvent> {
    this.logger.log(`Executing writing mission for chapter ${id}`);

    // 执行写作任务
    const generator = this.writingMissionService.execute(missionInput, userId);

    for await (const event of generator) {
      yield event;

      // 如果是步骤完成事件，检查是否是写作步骤
      if (event.type === "step_completed" && event.data?.stepId === "write") {
        // 更新章节内容
        const output = event.data?.output as { output?: string };
        if (output?.output) {
          await this.prisma.writingChapter.update({
            where: { id },
            data: {
              content: output.output,
              wordCount: this.countWords(output.output),
              status: "DRAFT",
            },
          });
        }
      }

      // 如果任务完成
      if (event.type === "mission_completed") {
        await this.prisma.writingChapter.update({
          where: { id },
          data: {
            status: "CHECKING",
            revisedAt: new Date(),
          },
        });
      }

      // 如果任务失败
      if (event.type === "mission_failed") {
        await this.prisma.writingChapter.update({
          where: { id },
          data: {
            status: "DRAFT", // 回退到草稿状态
          },
        });
      }
    }
  }

  /**
   * 获取任务状态
   */
  async getMissionStatus(missionId: string, userId: string) {
    return this.writingMissionService.getMissionStatus(missionId, userId);
  }

  /**
   * 取消任务
   */
  async cancelMission(missionId: string, userId: string) {
    return this.writingMissionService.cancelMission(missionId, userId);
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
    const englishWords = text
      .replace(/[\u4e00-\u9fa5]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 0).length;
    return chineseChars + englishWords;
  }
}
