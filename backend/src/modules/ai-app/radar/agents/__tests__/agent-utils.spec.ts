import {
  chunk,
  clampScore,
  extractJsonString,
  truncate,
  tryParseJson,
} from "../agent-utils";

describe("radar/agents/agent-utils", () => {
  describe("extractJsonString", () => {
    it("returns null for empty/whitespace", () => {
      expect(extractJsonString("")).toBeNull();
      expect(extractJsonString("   \n")).toBeNull();
    });

    it("strips markdown json fence", () => {
      expect(extractJsonString('```json\n{"a":1}\n```')).toBe('{"a":1}');
      expect(extractJsonString("```\n[1,2]\n```")).toBe("[1,2]");
    });

    it("finds first { or [ when no fence", () => {
      expect(extractJsonString('prefix here {"a":1}')).toBe('{"a":1}');
      expect(extractJsonString("noise [1,2,3]")).toBe("[1,2,3]");
    });
  });

  describe("tryParseJson", () => {
    it("parses valid JSON", () => {
      expect(tryParseJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
    });

    it("returns null on invalid JSON", () => {
      expect(tryParseJson("not json")).toBeNull();
      expect(tryParseJson("{unclosed")).toBeNull();
    });

    it("strips markdown fence before parse", () => {
      expect(
        tryParseJson<{ items: number[] }>('```json\n{"items":[1,2]}\n```'),
      ).toEqual({ items: [1, 2] });
    });
  });

  describe("chunk", () => {
    it("chunks array by size", () => {
      expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it("returns whole array as single chunk when size <= 0", () => {
      expect(chunk([1, 2, 3], 0)).toEqual([[1, 2, 3]]);
    });

    it("empty input → []", () => {
      expect(chunk([], 5)).toEqual([]);
    });
  });

  describe("truncate", () => {
    it("returns empty string for null/undefined", () => {
      expect(truncate(null, 10)).toBe("");
      expect(truncate(undefined, 10)).toBe("");
    });

    it("returns unchanged if within max", () => {
      expect(truncate("abc", 10)).toBe("abc");
    });

    it("truncates with ellipsis", () => {
      expect(truncate("abcdefghij", 5)).toBe("ab...");
    });
  });

  describe("clampScore", () => {
    it("rounds + clamps to [0,100]", () => {
      expect(clampScore(50.7)).toBe(51);
      expect(clampScore(-5)).toBe(0);
      expect(clampScore(150)).toBe(100);
    });

    it("returns fallback for non-finite / non-number", () => {
      expect(clampScore("80", 30)).toBe(30);
      expect(clampScore(NaN, 25)).toBe(25);
      expect(clampScore(undefined, 10)).toBe(10);
    });
  });
});
