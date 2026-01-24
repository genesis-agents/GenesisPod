/**
 * Writing Execution Service
 *
 * 负责写作任务的执行引擎：
 * - runMissionInBackground() - 后台任务执行
 * - updateMissionProgress() - 进度更新
 * - execute() - 主执行器（MissionOrchestrator集成）
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { MissionOrchestrator } from "../../../../ai-engine/teams/orchestrator/mission-orchestrator";
import { ITeam } from "../../../../ai-engine/teams/abstractions/team.interface";
import { MissionEvent } from "../../../../ai-engine/teams/abstractions/mission.interface";
import { ConstraintProfile } from "../../../../ai-engine/teams/constraints";
import type {
  WritingMissionInput,
  WritingMissionResult,
} from "./writing-mission.service";

/**
 * 角色模型分配结果
 */
interface RoleModelAssignment {
  roleId: string;
  modelId: string;
  isActive: boolean;
}

@Injectable()
export class WritingExecutionService {
  private readonly logger = new Logger(WritingExecutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly missionOrchestrator: MissionOrchestrator,
  ) {
    // eventEmitter will be used in future enhancements
  }

  /**
   * 更新任务进度
   */
  async updateMissionProgress(
    missionId: string,
    progress: number,
    currentStep: string,
  ): Promise<void> {
    try {
      await this.prisma.writingMission.update({
        where: { id: missionId },
        data: {
          result: { progress, currentStep },
        },
      });
    } catch (e) {
      this.logger.warn(`Failed to update progress: ${(e as Error).message}`);
    }
  }

