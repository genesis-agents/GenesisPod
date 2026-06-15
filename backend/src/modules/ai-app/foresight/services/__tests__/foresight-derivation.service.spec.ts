import { BadRequestException } from "@nestjs/common";
import { ForesightDerivationService } from "../foresight-derivation.service";

describe("ForesightDerivationService", () => {
  const findFirst = jest.fn();
  const cardFindMany = jest.fn();
  const conclDeleteMany = jest.fn();
  const conclCreateMany = jest.fn();
  const chat = jest.fn();

  const prisma = {
    foresightTopic: { findFirst },
    foresightCard: { findMany: cardFindMany },
    foresightConclusion: {
      deleteMany: conclDeleteMany,
      createMany: conclCreateMany,
    },
    $transaction: jest.fn(async (ops: unknown[]) => ops),
  } as never;
  const aiChat = { chat } as never;

  const service = new ForesightDerivationService(prisma, aiChat);

  beforeEach(() => {
    findFirst.mockReset();
    cardFindMany.mockReset();
    conclDeleteMany.mockReset();
    conclCreateMany.mockReset();
    chat.mockReset();
    findFirst.mockResolvedValue({ id: "t1", name: "下一代算力底座" });
    conclDeleteMany.mockReturnValue({});
    conclCreateMany.mockReturnValue({});
  });

  it("有卡片 + LLM 返回结论 → 整体替换并落库", async () => {
    cardFindMany.mockResolvedValue([
      {
        cardKey: "A-L0-01",
        layer: "L0",
        title: "Agent 负载主体化",
        claim: "推理负载占比上升",
        conf: 0.75,
        horizon: 2030,
        falsifiers: ["占比不及预期"],
      },
      {
        cardKey: "A-L4-05",
        layer: "L4",
        title: "NVIDIA 份额下滑",
        claim: "专用芯片侵蚀份额",
        conf: 0.65,
        horizon: 2030,
        falsifiers: [],
      },
    ]);
    chat.mockResolvedValue({
      content: JSON.stringify({
        conclusions: [
          {
            title: "推理优先的算力结构确立",
            body: "推理负载占比上升，专用芯片侵蚀通用 GPU 份额。",
            decisions: ["2027 前评估 ASIC 采购", "锁定 HBM 供应"],
            trigger: "份额逆转或占比停滞",
            upstreamKeys: ["A-L0-01", "A-L4-05", "NOT-A-CARD"],
            conf: 0.7,
            horizon: 2030,
          },
        ],
      }),
    });

    const res = await service.deriveConclusions("u1", "t1");

    expect(res).toEqual({ derived: 1 });
    expect(conclDeleteMany).toHaveBeenCalledWith({ where: { topicId: "t1" } });
    const created = conclCreateMany.mock.calls[0][0].data;
    expect(created).toHaveLength(1);
    expect(created[0].conclKey).toBe("C-01");
    // 编造的 cardKey 被过滤，只保留真实卡
    expect(created[0].upstreamKeys).toEqual(["A-L0-01", "A-L4-05"]);
    expect(created[0].conf).toBe(0.7);
  });

  it("无卡片 → 清空结论返回 0，不调 LLM", async () => {
    cardFindMany.mockResolvedValue([]);
    const res = await service.deriveConclusions("u1", "t1");
    expect(res).toEqual({ derived: 0 });
    expect(conclDeleteMany).toHaveBeenCalledWith({ where: { topicId: "t1" } });
    expect(chat).not.toHaveBeenCalled();
  });

  it("LLM 返回非 JSON → BadRequest", async () => {
    cardFindMany.mockResolvedValue([
      {
        cardKey: "A-L0-01",
        layer: "L0",
        title: "x",
        claim: "y",
        conf: 0.6,
        horizon: 2030,
        falsifiers: [],
      },
    ]);
    chat.mockResolvedValue({ content: "对不起我无法生成" });
    await expect(service.deriveConclusions("u1", "t1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
