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
import { EntityResolutionService } from "@/modules/ai-engine/facade";
import {
  MissionPipelineOrchestrator,
  MissionPipelineRegistry,
} from "@/modules/ai-harness/facade";

describe("IndustryChainService", () => {
  let service: IndustryChainService;
  let prisma: {
    industryChain: { create: jest.Mock; update: jest.Mock; findFirst: jest.Mock };
    industryEntity: { create: jest.Mock; findFirst: jest.Mock };
    industryRelation: { create: jest.Mock };
  };
  let entityResolution: { resolve: jest.Mock };

  beforeEach(async () => {
    let entitySeq = 0;
    prisma = {
      industryChain: {
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
      },
      industryEntity: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: `e-${++entitySeq}`, ...data }),
        ),
        findFirst: jest.fn(),
      },
      industryRelation: { create: jest.fn().mockResolvedValue({}) },
    };
    entityResolution = { resolve: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndustryChainService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityResolutionService, useValue: entityResolution },
        { provide: MissionPipelineOrchestrator, useValue: { run: jest.fn() } },
        { provide: MissionPipelineRegistry, useValue: { register: jest.fn() } },
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

      // 2 segments + 2 companies（NVIDIA+英伟达 合并）= 4 实体
      expect(result.entities).toBe(4);
      // 关系去重后 1 条
      expect(result.relations).toBe(1);
      expect(prisma.industryRelation.create).toHaveBeenCalledTimes(1);

      // 合并后的 NVIDIA 实体补全了 cik
      const nvidiaCreate = prisma.industryEntity.create.mock.calls.find(
        (c) => c[0].data.name === "NVIDIA",
      );
      expect(nvidiaCreate?.[0].data.cik).toBe("0001045810");
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
          { sourceId: "e1", targetId: "e2", relationType: "BELONGS_TO", weight: null, validTo: null },
          { sourceId: "e2", targetId: "e1", relationType: "SUPPLIES", weight: 0.3, validTo: new Date() }, // 失效
        ],
      });
      const graph = await service.getGraph("u1", "chain-1");
      expect(graph.nodes.length).toBe(2);
      expect(graph.edges.length).toBe(1); // 失效边被过滤
      expect(graph.stats).toEqual({ totalNodes: 2, totalEdges: 1, segments: 1, companies: 1 });
    });
  });

  describe("analyze", () => {
    it("创建 chain 并返回 chainId+missionId", async () => {
      prisma.industryChain.create.mockResolvedValue({ id: "chain-9" });
      const res = await service.analyze("u1", "算力底座");
      expect(res.chainId).toBe("chain-9");
      expect(typeof res.missionId).toBe("string");
      expect(prisma.industryChain.create.mock.calls[0][0].data.ownerId).toBe("u1");
    });
  });
});
