/**
 * ProviderProbeService 错误码归一化回归（2026-05-06）
 */
import { ProviderProbeService } from "../provider-probe.service";

describe("ProviderProbeService", () => {
  let svc: ProviderProbeService;
  let mockFetch: jest.Mock;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    svc = new ProviderProbeService();
    mockFetch = jest.fn();
    originalFetch = global.fetch;
    global.fetch = mockFetch as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("probeByProvider", () => {
    it("UNKNOWN provider 没传 override → errorCode UNKNOWN", async () => {
      const r = await svc.probeByProvider({
        provider: "no-such-provider",
        apiKey: "x",
      });
      expect(r.ok).toBe(false);
      expect(r.errorCode).toBe("UNKNOWN");
    });

    it("openai 200 → ok=true", async () => {
      mockFetch.mockResolvedValue({ status: 200, text: async () => "" });
      const r = await svc.probeByProvider({ provider: "openai", apiKey: "k" });
      expect(r.ok).toBe(true);
    });

    it("openai 401 → AUTH_FAILED", async () => {
      mockFetch.mockResolvedValue({ status: 401, text: async () => "Invalid" });
      const r = await svc.probeByProvider({ provider: "openai", apiKey: "k" });
      expect(r.ok).toBe(false);
      expect(r.errorCode).toBe("AUTH_FAILED");
      expect(r.statusCode).toBe(401);
    });

    it("403 → AUTH_FAILED", async () => {
      mockFetch.mockResolvedValue({ status: 403, text: async () => "" });
      const r = await svc.probeByProvider({ provider: "openai", apiKey: "k" });
      expect(r.errorCode).toBe("AUTH_FAILED");
    });

    it("429 → RATE_LIMIT_KEY", async () => {
      mockFetch.mockResolvedValue({ status: 429, text: async () => "" });
      const r = await svc.probeByProvider({ provider: "openai", apiKey: "k" });
      expect(r.errorCode).toBe("RATE_LIMIT_KEY");
    });

    it("402 → QUOTA_EXCEEDED", async () => {
      mockFetch.mockResolvedValue({ status: 402, text: async () => "" });
      const r = await svc.probeByProvider({ provider: "openai", apiKey: "k" });
      expect(r.errorCode).toBe("QUOTA_EXCEEDED");
    });

    it("503 → PROVIDER_DOWN", async () => {
      mockFetch.mockResolvedValue({ status: 503, text: async () => "" });
      const r = await svc.probeByProvider({ provider: "openai", apiKey: "k" });
      expect(r.errorCode).toBe("PROVIDER_DOWN");
    });

    it("AbortError → TIMEOUT", async () => {
      const abortErr = new Error("aborted");
      abortErr.name = "AbortError";
      mockFetch.mockRejectedValue(abortErr);
      const r = await svc.probeByProvider({ provider: "openai", apiKey: "k" });
      expect(r.errorCode).toBe("TIMEOUT");
    });

    it("ECONNREFUSED → NETWORK_ERROR", async () => {
      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
      const r = await svc.probeByProvider({ provider: "openai", apiKey: "k" });
      expect(r.errorCode).toBe("NETWORK_ERROR");
    });

    it("anthropic uses /messages endpoint", async () => {
      mockFetch.mockResolvedValue({ status: 200, text: async () => "" });
      await svc.probeByProvider({ provider: "anthropic", apiKey: "k" });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/messages");
    });

    it("google uses /models?key= endpoint", async () => {
      mockFetch.mockResolvedValue({ status: 200, text: async () => "" });
      await svc.probeByProvider({ provider: "google", apiKey: "AIza-xxx" });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("models?key=");
    });

    it("override endpoint 覆盖默认", async () => {
      mockFetch.mockResolvedValue({ status: 200, text: async () => "" });
      await svc.probeByProvider({
        provider: "openai",
        apiKey: "k",
        endpointOverride: "https://custom.example/v9",
      });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("custom.example/v9");
    });
  });
});
