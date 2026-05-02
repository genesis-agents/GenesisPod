/**
 * Consistency Check Executor
 *
 * Handles consistency checking of story content against Story Bible.
 * Extracted from WritingMissionService consistency_check logic.
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { ChatFacade } from "@/modules/ai-harness/facade";
import type {
  IWritingTaskExecutor,
  WritingTaskContext,
  WritingTaskResult,
} from "./task-executor.interface";
import type { WritingMissionType } from "../mission/writing-mission.types";

@Injectable()
export class ConsistencyCheckExecutor implements IWritingTaskExecutor {
  private readonly logger = new Logger(ConsistencyCheckExecutor.name);
  readonly taskType: WritingMissionType = "consistency_check";

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatFacade: ChatFacade,
  ) {}

  async execute(context: WritingTaskContext): Promise<WritingTaskResult> {
    const { missionId, input, modelId, kernelProcessId } = context;

    try {
      // Fetch Story Bible and chapters for consistency analysis
      const storyBible = await this.prisma.storyBible.findUnique({
        where: { projectId: input.projectId },
        include: {
          characters: {
            select: {
              name: true,
              role: true,
              background: true,
              personality: true,
            },
          },
          worldSettings: {
            select: { category: true, name: true, description: true },
          },
          terminologies: { select: { term: true, definition: true } },
        },
      });

      const chapters = await this.prisma.writingChapter.findMany({
        where: { volume: { projectId: input.projectId }, content: { not: "" } },
        orderBy: { chapterNumber: "asc" },
        select: { chapterNumber: true, title: true, content: true },
        take: 20,
      });

      // Build context for consistency analysis
      const bibleContext = storyBible
        ? `角色：${storyBible.characters.map((c) => `${c.name}(${c.role})`).join("、")}
世界观：${storyBible.worldSettings.map((w) => `${w.name}: ${w.description?.slice(0, 100)}`).join("\n")}
术语：${storyBible.terminologies.map((t) => `${t.term}: ${t.definition?.slice(0, 50)}`).join("、")}`
        : "（无故事圣经数据）";

      const chapterSummaries = chapters
        .map(
          (ch) =>
            `第${ch.chapterNumber}章「${ch.title}」: ${ch.content?.slice(0, 200)}...`,
        )
        .join("\n\n");

      const systemPrompt = `你是一位专业的小说一致性检查专家。你的任务是分析故事内容与故事圣经（Story Bible）的一致性。

检查维度：
1. 角色一致性：角色名称、性格、背景是否前后一致
2. 世界观一致性：时代背景、地理环境、社会制度是否自洽
3. 时间线一致性：事件发生顺序是否合理，有无时间矛盾
4. 术语一致性：专有名词使用是否统一
5. 情节逻辑：因果关系是否合理，有无逻辑漏洞

输出格式：
请以 JSON 格式输出检查结果：
{
  "status": "PASSED" 或 "ISSUES_FOUND",
  "overallScore": 0-100,
  "issues": [
    { "type": "角色/世界观/时间线/术语/情节", "severity": "高/中/低", "description": "问题描述", "suggestion": "修改建议" }
  ],
  "summary": "一句话总结"
}`;

      let userPrompt = `请检查以下小说内容的一致性：

【故事圣经】
${bibleContext}

【章节内容】
${chapterSummaries}`;

      if (input.userPrompt) {
        userPrompt += `\n\n【用户补充指令】\n${input.userPrompt}`;
      }
      if (input.additionalInstructions) {
        userPrompt += `\n\n额外要求：${input.additionalInstructions}`;
      }

      this.logger.log(
        `Calling LLM (${modelId}) for consistency check mission ${missionId}`,
      );

      const response = await this.chatFacade.chat({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        model: modelId,
        taskProfile: {
          creativity: "deterministic",
          outputLength: "medium",
        },
        processId: kernelProcessId,
      });

      if (!response.content) {
        return {
          content: null,
          wordCount: 0,
          shouldPersist: false,
          summary: "一致性检查返回空结果",
        };
      }

      return {
        content: response.content,
        wordCount: response.content.length,
        shouldPersist: true,
        summary: `一致性检查完成`,
      };
    } catch (error) {
      this.logger.error(
        `Consistency check failed: ${(error as Error).message}`,
      );
      throw error;
    }
  }
}
