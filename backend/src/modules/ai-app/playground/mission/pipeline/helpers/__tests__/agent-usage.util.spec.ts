/**
 * Unit tests for agent-usage.util.ts
 *
 * Covers:
 *   - agentUsageDetail: null/undefined input → {} (line 38)
 *   - agentUsageDetail: proper AgentUsageSource → extracts all fields (lines 39-51)
 *   - agentUsageFromEvents: empty/undefined → {} (line 62)
 *   - agentUsageFromEvents: events array → extracts tokensUsed / costUsd (lines 63-68)
 */

jest.mock("@/modules/ai-harness/facade", () => ({
  extractTokenSpend: jest.fn(),
  extractRealCostUsd: jest.fn(),
  estimateUsdFromTokens: jest.fn(),
}));

import { agentUsageDetail, agentUsageFromEvents } from "../agent-usage.util";
import {
  extractTokenSpend,
  extractRealCostUsd,
  estimateUsdFromTokens,
} from "@/modules/ai-harness/facade";

const mockExtractTokenSpend = extractTokenSpend as jest.Mock;
const mockExtractRealCostUsd = extractRealCostUsd as jest.Mock;
const mockEstimateUsdFromTokens = estimateUsdFromTokens as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("agentUsageDetail", () => {
  it("returns {} for null input (line 38)", () => {
    expect(agentUsageDetail(null)).toEqual({});
  });

  it("returns {} for undefined input (line 38)", () => {
    expect(agentUsageDetail(undefined)).toEqual({});
  });

  it("extracts modelId from last entry in modelTrail (lines 40-41)", () => {
    const result = agentUsageDetail({
      modelTrail: [{ modelId: "gpt-3.5" }, { modelId: "gpt-4" }],
    });
    expect(result.modelId).toBe("gpt-4");
  });

  it("returns modelId undefined when modelTrail is empty (line 41)", () => {
    const result = agentUsageDetail({ modelTrail: [] });
    expect(result.modelId).toBeUndefined();
  });

  it("extracts tokensUsed when tokensUsed.total is a number (lines 42-45)", () => {
    const result = agentUsageDetail({
      tokensUsed: { prompt: 50, completion: 50, total: 100 },
    });
    expect(result.tokensUsed).toBe(100);
  });

  it("returns tokensUsed undefined when tokensUsed is absent (lines 42-45)", () => {
    const result = agentUsageDetail({});
    expect(result.tokensUsed).toBeUndefined();
  });

  it("extracts costUsd from costCents (lines 46-47)", () => {
    const result = agentUsageDetail({ costCents: 200 });
    expect(result.costUsd).toBeCloseTo(2.0);
  });

  it("returns costUsd undefined when costCents absent (lines 46-47)", () => {
    const result = agentUsageDetail({});
    expect(result.costUsd).toBeUndefined();
  });

  it("extracts toolCallCount from toolsUsed array (lines 48-50)", () => {
    const result = agentUsageDetail({ toolsUsed: ["tool1", "tool2"] });
    expect(result.toolCallCount).toBe(2);
  });

  it("returns toolCallCount undefined when toolsUsed not an array (lines 48-50)", () => {
    const result = agentUsageDetail({});
    expect(result.toolCallCount).toBeUndefined();
  });

  it("returns all fields together for a fully populated source (lines 39-51)", () => {
    const result = agentUsageDetail({
      modelTrail: [{ modelId: "claude-3-sonnet" }],
      tokensUsed: { prompt: 100, completion: 200, total: 300 },
      costCents: 50,
      toolsUsed: ["search", "calculator", "summarize"],
    });
    expect(result).toEqual({
      modelId: "claude-3-sonnet",
      tokensUsed: 300,
      costUsd: 0.5,
      toolCallCount: 3,
    });
  });
});

describe("agentUsageFromEvents", () => {
  it("returns {} for undefined events (line 62)", () => {
    expect(agentUsageFromEvents(undefined)).toEqual({});
  });

  it("returns {} for empty events array (line 62)", () => {
    expect(agentUsageFromEvents([])).toEqual({});
  });

  it("extracts tokensUsed and costUsd from events when realCost > 0 (lines 63-68)", () => {
    mockExtractTokenSpend.mockReturnValue(500);
    mockExtractRealCostUsd.mockReturnValue(1.5);
    mockEstimateUsdFromTokens.mockReturnValue(0.1);

    const fakeEvents = [{ type: "token_usage", payload: {} }] as any[];
    const result = agentUsageFromEvents(fakeEvents);

    expect(result.tokensUsed).toBe(500);
    expect(result.costUsd).toBe(1.5);
    // estimateUsdFromTokens should NOT be used when realCost > 0
    expect(mockEstimateUsdFromTokens).not.toHaveBeenCalled();
  });

  it("falls back to estimateUsdFromTokens when realCost is 0 (line 65)", () => {
    mockExtractTokenSpend.mockReturnValue(300);
    mockExtractRealCostUsd.mockReturnValue(0);
    mockEstimateUsdFromTokens.mockReturnValue(0.03);

    const fakeEvents = [{ type: "token_usage", payload: {} }] as any[];
    const result = agentUsageFromEvents(fakeEvents);

    expect(result.costUsd).toBe(0.03);
    expect(mockEstimateUsdFromTokens).toHaveBeenCalledWith(300);
  });

  it("returns tokensUsed undefined when extractTokenSpend returns 0 (line 67)", () => {
    mockExtractTokenSpend.mockReturnValue(0);
    mockExtractRealCostUsd.mockReturnValue(0);
    mockEstimateUsdFromTokens.mockReturnValue(0);

    const fakeEvents = [{ type: "token_usage", payload: {} }] as any[];
    const result = agentUsageFromEvents(fakeEvents);

    expect(result.tokensUsed).toBeUndefined();
    expect(result.costUsd).toBeUndefined();
  });

  it("returns costUsd undefined when both realCost and estimated are 0 (line 68)", () => {
    mockExtractTokenSpend.mockReturnValue(100);
    mockExtractRealCostUsd.mockReturnValue(0);
    mockEstimateUsdFromTokens.mockReturnValue(0);

    const fakeEvents = [{ type: "token_usage" }] as any[];
    const result = agentUsageFromEvents(fakeEvents);

    expect(result.costUsd).toBeUndefined();
  });
});
