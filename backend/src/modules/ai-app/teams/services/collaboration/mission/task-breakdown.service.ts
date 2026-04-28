/**
 * Task Breakdown Service
 *
 * 负责任务分解相关的核心逻辑，从 TeamMissionService 中提取
 * - parseTaskBreakdown: 解析 AI 生成的任务分解
 * - createTasksFromBreakdown: 根据分解结果创建任务
 * - rebalanceTaskAssignments: 任务分配再平衡
 * - validateChapterUniqueness: 章节唯一性验证
 *
 * ★ 能力下沉：核心解析逻辑委托给 AI Engine 的 TaskDecomposerService
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../../../common/prisma/prisma.service";
import { AgentTaskStatus, TaskPriority } from "@prisma/client";
import { extractChapterKey, mapTaskType } from "../utils";
import {
  TeamMemberBase,
  TaskBreakdownItem,
  TaskBreakdownData,
} from "../interfaces";

// ★ AI Engine 服务（通过 AIEngineFacade 访问）
import { AgentFacade } from "../../../../../ai-harness/facade";
import type { TeamMemberInfo } from "../../../../../ai-engine/facade";

@Injectable()
export class TaskBreakdownService {
  private readonly logger = new Logger(TaskBreakdownService.name);

  constructor(
    private prisma: PrismaService,
    // ★ 通过 AgentFacade 访问任务分解服务
    private agentFacade: AgentFacade,
  ) {}

  // ==================== 任务分解解析 ====================

  /**
   * 解析 AI 生成的任务分解内容
   * ★ 委托给 AI Engine 的 TaskDecomposerService
   */
  parseTaskBreakdown(
    content: string,
    teamMembers: TeamMemberBase[],
  ): TaskBreakdownData {
    // ★ 转换成员格式为 AI Engine 接口格式
    const memberInfos: TeamMemberInfo[] = teamMembers.map((m) => ({
      id: m.id,
      agentName: m.agentName,
      displayName: m.displayName,
      aiModel: m.aiModel,
      isLeader: m.isLeader,
    }));

    // ★ 委托给 AI Engine 解析
    const result = this.agentFacade.taskDecomposer?.parseTaskBreakdown({
      content,
      teamMembers: memberInfos,
    });

    if (!result) {
      this.logger.warn(
        "[parseTaskBreakdown] taskDecomposer unavailable, returning empty breakdown",
      );
      return { understanding: "", tasks: [], executionPlan: "", risks: "" };
    }

    // ★ 转换结果为 AI Teams 格式
    const tasks: TaskBreakdownItem[] = result.tasks.map((t) => ({
      title: t.title,
      description: t.description,
      assigneeId: t.assigneeId,
      assigneeName: t.assigneeName,
      reason: t.reason,
      priority: t.priority,
      taskType: t.taskType,
      dependsOn: t.dependsOn,
    }));

    return {
      understanding: result.understanding,
      tasks,
      executionPlan: result.executionPlan,
      risks: result.risks,
    };
  }

  // ==================== 任务创建 ====================

  /**
   * 根据分解结果创建任务
   *
   * 优化策略：
   * 1. 分离无依赖任务和有依赖任务
   * 2. 无依赖任务使用 createMany 批量插入
   * 3. 有依赖任务在事务中顺序创建
   */
  async createTasksFromBreakdown(
    missionId: string,
    breakdown: TaskBreakdownData,
    teamMembers: TeamMemberBase[],
  ): Promise<Map<number, string>> {
    const taskIdMap = new Map<number, string>();

    // 任务分配再平衡
    this.rebalanceTaskAssignments(breakdown, teamMembers);

    // 章节唯一性验证
    const titles = breakdown.tasks.map((t) => t.title);
    const { duplicatesInNew, duplicatesInDb } =
      await this.validateChapterUniqueness(missionId, titles);

    if (duplicatesInNew.length > 0) {
      this.logger.warn(
        `[createTasksFromBreakdown] Found ${duplicatesInNew.length} duplicate chapters in new tasks: ${duplicatesInNew.join(", ")}`,
      );
      const seenKeys = new Set<string>();
      breakdown.tasks = breakdown.tasks.filter((t) => {
        const key = extractChapterKey(t.title);
        if (key && seenKeys.has(key)) {
          this.logger.warn(
            `[createTasksFromBreakdown] Skipping duplicate chapter: ${t.title}`,
          );
          return false;
        }
        if (key) seenKeys.add(key);
        return true;
      });
    }

    if (duplicatesInDb.length > 0) {
      this.logger.warn(
        `[createTasksFromBreakdown] Found ${duplicatesInDb.length} chapters already exist in DB: ${duplicatesInDb.join(", ")}`,
      );
      const existingKeys = new Set<string>();
      const existingTasks = await this.prisma.agentTask.findMany({
        where: {
          missionId,
          status: { not: AgentTaskStatus.CANCELLED },
        },
        select: { title: true },
      });
      for (const t of existingTasks) {
        const key = extractChapterKey(t.title);
        if (key) existingKeys.add(key);
      }

      breakdown.tasks = breakdown.tasks.filter((t) => {
        const key = extractChapterKey(t.title);
        if (key && existingKeys.has(key)) {
          this.logger.warn(
            `[createTasksFromBreakdown] Skipping already existing chapter: ${t.title}`,
          );
          return false;
        }
        return true;
      });
    }

    // 分离无依赖任务和有依赖任务
    const independentTasks: Array<{
      index: number;
      task: TaskBreakdownItem;
      assignee: TeamMemberBase;
    }> = [];
    const dependentTasks: Array<{
      index: number;
      task: TaskBreakdownItem;
      assignee: TeamMemberBase;
    }> = [];

    for (let i = 0; i < breakdown.tasks.length; i++) {
      const t = breakdown.tasks[i];
      const assignee = teamMembers.find((m) => m.id === t.assigneeId);

      if (!assignee) {
        this.logger.warn(
          `[createTasksFromBreakdown] Assignee not found for task "${t.title}", skipping`,
        );
        continue;
      }

      if (t.dependsOn.length === 0) {
        independentTasks.push({ index: i, task: t, assignee });
      } else {
        dependentTasks.push({ index: i, task: t, assignee });
      }
    }

    this.logger.log(
      `[createTasksFromBreakdown] Task distribution: ${independentTasks.length} independent, ${dependentTasks.length} dependent`,
    );

    // 使用事务确保原子性
    await this.prisma.$transaction(async (tx) => {
      // Phase 1: 批量创建无依赖任务
      if (independentTasks.length > 0) {
        const independentTaskData = independentTasks.map(
          ({ task, assignee }) => ({
            missionId,
            title: task.title,
            description: task.description || task.title,
            assignedToId: assignee.id,
            assignedReason: task.reason,
            priority: task.priority as TaskPriority,
            taskType: mapTaskType(task.taskType),
            status: AgentTaskStatus.PENDING,
            dependsOnIds: [] as string[],
            revisionCount: 0,
            maxRevisions: 3,
          }),
        );

        // 使用 createManyAndReturn 批量创建并获取 ID
        const createdTasks = await tx.agentTask.createManyAndReturn({
          data: independentTaskData,
        });

        // 映射创建的任务 ID
        for (let i = 0; i < createdTasks.length; i++) {
          const originalIndex = independentTasks[i].index;
          taskIdMap.set(originalIndex, createdTasks[i].id);

          const chapterKey = extractChapterKey(independentTasks[i].task.title);
          if (chapterKey) {
            this.logger.debug(
              `[createTasksFromBreakdown] Created task for chapter ${chapterKey}: ${createdTasks[i].id}`,
            );
          }
        }

        this.logger.log(
          `[createTasksFromBreakdown] Batch created ${createdTasks.length} independent tasks`,
        );
      }

      // Phase 2: 顺序创建有依赖任务
      for (const { index, task, assignee } of dependentTasks) {
        // 构建依赖 ID 列表
        const dependsOnIds: string[] = [];
        for (const depIndex of task.dependsOn) {
          const depTaskId = taskIdMap.get(depIndex);
          if (depTaskId) {
            dependsOnIds.push(depTaskId);
          }
        }

        const chapterKey = extractChapterKey(task.title);
        const createdTask = await tx.agentTask.create({
          data: {
            missionId,
            title: task.title,
            description: task.description || task.title,
            assignedToId: assignee.id,
            assignedReason: task.reason,
            priority: task.priority as TaskPriority,
            taskType: mapTaskType(task.taskType),
            status: AgentTaskStatus.PENDING,
            dependsOnIds,
            revisionCount: 0,
            maxRevisions: 3,
          },
        });

        if (chapterKey) {
          this.logger.debug(
            `[createTasksFromBreakdown] Created task for chapter ${chapterKey}: ${createdTask.id}`,
          );
        }

        taskIdMap.set(index, createdTask.id);

        this.logger.log(
          `[createTasksFromBreakdown] Created dependent task: "${task.title}" (${createdTask.id}) assigned to ${assignee.agentName || assignee.displayName}`,
        );
      }
    });

    this.logger.log(
      `[createTasksFromBreakdown] Total created: ${taskIdMap.size} tasks`,
    );

    return taskIdMap;
  }

  // ==================== 任务再平衡 ====================

  /**
   * 任务分配再平衡
   * ★ 委托给 AI Engine 的 TaskDecomposerService
   */
  rebalanceTaskAssignments(
    breakdown: TaskBreakdownData,
    teamMembers: TeamMemberBase[],
  ): void {
    if (breakdown.tasks.length === 0 || teamMembers.length === 0) {
      return;
    }

    // ★ 转换成员格式为 AI Engine 接口格式
    const memberInfos: TeamMemberInfo[] = teamMembers.map((m) => ({
      id: m.id,
      agentName: m.agentName,
      displayName: m.displayName,
      aiModel: m.aiModel,
      isLeader: m.isLeader,
    }));

    // ★ 转换任务格式为 AI Engine 接口格式
    const taskDefinitions = breakdown.tasks.map((t) => ({
      title: t.title,
      description: t.description,
      assigneeId: t.assigneeId,
      assigneeName: t.assigneeName,
      reason: t.reason,
      priority: t.priority as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      taskType: t.taskType,
      dependsOn: t.dependsOn,
    }));

    // ★ 委托给 AI Engine 执行再平衡
    const rebalancedTasks =
      this.agentFacade.taskDecomposer?.rebalanceTaskAssignments(
        taskDefinitions,
        memberInfos,
      );

    if (!rebalancedTasks) {
      this.logger.warn(
        "[rebalanceTaskAssignments] taskDecomposer unavailable, skipping rebalance",
      );
      return;
    }

    // ★ 更新原数组中的任务分配
    for (
      let i = 0;
      i < breakdown.tasks.length && i < rebalancedTasks.length;
      i++
    ) {
      breakdown.tasks[i].assigneeId = rebalancedTasks[i].assigneeId;
      breakdown.tasks[i].assigneeName = rebalancedTasks[i].assigneeName;
    }
  }

  // ==================== 章节唯一性验证 ====================

  /**
   * 验证章节唯一性
   */
  async validateChapterUniqueness(
    missionId: string,
    newTitles: string[],
  ): Promise<{ duplicatesInNew: string[]; duplicatesInDb: string[] }> {
    const duplicatesInNew: string[] = [];
    const duplicatesInDb: string[] = [];

    // 检查新任务列表中的重复
    const chapterKeys = new Map<string, string>();
    for (const title of newTitles) {
      const key = extractChapterKey(title);
      if (key) {
        if (chapterKeys.has(key)) {
          duplicatesInNew.push(`${title} (与 ${chapterKeys.get(key)} 重复)`);
        } else {
          chapterKeys.set(key, title);
        }
      }
    }

    // 检查数据库中已存在的任务
    if (chapterKeys.size > 0) {
      const existingTasks = await this.prisma.agentTask.findMany({
        where: {
          missionId,
          status: {
            not: AgentTaskStatus.CANCELLED,
          },
        },
        select: { title: true },
      });

      for (const existing of existingTasks) {
        const existingKey = extractChapterKey(existing.title);
        if (existingKey && chapterKeys.has(existingKey)) {
          duplicatesInDb.push(
            `${chapterKeys.get(existingKey)} (数据库中已存在: ${existing.title})`,
          );
        }
      }
    }

    return { duplicatesInNew, duplicatesInDb };
  }
}
