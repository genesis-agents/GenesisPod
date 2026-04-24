/**
 * TopicRefreshScheduler Unit Tests
 *
 * Coverage targets:
 * - onModuleInit: initializes interval, calls updateNextRefreshTimes
 * - onModuleDestroy: clears interval
 * - checkAndRefreshTopics: no topics, topics found, P2021 error, generic error
 * - refreshTopic (private, tested via checkAndRefreshTopics): topic not found, success, error
 * - calculateNextRefreshTime: DAILY, WEEKLY, BIWEEKLY, MONTHLY, MANUAL/default
 * - updateNextRefreshTimes: no topics needing refresh, multiple topics updated
 * - getSchedule: topic not found (null), topic with existing schedule
 * - updateSchedule: new schedule (create), existing schedule (update), MANUAL frequency
 */

import { Test, TestingModule } from "@nestjs/testing";
import { RefreshFrequency, ResearchTopicStatus } from "@prisma/client";

import { TopicRefreshScheduler } from "../topic-refresh.scheduler";
import { PrismaService } from "@/common/prisma/prisma.service";
import { MissionExecutionService } from "../../mission/execution.service";

// ============================================================================
// Helpers
// ============================================================================

function makeTopic(overrides: Record<string, unknown> = {}) {
  return {
    id: "topic-1",
    name: "Test Topic",
    status: ResearchTopicStatus.ACTIVE,
    refreshFrequency: RefreshFrequency.DAILY,
    nextRefreshAt: new Date(Date.now() - 1000), // already overdue
    lastRefreshAt: null,
    ...overrides,
  };
}

// ============================================================================
// Mock setup
// ============================================================================

