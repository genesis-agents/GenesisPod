/**
 * MissionNotificationService Unit Tests
 *
 * Covers all public methods and all branches (Optional deps present / absent).
 */

import { Test, TestingModule } from "@nestjs/testing";
import { MissionNotificationService } from "../mission-notification.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import { EmailService, SettingsService } from "@/modules/ai-infra/facade";

// ─── Mock factories ───────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    researchTopic: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };
}

function buildMockEmailService() {
  return {
    sendMissionCompletionNotification: jest.fn(),
  };
}

function buildMockSettingsService() {
  return {
    getAiSettings: jest.fn(),
  };
}

// ─── Test builder helpers ─────────────────────────────────────────────────────

async function buildService(opts?: {
  withEmail?: boolean;
  withSettings?: boolean;
}): Promise<{
  service: MissionNotificationService;
  prisma: ReturnType<typeof buildMockPrisma>;
  emailService: ReturnType<typeof buildMockEmailService>;
  settingsService: ReturnType<typeof buildMockSettingsService>;
}> {
  const prisma = buildMockPrisma();
  const emailService = buildMockEmailService();
  const settingsService = buildMockSettingsService();

  const providers: { provide: unknown; useValue: unknown }[] = [
    MissionNotificationService,
    { provide: PrismaService, useValue: prisma },
  ];

  if (opts?.withEmail !== false) {
    providers.push({ provide: EmailService, useValue: emailService });
  }
  if (opts?.withSettings !== false) {
    providers.push({ provide: SettingsService, useValue: settingsService });
  }

  const module: TestingModule = await Test.createTestingModule({
    providers,
  }).compile();

  return {
    service: module.get<MissionNotificationService>(MissionNotificationService),
    prisma,
    emailService,
    settingsService,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("MissionNotificationService", () => {
  afterEach(() => jest.clearAllMocks());

  // ─── notifyCompletion ─────────────────────────────────────────────────────────

  describe("notifyCompletion", () => {
    it("should send completion email when all data is present", async () => {
      const { service, prisma, emailService } = await buildService();

      prisma.researchTopic.findUnique.mockResolvedValue({
        userId: "user-1",
        name: "AI Research Topic",
      });
      prisma.user.findUnique.mockResolvedValue({ email: "user@example.com" });
      emailService.sendMissionCompletionNotification.mockResolvedValue(
        undefined,
      );

      service.notifyCompletion({
        missionId: "m1",
        topicId: "t1",
        completedTasks: 4,
        totalTasks: 5,
      });

      // Let the fire-and-forget promise resolve
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));

      expect(prisma.researchTopic.findUnique).toHaveBeenCalledWith({
        where: { id: "t1" },
        select: { userId: true, name: true },
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "user-1" },
        select: { email: true },
      });
      expect(
        emailService.sendMissionCompletionNotification,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "user@example.com",
          missionId: "m1",
          missionTitle: "AI Research Topic",
          reportUrl: "/topics/t1/reports",
          summary: "4/5 dimensions completed",
        }),
      );
    });

    it("should not send email when emailService is absent", async () => {
      const { service, prisma } = await buildService({ withEmail: false });

      // Should return immediately without touching prisma
      service.notifyCompletion({
        missionId: "m1",
        topicId: "t1",
        completedTasks: 3,
        totalTasks: 3,
      });

      await new Promise((r) => setImmediate(r));
      expect(prisma.researchTopic.findUnique).not.toHaveBeenCalled();
    });

    it("should not send email when topic is not found", async () => {
      const { service, prisma, emailService } = await buildService();

      prisma.researchTopic.findUnique.mockResolvedValue(null);

      service.notifyCompletion({
        missionId: "m1",
        topicId: "no-such-topic",
        completedTasks: 2,
        totalTasks: 2,
      });

      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(
        emailService.sendMissionCompletionNotification,
      ).not.toHaveBeenCalled();
    });

    it("should not send email when topic has no userId", async () => {
      const { service, prisma, emailService } = await buildService();

      prisma.researchTopic.findUnique.mockResolvedValue({
        userId: null,
        name: "Topic Without Owner",
      });

      service.notifyCompletion({
        missionId: "m1",
        topicId: "t1",
        completedTasks: 1,
        totalTasks: 1,
      });

      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(
        emailService.sendMissionCompletionNotification,
      ).not.toHaveBeenCalled();
    });

    it("should not send email when user is not found", async () => {
      const { service, prisma, emailService } = await buildService();

      prisma.researchTopic.findUnique.mockResolvedValue({
        userId: "user-1",
        name: "Test Topic",
      });
      prisma.user.findUnique.mockResolvedValue(null);

      service.notifyCompletion({
        missionId: "m1",
        topicId: "t1",
        completedTasks: 2,
        totalTasks: 2,
      });

      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));

      expect(
        emailService.sendMissionCompletionNotification,
      ).not.toHaveBeenCalled();
    });

    it("should not send email when user has no email", async () => {
      const { service, prisma, emailService } = await buildService();

      prisma.researchTopic.findUnique.mockResolvedValue({
        userId: "user-1",
        name: "Test Topic",
      });
      prisma.user.findUnique.mockResolvedValue({ email: null });

      service.notifyCompletion({
        missionId: "m1",
        topicId: "t1",
        completedTasks: 2,
        totalTasks: 2,
      });

      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));

      expect(
        emailService.sendMissionCompletionNotification,
      ).not.toHaveBeenCalled();
    });

    it("should handle prisma errors gracefully without throwing", async () => {
      const { service, prisma } = await buildService();

      prisma.researchTopic.findUnique.mockRejectedValue(
        new Error("DB connection failed"),
      );

      // Should not propagate
      service.notifyCompletion({
        missionId: "m1",
        topicId: "t1",
        completedTasks: 1,
        totalTasks: 1,
      });

      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      // No assertion needed — just verifying it doesn't throw
    });

    it("should handle email sending errors gracefully", async () => {
      const { service, prisma, emailService } = await buildService();

      prisma.researchTopic.findUnique.mockResolvedValue({
        userId: "user-1",
        name: "Research Topic",
      });
      prisma.user.findUnique.mockResolvedValue({ email: "user@example.com" });
      emailService.sendMissionCompletionNotification.mockRejectedValue(
        new Error("SMTP error"),
      );

      service.notifyCompletion({
        missionId: "m1",
        topicId: "t1",
        completedTasks: 3,
        totalTasks: 3,
      });

      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      // Should not throw — error is caught inside the IIFE
    });
  });

  // ─── getAiSettings ───────────────────────────────────────────────────────────

  describe("getAiSettings", () => {
    it("should return empty object when settingsService is absent", async () => {
      const { service } = await buildService({ withSettings: false });
      const result = await service.getAiSettings();
      expect(result).toEqual({});
    });

    it("should return rateLimitHint when rateLimitPerMinute > 0", async () => {
      const { service, settingsService } = await buildService();
      settingsService.getAiSettings.mockResolvedValue({
        rateLimitPerMinute: 90,
      });

      const result = await service.getAiSettings();

      expect(result).toEqual({ rateLimitHint: 30 }); // floor(90 / 3) = 30
    });

    it("should floor the hint correctly", async () => {
      const { service, settingsService } = await buildService();
      settingsService.getAiSettings.mockResolvedValue({
        rateLimitPerMinute: 100,
      });

      const result = await service.getAiSettings();
      expect(result).toEqual({ rateLimitHint: 33 }); // floor(100 / 3) = 33
    });

    it("should return empty object when rateLimitPerMinute is 0", async () => {
      const { service, settingsService } = await buildService();
      settingsService.getAiSettings.mockResolvedValue({
        rateLimitPerMinute: 0,
      });

      const result = await service.getAiSettings();
      expect(result).toEqual({});
    });

    it("should return empty object when rateLimitPerMinute is negative", async () => {
      const { service, settingsService } = await buildService();
      settingsService.getAiSettings.mockResolvedValue({
        rateLimitPerMinute: -5,
      });

      const result = await service.getAiSettings();
      expect(result).toEqual({});
    });

    it("should return empty object when settingsService.getAiSettings throws", async () => {
      const { service, settingsService } = await buildService();
      settingsService.getAiSettings.mockRejectedValue(
        new Error("settings unavailable"),
      );

      const result = await service.getAiSettings();
      expect(result).toEqual({});
    });
  });
});
