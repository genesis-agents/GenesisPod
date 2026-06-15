import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ForesightIntakeService } from "../services/foresight-intake.service";

/**
 * 聚焦 matchSignalsFromSource 共享匹配器（scanRadar / scanExplore 共用）：
 * 验证 explore-scan 走 AI_EXPLORE 源、basis.org=前沿库、命中建信号；
 * 并回归 scanRadar 仍走 AI_RADAR。
 */
describe("ForesightIntakeService — scanExplore / scanRadar", () => {
  const findFirst = jest.fn();
  const cardFindMany = jest.fn();
  const signalFindMany = jest.fn();
  const signalCreate = jest.fn();
  const chat = jest.fn();
  const registryGet = jest.fn();

  const prisma = {
    foresightTopic: { findFirst },
    foresightCard: { findMany: cardFindMany },
    foresightSignal: { findMany: signalFindMany, create: signalCreate },
  } as never;
  const registry = { get: registryGet } as never;
  const aiChat = { chat } as never;

  const service = new ForesightIntakeService(prisma, registry, aiChat);

  const sourceWithItems = (items: unknown[]) => ({
    listItems: jest.fn().mockResolvedValue({ items }),
  });

  beforeEach(() => {
    findFirst.mockReset();
    cardFindMany.mockReset();
    signalFindMany.mockReset();
    signalCreate.mockReset();
    chat.mockReset();
    registryGet.mockReset();

    findFirst.mockResolvedValue({ id: "t1", userId: "u1", name: "下一代算力" });
    cardFindMany.mockResolvedValue([
      {
        id: "c1",
        cardKey: "A-L0-01",
        title: "HBM4 如期量产",
        conf: 0.6,
        falsifiers: ["量产指引下修"],
      },
    ]);
    signalFindMany.mockResolvedValue([]);
    signalCreate.mockResolvedValue({});
  });

  it("scanExplore 走 AI_EXPLORE 源；命中建候选信号，basis.org=AI 前沿库", async () => {
    const src = sourceWithItems([
      { id: "r1", title: "SK hynix 下修 HBM4 指引", preview: "财报会口径" },
    ]);
    registryGet.mockReturnValue(src);
    chat.mockResolvedValue({
      content: JSON.stringify({
        matches: [
          {
            index: 0,
            cardKey: "A-L0-01",
            falsifier: "量产指引下修",
            grade: "strong",
            direction: "down",
            reason: "官方下修",
          },
        ],
      }),
    });

    const res = await service.scanExplore("u1", "t1");

    expect(registryGet).toHaveBeenCalledWith("AI_EXPLORE");
    expect(res).toEqual({ scanned: 1, matched: 1, created: 1 });
    const created = signalCreate.mock.calls[0][0].data;
    expect(created.basis.sources[0].org).toBe("AI 前沿库");
  });

  it("scanExplore 源未注册 → ServiceUnavailable（前沿库文案）", async () => {
    registryGet.mockReturnValue(undefined);
    await expect(service.scanExplore("u1", "t1")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(service.scanExplore("u1", "t1")).rejects.toThrow("前沿库");
  });

  it("无 falsifier 假设卡 → BadRequest（不查源、不调 LLM）", async () => {
    cardFindMany.mockResolvedValue([
      { id: "c1", cardKey: "A-L0-01", title: "x", conf: 0.6, falsifiers: [] },
    ]);
    await expect(service.scanExplore("u1", "t1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(registryGet).not.toHaveBeenCalled();
    expect(chat).not.toHaveBeenCalled();
  });

  it("scanRadar 仍走 AI_RADAR 源（回归）", async () => {
    registryGet.mockReturnValue(sourceWithItems([]));
    const res = await service.scanRadar("u1", "t1");
    expect(registryGet).toHaveBeenCalledWith("AI_RADAR");
    // 源返回空 → 提前返回零计数，不调用 LLM
    expect(res).toEqual({ scanned: 0, matched: 0, created: 0 });
    expect(chat).not.toHaveBeenCalled();
  });
});
