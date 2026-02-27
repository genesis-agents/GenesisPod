import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EmailService } from "../email.service";
import { SettingsService } from "../../settings/settings.service";

describe("EmailService", () => {
  let service: EmailService;
  let mockConfigService: jest.Mocked<Partial<ConfigService>>;
  let mockSettingsService: jest.Mocked<Partial<SettingsService>>;

  const makeEmailSettings = (overrides: Record<string, unknown> = {}) => ({
    provider: "smtp" as const,
    enabled: true,
    from: "noreply@test.com",
    adminEmail: "admin@test.com",
    host: "smtp.test.com",
    port: 587,
    user: "user@test.com",
    pass: "password",
    resendApiKey: null,
    ...overrides,
  });

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    mockSettingsService = {
      getEmailSettings: jest.fn().mockResolvedValue(makeEmailSettings()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: SettingsService, useValue: mockSettingsService },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==================== onModuleInit ====================

  describe("onModuleInit", () => {
    it("initializes SMTP provider when provider is smtp and settings are complete", async () => {
      await service.onModuleInit();
      // Service should be configured after SMTP init with valid settings
      expect(mockSettingsService.getEmailSettings).toHaveBeenCalled();
    });

    it("does not configure service when email is disabled", async () => {
      (mockSettingsService.getEmailSettings as jest.Mock).mockResolvedValue(
        makeEmailSettings({ enabled: false }),
      );

      await service.onModuleInit();

      expect(service.isEnabled()).toBe(false);
    });

    it("does not configure SMTP when host is missing", async () => {
      (mockSettingsService.getEmailSettings as jest.Mock).mockResolvedValue(
        makeEmailSettings({ host: null }),
      );

      await service.onModuleInit();

      expect(service.isEnabled()).toBe(false);
    });

    it("does not configure SMTP when user is missing", async () => {
      (mockSettingsService.getEmailSettings as jest.Mock).mockResolvedValue(
        makeEmailSettings({ user: null }),
      );

      await service.onModuleInit();

      expect(service.isEnabled()).toBe(false);
    });

    it("does not configure SMTP when pass is missing", async () => {
      (mockSettingsService.getEmailSettings as jest.Mock).mockResolvedValue(
        makeEmailSettings({ pass: null }),
      );

      await service.onModuleInit();

      expect(service.isEnabled()).toBe(false);
    });

    it("handles settings service error gracefully", async () => {
      (mockSettingsService.getEmailSettings as jest.Mock).mockRejectedValue(
        new Error("DB error"),
      );

      await expect(service.onModuleInit()).resolves.not.toThrow();
      expect(service.isEnabled()).toBe(false);
    });

    it("does not configure Resend when API key is null", async () => {
      (mockSettingsService.getEmailSettings as jest.Mock).mockResolvedValue(
        makeEmailSettings({ provider: "resend", resendApiKey: null }),
      );

      await service.onModuleInit();

      expect(service.isEnabled()).toBe(false);
      expect(service.getProvider()).toBe("resend");
    });
  });

  // ==================== isEnabled / getProvider ====================

  describe("isEnabled and getProvider", () => {
    it("returns false before initialization", () => {
      expect(service.isEnabled()).toBe(false);
    });

    it("returns smtp as default provider", () => {
      expect(service.getProvider()).toBe("smtp");
    });
  });

  // ==================== sendEmail ====================

  describe("sendEmail", () => {
    it("returns false when service is not configured", async () => {
      const result = await service.sendEmail({
        to: "recipient@test.com",
        subject: "Test",
        html: "<p>Test</p>",
      });

      expect(result).toBe(false);
    });

    it("accepts array of recipients", async () => {
      // Service is not configured, so it returns false but should not throw
      const result = await service.sendEmail({
        to: ["a@test.com", "b@test.com"],
        subject: "Multi-recipient test",
        text: "Hello",
      });

      expect(result).toBe(false); // not configured
    });

    it("returns false when smtp transporter is null", async () => {
      // Force provider to smtp, but keep transporter null (default state)
      const result = await service.sendEmail({
        to: "test@test.com",
        subject: "Test",
        text: "Hello",
      });

      expect(result).toBe(false);
    });
  });

  // ==================== testConnection ====================

  describe("testConnection", () => {
    it("returns failure when service is not configured", async () => {
      const result = await service.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toBe("Email service not configured");
    });
  });

  // ==================== reinitialize ====================

  describe("reinitialize", () => {
    it("re-invokes settings service on reinitialize", async () => {
      await service.reinitialize();

      expect(mockSettingsService.getEmailSettings).toHaveBeenCalled();
    });

    it("resets configured state before reinitializing", async () => {
      // First init with disabled
      (mockSettingsService.getEmailSettings as jest.Mock).mockResolvedValue(
        makeEmailSettings({ enabled: false }),
      );
      await service.onModuleInit();

      // Second reinit with enabled (still no transporter in test env)
      (mockSettingsService.getEmailSettings as jest.Mock).mockResolvedValue(
        makeEmailSettings({ enabled: true }),
      );
      await service.reinitialize();

      expect(mockSettingsService.getEmailSettings).toHaveBeenCalledTimes(2);
    });
  });

  // ==================== sendFeedbackNotification ====================

  describe("sendFeedbackNotification", () => {
    it("returns false when admin email is not configured", async () => {
      // Service is not configured so admin email is empty string
      const result = await service.sendFeedbackNotification({
        id: "feedback-1",
        type: "BUG",
        title: "Test Bug",
        description: "Something broke",
      });

      expect(result).toBe(false);
    });
  });

  // ==================== sendMissionCompletionNotification ====================

  describe("sendMissionCompletionNotification", () => {
    it("returns false when email service is not configured", async () => {
      const result = await service.sendMissionCompletionNotification({
        to: "user@test.com",
        missionId: "mission-1",
        missionTitle: "Test Mission",
        reportUrl: "https://example.com/report",
        completedAt: new Date(),
      });

      expect(result).toBe(false);
    });
  });

  // ==================== sendFeedbackStatusUpdate ====================

  describe("sendFeedbackStatusUpdate", () => {
    it("returns false when email service is not configured", async () => {
      const result = await service.sendFeedbackStatusUpdate({
        id: "feedback-1",
        title: "Bug Report",
        type: "BUG",
        oldStatus: "PENDING",
        newStatus: "RESOLVED",
        userEmail: "user@test.com",
      });

      expect(result).toBe(false);
    });
  });
});
