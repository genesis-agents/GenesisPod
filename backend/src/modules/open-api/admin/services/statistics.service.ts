import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";

/**
 * Statistics Service
 * Handles system-wide statistics and metrics for admin dashboard
 */
@Injectable()
export class StatisticsService {
  constructor(private prisma: PrismaService) {}

  /**
   * 获取 Overview 页面各模块统计数据（供架构图展示）
   */
  async getOverviewStats(): Promise<Record<string, number>> {
    const [
      resources,
      researchMissions,
      officeDocuments,
      topics,
      debateSessions,
      simScenarios,
      simRuns,
      writingProjects,
      socialContent,
      tools,
      skills,
      aiModels,
      totalUsers,
      activeUsers,
      secrets,
      kernelProcesses,
      kernelRunning,
      kernelEvents,
      kernelMemories,
    ] = await Promise.all([
      this.prisma.resource.count(),
      this.prisma.researchMission.count(),
      this.prisma.officeDocument.count(),
      this.prisma.topic.count(),
      this.prisma.debateSession.count(),
      this.prisma.simulationScenario.count(),
      this.prisma.simulationRun.count(),
      this.prisma.writingProject.count(),
      this.prisma.socialContent.count(),
      this.prisma.toolConfig.count(),
      this.prisma.skillConfig.count(),
      this.prisma.aIModel.count(),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.secret.count(),
      this.safeCount(() => this.prisma.agentProcess.count()),
      this.safeCount(() =>
        this.prisma.agentProcess.count({ where: { state: "RUNNING" } }),
      ),
      this.safeCount(() => this.prisma.processEvent.count()),
      this.safeCount(() => this.prisma.processMemory.count()),
    ]);

    return {
      resources,
      researchMissions,
      officeDocuments,
      topics,
      debateSessions,
      simScenarios,
      simRuns,
      writingProjects,
      socialContent,
      tools,
      skills,
      aiModels,
      totalUsers,
      activeUsers,
      secrets,
      kernelProcesses,
      kernelRunning,
      kernelEvents,
      kernelMemories,
    };
  }

  /** Table-safe count — returns 0 if the table does not exist */
  private async safeCount(fn: () => Promise<number>): Promise<number> {
    try {
      return await fn();
    } catch {
      return 0;
    }
  }

  /**
   * 获取系统统计信息
   */
  async getSystemStats() {
    const [
      totalUsers,
      activeUsers,
      totalResources,
      resourcesByType,
      recentUsers,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.resource.count(),
      this.prisma.resource.groupBy({
        by: ["type"],
        _count: { type: true },
      }),
      this.prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        newLast7Days: recentUsers,
      },
      resources: {
        total: totalResources,
        byType: resourcesByType.reduce(
          (
            acc: Record<string, number>,
            item: { type: string; _count: { type: number } },
          ) => {
            acc[item.type] = item._count.type;
            return acc;
          },
          {} as Record<string, number>,
        ),
      },
    };
  }
}
