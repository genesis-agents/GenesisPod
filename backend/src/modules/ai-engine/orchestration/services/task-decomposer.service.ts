/**
 * Task Decomposer Service
 * 任务分解服务 - AI Engine 核心能力
 *
 * 从 AI Teams 的 TaskBreakdownService 下沉到 AI Engine
 * 提供通用的任务分解能力，不依赖特定的数据库模型
 */

import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import {
  ITaskDecomposerService,
  DecompositionInput,
  DecompositionResult,
  TaskDefinition,
  TeamMemberInfo,
} from "./interfaces";

/**
 * 匹配结果
 */
interface MatchResult {
  member: TeamMemberInfo | null;
  matchInfo: {
    type: "exact" | "fuzzy" | "none";
    confidence: number;
    suggestion?: string;
  };
}

/**
 * 匹配统计
 */
interface MatchStatistics {
  totalRows: number;
  matched: number;
  fuzzyMatched: number;
  unmatched: Array<{
    taskTitle: string;
    inputName: string;
    availableMembers: string[];
  }>;
  memberTaskCount: Map<string, number>;
}

@Injectable()
export class TaskDecomposerService implements ITaskDecomposerService {
  private readonly logger = new Logger(TaskDecomposerService.name);

  /**
   * 解析任务分解内容
   */
  parseTaskBreakdown(input: DecompositionInput): DecompositionResult {
    const { content, teamMembers } = input;
    const tasks: TaskDefinition[] = [];

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

    const matchStats: MatchStatistics = this.createMatchStatistics();

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
          const matchResult = this.findMemberByNameEnhanced(
            assigneeName,
            teamMembers,
          );
          const assignee = matchResult.member;

          // 诊断日志
          if (matchResult.matchInfo.type === "none" && assigneeName) {
            matchStats.unmatched.push({
              taskTitle: title,
              inputName: assigneeName,
              availableMembers: availableMemberNames.map(
                (m) => m.agentName || m.displayName,
              ),
            });
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
              reason: reason || "",
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
    if (this.isMatchFailureRateExceeded(matchStats, 0.1)) {
      const errorMsg = this.formatMatchFailureError(
        matchStats,
        availableMemberNames.map((m) => m.agentName || m.displayName),
      );
      this.logger.error(`[parseTaskBreakdown] ${errorMsg}`);
      throw new BadRequestException(errorMsg);
    }

    // 如果解析失败，创建一个默认任务
    if (tasks.length === 0 && teamMembers.length > 0) {
      this.logger.warn(
        `[parseTaskBreakdown] No tasks parsed, creating default task for first member`,
      );
      const firstMember =
        teamMembers.find((m) => !m.isLeader) || teamMembers[0];
      if (firstMember) {
        tasks.push({
          title: "执行任务",
          description: "完成用户请求的任务",
          assigneeId: firstMember.id,
          assigneeName: firstMember.agentName || firstMember.displayName,
          reason: "作为团队成员执行任务",
          priority: "MEDIUM",
          taskType: "implementation",
          dependsOn: [],
        });
      }
    }

    return {
      tasks,
      understanding: content.match(/## 任务理解\n([^#]+)/)?.[1]?.trim() || "",
      executionPlan: content.match(/## 执行计划\n([^#]+)/)?.[1]?.trim() || "",
      risks: content.match(/## 风险提示\n([^#]+)/)?.[1]?.trim() || "",
      matchStats: {
        totalRows: matchStats.totalRows,
        matched: matchStats.matched,
        fuzzyMatched: matchStats.fuzzyMatched,
        unmatched: matchStats.unmatched.map((u) => u.inputName),
      },
    };
  }

  /**
   * 任务分配再平衡
   */
  rebalanceTaskAssignments(
    tasks: TaskDefinition[],
    teamMembers: TeamMemberInfo[],
  ): TaskDefinition[] {
    if (tasks.length === 0 || teamMembers.length === 0) {
      return tasks;
    }

    const executors = teamMembers.filter((m) => !m.isLeader);
    if (executors.length === 0) {
      this.logger.warn(
        `[rebalanceTaskAssignments] No non-leader members found, skipping rebalancing`,
      );
      return tasks;
    }

    // 统计当前分配情况
    const assignmentCount = new Map<string, number>();
    for (const member of executors) {
      assignmentCount.set(member.id, 0);
    }

    for (const task of tasks) {
      const assigneeId = task.assigneeId;
      if (assignmentCount.has(assigneeId)) {
        assignmentCount.set(
          assigneeId,
          (assignmentCount.get(assigneeId) || 0) + 1,
        );
      }
    }

    // 计算理想分配
    const totalTasks = tasks.length;
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

      for (const task of tasks) {
        if (idleIndex >= idleMemberQueue.length) break;

        const currentCount = assignmentCount.get(task.assigneeId) || 0;

        if (currentCount > idealTasksPerMember) {
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

    return tasks;
  }

  // ==================== 私有方法 ====================

  /**
   * 创建匹配统计对象
   */
  private createMatchStatistics(): MatchStatistics {
    return {
      totalRows: 0,
      matched: 0,
      fuzzyMatched: 0,
      unmatched: [],
      memberTaskCount: new Map(),
    };
  }

  /**
   * 增强版成员名称匹配
   */
  private findMemberByNameEnhanced(
    name: string,
    members: TeamMemberInfo[],
  ): MatchResult {
    if (!name || members.length === 0) {
      return {
        member: null,
        matchInfo: { type: "none", confidence: 0 },
      };
    }

    const normalizedName = name.toLowerCase().trim();

    // 1. 精确匹配
    for (const member of members) {
      const agentName = (member.agentName || "").toLowerCase().trim();
      const displayName = (member.displayName || "").toLowerCase().trim();

      if (agentName === normalizedName || displayName === normalizedName) {
        return {
          member,
          matchInfo: { type: "exact", confidence: 1.0 },
        };
      }
    }

    // 2. 包含匹配
    for (const member of members) {
      const agentName = (member.agentName || "").toLowerCase().trim();
      const displayName = (member.displayName || "").toLowerCase().trim();

      if (
        agentName.includes(normalizedName) ||
        normalizedName.includes(agentName) ||
        displayName.includes(normalizedName) ||
        normalizedName.includes(displayName)
      ) {
        return {
          member,
          matchInfo: {
            type: "fuzzy",
            confidence: 0.8,
            suggestion: member.agentName || member.displayName,
          },
        };
      }
    }

    // 3. 模糊匹配（编辑距离）
    let bestMatch: TeamMemberInfo | null = null;
    let bestDistance = Infinity;
    let bestConfidence = 0;

    for (const member of members) {
      const agentName = (member.agentName || "").toLowerCase().trim();
      const displayName = (member.displayName || "").toLowerCase().trim();

      const distanceToAgent = this.levenshteinDistance(
        normalizedName,
        agentName,
      );
      const distanceToDisplay = this.levenshteinDistance(
        normalizedName,
        displayName,
      );
      const minDistance = Math.min(distanceToAgent, distanceToDisplay);
      const maxLength = Math.max(
        normalizedName.length,
        agentName.length,
        displayName.length,
      );

      // 相似度阈值：编辑距离小于名称长度的 40%
      if (minDistance < maxLength * 0.4 && minDistance < bestDistance) {
        bestMatch = member;
        bestDistance = minDistance;
        bestConfidence = 1 - minDistance / maxLength;
      }
    }

    if (bestMatch && bestConfidence > 0.6) {
      return {
        member: bestMatch,
        matchInfo: {
          type: "fuzzy",
          confidence: bestConfidence,
          suggestion: bestMatch.agentName || bestMatch.displayName,
        },
      };
    }

    return {
      member: null,
      matchInfo: { type: "none", confidence: 0 },
    };
  }

  /**
   * 计算编辑距离（Levenshtein Distance）
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;

    if (m === 0) return n;
    if (n === 0) return m;

    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j - 1] + 1, // 替换
            dp[i - 1][j] + 1, // 删除
            dp[i][j - 1] + 1, // 插入
          );
        }
      }
    }

    return dp[m][n];
  }

  /**
   * 检查匹配失败率是否超过阈值
   */
  private isMatchFailureRateExceeded(
    stats: MatchStatistics,
    threshold: number,
  ): boolean {
    if (stats.totalRows === 0) return false;
    const failureRate = stats.unmatched.length / stats.totalRows;
    return failureRate > threshold;
  }

  /**
   * 格式化匹配失败错误信息
   */
  private formatMatchFailureError(
    stats: MatchStatistics,
    availableMembers: string[],
  ): string {
    const unmatchedNames = stats.unmatched.map((u) => u.inputName).join(", ");
    return (
      `任务分配失败率过高 (${stats.unmatched.length}/${stats.totalRows})。` +
      `无法匹配的名称: [${unmatchedNames}]。` +
      `可用的团队成员: [${availableMembers.join(", ")}]。` +
      `请检查 AI 返回的成员名称是否正确。`
    );
  }
}
