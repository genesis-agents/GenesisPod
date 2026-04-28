/**
 * Leader Command Executor
 *
 * Handles @Leader edit commands via two-phase processing:
 * Phase 1: Analyze user intent (add_character, modify_chapter, etc.)
 * Phase 2: Execute the appropriate action
 *
 * Extracted from WritingMissionService.executeLeaderCommand() + generateChapterModification().
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { ChatFacade } from "../../../../ai-harness/facade";
import { NarrativeCraftService } from "../quality/narrative-craft.service";
import { WritingTextProcessorService } from "../mission/writing-text-processor.service";
import { WritingEventEmitterService } from "../events/writing-event-emitter.service";
import type {
  IWritingTaskExecutor,
  WritingTaskContext,
  WritingTaskResult,
} from "./task-executor.interface";
import type { WritingMissionType } from "../mission/writing-mission.types";

@Injectable()
export class LeaderCommandExecutor implements IWritingTaskExecutor {
  private readonly logger = new Logger(LeaderCommandExecutor.name);
  readonly taskType: WritingMissionType = "edit";

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatFacade: ChatFacade,
    private readonly narrativeCraft: NarrativeCraftService,
    private readonly textProcessor: WritingTextProcessorService,
    private readonly eventEmitter: WritingEventEmitterService,
  ) {}

  async execute(context: WritingTaskContext): Promise<WritingTaskResult> {
    const { missionId, input, modelId, kernelProcessId } = context;
    const userPrompt = input.userPrompt;

    // Execute leader command
    const leaderResponse = await this.executeLeaderCommand(
      input.projectId,
      input.chapterId,
      input.conversationHistory,
      userPrompt,
      modelId,
      missionId,
      kernelProcessId,
    );

    // Check if delegating to full_story
    if (leaderResponse?.startsWith("[DELEGATE_TO_FULL_STORY]")) {
      this.logger.log(`[${missionId}] Leader delegating to full_story task`);
      await this.eventEmitter.emitLeaderResponse(
        input.projectId,
        missionId,
        "收到您的请求，正在安排作家团队创作新章节...",
      );
      return {
        content: "[DELEGATE_FULL_STORY_INTERNAL]",
        wordCount: 0,
        shouldPersist: false,
        summary: "Leader 委托给 full_story 执行器",
      };
    }

    // Emit leader response event
    if (leaderResponse) {
      await this.eventEmitter.emitLeaderResponse(
        input.projectId,
        missionId,
        leaderResponse,
      );
    }

    return {
      content: leaderResponse,
      wordCount: leaderResponse?.length || 0,
      shouldPersist: true,
      summary: "Leader 命令执行完成",
    };
  }

  /**
   * Two-phase @Leader command execution
   */
  private async executeLeaderCommand(
    projectId: string,
    chapterId: string | undefined,
    conversationHistory:
      | Array<{ role: "user" | "assistant"; content: string }>
      | undefined,
    userPrompt: string,
    modelId: string,
    missionId: string,
    kernelProcessId?: string,
  ): Promise<string | null> {
    // Get context info
    const contextInfo = await this.getLeaderContextInfo(projectId, chapterId);

    // Phase 1: Analyze intent
    const analysisPrompt = `你是故事架构师（Leader），负责分析用户指令并决定执行什么操作。

## 当前项目状态
${contextInfo}

## 用户指令
${userPrompt}

## 你的任务
分析用户指令，判断需要执行的操作类型，并输出结构化的 JSON 指令。

## 可用操作类型
1. add_character - 添加新角色到故事圣经
2. update_character - 更新现有角色信息
3. add_world_setting - 添加世界观设定
4. modify_chapter - 修改/重写章节内容
5. continue_writing - 继续创作下一章
6. consistency_check - 检查内容一致性
7. analyze - 分析项目状态并给出建议（不执行修改）

## 输出格式（必须是有效的 JSON）
{
  "action": "操作类型",
  "understanding": "对用户指令的理解（一句话）",
  "params": {},
  "explanation": "执行说明"
}

请直接输出 JSON，不要包含其他文字：`;

    this.logger.log(`[${missionId}] Analyzing user intent for @Leader command`);

    const messages: Array<{
      role: "user" | "assistant" | "system";
      content: string;
    }> = [];

    messages.push({ role: "system", content: analysisPrompt });

    if (conversationHistory && conversationHistory.length > 0) {
      this.logger.log(
        `[${missionId}] Including ${conversationHistory.length} conversation history messages`,
      );
      for (const msg of conversationHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: "user", content: userPrompt });

    const analysisResponse = await this.chatFacade.chat({
      messages,
      model: modelId,
      taskProfile: {
        creativity: "low",
        outputLength: "short",
      },
      processId: kernelProcessId,
    });

    if (!analysisResponse.content) {
      this.logger.error(`[${missionId}] Failed to analyze user intent`);
      return "无法理解指令，请重新描述您的需求。";
    }

    // Parse JSON command
    let command: {
      action: string;
      understanding: string;
      params: Record<string, unknown>;
      explanation: string;
    };

    try {
      const jsonMatch = analysisResponse.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      command = JSON.parse(jsonMatch[0]);
    } catch {
      return `## Leader 分析\n\n${analysisResponse.content}`;
    }

    this.logger.log(
      `[${missionId}] Executing @Leader action: ${command.action}`,
    );

    // Phase 2: Execute action
    switch (command.action) {
      case "add_character":
        return this.handleAddCharacter(projectId, command.params, missionId);

      case "update_character":
        return this.handleUpdateCharacter(projectId, command.params, missionId);

      case "add_world_setting":
        return this.handleAddWorldSetting(projectId, command.params, missionId);

      case "modify_chapter":
        return this.handleModifyChapter(
          projectId,
          chapterId,
          command.params,
          modelId,
          missionId,
          kernelProcessId,
        );

      case "continue_writing":
        return `[DELEGATE_TO_FULL_STORY]继续创作`;

      case "consistency_check":
      case "analyze":
      default:
        return `## Leader 分析\n\n**理解**：${command.understanding}\n\n**建议**：\n${command.explanation}`;
    }
  }

  private async handleAddCharacter(
    projectId: string,
    params: Record<string, unknown>,
    missionId: string,
  ): Promise<string> {
    const name = params.name as string;
    if (!name) return "错误：创建角色需要提供角色名称。";

    const project = await this.prisma.writingProject.findUnique({
      where: { id: projectId },
      include: { storyBible: true },
    });

    if (!project?.storyBible) return "错误：项目没有关联的故事圣经。";

    const existingChar = await this.prisma.writingCharacter.findFirst({
      where: { bibleId: project.storyBible.id, name },
    });

    if (existingChar) {
      return `角色「${name}」已存在，如需更新请使用"修改角色"指令。`;
    }

    const newCharacter = await this.prisma.writingCharacter.create({
      data: {
        bibleId: project.storyBible.id,
        name,
        role:
          (params.role as string as
            | "PROTAGONIST"
            | "ANTAGONIST"
            | "SUPPORTING"
            | "MINOR") || "SUPPORTING",
        background:
          (params.background as string) || (params.description as string) || "",
        abilities: (params.abilities as string[]) || [],
        appearance: {},
        personality: (params.description as string)
          ? { summary: params.description as string }
          : {},
        currentState: {},
        stateTimeline: [],
      },
    });

    this.logger.log(
      `[${missionId}] Created character: ${newCharacter.name} (${newCharacter.id})`,
    );

    return `## 角色创建成功

**角色名称**：${newCharacter.name}
**角色定位**：${newCharacter.role}
**描述**：${(params.description as string) || "（未提供）"}
**背景**：${(params.background as string) || "（未提供）"}

角色已添加到故事圣经，后续章节创作时会自动引用此角色设定。`;
  }

  private async handleUpdateCharacter(
    projectId: string,
    params: Record<string, unknown>,
    _missionId: string,
  ): Promise<string> {
    const name = params.name as string;
    if (!name) return "错误：更新角色需要提供角色名称。";

    const project = await this.prisma.writingProject.findUnique({
      where: { id: projectId },
      include: { storyBible: true },
    });

    if (!project?.storyBible) return "错误：项目没有关联的故事圣经。";

    const character = await this.prisma.writingCharacter.findFirst({
      where: { bibleId: project.storyBible.id, name },
    });

    if (!character) {
      return `未找到角色「${name}」，请检查名称是否正确。`;
    }

    // Allowlist: only permit safe character fields to be updated via LLM-generated commands
    const ALLOWED_FIELDS = [
      "background",
      "personality",
      "appearance",
      "abilities",
      "currentState",
    ] as const;
    const rawUpdates = (params.updates || {}) as Record<string, unknown>;
    const safeUpdates: Record<string, unknown> = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in rawUpdates) {
        safeUpdates[key] = rawUpdates[key];
      }
    }

    if (Object.keys(safeUpdates).length === 0) {
      return `未找到可更新的字段。允许更新的字段：${ALLOWED_FIELDS.join("、")}`;
    }

    const updatedChar = await this.prisma.writingCharacter.update({
      where: { id: character.id },
      data: safeUpdates,
    });

    return `## 角色更新成功\n\n**角色**：${updatedChar.name}\n**更新内容**：${JSON.stringify(safeUpdates, null, 2)}`;
  }

  private async handleAddWorldSetting(
    projectId: string,
    params: Record<string, unknown>,
    _missionId: string,
  ): Promise<string> {
    const name = params.name as string;
    const category = params.category as string;
    if (!name || !category) return "错误：添加世界观设定需要提供名称和分类。";

    const project = await this.prisma.writingProject.findUnique({
      where: { id: projectId },
      include: { storyBible: true },
    });

    if (!project?.storyBible) return "错误：项目没有关联的故事圣经。";

    const newSetting = await this.prisma.worldSetting.create({
      data: {
        bibleId: project.storyBible.id,
        category,
        name,
        description: (params.description as string) || "",
        rules: (params.rules as string[]) || [],
      },
    });

    return `## 世界观设定添加成功\n\n**分类**：${newSetting.category}\n**名称**：${newSetting.name}\n**描述**：${newSetting.description}`;
  }

  private async handleModifyChapter(
    projectId: string,
    chapterId: string | undefined,
    params: Record<string, unknown>,
    modelId: string,
    missionId: string,
    kernelProcessId?: string,
  ): Promise<string | null> {
    const chapterNumber = params.chapterNumber as number | undefined;
    const instruction = params.instruction as string;

    let chapter;
    if (chapterNumber) {
      const volumes = await this.prisma.writingVolume.findMany({
        where: { projectId },
        include: {
          chapters: { where: { chapterNumber } },
        },
      });
      chapter = volumes.flatMap((v) => v.chapters)[0];
    } else if (chapterId) {
      chapter = await this.prisma.writingChapter.findUnique({
        where: { id: chapterId },
      });
    }

    if (!chapter) {
      return "未找到指定章节，请确认章节号或选择一个章节后再试。";
    }

    const modifyPrompt = `请根据以下指令修改章节内容：

## 当前章节
**标题**：第${chapter.chapterNumber}章 ${chapter.title}
**大纲**：${chapter.outline || "无"}

**原内容**：
${chapter.content || "（空）"}

## 修改指令
${instruction}

## 要求
1. 保持故事连贯性
2. 保留原有的精彩部分
3. 按照指令进行针对性修改
4. 输出完整的修改后内容

请输出修改后的完整章节内容：`;

    const response = await this.chatFacade.chat({
      messages: [{ role: "user", content: modifyPrompt }],
      model: modelId,
      taskProfile: {
        creativity: "high",
        outputLength: "long",
      },
      processId: kernelProcessId,
    });

    if (response.content && response.content.length > 200) {
      let modifiedContent = response.content;
      const narrativeReport =
        this.narrativeCraft.analyzeContent(modifiedContent);

      if (!narrativeReport.passed) {
        this.logger.warn(
          `[${missionId}] Chapter modification failed narrative craft check (score=${narrativeReport.score})`,
        );

        const hasEndingOrCliche = narrativeReport.issues.some(
          (i) =>
            i.type === "ending" ||
            i.category === "ai_writing_cliche" ||
            i.category === "excessive_psychology",
        );

        if (hasEndingOrCliche) {
          this.logger.log(
            `[${missionId}] Rewriting to fix ${narrativeReport.issues.length} narrative issues`,
          );
          const rewrittenContent = await this.narrativeCraft.rewriteEnding(
            modifiedContent,
            narrativeReport.issues,
          );
          if (rewrittenContent && rewrittenContent !== modifiedContent) {
            modifiedContent = rewrittenContent;
          }
        }
      }

      await this.prisma.writingChapter.update({
        where: { id: chapter.id },
        data: {
          content: modifiedContent,
          wordCount: this.textProcessor.countWords(modifiedContent),
          status: "WRITING",
        },
      });

      return response.content;
    }

    return "章节修改失败，请重试。";
  }

  /**
   * Get context info for Leader decision making
   */
  private async getLeaderContextInfo(
    projectId: string,
    chapterId?: string,
  ): Promise<string> {
    const parts: string[] = [];

    try {
      const project = await this.prisma.writingProject.findUnique({
        where: { id: projectId },
        include: {
          storyBible: {
            include: {
              characters: { take: 10 },
              worldSettings: { take: 5 },
            },
          },
          volumes: {
            include: {
              chapters: {
                orderBy: { chapterNumber: "asc" },
                select: {
                  id: true,
                  chapterNumber: true,
                  title: true,
                  status: true,
                  wordCount: true,
                },
              },
            },
            orderBy: { volumeNumber: "asc" },
          },
        },
      });

      if (!project) return "项目信息不可用";

      const totalChapters = project.volumes.reduce(
        (sum, v) => sum + v.chapters.length,
        0,
      );
      const completedChapters = project.volumes.reduce(
        (sum, v) => sum + v.chapters.filter((c) => c.status === "FINAL").length,
        0,
      );
      parts.push(
        `项目：${project.name}`,
        `进度：${completedChapters}/${totalChapters} 章已完成`,
        `总字数：${project.currentWords || 0} 字`,
      );

      if (project.volumes.length > 0) {
        parts.push("\n### 章节列表");
        for (const volume of project.volumes) {
          parts.push(`\n**${volume.title}**`);
          for (const ch of volume.chapters) {
            const statusIcon =
              ch.status === "FINAL"
                ? "done"
                : ch.status === "WRITING"
                  ? "writing"
                  : "planned";
            parts.push(
              `  [${statusIcon}] 第${ch.chapterNumber}章：${ch.title} (${ch.wordCount}字)`,
            );
          }
        }
      }

      if (chapterId) {
        const chapter = await this.prisma.writingChapter.findUnique({
          where: { id: chapterId },
          select: {
            chapterNumber: true,
            title: true,
            content: true,
            outline: true,
            status: true,
          },
        });
        if (chapter) {
          parts.push(`\n### 当前操作章节`);
          parts.push(`第${chapter.chapterNumber}章：${chapter.title}`);
          parts.push(`状态：${chapter.status}`);
          if (chapter.outline) parts.push(`大纲：${chapter.outline}`);
          if (chapter.content) {
            parts.push(
              `内容预览：${chapter.content.slice(0, 500)}${chapter.content.length > 500 ? "..." : ""}`,
            );
          }
        }
      }

      if (
        project.storyBible?.characters &&
        project.storyBible.characters.length > 0
      ) {
        parts.push("\n### 主要角色");
        for (const char of project.storyBible.characters.slice(0, 5)) {
          parts.push(`- ${char.name}（${char.role}）`);
        }
      }
    } catch (error) {
      return "上下文信息获取失败";
    }

    return parts.join("\n");
  }
}
