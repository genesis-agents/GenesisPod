/**
 * token-spend.util.spec.ts
 * Pure-function tests for extractTokenSpend and estimateUsdFromTokens.
 */

import { extractTokenSpend, estimateUsdFromTokens } from "./token-spend.util";
import type { IAgentEvent } from "../../../../../../ai-harness/facade";

function makeEvent(type: string, payload: unknown): IAgentEvent {
  return { type, payload, timestamp: 0 } as unknown as IAgentEvent;
}

// ─── extractTokenSpend ───────────────────────────────────────────────────────

describe("extractTokenSpend", () => {
  it("returns 0 for empty events", () => {
    expect(extractTokenSpend([])).toBe(0);
  });

  it("sums tokensUsed from action_executed events", () => {
    const events = [
      makeEvent("action_executed", { tokensUsed: 100 }),
      makeEvent("action_executed", { tokensUsed: 200 }),
    ];
    expect(extractTokenSpend(events)).toBe(300);
  });

  it("ignores action_executed events without tokensUsed", () => {
    const events = [
      makeEvent("action_executed", { output: "something" }),
      makeEvent("action_executed", { tokensUsed: 50 }),
    ];
    expect(extractTokenSpend(events)).toBe(50);
  });

  it("returns budget_warning value when larger than action_executed total", () => {
    const events = [
      makeEvent("action_executed", { tokensUsed: 100 }),
      makeEvent("budget_warning", { tokensUsed: 500 }),
    ];
    expect(extractTokenSpend(events)).toBe(500);
  });

  it("returns action_executed total when larger than budget_warning", () => {
    const events = [
      makeEvent("action_executed", { tokensUsed: 300 }),
      makeEvent("action_executed", { tokensUsed: 400 }),
      makeEvent("budget_warning", { tokensUsed: 100 }),
    ];
    expect(extractTokenSpend(events)).toBe(700);
  });

  it("takes max of multiple budget_warning events", () => {
    const events = [
      makeEvent("budget_warning", { tokensUsed: 200 }),
      makeEvent("budget_warning", { tokensUsed: 400 }),
      makeEvent("budget_warning", { tokensUsed: 300 }),
    ];
    expect(extractTokenSpend(events)).toBe(400);
  });

  it("ignores non-relevant event types", () => {
    const events = [
      makeEvent("thinking", { text: "hmm", tokenCount: 999 }),
      makeEvent("action_planned", { kind: "tool" }),
      makeEvent("action_executed", { tokensUsed: 50 }),
    ];
    expect(extractTokenSpend(events)).toBe(50);
  });

  it("ignores action_executed with null payload", () => {
    const events = [makeEvent("action_executed", null)];
    expect(extractTokenSpend(events)).toBe(0);
  });

  it("ignores action_executed with tokensUsed as non-number", () => {
    const events = [
      makeEvent("action_executed", { tokensUsed: "not-a-number" }),
    ];
    expect(extractTokenSpend(events)).toBe(0);
  });

  it("ignores budget_warning with null payload", () => {
    const events = [makeEvent("budget_warning", null)];
    expect(extractTokenSpend(events)).toBe(0);
  });

  it("handles mix of valid and invalid events correctly", () => {
    const events = [
      makeEvent("action_executed", null),
      makeEvent("action_executed", { tokensUsed: 150 }),
      makeEvent("budget_warning", { tokensUsed: 100 }),
      makeEvent("thinking", { text: "ok" }),
    ];
    expect(extractTokenSpend(events)).toBe(150);
  });
});

// ─── estimateUsdFromTokens ────────────────────────────────────────────────────

describe("estimateUsdFromTokens", () => {
  it("returns 0 for 0 tokens", () => {
    expect(estimateUsdFromTokens(0)).toBe(0);
  });

  it("calculates correct USD for 1M tokens (~$3)", () => {
    expect(estimateUsdFromTokens(1_000_000)).toBeCloseTo(3.0);
  });

  it("calculates correct USD for 1000 tokens", () => {
    expect(estimateUsdFromTokens(1000)).toBeCloseTo(0.003);
  });

  it("scales linearly", () => {
    const half = estimateUsdFromTokens(500_000);
    const full = estimateUsdFromTokens(1_000_000);
    expect(full).toBeCloseTo(half * 2);
  });
});
