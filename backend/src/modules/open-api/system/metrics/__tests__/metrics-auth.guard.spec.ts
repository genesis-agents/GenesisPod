import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MetricsAuthGuard } from "../metrics-auth.guard";

function ctxWith(headers: Record<string, string> = {}, query: object = {}) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers, query }),
    }),
  } as unknown as ExecutionContext;
}

function guardWithToken(token: string | undefined): MetricsAuthGuard {
  const config = {
    get: (key: string) => (key === "METRICS_TOKEN" ? token : undefined),
  } as unknown as ConfigService;
  return new MetricsAuthGuard(config);
}

describe("MetricsAuthGuard", () => {
  describe("when METRICS_TOKEN is not set", () => {
    it("allows the request (non-breaking) and warns once", () => {
      const guard = guardWithToken(undefined);
      const warn = jest
        .spyOn(
          (guard as unknown as { logger: { warn: jest.Mock } }).logger,
          "warn",
        )
        .mockImplementation(() => undefined);

      expect(guard.canActivate(ctxWith())).toBe(true);
      expect(guard.canActivate(ctxWith())).toBe(true);
      // warns only once, not on every request
      expect(warn).toHaveBeenCalledTimes(1);
    });
  });

  describe("when METRICS_TOKEN is set", () => {
    const TOKEN = "s3cr3t-metrics-token";

    it("rejects when no token is provided", () => {
      const guard = guardWithToken(TOKEN);
      expect(() => guard.canActivate(ctxWith())).toThrow(UnauthorizedException);
    });

    it("rejects a wrong token", () => {
      const guard = guardWithToken(TOKEN);
      expect(() =>
        guard.canActivate(ctxWith({ authorization: "Bearer wrong" })),
      ).toThrow(UnauthorizedException);
    });

    it("accepts the correct token via Authorization: Bearer", () => {
      const guard = guardWithToken(TOKEN);
      expect(
        guard.canActivate(ctxWith({ authorization: `Bearer ${TOKEN}` })),
      ).toBe(true);
    });

    it("accepts the correct token via ?token= query param", () => {
      const guard = guardWithToken(TOKEN);
      expect(guard.canActivate(ctxWith({}, { token: TOKEN }))).toBe(true);
    });

    it("rejects a token of a different length (constant-time-safe path)", () => {
      const guard = guardWithToken(TOKEN);
      expect(() =>
        guard.canActivate(ctxWith({ authorization: "Bearer short" })),
      ).toThrow(UnauthorizedException);
    });
  });
});
