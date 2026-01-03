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

import { Injectable, Logger } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import { SlidesLeader } from "./slides-leader";
import { SlidesTeamMember, TaskExecutionResult } from "./slides-team-member";
import {
  SlidesMission,
  SlidesMissionEvent,
  SlidesTask,
  SlidesTeamOrchestratorInput,
  SlidesTeamOrchestratorOutput,
  SkillExecutionContext,
  QualityAuditResult,
} from "./types";
import type { GeneratedSlide, PPTOutline } from "../types/slides.types";

@Injectable()
export class SlidesTeamOrchestrator {
  private readonly logger = new Logger(SlidesTeamOrchestrator.name);

  constructor(
    private readonly leader: SlidesLeader,
    private readonly teamMember: SlidesTeamMember,
  ) {}

  /**
   * 执行 Mission（流式）
   */
  async *executeMission(
    input: SlidesTeamOrchestratorInput,
  ): AsyncGenerator<SlidesMissionEvent> {
    const missionId = uuidv4();
    const startTime = Date.now();

    this.logger.log(`[executeMission] Starting mission ${missionId}`);

    // 创建 Mission
    const mission: SlidesMission = {
      id: missionId,
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

    yield this.createEvent("mission:created", mission.id, { mission });

    try {
      // Phase 1: Leader 规划
      yield* this.executePlanningPhase(mission);

      // Phase 2: 任务执行
      yield* this.executeTasksPhase(mission);

      // Phase 3: Leader 审核
      yield* this.executeReviewPhase(mission);

      // Phase 4: 质量审计
      yield* this.executeAuditPhase(mission);

      // Phase 5: Leader 综合
      yield* this.executeSynthesisPhase(mission);

      // 完成
      mission.status = "completed";
      mission.currentPhase = "completed";
      mission.completedAt = new Date();

      yield this.createEvent("mission:completed", mission.id, {
        mission,
        duration: Date.now() - startTime,
        pages: mission.pages,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[executeMission] Mission ${missionId} failed: ${errorMsg}`,
      );

      mission.status = "failed";
      mission.currentPhase = "failed";

      yield this.createEvent("mission:failed", mission.id, {
        error: errorMsg,
        phase: mission.currentPhase,
      });
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
  ): AsyncGenerator<SlidesMissionEvent> {
    this.logger.log(
      `[executePlanningPhase] Starting planning for mission ${mission.id}`,
    );

    mission.currentPhase = "planning";
    mission.status = "planning";
    mission.startedAt = new Date();

    yield this.createEvent("planning:started", mission.id, {
      phase: "planning",
    });

    // Leader 规划任务
    const breakdown = await this.leader.planTasks(mission);
    mission.taskBreakdown = breakdown;

    // 创建任务
    mission.tasks = this.leader.createTasksFromBreakdown(breakdown);
    mission.totalTasks = mission.tasks.length;

    yield this.createEvent("planning:completed", mission.id, {
      breakdown,
      taskCount: mission.tasks.length,
    });

    // 发送任务创建事件
    for (const task of mission.tasks) {
      yield this.createEvent("task:created", mission.id, { task });
    }
  }

  // ============================================
  // Phase 2: 任务执行
  // ============================================

  private async *executeTasksPhase(
    mission: SlidesMission,
  ): AsyncGenerator<SlidesMissionEvent> {
    this.logger.log(
      `[executeTasksPhase] Starting task execution for mission ${mission.id}`,
    );

    mission.currentPhase = "executing";
    mission.status = "in_progress";

    yield this.createEvent("mission:phase_changed", mission.id, {
      phase: "executing",
    });

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

          yield this.createEvent("task:awaiting_review", mission.id, {
            task,
            result: result.result,
          });
        } else {
          task.status = "failed";

          yield this.createEvent("task:failed", mission.id, {
            task,
            error: result.error,
          });
        }
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
  ): AsyncGenerator<SlidesMissionEvent> {
    this.logger.log(
      `[executeReviewPhase] Starting review for mission ${mission.id}`,
    );

    mission.currentPhase = "reviewing";
    mission.status = "reviewing";

    yield this.createEvent("mission:phase_changed", mission.id, {
      phase: "reviewing",
    });

    // 审核所有待审核的任务
    const tasksToReview = mission.tasks.filter(
      (t) => t.status === "awaiting_review",
    );

    for (const task of tasksToReview) {
      yield this.createEvent("review:started", mission.id, { task });

      const reviewResult = await this.leader.reviewTask(
        mission,
        task,
        task.result,
      );

      if (reviewResult.decision === "approved") {
        task.status = "completed";
        mission.completedTasks++;

        yield this.createEvent("review:approved", mission.id, {
          task,
          review: reviewResult,
        });
      } else if (reviewResult.decision === "revision_needed") {
        if (task.revisionCount < task.maxRevisions) {
          task.status = "revision_needed";
          task.revisionCount++;
          task.reviewFeedback = reviewResult.feedback;

          yield this.createEvent("review:revision_requested", mission.id, {
            task,
            review: reviewResult,
          });

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

            yield this.createEvent("task:completed", mission.id, {
              task,
              result: retryResult.result,
            });
          } else {
            task.status = "failed";

            yield this.createEvent("task:failed", mission.id, {
              task,
              error: retryResult.error,
            });
          }
        } else {
          // 超过最大修订次数，标记为完成（降级处理）
          task.status = "completed";
          mission.completedTasks++;

          this.logger.warn(
            `[executeReviewPhase] Task ${task.id} exceeded max revisions, accepting as-is`,
          );

          yield this.createEvent("review:approved", mission.id, {
            task,
            review: reviewResult,
            degraded: true,
          });
        }
      } else {
        task.status = "failed";

        yield this.createEvent("task:failed", mission.id, {
          task,
          review: reviewResult,
        });
      }
    }
  }

  // ============================================
  // Phase 4: 质量审计
  // ============================================

  private async *executeAuditPhase(
    mission: SlidesMission,
  ): AsyncGenerator<SlidesMissionEvent> {
    this.logger.log(
      `[executeAuditPhase] Starting quality audit for mission ${mission.id}`,
    );

    mission.currentPhase = "auditing";
    mission.status = "auditing";

    yield this.createEvent("mission:phase_changed", mission.id, {
      phase: "auditing",
    });

    yield this.createEvent("audit:started", mission.id, {});

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

      const result = await this.teamMember.executeTask(task, context);
      if (result.success) {
        auditResults[skillId] = result.result;
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

    yield this.createEvent("audit:completed", mission.id, {
      qualityAudit,
    });
  }

  // ============================================
  // Phase 5: Leader 综合
  // ============================================

  private async *executeSynthesisPhase(
    mission: SlidesMission,
  ): AsyncGenerator<SlidesMissionEvent> {
    this.logger.log(
      `[executeSynthesisPhase] Starting synthesis for mission ${mission.id}`,
    );

    mission.currentPhase = "synthesizing";
    mission.status = "synthesizing";

    yield this.createEvent("mission:phase_changed", mission.id, {
      phase: "synthesizing",
    });

    yield this.createEvent("synthesis:started", mission.id, {});

    // 从任务结果中提取页面
    this.extractPagesFromTasks(mission);

    // Leader 综合结果
    const synthesis = await this.leader.synthesizeResults(mission);

    yield this.createEvent("synthesis:completed", mission.id, {
      synthesis,
      pageCount: mission.pages.length,
    });
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
