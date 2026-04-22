/**
 * TokenEstimator 单元测试
 */

import {
  estimateEnvelopeTokens,
  estimateMessageTokens,
} from "../token-estimator";
import { ContextEnvelope } from "../../core/context-envelope";

describe("TokenEstimator", () => {
  it("estimateMessageTokens roughly matches char/4 + overhead", () => {
    const est = estimateMessageTokens({
      role: "user",
      content: "abcdefgh", // 8 chars → ~2 tokens + 4 overhead = 6
    });
    expect(est).toBeGreaterThanOrEqual(6);
    expect(est).toBeLessThanOrEqual(7);
  });

  it("estimateEnvelopeTokens sums system + reminders + messages + tools", () => {
    const env = new ContextEnvelope({
      system: "0123", // 4 chars → 1 token
      messages: [{ role: "user", content: "12345678", timestamp: 0 }], // 2 + 4
      reminders: [{ source: "t", priority: "low", content: "abcd" }], // 1 + 4
      tools: ["t1", "t2"], // 2 * 10 = 20
      memory: { sessionId: "s" },
      budget: {
        tokensUsed: 0,
        tokensRemaining: 1000,
        iterationsUsed: 0,
        iterationsRemaining: 10,
        wallTimeStartMs: 0,
      },
    });
    const total = estimateEnvelopeTokens(env);
    // 1 + (1+4) + (2+4) + 20 = 32
    expect(total).toBeGreaterThanOrEqual(30);
    expect(total).toBeLessThanOrEqual(36);
  });
});
