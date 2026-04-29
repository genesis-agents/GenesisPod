import { MissionStateService } from "./mission-state.service";

describe("MissionStateService", () => {
  let service: MissionStateService;

  beforeEach(() => {
    service = new MissionStateService();
  });

  // estimateTokens
  it("estimateTokens: null/undefined → 0", () => {
    expect(service.estimateTokens(null)).toBe(0);
    expect(service.estimateTokens(undefined)).toBe(0);
  });

  it("estimateTokens: string → length / 2.0 ceiled", () => {
    const s = "hello world!"; // 12 chars → ceil(12/2.0) = 6
    expect(service.estimateTokens(s)).toBe(Math.ceil(12 / 2.0));
  });

  it("estimateTokens: object → JSON.stringify length / 2.0", () => {
    const obj = { a: 1, b: "test" };
    const expected = Math.ceil(JSON.stringify(obj).length / 2.0);
    expect(service.estimateTokens(obj)).toBe(expected);
  });

  it("estimateTokens: array is JSON-stringified", () => {
    const arr = [1, 2, 3];
    const expected = Math.ceil(JSON.stringify(arr).length / 2.0);
    expect(service.estimateTokens(arr)).toBe(expected);
  });

  // handoffTokenLimit
  it("exposes handoffTokenLimit = 50000", () => {
    expect(service.handoffTokenLimit).toBe(50_000);
  });

  // compressIfNeeded: under limit → returns same reference
  it("compressIfNeeded: returns original when under limit", () => {
    const payload = { small: "data" };
    const result = service.compressIfNeeded(payload, "test");
    expect(result).toBe(payload);
  });

  // compressIfNeeded: over limit with array → compresses
  it("compressIfNeeded: compresses array when over 50K tokens", () => {
    // Create array with items large enough to exceed 50K tokens
    const bigItem = {
      findings: Array.from({ length: 20 }, (_, i) => ({
        claim: "x".repeat(500),
        evidence: "e".repeat(500),
        source: "http://src" + i + ".com",
      })),
    };
    const bigArray = Array.from({ length: 15 }, (_, i) => ({
      ...bigItem,
      dimension: "dim" + i,
    }));
    const result = service.compressIfNeeded(bigArray, "test");
    // Result should be smaller
    expect(JSON.stringify(result).length).toBeLessThan(
      JSON.stringify(bigArray).length,
    );
  });

  it("compressIfNeeded: array limited to 12 items", () => {
    const bigItem = {
      findings: Array.from({ length: 20 }, (_) => ({
        claim: "x".repeat(500),
        evidence: "e".repeat(500),
        source: "s",
      })),
    };
    const bigArray = Array.from({ length: 20 }, (_, i) => ({
      ...bigItem,
      dimension: "dim" + i,
    }));
    const tokens = service.estimateTokens(bigArray);
    if (tokens > 50_000) {
      const result = service.compressIfNeeded(bigArray, "test") as unknown[];
      expect(result.length).toBeLessThanOrEqual(12);
    }
  });

  it("compressIfNeeded: string fields over 500 chars are truncated", () => {
    const longSummary = "x".repeat(800);
    const bigArray = Array.from({ length: 15 }, (_, i) => ({
      dimension: "d" + i,
      findings: Array.from({ length: 10 }, () => ({
        claim: longSummary,
        evidence: longSummary,
        source: "http://a.com",
      })),
      summary: longSummary,
    }));
    const tokens = service.estimateTokens(bigArray);
    if (tokens > 50_000) {
      const result = service.compressIfNeeded(bigArray, "test") as Array<{
        summary: string;
      }>;
      expect(result[0].summary.length).toBeLessThanOrEqual(501); // 500 + "…"
    }
  });

  it("compressIfNeeded: top-level array sliced to max 12 items", () => {
    // 20 dims, each with large string data → triggers compression
    const longStr = "x".repeat(1000);
    const bigArray = Array.from({ length: 20 }, (_, i) => ({
      dimension: "d" + i,
      findings: Array.from({ length: 5 }, () => ({
        claim: longStr,
        evidence: longStr,
        source: "http://a.com",
      })),
      summary: longStr,
    }));
    // Verify we're actually over threshold
    const tokens = service.estimateTokens(bigArray);
    expect(tokens).toBeGreaterThan(50_000);
    const result = service.compressIfNeeded(bigArray, "test") as unknown[];
    // Top-level array is sliced to 12 by compress()
    expect(result.length).toBeLessThanOrEqual(12);
  });

  it("compressIfNeeded: object over limit compresses each key", () => {
    const bigObj: Record<string, string> = {};
    for (let i = 0; i < 100; i++) {
      bigObj[`key${i}`] = "x".repeat(2000);
    }
    const tokens = service.estimateTokens(bigObj);
    if (tokens > 50_000) {
      const result = service.compressIfNeeded(
        bigObj,
        "test",
      ) as unknown as Record<string, string>;
      // Each long string should be truncated
      expect(Object.values(result)[0].length).toBeLessThan(2000);
    }
  });

  it("compressIfNeeded: long top-level string gets truncated", () => {
    const longStr = "x".repeat(200_000);
    const tokens = service.estimateTokens(longStr);
    if (tokens > 50_000) {
      const result = service.compressIfNeeded(
        longStr,
        "test",
      ) as unknown as string;
      expect(result.length).toBeLessThan(longStr.length);
    }
  });

  it("compressIfNeeded: primitive values pass through compress unchanged", () => {
    const smallPayload = 42;
    expect(service.compressIfNeeded(smallPayload, "test")).toBe(42);
  });

  it("compressIfNeeded: logs warn when compressing", () => {
    const logSpy = jest.spyOn(service["log"], "warn");
    const bigArray = Array.from({ length: 15 }, (_, i) => ({
      dimension: "d" + i,
      findings: Array.from({ length: 10 }, () => ({
        claim: "x".repeat(500),
        evidence: "x".repeat(500),
        source: "h",
      })),
      summary: "x".repeat(500),
    }));
    const tokens = service.estimateTokens(bigArray);
    if (tokens > 50_000) {
      service.compressIfNeeded(bigArray, "test.label");
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("test.label"),
      );
    }
  });
});
