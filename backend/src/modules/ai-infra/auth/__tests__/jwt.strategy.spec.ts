/**
 * JWT Strategy 测试
 * 测试JWT认证策略的validate方法
 *
 * 新设计：JWT validate 不查询数据库，直接返回 payload
 * - 性能优化：O(1) 操作，无数据库查询
 * - 安全：通过黑名单机制处理被禁用用户
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { UnauthorizedException } from "@nestjs/common";
import { JwtStrategy } from "../jwt.strategy";

describe("JwtStrategy", () => {
  let strategy: JwtStrategy;

  const mockConfigService = {
    get: jest.fn().mockReturnValue("test-jwt-secret-minimum-32-chars!!"),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should be defined", () => {
      expect(strategy).toBeDefined();
    });

    it("should call configService.get for JWT_SECRET", () => {
      expect(mockConfigService.get).toHaveBeenCalledWith("JWT_SECRET");
    });

    it("should throw error if JWT_SECRET is not set", () => {
      const noSecretConfig = {
        get: jest.fn().mockReturnValue(undefined),
      };

      expect(() => {
        new JwtStrategy(noSecretConfig as unknown as ConfigService);
      }).toThrow("CRITICAL SECURITY ERROR");
    });
  });

  describe("validate", () => {
    const mockPayload = {
      sub: "user-123",
      email: "test@example.com",
      username: "testuser",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    it("should return user info from payload without database query", async () => {
      const result = await strategy.validate(mockPayload);

      expect(result).toEqual({
        id: "user-123",
        email: "test@example.com",
        username: "testuser",
      });
    });

    it("should throw UnauthorizedException when user is blocked", async () => {
      // Block the user
      strategy.blockUser("user-123");

      await expect(strategy.validate(mockPayload)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should allow user after unblocking", async () => {
      // Block then unblock
      strategy.blockUser("user-123");
      strategy.unblockUser("user-123");

      const result = await strategy.validate(mockPayload);
      expect(result.id).toBe("user-123");
    });
  });

  describe("blockUser", () => {
    it("should add user to blocklist", () => {
      strategy.blockUser("user-456");
      expect(strategy.isUserBlocked("user-456")).toBe(true);
    });
  });

  describe("unblockUser", () => {
    it("should remove user from blocklist", () => {
      strategy.blockUser("user-789");
      strategy.unblockUser("user-789");
      expect(strategy.isUserBlocked("user-789")).toBe(false);
    });
  });

  describe("isUserBlocked", () => {
    it("should return false for non-blocked user", () => {
      expect(strategy.isUserBlocked("unknown-user")).toBe(false);
    });

    it("should return true for blocked user", () => {
      strategy.blockUser("blocked-user");
      expect(strategy.isUserBlocked("blocked-user")).toBe(true);
    });
  });
});
