import { ForesightAutoScanScheduler } from "../services/foresight-auto-scan.scheduler";
import type { PrismaService } from "../../../../common/prisma/prisma.service";
import type { NotificationService } from "../../../platform/notifications/notification.service";
import type { ForesightIntakeService } from "../services/foresight-intake.service";

describe("ForesightAutoScanScheduler", () => {
  const findMany = jest.fn();
  const scanRadar = jest.fn();
  const createNotification = jest.fn().mockResolvedValue({ id: "n-1" });

  const prisma = {
    foresightTopic: { findMany },
  } as unknown as PrismaService;
  const intake = { scanRadar } as unknown as ForesightIntakeService;
  const notifications = {
    createNotification,
  } as unknown as NotificationService;
  const svc = new ForesightAutoScanScheduler(prisma, intake, notifications);

  const topics = [
    { id: "t-1", userId: "u-1", name: "算力底座" },
    { id: "t-2", userId: "u-1", name: "AI 安全" },
    { id: "t-3", userId: "u-2", name: "创新药" },
  ];

  beforeEach(() => {
    findMany.mockReset().mockResolvedValue(topics);
    scanRadar
      .mockReset()
      .mockResolvedValue({ scanned: 5, matched: 1, created: 1 });
    createNotification.mockClear();
  });

  it("遍历全部主题，按 3 天窗口扫描", async () => {
    await svc.sweep();
    expect(scanRadar).toHaveBeenCalledTimes(3);
    expect(scanRadar).toHaveBeenCalledWith(
      "u-1",
      "t-1",
      ForesightAutoScanScheduler.SCAN_WINDOW_DAYS,
    );
  });

  it("新命中 > 0 时发站内通知（直达 /foresight）", async () => {
    await svc.sweep();
    expect(createNotification).toHaveBeenCalledTimes(3);
    const dto = createNotification.mock.calls[0][0];
    expect(dto.userId).toBe("u-1");
    expect(dto.title).toContain("算力底座");
    expect(dto.actionUrl).toBe("/foresight");
  });

  it("命中为 0 时不打扰（不发通知）", async () => {
    scanRadar.mockResolvedValue({ scanned: 5, matched: 0, created: 0 });
    await svc.sweep();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("单主题失败（如无 falsifier 卡）不阻塞其余主题", async () => {
    scanRadar
      .mockRejectedValueOnce(new Error("主题还没有带证伪信号的假设卡"))
      .mockResolvedValue({ scanned: 3, matched: 1, created: 1 });
    await expect(svc.sweep()).resolves.toBeUndefined();
    expect(scanRadar).toHaveBeenCalledTimes(3);
    expect(createNotification).toHaveBeenCalledTimes(2);
  });

  it("通知失败不影响扫描主流程", async () => {
    createNotification.mockRejectedValue(new Error("notify down"));
    await expect(svc.sweep()).resolves.toBeUndefined();
    expect(scanRadar).toHaveBeenCalledTimes(3);
  });
});
