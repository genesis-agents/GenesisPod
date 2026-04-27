/**
 * Writing Mission Execution Service
 *
 * Orchestrates the execution of writing missions:
 * - Routes to appropriate task executor via executorMap
 * - Manages trace collection and progress tracking
 * - Validates generated content
 * - Coordinates persistence and event emission
 *
 * Extracted from WritingMissionService.runMissionInBackground().
 * Follows Topic Insights' MissionExecutionService pattern.
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import {
  ChatFacade,
  AgentFacade,
} from "../../../../ai-engine/facade";
import { ProgressTrackerService } from "../../../../ai-harness/facade";

import type { WritingMissionInput } from "./writing-mission.types";
import type {
  RoleModelAssignment,
  IWritingTaskExecutor,
  WritingTaskContext,
  WritingTaskResult,
} from "../task-executors/task-executor.interface";
import { WritingMissionLifecycleService } from "./writing-mission-lifecycle.service";
import { WritingPersistence } from "./writing-persistence.service";
import { WritingEventEmitterService } from "../events/writing-event-emitter.service";
import { WritingTextProcessorService } from "./writing-text-processor.service";
import {
  CONTENT_VALIDATION,
  WRITING_DEFAULTS,
  PROGRESS_TRACKER_PHASES,
} from "../config";
import { MISSION_TYPE_CONFIGS } from "../config/mission-type-mapping.config";

@Injectable()
export class WritingMissionExecutionService {
  private readonly logger = new Logger(WritingMissionExecutionService.name);

  /**
   * Executor map: routes mission types to their executor implementations.
   * Populated via registerExecutor() during module initialization.
   */
  private readonly executorMap = new Map<string, IWritingTaskExecutor>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatFacade: ChatFacade,
    private readonly agentFacade: AgentFacade,
    private readonly lifecycleService: WritingMissionLifecycleService,
    private readonly persistence: WritingPersistence,
    private readonly eventEmitter: WritingEventEmitterService,
    private readonly textProcessor: WritingTextProcessorService,
    @Optional() private readonly progressTracker?: ProgressTrackerService,
  ) {
    // Wire up circular dependency
    this.lifecycleService.setExecutionService(this);
  }

  /**
   * Register a task executor for a specific mission type
   */
  registerExecutor(executor: IWritingTaskExecutor): void {
    this.executorMap.set(executor.taskType, executor);
    this.logger.log(`Registered executor for task type: ${executor.taskType}`);
  }

  /**
   * Run a writing mission in background (called by LifecycleService)
   */
  async runMissionInBackground(
    missionId: string,
    input: WritingMissionInput,
    _userId: string,
    modelAssignments: RoleModelAssignment[],
  ): Promise<void> {
    // Start trace
    const traceId = this.agentFacade.startTrace({
      name: `AI Writing: ${input.missionType}`,
      type: "research",
      metadata: {
        missionId,
        missionType: input.missionType,
        projectId: input.projectId,
        targetWordCount: input.targetWordCount,
      },
    });

    // Create progress tracker
    if (this.progressTracker) {
      this.progressTracker.create({
        id: missionId,
        type: "writing",
        name: `Writing: ${input.missionType}`,
        roomConfig: {
          roomId: `mission:${missionId}`,
          roomType: "mission",
          entityId: missionId,
        },
        phases: PROGRESS_TRACKER_PHASES,
      });
      this.progressTracker.start(missionId);
    }

    let generationSpanId: string | undefined;

    // Heartbeat: prevent frontend from detecting "stuck" during long LLM calls
    let heartbeatCount = 0;
    const heartbeatInterval = setInterval(() => {
      heartbeatCount++;
      this.logger.log(
        `[${missionId}] Heartbeat: mission in progress... (${heartbeatCount * 30}s elapsed)`,
      );
      void this.lifecycleService.updateMissionProgress(
        missionId,
        Math.min(5 + heartbeatCount, 9),
        `AI 团队正在协作中... (${heartbeatCount * 30}s)`,
      );
    }, 30_000);

    try {
      this.logger.log(`Running mission ${missionId} in background`);

      // Resolve model to use
      const modelToUse = await this.resolveModel(modelAssignments);

      this.logger.log(`Using model: ${modelToUse} for content generation`);

      // Start generation span
      generationSpanId = traceId
        ? this.agentFacade.addSpan(traceId, {
            name: `Content Generation (${input.missionType})`,
            type: "synthesis",
            metadata: { missionType: input.missionType, modelUsed: modelToUse },
          })
        : undefined;

      // Start preparation phase
      if (this.progressTracker) {
        this.progressTracker.startPhase(missionId, "preparation");
      }

      // Stop external heartbeat — executor manages its own progress updates
      clearInterval(heartbeatInterval);

      // Execute via executor map
      let result = await this.executeWithExecutorMap(
        missionId,
        input,
        modelToUse,
        modelAssignments,
      );

      // Handle @Leader delegation to full_story
      if (result.content === "[DELEGATE_FULL_STORY_INTERNAL]") {
        this.logger.log(
          `[${missionId}] @Leader delegated to full_story, re-dispatching...`,
        );
        result = await this.executeWithExecutorMap(
          missionId,
          { ...input, missionType: "full_story" },
          modelToUse,
          modelAssignments,
        );
      }

      // Complete progress phases
      if (this.progressTracker) {
        this.progressTracker.completePhase(missionId, "preparation");
        this.progressTracker.completePhase(missionId, "planning");
        this.progressTracker.startPhase(missionId, "writing");
      }

      if (result.content) {
        const totalWordCount =
          result.wordCount || this.textProcessor.countWords(result.content);

        this.logger.log(
          `Generated ${totalWordCount} words for mission ${missionId}`,
        );

        // Validate content
        this.validateContent(input, result.content, totalWordCount);

        if (this.progressTracker) {
          this.progressTracker.completePhase(missionId, "writing");
          this.progressTracker.startPhase(missionId, "checking");
          this.progressTracker.completePhase(missionId, "checking");
          this.progressTracker.startPhase(missionId, "editing");
        }

        // Persist content if executor didn't already
        if (result.shouldPersist) {
          await this.persistContent(
            input,
            result.content,
            totalWordCount,
            missionId,
            modelToUse,
          );
        }

        // Update mission record
        await this.lifecycleService.updateMissionRecord(missionId, {
          missionId,
          success: true,
          deliverables: [],
          content: result.content,
          wordCount: totalWordCount,
          summary: result.summary || `成功生成 ${totalWordCount} 字的内容`,
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

        // Emit completion event for non-full_story types
        const config = MISSION_TYPE_CONFIGS[input.missionType];
        if (config?.emitCompleteEvent) {
          await this.eventEmitter.emitMissionCompleted(
            input.projectId,
            missionId,
            totalWordCount,
            1,
            1,
          );
        }

        clearInterval(heartbeatInterval);
        this.logger.log(`Mission ${missionId} completed successfully`);

        // Kernel process completion
        this.lifecycleService.completeKernelProcess(missionId, {
          wordCount: totalWordCount,
        });

        if (this.progressTracker) {
          this.progressTracker.completePhase(missionId, "editing");
          this.progressTracker.complete(missionId);
        }

        // End spans
        if (generationSpanId) {
          this.agentFacade.endSpan(generationSpanId, {
            status: "success",
            output: { wordCount: totalWordCount, missionId },
          });
        }
        if (traceId) {
          this.agentFacade.endTrace(traceId, { status: "success" });
        }
      } else {
        throw new Error("未能生成内容");
      }
    } catch (error) {
      clearInterval(heartbeatInterval);
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Mission ${missionId} failed: ${errMsg}`);

      // All cleanup wrapped to prevent double-fault leaving mission stuck in IN_PROGRESS
      try {
        this.lifecycleService.failKernelProcess(missionId, errMsg);
        if (this.progressTracker) {
          const task = this.progressTracker.getTask(missionId);
          if (task) {
            for (const phase of task.phases) {
              if (phase.status === "in_progress") {
                this.progressTracker.failPhase(missionId, phase.id, errMsg);
              }
            }
          }
          this.progressTracker.fail(missionId, errMsg);
        }
        if (generationSpanId) {
          this.agentFacade.endSpan(generationSpanId, {
            status: "error",
            error: errMsg,
          });
        }
        if (traceId) {
          this.agentFacade.endTrace(traceId, { status: "error" });
        }
        await this.eventEmitter.emitMissionFailed(
          input.projectId,
          missionId,
          errMsg,
        );
      } catch (cleanupErr) {
        this.logger.warn(
          `Mission ${missionId} error cleanup failed: ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)}`,
        );
      }

      // Critical: must mark mission as FAILED (separate try-catch to guarantee execution)
      try {
        await this.lifecycleService.updateMissionRecord(missionId, {
          missionId,
          success: false,
          deliverables: [],
          summary: `写作任务失败: ${errMsg}`,
          tokensUsed: 0,
          costUsed: 0,
          duration: 0,
          error: { code: "WRITING_ERROR", message: errMsg, retryable: true },
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
      } catch (recordErr) {
        this.logger.error(
          `Mission ${missionId} CRITICAL: failed to mark as FAILED: ${recordErr instanceof Error ? recordErr.message : String(recordErr)}`,
        );
      }
    }
  }

  // ─── Private Helpers ───

  /**
   * Execute using executor map with fallback to legacy god service
   */
  private async executeWithExecutorMap(
    missionId: string,
    input: WritingMissionInput,
    modelId: string,
    modelAssignments: RoleModelAssignment[],
  ): Promise<WritingTaskResult> {
    const executor = this.executorMap.get(input.missionType);

    if (executor) {
      // Use new executor
      const project = await this.prisma.writingProject.findUnique({
        where: { id: input.projectId },
        select: { id: true, name: true, description: true, targetWords: true },
      });

      if (!project) {
        throw new Error(`Project ${input.projectId} not found`);
      }

      const context: WritingTaskContext = {
        missionId,
        input,
        modelId,
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          targetWords:
            project.targetWords || WRITING_DEFAULTS.DEFAULT_TARGET_WORDS,
        },
        kernelProcessId: this.lifecycleService.getKernelProcessId(missionId),
        roleModelAssignments: modelAssignments,
      };

      return executor.execute(context);
    }

    // No executor registered - this shouldn't happen in Phase 4
    throw new Error(
      `No executor registered for mission type: ${input.missionType}`,
    );
  }

  /**
   * Resolve which model to use for content generation
   */
  private async resolveModel(
    modelAssignments: RoleModelAssignment[],
  ): Promise<string> {
    const leaderModel = modelAssignments.find(
      (a) => a.roleId === "story-architect" && a.isActive,
    )?.modelId;
    const writerModel = modelAssignments.find(
      (a) => a.roleId === "writer" && a.isActive,
    )?.modelId;

    const defaultModelConfig = await this.chatFacade.getDefaultTextModel();
    const modelToUse =
      writerModel || leaderModel || defaultModelConfig?.modelId;

    if (!modelToUse) {
      throw new Error(
        "No AI model configured for content generation. Please configure a default text model in the admin panel.",
      );
    }

    return modelToUse;
  }

  /**
   * Validate generated content
   */
  private validateContent(
    input: WritingMissionInput,
    content: string,
    wordCount: number,
  ): void {
    const isCompletionMarker = CONTENT_VALIDATION.COMPLETION_MARKERS.some(
      (marker) => content.startsWith(marker),
    );

    const skipWordCountCheck =
      (CONTENT_VALIDATION.SKIP_WORD_COUNT_TYPES as readonly string[]).includes(
        input.missionType,
      ) || isCompletionMarker;

    const minWordCount =
      input.missionType === "outline"
        ? CONTENT_VALIDATION.MIN_WORDS_OUTLINE
        : CONTENT_VALIDATION.MIN_WORDS_GENERAL;

    const isErrorContent =
      !isCompletionMarker &&
      (CONTENT_VALIDATION.ERROR_INDICATORS.some((indicator) =>
        content.includes(indicator),
      ) ||
        content.length < CONTENT_VALIDATION.MIN_CONTENT_LENGTH);

    if (!skipWordCountCheck && (wordCount < minWordCount || isErrorContent)) {
      this.logger.error(
        `Generated content is invalid or too short: ${wordCount} words, content length: ${content.length}`,
      );
      throw new Error(
        `内容生成失败：生成的内容无效或字数不足 (${wordCount} 字)。可能是 API 限流或配额不足。`,
      );
    }
  }

  /**
   * Persist generated content via WritingPersistence
   */
  private async persistContent(
    input: WritingMissionInput,
    content: string,
    wordCount: number,
    missionId: string,
    _modelId: string,
  ): Promise<void> {
    await this.persistence.saveGeneratedContent(
      input,
      content,
      wordCount,
      missionId,
    );
  }
}
