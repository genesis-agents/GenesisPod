import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { StoryBibleService } from "../bible/story-bible.service";

@Injectable()
export class ContextBuilderService {
  private readonly _logger = new Logger(ContextBuilderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storyBibleService: StoryBibleService,
  ) {}

  async buildWritingContext(chapterId: string, bibleSnapshot?: any) {
    const chapter = await this.prisma.writingChapter.findUnique({
      where: { id: chapterId },
      include: {
        volume: {
          include: {
            project: {
              include: { storyBible: true },
            },
          },
        },
      },
    });

    if (!chapter) {
      throw new Error("Chapter not found");
    }

    const bible = bibleSnapshot || await this.storyBibleService.getSnapshot(
      chapter.volume.project.id,
    );

    // Get previous chapters for context
    const previousChapters = await this.getPreviousChapterContext(
      chapter.volumeId,
      chapter.chapterNumber,
    );

    return {
      chapter: {
        id: chapter.id,
        title: chapter.title,
        outline: chapter.outline,
        chapterNumber: chapter.chapterNumber,
      },
      characters: bible.characters,
      worldSettings: bible.worldSettings,
      terminology: bible.terminologies,
      timeline: bible.timelineEvents,
      previousContext: previousChapters,
    };
  }

  async getPreviousChapterContext(volumeId: string, currentChapterNumber: number) {
    const previousChapters = await this.prisma.writingChapter.findMany({
      where: {
        volumeId,
        chapterNumber: { lt: currentChapterNumber },
        content: { not: null },
      },
      orderBy: { chapterNumber: "desc" },
      take: 3, // Get last 3 chapters for context
      select: {
        chapterNumber: true,
        title: true,
        content: true,
      },
    });

    // Create a summary of previous chapters
    return previousChapters.map((ch) => ({
      chapterNumber: ch.chapterNumber,
      title: ch.title,
      // Take last 500 chars as context
      context: ch.content?.slice(-500) || "",
    }));
  }

  formatWriterPrompt(context: any): string {
    const sections = [];

    sections.push(`## 章节任务\n标题：${context.chapter.title}\n大纲：${context.chapter.outline || "无"}`);

    if (context.characters?.length > 0) {
      sections.push(`## 本章涉及角色\n${this.formatCharacters(context.characters)}`);
    }

    if (context.worldSettings?.length > 0) {
      sections.push(`## 场景设定\n${this.formatWorldSettings(context.worldSettings)}`);
    }

    if (context.previousContext?.length > 0) {
      sections.push(`## 前情提要\n${this.formatPreviousContext(context.previousContext)}`);
    }

    return sections.join("\n\n");
  }

  private formatCharacters(characters: any[]): string {
    return characters.map((c) =>
      `### ${c.name}\n- 角色：${c.role}\n- 外貌：${JSON.stringify(c.appearance)}\n- 性格：${JSON.stringify(c.personality)}`
    ).join("\n\n");
  }

  private formatWorldSettings(settings: any[]): string {
    return settings.map((s) =>
      `### ${s.name} (${s.category})\n${s.description}`
    ).join("\n\n");
  }

  private formatPreviousContext(chapters: any[]): string {
    return chapters.map((ch) =>
      `第${ch.chapterNumber}章 ${ch.title}：${ch.context}...`
    ).join("\n\n");
  }
}
