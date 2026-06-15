import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ForesightIntakeService } from "../services/foresight-intake.service";

/**
 * scanExplore（2026-06-15 彻底修后）：经 ToolRegistry 调 explore-search 工具
 * （scope=public + 主题关键词）查公共前沿库，而非旧版 AI_EXPLORE 泛收藏内容源。
 * 并回归 scanRadar 仍走 AI_RADAR 内容源。
 */
describe("ForesightIntakeService — scanExplore / scanRadar", () => {
  const findFirst = jest.fn();
  const cardFindMany = jest.fn();
  const signalFindMany = jest.fn();
  const signalCreate = jest.fn();
  const chat = jest.fn();
  const registryGet = jest.fn(); // ContentSourceRegistry.get（radar 用）
  const toolTryGet = jest.fn(); // ToolRegistry.tryGet（explore 用）

  const prisma = {
    foresightTopic: { findFirst },
    foresightCard: { findMany: cardFindMany },
    foresightSignal: { findMany: signalFindMany, create: signalCreate },
  } as never;
  const registry = { get: registryGet } as never;
  const aiChat = { chat } as never;
  const toolRegistry = { tryGet: toolTryGet } as never;

  const service = new ForesightIntakeService(
    prisma,
    registry,
    aiChat,
    toolRegistry,
  );

  const exploreToolReturning = (
    results: Array<{ title: string; summary?: string | null }>,
  ) => ({
    execute: jest.fn().mockResolvedValue({
      success: true,
      data: { results, success: true, totalResults: results.length },
      metadata: {},
    }),
  });

  beforeEach(() => {
    findFirst.mockReset();
    cardFindMany.mockReset();
    signalFindMany.mockReset();
    signalCreate.mockReset();
    chat.mockReset();
    registryGet.mockReset();
    toolTryGet.mockReset();

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

  it("scanExplore 先抽英文关键词再经 explore-search 查公共全量(scope=public)", async () => {
    const tool = exploreToolReturning([
      {
        title: "SK hynix cuts HBM4 mass-production guidance",
        summary: "earnings call",
      },
    ]);
    toolTryGet.mockReturnValue(tool);
    // 前沿库为英文语料：第 1 次 LLM 抽英文检索词，第 2 次 LLM 做 falsifier 匹配。
    chat
      .mockResolvedValueOnce({
        content: JSON.stringify({ keywords: ["HBM4", "SK hynix", "memory"] }),
      })
      .mockResolvedValueOnce({
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

    expect(toolTryGet).toHaveBeenCalledWith("explore-search");
    const input = tool.execute.mock.calls[0][0];
    expect(input.scope).toBe("public");
    // 检索词来自 LLM 抽的英文关键词（不再是中文主题名/卡标题）
    expect(input.query).toContain("HBM4");
    expect(chat).toHaveBeenCalledTimes(2); // 抽词 + 匹配各一次
    // 不应再走 ContentSourceRegistry（不是泛收藏）
    expect(registryGet).not.toHaveBeenCalled();

    expect(res).toEqual({ scanned: 1, matched: 1, created: 1 });
    expect(signalCreate.mock.calls[0][0].data.basis.sources[0].org).toBe(
      "AI 前沿库",
    );
  });

  it("scanExplore 工具未注册 → ServiceUnavailable（前沿库检索工具文案）", async () => {
    toolTryGet.mockReturnValue(undefined);
    await expect(service.scanExplore("u1", "t1")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(service.scanExplore("u1", "t1")).rejects.toThrow(
      "前沿库检索工具",
    );
  });

  it("scanExplore 工具返回空结果 → 0 计数，不调匹配 LLM（仅抽词）", async () => {
    toolTryGet.mockReturnValue(exploreToolReturning([]));
    chat.mockResolvedValue({ content: JSON.stringify({ keywords: ["HBM"] }) });
    const res = await service.scanExplore("u1", "t1");
    expect(res).toEqual({ scanned: 0, matched: 0, created: 0 });
    // 抽英文关键词调 1 次；空召回不再进匹配 LLM
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it("无 falsifier 假设卡 → BadRequest（不取数、不调工具/LLM）", async () => {
    cardFindMany.mockResolvedValue([
      { id: "c1", cardKey: "A-L0-01", title: "x", conf: 0.6, falsifiers: [] },
    ]);
    await expect(service.scanExplore("u1", "t1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(toolTryGet).not.toHaveBeenCalled();
    expect(chat).not.toHaveBeenCalled();
  });

  it("scanRadar 仍走 AI_RADAR 内容源（回归）", async () => {
    registryGet.mockReturnValue({
      listItems: jest.fn().mockResolvedValue({ items: [] }),
    });
    const res = await service.scanRadar("u1", "t1");
    expect(registryGet).toHaveBeenCalledWith("AI_RADAR");
    expect(toolTryGet).not.toHaveBeenCalled();
    expect(res).toEqual({ scanned: 0, matched: 0, created: 0 });
  });
});
