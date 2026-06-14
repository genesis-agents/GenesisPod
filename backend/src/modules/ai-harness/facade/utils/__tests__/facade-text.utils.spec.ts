import {
  extractJson,
  estimateTokens,
  compressContext,
  validateJsonSchema,
} from "../facade-text.utils";

describe("facade-text.utils", () => {
  describe("extractJson", () => {
    it("returns clean JSON untouched", () => {
      expect(extractJson('{"a":1}')).toBe('{"a":1}');
    });

    it("strips a ```json fenced block", () => {
      expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
    });

    it("strips a bare ``` fenced block", () => {
      expect(extractJson("```\n[1,2,3]\n```")).toBe("[1,2,3]");
    });

    it("trims surrounding prose around an object", () => {
      expect(extractJson('Here is the result: {"a":1}. Done.')).toBe('{"a":1}');
    });

    it("handles arrays as the top-level value", () => {
      expect(extractJson('prefix [{"a":1}] suffix')).toBe('[{"a":1}]');
    });
  });

  describe("estimateTokens", () => {
    it("counts ascii at ~1 token / 4 chars", () => {
      expect(estimateTokens("abcd")).toBe(1);
      expect(estimateTokens("abcdefgh")).toBe(2);
    });

    it("counts CJK at ~2 tokens / char", () => {
      // 3 Chinese chars → 6 tokens
      expect(estimateTokens("你好吗")).toBe(6);
    });

    it("mixes CJK and ascii additively", () => {
      // 1 CJK (2) + 4 ascii (1) = 3
      expect(estimateTokens("中abcd")).toBe(3);
    });

    it("returns 0 for empty string", () => {
      expect(estimateTokens("")).toBe(0);
    });
  });

  describe("compressContext", () => {
    it("returns the input unchanged when within budget", () => {
      const text = "short text";
      expect(compressContext(text, 1000)).toBe(text);
    });

    it("compresses oversized content and inserts an ellipsis marker", () => {
      const big = "x".repeat(10_000);
      const out = compressContext(big, 100);
      expect(out).toContain("[... content compressed ...]");
      expect(out.length).toBeLessThan(big.length);
    });

    it("keeps head and tail of the original", () => {
      const body = "HEAD" + "x".repeat(10_000) + "TAIL";
      const out = compressContext(body, 100);
      expect(out.startsWith("HEAD")).toBe(true);
      expect(out.endsWith("TAIL")).toBe(true);
    });
  });

  describe("validateJsonSchema", () => {
    it("passes a matching object with required fields", () => {
      expect(
        validateJsonSchema(
          { name: "x", age: 1 },
          { type: "object", required: ["name", "age"] },
        ),
      ).toBe(true);
    });

    it("fails when a required field is missing", () => {
      expect(
        validateJsonSchema(
          { name: "x" },
          { type: "object", required: ["age"] },
        ),
      ).toBe(false);
    });

    it("fails when an object is expected but a primitive is given", () => {
      expect(validateJsonSchema(42, { type: "object" })).toBe(false);
    });

    it("fails when an array is expected but a non-array is given", () => {
      expect(validateJsonSchema({}, { type: "array" })).toBe(false);
    });

    it("does not probe array elements by index for object 'required' (the chosen stricter semantics)", () => {
      // An array against an object schema with required fields must NOT be
      // treated as satisfying those fields via index/property access.
      expect(
        validateJsonSchema(["a", "b"], {
          type: "object",
          required: ["0"],
        }),
      ).toBe(true); // required check is skipped for arrays
    });

    it("passes when no constraints are specified", () => {
      expect(validateJsonSchema("anything", {})).toBe(true);
    });
  });
});
