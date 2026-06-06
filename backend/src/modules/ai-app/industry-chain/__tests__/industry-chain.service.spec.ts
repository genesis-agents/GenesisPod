/**
 * IndustryChainService Unit Tests
 *
 * 离线单测：mock PrismaService + EntityResolutionService + orchestrator/registry，
 * 验证 persistExtraction 的消歧去重+映射落库、getGraph 的 ownerId 越权过滤 + 仅当前有效边。
 * 不依赖真实 DB / LLM / 编排执行（属部署态）。
 */

import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { IndustryChainService } from "../industry-chain.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  EntityResolutionService,
  ToolRegistry,
} from "@/modules/ai-engine/facade";
import {
  MissionPipelineOrchestrator,
  MissionPipelineRegistry,
  HarnessFacade,
} from "@/modules/ai-harness/facade";

describe("IndustryChainService", () => {
  let service: IndustryChainService;
  let prisma: {
    industryChain: {
      create: jest.Mock;
      update: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      delete: jest.Mock;
    };
    industryEntity: {
      create: jest.Mock;
      findFirst: jest.Mock;
      deleteMany: jest.Mock;
      count: jest.Mock;
    };
    industryRelation: { create: jest.Mock; deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let entityResolution: { resolve: jest.Mock };

  beforeEach(async () => {
    // 默认：SEC 名册 fetch 失败 → loadSecTickerMap 返回 null → CIK 校验跳过（不误删）。
    // 个别用例会覆盖此 mock 以测真伪校验。
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("no network in unit test"));
    let entitySeq = 0;
    prisma = {
      industryChain: {
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue({}),
      },
      industryEntity: {
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: `e-${++entitySeq}`, ...data }),
          ),
        findFirst: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(0),
      },
      industryRelation: {
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      // $transaction(cb) 直接以同一 mock 作为 tx 执行回调
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    entityResolution = { resolve: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndustryChainService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityResolutionService, useValue: entityResolution },
        { provide: MissionPipelineOrchestrator, useValue: { run: jest.fn() } },
        {
          provide: MissionPipelineRegistry,
          useValue: {
            register: jest.fn(),
            has: jest.fn().mockReturnValue(false),
          },
        },
        { provide: HarnessFacade, useValue: { execute: jest.fn() } },
        { provide: ToolRegistry, useValue: { tryGet: jest.fn() } },
      ],
    }).compile();
    service = module.get(IndustryChainService);
  });

  describe("persistExtraction", () => {
    it("消歧去重落库实体 + 映射落库关系", async () => {
      // 英伟达/NVIDIA 归并为一个 canonical
      entityResolution.resolve.mockResolvedValue({
        clusters: [],
        canonicalOf: { NVIDIA: "NVIDIA", 英伟达: "NVIDIA", TSMC: "TSMC" },
      });

      const result = await service.persistExtraction("chain-1", {
        segments: [{ name: "芯片设计" }, { name: "晶圆代工" }],
        companies: [
          { name: "NVIDIA", segment: "芯片设计" },
          { name: "英伟达", cik: "0001045810" }, // 同一公司，合并补全 cik
          { name: "TSMC", segment: "晶圆代工" },
        ],
        relations: [
          { source: "英伟达", target: "TSMC", relationType: "CONSUMES" },
          { source: "NVIDIA", target: "TSMC", relationType: "CONSUMES" }, // 重复 → 去重
        ],
      });

      // 阻断-1 幂等：事务内先清旧实体/关系再重写
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.industryRelation.deleteMany).toHaveBeenCalledWith({
        where: { chainId: "chain-1" },
      });
      expect(prisma.industryEntity.deleteMany).toHaveBeenCalledWith({
        where: { chainId: "chain-1" },
      });

      // 2 segments + 2 companies（NVIDIA+英伟达 合并）= 4 实体
      expect(result.entities).toBe(4);
      // 关系 = 结构骨架(脊柱 芯片设计→晶圆代工 1 + 归属 NVIDIA→芯片设计/TSMC→晶圆代工 2)
      //      + LLM 抽取(NVIDIA→TSMC CONSUMES，去重后 1) = 4 条
      expect(result.relations).toBe(4);
      expect(prisma.industryRelation.create).toHaveBeenCalledTimes(4);
      // 含合成的公司归属边（BELONGS_TO）
      const belongsTo = prisma.industryRelation.create.mock.calls.filter(
        (c) => c[0].data.relationType === "BELONGS_TO",
      );
      expect(belongsTo.length).toBe(2);

      // 合并后的 NVIDIA 实体补全了 cik
      const nvidiaCreate = prisma.industryEntity.create.mock.calls.find(
        (c) => c[0].data.name === "NVIDIA",
      );
      expect(nvidiaCreate?.[0].data.cik).toBe("0001045810");
    });

    it("校验 CIK 真伪：SEC 名册查不到的假 CIK 被丢弃（如长电科技），真 CIK 保留", async () => {
      // SEC 名册只含 NVIDIA 的真 CIK；长电科技的 0001127492 不在册（实测 SEC NoSuchKey）。
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          "0": { cik_str: 1045810, ticker: "NVDA" },
        }),
      });
      entityResolution.resolve.mockResolvedValue({
        clusters: [],
        canonicalOf: { NVIDIA: "NVIDIA", 长电科技: "长电科技" },
      });
      await service.persistExtraction("chain-1", {
        segments: [
          { name: "芯片设计", order: 1 },
          { name: "封测", order: 2 },
        ],
        companies: [
          { name: "NVIDIA", cik: "0001045810", segment: "芯片设计" },
          { name: "长电科技", cik: "0001127492", segment: "封测" }, // 假 CIK
        ],
        relations: [],
      });
      const nvidia = prisma.industryEntity.create.mock.calls.find(
        (c) => c[0].data.name === "NVIDIA",
      );
      const jcet = prisma.industryEntity.create.mock.calls.find(
        (c) => c[0].data.name === "长电科技",
      );
      expect(nvidia?.[0].data.cik).toBe("0001045810"); // 真 CIK 保留
      expect(jcet?.[0].data.cik).toBeNull(); // 假 CIK 丢弃
    });

    it("LLM 吐空 relations 时仍合成结构骨架（脊柱 + 归属），图谱必连通", async () => {
      entityResolution.resolve.mockResolvedValue({
        clusters: [],
        canonicalOf: { NVIDIA: "NVIDIA", TSMC: "TSMC" },
      });
      const result = await service.persistExtraction("chain-1", {
        segments: [
          { name: "芯片设计", order: 1 },
          { name: "晶圆代工", order: 2 },
        ],
        companies: [
          { name: "NVIDIA", segment: "芯片设计" },
          { name: "TSMC", segment: "晶圆代工" },
        ],
        relations: [], // LLM 没吐任何关系
      });
      // 脊柱 1（芯片设计→晶圆代工）+ 归属 2 = 3 条结构边
      expect(result.relations).toBe(3);
      const types = prisma.industryRelation.create.mock.calls.map(
        (c) => c[0].data.relationType,
      );
      expect(types.filter((t) => t === "SUPPLIES").length).toBe(1);
      expect(types.filter((t) => t === "BELONGS_TO").length).toBe(2);
    });

    it("丢弃无法归属任一环节的离题公司（如半导体链混进涂料公司）", async () => {
      entityResolution.resolve.mockResolvedValue({
        clusters: [],
        canonicalOf: {
          NVIDIA: "NVIDIA",
          "Sherwin-Williams": "Sherwin-Williams",
        },
      });
      const result = await service.persistExtraction("chain-1", {
        segments: [{ name: "芯片设计", order: 1 }],
        companies: [
          { name: "NVIDIA", segment: "芯片设计" },
          { name: "Sherwin-Williams", segment: "涂料" }, // 环节"涂料"未声明 → 离题，丢弃
        ],
        relations: [],
      });
      // 1 segment + 1 company（NVIDIA）= 2 实体（Sherwin-Williams 被丢）
      expect(result.entities).toBe(2);
      const names = prisma.industryEntity.create.mock.calls.map(
        (c) => c[0].data.name,
      );
      expect(names).not.toContain("Sherwin-Williams");
      expect(result.dropped).toBeGreaterThanOrEqual(1);
    });

    it("安全阀：未声明任何环节时不启用离题过滤（避免清空公司）", async () => {
      entityResolution.resolve.mockResolvedValue({
        clusters: [],
        canonicalOf: { NVIDIA: "NVIDIA" },
      });
      const result = await service.persistExtraction("chain-1", {
        segments: [],
        companies: [{ name: "NVIDIA", segment: "芯片设计" }],
        relations: [],
      });
      // 无 segment 声明 → 不过滤，公司保留
      expect(result.entities).toBe(1);
    });

    it("丢弃非法关系（自环/未解析/非法枚举），不落库", async () => {
      entityResolution.resolve.mockResolvedValue({
        clusters: [],
        canonicalOf: { A: "A" },
      });
      const result = await service.persistExtraction("chain-1", {
        companies: [{ name: "A" }],
        relations: [
          { source: "A", target: "A", relationType: "SUPPLIES" }, // 自环
          { source: "A", target: "未知", relationType: "SUPPLIES" }, // 未解析
        ],
      });
      expect(result.relations).toBe(0);
      expect(result.dropped).toBe(2);
      expect(prisma.industryRelation.create).not.toHaveBeenCalled();
    });
  });

  describe("getGraph (M6 ownerId 越权过滤)", () => {
    it("非属主访问抛 NotFound", async () => {
      prisma.industryChain.findFirst.mockResolvedValue(null);
      await expect(service.getGraph("intruder", "chain-1")).rejects.toThrow(
        NotFoundException,
      );
      // 查询带 ownerId 过滤
      expect(prisma.industryChain.findFirst.mock.calls[0][0].where).toEqual({
        id: "chain-1",
        ownerId: "intruder",
      });
    });

    it("映射 nodes/edges + 过滤失效边", async () => {
      prisma.industryChain.findFirst.mockResolvedValue({
        id: "chain-1",
        ownerId: "u1",
        entities: [
          { id: "e1", name: "芯片设计", type: "SEGMENT", segment: "芯片设计" },
          { id: "e2", name: "NVIDIA", type: "COMPANY", segment: "芯片设计" },
        ],
        relations: [
          {
            sourceId: "e1",
            targetId: "e2",
            relationType: "BELONGS_TO",
            weight: null,
            validTo: null,
          },
          {
            sourceId: "e2",
            targetId: "e1",
            relationType: "SUPPLIES",
            weight: 0.3,
            validTo: new Date(),
          }, // 失效
        ],
      });
      const graph = await service.getGraph("u1", "chain-1");
      expect(graph.nodes.length).toBe(2);
      expect(graph.edges.length).toBe(1); // 失效边被过滤
      expect(graph.stats).toEqual({
        totalNodes: 2,
        totalEdges: 1,
        segments: 1,
        companies: 1,
      });
    });
  });

  describe("buildPipeline (方案 B 接线)", () => {
    it("research hook 经 HarnessFacade 跑 agent 并解析结构化输出", async () => {
      const harness = { execute: jest.fn() };
      const mod = await Test.createTestingModule({
        providers: [
          IndustryChainService,
          { provide: PrismaService, useValue: prisma },
          { provide: EntityResolutionService, useValue: entityResolution },
          {
            provide: MissionPipelineOrchestrator,
            useValue: { run: jest.fn() },
          },
          {
            provide: MissionPipelineRegistry,
            useValue: {
              register: jest.fn(),
              has: jest.fn().mockReturnValue(false),
            },
          },
          { provide: HarnessFacade, useValue: harness },
          { provide: ToolRegistry, useValue: { tryGet: jest.fn() } },
        ],
      }).compile();
      const svc = mod.get(IndustryChainService);

      harness.execute.mockResolvedValue({
        output: {
          segments: [{ name: "芯片设计" }],
          companies: [{ name: "NVIDIA" }],
          relations: [],
        },
        state: "completed",
        iterations: 3,
        tokensUsed: 100,
        wallTimeMs: 10,
      });

      const config = svc.buildPipeline();
      expect(config.id).toBe("industry-chain");
      expect(config.steps.map((s) => s.primitive)).toEqual([
        "research",
        "persist",
      ]);

      // research step hooks
      const research = config.steps[0].hooks as unknown as {
        fanOut: (a: { ctx: { input: unknown } }) => unknown[];
        perItemPipeline: (a: {
          item: unknown;
          role: unknown;
          ctx: { input: unknown; userId?: string };
        }) => Promise<unknown>;
      };
      const items = research.fanOut({
        ctx: { input: { topic: "算力底座", chainId: "c1" } },
      });
      expect(items.length).toBe(1);
      const out = (await research.perItemPipeline({
        item: items[0],
        role: {},
        ctx: { input: { topic: "算力底座", chainId: "c1" }, userId: "u1" },
      })) as { segments: unknown[] };
      expect(harness.execute).toHaveBeenCalled();
      expect(out.segments).toEqual([{ name: "芯片设计" }]);
    });

    it("persist hook 从 research 输出读取并落库", async () => {
      entityResolution.resolve.mockResolvedValue({
        clusters: [],
        canonicalOf: { NVIDIA: "NVIDIA" },
      });
      const config = service.buildPipeline();
      const persist = config.steps[1].hooks as unknown as {
        persist: (a: {
          ctx: { input: unknown };
          previousOutputs: Record<string, unknown>;
          crossStageState: unknown;
        }) => Promise<void>;
      };
      await persist.persist({
        ctx: { input: { chainId: "c1" } },
        previousOutputs: {
          extract: {
            results: [
              { segments: [], companies: [{ name: "NVIDIA" }], relations: [] },
            ],
          },
        },
        crossStageState: {},
      });
      // 落库了 1 个公司实体
      expect(prisma.industryEntity.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("listChains / deleteChain", () => {
    it("listChains 映射 + 带 entityCount，按时间倒序（owner 过滤）", async () => {
      prisma.industryChain.findMany.mockResolvedValue([
        {
          id: "c1",
          topic: "半导体",
          status: "COMPLETED",
          createdAt: new Date("2026-06-06"),
          _count: { entities: 23 },
        },
      ]);
      const list = await service.listChains("u1");
      expect(prisma.industryChain.findMany.mock.calls[0][0].where).toEqual({
        ownerId: "u1",
      });
      expect(list[0]).toMatchObject({ id: "c1", entityCount: 23 });
    });

    it("deleteChain 非属主抛 NotFound，不删", async () => {
      prisma.industryChain.findFirst.mockResolvedValue(null);
      await expect(service.deleteChain("intruder", "c1")).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.industryChain.delete).not.toHaveBeenCalled();
    });

    it("deleteChain 属主删除（级联）", async () => {
      prisma.industryChain.findFirst.mockResolvedValue({ id: "c1" });
      const res = await service.deleteChain("u1", "c1");
      expect(res.deleted).toBe(true);
      expect(prisma.industryChain.delete).toHaveBeenCalledWith({
        where: { id: "c1" },
      });
    });
  });

  describe("analyze", () => {
    it("创建 chain 并返回 chainId+missionId", async () => {
      prisma.industryChain.create.mockResolvedValue({ id: "chain-9" });
      const res = await service.analyze("u1", "算力底座");
      expect(res.chainId).toBe("chain-9");
      expect(typeof res.missionId).toBe("string");
      expect(prisma.industryChain.create.mock.calls[0][0].data.ownerId).toBe(
        "u1",
      );
    });
  });
});
