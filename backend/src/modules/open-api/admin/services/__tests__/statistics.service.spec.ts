import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { StatisticsService } from "../statistics.service";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { KernelApiService } from "../../../../ai-kernel/facade";

describe("StatisticsService", () => {
  let service: StatisticsService;
  let mockPrisma: {
    resource: { count: jest.Mock; groupBy: jest.Mock };
    researchMission: { count: jest.Mock };
    officeDocument: { count: jest.Mock };
    topic: { count: jest.Mock };
    debateSession: { count: jest.Mock };
    simulationScenario: { count: jest.Mock };
    simulationRun: { count: jest.Mock };
    writingProject: { count: jest.Mock };
    socialContent: { count: jest.Mock };
    toolConfig: { count: jest.Mock };
    skillConfig: { count: jest.Mock };
    aIModel: { count: jest.Mock };
    user: { count: jest.Mock };
    secret: { count: jest.Mock };
    agentProcess: { count: jest.Mock };
    processEvent: { count: jest.Mock };
    processMemory: { count: jest.Mock };
    creditAccount: { count: jest.Mock };
    creditTransaction: { count: jest.Mock };
    notification: { count: jest.Mock };
    systemSetting: { count: jest.Mock };
    systemErrorLog: { count: jest.Mock };
    mCPServerConfig: { count: jest.Mock };
  };
  let mockKernelApi: {
    getEventBusStats: jest.Mock;
    getCircuitBreakerMetrics: jest.Mock;
    getDashboard: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      resource: { count: jest.fn(), groupBy: jest.fn() },
      researchMission: { count: jest.fn() },
      officeDocument: { count: jest.fn() },
      topic: { count: jest.fn() },
      debateSession: { count: jest.fn() },
      simulationScenario: { count: jest.fn() },
      simulationRun: { count: jest.fn() },
      writingProject: { count: jest.fn() },
      socialContent: { count: jest.fn() },
      toolConfig: { count: jest.fn() },
      skillConfig: { count: jest.fn() },
      aIModel: { count: jest.fn() },
      user: { count: jest.fn() },
      secret: { count: jest.fn() },
      agentProcess: { count: jest.fn().mockResolvedValue(0) },
      processEvent: { count: jest.fn().mockResolvedValue(0) },
      processMemory: { count: jest.fn().mockResolvedValue(0) },
      creditAccount: { count: jest.fn().mockResolvedValue(0) },
      creditTransaction: { count: jest.fn().mockResolvedValue(0) },
      notification: { count: jest.fn().mockResolvedValue(0) },
      systemSetting: { count: jest.fn().mockResolvedValue(0) },
      systemErrorLog: { count: jest.fn().mockResolvedValue(0) },
      mCPServerConfig: { count: jest.fn().mockResolvedValue(0) },
    };

    mockKernelApi = {
      getEventBusStats: jest.fn().mockReturnValue({ activeSubscriptions: 5 }),
      getCircuitBreakerMetrics: jest
        .fn()
        .mockReturnValue([{ entityId: "gpt-4" }, { entityId: "claude" }]),
      getDashboard: jest.fn().mockReturnValue({ totalCalls: 42 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatisticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: KernelApiService, useValue: mockKernelApi },
      ],
    }).compile();

    service = module.get<StatisticsService>(StatisticsService);

    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==================== getOverviewStats ====================

  describe("getOverviewStats", () => {
    const mockAllCounts = (value = 0) => {
      mockPrisma.resource.count.mockResolvedValue(value + 1);
      mockPrisma.researchMission.count.mockResolvedValue(value + 2);
      mockPrisma.officeDocument.count.mockResolvedValue(value + 3);
      mockPrisma.topic.count.mockResolvedValue(value + 4);
      mockPrisma.debateSession.count.mockResolvedValue(value + 5);
      mockPrisma.simulationScenario.count.mockResolvedValue(value + 6);
      mockPrisma.simulationRun.count.mockResolvedValue(value + 7);
      mockPrisma.writingProject.count.mockResolvedValue(value + 8);
      mockPrisma.socialContent.count.mockResolvedValue(value + 9);
      mockPrisma.toolConfig.count.mockResolvedValue(value + 10);
      mockPrisma.skillConfig.count.mockResolvedValue(value + 11);
      mockPrisma.aIModel.count.mockResolvedValue(value + 12);
      // user.count is called 3 times: totalUsers, activeUsers, adminUsers
      mockPrisma.user.count
        .mockResolvedValueOnce(value + 13)
        .mockResolvedValueOnce(value + 14)
        .mockResolvedValueOnce(value + 16);
      mockPrisma.secret.count.mockResolvedValue(value + 15);
      // L1 Infrastructure stats
      mockPrisma.agentProcess.count.mockResolvedValue(value);
      mockPrisma.processEvent.count.mockResolvedValue(value);
      mockPrisma.processMemory.count.mockResolvedValue(value);
      mockPrisma.creditAccount.count.mockResolvedValue(value + 17);
      mockPrisma.creditTransaction.count.mockResolvedValue(value + 18);
      mockPrisma.notification.count.mockResolvedValue(value + 19);
      mockPrisma.systemSetting.count.mockResolvedValue(value + 20);
      mockPrisma.systemErrorLog.count.mockResolvedValue(value + 21);
      mockPrisma.mCPServerConfig.count.mockResolvedValue(value + 22);
    };

    it("should return all stat keys including kernel in-memory stats", async () => {
      // Arrange
      mockAllCounts();

      // Act
      const result = await service.getOverviewStats();

      // Assert
      const expectedKeys = [
        "resources",
        "researchMissions",
        "officeDocuments",
        "topics",
        "debateSessions",
        "simScenarios",
        "simRuns",
        "writingProjects",
        "socialContent",
        "tools",
        "skills",
        "aiModels",
        "totalUsers",
        "activeUsers",
        "secrets",
        "kernelProcesses",
        "kernelRunning",
        "kernelEvents",
        "kernelMemories",
        "kernelSubscriptions",
        "kernelBreakers",
        "kernelLLMCalls",
        // L1 Infrastructure
        "adminUsers",
        "creditAccounts",
        "creditTransactions",
        "notifications",
        "dbTables",
        "storageProviders",
        "systemSettings",
        "recentLogs",
        // L2 MCP
        "mcpServers",
      ];
      expectedKeys.forEach((key) => {
        expect(result).toHaveProperty(key);
      });
    });

    it("should include kernel in-memory stats from KernelApiService", async () => {
      // Arrange
      mockAllCounts();

      // Act
      const result = await service.getOverviewStats();

      // Assert
      expect(result.kernelSubscriptions).toBe(5);
      expect(result.kernelBreakers).toBe(2);
      expect(result.kernelLLMCalls).toBe(42);
    });

    it("should return correct count values for each key", async () => {
      // Arrange
      mockPrisma.resource.count.mockResolvedValue(100);
      mockPrisma.researchMission.count.mockResolvedValue(50);
      mockPrisma.officeDocument.count.mockResolvedValue(30);
      mockPrisma.topic.count.mockResolvedValue(20);
      mockPrisma.debateSession.count.mockResolvedValue(15);
      mockPrisma.simulationScenario.count.mockResolvedValue(10);
      mockPrisma.simulationRun.count.mockResolvedValue(200);
      mockPrisma.writingProject.count.mockResolvedValue(40);
      mockPrisma.socialContent.count.mockResolvedValue(60);
      mockPrisma.toolConfig.count.mockResolvedValue(150);
      mockPrisma.skillConfig.count.mockResolvedValue(75);
      mockPrisma.aIModel.count.mockResolvedValue(8);
      mockPrisma.user.count
        .mockResolvedValueOnce(500) // totalUsers
        .mockResolvedValueOnce(400); // activeUsers
      mockPrisma.secret.count.mockResolvedValue(25);

      // Act
      const result = await service.getOverviewStats();

      // Assert
      expect(result.resources).toBe(100);
      expect(result.researchMissions).toBe(50);
      expect(result.officeDocuments).toBe(30);
      expect(result.totalUsers).toBe(500);
      expect(result.activeUsers).toBe(400);
      expect(result.secrets).toBe(25);
    });

    it("should return zeros for DB stats when all tables are empty", async () => {
      // Arrange
      mockPrisma.resource.count.mockResolvedValue(0);
      mockPrisma.researchMission.count.mockResolvedValue(0);
      mockPrisma.officeDocument.count.mockResolvedValue(0);
      mockPrisma.topic.count.mockResolvedValue(0);
      mockPrisma.debateSession.count.mockResolvedValue(0);
      mockPrisma.simulationScenario.count.mockResolvedValue(0);
      mockPrisma.simulationRun.count.mockResolvedValue(0);
      mockPrisma.writingProject.count.mockResolvedValue(0);
      mockPrisma.socialContent.count.mockResolvedValue(0);
      mockPrisma.toolConfig.count.mockResolvedValue(0);
      mockPrisma.skillConfig.count.mockResolvedValue(0);
      mockPrisma.aIModel.count.mockResolvedValue(0);
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.secret.count.mockResolvedValue(0);
      mockPrisma.agentProcess.count.mockResolvedValue(0);
      mockPrisma.processEvent.count.mockResolvedValue(0);
      mockPrisma.processMemory.count.mockResolvedValue(0);
      mockPrisma.creditAccount.count.mockResolvedValue(0);
      mockPrisma.creditTransaction.count.mockResolvedValue(0);
      mockPrisma.notification.count.mockResolvedValue(0);
      mockPrisma.systemSetting.count.mockResolvedValue(0);
      mockPrisma.systemErrorLog.count.mockResolvedValue(0);
      mockPrisma.mCPServerConfig.count.mockResolvedValue(0);
      mockKernelApi.getEventBusStats.mockReturnValue({
        activeSubscriptions: 0,
      });
      mockKernelApi.getCircuitBreakerMetrics.mockReturnValue([]);
      mockKernelApi.getDashboard.mockReturnValue({ totalCalls: 0 });

      // Act
      const result = await service.getOverviewStats();

      // Assert — storageProviders is a static constant (5), not queried
      Object.entries(result).forEach(([key, v]) => {
        if (key === "storageProviders") {
          expect(v).toBe(5);
        } else {
          expect(v).toBe(0);
        }
      });
    });

    it("should query activeUsers with isActive=true filter", async () => {
      // Arrange
      mockAllCounts();

      // Act
      await service.getOverviewStats();

      // Assert: one of the user.count calls includes isActive filter
      const calls = mockPrisma.user.count.mock.calls;
      const activeCall = calls.find((c) => c[0]?.where?.isActive === true);
      expect(activeCall).toBeDefined();
    });
  });

  // ==================== getSystemStats ====================

  describe("getSystemStats", () => {
    it("should return users and resources sections", async () => {
      // Arrange
      mockPrisma.user.count
        .mockResolvedValueOnce(300) // totalUsers
        .mockResolvedValueOnce(250) // activeUsers
        .mockResolvedValueOnce(10); // recentUsers
      mockPrisma.resource.count.mockResolvedValue(400);
      mockPrisma.resource.groupBy.mockResolvedValue([
        { type: "ARTICLE", _count: { type: 200 } },
        { type: "VIDEO", _count: { type: 200 } },
      ]);

      // Act
      const result = await service.getSystemStats();

      // Assert
      expect(result.users.total).toBe(300);
      expect(result.users.active).toBe(250);
      expect(result.users.newLast7Days).toBe(10);
      expect(result.resources.total).toBe(400);
    });

    it("should build byType map from groupBy result", async () => {
      // Arrange
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.resource.count.mockResolvedValue(300);
      mockPrisma.resource.groupBy.mockResolvedValue([
        { type: "ARTICLE", _count: { type: 150 } },
        { type: "PDF", _count: { type: 100 } },
        { type: "VIDEO", _count: { type: 50 } },
      ]);

      // Act
      const result = await service.getSystemStats();

      // Assert
      expect(result.resources.byType).toEqual({
        ARTICLE: 150,
        PDF: 100,
        VIDEO: 50,
      });
    });

    it("should return empty byType when no resources exist", async () => {
      // Arrange
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.resource.count.mockResolvedValue(0);
      mockPrisma.resource.groupBy.mockResolvedValue([]);

      // Act
      const result = await service.getSystemStats();

      // Assert
      expect(result.resources.byType).toEqual({});
    });

    it("should compute recentUsers using a 7-day date filter", async () => {
      // Arrange
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.resource.count.mockResolvedValue(0);
      mockPrisma.resource.groupBy.mockResolvedValue([]);

      const before = Date.now();

      // Act
      await service.getSystemStats();

      const after = Date.now();

      // Assert: find the count call with createdAt filter
      const recentCall = mockPrisma.user.count.mock.calls.find(
        (c) => c[0]?.where?.createdAt?.gte !== undefined,
      );
      expect(recentCall).toBeDefined();
      const gteDate = recentCall![0].where.createdAt.gte as Date;
      const expectedLower = before - 7 * 24 * 60 * 60 * 1000;
      const expectedUpper = after - 7 * 24 * 60 * 60 * 1000;
      expect(gteDate.getTime()).toBeGreaterThanOrEqual(expectedLower);
      expect(gteDate.getTime()).toBeLessThanOrEqual(expectedUpper);
    });

    it("should call resource.groupBy with type field", async () => {
      // Arrange
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.resource.count.mockResolvedValue(0);
      mockPrisma.resource.groupBy.mockResolvedValue([]);

      // Act
      await service.getSystemStats();

      // Assert
      const groupByCall = mockPrisma.resource.groupBy.mock.calls[0][0];
      expect(groupByCall.by).toContain("type");
    });
  });
});
