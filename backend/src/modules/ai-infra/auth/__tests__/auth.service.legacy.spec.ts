import { Test, TestingModule } from "@nestjs/testing";
import { AuthService } from "../auth.service";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { JwtService } from "@nestjs/jwt";
import { CacheService } from "../../../../common/cache/cache.service";
import { ConfigService } from "@nestjs/config";
import { UnauthorizedException, ConflictException } from "@nestjs/common";
import * as bcrypt from "bcrypt";

// Mock bcrypt
jest.mock("bcrypt", () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe("AuthService", () => {
  let service: AuthService;
  let prismaService: jest.Mocked<PrismaService>;

  const mockUser = {
    id: "user-123",
    email: "test@example.com",
    username: "testuser",
    passwordHash: "hashedPassword123",
    createdAt: new Date("2024-01-01"),
    lastLoginAt: null,
    isActive: true,
    isVerified: false,
    oauthProvider: null,
    oauthId: null,
    avatarUrl: null,
  };

  beforeEach(async () => {
    const mockPrismaService = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      creditAccount: {
        create: jest.fn(),
      },
      loginHistory: {
        create: jest.fn(),
      },
      userInterest: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      userActivity: {
        count: jest.fn(),
        groupBy: jest.fn(),
      },
      comment: {
        count: jest.fn(),
      },
      note: {
        count: jest.fn(),
      },
      report: {
        count: jest.fn(),
      },
      askSession: {
        count: jest.fn(),
      },
      topic: {
        count: jest.fn(),
      },
      generatedImage: {
        count: jest.fn(),
      },
    };

    const mockJwtService = {
      sign: jest.fn().mockReturnValue("mock-token"),
    };

    const mockCacheService = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      buildKey: jest
        .fn()
        .mockImplementation(
          (prefix, ...parts) => `${prefix}${parts.join(":")}`,
        ),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === "JWT_SECRET") return "test-jwt-secret-minimum-32-chars!!";
        if (key === "REFRESH_TOKEN_SECRET")
          return "test-refresh-secret-32-chars!!!!";
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: CacheService, useValue: mockCacheService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("register", () => {
    it("should register a new user successfully", async () => {
      // Arrange
      const email = "newuser@example.com";
      const username = "newuser";
      const password = "password123";
      const hashedPassword = "hashedPassword";

      (prismaService.user.findFirst as jest.Mock).mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);
      (prismaService.user.create as jest.Mock).mockResolvedValue({
        id: "new-user-id",
        email,
        username,
        createdAt: new Date(),
      });

      // Act
      const result = await service.register(email, username, password);

      // Assert
      expect(prismaService.user.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [{ email }, { username }],
        },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith(password, 10);
      expect(prismaService.user.create).toHaveBeenCalledWith({
        data: {
          email,
          username,
          passwordHash: hashedPassword,
        },
        select: {
          id: true,
          email: true,
          username: true,
          createdAt: true,
        },
      });
      expect(result.user).toBeDefined();
      expect(result.accessToken).toBe("mock-token");
      expect(result.refreshToken).toBe("mock-token");
    });

    it("should throw ConflictException if email already exists", async () => {
      // Arrange
      (prismaService.user.findFirst as jest.Mock).mockResolvedValue(mockUser);

      // Act & Assert
      await expect(
        service.register("test@example.com", "newuser", "password123"),
      ).rejects.toThrow(ConflictException);
    });

    it("should throw ConflictException if username already exists", async () => {
      // Arrange
      (prismaService.user.findFirst as jest.Mock).mockResolvedValue(mockUser);

      // Act & Assert
      await expect(
        service.register("new@example.com", "testuser", "password123"),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("login", () => {
    it("should login successfully with valid credentials", async () => {
      // Arrange
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (prismaService.user.update as jest.Mock).mockResolvedValue(mockUser);

      // Act
      const result = await service.login("test@example.com", "password123");

      // Assert
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: "test@example.com" },
      });
      expect(bcrypt.compare).toHaveBeenCalledWith(
        "password123",
        mockUser.passwordHash,
      );
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: {
          lastLoginAt: expect.any(Date),
          isActive: true,
        },
      });
      expect(result.user.id).toBe(mockUser.id);
      expect(result.accessToken).toBe("mock-token");
    });

    it("should throw UnauthorizedException if user not found", async () => {
      // Arrange
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.login("nonexistent@example.com", "password123"),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should throw UnauthorizedException if password is invalid", async () => {
      // Arrange
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      // Act & Assert
      await expect(
        service.login("test@example.com", "wrongpassword"),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("refreshToken", () => {
    it("should refresh token successfully", async () => {
      // Arrange
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue({
        id: mockUser.id,
        email: mockUser.email,
      });

      // Act
      const result = await service.refreshToken(mockUser.id);

      // Assert
      expect(result.accessToken).toBe("mock-token");
      expect(result.refreshToken).toBe("mock-token");
    });

    it("should throw UnauthorizedException if user not found", async () => {
      // Arrange
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.refreshToken("nonexistent-id")).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe("validateUser", () => {
    it("should return user if found", async () => {
      // Arrange
      const expectedUser = {
        id: mockUser.id,
        email: mockUser.email,
        username: mockUser.username,
        createdAt: mockUser.createdAt,
      };
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(
        expectedUser,
      );

      // Act
      const result = await service.validateUser(mockUser.id);

      // Assert
      expect(result).toEqual(expectedUser);
    });

    it("should return null if user not found", async () => {
      // Arrange
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(null);

      // Act
      const result = await service.validateUser("nonexistent-id");

      // Assert
      expect(result).toBeNull();
    });
  });

  describe("findOrCreateGoogleUser", () => {
    const googleProfile = {
      id: "google-123",
      email: "google@example.com",
      displayName: "Google User",
      picture: "https://example.com/avatar.jpg",
    };

    it("should create new user if not exists", async () => {
      // Arrange
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prismaService.user.create as jest.Mock).mockResolvedValue({
        id: "new-google-user",
        email: googleProfile.email,
        username: googleProfile.displayName,
        avatarUrl: googleProfile.picture,
        createdAt: new Date(),
        oauthProvider: "google",
        oauthId: googleProfile.id,
      });
      (prismaService.user.update as jest.Mock).mockResolvedValue({});

      // Act
      const result = await service.findOrCreateGoogleUser(googleProfile);

      // Assert
      expect(prismaService.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: googleProfile.email,
          oauthProvider: "google",
          oauthId: googleProfile.id,
          isVerified: true,
        }),
      });
      expect(result.user.email).toBe(googleProfile.email);
      expect(result.accessToken).toBeDefined();
    });

    it("should link existing user with Google if not already linked", async () => {
      // Arrange
      const existingUser = {
        ...mockUser,
        oauthProvider: null,
        oauthId: null,
      };
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(
        existingUser,
      );
      (prismaService.user.update as jest.Mock)
        .mockResolvedValueOnce({
          ...existingUser,
          oauthProvider: "google",
          oauthId: googleProfile.id,
        })
        .mockResolvedValueOnce({});

      // Act
      const result = await service.findOrCreateGoogleUser(googleProfile);

      // Assert
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: existingUser.id },
        data: expect.objectContaining({
          oauthProvider: "google",
          oauthId: googleProfile.id,
        }),
      });
      expect(result.accessToken).toBeDefined();
    });

    it("should return existing Google user directly", async () => {
      // Arrange
      const existingGoogleUser = {
        ...mockUser,
        oauthProvider: "google",
        oauthId: googleProfile.id,
      };
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(
        existingGoogleUser,
      );
      (prismaService.user.update as jest.Mock).mockResolvedValue({});

      // Act
      const result = await service.findOrCreateGoogleUser(googleProfile);

      // Assert
      // Should only update lastLoginAt, not oauthProvider/oauthId
      expect(prismaService.user.create).not.toHaveBeenCalled();
      expect(result.accessToken).toBeDefined();
    });
  });

  describe("updateProfile", () => {
    it("should update user profile successfully", async () => {
      // Arrange
      const updateData = {
        username: "updateduser",
        bio: "Updated bio",
      };
      (prismaService.user.findFirst as jest.Mock).mockResolvedValue(null);
      (prismaService.user.update as jest.Mock).mockResolvedValue({
        id: mockUser.id,
        email: mockUser.email,
        username: updateData.username,
        bio: updateData.bio,
        interests: [],
        avatarUrl: null,
        createdAt: mockUser.createdAt,
      });

      // Act
      const result = await service.updateProfile(mockUser.id, updateData);

      // Assert
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: updateData,
        select: expect.any(Object),
      });
      expect(result.username).toBe(updateData.username);
    });

    it("should throw ConflictException if username already taken", async () => {
      // Arrange
      (prismaService.user.findFirst as jest.Mock).mockResolvedValue({
        id: "other-user",
        username: "takenusername",
      });

      // Act & Assert
      await expect(
        service.updateProfile(mockUser.id, { username: "takenusername" }),
      ).rejects.toThrow(ConflictException);
    });

    it("should update interests correctly", async () => {
      // Arrange
      const updateData = {
        interests: ["AI", "Machine Learning", "TypeScript"],
      };
      (prismaService.userInterest.deleteMany as jest.Mock).mockResolvedValue(
        {},
      );
      (prismaService.userInterest.createMany as jest.Mock).mockResolvedValue(
        {},
      );
      (prismaService.user.update as jest.Mock).mockResolvedValue({
        id: mockUser.id,
        email: mockUser.email,
        username: mockUser.username,
        bio: null,
        interests: updateData.interests.map((tag) => ({ tag })),
        avatarUrl: null,
        createdAt: mockUser.createdAt,
      });

      // Act
      const result = await service.updateProfile(mockUser.id, updateData);

      // Assert
      expect(prismaService.userInterest.deleteMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
      });
      expect(prismaService.userInterest.createMany).toHaveBeenCalledWith({
        data: updateData.interests.map((tag) => ({
          userId: mockUser.id,
          tag,
          source: "manual",
        })),
      });
      expect(result.interests).toEqual(updateData.interests);
    });
  });

  describe("getUserStats", () => {
    it("should return user statistics", async () => {
      // Arrange
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue({
        id: mockUser.id,
        createdAt: mockUser.createdAt,
      });
      (prismaService.userActivity.count as jest.Mock)
        .mockResolvedValueOnce(10) // bookmarked
        .mockResolvedValueOnce(50) // viewed
        .mockResolvedValueOnce(5); // recent activity
      (prismaService.comment.count as jest.Mock).mockResolvedValue(3);
      (prismaService.note.count as jest.Mock).mockResolvedValue(7);
      (prismaService.report.count as jest.Mock).mockResolvedValue(2);
      (prismaService.askSession.count as jest.Mock).mockResolvedValue(15);
      (prismaService.topic.count as jest.Mock).mockResolvedValue(4);
      (prismaService.generatedImage.count as jest.Mock).mockResolvedValue(20);
      (prismaService.userActivity.groupBy as jest.Mock).mockResolvedValue([
        { activityType: "VIEW", _count: 50 },
        { activityType: "SAVE", _count: 10 },
      ]);

      // Act
      const result = await service.getUserStats(mockUser.id);

      // Assert
      expect(result.userId).toBe(mockUser.id);
      expect(result.stats.bookmarked).toBe(10);
      expect(result.stats.viewed).toBe(50);
      expect(result.stats.comments).toBe(3);
      expect(result.stats.notes).toBe(7);
      expect(result.stats.reports).toBe(2);
      expect(result.stats.chatSessions).toBe(15);
      expect(result.stats.topicsCreated).toBe(4);
      expect(result.stats.imagesGenerated).toBe(20);
      expect(result.activity.breakdown).toHaveLength(2);
    });

    it("should throw UnauthorizedException if user not found", async () => {
      // Arrange
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.getUserStats("nonexistent-id")).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
