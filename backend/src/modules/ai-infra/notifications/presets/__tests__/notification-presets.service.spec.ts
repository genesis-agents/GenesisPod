import { Test, TestingModule } from "@nestjs/testing";
import { NotificationPresetsService } from "../notification-presets.service";
import { NotificationService } from "../../notification.service";

describe("NotificationPresetsService", () => {
  let service: NotificationPresetsService;
  let notificationService: jest.Mocked<NotificationService>;

  const mockNotificationService = {
    batchCreateNotifications: jest.fn().mockResolvedValue({
      count: 2,
      succeeded: ["admin-1", "admin-2"],
      failed: [],
    }),
    createNotification: jest.fn().mockResolvedValue({ id: "notif-1" }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationPresetsService,
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
      ],
    }).compile();

    service = module.get<NotificationPresetsService>(
      NotificationPresetsService,
    );
    notificationService = module.get(NotificationService);
  });

  it("sends join request notifications to admins", async () => {
    await service.notifyJoinRequest({
      topicId: "topic-1",
      topicName: "Test Topic",
      applicantId: "user-2",
      applicantName: "Alice",
      adminUserIds: ["admin-1", "admin-2"],
    });

    expect(notificationService.batchCreateNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "JOIN_REQUEST",
        userIds: ["admin-1", "admin-2"],
      }),
    );
  });

  it("sends join request approval notification", async () => {
    await service.notifyJoinRequestResult({
      userId: "user-1",
      topicId: "topic-1",
      topicName: "Test Topic",
      approved: true,
    });

    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "JOIN_APPROVED",
      }),
    );
  });

  it("sends join request rejection notification", async () => {
    await service.notifyJoinRequestResult({
      userId: "user-1",
      topicId: "topic-1",
      topicName: "Test Topic",
      approved: false,
      reason: "Not eligible",
    });

    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "JOIN_REJECTED",
      }),
    );
  });

  it("sends invitation notification", async () => {
    await service.notifyInvitation({
      userId: "user-2",
      topicId: "topic-1",
      topicName: "Test Topic",
      inviterName: "Alice",
      inviteCode: "invite-code",
    });

    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "INVITATION",
      }),
    );
  });

  it("sends research completed notification", async () => {
    await service.notifyResearchCompleted({
      userId: "user-1",
      researchId: "research-1",
      researchTitle: "Test Research",
    });

    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "RESEARCH_COMPLETED",
      }),
    );
  });

  it("sends low credits notification", async () => {
    await service.notifyCreditsLow({
      userId: "user-1",
      balance: 50,
      threshold: 100,
    });

    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "CREDITS_LOW",
      }),
    );
  });
}
