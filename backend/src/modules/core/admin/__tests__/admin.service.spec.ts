import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { AdminService } from "../admin.service";
import { PrismaService } from "../../../../common/prisma/prisma.service";

describe("AdminService", () => {
  let service: AdminService;

  const mockPrismaService = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    resource: {
      findUnique: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    aIModel: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    systemSetting: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    rawData: {
      count: jest.fn(),
      deleteMany: jest.fn(),
    },
    deduplicationRecord: {
      count: jest.fn(),
      deleteMany: jest.fn(),
    },
    note: {
      deleteMany: jest.fn(),
    },
    comment: {
      deleteMany: jest.fn(),
    },
    collectionTask: {
      updateMany: jest.fn(),
    },
    dataSource: {
      updateMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    // Set ADMIN_EMAILS env var for testing
    process.env.ADMIN_EMAILS = "admin@test.com,super@test.com";

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  describe("getAllUsers", () => {
    it("should return paginated users with admin flag", async () => {
      const mockUsers = [
        {
          id: "user-1",
          email: "admin@test.com",
          username: "admin",
          role: "USER",
          avatarUrl: null,
          isActive: true,
          isVerified: true,
          oauthProvider: null,
          subscriptionTier: "FREE",
          createdAt: new Date(),
          lastLoginAt: new Date(),
          _count: { notes: 5, comments: 10, collections: 3 },
        },
        {
          id: "user-2",
          email: "regular@test.com",
          username: "regular",
          role: "USER",
          avatarUrl: null,
          isActive: true,
          isVerified: true,
          oauthProvider: "google",
          subscriptionTier: "FREE",
          createdAt: new Date(),
          lastLoginAt: new Date(),
          _count: { notes: 2, comments: 5, collections: 1 },
        },
      ];

      mockPrismaService.user.findMany.mockResolvedValue(mockUsers);
      mockPrismaService.user.count.mockResolvedValue(2);

      const result = await service.getAllUsers(1, 20);

      expect(result.users).toHaveLength(2);
      expect(result.users[0].isAdmin).toBe(true); // email in ADMIN_EMAILS
      expect(result.users[1].isAdmin).toBe(false);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });
    });

    it("should search users by email or username", async () => {
      mockPrismaService.user.findMany.mockResolvedValue([]);
      mockPrismaService.user.count.mockResolvedValue(0);

      await service.getAllUsers(1, 20, "search-term");

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { email: { contains: "search-term", mode: "insensitive" } },
              { username: { contains: "search-term", mode: "insensitive" } },
            ],
          },
        }),
      );
    });
  });

  describe("deleteResource", () => {
    it("should delete a resource successfully", async () => {
      const mockResource = { id: "resource-1", title: "Test Resource" };
      mockPrismaService.resource.findUnique.mockResolvedValue(mockResource);
      mockPrismaService.resource.delete.mockResolvedValue(mockResource);

      const result = await service.deleteResource("resource-1");

      expect(result.success).toBe(true);
      expect(mockPrismaService.resource.delete).toHaveBeenCalledWith({
        where: { id: "resource-1" },
      });
    });

    it("should throw NotFoundException for non-existent resource", async () => {
      mockPrismaService.resource.findUnique.mockResolvedValue(null);

      await expect(service.deleteResource("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("deleteResources", () => {
    it("should delete multiple resources", async () => {
      mockPrismaService.resource.deleteMany.mockResolvedValue({ count: 3 });

      const result = await service.deleteResources(["id-1", "id-2", "id-3"]);

      expect(result.success).toBe(true);
      expect(result.count).toBe(3);
    });
  });

  describe("updateUserRole", () => {
    it("should update user role successfully", async () => {
      const mockUser = { id: "user-1", email: "test@test.com" };
      const updatedUser = { ...mockUser, role: "ADMIN" };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const result = await service.updateUserRole("user-1", "ADMIN");

      expect(result.role).toBe("ADMIN");
    });

    it("should throw NotFoundException for non-existent user", async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updateUserRole("non-existent", "ADMIN"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("toggleUserStatus", () => {
    it("should toggle user status to inactive", async () => {
      const mockUser = { id: "user-1", isActive: true };
      const updatedUser = { ...mockUser, isActive: false };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const result = await service.toggleUserStatus("user-1", false);

      expect(result.isActive).toBe(false);
    });
  });

  describe("getSystemStats", () => {
    it("should return system statistics", async () => {
      mockPrismaService.user.count
        .mockResolvedValueOnce(100) // totalUsers
        .mockResolvedValueOnce(80) // activeUsers
        .mockResolvedValueOnce(5); // recentUsers

      mockPrismaService.resource.count.mockResolvedValue(500);
      mockPrismaService.resource.groupBy.mockResolvedValue([
        { type: "ARTICLE", _count: { type: 300 } },
        { type: "VIDEO", _count: { type: 200 } },
      ]);

      const result = await service.getSystemStats();

      expect(result.users.total).toBe(100);
      expect(result.users.active).toBe(80);
      expect(result.users.newLast7Days).toBe(5);
      expect(result.resources.total).toBe(500);
      expect(result.resources.byType).toEqual({
        ARTICLE: 300,
        VIDEO: 200,
      });
    });
  });

  describe("isUserAdmin", () => {
    it("should return true for user with ADMIN role", async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        role: "ADMIN",
        email: "random@test.com",
      });

      const result = await service.isUserAdmin("user-1");

      expect(result).toBe(true);
    });

    it("should return true for user in admin email list", async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        role: "USER",
        email: "admin@test.com", // In ADMIN_EMAILS
      });

      const result = await service.isUserAdmin("user-1");

      expect(result).toBe(true);
    });

    it("should return false for non-admin user", async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        role: "USER",
        email: "regular@test.com",
      });

      const result = await service.isUserAdmin("user-1");

      expect(result).toBe(false);
    });

    it("should return false for non-existent user", async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.isUserAdmin("non-existent");

      expect(result).toBe(false);
    });
  });

  describe("AI Model Management", () => {
    describe("getAllAIModels", () => {
      it("should return all models with masked API keys", async () => {
        const mockModels = [
          {
            id: "model-1",
            name: "GPT-4",
            apiKey: "sk-1234567890abcdefghijklmnop",
            isDefault: true,
          },
          {
            id: "model-2",
            name: "Claude",
            apiKey: null,
            isDefault: false,
          },
        ];

        mockPrismaService.aIModel.findMany.mockResolvedValue(mockModels);

        const result = await service.getAllAIModels();

        expect(result).toHaveLength(2);
        expect(result[0].apiKey).toBe("sk-1****mnop"); // Masked
        expect(result[0].hasApiKey).toBe(true);
        expect(result[1].apiKey).toBeNull();
        expect(result[1].hasApiKey).toBe(false);
      });
    });

    describe("getAIModel", () => {
      it("should return model with masked API key by default", async () => {
        const mockModel = {
          id: "model-1",
          name: "GPT-4",
          apiKey: "sk-verylongapikey123456",
        };

        mockPrismaService.aIModel.findUnique.mockResolvedValue(mockModel);

        const result = await service.getAIModel("model-1");

        expect(result.apiKey).not.toBe("sk-verylongapikey123456");
        expect(result.apiKey).toContain("****");
      });

      it("should return full API key when includeFullApiKey is true", async () => {
        const mockModel = {
          id: "model-1",
          name: "GPT-4",
          apiKey: "sk-verylongapikey123456",
        };

        mockPrismaService.aIModel.findUnique.mockResolvedValue(mockModel);

        const result = await service.getAIModel("model-1", true);

        expect(result.apiKey).toBe("sk-verylongapikey123456");
      });

      it("should throw NotFoundException for non-existent model", async () => {
        mockPrismaService.aIModel.findUnique.mockResolvedValue(null);

        await expect(service.getAIModel("non-existent")).rejects.toThrow(
          NotFoundException,
        );
      });
    });

    describe("createAIModel", () => {
      it("should create a new model", async () => {
        mockPrismaService.aIModel.findFirst.mockResolvedValue(null);
        mockPrismaService.aIModel.create.mockResolvedValue({
          id: "new-model",
          name: "New Model",
          displayName: "New Model Display",
          provider: "openai",
          modelId: "gpt-4-new",
          modelType: "CHAT",
          apiKey: "sk-newkey123",
          isUpdate: false,
        });

        const result = await service.createAIModel({
          name: "New Model",
          displayName: "New Model Display",
          provider: "openai",
          modelId: "gpt-4-new",
          icon: "icon",
          color: "#000",
          apiEndpoint: "https://api.openai.com",
          apiKey: "sk-newkey123",
        });

        expect(result.isUpdate).toBe(false);
        expect(mockPrismaService.aIModel.create).toHaveBeenCalled();
      });

      it("should update existing model with same modelId and name", async () => {
        mockPrismaService.aIModel.findFirst.mockResolvedValue({
          id: "existing-model",
          name: "Existing Model",
          modelType: "CHAT",
          maxTokens: 4096,
          temperature: 0.7,
        });
        mockPrismaService.aIModel.update.mockResolvedValue({
          id: "existing-model",
          name: "Existing Model",
          apiKey: "sk-updated",
          isUpdate: true,
        });

        await service.createAIModel({
          name: "Existing Model",
          displayName: "Updated Display",
          provider: "openai",
          modelId: "gpt-4",
          icon: "icon",
          color: "#000",
          apiEndpoint: "https://api.openai.com",
          apiKey: "sk-updated",
        });

        expect(mockPrismaService.aIModel.update).toHaveBeenCalled();
      });
    });

    describe("setDefaultAIModel", () => {
      it("should set model as default", async () => {
        mockPrismaService.aIModel.findUnique.mockResolvedValue({
          id: "model-1",
          name: "Test Model",
        });
        mockPrismaService.aIModel.updateMany.mockResolvedValue({ count: 5 });
        mockPrismaService.aIModel.update.mockResolvedValue({
          id: "model-1",
          name: "Test Model",
          isDefault: true,
          apiKey: null,
        });

        const result = await service.setDefaultAIModel("model-1");

        expect(result.isDefault).toBe(true);
        expect(mockPrismaService.aIModel.updateMany).toHaveBeenCalledWith({
          data: { isDefault: false },
        });
      });
    });

    describe("deleteAIModel", () => {
      it("should delete non-default model", async () => {
        mockPrismaService.aIModel.findUnique.mockResolvedValue({
          id: "model-1",
          name: "Test Model",
          isDefault: false,
        });
        mockPrismaService.aIModel.delete.mockResolvedValue({});

        const result = await service.deleteAIModel("model-1");

        expect(result.success).toBe(true);
      });

      it("should throw error when deleting default model", async () => {
        mockPrismaService.aIModel.findUnique.mockResolvedValue({
          id: "model-1",
          name: "Test Model",
          isDefault: true,
        });

        await expect(service.deleteAIModel("model-1")).rejects.toThrow(
          "Cannot delete the default AI model",
        );
      });
    });
  });

  describe("System Settings", () => {
    describe("getSettings", () => {
      it("should return settings as key-value pairs", async () => {
        mockPrismaService.systemSetting.findMany.mockResolvedValue([
          { key: "setting1", value: '"string value"' },
          { key: "setting2", value: "123" },
          { key: "setting3", value: '{"nested": true}' },
        ]);

        const result = await service.getSettings();

        expect(result.setting1).toBe("string value");
        expect(result.setting2).toBe(123);
        expect(result.setting3).toEqual({ nested: true });
      });
    });

    describe("getSetting", () => {
      it("should return parsed setting value", async () => {
        mockPrismaService.systemSetting.findUnique.mockResolvedValue({
          key: "test",
          value: '{"enabled": true}',
        });

        const result = await service.getSetting("test");

        expect(result).toEqual({ enabled: true });
      });

      it("should return null for non-existent setting", async () => {
        mockPrismaService.systemSetting.findUnique.mockResolvedValue(null);

        const result = await service.getSetting("non-existent");

        expect(result).toBeNull();
      });
    });

    describe("setSetting", () => {
      it("should upsert setting", async () => {
        mockPrismaService.systemSetting.upsert.mockResolvedValue({
          key: "test",
          value: "true",
        });

        await service.setSetting("test", true, {
          description: "Test setting",
          category: "test",
        });

        expect(mockPrismaService.systemSetting.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { key: "test" },
            update: expect.objectContaining({
              value: "true",
            }),
          }),
        );
      });
    });

    describe("deleteSetting", () => {
      it("should delete existing setting", async () => {
        mockPrismaService.systemSetting.findUnique.mockResolvedValue({
          key: "test",
        });
        mockPrismaService.systemSetting.delete.mockResolvedValue({});

        const result = await service.deleteSetting("test");

        expect(result.success).toBe(true);
      });

      it("should throw NotFoundException for non-existent setting", async () => {
        mockPrismaService.systemSetting.findUnique.mockResolvedValue(null);

        await expect(service.deleteSetting("non-existent")).rejects.toThrow(
          NotFoundException,
        );
      });
    });
  });

  describe("resetCollectionData", () => {
    it("should reset all collection data", async () => {
      mockPrismaService.rawData.count.mockResolvedValue(100);
      mockPrismaService.resource.count.mockResolvedValue(50);
      mockPrismaService.deduplicationRecord.count.mockResolvedValue(200);

      mockPrismaService.deduplicationRecord.deleteMany.mockResolvedValue({
        count: 200,
      });
      mockPrismaService.note.deleteMany.mockResolvedValue({ count: 10 });
      mockPrismaService.comment.deleteMany.mockResolvedValue({ count: 20 });
      mockPrismaService.resource.deleteMany.mockResolvedValue({ count: 50 });
      mockPrismaService.rawData.deleteMany.mockResolvedValue({ count: 100 });
      mockPrismaService.collectionTask.updateMany.mockResolvedValue({
        count: 5,
      });
      mockPrismaService.dataSource.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.resetCollectionData();

      expect(result.success).toBe(true);
      expect(result.deleted.rawData).toBe(100);
      expect(result.deleted.resources).toBe(50);
      expect(result.deleted.deduplicationRecords).toBe(200);
      expect(result.before.rawData).toBe(100);
    });
  });
});
