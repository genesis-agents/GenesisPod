/**
 * Task Breakdown Service
 *
 * 负责任务分解相关的核心逻辑，从 TeamMissionService 中提取
 * - parseTaskBreakdown: 解析 AI 生成的任务分解
 * - createTasksFromBreakdown: 根据分解结果创建任务
 * - rebalanceTaskAssignments: 任务分配再平衡
 * - validateChapterUniqueness: 章节唯一性验证
 */

import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../../../../../common/prisma/prisma.service";
import { AgentTaskStatus, TaskPriority } from "@prisma/client";
import {
  findMemberByNameEnhanced,
  createMatchStatistics,
  isMatchFailureRateExceeded,
  formatMatchFailureError,
  extractChapterKey,
  mapTaskType,
  type MatchStatistics,
  type UnmatchedItem,
} from "../utils";
import {
  TeamMemberBase,
  TaskBreakdownItem,
  TaskBreakdownData,
} from "../interfaces";

@Injectable()
export class TaskBreakdownService {
  private readonly logger = new Logger(TaskBreakdownService.name);

  constructor(private prisma: PrismaService) {}

  // ==================== 任务分解解析 ====================

  /**
   * 解析 AI 生成的任务分解内容
   */
  parseTaskBreakdown(
    content: string,
    teamMembers: TeamMemberBase[],
  ): TaskBreakdownData {
    const tasks: TaskBreakdownItem[] = [];

    // 诊断日志：记录可用的成员名称列表
    const availableMemberNames = teamMembers.map((m) => ({
      id: m.id,
      agentName: m.agentName,
      displayName: m.displayName,
      matchKey: (m.agentName || m.displayName)?.toLowerCase(),
    }));
    this.logger.debug(
      `[parseTaskBreakdown] Available members (${teamMembers.length}): ${JSON.stringify(availableMemberNames.map((m) => m.agentName || m.displayName))}`,
    );

    const matchStats: MatchStatistics = createMatchStatistics();

    // 尝试解析表格
    const tableMatch = content.match(
      /\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|/g,
    );

    if (tableMatch) {
      for (const row of tableMatch) {
        const cells = row.split("|").filter((c) => c.trim());
        if (
          cells.length >= 6 &&
          !cells[0].includes("#") &&
          !cells[0].includes("-")
        ) {
          matchStats.totalRows++;
          const title = cells[1]?.trim() || "";
          const assigneeName = cells[2]?.trim().replace("@", "") || "";
          const reason = cells[3]?.trim() || "";
          const priorityStr = cells[4]?.trim().toLowerCase() || "medium";
          const dependsStr = cells[5]?.trim() || "";

          // 使用增强版成员匹配（支持模糊匹配）
          const matchResult = findMemberByNameEnhanced(
            assigneeName,
            teamMembers,
          );
          const assignee = matchResult.member;

          // 诊断日志
          if (matchResult.matchInfo.type === "none" && assigneeName) {
            const unmatchedItem: UnmatchedItem = {
              taskTitle: title,
              inputName: assigneeName,
              availableMembers: availableMemberNames.map(
                (m) => m.agentName || m.displayName,
              ),
            };
            matchStats.unmatched.push(unmatchedItem);
            this.logger.warn(
              `[parseTaskBreakdown] ❌ Member match FAILED: "${assigneeName}" | Available: [${availableMemberNames.map((m) => m.agentName || m.displayName).join(", ")}]`,
            );
          } else if (matchResult.matchInfo.type === "fuzzy") {
            matchStats.fuzzyMatched++;
            this.logger.warn(
              `[parseTaskBreakdown] ⚠️ Fuzzy match: "${assigneeName}" → "${matchResult.matchInfo.suggestion}" (confidence: ${matchResult.matchInfo.confidence.toFixed(2)})`,
            );
          }

          // 解析依赖
          const dependsOn: number[] = [];
          const depMatches = dependsStr.match(/\d+/g);
          if (depMatches) {
            for (const dep of depMatches) {
              dependsOn.push(parseInt(dep, 10) - 1);
            }
          }

          // 解析优先级
          let priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = "MEDIUM";
          if (
            priorityStr.includes("关键") ||
            priorityStr.includes("critical")
          ) {
            priority = "CRITICAL";
          } else if (
            priorityStr.includes("高") ||
            priorityStr.includes("high")
          ) {
            priority = "HIGH";
          } else if (
            priorityStr.includes("低") ||
            priorityStr.includes("low")
          ) {
            priority = "LOW";
          }

          if (title && assignee) {
            matchStats.matched++;
            const memberKey = assignee.agentName || assignee.displayName;
            matchStats.memberTaskCount.set(
              memberKey,
              (matchStats.memberTaskCount.get(memberKey) || 0) + 1,
            );

            tasks.push({
              title,
              description: title,
              assigneeId: assignee.id,
              assigneeName: assignee.agentName || assignee.displayName,
              reason,
              priority,
              taskType: "implementation",
              dependsOn,
            });
          }
        }
      }
    }

    // 诊断日志：输出匹配统计摘要
    const taskDistribution = Object.fromEntries(matchStats.memberTaskCount);
    const membersWithNoTasks = teamMembers.filter(
      (m) => !matchStats.memberTaskCount.has(m.agentName || m.displayName),
    );

    this.logger.log(
      `[parseTaskBreakdown] 📊 Match Summary: ${matchStats.matched}/${matchStats.totalRows} tasks matched (fuzzy: ${matchStats.fuzzyMatched})`,
    );
    this.logger.log(
      `[parseTaskBreakdown] 📊 Task Distribution: ${JSON.stringify(taskDistribution)}`,
    );

    if (matchStats.unmatched.length > 0) {
      this.logger.warn(
        `[parseTaskBreakdown] ⚠️ Unmatched names (${matchStats.unmatched.length}): ${JSON.stringify(matchStats.unmatched.map((u) => u.inputName))}`,
      );
    }

    if (membersWithNoTasks.length > 0) {
      this.logger.warn(
        `[parseTaskBreakdown] ⚠️ Members with NO tasks (${membersWithNoTasks.length}): ${JSON.stringify(membersWithNoTasks.map((m) => m.agentName || m.displayName))}`,
      );
    }

    // 失败率检测：超过 10% 视为规划失败
    if (isMatchFailureRateExceeded(matchStats, 0.1)) {
      const errorMsg = formatMatchFailureError(
        matchStats,
        availableMemberNames.map((m) => m.agentName || m.displayName),
      );
      this.logger.error(`[parseTaskBreakdown] ❌ ${errorMsg}`);
      throw new BadRequestException(errorMsg);
    }

    // 如果解析失败，创建一个默认任务
    if (tasks.length === 0 && teamMembers.length > 0) {
      this.logger.warn(
        `[parseTaskBreakdown] ⚠️ No tasks parsed, creating default task for first member`,
      );
      tasks.push({
        title: "执行任务",
        description: "完成用户请求的任务",
        assigneeId: teamMembers[0].id,
        assigneeName: teamMembers[0].agentName || teamMembers[0].displayName,
        reason: "作为团队成员执行任务",
        priority: "MEDIUM",
        taskType: "implementation",
        dependsOn: [],
      });
    }

    return {
      understanding: content.match(/## 任务理解\n([^#]+)/)?.[1]?.trim() || "",
      tasks,
      executionPlan: content.match(/## 执行计划\n([^#]+)/)?.[1]?.trim() || "",
      risks: content.match(/## 风险提示\n([^#]+)/)?.[1]?.trim() || "",
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
   */
  rebalanceTaskAssignments(
    breakdown: TaskBreakdownData,
    teamMembers: TeamMemberBase[],
  ): void {
    if (breakdown.tasks.length === 0 || teamMembers.length === 0) {
      return;
    }

    const executors = teamMembers.filter((m) => !m.isLeader);
    if (executors.length === 0) {
      this.logger.warn(
        `[rebalanceTaskAssignments] No non-leader members found, skipping rebalancing`,
      );
      return;
    }

    // 统计当前分配情况
    const assignmentCount = new Map<string, number>();
    for (const member of executors) {
      assignmentCount.set(member.id, 0);
    }

    for (const task of breakdown.tasks) {
      const assigneeId = task.assigneeId;
      if (assignmentCount.has(assigneeId)) {
        assignmentCount.set(
          assigneeId,
          (assignmentCount.get(assigneeId) || 0) + 1,
        );
      }
    }

    // 计算理想分配
    const totalTasks = breakdown.tasks.length;
    const idealTasksPerMember = Math.ceil(totalTasks / executors.length);
    const minTasksPerMember = Math.floor(totalTasks / executors.length);

    // 找出过载和闲置的成员
    const overloadedMembers: string[] = [];
    const idleMembers: string[] = [];

    for (const [memberId, count] of assignmentCount) {
      if (count > idealTasksPerMember * 1.5) {
        overloadedMembers.push(memberId);
      }
      if (count === 0) {
        idleMembers.push(memberId);
      }
    }

    // 如果有闲置成员，需要从过载成员那里转移任务
    if (idleMembers.length > 0 && overloadedMembers.length > 0) {
      this.logger.warn(
        `[rebalanceTaskAssignments] Detected imbalanced allocation: ${overloadedMembers.length} overloaded, ${idleMembers.length} idle members`,
      );

      const memberMap = new Map(executors.map((m) => [m.id, m]));
      const idleMemberQueue = [...idleMembers];
      let idleIndex = 0;

      for (const task of breakdown.tasks) {
        if (idleIndex >= idleMemberQueue.length) break;

        const currentCount = assignmentCount.get(task.assigneeId) || 0;

        if (
          currentCount > idealTasksPerMember &&
          idleMembers.includes(idleMemberQueue[idleIndex]) === false
        ) {
          const idleMemberId = idleMemberQueue[idleIndex];
          const idleMemberCount = assignmentCount.get(idleMemberId) || 0;

          if (idleMemberCount < minTasksPerMember) {
            const idleMember = memberMap.get(idleMemberId);
            if (idleMember) {
              const oldAssignee = task.assigneeName;
              task.assigneeId = idleMemberId;
              task.assigneeName =
                idleMember.agentName || idleMember.displayName;

              assignmentCount.set(task.assigneeId, idleMemberCount + 1);
              assignmentCount.set(
                executors.find(
                  (m) =>
                    m.agentName === oldAssignee ||
                    m.displayName === oldAssignee,
                )?.id || "",
                currentCount - 1,
              );

              this.logger.log(
                `[rebalanceTaskAssignments] Reassigned task "${task.title}" from ${oldAssignee} to ${task.assigneeName}`,
              );

              if (
                (assignmentCount.get(idleMemberId) || 0) >= minTasksPerMember
              ) {
                idleIndex++;
              }
            }
          }
        }
      }
    }

    // 输出最终分配统计
    const finalStats = executors.map((m) => {
      const count = assignmentCount.get(m.id) || 0;
      return `${m.agentName || m.displayName}: ${count}`;
    });
    this.logger.log(
      `[rebalanceTaskAssignments] Final allocation: ${finalStats.join(", ")}`,
    );

    const stillIdleCount = executors.filter(
      (m) => (assignmentCount.get(m.id) || 0) === 0,
    ).length;
    if (stillIdleCount > 0) {
      this.logger.warn(
        `[rebalanceTaskAssignments] Warning: ${stillIdleCount} members still have no tasks assigned`,
      );
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
