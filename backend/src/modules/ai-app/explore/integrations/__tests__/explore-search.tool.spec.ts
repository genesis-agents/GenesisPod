import { ExploreSearchTool } from "../explore-search.tool";
import type { PrismaService } from "../../../../../common/prisma/prisma.service";
import type { ToolContext } from "@/modules/ai-engine/facade";

describe("ExploreSearchTool", () => {
  const findMany = jest.fn();
  const prisma = {
    resource: { findMany },
  } as unknown as PrismaService;
  const tool = new ExploreSearchTool(prisma);

  const ctx = (userId?: string): ToolContext =>
    ({ executionId: "exec-1", toolId: tool.id, userId }) as ToolContext;

  const dbRow = (over: Record<string, unknown> = {}) => ({
    id: "res-1",
    title: "Mixture-of-Experts 路由新进展",
    abstract: "摘要：MoE 路由稀疏化",
    aiSummary: "AI 摘要：专家并行通信量下降 30%",
    sourceUrl: "https://example.com/moe",
    primaryCategory: "LLM",
    tags: ["MoE", "routing"],
    qualityScore: 92,
    trendingScore: 180,
    createdAt: new Date("2026-06-10T00:00:00Z"),
    ...over,
  });

  beforeEach(() => findMany.mockReset());

  describe("validateInput", () => {
    it("拒绝空 / 非字符串 / 超长 query", () => {
      expect(tool.validateInput({ query: "" })).toBe(false);
      expect(tool.validateInput({ query: "   " })).toBe(false);
      expect(tool.validateInput({ query: 1 as unknown as string })).toBe(false);
      expect(tool.validateInput({ query: "x".repeat(2001) })).toBe(false);
    });

    it("拒绝非法 scope / 越界 days / topK", () => {
      expect(
        tool.validateInput({
          query: "moe",
          scope: "all" as unknown as "public",
        }),
      ).toBe(false);
      expect(tool.validateInput({ query: "moe", days: 0 })).toBe(false);
      expect(tool.validateInput({ query: "moe", days: 366 })).toBe(false);
      expect(tool.validateInput({ query: "moe", topK: 0 })).toBe(false);
      expect(tool.validateInput({ query: "moe", topK: 21 })).toBe(false);
    });

    it("接受合法输入", () => {
      expect(
        tool.validateInput({ query: "MoE 路由", scope: "mine", topK: 8 }),
      ).toBe(true);
    });
  });

  describe("doExecute", () => {
    it("默认 public：不加用户隔离，公共全量可见", async () => {
      findMany.mockResolvedValue([dbRow()]);
      await tool["doExecute"]({ query: "MoE 路由" }, ctx(undefined));
      const where = findMany.mock.calls[0][0].where;
      expect(where.collectionItems).toBeUndefined();
      expect(where.createdAt.gte).toBeInstanceOf(Date);
    });

    it("scope=mine 无 userId 时返回空 + note，不查库", async () => {
      const out = await tool["doExecute"](
        { query: "moe", scope: "mine" },
        ctx(undefined),
      );
      expect(out.success).toBe(true);
      expect(out.results).toEqual([]);
      expect(out.note).toContain("scope=mine");
      expect(findMany).not.toHaveBeenCalled();
    });

    it("scope=mine 带 userId 时施加 collection 行级隔离", async () => {
      findMany.mockResolvedValue([]);
      await tool["doExecute"]({ query: "moe", scope: "mine" }, ctx("user-1"));
      const where = findMany.mock.calls[0][0].where;
      expect(where.collectionItems).toEqual({
        some: { collection: { userId: "user-1" } },
      });
    });

    it("自然语言 query 拆词做 OR 匹配，过滤单字符词", async () => {
      findMany.mockResolvedValue([]);
      await tool["doExecute"]({ query: "MoE 路由 稀疏 a" }, ctx("user-1"));
      const where = findMany.mock.calls[0][0].where;
      const orTerms = (where.OR as Array<Record<string, unknown>>).map((o) =>
        JSON.stringify(o),
      );
      expect(orTerms.some((s) => s.includes("MoE"))).toBe(true);
      expect(orTerms.some((s) => s.includes("路由"))).toBe(true);
      expect(orTerms.some((s) => s.includes('"a"'))).toBe(false);
    });

    it("命中时映射字段（summary 回退 abstract，Decimal 转 number）", async () => {
      findMany.mockResolvedValue([
        dbRow(),
        dbRow({ id: "res-2", aiSummary: null, trendingScore: null }),
      ]);
      const out = await tool["doExecute"]({ query: "MoE" }, ctx("user-1"));
      expect(out.success).toBe(true);
      expect(out.totalResults).toBe(2);
      expect(out.results[0]).toMatchObject({
        itemId: "res-1",
        title: "Mixture-of-Experts 路由新进展",
        summary: "AI 摘要：专家并行通信量下降 30%",
        category: "LLM",
        qualityScore: 92,
        trendingScore: 180,
      });
      // aiSummary 缺失回退 abstract
      expect(out.results[1].summary).toBe("摘要：MoE 路由稀疏化");
      // trendingScore 为 null 时保持 null
      expect(out.results[1].trendingScore).toBeNull();
    });

    it("零命中时返回 success:true + 回落 note（不发假 error）", async () => {
      findMany.mockResolvedValue([]);
      const out = await tool["doExecute"]({ query: "量子计算" }, ctx("user-1"));
      expect(out.success).toBe(true);
      expect(out.totalResults).toBe(0);
      expect(out.note).toContain("web-search");
    });

    it("prisma 抛错时返回 success:false + error 信息", async () => {
      findMany.mockRejectedValue(new Error("db down"));
      const out = await tool["doExecute"]({ query: "moe" }, ctx("user-1"));
      expect(out.success).toBe(false);
      expect(out.error).toBe("db down");
    });
  });
});
