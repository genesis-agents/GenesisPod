/**
 * Continue Story Executor
 *
 * Handles continuation of existing stories (filling in unwritten chapters).
 * Extracted from WritingMissionService.continueExistingStory() (L6551-7196).
 *
 * Flow:
 * 1. Identify unwritten chapters
 * 2. If all chapters written and target reached, return completion marker
 * 3. If story complete (detected by markers), return story complete marker
 * 4. If need more chapters, create placeholders
 * 5. For each unwritten chapter: generate content with quality constraints
 * 6. Apply narrative craft checks, opening quality for ch1
 * 7. Save chapter content, update Story Bible, emit events
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { ChatFacade } from "../../../../ai-engine/facade";
import { ProcessMemoryManagerService } from "@/modules/ai-harness/facade";
import { MemoryLayer } from "@prisma/client";
import { WriterAgent } from "../../agents";
import { WritingEventEmitterService } from "../events/writing-event-emitter.service";
import { WritingContextService } from "../mission/writing-context.service";
import { WritingTextProcessorService } from "../mission/writing-text-processor.service";
import { NarrativeCraftService } from "../quality/narrative-craft.service";
import { OpeningHookService } from "../quality/opening-hook.service";
import { WritingMissionLifecycleService } from "../mission/writing-mission-lifecycle.service";
import type {
  IWritingTaskExecutor,
  WritingTaskContext,
  WritingTaskResult,
  ExistingContentState,
} from "./task-executor.interface";
import type { WritingMissionType } from "../mission/writing-mission.types";
import { STORY_COMPLETION_MARKERS, WRITING_DEFAULTS } from "../config";

@Injectable()
export class ContinueStoryExecutor implements IWritingTaskExecutor {
  private readonly logger = new Logger(ContinueStoryExecutor.name);
  readonly taskType: WritingMissionType = "full_story";

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatFacade: ChatFacade,
    private readonly eventEmitter: WritingEventEmitterService,
    private readonly contextService: WritingContextService,
    private readonly textProcessor: WritingTextProcessorService,
    private readonly narrativeCraft: NarrativeCraftService,
    private readonly openingHook: OpeningHookService,
    private readonly lifecycleService: WritingMissionLifecycleService,
    @Optional() private readonly kernelMemory?: ProcessMemoryManagerService,
  ) {}

  /**
   * This executor is NOT registered in the executorMap directly.
   * Instead, FullStoryExecutor delegates to it when existing content is detected.
   */
  async execute(context: WritingTaskContext): Promise<WritingTaskResult> {
    const { missionId, input, modelId, project } = context;
    const existingContent = context.existingContent;

    if (!existingContent) {
      throw new Error(
        "ContinueStoryExecutor requires existingContent in context",
      );
    }

    const targetWordCount =
      input.targetWordCount ||
      project.targetWords ||
      WRITING_DEFAULTS.DEFAULT_TARGET_WORDS;

    return this.continueExistingStory(
      input.projectId,
      input.userPrompt,
      input.conversationHistory,
      modelId,
      missionId,
      existingContent,
      targetWordCount,
      context.kernelProcessId,
    );
  }

  /**
   * Continue existing story - only write unwritten chapters
   */
  private async continueExistingStory(
    projectId: string,
    userPrompt: string,
    _conversationHistory:
      | Array<{ role: "user" | "assistant"; content: string }>
      | undefined,
    modelId: string,
    missionId: string,
    existingContent: ExistingContentState,
    targetWordCount: number,
    kernelProcessId?: string,
  ): Promise<WritingTaskResult> {
    this.logger.log(
      `[${missionId}] Continuing story: ${existingContent.writtenChapters}/${existingContent.totalChapters} chapters written, ${existingContent.currentWords}/${targetWordCount} words`,
    );

    // Emit mission started
    await this.eventEmitter.emitMissionStarted(
      projectId,
      missionId,
      "full_story",
      targetWordCount,
    );

    // Quick completion of preparation/planning phases (already done)
    await this.eventEmitter.emitWorldBuilding(
      projectId,
      "completed",
      { skipCreation: true, reason: "continuation_mode" },
      missionId,
    );
    await this.eventEmitter.emitChapterStarted(
      projectId,
      1,
      "继续创作",
      0,
      missionId,
    );

    await this.lifecycleService.saveMissionLog(
      missionId,
      "mission:started",
      `继续创作任务开始，已有 ${existingContent.currentWords.toLocaleString()} 字，目标 ${targetWordCount.toLocaleString()} 字`,
    );

    // Get world settings
    let worldSettings: {
      world: { type?: string; theme?: string; premise?: string };
      characters: Array<{
        name: string;
        role?: string;
        background?: string;
        personality?: string;
      }>;
    } | null = null;

    if (existingContent.storyBible) {
      worldSettings = {
        world: {
          type: existingContent.storyBible.worldType,
          theme: existingContent.storyBible.theme,
          premise: existingContent.storyBible.premise,
        },
        characters: existingContent.storyBible.characters || [],
      };
    }

    // Story background (priority: storyBible.premise > projectDescription > userPrompt)
    const storyBackground =
      existingContent.storyBible?.premise ||
      existingContent.projectDescription ||
      userPrompt;

    this.logger.log(
      `[${missionId}] Story background source: ${existingContent.storyBible?.premise ? "storyBible.premise" : existingContent.projectDescription ? "projectDescription" : "input.userPrompt"}`,
    );

    // Get writer model
    const writerModel =
      (await this.lifecycleService.getModelForRole("writer")) || modelId;

    const allContent: string[] = [];
    let currentWordCount = existingContent.currentWords;
    const chaptersToWrite = [...existingContent.unwrittenChapters];

    // If no unwritten chapters
    if (chaptersToWrite.length === 0) {
      const result = await this.handleNoUnwrittenChapters(
        projectId,
        missionId,
        existingContent,
        currentWordCount,
        targetWordCount,
        chaptersToWrite,
      );
      if (result) return result;
    }

    // Write each chapter
    for (let i = 0; i < chaptersToWrite.length; i++) {
      const chapter = chaptersToWrite[i];

      // Check word count target
      if (currentWordCount >= targetWordCount) {
        this.logger.log(
          `[${missionId}] Target word count reached (${currentWordCount}/${targetWordCount}), stopping`,
        );
        await this.lifecycleService.saveMissionLog(
          missionId,
          "mission:info",
          `已达到目标字数 ${targetWordCount.toLocaleString()} 字`,
        );
        break;
      }

      const progress = Math.round(15 + (80 * (i + 1)) / chaptersToWrite.length);
      await this.lifecycleService.updateMissionProgress(
        missionId,
        progress,
        `作家正在创作第${chapter.chapterNumber}章「${chapter.title}」...`,
      );

      // Emit chapter started
      await this.eventEmitter.emitChapterStarted(
        projectId,
        chapter.chapterNumber,
        chapter.title,
        0,
        missionId,
      );

      // Get previous context
      const previousChapters = await this.prisma.writingChapter.findMany({
        where: {
          volume: { projectId },
          chapterNumber: { lt: chapter.chapterNumber },
          wordCount: { gt: 0 },
        },
        orderBy: { chapterNumber: "desc" },
        take: 2,
        select: { chapterNumber: true, title: true, content: true },
      });

      const previousSummary = previousChapters
        .reverse()
        .map(
          (ch) =>
            `第${ch.chapterNumber}章「${ch.title}」: ${ch.content?.slice(0, 300)}...`,
        )
        .join("\n\n");

      // Emit agent working
      await this.eventEmitter.emitAgentWorking(projectId, {
        agentId: "writer",
        agentName: "作家",
        agentRole: "writer",
        status: "working",
        taskDescription: `创作第${chapter.chapterNumber}章「${chapter.title}」`,
        progress,
      });

      // Build writer prompt
      const writerPrompt = `你正在继续创作一部小说，请创作第${chapter.chapterNumber}章「${chapter.title}」。

【故事背景】
${storyBackground}

${worldSettings ? `【世界观设定】\n${JSON.stringify(worldSettings, null, 2)}\n` : ""}

${previousSummary ? `【前文摘要】\n${previousSummary}\n` : "【开篇提示】\n这是故事的一个新章节。"}

【创作要求】
1. 字数约 3000 字
2. 语言流畅，富有文学性
3. 情节连贯，承接前文
4. 角色性格一致

请直接输出章节内容，以"第${this.textProcessor.numberToChinese(chapter.chapterNumber)}章 ${chapter.title}"开头。`;

      // Quality constraints
      const characters =
        (worldSettings?.characters as Array<{
          name: string;
          role?: string;
          background?: string;
        }>) || [];
      const qualityConstraints =
        await this.contextService.generateQualityConstraints(
          chapter.chapterNumber,
          chapter.title,
          characters,
          projectId,
        );

      const writerSystemPrompt = `你是专业的小说作家，擅长创作引人入胜的故事。

${WriterAgent.CORE_WRITING_PRINCIPLES}

${qualityConstraints ? `${qualityConstraints}\n` : ""}
请直接输出章节内容。`;

      const writerResponse = await this.chatFacade.chat({
        messages: [
          { role: "system", content: writerSystemPrompt },
          { role: "user", content: writerPrompt },
        ],
        model: writerModel,
        taskProfile: {
          creativity: "high",
          outputLength: "long",
        },
        processId: kernelProcessId,
      });

      let chapterContent = writerResponse.content || "";

      // Retry if too short
      if (chapterContent.length < 500) {
        this.logger.warn(
          `[${missionId}] Chapter content too short, retrying...`,
        );
        const retryResponse = await this.chatFacade.chat({
          messages: [
            {
              role: "system",
              content: `你是小说作家。请创作约3000字的章节内容。\n\n${WriterAgent.CORE_WRITING_PRINCIPLES}\n\n${qualityConstraints || ""}`,
            },
            {
              role: "user",
              content: `请创作"第${chapter.chapterNumber}章 ${chapter.title}"。${previousSummary ? `前文：${previousSummary.slice(0, 500)}` : ""}`,
            },
          ],
          model: writerModel,
          taskProfile: {
            creativity: "high",
            outputLength: "long",
          },
          processId: kernelProcessId,
        });
        chapterContent =
          retryResponse.content ||
          `第${this.textProcessor.numberToChinese(chapter.chapterNumber)}章 ${chapter.title}\n\n（创作中...）`;
      }

      // Chapter 1 opening quality check
      if (chapter.chapterNumber === 1) {
        chapterContent = await this.enhanceChapter1Opening(
          chapterContent,
          chapter,
          writerModel,
          missionId,
          kernelProcessId,
        );
      }

      // Narrative craft check
      chapterContent = await this.applyNarrativeCraftCheck(
        chapterContent,
        chapter.chapterNumber,
        missionId,
      );

      const chapterWordCount = this.textProcessor.countWords(chapterContent);

      // Extract title from generated content
      const extractedTitle = this.textProcessor.extractChapterTitle(
        chapterContent,
        chapter.chapterNumber,
      );

      // Save chapter
      await this.prisma.writingChapter.update({
        where: { id: chapter.id },
        data: {
          content: chapterContent,
          wordCount: chapterWordCount,
          title: extractedTitle,
          status: "FINAL",
        },
      });

      // Log and emit events
      await this.lifecycleService.saveMissionLog(
        missionId,
        "chapter:content",
        `第${chapter.chapterNumber}章「${extractedTitle}」完成 (${chapterWordCount} 字)`,
        {
          agentId: "writer",
          agentName: "作家",
          detail: {
            type: "chapter_content",
            data: chapterContent.slice(0, 300) + "...",
          },
        },
      );

      await this.eventEmitter.emitChapterCompleted(
        projectId,
        chapter.chapterNumber,
        chapterWordCount,
      );

      await this.eventEmitter.emitAgentWorking(projectId, {
        agentId: "writer",
        agentName: "作家",
        agentRole: "writer",
        status: "completed",
        taskDescription: `第${chapter.chapterNumber}章完成 (${chapterWordCount} 字)`,
      });

      allContent.push(chapterContent);
      currentWordCount += chapterWordCount;

      // Kernel Memory
      if (this.kernelMemory) {
        const processId = this.lifecycleService.getKernelProcessId(missionId);
        if (processId) {
          void this.kernelMemory
            .write({
              processId,
              layer: MemoryLayer.WORKING,
              key: `chapter-draft-${chapter.chapterNumber}`,
              value: {
                title: chapter.title,
                wordCount: chapterWordCount,
                preview: chapterContent.slice(0, 200),
              },
            })
            .catch((err) => this.logger.debug("Memory write failed", err));
        }
      }

      // Update project word count
      await this.updateProjectWordCount(projectId);

      this.logger.log(
        `[${missionId}] Chapter ${chapter.chapterNumber} done: ${chapterWordCount} words, total: ${currentWordCount}`,
      );
    }

    // Completion
    await this.lifecycleService.updateMissionProgress(
      missionId,
      100,
      "创作完成！",
    );
    await this.lifecycleService.saveMissionLog(
      missionId,
      "mission:completed",
      `创作完成！共完成 ${chaptersToWrite.length} 章，当前总字数 ${currentWordCount.toLocaleString()} 字`,
    );

    await this.eventEmitter.emitMissionCompleted(
      projectId,
      missionId,
      currentWordCount,
      chaptersToWrite.length,
      1,
    );

    // Kernel Memory: final summary
    if (this.kernelMemory) {
      const processId = this.lifecycleService.getKernelProcessId(missionId);
      if (processId) {
        void this.kernelMemory
          .write({
            processId,
            layer: MemoryLayer.SESSION,
            key: "final-content",
            value: {
              missionType: "full_story",
              totalWords: currentWordCount,
            },
          })
          .catch((err) => this.logger.debug("Memory write failed", err));
      }
    }

    return {
      content: `[CONTINUATION_COMPLETE] 续写完成 ${chaptersToWrite.length} 章，共 ${currentWordCount.toLocaleString()} 字。\n\n${allContent.join("\n\n---\n\n")}`,
      wordCount: currentWordCount,
      shouldPersist: false, // Content already saved per-chapter
      summary: `续写完成 ${chaptersToWrite.length} 章，共 ${currentWordCount.toLocaleString()} 字`,
    };
  }

  // ─── Helpers ───

  private async handleNoUnwrittenChapters(
    projectId: string,
    missionId: string,
    existingContent: ExistingContentState,
    currentWordCount: number,
    targetWordCount: number,
    chaptersToWrite: Array<{
      id: string;
      chapterNumber: number;
      title: string;
      volumeId: string;
    }>,
  ): Promise<WritingTaskResult | null> {
    // Already reached target
    if (currentWordCount >= targetWordCount) {
      await this.lifecycleService.saveMissionLog(
        missionId,
        "mission:complete",
        `所有章节已完成！共 ${currentWordCount.toLocaleString()} 字`,
      );
      return {
        content: `[ALL_CHAPTERS_COMPLETED] 所有 ${existingContent.totalChapters} 章节已完成，共 ${currentWordCount.toLocaleString()} 字。`,
        wordCount: currentWordCount,
        shouldPersist: false,
        summary: `所有 ${existingContent.totalChapters} 章节已完成`,
      };
    }

    // Check story completion markers
    const lastWrittenChapter = await this.prisma.writingChapter.findFirst({
      where: {
        volume: { projectId },
        content: { not: "" },
      },
      orderBy: { chapterNumber: "desc" },
      select: {
        content: true,
        title: true,
        outline: true,
        chapterNumber: true,
      },
    });

    const isStoryComplete =
      lastWrittenChapter &&
      STORY_COMPLETION_MARKERS.some(
        (marker) =>
          lastWrittenChapter.content?.includes(marker) ||
          lastWrittenChapter.title?.includes(marker) ||
          lastWrittenChapter.outline?.includes(marker),
      );

    if (isStoryComplete) {
      await this.lifecycleService.saveMissionLog(
        missionId,
        "mission:complete",
        `检测到故事已完结！共 ${existingContent.totalChapters} 章，${currentWordCount.toLocaleString()} 字。`,
      );
      return {
        content: `[STORY_COMPLETE] 故事已完结，共 ${existingContent.totalChapters} 章，${currentWordCount.toLocaleString()} 字。`,
        wordCount: currentWordCount,
        shouldPersist: false,
        summary: `故事已完结，共 ${existingContent.totalChapters} 章`,
      };
    }

    // Need more chapters - create placeholders
    const wordsPerChapter = WRITING_DEFAULTS.WORDS_PER_CHAPTER;
    const remainingWords = targetWordCount - currentWordCount;
    const newChaptersNeeded = Math.min(
      10,
      Math.ceil(remainingWords / wordsPerChapter),
    );

    const volume = await this.prisma.writingVolume.findFirst({
      where: { projectId },
      orderBy: { volumeNumber: "asc" },
      select: { id: true },
    });

    if (!volume) {
      return {
        content: `[ALL_CHAPTERS_COMPLETED] 所有章节已完成，共 ${currentWordCount.toLocaleString()} 字。`,
        wordCount: currentWordCount,
        shouldPersist: false,
        summary: `所有章节已完成（无卷可用）`,
      };
    }

    const startChapterNumber = existingContent.totalChapters + 1;
    for (let i = 0; i < newChaptersNeeded; i++) {
      const chapterNumber = startChapterNumber + i;
      const newChapter = await this.prisma.writingChapter.create({
        data: {
          volumeId: volume.id,
          title: "待续写",
          chapterNumber,
          content: "",
          wordCount: 0,
          status: "PLANNED",
        },
        select: {
          id: true,
          chapterNumber: true,
          title: true,
          volumeId: true,
        },
      });
      chaptersToWrite.push(newChapter);
    }

    this.logger.log(
      `[${missionId}] Created ${newChaptersNeeded} new chapters (${startChapterNumber}-${startChapterNumber + newChaptersNeeded - 1})`,
    );

    return null; // Continue with chapter writing loop
  }

  private async enhanceChapter1Opening(
    chapterContent: string,
    chapter: { chapterNumber: number; title: string },
    writerModel: string,
    missionId: string,
    kernelProcessId?: string,
  ): Promise<string> {
    const contentWithoutTitle = chapterContent
      .replace(/^第[一二三四五六七八九十百千万]+章.*?\n+/, "")
      .trim();
    const opening = contentWithoutTitle.slice(0, 300);
    const openingQuality = this.openingHook.analyzeOpeningQuality(opening);

    this.logger.log(
      `[${missionId}] Chapter 1 opening quality: score=${openingQuality.score}`,
    );

    const OPENING_QUALITY_THRESHOLD = 70;
    if (openingQuality.score >= OPENING_QUALITY_THRESHOLD) {
      return chapterContent;
    }

    this.logger.warn(
      `[${missionId}] Chapter 1 opening below threshold, rewriting...`,
    );

    const firstChapterGuidance = this.openingHook.generateOpeningConstraints(
      1,
      undefined,
    );

    try {
      const openingRewriteResponse = await this.chatFacade.chat({
        messages: [
          {
            role: "system",
            content: `你是专业的网文开篇优化专家。重写开篇使其具有强烈吸引力。

参考技巧：冲突对话式、感官沉浸式、极端困境式

禁止：用"在一个XX的世界里"开头、世界观介绍开头`,
          },
          {
            role: "user",
            content: `请重写以下开篇（前3-5段）：

【当前开篇】${opening}

【问题】${openingQuality.issues.join("、")}

【要求】${firstChapterGuidance}

只输出重写后的开篇。`,
          },
        ],
        model: writerModel,
        taskProfile: {
          creativity: "high",
          outputLength: "short",
        },
        processId: kernelProcessId,
      });

      if (
        openingRewriteResponse.content &&
        openingRewriteResponse.content.length > 100
      ) {
        const newOpening = openingRewriteResponse.content.trim();
        let openingEndIndex = 300;
        let count = 0;
        for (let i = 0; i < contentWithoutTitle.length && count < 3; i++) {
          if (/[。！？]/.test(contentWithoutTitle[i])) {
            count++;
            if (count === 3) {
              openingEndIndex = i + 1;
              break;
            }
          }
        }
        const restOfContent = contentWithoutTitle.slice(openingEndIndex);
        chapterContent = `第${this.textProcessor.numberToChinese(chapter.chapterNumber)}章 ${chapter.title}\n\n${newOpening}\n\n${restOfContent}`;
        this.logger.log(
          `[${missionId}] Chapter 1 opening rewritten successfully`,
        );
      }
    } catch (e) {
      this.logger.warn(
        `[${missionId}] Opening rewrite failed: ${(e as Error).message}`,
      );
    }

    return chapterContent;
  }

  private async applyNarrativeCraftCheck(
    chapterContent: string,
    chapterNumber: number,
    missionId: string,
  ): Promise<string> {
    const narrativeReport = this.narrativeCraft.analyzeContent(chapterContent);
    if (narrativeReport.passed) return chapterContent;

    this.logger.warn(
      `[${missionId}] Chapter ${chapterNumber} failed narrative craft check (score=${narrativeReport.score})`,
    );

    const hasEndingOrCliche = narrativeReport.issues.some(
      (i) =>
        i.type === "ending" ||
        i.category === "ai_writing_cliche" ||
        i.category === "excessive_psychology",
    );

    if (!hasEndingOrCliche) return chapterContent;

    const rewrittenContent = await this.narrativeCraft.rewriteEnding(
      chapterContent,
      narrativeReport.issues,
    );

    if (rewrittenContent !== chapterContent) {
      this.logger.log(
        `[${missionId}] Chapter ${chapterNumber} narrative issues fixed`,
      );
      return rewrittenContent;
    }

    return chapterContent;
  }

  private async updateProjectWordCount(projectId: string): Promise<void> {
    const result = await this.prisma.writingChapter.aggregate({
      where: { volume: { projectId } },
      _sum: { wordCount: true },
    });

    const totalWords = result._sum.wordCount || 0;

    await this.prisma.writingProject.update({
      where: { id: projectId },
      data: {
        currentWords: totalWords,
        status: totalWords > 0 ? "WRITING" : "PLANNING",
      },
    });
  }
}
