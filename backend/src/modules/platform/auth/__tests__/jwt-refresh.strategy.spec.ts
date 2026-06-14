/**
 * JwtRefreshStrategy 测试
 *
 * 核心：refresh token 用 REFRESH_TOKEN_SECRET 校验（与 access 的 JWT_SECRET 隔离），
 * 未配置时回落到 `${JWT_SECRET}-refresh`，与 AuthService.generateTokens 一致。
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { UnauthorizedException } from "@nestjs/common";
import { JwtRefreshStrategy } from "../strategies/jwt-refresh.strategy";
import { CacheService } from "../../../../common/cache/cache.service";

describe("JwtRefreshStrategy", () => {
  let strategy: JwtRefreshStrategy;
  let mockCacheService: Record<string, jest.Mock>;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === "REFRESH_TOKEN_SECRET")
        return "test-refresh-secret-minimum-32-chars!!";
      if (key === "JWT_SECRET") return "test-jwt-secret-minimum-32-chars!!";
      return undefined;
    }),
  };

  beforeEach(async () => {
    mockCacheService = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtRefreshStrategy,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    strategy = module.get<JwtRefreshStrategy>(JwtRefreshStrategy);
  });

  afterEach(() => jest.clearAllMocks());

  describe("constructor", () => {
    it("should be defined", () => {
      expect(strategy).toBeDefined();
    });

    it("should resolve the secret from REFRESH_TOKEN_SECRET", () => {
      expect(mockConfigService.get).toHaveBeenCalledWith(
        "REFRESH_TOKEN_SECRET",
      );
    });

    it("falls back to `${JWT_SECRET}-refresh` when REFRESH_TOKEN_SECRET is unset", () => {
      const fallbackConfig = {
        get: jest.fn((key: string) =>
          key === "JWT_SECRET"
            ? "jwt-secret-minimum-32-characters!!"
            : undefined,
        ),
      };
      const noopCache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
      expect(
        () =>
          new JwtRefreshStrategy(
            fallbackConfig as unknown as ConfigService,
            noopCache as unknown as CacheService,
          ),
      ).not.toThrow();
    });

    it("throws when neither REFRESH_TOKEN_SECRET nor JWT_SECRET is set", () => {
      const noSecretConfig = { get: jest.fn().mockReturnValue(undefined) };
      const noopCache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
      expect(
        () =>
          new JwtRefreshStrategy(
            noSecretConfig as unknown as ConfigService,
            noopCache as unknown as CacheService,
          ),
      ).toThrow("CRITICAL SECURITY ERROR");
    });
  });

  describe("validate", () => {
    const mockPayload = {
      sub: "user-123",
      email: "test@example.com",
      username: "testuser",
    };

    it("returns user info from the refresh payload", async () => {
      await expect(strategy.validate(mockPayload)).resolves.toEqual({
        id: "user-123",
        email: "test@example.com",
        username: "testuser",
      });
    });

    it("throws UnauthorizedException when the user is blocklisted", async () => {
      mockCacheService.get.mockResolvedValueOnce("true");
      await expect(strategy.validate(mockPayload)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("fails open (allows) when the blocklist cache errors", async () => {
      mockCacheService.get.mockRejectedValueOnce(new Error("redis down"));
      await expect(strategy.validate(mockPayload)).resolves.toMatchObject({
        id: "user-123",
      });
    });
  });
});