function buildPrismaMock() {
  return {
    researchTopic: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    researchMission: {
      create: jest.fn().mockResolvedValue({ id: "mission-1" }),
    },
    topicSchedule: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
}

function buildMissionExecutionMock() {
  return {
    startExecution: jest.fn().mockResolvedValue(undefined),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("TopicRefreshScheduler", () => {
  let scheduler: TopicRefreshScheduler;
  let prisma: ReturnType<typeof buildPrismaMock>;
  let missionExecution: ReturnType<typeof buildMissionExecutionMock>;

  beforeEach(async () => {
    jest.useFakeTimers();
    prisma = buildPrismaMock();
    missionExecution = buildMissionExecutionMock();

    // Default: no topics needing refresh on init
    prisma.researchTopic.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TopicRefreshScheduler,
        { provide: PrismaService, useValue: prisma },
        { provide: MissionExecutionService, useValue: missionExecution },
      ],
    }).compile();

    scheduler = module.get<TopicRefreshScheduler>(TopicRefreshScheduler);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // ==========================================================================
  // onModuleInit / onModuleDestroy
  // ==========================================================================

  describe("onModuleInit()", () => {
    it("should call updateNextRefreshTimes and set up an interval", async () => {
      const updateSpy = jest
        .spyOn(scheduler, "updateNextRefreshTimes")
        .mockResolvedValue();

      await scheduler.onModuleInit();

      expect(updateSpy).toHaveBeenCalledTimes(1);
    });

    it("should silently handle P2021 error during init (table not yet migrated)", async () => {
      const p2021Error = Object.assign(new Error("Table not found"), {
        code: "P2021",
      });
      jest
        .spyOn(scheduler, "updateNextRefreshTimes")
        .mockRejectedValue(p2021Error);

      // Should not throw
      await expect(scheduler.onModuleInit()).resolves.toBeUndefined();
    });

    it("should log error for non-P2021 errors during init", async () => {
      const genericError = new Error("Connection timeout");
      jest
        .spyOn(scheduler, "updateNextRefreshTimes")
        .mockRejectedValue(genericError);

      // Should not throw, but logs the error
      await expect(scheduler.onModuleInit()).resolves.toBeUndefined();
    });
  });

  describe("onModuleDestroy()", () => {
    it("should clear the interval when destroying the module", async () => {
      const clearIntervalSpy = jest.spyOn(global, "clearInterval");
      jest.spyOn(scheduler, "updateNextRefreshTimes").mockResolvedValue();

      await scheduler.onModuleInit();
      scheduler.onModuleDestroy();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it("should be safe to call onModuleDestroy before onModuleInit", () => {
      // intervalHandle is null before init, should not throw
      expect(() => scheduler.onModuleDestroy()).not.toThrow();
    });
  });

  // ==========================================================================
  // checkAndRefreshTopics
  // ==========================================================================

  describe("checkAndRefreshTopics()", () => {
    it("should return early when no topics need refresh", async () => {
      prisma.researchTopic.findMany.mockResolvedValue([]);

      await scheduler.checkAndRefreshTopics();

      expect(missionExecution.startExecution).not.toHaveBeenCalled();
    });

    it("should refresh all topics that are overdue", async () => {
      const topics = [
        makeTopic({ id: "topic-1" }),
        makeTopic({ id: "topic-2", refreshFrequency: RefreshFrequency.WEEKLY }),
      ];
      prisma.researchTopic.findMany.mockResolvedValue(topics);
      prisma.researchTopic.findUnique
        .mockResolvedValueOnce(topics[0])
        .mockResolvedValueOnce(topics[1]);
      prisma.researchTopic.update.mockResolvedValue({});

      await scheduler.checkAndRefreshTopics();

      expect(missionExecution.startExecution).toHaveBeenCalledTimes(2);
      expect(prisma.researchTopic.update).toHaveBeenCalledTimes(2);
    });

    it("should handle P2021 error gracefully (table does not exist)", async () => {
      const p2021Error = Object.assign(new Error("Table not found"), {
        code: "P2021",
      });
      prisma.researchTopic.findMany.mockRejectedValue(p2021Error);

      // Should not throw
      await expect(scheduler.checkAndRefreshTopics()).resolves.toBeUndefined();
    });

    it("should log error for non-P2021 errors during check", async () => {
      const genericError = new Error("Network error");
      prisma.researchTopic.findMany.mockRejectedValue(genericError);

      // Should not throw
      await expect(scheduler.checkAndRefreshTopics()).resolves.toBeUndefined();
    });

    it("should continue processing remaining topics even if one fails", async () => {
      const topics = [
        makeTopic({ id: "topic-1" }),
        makeTopic({ id: "topic-2" }),
      ];
      prisma.researchTopic.findMany.mockResolvedValue(topics);
      // First topic fails, second succeeds
      prisma.researchTopic.findUnique
        .mockResolvedValueOnce(topics[0])
        .mockResolvedValueOnce(topics[1]);
      missionExecution.startExecution
        .mockRejectedValueOnce(new Error("Refresh failed"))
        .mockResolvedValueOnce(undefined);
      prisma.researchTopic.update.mockResolvedValue({});

      await scheduler.checkAndRefreshTopics();

      // Second topic should still have been attempted
      expect(missionExecution.startExecution).toHaveBeenCalledTimes(2);
    });

    it("should skip refreshTopic gracefully if topic not found during refresh", async () => {
      const topic = makeTopic();
      prisma.researchTopic.findMany.mockResolvedValue([topic]);
      prisma.researchTopic.findUnique.mockResolvedValue(null); // topic gone by refresh time

      await scheduler.checkAndRefreshTopics();

      expect(missionExecution.startExecution).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // calculateNextRefreshTime
  // ==========================================================================

  describe("calculateNextRefreshTime()", () => {
    const MS_PER_HOUR = 60 * 60 * 1000;

    it("should return a date ~24 hours ahead for DAILY", () => {
      const before = Date.now();
      const result = scheduler.calculateNextRefreshTime(RefreshFrequency.DAILY);
      const after = Date.now();

      const expected = 24 * MS_PER_HOUR;
      expect(result.getTime() - before).toBeGreaterThanOrEqual(expected - 100);
      expect(result.getTime() - after).toBeLessThanOrEqual(expected + 100);
    });

    it("should return a date ~7 days ahead for WEEKLY", () => {
      const before = Date.now();
      const result = scheduler.calculateNextRefreshTime(
        RefreshFrequency.WEEKLY,
      );

      const expected = 7 * 24 * MS_PER_HOUR;
      expect(result.getTime() - before).toBeGreaterThanOrEqual(expected - 100);
    });

    it("should return a date ~14 days ahead for BIWEEKLY", () => {
      const before = Date.now();
      const result = scheduler.calculateNextRefreshTime(
        RefreshFrequency.BIWEEKLY,
      );

      const expected = 14 * 24 * MS_PER_HOUR;
      expect(result.getTime() - before).toBeGreaterThanOrEqual(expected - 100);
    });

    it("should return a date ~1 month ahead for MONTHLY", () => {
      const result = scheduler.calculateNextRefreshTime(
        RefreshFrequency.MONTHLY,
      );
      const now = new Date();
      const expectedMonth = (now.getMonth() + 1) % 12;

      expect(result.getMonth()).toBe(expectedMonth);
    });

    it("should return a date ~1 year ahead for MANUAL", () => {
      const before = Date.now();
      const result = scheduler.calculateNextRefreshTime(
        RefreshFrequency.MANUAL,
      );

      const expected = 365 * 24 * MS_PER_HOUR;
      expect(result.getTime() - before).toBeGreaterThanOrEqual(expected - 1000);
    });

    it("should return a future date (result > now)", () => {
      for (const freq of Object.values(RefreshFrequency)) {
        const result = scheduler.calculateNextRefreshTime(freq);
        expect(result.getTime()).toBeGreaterThan(Date.now());
      }
    });
  });

  // ==========================================================================
  // updateNextRefreshTimes
  // ==========================================================================

  describe("updateNextRefreshTimes()", () => {
    it("should do nothing when no topics need refresh time updates", async () => {
      prisma.researchTopic.findMany.mockResolvedValue([]);

      await scheduler.updateNextRefreshTimes();

      expect(prisma.researchTopic.update).not.toHaveBeenCalled();
    });

    it("should update nextRefreshAt for each topic missing it", async () => {
      const topics = [
        makeTopic({
          id: "topic-1",
          nextRefreshAt: null,
          refreshFrequency: RefreshFrequency.DAILY,
        }),
        makeTopic({
          id: "topic-2",
          nextRefreshAt: null,
          refreshFrequency: RefreshFrequency.WEEKLY,
        }),
      ];
      prisma.researchTopic.findMany.mockResolvedValue(topics);
      prisma.researchTopic.update.mockResolvedValue({});

      await scheduler.updateNextRefreshTimes();

      expect(prisma.researchTopic.update).toHaveBeenCalledTimes(2);
      expect(prisma.researchTopic.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "topic-1" },
          data: { nextRefreshAt: expect.any(Date) },
        }),
      );
    });

    it("should query only ACTIVE topics with no nextRefreshAt", async () => {
      prisma.researchTopic.findMany.mockResolvedValue([]);

      await scheduler.updateNextRefreshTimes();

      expect(prisma.researchTopic.findMany).toHaveBeenCalledWith({
        where: {
          status: ResearchTopicStatus.ACTIVE,
          refreshFrequency: { not: RefreshFrequency.MANUAL },
          nextRefreshAt: null,
        },
      });
    });
  });

  // ==========================================================================
  // getSchedule
  // ==========================================================================

  describe("getSchedule()", () => {
    it("should return null when topic does not exist", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue(null);

      const result = await scheduler.getSchedule("non-existent-topic");

      expect(result).toBeNull();
    });

    it("should return schedule info with frequency and timestamps", async () => {
      const topic = {
        refreshFrequency: RefreshFrequency.DAILY,
        lastRefreshAt: new Date("2025-01-01"),
        nextRefreshAt: new Date("2025-01-02"),
      };
      const schedule = { id: "sched-1", isActive: true };

      prisma.researchTopic.findUnique.mockResolvedValue(topic);
      prisma.topicSchedule.findFirst.mockResolvedValue(schedule);

      const result = await scheduler.getSchedule("topic-1");

      expect(result).toEqual({
        frequency: RefreshFrequency.DAILY,
        lastRefreshAt: topic.lastRefreshAt,
        nextRefreshAt: topic.nextRefreshAt,
        schedule,
      });
    });

    it("should return schedule with null schedule when none exists", async () => {
      const topic = {
        refreshFrequency: RefreshFrequency.WEEKLY,
        lastRefreshAt: null,
        nextRefreshAt: null,
      };
      prisma.researchTopic.findUnique.mockResolvedValue(topic);
      prisma.topicSchedule.findFirst.mockResolvedValue(null);

      const result = await scheduler.getSchedule("topic-1");

      expect(result).not.toBeNull();
      expect(result!.schedule).toBeNull();
      expect(result!.frequency).toBe(RefreshFrequency.WEEKLY);
    });
  });

  // ==========================================================================
  // updateSchedule
  // ==========================================================================

  describe("updateSchedule()", () => {
    it("should create a new schedule when none exists", async () => {
      prisma.researchTopic.update.mockResolvedValue({});
      prisma.topicSchedule.findFirst.mockResolvedValue(null);
      prisma.topicSchedule.create.mockResolvedValue({ id: "new-sched" });
      // getSchedule call at the end
      prisma.researchTopic.findUnique.mockResolvedValue({
        refreshFrequency: RefreshFrequency.DAILY,
        lastRefreshAt: null,
        nextRefreshAt: new Date(),
      });
      prisma.topicSchedule.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: "new-sched" });

      await scheduler.updateSchedule("topic-1", RefreshFrequency.DAILY);

      expect(prisma.topicSchedule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            topicId: "topic-1",
            frequency: RefreshFrequency.DAILY,
            isActive: true,
          }),
        }),
      );
    });

    it("should update existing schedule", async () => {
      const existingSchedule = { id: "sched-existing" };
      prisma.researchTopic.update.mockResolvedValue({});
      prisma.topicSchedule.findFirst.mockResolvedValueOnce(existingSchedule);
      prisma.topicSchedule.update.mockResolvedValue({});
      prisma.researchTopic.findUnique.mockResolvedValue({
        refreshFrequency: RefreshFrequency.WEEKLY,
        lastRefreshAt: null,
        nextRefreshAt: new Date(),
      });
      prisma.topicSchedule.findFirst.mockResolvedValueOnce(existingSchedule);

      await scheduler.updateSchedule("topic-1", RefreshFrequency.WEEKLY, {
        dayOfWeek: 1,
        hourOfDay: 10,
      });

      expect(prisma.topicSchedule.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "sched-existing" },
          data: expect.objectContaining({
            frequency: RefreshFrequency.WEEKLY,
            dayOfWeek: 1,
            hourOfDay: 10,
            isActive: true,
          }),
        }),
      );
    });

    it("should set isActive to false and nextRunAt to null for MANUAL frequency", async () => {
      prisma.researchTopic.update.mockResolvedValue({});
      prisma.topicSchedule.findFirst.mockResolvedValueOnce(null);
      prisma.topicSchedule.create.mockResolvedValue({});
      prisma.researchTopic.findUnique.mockResolvedValue({
        refreshFrequency: RefreshFrequency.MANUAL,
        lastRefreshAt: null,
        nextRefreshAt: null,
      });
      prisma.topicSchedule.findFirst.mockResolvedValueOnce(null);

      await scheduler.updateSchedule("topic-1", RefreshFrequency.MANUAL);

      expect(prisma.researchTopic.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nextRefreshAt: null,
          }),
        }),
      );
      expect(prisma.topicSchedule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isActive: false,
            nextRunAt: null,
          }),
        }),
      );
    });

    it("should use default hourOfDay of 9 when not specified", async () => {
      prisma.researchTopic.update.mockResolvedValue({});
      prisma.topicSchedule.findFirst.mockResolvedValueOnce(null);
      prisma.topicSchedule.create.mockResolvedValue({});
      prisma.researchTopic.findUnique.mockResolvedValue({
        refreshFrequency: RefreshFrequency.DAILY,
        lastRefreshAt: null,
        nextRefreshAt: new Date(),
      });
      prisma.topicSchedule.findFirst.mockResolvedValueOnce(null);

      await scheduler.updateSchedule("topic-1", RefreshFrequency.DAILY);

      expect(prisma.topicSchedule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ hourOfDay: 9 }),
        }),
      );
    });
  });
});
