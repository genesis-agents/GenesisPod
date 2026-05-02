/**
 * Outline Executor
 *
 * Handles generating story outlines via LLM call.
 * Extracted from WritingMissionService.generateContentDirectly() (outline branch).
 */

import { Injectable, Logger } from "@nestjs/common";
import { ChatFacade } from "@/modules/ai-harness/facade";
import type {
  IWritingTaskExecutor,
  WritingTaskContext,
  WritingTaskResult,
} from "./task-executor.interface";
import type { WritingMissionType } from "../mission/writing-mission.types";

@Injectable()
export class OutlineExecutor implements IWritingTaskExecutor {
  private readonly logger = new Logger(OutlineExecutor.name);
  readonly taskType: WritingMissionType = "outline";

  constructor(private readonly chatFacade: ChatFacade) {}

  async execute(context: WritingTaskContext): Promise<WritingTaskResult> {
    const { missionId, input, modelId, kernelProcessId } = context;

    try {
      const systemPrompt = `你是一位专业的小说作家。你的任务是根据用户的要求创作高质量的故事内容。

写作要求：
- 语言流畅自然，富有文学性
- 人物形象鲜明，对话生动
- 情节紧凑，引人入胜
- 场景描写细腻，画面感强
- 符合故事类型的风格特点

输出格式：
- 直接输出故事内容，不要添加任何解释或元数据
- 使用中文写作`;

      let userPrompt = `请为以下故事创作详细的大纲：\n\n${input.userPrompt}\n\n要求：
1. 列出主要章节
2. 每章简要描述主要情节
3. 标注关键转折点`;

      if (input.targetWordCount) {
        userPrompt += `\n\n目标字数：约 ${input.targetWordCount} 字`;
      }
      if (input.additionalInstructions) {
        userPrompt += `\n\n额外要求：${input.additionalInstructions}`;
      }

      this.logger.log(
        `Calling LLM (${modelId}) for outline mission ${missionId}`,
      );

      const response = await this.chatFacade.chat({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        model: modelId,
        taskProfile: {
          creativity: "medium",
          outputLength: "medium",
        },
        processId: kernelProcessId,
      });

      if (!response.content) {
        this.logger.warn(
          `LLM returned empty content for outline mission ${missionId}`,
        );
        return {
          content: null,
          wordCount: 0,
          shouldPersist: false,
          summary: "LLM 返回空内容",
        };
      }

      this.logger.log(`Outline generated: ${response.content.length} chars`);

      const wordCount = response.content.length;

      return {
        content: response.content,
        wordCount,
        shouldPersist: true,
        summary: `成功生成大纲 (${wordCount} 字)`,
      };
    } catch (error) {
      this.logger.error(
        `Outline generation failed: ${(error as Error).message}`,
      );
      throw error;
    }
  }
}
