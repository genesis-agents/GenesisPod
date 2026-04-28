import { Logger } from "@nestjs/common";
import { PublishSchedulerService } from "../publish-scheduler.service";
import { SocialContentStatus } from "../../types";

describe("PublishSchedulerService", () => {
  let service: PublishSchedulerService;
  let prisma: {
    socialContent: { findMany: jest.Mock; updateMany: jest.Mock };
  };
  let publishExecutor: { execute: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();

    prisma = {
      socialContent: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    publishExecutor = { execute: jest.fn().mockResolvedValue(undefined) };
    configService = { get: jest.fn((_k: string, def: unknown) => def) };

    service = new PublishSchedulerService(
      configService as never,
      prisma as never,
      publishExecutor as never,
    );
  });

  describe("onModuleInit", () => {
    it("starts scheduler when enabled (default true)", () => {
      const setIntSpy = jest
        .spyOn(global, "setInterval")
        .mockReturnValue({ unref: jest.fn() } as never);
      const setTimSpy = jest
        .spyOn(global, "setTimeout")
        .mockReturnValue({ unref: jest.fn() } as never);

      service.onModuleInit();

      expect(setIntSpy).toHaveBeenCalled();
      expect(setTimSpy).toHaveBeenCalled();

      setIntSpy.mockRestore();
      setTimSpy.mockRestore();
    });

    it("skips scheduler when disabled", () => {
      configService.get.mockImplementation((key: string, def: unknown) =>
        key === "PUBLISH_SCHEDULER_ENABLED" ? false : def,
      );
      const setIntSpy = jest.spyOn(global, "setInterval");
      service.onModuleInit();
      expect(setIntSpy).not.toHaveBeenCalled();
      setIntSpy.mockRestore();
    });
  });

  describe("onModuleDestroy", () => {
    it("clears the interval if started", () => {
      const fakeInterval = setInterval(() => undefined, 999999);
      (service as unknown as { intervalId: NodeJS.Timeout }).intervalId =
        fakeInterval;
      service.onModuleDestroy();
      expect(
        (service as unknown as { intervalId: null }).intervalId,
      ).toBeNull();
      clearInterval(fakeInterval);
    });

    it("noop when no interval", () => {
      expect(() => service.onModuleDestroy()).not.toThrow();
    });
  });

  describe("processDuePublishes", () => {
    it("returns early when isRunning", async () => {
      (service as unknown as { isRunning: boolean }).isRunning = true;
      await service.processDuePublishes();
      expect(prisma.socialContent.findMany).not.toHaveBeenCalled();
    });

    it("returns early when no due content found", async () => {
      prisma.socialContent.findMany.mockResolvedValue([]);
      await service.processDuePublishes();
      expect(prisma.socialContent.updateMany).not.toHaveBeenCalled();
      expect(publishExecutor.execute).not.toHaveBeenCalled();
    });

    it("processes due contents: CAS update + execute", async () => {
      prisma.socialContent.findMany.mockResolvedValue([
        { id: "c1", title: "Post 1", scheduledAt: new Date() },
        { id: "c2", title: "Post 2", scheduledAt: new Date() },
      ]);
      prisma.socialContent.updateMany.mockResolvedValue({ count: 1 });
      await service.processDuePublishes();

      expect(prisma.socialContent.updateMany).toHaveBeenCalledTimes(2);
      // Wait for fire-and-forget executor calls to be registered
      await new Promise((r) => setImmediate(r));
      expect(publishExecutor.execute).toHaveBeenCalledTimes(2);
    });

    it("skips content already picked up by another process (CAS miss)", async () => {
      prisma.socialContent.findMany.mockResolvedValue([
        { id: "c1", title: "Post 1", scheduledAt: new Date() },
      ]);
      prisma.socialContent.updateMany.mockResolvedValue({ count: 0 });
      await service.processDuePublishes();
      expect(publishExecutor.execute).not.toHaveBeenCalled();
    });

    it("logs error when single CAS update fails but continues", async () => {
      prisma.socialContent.findMany.mockResolvedValue([
        { id: "c1", title: "Post 1", scheduledAt: new Date() },
        { id: "c2", title: "Post 2", scheduledAt: new Date() },
      ]);
      prisma.socialContent.updateMany
        .mockRejectedValueOnce(new Error("write conflict"))
        .mockResolvedValueOnce({ count: 1 });
      await service.processDuePublishes();
      // first one threw and was caught, second one ran successfully
      await new Promise((r) => setImmediate(r));
      expect(publishExecutor.execute).toHaveBeenCalledTimes(1);
    });

    it("handles fire-and-forget executor failure via .catch", async () => {
      prisma.socialContent.findMany.mockResolvedValue([
        { id: "c1", title: "Post 1", scheduledAt: new Date() },
      ]);
      publishExecutor.execute.mockRejectedValue(new Error("network down"));
      await service.processDuePublishes();
      await new Promise((r) => setImmediate(r));
      // No throw — error was caught in .catch handler
      expect(publishExecutor.execute).toHaveBeenCalled();
    });

    it("logs top-level error and clears isRunning", async () => {
      prisma.socialContent.findMany.mockRejectedValue(new Error("db down"));
      await service.processDuePublishes();
      expect((service as unknown as { isRunning: boolean }).isRunning).toBe(
        false,
      );
    });

    it("uses SocialContentStatus.SCHEDULED filter", async () => {
      prisma.socialContent.findMany.mockResolvedValue([]);
      await service.processDuePublishes();
      expect(prisma.socialContent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: SocialContentStatus.SCHEDULED,
          }),
        }),
      );
    });
  });
});
