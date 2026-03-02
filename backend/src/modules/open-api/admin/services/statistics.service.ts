import { Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { KernelApiService } from "../../../ai-kernel/facade";

/**
 * Statistics Service
 * Handles system-wide statistics and metrics for admin dashboard
 */
@Injectable()
export class StatisticsService {
  constructor(
    private prisma: PrismaService,
    @Optional() private kernelApi?: KernelApiService,
  ) {}

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
      // L1 Infrastructure stats
      adminUsers,
      creditAccounts,
      creditTransactions,
      notifications,
      systemSettings,
      recentLogs,
      mcpServers,
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
      // L1 Infrastructure stats
      this.prisma.user.count({ where: { role: "ADMIN" } }),
      this.safeCount(() => this.prisma.creditAccount.count()),
      this.safeCount(() => this.prisma.creditTransaction.count()),
      this.safeCount(() => this.prisma.notification.count()),
      this.safeCount(() => this.prisma.systemSetting.count()),
      this.safeCount(() =>
        this.prisma.systemErrorLog.count({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
          },
        }),
      ),
      this.safeCount(() => this.prisma.mCPServerConfig.count()),
    ]);

    // Kernel in-memory stats (IPC, Resources, Observability)
    const kernelInMemory = this.getKernelInMemoryStats();

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
      ...kernelInMemory,
      // L1 Infrastructure
      adminUsers,
      creditAccounts,
      creditTransactions,
      notifications,
      dbTables: 0, // placeholder — no dynamic table count needed
      storageProviders: 5, // static: 5 supported providers
      systemSettings,
      recentLogs,
      // L2 MCP
      mcpServers,
    };
  }

  /**
   * Kernel in-memory stats (not in database)
   * IPC subscriptions, circuit breakers, LLM call counts
   */
  private getKernelInMemoryStats(): Record<string, number> {
    if (!this.kernelApi) {
      return { kernelSubscriptions: 0, kernelBreakers: 0, kernelLLMCalls: 0 };
    }

    try {
      const ipcStats = this.kernelApi.getEventBusStats();
      const breakers = this.kernelApi.getCircuitBreakerMetrics();
      const dashboard = this.kernelApi.getDashboard(60);

      return {
        kernelSubscriptions: ipcStats.activeSubscriptions,
        kernelBreakers: breakers.length,
        kernelLLMCalls: dashboard.totalCalls,
      };
    } catch {
      return { kernelSubscriptions: 0, kernelBreakers: 0, kernelLLMCalls: 0 };
    }
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
