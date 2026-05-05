import { KeyErrorClassifier } from "../key-error-classifier";

describe("KeyErrorClassifier", () => {
  let classifier: KeyErrorClassifier;

  beforeEach(() => {
    classifier = new KeyErrorClassifier();
  });

  describe("AUTH_FAILED", () => {
    it("classifies 401 as AUTH_FAILED + markDead + ∞ cooldown + NEXT_KEY", () => {
      const r = classifier.classify({ status: 401, message: "Unauthorized" });
      expect(r.reason).toBe("AUTH_FAILED");
      expect(r.action).toBe("NEXT_KEY");
      expect(r.markDead).toBe(true);
      expect(r.cooldownMs).toBe(Number.POSITIVE_INFINITY);
      expect(r.shouldStopChain).toBe(false);
    });

    it("classifies 403 as AUTH_FAILED", () => {
      const r = classifier.classify({ status: 403, message: "Forbidden" });
      expect(r.reason).toBe("AUTH_FAILED");
      expect(r.markDead).toBe(true);
    });

    it("classifies 'Invalid API Key' message as AUTH_FAILED", () => {
      const r = classifier.classify(new Error("Invalid API key provided"));
      expect(r.reason).toBe("AUTH_FAILED");
      expect(r.markDead).toBe(true);
    });

    it("classifies 'invalid_authentication' as AUTH_FAILED", () => {
      const r = classifier.classify(new Error("invalid authentication"));
      expect(r.reason).toBe("AUTH_FAILED");
    });
  });

  describe("RATE_LIMIT_KEY", () => {
    it("classifies 429 as RATE_LIMIT_KEY + 60s cooldown + NEXT_KEY", () => {
      const r = classifier.classify({
        status: 429,
        message: "Too Many Requests",
      });
      expect(r.reason).toBe("RATE_LIMIT_KEY");
      expect(r.action).toBe("NEXT_KEY");
      expect(r.markDead).toBe(false);
      expect(r.cooldownMs).toBe(60_000);
      expect(r.shouldStopChain).toBe(false);
    });

    it("uses Retry-After header if present", () => {
      const r = classifier.classify({
        status: 429,
        message: "rate limit",
        response: { headers: { "retry-after": "120" } },
      });
      expect(r.cooldownMs).toBe(120_000);
    });

    it("falls back to 60s when Retry-After missing", () => {
      const r = classifier.classify({ status: 429, message: "rate limit" });
      expect(r.cooldownMs).toBe(60_000);
    });
  });

  describe("QUOTA_EXCEEDED", () => {
    it("classifies 402 as QUOTA_EXCEEDED + ∞ cooldown + NEXT_KEY but NOT markDead", () => {
      const r = classifier.classify({
        status: 402,
        message: "Payment Required",
      });
      expect(r.reason).toBe("QUOTA_EXCEEDED");
      expect(r.action).toBe("NEXT_KEY");
      expect(r.markDead).toBe(false);
      expect(r.cooldownMs).toBe(Number.POSITIVE_INFINITY);
    });

    it("classifies 'insufficient quota' message as QUOTA_EXCEEDED", () => {
      const r = classifier.classify(
        new Error("You exceeded your current quota"),
      );
      expect(r.reason).toBe("QUOTA_EXCEEDED");
    });
  });

  describe("PROVIDER_DOWN", () => {
    it("classifies 500 as PROVIDER_DOWN + RETHROW + shouldStopChain", () => {
      const r = classifier.classify({
        status: 500,
        message: "Internal Server Error",
      });
      expect(r.reason).toBe("PROVIDER_DOWN");
      expect(r.action).toBe("RETHROW");
      expect(r.shouldStopChain).toBe(true);
      expect(r.cooldownMs).toBe(5 * 60_000);
    });

    it("classifies 502/503/504 as PROVIDER_DOWN", () => {
      for (const status of [502, 503, 504]) {
        const r = classifier.classify({ status, message: "" });
        expect(r.reason).toBe("PROVIDER_DOWN");
      }
    });

    it("classifies ECONNREFUSED as PROVIDER_DOWN", () => {
      const r = classifier.classify(
        new Error("connect ECONNREFUSED 1.2.3.4:443"),
      );
      expect(r.reason).toBe("PROVIDER_DOWN");
      expect(r.shouldStopChain).toBe(true);
    });

    it("classifies ENOTFOUND as PROVIDER_DOWN", () => {
      const r = classifier.classify(
        new Error("getaddrinfo ENOTFOUND api.example.com"),
      );
      expect(r.reason).toBe("PROVIDER_DOWN");
    });
  });

  describe("TIMEOUT", () => {
    it("classifies ETIMEDOUT as TIMEOUT + 30s + NEXT_KEY", () => {
      const r = classifier.classify(new Error("connect ETIMEDOUT"));
      expect(r.reason).toBe("TIMEOUT");
      expect(r.action).toBe("NEXT_KEY");
      expect(r.cooldownMs).toBe(30_000);
      expect(r.shouldStopChain).toBe(false);
    });

    it("classifies 'request aborted' as TIMEOUT", () => {
      const r = classifier.classify(new Error("Request aborted"));
      expect(r.reason).toBe("TIMEOUT");
    });
  });

  describe("UNKNOWN", () => {
    it("classifies unknown error as UNKNOWN + RETHROW", () => {
      const r = classifier.classify(new Error("Something weird happened"));
      expect(r.reason).toBe("UNKNOWN");
      expect(r.action).toBe("RETHROW");
      expect(r.shouldStopChain).toBe(true);
    });

    it("handles non-Error inputs gracefully", () => {
      const r = classifier.classify("plain string error");
      expect(r.reason).toBe("UNKNOWN");
      expect(r.originalMessage).toBe("plain string error");
    });

    it("handles null/undefined", () => {
      const r1 = classifier.classify(null);
      const r2 = classifier.classify(undefined);
      expect(r1.reason).toBe("UNKNOWN");
      expect(r2.reason).toBe("UNKNOWN");
    });
  });

  describe("status extraction", () => {
    it("extracts status from response.status (axios style)", () => {
      const r = classifier.classify({
        message: "fail",
        response: { status: 401 },
      });
      expect(r.reason).toBe("AUTH_FAILED");
    });

    it("extracts status from statusCode", () => {
      const r = classifier.classify({ message: "fail", statusCode: 429 });
      expect(r.reason).toBe("RATE_LIMIT_KEY");
    });
  });
});
