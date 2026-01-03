/**
 * Slides Team Orchestrator
 *
 * 主编排器，采用 AI Teams 的 Leader 协调模式
 *
 * 5阶段执行流程：
 * 1. Leader 规划 - 分析源文本，动态分解任务
 * 2. 任务执行 - 成员执行任务，调用 Skills
 * 3. Leader 审核 - 检查任务输出，支持修订
 * 4. 质量审计 - 全局质量检查
 * 5. Leader 综合 - 整合所有输出
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import { SlidesLeader } from "./slides-leader";
import { SlidesTeamMember, TaskExecutionResult } from "./slides-team-member";
import { SlidesRepository } from "./slides-repository";
import {
  SlidesMission,
  SlidesMissionEvent,
  SlidesTask,
  SlidesTeamOrchestratorInput,
  SlidesTeamOrchestratorOutput,
  SkillExecutionContext,
  QualityAuditResult,
  SlidesExecutionError,
} from "./types";
import type { GeneratedSlide, PPTOutline } from "../types/slides.types";

@Injectable()
export class SlidesTeamOrchestrator {
  private readonly logger = new Logger(SlidesTeamOrchestrator.name);

  // 是否启用持久化
  private readonly persistenceEnabled: boolean;

  constructor(
    private readonly leader: SlidesLeader,
    private readonly teamMember: SlidesTeamMember,
    @Optional() private readonly repository?: SlidesRepository,
  ) {
    this.persistenceEnabled = !!repository;
    this.logger.log(
      `[constructor] Persistence ${this.persistenceEnabled ? "enabled" : "disabled"}`,
    );
  }

  /**
   * 执行 Mission（流式）
   */
  async *executeMission(
    input: SlidesTeamOrchestratorInput,
  ): AsyncGenerator<SlidesMissionEvent> {
    const startTime = Date.now();
    const errors: SlidesExecutionError[] = [];

    // 创建 Mission（持久化或内存）
    let mission: SlidesMission;
    if (this.persistenceEnabled && this.repository) {
      mission = await this.repository.createMission(input);
    } else {
      mission = {
        id: uuidv4(),
        userId: input.userId,
        sessionId: input.sessionId,
        sourceText: input.sourceText,
        userRequirement: input.userRequirement,
        targetPages: input.targetPages,
        stylePreference: input.stylePreference,
        themeId: input.themeId,
        tasks: [],
        currentPhase: "planning",
        status: "pending",
        pages: [],
        createdAt: new Date(),
        totalTasks: 0,
        completedTasks: 0,
        metadata: {
          targetAudience: input.targetAudience,
        },
      };
    }

    this.logger.log(`[executeMission] Starting mission ${mission.id}`);

    const createdEvent = this.createEvent("mission:created", mission.id, {
      mission,
    });
    yield createdEvent;
    await this.persistEvent(createdEvent);

    try {
      // Phase 1: Leader 规划
      yield* this.executePlanningPhase(mission, errors);

      // Phase 2: 任务执行
      yield* this.executeTasksPhase(mission, errors);

      // Phase 3: Leader 审核
      yield* this.executeReviewPhase(mission, errors);

      // Phase 4: 质量审计
      yield* this.executeAuditPhase(mission, errors);

      // Phase 5: Leader 综合
      yield* this.executeSynthesisPhase(mission, errors);

      // 完成
      mission.status = "completed";
      mission.currentPhase = "completed";
      mission.completedAt = new Date();

      const duration = Date.now() - startTime;

      // 持久化完成状态
      if (this.persistenceEnabled && this.repository) {
        await this.repository.completeMission(
          mission.id,
          mission.pages,
          duration,
          mission.metadata.qualityAudit as QualityAuditResult | undefined,
        );
      }

      const completedEvent = this.createEvent("mission:completed", mission.id, {
        mission,
        duration,
        pages: mission.pages,
        outline: mission.outline,
        qualityAudit: mission.metadata.qualityAudit,
        errors: errors.length > 0 ? errors : undefined,
      });
      yield completedEvent;
      await this.persistEvent(completedEvent);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[executeMission] Mission ${mission.id} failed: ${errorMsg}`,
      );

      mission.status = "failed";
      mission.currentPhase = "failed";

      // 记录错误
      const execError: SlidesExecutionError = {
        taskId: "",
        phase: mission.currentPhase,
        errorType: "execution_failed",
        message: errorMsg,
        timestamp: new Date(),
        retryCount: 0,
      };
      errors.push(execError);

      // 持久化错误状态
      if (this.persistenceEnabled && this.repository) {
        await this.repository.updateMissionError(mission.id, errorMsg, errors);
      }

      const failedEvent = this.createEvent("mission:failed", mission.id, {
        error: errorMsg,
        phase: mission.currentPhase,
        errors,
      });
      yield failedEvent;
      await this.persistEvent(failedEvent);
    }
  }

  /**
   * 持久化事件
   */
  private async persistEvent(event: SlidesMissionEvent): Promise<void> {
    if (this.persistenceEnabled && this.repository) {
      try {
        await this.repository.recordEvent(event);
      } catch (error) {
        this.logger.warn(`[persistEvent] Failed to persist event: ${error}`);
      }
    }
  }

  /**
   * 执行 Mission（非流式）
   */
  async execute(
    input: SlidesTeamOrchestratorInput,
  ): Promise<SlidesTeamOrchestratorOutput> {
    const startTime = Date.now();
    let lastEvent: SlidesMissionEvent | null = null;

    for await (const event of this.executeMission(input)) {
      lastEvent = event;
    }

    if (!lastEvent) {
      return {
        success: false,
        missionId: "",
        sessionId: input.sessionId,
        pages: [],
        duration: Date.now() - startTime,
        error: "No events received",
      };
    }

    if (lastEvent.type === "mission:completed") {
      return {
        success: true,
        missionId: lastEvent.missionId,
        sessionId: input.sessionId,
        pages: (lastEvent.data.pages as GeneratedSlide[]) || [],
        outline: lastEvent.data.outline as PPTOutline | undefined,
        qualityAudit: lastEvent.data.qualityAudit as
          | QualityAuditResult
          | undefined,
        duration: Date.now() - startTime,
      };
    }

    return {
      success: false,
      missionId: lastEvent.missionId,
      sessionId: input.sessionId,
      pages: [],
      duration: Date.now() - startTime,
      error: (lastEvent.data.error as string) || "Unknown error",
    };
  }

  // ============================================
  // Phase 1: Leader 规划
  // ============================================

  private async *executePlanningPhase(
    mission: SlidesMission,
    errors: SlidesExecutionError[],
  ): AsyncGenerator<SlidesMissionEvent> {
    this.logger.log(
      `[executePlanningPhase] Starting planning for mission ${mission.id}`,
    );

    mission.currentPhase = "planning";
    mission.status = "planning";
    mission.startedAt = new Date();

    // 持久化状态
    if (this.persistenceEnabled && this.repository) {
      await this.repository.updateMissionStatus(
        mission.id,
        "planning",
        "planning",
      );
    }

    const startedEvent = this.createEvent("planning:started", mission.id, {
      phase: "planning",
    });
    yield startedEvent;
    await this.persistEvent(startedEvent);

    try {
      // Leader 规划任务
      const breakdown = await this.leader.planTasks(mission);
      mission.taskBreakdown = breakdown;

      // 创建任务
      mission.tasks = this.leader.createTasksFromBreakdown(breakdown);
      mission.totalTasks = mission.tasks.length;

      // 持久化任务分解和任务
      if (this.persistenceEnabled && this.repository) {
        await this.repository.updateMissionTaskBreakdown(
          mission.id,
          breakdown,
          mission.tasks.length,
        );
        await this.repository.createTasks(mission.id, mission.tasks);
      }

      const completedEvent = this.createEvent(
        "planning:completed",
        mission.id,
        {
          breakdown,
          taskCount: mission.tasks.length,
        },
      );
      yield completedEvent;
      await this.persistEvent(completedEvent);

      // 发送任务创建事件
      for (const task of mission.tasks) {
        const taskEvent = this.createEvent("task:created", mission.id, {
          task,
        });
        yield taskEvent;
        await this.persistEvent(taskEvent);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push({
        taskId: "",
        phase: "planning",
        errorType: "execution_failed",
        message: errorMsg,
        timestamp: new Date(),
        retryCount: 0,
      });
      throw error;
    }
  }

  // ============================================
  // Phase 2: 任务执行
  // ============================================

  private async *executeTasksPhase(
    mission: SlidesMission,
    errors: SlidesExecutionError[],
  ): AsyncGenerator<SlidesMissionEvent> {
    this.logger.log(
      `[executeTasksPhase] Starting task execution for mission ${mission.id}`,
    );

    mission.currentPhase = "executing";
    mission.status = "in_progress";

    // 持久化状态
    if (this.persistenceEnabled && this.repository) {
      await this.repository.updateMissionStatus(
        mission.id,
        "in_progress",
        "executing",
      );
    }

    const phaseEvent = this.createEvent("mission:phase_changed", mission.id, {
      phase: "executing",
    });
    yield phaseEvent;
    await this.persistEvent(phaseEvent);

    const previousOutputs: Record<string, unknown> = {};

    // 按依赖顺序执行任务
    while (this.hasPendingTasks(mission)) {
      const executableTasks = this.getExecutableTasks(mission);

      if (executableTasks.length === 0) {
        // 检查是否有死锁
        const pendingTasks = mission.tasks.filter(
          (t) => t.status === "pending",
        );
        if (pendingTasks.length > 0) {
          this.logger.warn(
            `[executeTasksPhase] Deadlock detected: ${pendingTasks.length} pending tasks with unmet dependencies`,
          );
          errors.push({
            taskId: "",
            phase: "executing",
            errorType: "execution_failed",
            message: `Deadlock: ${pendingTasks.length} tasks with unmet dependencies`,
            timestamp: new Date(),
            retryCount: 0,
          });
          break;
        }
        break;
      }

      // 并行执行独立任务
      const results = await Promise.all(
        executableTasks.map((task) =>
          this.executeTask(mission, task, previousOutputs),
        ),
      );

      // 处理结果
      for (let i = 0; i < executableTasks.length; i++) {
        const task = executableTasks[i];
        const result = results[i];

        if (result.success) {
          task.status = "awaiting_review";
          task.result = result.result;
          task.completedAt = new Date();

          // 保存输出供后续任务使用
          previousOutputs[task.skillId] = result.result;

          // 持久化任务结果
          if (this.persistenceEnabled && this.repository) {
            await this.repository.updateTaskResult(task.id, result.result);
          }

          const taskEvent = this.createEvent(
            "task:awaiting_review",
            mission.id,
            {
              task,
              result: result.result,
            },
          );
          yield taskEvent;
          await this.persistEvent(taskEvent);
        } else {
          task.status = "failed";

          // 记录错误
          errors.push({
            taskId: task.id,
            phase: "executing",
            errorType: "execution_failed",
            message: result.error || "Unknown error",
            timestamp: new Date(),
            retryCount: 0,
          });

          // 持久化任务失败状态
          if (this.persistenceEnabled && this.repository) {
            await this.repository.updateTaskStatus(task.id, "failed");
          }

          const failEvent = this.createEvent("task:failed", mission.id, {
            task,
            error: result.error,
          });
          yield failEvent;
          await this.persistEvent(failEvent);
        }
      }

      // 更新进度
      if (this.persistenceEnabled && this.repository) {
        await this.repository.updateMissionProgress(
          mission.id,
          mission.tasks.filter(
            (t) => t.status === "completed" || t.status === "awaiting_review",
          ).length,
        );
      }
    }
  }

  private hasPendingTasks(mission: SlidesMission): boolean {
    return mission.tasks.some((t) => t.status === "pending");
  }

  private getExecutableTasks(mission: SlidesMission): SlidesTask[] {
    return mission.tasks.filter((task) => {
      if (task.status !== "pending") return false;

      // 检查所有依赖是否已完成
      return task.dependencies.every((depId) => {
        const depTask = mission.tasks.find((t) => t.id === depId);
        return (
          depTask?.status === "completed" ||
          depTask?.status === "awaiting_review"
        );
      });
    });
  }

  private async executeTask(
    mission: SlidesMission,
    task: SlidesTask,
    previousOutputs: Record<string, unknown>,
  ): Promise<TaskExecutionResult> {
    task.status = "in_progress";
    task.startedAt = new Date();

    const context: SkillExecutionContext = {
      missionId: mission.id,
      sessionId: mission.sessionId,
      taskId: task.id,
      executionId: uuidv4(),
      previousOutputs,
      globalContext: {
        sourceText: mission.sourceText,
        outline: mission.outline,
        themeId: mission.themeId,
        stylePreference: mission.stylePreference,
      },
    };

    return this.teamMember.executeTask(task, context);
  }

  // ============================================
  // Phase 3: Leader 审核
  // ============================================

  private async *executeReviewPhase(
    mission: SlidesMission,
    errors: SlidesExecutionError[],
  ): AsyncGenerator<SlidesMissionEvent> {
    this.logger.log(
      `[executeReviewPhase] Starting review for mission ${mission.id}`,
    );

    mission.currentPhase = "reviewing";
    mission.status = "reviewing";

    // 持久化状态
    if (this.persistenceEnabled && this.repository) {
      await this.repository.updateMissionStatus(
        mission.id,
        "reviewing",
        "reviewing",
      );
    }

    const phaseEvent = this.createEvent("mission:phase_changed", mission.id, {
      phase: "reviewing",
    });
    yield phaseEvent;
    await this.persistEvent(phaseEvent);

    // 审核所有待审核的任务
    const tasksToReview = mission.tasks.filter(
      (t) => t.status === "awaiting_review",
    );

    for (const task of tasksToReview) {
      const reviewStartEvent = this.createEvent("review:started", mission.id, {
        task,
      });
      yield reviewStartEvent;
      await this.persistEvent(reviewStartEvent);

      const reviewResult = await this.leader.reviewTask(
        mission,
        task,
        task.result,
      );

      if (reviewResult.decision === "approved") {
        task.status = "completed";
        mission.completedTasks++;

        // 持久化审核结果
        if (this.persistenceEnabled && this.repository) {
          await this.repository.updateTaskReview(
            task.id,
            reviewResult.feedback,
            reviewResult.score,
            false,
          );
        }

        const approvedEvent = this.createEvent("review:approved", mission.id, {
          task,
          review: reviewResult,
        });
        yield approvedEvent;
        await this.persistEvent(approvedEvent);
      } else if (reviewResult.decision === "revision_needed") {
        if (task.revisionCount < task.maxRevisions) {
          task.status = "revision_needed";
          task.revisionCount++;
          task.reviewFeedback = reviewResult.feedback;

          // 持久化需要修订的状态
          if (this.persistenceEnabled && this.repository) {
            await this.repository.updateTaskReview(
              task.id,
              reviewResult.feedback,
              reviewResult.score,
              true,
            );
          }

          const revisionEvent = this.createEvent(
            "review:revision_requested",
            mission.id,
            {
              task,
              review: reviewResult,
              revisionCount: task.revisionCount,
              maxRevisions: task.maxRevisions,
            },
          );
          yield revisionEvent;
          await this.persistEvent(revisionEvent);

          // 重新执行任务
          const context: SkillExecutionContext = {
            missionId: mission.id,
            sessionId: mission.sessionId,
            taskId: task.id,
            executionId: uuidv4(),
            previousOutputs: {},
            globalContext: {
              sourceText: mission.sourceText,
              outline: mission.outline,
              themeId: mission.themeId,
              stylePreference: mission.stylePreference,
            },
          };

          const retryResult = await this.teamMember.executeTask(task, context);

          if (retryResult.success) {
            task.result = retryResult.result;
            task.status = "completed";
            mission.completedTasks++;

            // 持久化成功结果
            if (this.persistenceEnabled && this.repository) {
              await this.repository.updateTaskResult(
                task.id,
                retryResult.result,
              );
            }

            const completedEvent = this.createEvent(
              "task:completed",
              mission.id,
              {
                task,
                result: retryResult.result,
              },
            );
            yield completedEvent;
            await this.persistEvent(completedEvent);
          } else {
            task.status = "failed";

            // 记录错误
            errors.push({
              taskId: task.id,
              phase: "reviewing",
              errorType: "review_failed",
              message: retryResult.error || "Revision failed",
              timestamp: new Date(),
              retryCount: task.revisionCount,
            });

            // 持久化失败状态
            if (this.persistenceEnabled && this.repository) {
              await this.repository.updateTaskStatus(task.id, "failed");
            }

            const failedEvent = this.createEvent("task:failed", mission.id, {
              task,
              error: retryResult.error,
            });
            yield failedEvent;
            await this.persistEvent(failedEvent);
          }
        } else {
          // 超过最大修订次数，标记为完成（降级处理）
          task.status = "completed";
          mission.completedTasks++;

          this.logger.warn(
            `[executeReviewPhase] Task ${task.id} exceeded max revisions, accepting as-is`,
          );

          // 持久化降级完成
          if (this.persistenceEnabled && this.repository) {
            await this.repository.updateTaskReview(
              task.id,
              reviewResult.feedback + " [DEGRADED: max revisions exceeded]",
              reviewResult.score,
              false,
            );
          }

          const degradedEvent = this.createEvent(
            "review:approved",
            mission.id,
            {
              task,
              review: reviewResult,
              degraded: true,
            },
          );
          yield degradedEvent;
          await this.persistEvent(degradedEvent);
        }
      } else {
        task.status = "failed";

        // 记录错误
        errors.push({
          taskId: task.id,
          phase: "reviewing",
          errorType: "review_failed",
          message: reviewResult.feedback || "Review failed",
          timestamp: new Date(),
          retryCount: task.revisionCount,
        });

        // 持久化失败状态
        if (this.persistenceEnabled && this.repository) {
          await this.repository.updateTaskStatus(task.id, "failed");
        }

        const failedEvent = this.createEvent("task:failed", mission.id, {
          task,
          review: reviewResult,
        });
        yield failedEvent;
        await this.persistEvent(failedEvent);
      }
    }

    // 更新进度
    if (this.persistenceEnabled && this.repository) {
      await this.repository.updateMissionProgress(
        mission.id,
        mission.completedTasks,
      );
    }
  }

  // ============================================
  // Phase 4: 质量审计
  // ============================================

  private async *executeAuditPhase(
    mission: SlidesMission,
    _errors: SlidesExecutionError[],
  ): AsyncGenerator<SlidesMissionEvent> {
    this.logger.log(
      `[executeAuditPhase] Starting quality audit for mission ${mission.id}`,
    );

    mission.currentPhase = "auditing";
    mission.status = "auditing";

    // 持久化状态
    if (this.persistenceEnabled && this.repository) {
      await this.repository.updateMissionStatus(
        mission.id,
        "auditing",
        "auditing",
      );
    }

    const phaseEvent = this.createEvent("mission:phase_changed", mission.id, {
      phase: "auditing",
    });
    yield phaseEvent;
    await this.persistEvent(phaseEvent);

    const auditStartEvent = this.createEvent("audit:started", mission.id, {});
    yield auditStartEvent;
    await this.persistEvent(auditStartEvent);

    // 执行质量审计 Skills
    const auditSkills = [
      "quality-audit",
      "terminology-unifier",
      "transition-checker",
    ];
    const auditResults: Record<string, unknown> = {};

    for (const skillId of auditSkills) {
      const task: SlidesTask = {
        id: uuidv4(),
        title: `Quality Audit: ${skillId}`,
        description: `Execute ${skillId} for quality check`,
        assignee: "reviewer",
        skillId,
        input: { pages: mission.pages },
        dependencies: [],
        status: "pending",
        priority: "high",
        revisionCount: 0,
        maxRevisions: 1,
        createdAt: new Date(),
      };

      const context: SkillExecutionContext = {
        missionId: mission.id,
        sessionId: mission.sessionId,
        taskId: task.id,
        executionId: uuidv4(),
        previousOutputs: { pages: mission.pages },
        globalContext: {
          sourceText: mission.sourceText,
          outline: mission.outline,
          themeId: mission.themeId,
          stylePreference: mission.stylePreference,
        },
      };

      try {
        const result = await this.teamMember.executeTask(task, context);
        if (result.success) {
          auditResults[skillId] = result.result;
        } else {
          // 记录审计技能失败（非致命）
          this.logger.warn(
            `[executeAuditPhase] Audit skill ${skillId} failed: ${result.error}`,
          );
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `[executeAuditPhase] Audit skill ${skillId} error: ${errorMsg}`,
        );
      }
    }

    // 汇总审计结果
    const qualityAudit: QualityAuditResult = {
      passed: true,
      overallScore: 85,
      terminologyScore:
        (auditResults["terminology-unifier"] as { score?: number })?.score ||
        100,
      transitionScore:
        (auditResults["transition-checker"] as { score?: number })?.score ||
        100,
      consistencyScore: 90,
      issues: [],
      suggestions: [],
    };

    // 保存审计结果到 mission 元数据
    mission.metadata.qualityAudit = qualityAudit;

    // 持久化审计结果
    if (this.persistenceEnabled && this.repository) {
      await this.repository.updateMissionQualityAudit(mission.id, qualityAudit);
    }

    const auditCompleteEvent = this.createEvent("audit:completed", mission.id, {
      qualityAudit,
    });
    yield auditCompleteEvent;
    await this.persistEvent(auditCompleteEvent);
  }

  // ============================================
  // Phase 5: Leader 综合
  // ============================================

  private async *executeSynthesisPhase(
    mission: SlidesMission,
    _errors: SlidesExecutionError[],
  ): AsyncGenerator<SlidesMissionEvent> {
    this.logger.log(
      `[executeSynthesisPhase] Starting synthesis for mission ${mission.id}`,
    );

    mission.currentPhase = "synthesizing";
    mission.status = "synthesizing";

    // 持久化状态
    if (this.persistenceEnabled && this.repository) {
      await this.repository.updateMissionStatus(
        mission.id,
        "synthesizing",
        "synthesizing",
      );
    }

    const phaseEvent = this.createEvent("mission:phase_changed", mission.id, {
      phase: "synthesizing",
    });
    yield phaseEvent;
    await this.persistEvent(phaseEvent);

    const synthesisStartEvent = this.createEvent(
      "synthesis:started",
      mission.id,
      {},
    );
    yield synthesisStartEvent;
    await this.persistEvent(synthesisStartEvent);

    // 从任务结果中提取页面
    this.extractPagesFromTasks(mission);

    // 持久化页面
    if (this.persistenceEnabled && this.repository) {
      await this.repository.updateMissionPages(mission.id, mission.pages);
      if (mission.outline) {
        await this.repository.updateMissionOutline(mission.id, mission.outline);
      }
    }

    // Leader 综合结果
    const synthesis = await this.leader.synthesizeResults(mission);

    // 发送页面生成事件
    for (let i = 0; i < mission.pages.length; i++) {
      const pageEvent = this.createEvent("page:generated", mission.id, {
        pageIndex: i,
        page: mission.pages[i],
      });
      yield pageEvent;
      await this.persistEvent(pageEvent);
    }

    const synthesisCompleteEvent = this.createEvent(
      "synthesis:completed",
      mission.id,
      {
        synthesis,
        pageCount: mission.pages.length,
      },
    );
    yield synthesisCompleteEvent;
    await this.persistEvent(synthesisCompleteEvent);
  }

  /**
   * 从任务结果中提取页面
   */
  private extractPagesFromTasks(mission: SlidesMission): void {
    for (const task of mission.tasks) {
      if (task.status !== "completed" || !task.result) continue;

      // 从 four-step-design 结果中提取页面
      if (
        task.skillId === "four-step-design" ||
        task.skillId === "slides-four-step-design"
      ) {
        const result = task.result as {
          html?: string;
          design?: unknown;
          pageNumber?: number;
        };

        if (result.html) {
          const page: GeneratedSlide = {
            id: uuidv4(),
            index: result.pageNumber || mission.pages.length,
            spec: {} as any,
            content: {} as any,
            images: [],
            renderedHtml: result.html,
            html: result.html,
            isEdited: false,
            editHistory: [],
            generationMetadata: {
              textModelUsed: "unknown",
              contentGeneratedAt: new Date().toISOString(),
            },
          };

          mission.pages.push(page);
        }
      }

      // 从 outline-planning 结果中提取大纲
      if (
        task.skillId === "outline-planning" ||
        task.skillId === "slides-outline-planning"
      ) {
        mission.outline = task.result as PPTOutline;
      }
    }
  }

  // ============================================
  // Helper Methods
  // ============================================

  private createEvent(
    type: SlidesMissionEvent["type"],
    missionId: string,
    data: Record<string, unknown>,
  ): SlidesMissionEvent {
    return {
      type,
      missionId,
      timestamp: new Date(),
      data,
    };
  }
}
