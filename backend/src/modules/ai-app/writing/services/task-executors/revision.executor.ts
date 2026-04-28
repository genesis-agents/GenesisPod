/**
 * Revision Executor
 *
 * Handles revision/editing tasks for existing chapter content.
 * Extracted from WritingMissionService revision logic.
 */

import { Injectable, Logger } from "@nestjs/common";
import { ChatFacade } from "../../../../ai-harness/facade";
import type {
  IWritingTaskExecutor,
  WritingTaskContext,
  WritingTaskResult,
} from "./task-executor.interface";
import type { WritingMissionType } from "../mission/writing-mission.types";

@Injectable()
export class RevisionExecutor implements IWritingTaskExecutor {
  private readonly logger = new Logger(RevisionExecutor.name);
  readonly taskType: WritingMissionType = "revision";

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

      let userPrompt = input.userPrompt;
      if (input.targetWordCount) {
        userPrompt += `\n\n目标字数：约 ${input.targetWordCount} 字`;
      }
      if (input.additionalInstructions) {
        userPrompt += `\n\n额外要求：${input.additionalInstructions}`;
      }

      this.logger.log(
        `Calling LLM (${modelId}) for revision mission ${missionId}`,
      );

      const response = await this.chatFacade.chat({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        model: modelId,
        taskProfile: {
          creativity: "medium",
          outputLength: "long",
        },
        processId: kernelProcessId,
      });

      if (!response.content) {
        return {
          content: null,
          wordCount: 0,
          shouldPersist: false,
          summary: "LLM 返回空内容",
        };
      }

      const wordCount = response.content.length;

      return {
        content: response.content,
        wordCount,
        shouldPersist: true,
        summary: `成功完成修订 (${wordCount} 字)`,
      };
    } catch (error) {
      this.logger.error(`Revision failed: ${(error as Error).message}`);
      throw error;
    }
  }
}
