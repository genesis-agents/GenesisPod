/**
 * TopicInsightsGateway Unit Tests
 *
 * Tests for WebSocket gateway and state sync functionality
 * Type checking is disabled due to Jest mock compatibility issues.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { ResearchMissionStatus } from "@prisma/client";

import { TopicInsightsGateway } from "../../topic-insights.gateway";
import { ResearchEventEmitterService } from "../../services/core/research-event-emitter.service";
import { PrismaService } from "@/common/prisma/prisma.service";

import { createMockPrisma, createMockResearchEventEmitter } from "../mocks";
import {
  MOCK_MISSION_EXECUTING,
  MOCK_TASK_EXECUTING,
} from "../fixtures/topics.fixture";

// ★ Security: Mock services for JWT authentication
const createMockJwtService = () => ({
  verifyAsync: jest
    .fn()
    .mockResolvedValue({ sub: "user-123", email: "test@example.com" }),
  sign: jest.fn().mockReturnValue("mock-token"),
});

const createMockConfigService = () => ({
  get: jest.fn((key: string) => {
    if (key === "JWT_SECRET") return "test-jwt-secret-at-least-32-chars";
    return undefined;
  }),
});

describe("TopicInsightsGateway", () => {
  let gateway: TopicInsightsGateway;
  let prisma: ReturnType<typeof createMockPrisma>;
  let researchEventEmitter: ReturnType<typeof createMockResearchEventEmitter>;
  let jwtService: ReturnType<typeof createMockJwtService>;
  let configService: ReturnType<typeof createMockConfigService>;

  // Mock Socket.IO server and client
  const mockServer = {
    in: jest.fn().mockReturnValue({
      fetchSockets: jest.fn().mockResolvedValue([{ id: "socket-1" }]),
    }),
    to: jest.fn().mockReturnValue({
      emit: jest.fn(),
    }),
  };

  // ★ Security: Updated mock client with auth data
  const createMockClient = (authenticated = true) => ({
    id: "test-client-123",
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    handshake: {
      auth: { token: authenticated ? "valid-token" : undefined },
      headers: {},
    },
    data: authenticated
      ? {
          user: {
            id: "user-123",
            email: "test@example.com",
            username: "testuser",
          },
          authenticatedAt: new Date(),
        }
      : {},
  });

  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    researchEventEmitter = createMockResearchEventEmitter();
    jwtService = createMockJwtService();
    configService = createMockConfigService();
    mockClient = createMockClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TopicInsightsGateway,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ResearchEventEmitterService,
          useValue: researchEventEmitter,
        },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    gateway = module.get<TopicInsightsGateway>(TopicInsightsGateway);
    // Inject mock server
    (gateway as any).server = mockServer;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==================== Room Management Tests ====================

  describe("handleJoinTopic", () => {
    it("should join the topic room when user owns the topic", async () => {
      // Arrange - mock topic owned by the authenticated user
      prisma.researchTopic.findUnique.mockResolvedValue({
        id: "topic-123",
        userId: "user-123", // Same as mock user
      });

      // Act
      const result = await gateway.handleJoinTopic(mockClient as any, {
        topicId: "topic-123",
      });

      // Assert
      expect(mockClient.join).toHaveBeenCalledWith("research:topic-123");
      expect(result).toEqual({
        success: true,
        room: "research:topic-123",
      });
    });

    it("should reject join when user does not own the topic", async () => {
      // Arrange - mock topic owned by different user
      prisma.researchTopic.findUnique.mockResolvedValue({
        id: "topic-123",
        userId: "different-user-456",
      });

      // Act
      const result = await gateway.handleJoinTopic(mockClient as any, {
        topicId: "topic-123",
      });

      // Assert
      expect(mockClient.join).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: "Access denied",
      });
    });

    it("should reject join when topic not found", async () => {
      // Arrange
      prisma.researchTopic.findUnique.mockResolvedValue(null);

      // Act
      const result = await gateway.handleJoinTopic(mockClient as any, {
        topicId: "non-existent-topic",
      });

      // Assert
      expect(mockClient.join).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: "Topic not found",
      });
    });

    it("should reject join when client is not authenticated", async () => {
      // Arrange - create unauthenticated client
      const unauthClient = createMockClient(false);

      // Act
      const result = await gateway.handleJoinTopic(unauthClient as any, {
        topicId: "topic-123",
      });

      // Assert
      expect(unauthClient.join).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: "Authentication required",
      });
    });
  });

  describe("handleLeaveTopic", () => {
    it("should leave the topic room and return success", () => {
      // Act
      const result = gateway.handleLeaveTopic(mockClient as any, {
        topicId: "topic-123",
      });

      // Assert
      expect(mockClient.leave).toHaveBeenCalledWith("research:topic-123");
      expect(result).toEqual({ success: true });
    });
  });

  // ==================== emitToTopic Tests ====================

  describe("emitToTopic", () => {
    it("should emit event to topic room when clients are connected", async () => {
      // Arrange
      mockServer.in.mockReturnValue({
        fetchSockets: jest.fn().mockResolvedValue([{ id: "socket-1" }]),
      });

      // Act
      await gateway.emitToTopic("topic-123", "test:event", { data: "test" });

      // Assert
      expect(mockServer.in).toHaveBeenCalledWith("research:topic-123");
      expect(mockServer.to).toHaveBeenCalledWith("research:topic-123");
      expect(mockServer.to().emit).toHaveBeenCalledWith("test:event", {
        data: "test",
      });
    });

    it("should not emit when no clients are in room", async () => {
      // Arrange
      mockServer.in.mockReturnValue({
        fetchSockets: jest.fn().mockResolvedValue([]),
      });

      // Act
      await gateway.emitToTopic("topic-123", "test:event", { data: "test" });

      // Assert
      expect(mockServer.to).not.toHaveBeenCalled();
    });
  });

  // ==================== Phase 5: Sync Request Tests ====================

  describe("handleSyncRequest", () => {
    it("should return idle state when no mission exists", async () => {
      // Arrange
      prisma.researchMission.findFirst.mockResolvedValue(null);

      // Act
      const result = await gateway.handleSyncRequest(mockClient as any, {
        topicId: "topic-123",
      });

      // Assert
      expect(result).toEqual({
        success: true,
        needsRecovery: false,
        currentState: {
          phase: "idle",
          progress: 0,
          message: "等待开始研究",
        },
      });
    });

    it("should return current mission state when mission exists", async () => {
      // Arrange
      const mockMission = {
        ...MOCK_MISSION_EXECUTING,
        updatedAt: new Date(),
        tasks: [MOCK_TASK_EXECUTING],
      };
      prisma.researchMission.findFirst.mockResolvedValue(mockMission);

      // Act
      const result = await gateway.handleSyncRequest(mockClient as any, {
        topicId: "topic-123",
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.currentState).toBeDefined();
      expect(result.currentState!.phase).toBe("researching");
      expect(result.currentState!.missionId).toBe(mockMission.id);
    });

    it("should detect needsRecovery when phase mismatch", async () => {
      // Arrange
      const mockMission = {
        ...MOCK_MISSION_EXECUTING,
        status: ResearchMissionStatus.COMPLETED,
        progressPercent: 100,
        updatedAt: new Date(),
        tasks: [],
      };
      prisma.researchMission.findFirst.mockResolvedValue(mockMission);

      // Act
      const result = await gateway.handleSyncRequest(mockClient as any, {
        topicId: "topic-123",
        lastKnownPhase: "researching", // Client thinks still researching
        lastKnownProgress: 50,
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.needsRecovery).toBe(true); // Phase mismatch
      expect(result.currentState!.phase).toBe("completed");
    });

    it("should detect needsRecovery when progress diff > 10%", async () => {
      // Arrange
      const mockMission = {
        ...MOCK_MISSION_EXECUTING,
        progressPercent: 80,
        updatedAt: new Date(),
        tasks: [],
      };
      prisma.researchMission.findFirst.mockResolvedValue(mockMission);

      // Act
      const result = await gateway.handleSyncRequest(mockClient as any, {
        topicId: "topic-123",
        lastKnownPhase: "researching",
        lastKnownProgress: 50, // 30% diff
      });

      // Assert
      expect(result.needsRecovery).toBe(true);
    });

    it("should detect stale mission as needing recovery", async () => {
      // Arrange - mission updated 10 minutes ago
      const staleDate = new Date(Date.now() - 10 * 60 * 1000);
      const mockMission = {
        ...MOCK_MISSION_EXECUTING,
        status: ResearchMissionStatus.EXECUTING,
        updatedAt: staleDate,
        tasks: [],
      };
      prisma.researchMission.findFirst.mockResolvedValue(mockMission);

      // Act
      const result = await gateway.handleSyncRequest(mockClient as any, {
        topicId: "topic-123",
        lastKnownPhase: "researching",
        lastKnownProgress: 50,
      });

      // Assert
      expect(result.needsRecovery).toBe(true);
    });

    it("should handle database errors gracefully", async () => {
      // Arrange
      prisma.researchMission.findFirst.mockRejectedValue(
        new Error("Database connection failed"),
      );

      // Act
      const result = await gateway.handleSyncRequest(mockClient as any, {
        topicId: "topic-123",
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.currentState).toBeNull();
      expect(result.error).toBe("Database connection failed");
    });

    it("should not need recovery when client has no previous state", async () => {
      // Arrange
      const mockMission = {
        ...MOCK_MISSION_EXECUTING,
        updatedAt: new Date(),
        tasks: [],
      };
      prisma.researchMission.findFirst.mockResolvedValue(mockMission);

      // Act
      const result = await gateway.handleSyncRequest(mockClient as any, {
        topicId: "topic-123",
        // No lastKnownPhase or lastKnownProgress
      });

      // Assert
      expect(result.needsRecovery).toBe(false);
    });
  });

  // ==================== Status Mapping Tests ====================

  describe("mapStatusToPhase (internal)", () => {
    it("should map all statuses correctly", async () => {
      const testCases = [
        { status: ResearchMissionStatus.PLANNING, expectedPhase: "planning" },
        {
          status: ResearchMissionStatus.EXECUTING,
          expectedPhase: "researching",
        },
        {
          status: ResearchMissionStatus.REVIEWING,
          expectedPhase: "synthesizing",
        },
        { status: ResearchMissionStatus.COMPLETED, expectedPhase: "completed" },
        { status: ResearchMissionStatus.FAILED, expectedPhase: "failed" },
        { status: ResearchMissionStatus.CANCELLED, expectedPhase: "idle" },
      ];

      for (const { status, expectedPhase } of testCases) {
        // Arrange
        const mockMission = {
          ...MOCK_MISSION_EXECUTING,
          status,
          updatedAt: new Date(),
          tasks: [],
        };
        prisma.researchMission.findFirst.mockResolvedValue(mockMission);

        // Act
        const result = await gateway.handleSyncRequest(mockClient as any, {
          topicId: "topic-123",
        });

        // Assert
        expect(result.currentState!.phase).toBe(expectedPhase);
      }
    });
  });

  // ==================== Lifecycle Tests ====================

  describe("lifecycle", () => {
    it("should register emit handler on afterInit", () => {
      // Act
      gateway.afterInit();

      // Assert
      expect(researchEventEmitter.registerEmitHandler).toHaveBeenCalled();
    });

    it("should handle client disconnection", () => {
      // Act - should not throw
      expect(() => gateway.handleDisconnect(mockClient as any)).not.toThrow();
    });
  });

  // ==================== ★ Security: Authentication Tests ====================

  describe("handleConnection - JWT Authentication", () => {
    it("should authenticate client with valid token", async () => {
      // Arrange
      const validTokenClient = {
        id: "client-456",
        emit: jest.fn(),
        disconnect: jest.fn(),
        handshake: {
          auth: { token: "valid-jwt-token" },
          headers: {},
        },
        data: {} as Record<string, unknown>,
      };
      prisma.user.findUnique.mockResolvedValue({
        id: "user-123",
        email: "test@example.com",
        username: "testuser",
      });

      // Act
      await gateway.handleConnection(validTokenClient as any);

      // Assert
      expect(jwtService.verifyAsync).toHaveBeenCalledWith("valid-jwt-token", {
        secret: "test-jwt-secret-at-least-32-chars",
      });
      expect((validTokenClient.data as any).user).toEqual({
        id: "user-123",
        email: "test@example.com",
        username: "testuser",
      });
      expect(validTokenClient.disconnect).not.toHaveBeenCalled();
    });

    it("should disconnect client without token", async () => {
      // Arrange
      const noTokenClient = {
        id: "client-no-token",
        emit: jest.fn(),
        disconnect: jest.fn(),
        handshake: {
          auth: {},
          headers: {},
        },
        data: {},
      };

      // Act
      await gateway.handleConnection(noTokenClient as any);

      // Assert
      expect(noTokenClient.emit).toHaveBeenCalledWith("auth:error", {
        message: "Authentication required",
      });
      expect(noTokenClient.disconnect).toHaveBeenCalledWith(true);
    });

    it("should disconnect client with invalid token", async () => {
      // Arrange
      const invalidTokenClient = {
        id: "client-invalid",
        emit: jest.fn(),
        disconnect: jest.fn(),
        handshake: {
          auth: { token: "invalid-token" },
          headers: {},
        },
        data: {},
      };
      jwtService.verifyAsync.mockRejectedValue(new Error("Invalid token"));

      // Act
      await gateway.handleConnection(invalidTokenClient as any);

      // Assert
      expect(invalidTokenClient.emit).toHaveBeenCalledWith("auth:error", {
        message: "Invalid token",
      });
      expect(invalidTokenClient.disconnect).toHaveBeenCalledWith(true);
    });

    it("should disconnect client when user not found in database", async () => {
      // Arrange
      const orphanTokenClient = {
        id: "client-orphan",
        emit: jest.fn(),
        disconnect: jest.fn(),
        handshake: {
          auth: { token: "valid-token" },
          headers: {},
        },
        data: {},
      };
      jwtService.verifyAsync.mockResolvedValue({
        sub: "deleted-user",
        email: "deleted@example.com",
      });
      prisma.user.findUnique.mockResolvedValue(null);

      // Act
      await gateway.handleConnection(orphanTokenClient as any);

      // Assert
      expect(orphanTokenClient.emit).toHaveBeenCalledWith("auth:error", {
        message: "User not found",
      });
      expect(orphanTokenClient.disconnect).toHaveBeenCalledWith(true);
    });

    it("should accept token from Authorization header", async () => {
      // Arrange
      const headerTokenClient = {
        id: "client-header",
        emit: jest.fn(),
        disconnect: jest.fn(),
        handshake: {
          auth: {},
          headers: { authorization: "Bearer header-jwt-token" },
        },
        data: {},
      };
      prisma.user.findUnique.mockResolvedValue({
        id: "user-123",
        email: "test@example.com",
        username: "testuser",
      });

      // Act
      await gateway.handleConnection(headerTokenClient as any);

      // Assert
      expect(jwtService.verifyAsync).toHaveBeenCalledWith("header-jwt-token", {
        secret: "test-jwt-secret-at-least-32-chars",
      });
      expect(headerTokenClient.disconnect).not.toHaveBeenCalled();
    });
  });

  describe("handleSyncRequest - Authentication", () => {
    it("should reject sync request from unauthenticated client", async () => {
      // Arrange
      const unauthClient = createMockClient(false);

      // Act
      const result = await gateway.handleSyncRequest(unauthClient as any, {
        topicId: "topic-123",
      });

      // Assert
      expect(result).toEqual({
        success: false,
        needsRecovery: false,
        currentState: null,
        error: "Authentication required",
      });
    });
  });
});
