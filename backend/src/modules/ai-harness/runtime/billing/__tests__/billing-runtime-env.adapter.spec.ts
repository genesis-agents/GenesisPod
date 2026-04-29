import { BillingRuntimeEnvAdapter } from "../billing-runtime-env.adapter";

function makeCredits(balance = 1000, todaySpent = 100) {
  return {
    getBalance: jest.fn().mockResolvedValue({ balance, todaySpent }),
  };
}

function makeRuntimeEnv(
  opts: {
    hasByok?: boolean;
    sharedKeyAvailable?: boolean;
    models?: Record<
      string,
      Array<{ modelId: string; healthy: string; costTier: string }>
    >;
  } = {},
) {
  const snap = {
    userKeys: {
      hasByok: opts.hasByok ?? false,
      sharedKeyAvailable: opts.sharedKeyAvailable ?? false,
    },
    models: opts.models ?? {},
  };
  return { snapshot: jest.fn().mockResolvedValue(snap) };
}

describe("BillingRuntimeEnvAdapter", () => {
  describe("getByokStatus", () => {
    it("returns platform when no byok or shared key", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits() as never,
        makeRuntimeEnv() as never,
      );
      expect(await adapter.getByokStatus()).toBe("platform");
    });

    it("returns personal when hasByok", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits() as never,
        makeRuntimeEnv({ hasByok: true }) as never,
      );
      expect(await adapter.getByokStatus()).toBe("personal");
    });

    it("returns donated when sharedKeyAvailable", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits() as never,
        makeRuntimeEnv({ sharedKeyAvailable: true }) as never,
      );
      expect(await adapter.getByokStatus()).toBe("donated");
    });
  });

  describe("getCreditState", () => {
    it("returns balance with thresholds", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits(800) as never,
        makeRuntimeEnv() as never,
      );
      const state = await adapter.getCreditState();
      expect(state.balance).toBe(800);
      expect(state.softLimit).toBe(500);
      expect(state.hardLimit).toBe(100);
      expect(state.currency).toBe("credit");
    });
  });

  describe("getUserEntitlements", () => {
    it("returns public entitlement by default", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits() as never,
        makeRuntimeEnv() as never,
      );
      const ent = await adapter.getUserEntitlements();
      expect(ent.keys).toContain("public");
    });

    it("adds image.generation when hasByok", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits() as never,
        makeRuntimeEnv({ hasByok: true }) as never,
      );
      const ent = await adapter.getUserEntitlements();
      expect(ent.keys).toContain("image.generation");
    });

    it("fails closed when runtimeEnv throws", async () => {
      const failingEnv = {
        snapshot: jest.fn().mockRejectedValue(new Error("fail")),
      };
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits() as never,
        failingEnv as never,
      );
      const ent = await adapter.getUserEntitlements();
      expect(ent.keys).toEqual(["public"]);
    });
  });

  describe("getModelAvailability", () => {
    it("returns available=true for healthy model", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits() as never,
        makeRuntimeEnv({
          models: {
            pool: [
              { modelId: "gpt-4o", healthy: "healthy", costTier: "strong" },
            ],
          },
        }) as never,
      );
      const avail = await adapter.getModelAvailability("gpt-4o");
      expect(avail.available).toBe(true);
    });

    it("returns unavailable for unhealthy model with sibling fallback", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits() as never,
        makeRuntimeEnv({
          models: {
            pool: [
              { modelId: "gpt-4o", healthy: "unhealthy", costTier: "strong" },
              {
                modelId: "gpt-4-turbo",
                healthy: "healthy",
                costTier: "strong",
              },
            ],
          },
        }) as never,
      );
      const avail = await adapter.getModelAvailability("gpt-4o");
      expect(avail.available).toBe(false);
      expect(avail.fallbackTo).toContain("gpt-4-turbo");
    });

    it("returns not_subscribed for unknown model", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits() as never,
        makeRuntimeEnv() as never,
      );
      const avail = await adapter.getModelAvailability("unknown-model");
      expect(avail.available).toBe(false);
      expect(avail.unavailableReason).toBe("not_subscribed");
    });

    it("returns disabled model from disabledModels map", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits() as never,
        makeRuntimeEnv() as never,
      );
      adapter.markModelDisabled("gpt-4o", "claude-3");
      const avail = await adapter.getModelAvailability("gpt-4o");
      expect(avail.available).toBe(false);
      expect(avail.fallbackTo).toEqual(["claude-3"]);
    });

    it("returns available for unknown health model (not unhealthy)", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits() as never,
        makeRuntimeEnv({
          models: {
            pool: [
              { modelId: "gpt-4o", healthy: "unknown", costTier: "strong" },
            ],
          },
        }) as never,
      );
      const avail = await adapter.getModelAvailability("gpt-4o");
      expect(avail.available).toBe(true);
    });
  });

  describe("markModelDisabled / getDisabledModels", () => {
    it("tracks disabled models", () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits() as never,
        makeRuntimeEnv() as never,
      );
      adapter.markModelDisabled("m1", "m2");
      const map = adapter.getDisabledModels();
      expect(map.get("m1")).toBe("m2");
    });
  });

  describe("invalidateBalanceCache", () => {
    it("invalidates cache so next call re-queries", async () => {
      const credits = makeCredits(1000);
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        credits as never,
        makeRuntimeEnv() as never,
      );
      await adapter.getCreditState();
      adapter.invalidateBalanceCache();
      await adapter.getCreditState();
      expect(credits.getBalance).toHaveBeenCalledTimes(2);
    });
  });

  describe("listAvailableModels", () => {
    it("lists all models from pools", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits() as never,
        makeRuntimeEnv({
          models: {
            pool: [
              { modelId: "gpt-4o", healthy: "healthy", costTier: "strong" },
              {
                modelId: "gpt-3.5-turbo",
                healthy: "unhealthy",
                costTier: "basic",
              },
            ],
          },
        }) as never,
      );
      const models = await adapter.listAvailableModels();
      expect(models.length).toBe(2);
      const healthy = models.find((m) => m.modelId === "gpt-4o");
      expect(healthy?.available).toBe(true);
      const unhealthy = models.find((m) => m.modelId === "gpt-3.5-turbo");
      expect(unhealthy?.available).toBe(false);
    });
  });

  describe("estimateAffordable", () => {
    it("returns proceed when balance is sufficient", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits(5000) as never,
        makeRuntimeEnv() as never,
      );
      const result = await adapter.estimateAffordable({ maxTokens: 1000 });
      expect(result.suggestion).toBe("proceed");
      expect(result.affordable).toBe(true);
    });

    it("returns downgrade when balance covers half", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits(3) as never,
        makeRuntimeEnv() as never,
      );
      // 5000 tokens = 5 credits, balance 3 >= 5/2=2.5
      const result = await adapter.estimateAffordable({ maxTokens: 5000 });
      expect(result.suggestion).toBe("downgrade");
      expect(result.affordable).toBe(false);
    });

    it("returns abort when balance is very low", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits(1) as never,
        makeRuntimeEnv() as never,
      );
      const result = await adapter.estimateAffordable({ maxTokens: 10000 });
      expect(result.suggestion).toBe("abort");
    });

    it("handles maxTokens=0", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits(100) as never,
        makeRuntimeEnv() as never,
      );
      const result = await adapter.estimateAffordable({ maxTokens: 0 });
      expect(result.suggestion).toBe("proceed");
    });
  });

  describe("getQuotaSnapshot", () => {
    it("returns quota snapshot from balance", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits(500, 50) as never,
        makeRuntimeEnv() as never,
      );
      const snap = await adapter.getQuotaSnapshot();
      expect(snap.daily_credit?.used).toBe(50);
    });
  });

  describe("suggestFallback", () => {
    it("returns notify_user when no_credit and balance critical", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits(50) as never,
        makeRuntimeEnv() as never,
      );
      const hint = await adapter.suggestFallback({ reason: "no_credit" });
      expect(hint.action).toBe("notify_user");
    });

    it("returns downgrade when no_credit but balance above critical", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits(200) as never,
        makeRuntimeEnv() as never,
      );
      const hint = await adapter.suggestFallback({ reason: "no_credit" });
      expect(hint.action).toBe("downgrade");
    });

    it("returns retry for rate_limit", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits() as never,
        makeRuntimeEnv() as never,
      );
      const hint = await adapter.suggestFallback({ reason: "rate_limit" });
      expect(hint.action).toBe("retry");
    });

    it("returns downgrade for outage with sibling model", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits() as never,
        makeRuntimeEnv({
          models: {
            pool: [
              { modelId: "gpt-4o", healthy: "unhealthy", costTier: "strong" },
              {
                modelId: "gpt-4-turbo",
                healthy: "healthy",
                costTier: "strong",
              },
            ],
          },
        }) as never,
      );
      const hint = await adapter.suggestFallback({
        reason: "outage",
        failedModelId: "gpt-4o",
      });
      expect(hint.action).toBe("downgrade");
      expect(hint.fallbackModelId).toBe("gpt-4-turbo");
    });

    it("returns abort for context_too_long", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits() as never,
        makeRuntimeEnv() as never,
      );
      const hint = await adapter.suggestFallback({
        reason: "context_too_long",
      });
      expect(hint.action).toBe("abort");
    });

    it("returns abort for no_quota", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits() as never,
        makeRuntimeEnv() as never,
      );
      const hint = await adapter.suggestFallback({ reason: "no_quota" });
      expect(hint.action).toBe("abort");
    });

    it("returns downgrade/abort for safety_refusal with non-reasoning candidate", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits() as never,
        makeRuntimeEnv({
          models: {
            pool: [
              { modelId: "gpt-4o", healthy: "healthy", costTier: "strong" },
            ],
          },
        }) as never,
      );
      const hint = await adapter.suggestFallback({
        reason: "safety_refusal",
        failedModelId: "o1-mini",
      });
      expect(["downgrade", "abort"]).toContain(hint.action);
    });

    it("returns abort for reasoning_exhaustion with no candidate", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits() as never,
        makeRuntimeEnv() as never,
      );
      const hint = await adapter.suggestFallback({
        reason: "reasoning_exhaustion",
        failedModelId: "o1",
      });
      expect(hint.action).toBe("abort");
    });

    it("returns retry for truncated", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits() as never,
        makeRuntimeEnv() as never,
      );
      const hint = await adapter.suggestFallback({ reason: "truncated" });
      expect(hint.action).toBe("retry");
    });

    it("returns retry for parse_failure", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits() as never,
        makeRuntimeEnv() as never,
      );
      const hint = await adapter.suggestFallback({ reason: "parse_failure" });
      expect(hint.action).toBe("retry");
    });

    it("returns downgrade for model_not_found with sibling", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits() as never,
        makeRuntimeEnv({
          models: {
            pool: [
              { modelId: "gpt-4o", healthy: "healthy", costTier: "strong" },
              {
                modelId: "gpt-4-turbo",
                healthy: "healthy",
                costTier: "strong",
              },
            ],
          },
        }) as never,
      );
      const hint = await adapter.suggestFallback({
        reason: "model_not_found",
        failedModelId: "gpt-4o",
      });
      expect(hint.action).toBe("downgrade");
    });

    it("returns abort for model_not_found with no sibling", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits() as never,
        makeRuntimeEnv() as never,
      );
      const hint = await adapter.suggestFallback({
        reason: "model_not_found",
        failedModelId: "gpt-4o",
      });
      expect(hint.action).toBe("abort");
    });

    it("returns retry for tool_failure", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits() as never,
        makeRuntimeEnv() as never,
      );
      const hint = await adapter.suggestFallback({ reason: "tool_failure" });
      expect(hint.action).toBe("retry");
    });

    it("returns retry for verifier_low_score", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits() as never,
        makeRuntimeEnv() as never,
      );
      const hint = await adapter.suggestFallback({
        reason: "verifier_low_score",
      });
      expect(hint.action).toBe("retry");
    });

    it("returns retry for schema_mismatch", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits() as never,
        makeRuntimeEnv() as never,
      );
      const hint = await adapter.suggestFallback({ reason: "schema_mismatch" });
      expect(hint.action).toBe("retry");
    });

    it("returns abort for unknown reason", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits() as never,
        makeRuntimeEnv() as never,
      );
      const hint = await adapter.suggestFallback({
        reason: "unknown_reason_xyz",
      });
      expect(hint.action).toBe("abort");
    });

    it("returns abort for empty_response with no non-reasoning model", async () => {
      const adapter = new BillingRuntimeEnvAdapter(
        "u1",
        undefined,
        makeCredits() as never,
        makeRuntimeEnv() as never,
      );
      const hint = await adapter.suggestFallback({ reason: "empty_response" });
      expect(hint.action).toBe("abort");
    });
  });
});
