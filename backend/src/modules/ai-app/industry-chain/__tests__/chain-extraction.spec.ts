/**
 * chain-extraction 纯函数单测（M2 映射 + M8 结构校验，零 LLM/DB）。
 */

import {
  ChainExtractionResultSchema,
  isSafeSourceUrl,
  sanitizeSourceRefs,
  buildRelationRows,
  buildStructuralRows,
  mergeRelationRows,
  normalizeSegmentName,
} from "../chain-extraction";

describe("chain-extraction", () => {
  describe("ChainExtractionResultSchema", () => {
    it("缺省字段填充为空数组", () => {
      const r = ChainExtractionResultSchema.parse({});
      expect(r.segments).toEqual([]);
      expect(r.companies).toEqual([]);
      expect(r.relations).toEqual([]);
    });

    it("解析合法结构", () => {
      const r = ChainExtractionResultSchema.parse({
        companies: [{ name: "NVIDIA" }],
        relations: [{ source: "A", target: "B", relationType: "SUPPLIES" }],
      });
      expect(r.companies[0].name).toBe("NVIDIA");
    });
  });

  describe("isSafeSourceUrl (M8 XSS 防护)", () => {
    it("放行 http/https", () => {
      expect(isSafeSourceUrl("https://www.sec.gov/x")).toBe(true);
      expect(isSafeSourceUrl("http://x.com")).toBe(true);
    });
    it("挡 javascript:/data:/其他", () => {
      expect(isSafeSourceUrl("javascript:alert(1)")).toBe(false);
      expect(isSafeSourceUrl("data:text/html,x")).toBe(false);
      expect(isSafeSourceUrl(123)).toBe(false);
    });
  });

  it("sanitizeSourceRefs 剔除非法 URL 引用", () => {
    const refs = sanitizeSourceRefs([
      { url: "https://sec.gov/a", accessionNumber: "1" },
      { url: "javascript:x" },
      { accessionNumber: "no-url" },
    ]);
    expect(refs.length).toBe(2); // 合法 url + 无 url 的保留
    expect(refs.some((r) => r.url === "javascript:x")).toBe(false);
  });

  describe("buildRelationRows (M2 映射 + M8 校验)", () => {
    const canonicalOf = {
      NVIDIA: "NVIDIA Corp",
      英伟达: "NVIDIA Corp",
      TSMC: "TSMC",
    };
    const canonicalToId = new Map([
      ["NVIDIA Corp", "e-nvda"],
      ["TSMC", "e-tsmc"],
    ]);

    it("名→canonical→id 解析并落行", () => {
      const { rows, dropped } = buildRelationRows(
        [
          {
            source: "英伟达",
            target: "TSMC",
            relationType: "CONSUMES",
            weight: 0.5,
          },
        ],
        canonicalOf,
        canonicalToId,
      );
      expect(dropped).toEqual([]);
      expect(rows).toEqual([
        {
          sourceId: "e-nvda",
          targetId: "e-tsmc",
          relationType: "CONSUMES",
          weight: 0.5,
          evidence: null,
        },
      ]);
    });

    it("relationType 大小写归一 + 非法枚举丢弃", () => {
      const { rows, dropped } = buildRelationRows(
        [
          { source: "NVIDIA", target: "TSMC", relationType: "supplies" },
          { source: "NVIDIA", target: "TSMC", relationType: "INVENTED" },
        ],
        canonicalOf,
        canonicalToId,
      );
      expect(rows.length).toBe(1);
      expect(rows[0].relationType).toBe("SUPPLIES");
      expect(dropped[0].reason).toMatch(/invalid relationType/);
    });

    it("未解析实体丢弃", () => {
      const { rows, dropped } = buildRelationRows(
        [{ source: "NVIDIA", target: "未知公司", relationType: "SUPPLIES" }],
        canonicalOf,
        canonicalToId,
      );
      expect(rows).toEqual([]);
      expect(dropped[0].reason).toMatch(/unresolved/);
    });

    it("自环丢弃", () => {
      const { rows, dropped } = buildRelationRows(
        [{ source: "NVIDIA", target: "英伟达", relationType: "SUPPLIES" }], // 同 canonical
        canonicalOf,
        canonicalToId,
      );
      expect(rows).toEqual([]);
      expect(dropped[0].reason).toMatch(/self-loop/);
    });

    it("重复边去重", () => {
      const { rows, dropped } = buildRelationRows(
        [
          { source: "NVIDIA", target: "TSMC", relationType: "CONSUMES" },
          { source: "英伟达", target: "TSMC", relationType: "CONSUMES" },
        ],
        canonicalOf,
        canonicalToId,
      );
      expect(rows.length).toBe(1);
      expect(dropped[0].reason).toMatch(/duplicate/);
    });

    it("weight 越界归 null（不丢关系）", () => {
      const { rows } = buildRelationRows(
        [
          {
            source: "NVIDIA",
            target: "TSMC",
            relationType: "CONSUMES",
            weight: 5,
          },
        ],
        canonicalOf,
        canonicalToId,
      );
      expect(rows[0].weight).toBeNull();
    });
  });

  describe("normalizeSegmentName", () => {
    it("trim + lowercase", () => {
      expect(normalizeSegmentName("  IC Design ")).toBe("ic design");
      expect(normalizeSegmentName("Materials")).toBe("materials");
    });
  });

  describe("buildStructuralRows (结构骨架合成)", () => {
    it("环节脊柱：相邻环节 SUPPLIES", () => {
      const rows = buildStructuralRows(["s1", "s2", "s3"], []);
      expect(rows).toEqual([
        {
          sourceId: "s1",
          targetId: "s2",
          relationType: "SUPPLIES",
          weight: null,
          evidence: null,
        },
        {
          sourceId: "s2",
          targetId: "s3",
          relationType: "SUPPLIES",
          weight: null,
          evidence: null,
        },
      ]);
    });

    it("公司归属：公司 BELONGS_TO 环节", () => {
      const rows = buildStructuralRows(
        ["s1"],
        [{ companyId: "c1", segmentId: "s1" }],
      );
      expect(rows).toContainEqual({
        sourceId: "c1",
        targetId: "s1",
        relationType: "BELONGS_TO",
        weight: null,
        evidence: null,
      });
    });

    it("单环节无脊柱边", () => {
      const rows = buildStructuralRows(["s1"], []);
      expect(rows).toEqual([]);
    });
  });

  describe("mergeRelationRows (并轨去重)", () => {
    it("跨组按 source|target|type 去重 + 去自环", () => {
      const a = [
        {
          sourceId: "x",
          targetId: "y",
          relationType: "SUPPLIES" as const,
          weight: null,
          evidence: null,
        },
        {
          sourceId: "z",
          targetId: "z",
          relationType: "SUPPLIES" as const,
          weight: null,
          evidence: null,
        }, // 自环
      ];
      const b = [
        {
          sourceId: "x",
          targetId: "y",
          relationType: "SUPPLIES" as const,
          weight: null,
          evidence: null,
        }, // 重复
        {
          sourceId: "x",
          targetId: "y",
          relationType: "CONSUMES" as const,
          weight: null,
          evidence: null,
        }, // 不同 type → 保留
      ];
      const merged = mergeRelationRows(a, b);
      expect(merged.length).toBe(2);
      expect(merged.map((r) => r.relationType)).toEqual([
        "SUPPLIES",
        "CONSUMES",
      ]);
    });
  });
});
