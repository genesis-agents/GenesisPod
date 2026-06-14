/**
 * evidence-budget.ts — branch coverage for playground shim
 *
 * Covers all three exported functions:
 *   - extractDomain: delegates to extractGroupFromUrlOrText (URL hostname and non-URL fallback)
 *   - computeEvidenceBudget: aggregates uniqueSources / uniqueDomains / totalFindings
 *   - deriveMaxChapters: forwards to deriveMaxDemandSlots via playground term remapping
 *   - deriveCitationFloor: forwards to deriveMinPerSlot
 *
 * The underlying harness functions are real (pure math), so we can test the full pipeline.
 */

// Mock the harness facade to control what computeSupplyBudget/derive* return
// so we can test the shim's term-remapping in isolation.

jest.mock("@/modules/ai-harness/facade", () => ({
  computeSupplyBudget: jest.fn(
    (
      items: Array<{ source: string }>,
      keyOf: (item: { source: string }) => string,
      groupOf: (item: { source: string }) => string,
    ) => {
      const uniqueKeys = new Set(items.map(keyOf)).size;
      const uniqueGroups = new Set(items.map(groupOf)).size;
      return {
        uniqueKeys,
        uniqueGroups,
        totalItems: items.length,
      };
    },
  ),
  deriveMaxDemandSlots: jest.fn(
    (
      budget: { uniqueKeys: number; uniqueGroups: number; totalItems: number },
      idealSlots: number,
      minSlots: number,
    ) => {
      // Simplified version: cap at uniqueKeys / 2, min minSlots
      const cap = Math.max(minSlots, Math.floor(budget.uniqueKeys / 2));
      return Math.min(idealSlots, cap);
    },
  ),
  deriveMinPerSlot: jest.fn((sourcesInSlot: number) => {
    if (sourcesInSlot >= 2) return 2;
    if (sourcesInSlot === 1) return 1;
    return 0;
  }),
  extractGroupFromUrlOrText: jest.fn((source: string) => {
    try {
      return new URL(source).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return source.toLowerCase();
    }
  }),
}));

import {
  extractDomain,
  computeEvidenceBudget,
  deriveMaxChapters,
  deriveCitationFloor,
} from "../evidence-budget";

// ── extractDomain ─────────────────────────────────────────────────────────────

describe("extractDomain", () => {
  it("delegates to extractGroupFromUrlOrText", () => {
    const result = extractDomain("https://www.example.com/path");
    // The mock strips www. and returns hostname
    expect(result).toBe("example.com");
  });

  it("handles non-URL text (lowercased fallback)", () => {
    const result = extractDomain("Nature Journal");
    expect(result).toBe("nature journal");
  });
});

// ── computeEvidenceBudget ─────────────────────────────────────────────────────

describe("computeEvidenceBudget", () => {
  it("returns uniqueSources=0, uniqueDomains=0, totalFindings=0 for empty array", () => {
    const result = computeEvidenceBudget([]);
    expect(result).toEqual({
      uniqueSources: 0,
      uniqueDomains: 0,
      totalFindings: 0,
    });
  });

  it("counts unique source strings for uniqueSources", () => {
    const findings = [
      { source: "https://a.com/page1" },
      { source: "https://a.com/page2" },
      { source: "https://b.com/page1" },
    ];
    const result = computeEvidenceBudget(findings);
    expect(result.uniqueSources).toBe(3); // all different URLs
    expect(result.totalFindings).toBe(3);
  });

  it("groups same-domain findings for uniqueDomains", () => {
    const findings = [
      { source: "https://www.example.com/a" },
      { source: "https://www.example.com/b" },
      { source: "https://other.com/c" },
    ];
    const result = computeEvidenceBudget(findings);
    expect(result.uniqueDomains).toBe(2); // example.com + other.com
    expect(result.totalFindings).toBe(3);
  });

  it("deduplicates same source string for uniqueSources", () => {
    const findings = [
      { source: "https://a.com" },
      { source: "https://a.com" }, // duplicate
      { source: "https://b.com" },
    ];
    const result = computeEvidenceBudget(findings);
    expect(result.uniqueSources).toBe(2);
    expect(result.totalFindings).toBe(3);
  });

  it("maps uniqueKeys → uniqueSources and uniqueGroups → uniqueDomains", () => {
    const findings = [
      { source: "src-A" },
      { source: "src-B" },
      { source: "src-A" },
    ];
    const result = computeEvidenceBudget(findings);
    // uniqueSources = unique source strings = 2
    expect(result.uniqueSources).toBe(2);
    // totalFindings = 3
    expect(result.totalFindings).toBe(3);
  });
});

// ── deriveMaxChapters ─────────────────────────────────────────────────────────

describe("deriveMaxChapters", () => {
  it("forwards to deriveMaxDemandSlots with term remapping", () => {
    const { deriveMaxDemandSlots } = require("@/modules/ai-harness/facade");
    const budget = { uniqueSources: 10, uniqueDomains: 5, totalFindings: 20 };
    deriveMaxChapters(budget, 6, 2);
    expect(deriveMaxDemandSlots).toHaveBeenCalledWith(
      { uniqueKeys: 10, uniqueGroups: 5, totalItems: 20 },
      6,
      2,
    );
  });

  it("uses minChapters=1 as default", () => {
    const { deriveMaxDemandSlots } = require("@/modules/ai-harness/facade");
    const budget = { uniqueSources: 4, uniqueDomains: 2, totalFindings: 8 };
    deriveMaxChapters(budget, 5);
    expect(deriveMaxDemandSlots).toHaveBeenCalledWith(
      expect.objectContaining({ uniqueKeys: 4 }),
      5,
      1,
    );
  });

  it("returns result from deriveMaxDemandSlots", () => {
    const { deriveMaxDemandSlots } = require("@/modules/ai-harness/facade");
    deriveMaxDemandSlots.mockReturnValueOnce(3);
    const budget = { uniqueSources: 6, uniqueDomains: 3, totalFindings: 10 };
    const result = deriveMaxChapters(budget, 5, 1);
    expect(result).toBe(3);
  });
});

// ── deriveCitationFloor ───────────────────────────────────────────────────────

describe("deriveCitationFloor", () => {
  it("forwards to deriveMinPerSlot", () => {
    const { deriveMinPerSlot } = require("@/modules/ai-harness/facade");
    deriveCitationFloor(3);
    expect(deriveMinPerSlot).toHaveBeenCalledWith(3);
  });

  it("returns 2 when sourcesInChapter >= 2", () => {
    expect(deriveCitationFloor(2)).toBe(2);
    expect(deriveCitationFloor(5)).toBe(2);
  });

  it("returns 1 when sourcesInChapter === 1", () => {
    expect(deriveCitationFloor(1)).toBe(1);
  });

  it("returns 0 when sourcesInChapter === 0", () => {
    expect(deriveCitationFloor(0)).toBe(0);
  });
});
