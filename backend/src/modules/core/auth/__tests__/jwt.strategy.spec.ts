/**
 * JWT Strategy 测试
 * 测试JWT认证策略的validate方法
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { UnauthorizedException } from "@nestjs/common";
import { JwtStrategy } from "../jwt.strategy";
import { PrismaService } from "../../../../common/prisma/prisma.service";

describe("JwtStrategy", () => {
  let strategy: JwtStrategy;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue("test-jwt-secret"),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: PrismaService, useValue: mockPrisma },
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
      expect(mockConfigService.get).toHaveBeenCalledWith(
        "JWT_SECRET",
        expect.any(String),
      );
    });
  });

  describe("validate", () => {
    const mockPayload = {
      sub: "user-123",
      email: "test@example.com",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    it("should return user when valid payload", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        username: "testuser",
        avatarUrl: "https://example.com/avatar.png",
        bio: "Test bio",
        interests: [{ tag: "tech" }, { tag: "ai" }],
        createdAt: new Date(),
      };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await strategy.validate(mockPayload);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "user-123" },
        select: expect.objectContaining({
          id: true,
          email: true,
          username: true,
        }),
      });
      expect(result.id).toBe("user-123");
      expect(result.email).toBe("test@example.com");
    });

    it("should transform interests to string array", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        username: "testuser",
        avatarUrl: null,
        bio: null,
        interests: [{ tag: "technology" }, { tag: "programming" }],
        createdAt: new Date(),
      };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await strategy.validate(mockPayload);

      expect(result.interests).toEqual(["technology", "programming"]);
    });

    it("should return empty interests array when user has no interests", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        username: "testuser",
        avatarUrl: null,
        bio: null,
        interests: [],
        createdAt: new Date(),
      };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await strategy.validate(mockPayload);

      expect(result.interests).toEqual([]);
    });

    it("should throw UnauthorizedException when user not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(strategy.validate(mockPayload)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should throw UnauthorizedException with correct message", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      try {
        await strategy.validate(mockPayload);
        fail("Expected UnauthorizedException to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        expect((error as UnauthorizedException).message).toBe("User not found");
      }
    });

    it("should use payload.sub to find user", async () => {
      const payloadWithDifferentSub = {
        sub: "different-user-id",
        email: "other@example.com",
      };
      mockPrisma.user.findUnique.mockResolvedValue(null);

      try {
        await strategy.validate(payloadWithDifferentSub);
      } catch {
        // Expected to throw
      }

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "different-user-id" },
        select: expect.any(Object),
      });
    });

    it("should select only required fields", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        username: "testuser",
        avatarUrl: null,
        bio: null,
        interests: [],
        createdAt: new Date(),
      };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await strategy.validate(mockPayload);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "user-123" },
        select: {
          id: true,
          email: true,
          username: true,
          avatarUrl: true,
          bio: true,
          interests: {
            select: {
              tag: true,
            },
          },
          createdAt: true,
        },
      });
    });

    it("should handle database errors", async () => {
      mockPrisma.user.findUnique.mockRejectedValue(new Error("Database error"));

      await expect(strategy.validate(mockPayload)).rejects.toThrow(
        "Database error",
      );
    });
  });
});
