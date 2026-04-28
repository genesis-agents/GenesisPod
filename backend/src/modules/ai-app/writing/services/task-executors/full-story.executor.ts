/**
 * Full Story Executor
 *
 * Handles complete multi-chapter story generation.
 * This is the largest executor, extracted from WritingMissionService.generateFullStory().
 *
 * Flow:
 * Phase 1: Bible Keeper builds world (world-building prompt → LLM → parse JSON)
 * Phase 2: Story Architect creates outline (outline prompt → LLM → parse chapters)
 * Phase 3: Writer generates chapters iteratively (quality constraints → LLM → quality gate)
 * Phase 4: Update Story Bible after each chapter
 * Phase 5: Finalization
 *
 * For continuation mode (existing content detected), delegates to ContinueStoryExecutor.
 *
 * NOTE: During Phase 1-3 of the refactoring, this executor delegates to the
 * existing WritingMissionService.generateFullStory() to avoid duplicating the
 * complex 2,174-line method. Phase 4 will replace the delegation with the
 * extracted implementation.
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { ChatFacade, TeamFacade } from "../../../../ai-harness/facade";
import { WritingEventEmitterService } from "../events/writing-event-emitter.service";
import { WritingContextService } from "../mission/writing-context.service";
import { WritingJsonParserService } from "../mission/writing-json-parser.service";
import { WritingTextProcessorService } from "../mission/writing-text-processor.service";
import { ExpressionMemoryService } from "../quality/expression-memory.service";
// QualityGateService will be integrated via WritingQualityPipeline in Phase 4
import { NarrativeCraftService } from "../quality/narrative-craft.service";
import { OpeningHookService } from "../quality/opening-hook.service";
import { StyleTemplateService } from "../style/style-template.service";
import { WorldBuildingEnhancerService } from "../bible/world-building-enhancer.service";
// CheckpointService will be used in Phase 4 for checkpoint management
import { WritingMissionLifecycleService } from "../mission/writing-mission-lifecycle.service";
import { ContinueStoryExecutor } from "./continue-story.executor";
import { WriterAgent, BibleKeeperAgent } from "../../agents";
import {
  generateStylePrompt,
  recommendStyleByGenre,
} from "../../constants/writing-style-presets";
import type {
  IWritingTaskExecutor,
  WritingTaskContext,
  WritingTaskResult,
} from "./task-executor.interface";
import type { WritingMissionType } from "../mission/writing-mission.types";
import { WRITING_DEFAULTS } from "../config";

@Injectable()
export class FullStoryExecutor implements IWritingTaskExecutor {
  private readonly logger = new Logger(FullStoryExecutor.name);
  readonly taskType: WritingMissionType = "full_story";

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatFacade: ChatFacade,
    private readonly teamFacade: TeamFacade,
    private readonly eventEmitter: WritingEventEmitterService,
    private readonly contextService: WritingContextService,
    private readonly jsonParser: WritingJsonParserService,
    private readonly textProcessor: WritingTextProcessorService,
    private readonly expressionMemory: ExpressionMemoryService,
    private readonly narrativeCraft: NarrativeCraftService,
    private readonly openingHook: OpeningHookService,
    private readonly styleTemplateService: StyleTemplateService,
    private readonly worldBuildingEnhancer: WorldBuildingEnhancerService,
    private readonly lifecycleService: WritingMissionLifecycleService,
    private readonly continueStoryExecutor: ContinueStoryExecutor,
    private readonly bibleKeeper: BibleKeeperAgent,
  ) {}

  async execute(context: WritingTaskContext): Promise<WritingTaskResult> {
    const { missionId, input, modelId, project } = context;

    const targetWordCount =
      input.targetWordCount ||
      project.targetWords ||
      WRITING_DEFAULTS.DEFAULT_TARGET_WORDS;
    const wordsPerChapter = WRITING_DEFAULTS.WORDS_PER_CHAPTER;
    const chaptersPerVolume = WRITING_DEFAULTS.CHAPTERS_PER_VOLUME;

    // Validate prompt
    const effectiveUserPrompt =
      input.userPrompt?.trim() || project.description?.trim() || project.name;

    if (
      !effectiveUserPrompt ||
      effectiveUserPrompt.length < WRITING_DEFAULTS.MIN_USER_PROMPT_LENGTH
    ) {
      throw new Error(
        `Invalid user prompt: "${effectiveUserPrompt}" (length: ${effectiveUserPrompt?.length || 0}). Minimum required: ${WRITING_DEFAULTS.MIN_USER_PROMPT_LENGTH} chars`,
      );
    }

    // Check for existing content (continuation mode)
    const existingContent = await this.checkExistingContent(input.projectId);
    if (existingContent.hasContent && existingContent.currentWords > 0) {
      this.logger.log(
        `[${missionId}] Project has existing content (${existingContent.currentWords} words), using continuation mode`,
      );
      return this.continueStoryExecutor.execute({
        ...context,
        existingContent,
      });
    }

    const totalChapters = Math.max(
      WRITING_DEFAULTS.MIN_CHAPTERS,
      Math.ceil(targetWordCount / wordsPerChapter),
    );
    const totalVolumes = Math.max(
      1,
      Math.ceil(totalChapters / chaptersPerVolume),
    );

    this.logger.log(
      `[${missionId}] Starting long novel generation: ${totalVolumes} volumes, ${totalChapters} chapters, target ${targetWordCount} words`,
    );

    // Emit mission started
    await this.eventEmitter.emitMissionStarted(
      input.projectId,
      missionId,
      "full_story",
      targetWordCount,
    );
    await this.lifecycleService.saveMissionLog(
      missionId,
      "mission:started",
      "任务开始执行，AI 团队正在协作...",
    );

    // ==================== Phase 1: World Building ====================
    await this.lifecycleService.updateMissionProgress(
      missionId,
      5,
      "设定守护者正在建立世界观...",
    );

    this.teamFacade.missionOrchestrator?.updateState(missionId, {
      phase: "executing",
      currentSteps: ["world-building"],
      completedSteps: [],
      progress: 5,
    });

    await this.eventEmitter.emitAgentWorking(input.projectId, {
      agentId: "bible-keeper",
      agentName: "设定守护者",
      agentRole: "keeper",
      status: "working",
      taskDescription: "建立世界观和角色设定",
    });

    await this.eventEmitter.emitWorldBuilding(input.projectId, "started");

    const keeperModel =
      (await this.lifecycleService.getModelForRole("bible-keeper")) || modelId;

    // Historical knowledge enhancement
    const worldEnhancement =
      this.worldBuildingEnhancer.enhanceWorldBuildingPrompt(
        effectiveUserPrompt,
      );

    const storyCreativitySection = worldEnhancement.detectedEra
      ? worldEnhancement.enhancedPrompt
      : `【故事创意】\n${effectiveUserPrompt}`;

    const worldBuildingPrompt = this.buildWorldBuildingPrompt(
      storyCreativitySection,
      targetWordCount,
      totalVolumes,
      totalChapters,
    );

    // World building with heartbeat
    let worldSettings: Record<string, unknown> = {};
    let worldHeartbeatCount = 0;
    const worldHeartbeatInterval = setInterval(() => {
      worldHeartbeatCount++;
      this.logger.log(
        `[${missionId}] Heartbeat: world building in progress... (${worldHeartbeatCount * 30}s elapsed)`,
      );
      // Must keep incrementing — frontend detects "stuck" if progress unchanged for 3 min
      const heartbeatProgress = Math.min(5 + worldHeartbeatCount, 95);
      void this.lifecycleService.updateMissionProgress(
        missionId,
        heartbeatProgress,
        `设定守护者正在建立世界观... (${worldHeartbeatCount * 30}s)`,
      );
    }, WRITING_DEFAULTS.HEARTBEAT_INTERVAL);

    try {
      const worldResponse = await this.chatFacade.chat({
        messages: [
          {
            role: "system",
            content:
              this.bibleKeeper.description +
              "\n\n你是专业的设定守护者，负责建立和维护世界观一致性。请以 JSON 格式输出。",
          },
          { role: "user", content: worldBuildingPrompt },
        ],
        model: keeperModel,
        taskProfile: {
          creativity: "medium",
          outputLength: "medium",
        },
        strictMode: true,
        processId: context.kernelProcessId,
      });

      clearInterval(worldHeartbeatInterval);
      worldSettings = this.jsonParser.parseWorldSettings(
        worldResponse.content || "{}",
      );
    } catch (error) {
      clearInterval(worldHeartbeatInterval);
      this.logger.error(
        `[${missionId}] World building failed: ${(error as Error).message}`,
      );
      worldSettings = {
        core: {
          summary: effectiveUserPrompt.slice(0, 100),
          genre: "通用",
          theme: "待定",
        },
        characters: [],
        world: {},
      };
    }

    const charactersArray = worldSettings.characters as
      | Array<unknown>
      | undefined;
    const worldCore = worldSettings.core as
      | { summary?: string; genre?: string; theme?: string; tone?: string }
      | undefined;

    await this.eventEmitter.emitAgentWorking(input.projectId, {
      agentId: "bible-keeper",
      agentName: "设定守护者",
      agentRole: "keeper",
      status: "completed",
      taskDescription: `已建立 ${charactersArray?.length || 0} 个角色设定`,
    });
    await this.eventEmitter.emitWorldBuilding(
      input.projectId,
      "completed",
      worldSettings,
      missionId,
    );

    // Save world to DB
    await this.saveWorldToDatabase(
      input.projectId,
      missionId,
      effectiveUserPrompt,
      worldSettings,
    );

    // ==================== Phase 2: Outline Planning ====================
    await this.lifecycleService.updateMissionProgress(
      missionId,
      10,
      "故事架构师正在基于世界观规划章节...",
    );

    await this.eventEmitter.emitAgentWorking(input.projectId, {
      agentId: "story-architect",
      agentName: "故事架构师",
      agentRole: "architect",
      status: "working",
      taskDescription: "基于世界观规划故事结构和章节大纲",
    });

    const architectModel =
      (await this.lifecycleService.getModelForRole("story-architect")) ||
      modelId;

    // Outline heartbeat to prevent frontend stuck detection
    let outlineHeartbeatCount = 0;
    const outlineHeartbeatInterval = setInterval(() => {
      outlineHeartbeatCount++;
      const p = Math.min(10 + outlineHeartbeatCount, 95);
      void this.lifecycleService.updateMissionProgress(
        missionId,
        p,
        `故事架构师正在规划章节... (${outlineHeartbeatCount * 30}s)`,
      );
    }, WRITING_DEFAULTS.HEARTBEAT_INTERVAL);

    let outlineResult;
    try {
      outlineResult = await this.generateOutline(
        missionId,
        input.projectId,
        effectiveUserPrompt,
        worldSettings,
        totalVolumes,
        totalChapters,
        architectModel,
        context.kernelProcessId,
      );
    } finally {
      clearInterval(outlineHeartbeatInterval);
    }

    // Create outline structure in DB
    if (outlineResult.chapters.length > 0) {
      await this.createOutlineStructure(input.projectId, outlineResult);
    }

    // Update project name with generated book title
    if (outlineResult.bookTitle) {
      await this.prisma.writingProject.update({
        where: { id: input.projectId },
        data: { name: outlineResult.bookTitle },
      });
      this.logger.log(
        `[${missionId}] Project name updated to: ${outlineResult.bookTitle}`,
      );
    }

    await this.eventEmitter.emitAgentWorking(input.projectId, {
      agentId: "story-architect",
      agentName: "故事架构师",
      agentRole: "architect",
      status: "completed",
      taskDescription: `已规划 ${outlineResult.chapters.length} 章`,
    });

    // ==================== Phase 3: Chapter Writing ====================
    const writerModel =
      (await this.lifecycleService.getModelForRole("writer")) || modelId;

    const styleId =
      recommendStyleByGenre(worldCore?.genre || "")[0] || "modern_realistic";
    const templateStylePrompt = await this.getTemplateStylePrompt(
      input.projectId,
    );

    let totalWordCount = 0;
    const allContent: string[] = [];

    for (let i = 0; i < outlineResult.chapters.length; i++) {
      const chapter = outlineResult.chapters[i];
      const progress = Math.round(
        15 + (70 * (i + 1)) / outlineResult.chapters.length,
      );

      await this.lifecycleService.updateMissionProgress(
        missionId,
        progress,
        `作家正在创作第${chapter.chapterNumber}章...`,
      );

      await this.eventEmitter.emitChapterStarted(
        input.projectId,
        chapter.chapterNumber,
        chapter.title,
        0,
        missionId,
      );

      await this.eventEmitter.emitAgentWorking(input.projectId, {
        agentId: "writer",
        agentName: "作家",
        agentRole: "writer",
        status: "working",
        taskDescription: `创作第${chapter.chapterNumber}章「${chapter.title}」`,
        progress,
      });

      // Build chapter prompt
      const previousSummary =
        allContent.length > 0
          ? allContent
              .slice(-2)
              .map((c) => c.slice(0, 300) + "...")
              .join("\n\n")
          : "";

      const qualityConstraints =
        await this.contextService.generateQualityConstraints(
          chapter.chapterNumber,
          chapter.plot || chapter.title,
          (charactersArray || []).map((c) => {
            const ch = c as Record<string, unknown>;
            return {
              name: String(ch.name || ""),
              role: String(ch.role || ""),
              background: String(ch.background || ""),
            };
          }),
          input.projectId,
        );

      const avoidancePrompt =
        await this.expressionMemory.generateAvoidancePrompt(
          input.projectId,
          chapter.chapterNumber,
        );

      const chapterPrompt = this.buildChapterWriterPrompt(
        chapter.chapterNumber,
        chapter,
        outlineResult.core,
        worldSettings,
        previousSummary,
        effectiveUserPrompt,
        styleId,
        avoidancePrompt,
        templateStylePrompt,
        input.targetWordCount,
      );

      const writerSystemPrompt = `${WriterAgent.CORE_WRITING_PRINCIPLES}

${qualityConstraints ? `${qualityConstraints}\n` : ""}
请直接输出章节内容。`;

      // Writer LLM call
      const writerResponse = await this.chatFacade.chat({
        messages: [
          { role: "system", content: writerSystemPrompt },
          { role: "user", content: chapterPrompt },
        ],
        model: writerModel,
        taskProfile: {
          creativity: "high",
          outputLength: "long",
        },
        processId: context.kernelProcessId,
      });

      let chapterContent = writerResponse.content || "";

      if (chapterContent.length < 500) {
        this.logger.warn(
          `[${missionId}] Chapter content too short, retrying...`,
        );
        const retryResponse = await this.chatFacade.chat({
          messages: [
            {
              role: "system",
              content: `你是小说作家。请创作约3000字的章节内容。\n\n${WriterAgent.CORE_WRITING_PRINCIPLES}`,
            },
            {
              role: "user",
              content: `请创作"第${chapter.chapterNumber}章 ${chapter.title}"。${previousSummary ? `前文：${previousSummary.slice(0, 500)}` : ""}`,
            },
          ],
          model: writerModel,
          taskProfile: { creativity: "high", outputLength: "long" },
          processId: context.kernelProcessId,
        });
        chapterContent =
          retryResponse.content ||
          `第${this.textProcessor.numberToChinese(chapter.chapterNumber)}章 ${chapter.title}\n\n（创作中...）`;
      }

      // Quality: Opening hook for chapter 1
      if (chapter.chapterNumber === 1) {
        chapterContent = await this.enhanceChapter1Opening(
          chapterContent,
          chapter,
          writerModel,
          missionId,
          context.kernelProcessId,
        );
      }

      // Quality: Narrative craft check
      const narrativeReport =
        this.narrativeCraft.analyzeContent(chapterContent);
      if (!narrativeReport.passed) {
        const hasEndingOrCliche = narrativeReport.issues.some(
          (issue) =>
            issue.type === "ending" ||
            issue.category === "ai_writing_cliche" ||
            issue.category === "excessive_psychology",
        );
        if (hasEndingOrCliche) {
          const rewritten = await this.narrativeCraft.rewriteEnding(
            chapterContent,
            narrativeReport.issues,
          );
          if (rewritten !== chapterContent) chapterContent = rewritten;
        }
      }

      const chapterWordCount = this.textProcessor.countWords(chapterContent);

      // Extract title
      const extractedTitle = this.textProcessor.extractChapterTitle(
        chapterContent,
        chapter.chapterNumber,
      );

      // Save chapter to DB
      const dbChapters = await this.prisma.writingChapter.findMany({
        where: {
          volume: { projectId: input.projectId },
          chapterNumber: chapter.chapterNumber,
        },
        select: { id: true },
      });

      if (dbChapters.length > 0) {
        await this.prisma.writingChapter.update({
          where: { id: dbChapters[0].id },
          data: {
            content: chapterContent,
            wordCount: chapterWordCount,
            title: extractedTitle,
            status: "FINAL",
          },
        });
      }

      // Expression memory: record usage
      await this.expressionMemory.analyzeExpressionsOnly(
        input.projectId,
        chapterContent,
      );

      // Story Bible: progressive update after each chapter
      await this.updateStoryBibleAfterChapter(
        input.projectId,
        missionId,
        chapter.chapterNumber,
        chapterContent,
        worldSettings,
        writerModel,
        context.kernelProcessId,
      );

      // Generate AI chapter summary for next chapter context
      const aiSummary = await this.generateChapterSummaryWithAI(
        chapterContent,
        chapter.chapterNumber,
        chapter.title,
        writerModel,
        context.kernelProcessId,
      );
      if (aiSummary && dbChapters.length > 0) {
        await this.prisma.writingChapter.update({
          where: { id: dbChapters[0].id },
          data: { metadata: { aiSummary } },
        });
      }

      // Events
      await this.eventEmitter.emitChapterCompleted(
        input.projectId,
        chapter.chapterNumber,
        chapterWordCount,
      );

      await this.eventEmitter.emitAgentWorking(input.projectId, {
        agentId: "writer",
        agentName: "作家",
        agentRole: "writer",
        status: "completed",
        taskDescription: `第${chapter.chapterNumber}章完成 (${chapterWordCount} 字)`,
      });

      await this.lifecycleService.saveMissionLog(
        missionId,
        "chapter:content",
        `第${chapter.chapterNumber}章「${extractedTitle}」完成 (${chapterWordCount} 字)`,
        { agentId: "writer", agentName: "作家" },
      );

      allContent.push(chapterContent);
      totalWordCount += chapterWordCount;

      // Update project word count
      await this.updateProjectWordCount(input.projectId);
    }

    // ==================== Completion ====================
    await this.lifecycleService.updateMissionProgress(
      missionId,
      100,
      "创作完成！",
    );
    await this.lifecycleService.saveMissionLog(
      missionId,
      "mission:completed",
      `创作完成！共完成 ${outlineResult.chapters.length} 章，${totalWordCount.toLocaleString()} 字`,
    );

    await this.eventEmitter.emitMissionCompleted(
      input.projectId,
      missionId,
      totalWordCount,
      outlineResult.chapters.length,
      Math.ceil(outlineResult.chapters.length / chaptersPerVolume),
    );

    return {
      content: allContent.join("\n\n---\n\n"),
      wordCount: totalWordCount,
      shouldPersist: false, // Already saved per-chapter
      summary: `成功生成 ${outlineResult.chapters.length} 章，共 ${totalWordCount.toLocaleString()} 字`,
    };
  }

  // ─── Private Helpers ───

  private buildWorldBuildingPrompt(
    storyCreativitySection: string,
    targetWordCount: number,
    totalVolumes: number,
    totalChapters: number,
  ): string {
    return `作为设定守护者，请根据以下故事创意独立建立完整的世界观设定。

【重要】世界观是故事的"游戏规则"，后续的章节大纲和内容创作都必须遵守这些规则。

${storyCreativitySection}

【规模信息】
- 目标字数：约 ${targetWordCount.toLocaleString()} 字
- 预计分卷：${totalVolumes} 卷
- 预计章节：${totalChapters} 章

请建立以下设定（JSON 格式）：
{
  "core": { "summary": "一句话概括", "genre": "类型", "theme": "主题", "tone": "基调" },
  "world": { "type": "世界类型", "era": "时代", "geography": "地理", "society": "社会", "rules": ["规则"] },
  "characters": [{ "name": "名", "role": "protagonist/antagonist/supporting", "appearance": "外貌", "personality": ["性格"], "background": "背景", "motivation": "动机", "arc": "弧" }],
  "factions": [{ "name": "势力", "description": "描述", "relations": "关系" }],
  "terminology": [{ "term": "术语", "definition": "定义" }]
}

【要求】
1. 世界观设定要自洽、有内在逻辑
2. 角色设定要立体、有成长空间
3. 至少创建 3 个主要角色和 2 个势力`;
  }

  private async generateOutline(
    _missionId: string,
    _projectId: string,
    userPrompt: string,
    worldSettings: Record<string, unknown>,
    totalVolumes: number,
    totalChapters: number,
    modelId: string,
    kernelProcessId?: string,
  ): Promise<{
    bookTitle: string;
    core: { summary: string; genre: string; theme: string };
    volumes: Array<{
      title: string;
      conflict: string;
      plot: string;
      emotion: string;
    }>;
    chapters: Array<{
      chapterNumber: number;
      volumeIndex: number;
      title: string;
      plot: string;
      keyPoint: string;
    }>;
  }> {
    const worldCore = worldSettings.core as Record<string, string> | undefined;
    const charactersArray = worldSettings.characters as
      | Array<unknown>
      | undefined;

    const worldSummary = {
      core: worldCore,
      world: worldSettings.world,
      characters: (charactersArray || []).slice(0, 5).map((c) => {
        const char = c as Record<string, unknown>;
        return {
          name: char.name,
          role: char.role,
          motivation: char.motivation,
        };
      }),
    };

    const outlinePrompt = `作为故事架构师，请基于已建立的世界观，设计详细的章节大纲。

【世界观摘要】
${JSON.stringify(worldSummary, null, 2)}

【故事主题】${userPrompt}

【规模要求】
- ${totalVolumes} 卷，${totalChapters} 章
- 每章约 3000 字

请输出 JSON：
{
  "bookTitle": "书名（4-10字，不加书名号）",
  "core": { "summary": "故事概要", "genre": "类型", "theme": "主题" },
  "volumes": [{ "title": "卷名", "conflict": "矛盾", "plot": "情节", "emotion": "情感" }],
  "chapters": [{ "volumeIndex": 0, "title": "章名", "plot": "情节要点", "keyPoint": "转折点" }]
}`;

    try {
      const outlineResponse = await this.chatFacade.chat({
        messages: [
          {
            role: "system",
            content:
              "你是故事架构师，擅长设计引人入胜的故事结构。请以 JSON 格式输出。",
          },
          { role: "user", content: outlinePrompt },
        ],
        model: modelId,
        taskProfile: {
          creativity: "medium",
          outputLength: "medium",
        },
        processId: kernelProcessId,
      });

      const parsed = this.jsonParser.parseOutlineJSON(
        outlineResponse.content || "{}",
        totalVolumes,
        totalChapters,
      );

      // Add chapter numbers
      const chapters = (parsed.chapters || []).map(
        (ch: Record<string, unknown>, idx: number) => ({
          chapterNumber: idx + 1,
          volumeIndex: (ch.volumeIndex as number) || 0,
          title: String(ch.title || `第${idx + 1}章`),
          plot: String(ch.plot || ""),
          keyPoint: String(ch.keyPoint || ""),
        }),
      );

      return {
        bookTitle: parsed.bookTitle || "",
        core: (parsed.core as {
          summary: string;
          genre: string;
          theme: string;
        }) || {
          summary: userPrompt.slice(0, 100),
          genre: "通用",
          theme: "待定",
        },
        volumes: (parsed.volumes as Array<{
          title: string;
          conflict: string;
          plot: string;
          emotion: string;
        }>) || [{ title: "第一卷", conflict: "", plot: "", emotion: "" }],
        chapters,
      };
    } catch (error) {
      this.logger.error(
        `Outline generation failed: ${(error as Error).message}`,
      );
      // Generate minimal default outline
      const chapters = Array.from(
        { length: Math.min(totalChapters, 10) },
        (_, i) => ({
          chapterNumber: i + 1,
          volumeIndex: 0,
          title: `第${i + 1}章`,
          plot: "",
          keyPoint: "",
        }),
      );
      return {
        bookTitle: "",
        core: {
          summary: userPrompt.slice(0, 100),
          genre: "通用",
          theme: "待定",
        },
        volumes: [{ title: "第一卷", conflict: "", plot: "", emotion: "" }],
        chapters,
      };
    }
  }

  private async createOutlineStructure(
    projectId: string,
    outline: {
      core: { summary: string; genre: string; theme: string };
      volumes: Array<{ title: string }>;
      chapters: Array<{
        volumeIndex: number;
        title: string;
        plot: string;
        chapterNumber: number;
      }>;
    },
  ): Promise<void> {
    // Delete existing volumes/chapters
    const existingVolumes = await this.prisma.writingVolume.findMany({
      where: { projectId },
      select: { id: true },
    });
    if (existingVolumes.length > 0) {
      await this.prisma.writingChapter.deleteMany({
        where: { volumeId: { in: existingVolumes.map((v) => v.id) } },
      });
      await this.prisma.writingVolume.deleteMany({
        where: { projectId },
      });
    }

    // Create volumes
    const volumeMap = new Map<number, string>();
    for (let i = 0; i < outline.volumes.length; i++) {
      const vol = outline.volumes[i];
      const volume = await this.prisma.writingVolume.create({
        data: {
          projectId,
          title:
            vol.title || `第${this.textProcessor.numberToChinese(i + 1)}卷`,
          volumeNumber: i + 1,
        },
      });
      volumeMap.set(i, volume.id);
    }

    if (volumeMap.size === 0) {
      const defaultVolume = await this.prisma.writingVolume.create({
        data: { projectId, title: "第一卷", volumeNumber: 1 },
      });
      volumeMap.set(0, defaultVolume.id);
    }

    // Create chapters (with outlines, empty content)
    for (const ch of outline.chapters) {
      const volumeId = volumeMap.get(ch.volumeIndex) || volumeMap.get(0)!;
      let cleanTitle = (ch.title || "")
        .replace(/^第[一二三四五六七八九十百千\d]+[章回][：:\s]*/i, "")
        .replace(/^#{1,6}\s*/, "")
        .trim();
      if (!cleanTitle) cleanTitle = `第${ch.chapterNumber}章`;

      await this.prisma.writingChapter.create({
        data: {
          volumeId,
          title: cleanTitle,
          chapterNumber: ch.chapterNumber,
          outline: ch.plot || "",
          content: "",
          wordCount: 0,
          status: "PLANNED",
        },
      });
    }
  }

  private buildChapterWriterPrompt(
    chapterNumber: number,
    chapterInfo: { title: string; plot: string; keyPoint: string },
    core: { summary?: string; genre?: string; theme?: string },
    worldSettings: Record<string, unknown>,
    previousSummary: string,
    userPrompt: string,
    styleId: string,
    avoidancePrompt: string,
    templateStylePrompt: string | undefined,
    targetWordCount?: number,
  ): string {
    const characters =
      (worldSettings.characters as Array<{
        name: string;
        role?: string;
        personality?: string[];
        motivation?: string;
      }>) || [];

    const characterInfo = characters
      .slice(0, 5)
      .map((c) => {
        const parts = [`**${c.name}**`];
        if (c.role)
          parts.push(
            `[${c.role === "protagonist" ? "主角" : c.role === "antagonist" ? "反派" : "配角"}]`,
          );
        if (c.personality?.length)
          parts.push(`性格：${c.personality.join("、")}`);
        if (c.motivation) parts.push(`动机：${c.motivation}`);
        return parts.join(" | ");
      })
      .join("\n");

    let stylePrompt: string;
    if (templateStylePrompt) {
      stylePrompt = templateStylePrompt;
    } else {
      stylePrompt = generateStylePrompt(styleId);
    }

    return `【创作任务】第${this.textProcessor.numberToChinese(chapterNumber)}章 ${chapterInfo.title}

【故事主题】${userPrompt}
【故事类型】${core.genre || "通用"}
【主题思想】${core.theme || "待定"}
${stylePrompt}
【本章情节要点】
${chapterInfo.plot}
${chapterInfo.keyPoint ? `关键转折：${chapterInfo.keyPoint}` : ""}

【主要角色】
${characterInfo || "待定"}

${previousSummary ? `【前文摘要】\n${previousSummary}\n` : "【开篇说明】这是故事的开始。\n"}
${avoidancePrompt ? `【表达约束】\n${avoidancePrompt}\n` : ""}
【创作要求】
1. 字数：本章必须达到 ${targetWordCount ? targetWordCount : 2500} 字以上
2. 语言流畅自然，富有文学性
3. 人物对话生动，符合角色性格
4. 场景描写细腻有画面感
5. 严禁总结式结尾

请直接输出章节内容，以"第${this.textProcessor.numberToChinese(chapterNumber)}章 ${chapterInfo.title}"开头：`;
  }

  private async enhanceChapter1Opening(
    chapterContent: string,
    chapter: { chapterNumber: number; title: string },
    writerModel: string,
    _missionId: string,
    kernelProcessId?: string,
  ): Promise<string> {
    const contentWithoutTitle = chapterContent
      .replace(/^第[一二三四五六七八九十百千万]+章.*?\n+/, "")
      .trim();
    const opening = contentWithoutTitle.slice(0, 300);
    const openingQuality = this.openingHook.analyzeOpeningQuality(opening);

    if (openingQuality.score >= 70) return chapterContent;

    try {
      const guidance = this.openingHook.generateOpeningConstraints(
        1,
        undefined,
      );
      const response = await this.chatFacade.chat({
        messages: [
          {
            role: "system",
            content:
              '你是专业的网文开篇优化专家。重写开篇使其具有强烈吸引力。禁止用"在一个XX的世界里"开头。',
          },
          {
            role: "user",
            content: `请重写以下开篇：\n\n${opening}\n\n问题：${openingQuality.issues.join("、")}\n\n要求：${guidance}\n\n只输出重写后的开篇。`,
          },
        ],
        model: writerModel,
        taskProfile: { creativity: "high", outputLength: "short" },
        processId: kernelProcessId,
      });

      if (response.content && response.content.length > 100) {
        const newOpening = response.content.trim();
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
        return `第${this.textProcessor.numberToChinese(chapter.chapterNumber)}章 ${chapter.title}\n\n${newOpening}\n\n${restOfContent}`;
      }
    } catch (e) {
      this.logger.warn(`Opening rewrite failed: ${(e as Error).message}`);
    }

    return chapterContent;
  }

  private async checkExistingContent(projectId: string) {
    const project = await this.prisma.writingProject.findUnique({
      where: { id: projectId },
      select: { currentWords: true, description: true },
    });

    const chapters = await this.prisma.writingChapter.findMany({
      where: { volume: { projectId } },
      orderBy: { chapterNumber: "asc" },
      select: {
        id: true,
        chapterNumber: true,
        title: true,
        content: true,
        wordCount: true,
        volumeId: true,
      },
    });

    const unwrittenChapters = chapters.filter(
      (ch) =>
        !ch.content ||
        ch.content.includes("AI 写作团队正在创作中") ||
        ch.content.includes("内容生成中"),
    );

    const storyBible = await this.prisma.storyBible.findUnique({
      where: { projectId },
      include: {
        characters: {
          select: {
            name: true,
            role: true,
            background: true,
            personality: true,
          },
        },
      },
    });

    return {
      hasContent: chapters.length > 0 && (project?.currentWords || 0) > 0,
      currentWords: project?.currentWords || 0,
      totalChapters: chapters.length,
      writtenChapters: chapters.length - unwrittenChapters.length,
      unwrittenChapters: unwrittenChapters.map((ch) => ({
        id: ch.id,
        chapterNumber: ch.chapterNumber,
        title: ch.title,
        volumeId: ch.volumeId,
      })),
      storyBible: storyBible
        ? {
            worldType: storyBible.worldType ?? undefined,
            theme: storyBible.theme ?? undefined,
            premise: storyBible.premise ?? undefined,
            characters: storyBible.characters.map((ch) => ({
              name: ch.name,
              role: String(ch.role) ?? undefined,
              background: ch.background ?? undefined,
              personality: String(ch.personality) ?? undefined,
            })),
          }
        : null,
      projectDescription: project?.description || null,
    };
  }

  private async saveWorldToDatabase(
    projectId: string,
    missionId: string,
    effectiveUserPrompt: string,
    worldSettings: Record<string, unknown>,
  ): Promise<void> {
    const worldInfo = worldSettings.world as
      | {
          type?: string;
          era?: string;
          geography?: string;
          society?: string;
          rules?: string[];
        }
      | undefined;

    const worldCore = worldSettings.core as
      | {
          theme?: string;
          tone?: string;
        }
      | undefined;

    const charactersArray = worldSettings.characters as
      | Array<unknown>
      | undefined;

    const briefStr = (val: unknown): string => {
      if (!val) return "";
      if (typeof val === "string") return val;
      if (Array.isArray(val))
        return val.filter((v) => typeof v === "string").join("；");
      if (typeof val === "object") {
        return (
          Object.values(val as Record<string, unknown>)
            .filter((v) => typeof v === "string")
            .join("；") || JSON.stringify(val)
        );
      }
      return String(val);
    };

    const worldDescription = worldInfo
      ? [
          worldInfo.type && `类型: ${briefStr(worldInfo.type)}`,
          worldInfo.era && `时代: ${briefStr(worldInfo.era)}`,
          worldInfo.geography && `地理: ${briefStr(worldInfo.geography)}`,
          worldInfo.society && `社会: ${briefStr(worldInfo.society)}`,
        ]
          .filter(Boolean)
          .join("\n")
      : "";

    try {
      await this.prisma.$transaction(async (tx) => {
        const bible = await tx.storyBible.upsert({
          where: { projectId },
          create: {
            projectId,
            premise: `${effectiveUserPrompt}\n\n${worldDescription}`,
            theme: worldCore?.theme || "",
            tone: worldCore?.tone || "",
            worldType: worldInfo?.type || "现代",
            version: 1,
            lastSyncAt: new Date(),
          },
          update: {
            premise: `${effectiveUserPrompt}\n\n${worldDescription}`,
            theme: worldCore?.theme || "",
            tone: worldCore?.tone || "",
            worldType: worldInfo?.type || "现代",
            version: { increment: 1 },
            lastSyncAt: new Date(),
          },
        });

        // Sync characters
        if (charactersArray && charactersArray.length > 0) {
          await tx.writingCharacter.deleteMany({
            where: { bibleId: bible.id },
          });
          for (const char of charactersArray) {
            const c = char as Record<string, unknown>;
            const roleStr = String(c.role || "supporting").toLowerCase();
            const roleEnum =
              roleStr === "protagonist"
                ? "PROTAGONIST"
                : roleStr === "antagonist"
                  ? "ANTAGONIST"
                  : "SUPPORTING";

            await tx.writingCharacter.create({
              data: {
                bibleId: bible.id,
                name: String(c.name || "未命名"),
                role: roleEnum,
                appearance: { description: String(c.appearance || "") },
                personality: {
                  traits: Array.isArray(c.personality) ? c.personality : [],
                  motivation: String(c.motivation || ""),
                  arc: String(c.arc || ""),
                },
                background: String(c.background || ""),
              },
            });
          }
        }

        // Sync world settings
        if (worldInfo) {
          await tx.worldSetting.deleteMany({ where: { bibleId: bible.id } });
          const toStr = (val: unknown): string => {
            if (!val) return "";
            if (typeof val === "string") return val;
            if (Array.isArray(val)) return val.map(String).join("\n");
            if (typeof val === "object") {
              return Object.values(val as Record<string, unknown>)
                .map((v) => (typeof v === "string" ? v : ""))
                .filter(Boolean)
                .join("\n");
            }
            return String(val);
          };

          for (const setting of [
            {
              category: "时代",
              name: "时代背景",
              description: toStr(worldInfo.era),
            },
            {
              category: "地理",
              name: "地理环境",
              description: toStr(worldInfo.geography),
            },
            {
              category: "社会",
              name: "社会结构",
              description: toStr(worldInfo.society),
            },
            {
              category: "类型",
              name: "世界类型",
              description: toStr(worldInfo.type),
            },
          ].filter((s) => s.description)) {
            await tx.worldSetting.create({
              data: {
                bibleId: bible.id,
                category: setting.category,
                name: setting.name,
                description: setting.description,
                rules: Array.isArray(worldInfo.rules)
                  ? worldInfo.rules.map(String)
                  : [],
              },
            });
          }
        }
      });

      this.logger.log(`[${missionId}] World saved to database`);
    } catch (e) {
      this.logger.error(
        `[${missionId}] Failed to save world: ${(e as Error).message}`,
      );
      throw new Error(`世界观数据保存失败: ${(e as Error).message}`);
    }
  }

  private async getTemplateStylePrompt(
    projectId: string,
  ): Promise<string | undefined> {
    try {
      const project = await this.prisma.writingProject.findUnique({
        where: { id: projectId },
        select: { styleTemplateId: true },
      });
      if (!project?.styleTemplateId) return undefined;

      const mergedConfig =
        await this.styleTemplateService.getMergedStyleConfig(projectId);
      return mergedConfig?.fullPrompt;
    } catch {
      return undefined;
    }
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

  /**
   * Update Story Bible after each chapter (progressive update)
   * Extracted from god service L3929-4412.
   * AI analyzes chapter content and extracts: new characters, state changes,
   * timeline events, relationships, world settings updates.
   */
  private async updateStoryBibleAfterChapter(
    projectId: string,
    missionId: string,
    chapterNumber: number,
    chapterContent: string,
    worldSettings: Record<string, unknown>,
    modelId: string,
    kernelProcessId?: string,
  ): Promise<void> {
    const keeperModel =
      (await this.lifecycleService.getModelForRole("bible-keeper")) || modelId;

    // Emit keeper working event
    await this.eventEmitter.emitAgentWorking(projectId, {
      agentId: "bible-keeper",
      agentName: "设定守护者",
      agentRole: "keeper",
      status: "working",
      taskDescription: `分析第${this.textProcessor.numberToChinese(chapterNumber)}章并更新故事圣经`,
    });

    const updatePrompt = `作为设定守护者，请分析这一章节并提取需要记录到故事圣经的新信息。

【章节内容】
${chapterContent.slice(0, 4000)}

【当前世界观设定摘要】
${JSON.stringify(worldSettings, null, 2).slice(0, 1500)}

请识别本章中出现的：
1. 新角色（所有有名有姓的角色）
2. 角色状态变化
3. 角色关系
4. 时间线事件
5. 新的地点/组织/物品等设定

输出 JSON：
{
  "newCharacters": [{ "name": "角色名", "role": "SUPPORTING", "description": "描述", "firstAppearance": ${chapterNumber} }],
  "characterUpdates": [{ "name": "角色名", "change": "变化" }],
  "timelineEvents": ["事件"],
  "newSettings": ["设定"]
}`;

    try {
      const response = await this.chatFacade.chat({
        messages: [
          {
            role: "system",
            content:
              this.bibleKeeper.description +
              "\n\n你是专业的设定守护者。请以 JSON 格式输出。确保 JSON 结构完整。",
          },
          { role: "user", content: updatePrompt },
        ],
        model: keeperModel,
        taskProfile: {
          creativity: "low",
          outputLength: "medium",
        },
        processId: kernelProcessId,
      });

      const content = response.content || "{}";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return;

      let jsonStr = jsonMatch[0]
        .replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]")
        .replace(/[\x00-\x1F\x7F]/g, " ");

      jsonStr = this.jsonParser.tryRepairTruncatedJson(jsonStr);

      interface BibleUpdateParsed {
        newCharacters?: Array<{
          name: string;
          role?: string;
          description?: string;
          firstAppearance?: number;
        }>;
        characterUpdates?: Array<{ name: string; change: string } | string>;
        timelineEvents?: string[];
        newSettings?: string[];
      }

      let parsed: BibleUpdateParsed;
      try {
        parsed = JSON.parse(jsonStr) as BibleUpdateParsed;
      } catch {
        this.logger.warn(
          `[${missionId}] Bible update JSON parse failed for chapter ${chapterNumber}`,
        );
        return;
      }

      // Save new characters to DB
      if (parsed.newCharacters && parsed.newCharacters.length > 0) {
        const bible = await this.prisma.storyBible.findUnique({
          where: { projectId },
          select: { id: true },
        });

        if (bible) {
          for (const char of parsed.newCharacters) {
            if (!char.name) continue;
            const exists = await this.prisma.writingCharacter.findFirst({
              where: { bibleId: bible.id, name: char.name },
            });
            if (!exists) {
              const roleStr = String(char.role || "supporting").toLowerCase();
              const roleEnum =
                roleStr === "protagonist"
                  ? "PROTAGONIST"
                  : roleStr === "antagonist"
                    ? "ANTAGONIST"
                    : roleStr === "minor"
                      ? "MINOR"
                      : "SUPPORTING";

              await this.prisma.writingCharacter.create({
                data: {
                  bibleId: bible.id,
                  name: char.name,
                  role: roleEnum,
                  background: char.description || "",
                  appearance: {},
                  personality: {},
                  currentState: {},
                  stateTimeline: [],
                },
              });
              this.logger.log(
                `[${missionId}] New character discovered in ch${chapterNumber}: ${char.name}`,
              );
            }
          }
        }
      }

      this.logger.log(
        `[${missionId}] Bible update for ch${chapterNumber}: ` +
          `newChars=${parsed.newCharacters?.length || 0}, ` +
          `updates=${parsed.characterUpdates?.length || 0}, ` +
          `events=${parsed.timelineEvents?.length || 0}`,
      );
    } catch (error) {
      this.logger.warn(
        `[${missionId}] Story Bible update failed for ch${chapterNumber}: ${(error as Error).message}`,
      );
      // Non-fatal: continue writing even if Bible update fails
    }
  }

  /**
   * Generate AI chapter summary for next chapter context
   * Extracted from god service L3745-3808.
   */
  private async generateChapterSummaryWithAI(
    content: string,
    chapterNumber: number,
    chapterTitle: string,
    modelId: string,
    kernelProcessId?: string,
  ): Promise<string | null> {
    if (content.length <= 1000) return content.slice(0, 500);

    try {
      const summaryPrompt = `请为以下章节内容生成一个结构化摘要，用于后续章节创作的上下文参考。

【第${chapterNumber}章：${chapterTitle}】
${content.slice(0, 6000)}

要求：
1. 100-200 字
2. 包含：主要事件、角色状态变化、关键对话/决定、场景/时间线
3. 使用客观叙述，不加评价

请直接输出摘要：`;

      const response = await this.chatFacade.chat({
        messages: [
          {
            role: "system",
            content: "你是专业的内容摘要生成器。请生成简洁准确的章节摘要。",
          },
          { role: "user", content: summaryPrompt },
        ],
        model: modelId,
        taskProfile: {
          creativity: "deterministic",
          outputLength: "short",
        },
        processId: kernelProcessId,
      });

      return response.content || null;
    } catch (error) {
      this.logger.warn(
        `Chapter ${chapterNumber} summary generation failed: ${(error as Error).message}`,
      );
      return null;
    }
  }
}