  /**
   * 在后台运行任务（使用直接 LLM 调用生成内容）
   */
  async runMissionInBackground(
    missionId: string,
    input: WritingMissionInput,
    _userId: string,
    modelAssignments: RoleModelAssignment[],
    generateFullStory: (
      input: WritingMissionInput,
      modelId: string,
      missionId: string,
    ) => Promise<string | null>,
    generateContentDirectly: (
      input: WritingMissionInput,
      modelId: string,
      missionId: string,
    ) => Promise<string | null>,
    saveGeneratedContent: (
      input: WritingMissionInput,
      content: string,
      wordCount: number,
      missionId: string,
      modelId: string,
    ) => Promise<void>,
    updateMissionRecord: (
      missionId: string,
      result: Partial<WritingMissionResult>,
    ) => Promise<void>,
    countWords: (text: string) => number,
  ): Promise<void> {
    try {
      this.logger.log(`Running mission ${missionId} in background`);

      // 获取要使用的模型
      const leaderModel = modelAssignments.find(
        (a) => a.roleId === "story-architect" && a.isActive,
      )?.modelId;
      const writerModel = modelAssignments.find(
        (a) => a.roleId === "writer" && a.isActive,
      )?.modelId;

      // 使用默认模型如果没有分配
      const modelToUse = writerModel || leaderModel || "gpt-4o-mini";

      this.logger.log(`Using model: ${modelToUse} for content generation`);

      let generatedContent: string | null = null;
      let totalWordCount = 0;

      // 根据任务类型决定生成策略
      if (input.missionType === "full_story") {
        // 完整故事：一次性生成多章节内容
        generatedContent = await generateFullStory(input, modelToUse, missionId);
      } else {
        // 单章节或大纲：直接调用 LLM 生成内容
        generatedContent = await generateContentDirectly(
          input,
          modelToUse,
          missionId,
        );

        // 检查 @Leader 是否委托给 full_story 任务
        if (generatedContent === "[DELEGATE_FULL_STORY_INTERNAL]") {
          this.logger.log(
            `[${missionId}] @Leader delegated to full_story, starting chapter generation...`,
          );
          // 切换到 full_story 模式继续创作
          generatedContent = await generateFullStory(
            { ...input, missionType: "full_story" },
            modelToUse,
            missionId,
          );
        }
      }

      if (generatedContent) {
        totalWordCount = countWords(generatedContent);
        this.logger.log(
          `Generated ${totalWordCount} words for mission ${missionId}`,
        );

        // 验证生成的内容是否有效（不是错误消息）
        // edit 和 consistency_check 类型不强制最小字数（用于继续任务、状态检查等）
        // [ALL_CHAPTERS_COMPLETED] 标记表示所有章节已完成，也跳过验证
        // [CONTINUATION_COMPLETE] 标记表示续写完成，内容已保存，也跳过验证
        const isCompletionMarker =
          generatedContent.startsWith("[ALL_CHAPTERS_COMPLETED]") ||
          generatedContent.startsWith("[CONTINUATION_COMPLETE]");
        const skipWordCountCheck =
          input.missionType === "edit" ||
          input.missionType === "consistency_check" ||
          isCompletionMarker;
        const minWordCount = input.missionType === "outline" ? 50 : 200;
        const isErrorContent =
          !isCompletionMarker &&
          (generatedContent.includes("API Error") ||
            generatedContent.includes("rate limit") ||
            generatedContent.includes("429") ||
            generatedContent.includes("quota") ||
            generatedContent.includes("ECONNREFUSED") ||
            generatedContent.includes("Request failed") ||
            generatedContent.length < 100);

        if (
          !skipWordCountCheck &&
          (totalWordCount < minWordCount || isErrorContent)
        ) {
          this.logger.error(
            `Generated content is invalid or too short: ${totalWordCount} words, content length: ${generatedContent.length}`,
          );
          throw new Error(
            `内容生成失败：生成的内容无效或字数不足 (${totalWordCount} 字)。可能是 API 限流或配额不足。`,
          );
        }

        // 保存生成的内容
        await saveGeneratedContent(
          input,
          generatedContent,
          totalWordCount,
          missionId,
          modelToUse,
        );

        // 更新数据库为成功状态
        await updateMissionRecord(missionId, {
          missionId,
          success: true,
          deliverables: [],
          content: generatedContent,
          wordCount: totalWordCount,
          summary: `成功生成 ${totalWordCount} 字的内容`,
          tokensUsed: 0,
          costUsed: 0,
          duration: 0,
          statistics: {
            totalSteps: 5,
            completedSteps: 5,
            failedSteps: 0,
            skippedSteps: 0,
            reworkCount: 0,
            membersInvolved: 5,
            toolCalls: 0,
            skillCalls: 0,
            reviewCount: 1,
            reviewPassRate: 100,
          },
        });

        this.logger.log(`Mission ${missionId} completed successfully`);
      } else {
        throw new Error("未能生成内容");
      }
    } catch (error) {
      this.logger.error(
        `Mission ${missionId} failed: ${(error as Error).message}`,
      );

      // 更新数据库为失败状态
      await updateMissionRecord(missionId, {
        missionId,
        success: false,
        deliverables: [],
        summary: `写作任务失败: ${(error as Error).message}`,
        tokensUsed: 0,
        costUsed: 0,
        duration: 0,
        error: {
          code: "WRITING_ERROR",
          message: (error as Error).message,
          retryable: true,
        },
        statistics: {
          totalSteps: 0,
          completedSteps: 0,
          failedSteps: 1,
          skippedSteps: 0,
          reworkCount: 0,
          membersInvolved: 0,
          toolCalls: 0,
          skillCalls: 0,
          reviewCount: 0,
          reviewPassRate: 0,
        },
      });
    }
  }

  /**
   * 执行写作任务（MissionOrchestrator集成版本）
   *
   * 这是旧版本的 execute 方法，使用 MissionOrchestrator 执行任务。
   * 新版本已改为直接调用 LLM，但保留此方法供参考。
   */
  async *executeMission(
    team: ITeam,
    constraints: ConstraintProfile,
    prompt: string,
  ): AsyncGenerator<MissionEvent, WritingMissionResult> {
    this.logger.log(
      `Executing writing mission via MissionOrchestrator`,
    );

    const missionInput = {
      prompt,
    };

    try {
      const result = yield* this.missionOrchestrator.execute(
        missionInput,
        team,
        constraints,
      );

      return {
        ...result,
        content: result.summary,
        wordCount: 0,
      };
    } catch (error) {
      this.logger.error(
        `Mission execution failed: ${(error as Error).message}`,
      );
      throw error;
    }
  }
}
