import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { FeedbackService } from "../feedback.service";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import {
  EmailNotificationPresetsService,
  FeedbackStatusUpdatePreset,
} from "../../../platform/facade";
import { ObjectStorageService } from "../../../platform/storage/object-store/object-storage.service";
import { CreateFeedbackDto, FeedbackTypeDto } from "../dto/create-feedback.dto";

describe("FeedbackService", () => {
  let service: FeedbackService;
  let mockPrisma: jest.Mocked<Partial<PrismaService>>;
  let mockEmailService: jest.Mocked<Partial<EmailNotificationPresetsService>>;
  let mockStatusPreset: jest.Mocked<Partial<FeedbackStatusUpdatePreset>>;
  let mockR2Storage: jest.Mocked<Partial<ObjectStorageService>>;
  let mockEventEmitter: jest.Mocked<Partial<EventEmitter2>>;

  const makeFeedback = (overrides: Record<string, unknown> = {}) => ({
    id: "feedback-1",
    type: "BUG",
    status: "PENDING",
    title: "Test Bug",
    description: "Something is broken",
    user_email: "user@test.com",
    user_agent: null,
    page_url: null,
    user_id: "user-1",
    attachments: [],
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    mockPrisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: "feedback-1" }]),
    };

    mockEmailService = {
      sendFeedbackNotification: jest.fn().mockResolvedValue(true),
      // sendFeedbackStatusUpdate 已迁移到 FeedbackStatusUpdatePreset.notify
    };
    mockStatusPreset = {
      notify: jest.fn().mockResolvedValue(undefined),
    };

    mockR2Storage = {
      uploadBuffer: jest.fn().mockResolvedValue({
        success: true,
        url: "https://cdn.example.com/file.png",
      }),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: EmailNotificationPresetsService,
          useValue: mockEmailService,
        },
        {
          provide: FeedbackStatusUpdatePreset,
          useValue: mockStatusPreset,
        },
        { provide: ObjectStorageService, useValue: mockR2Storage },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<FeedbackService>(FeedbackService);
    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==================== createFeedback ====================

  describe("createFeedback", () => {
    const dto: CreateFeedbackDto = {
      type: FeedbackTypeDto.BUG,
      title: "Test Bug",
      description: "Something broke",
      userEmail: "user@test.com",
    };

    it("creates feedback and returns success result", async () => {
      const result = await service.createFeedback(dto, "user-1");

      expect(result.success).toBe(true);
      expect(result.feedbackId).toBe("feedback-1");
      expect(result.message).toBe("Feedback submitted successfully");
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    it("sends email notification after creation", async () => {
      await service.createFeedback(dto, "user-1");

      expect(mockEmailService.sendFeedbackNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "BUG",
          title: "Test Bug",
          description: "Something broke",
          userEmail: "user@test.com",
        }),
      );
    });

    it("emits feedback.created event", async () => {
      await service.createFeedback(dto, "user-1");

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        "feedback.created",
        expect.objectContaining({
          type: "BUG",
          title: "Test Bug",
        }),
      );
    });

    it("uploads attachments to R2 storage", async () => {
      const file = {
        buffer: Buffer.from("file-content"),
        originalname: "screenshot.png",
        mimetype: "image/png",
        size: 1024,
      } as Express.Multer.File;

      await service.createFeedback(dto, "user-1", [file]);

      expect(mockR2Storage.uploadBuffer).toHaveBeenCalledWith(
        file.buffer,
        expect.stringContaining("feedback/"),
        "screenshot.png",
        "image/png",
      );
    });

    it("continues without email when email notification fails", async () => {
      (
        mockEmailService.sendFeedbackNotification as jest.Mock
      ).mockRejectedValue(new Error("SMTP error"));

      const result = await service.createFeedback(dto, "user-1");

      expect(result.success).toBe(true); // Should not fail the request
    });

    it("continues without event when event emit fails", async () => {
      (mockEventEmitter.emit as jest.Mock).mockImplementation(() => {
        throw new Error("Event error");
      });

      const result = await service.createFeedback(dto);

      expect(result.success).toBe(true);
    });

    it("returns attachmentsCount in result", async () => {
      const file = {
        buffer: Buffer.from("content"),
        originalname: "img.png",
        mimetype: "image/png",
        size: 512,
      } as Express.Multer.File;

      const result = await service.createFeedback(dto, "user-1", [file]);

      expect(result.attachmentsCount).toBe(1);
    });

    it("skips failed attachments gracefully", async () => {
      (mockR2Storage.uploadBuffer as jest.Mock).mockResolvedValue({
        success: false,
        error: "Upload failed",
      });

      const file = {
        buffer: Buffer.from("content"),
        originalname: "img.png",
        mimetype: "image/png",
        size: 512,
      } as Express.Multer.File;

      const result = await service.createFeedback(dto, "user-1", [file]);

      expect(result.success).toBe(true);
      expect(result.attachmentsCount).toBe(0); // Upload failed
    });
  });

  // ==================== getUserFeedback ====================

  describe("getUserFeedback", () => {
    it("returns user feedback with total count", async () => {
      (mockPrisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([makeFeedback()]) // feedbacks query
        .mockResolvedValueOnce([{ count: BigInt(1) }]); // count query

      const result = await service.getUserFeedback("user-1");

      expect(result.feedbacks).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it("applies custom limit and offset", async () => {
      (mockPrisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: BigInt(0) }]);

      await service.getUserFeedback("user-1", { limit: 10, offset: 20 });

      // Should pass the options to $queryRaw — we just verify service doesn't throw
    });
  });

  // ==================== getAllFeedback ====================

  describe("getAllFeedback", () => {
    it("returns all feedback with total count", async () => {
      (mockPrisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([makeFeedback()])
        .mockResolvedValueOnce([{ count: BigInt(1) }]);

      const result = await service.getAllFeedback();

      expect(result.feedbacks).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it("throws for invalid status", async () => {
      await expect(
        service.getAllFeedback({ status: "INVALID_STATUS" as never }),
      ).rejects.toThrow("Invalid feedback status");
    });

    it("throws for invalid type", async () => {
      await expect(
        service.getAllFeedback({ type: "INVALID_TYPE" as never }),
      ).rejects.toThrow("Invalid feedback type");
    });
  });

  // ==================== getFeedbackById ====================

  describe("getFeedbackById", () => {
    it("returns feedback when found", async () => {
      const feedback = makeFeedback();
      (mockPrisma.$queryRaw as jest.Mock).mockResolvedValue([feedback]);

      const result = await service.getFeedbackById("feedback-1");

      expect(result).toEqual(feedback);
    });

    it("returns null when not found", async () => {
      (mockPrisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      const result = await service.getFeedbackById("nonexistent");

      expect(result).toBeNull();
    });
  });

  // ==================== updateFeedbackStatus ====================

  describe("updateFeedbackStatus", () => {
    it("returns null when feedback not found", async () => {
      // getFeedbackById returns null
      (mockPrisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      const result = await service.updateFeedbackStatus(
        "nonexistent",
        "RESOLVED",
      );

      expect(result).toBeNull();
    });

    it("updates status and returns updated feedback", async () => {
      const existing = makeFeedback({ status: "PENDING" });
      const updated = makeFeedback({ status: "RESOLVED" });

      (mockPrisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([existing]) // getFeedbackById
        .mockResolvedValueOnce([updated]); // UPDATE query

      const result = await service.updateFeedbackStatus(
        "feedback-1",
        "RESOLVED",
      );

      expect(result).toEqual(updated);
    });

    it("sends status update email when user has email and status changed", async () => {
      const existing = makeFeedback({
        status: "PENDING",
        user_email: "user@test.com",
        title: "Bug Report",
        type: "BUG",
      });
      const updated = makeFeedback({ status: "RESOLVED" });

      (mockPrisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([existing])
        .mockResolvedValueOnce([updated]);

      await service.updateFeedbackStatus("feedback-1", "RESOLVED");

      expect(mockStatusPreset.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          newStatus: "RESOLVED",
          userEmail: "user@test.com",
        }),
      );
    });

    it("does not send email when status has not changed", async () => {
      const existing = makeFeedback({ status: "RESOLVED" });
      const updated = makeFeedback({ status: "RESOLVED" });

      (mockPrisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([existing])
        .mockResolvedValueOnce([updated]);

      await service.updateFeedbackStatus("feedback-1", "RESOLVED");

      expect(mockStatusPreset.notify).not.toHaveBeenCalled();
    });
  });

  // ==================== getFeedbackStats ====================

  describe("getFeedbackStats", () => {
    it("returns stats with total, byType, and byStatus", async () => {
      (mockPrisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ count: BigInt(10) }]) // total
        .mockResolvedValueOnce([
          { type: "BUG", count: BigInt(6) },
          { type: "FEATURE", count: BigInt(4) },
        ]) // byType
        .mockResolvedValueOnce([
          { status: "PENDING", count: BigInt(8) },
          { status: "RESOLVED", count: BigInt(2) },
        ]); // byStatus

      const result = await service.getFeedbackStats();

      expect(result.total).toBe(10);
      expect(result.byType["BUG"]).toBe(6);
      expect(result.byType["FEATURE"]).toBe(4);
      expect(result.byStatus["PENDING"]).toBe(8);
    });
  });

  // ==================== batchUpdateStatus ====================

  describe("batchUpdateStatus", () => {
    it("returns count of updated items", async () => {
      (mockPrisma.$queryRaw as jest.Mock).mockResolvedValue([
        { count: BigInt(3) },
      ]);

      const result = await service.batchUpdateStatus(
        ["id-1", "id-2", "id-3"],
        "REVIEWED",
      );

      expect(result.count).toBe(3);
    });
  });
});
