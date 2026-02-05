import { Test, TestingModule } from "@nestjs/testing";
import { AIAdminService } from "../ai-admin.service";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { ToolRegistry } from "../../../ai-engine/tools/registry/tool-registry";
import { SkillRegistry } from "../../../ai-engine/skills/registry/skill-registry";
import { SkillLoaderService } from "../../../ai-engine/skills/loader/skill-loader.service";
import { MCPManager } from "../../../ai-engine/mcp/manager/mcp-manager";
import { SecretsService } from "../../secrets/secrets.service";
import { SearchService } from "../../../ai-engine/search/search.service";

describe("AIAdminService", () => {
  let service: AIAdminService;

  const mockPrismaService = {
    toolConfig: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    skillConfig: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    mCPServerConfig: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    aIUsageLog: {
      create: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    // Transaction support for batch operations
    $transaction: jest.fn(),
  };

  const mockToolRegistry = {
    getAll: jest.fn().mockReturnValue([]),
    tryGet: jest.fn(),
    getEnabled: jest.fn().mockReturnValue([]),
  };

  const mockSkillRegistry = {
    getAll: jest.fn().mockReturnValue([]),
    tryGet: jest.fn(),
  };

  const mockSkillLoaderService = {
    getAllLoadedSkills: jest.fn().mockReturnValue([]),
  };

  const mockMCPManager = {
    registerServer: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    getClient: jest.fn(),
  };

  const mockSecretsService = {
    exists: jest.fn(),
    getValue: jest.fn(),
  };

  const mockSearchService = {};

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIAdminService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ToolRegistry, useValue: mockToolRegistry },
        { provide: SkillRegistry, useValue: mockSkillRegistry },
        { provide: SkillLoaderService, useValue: mockSkillLoaderService },
        { provide: MCPManager, useValue: mockMCPManager },
        { provide: SecretsService, useValue: mockSecretsService },
        { provide: SearchService, useValue: mockSearchService },
      ],
    }).compile();

    service = module.get<AIAdminService>(AIAdminService);
  });

  describe("getToolConfigs", () => {
    it("should return tool configurations with stats", async () => {
      mockPrismaService.toolConfig.findMany.mockResolvedValue([]);

      const result = await service.getToolConfigs();

      expect(result).toHaveProperty("tools");
      expect(result).toHaveProperty("stats");
      expect(result.stats).toHaveProperty("total");
      expect(result.stats).toHaveProperty("enabled");
      expect(result.stats).toHaveProperty("implemented");
    });

    it("should merge database config with tool definitions", async () => {
      mockPrismaService.toolConfig.findMany.mockResolvedValue([
        {
          toolId: "web-search",
          enabled: false,
          displayName: "Custom Name",
          secretKey: "test-secret",
        },
      ]);

      const result = await service.getToolConfigs();

      const webSearchTool = result.tools.find((t) => t.toolId === "web-search");
      expect(webSearchTool).toBeDefined();
      expect(webSearchTool?.enabled).toBe(false);
      expect(webSearchTool?.displayName).toBe("Custom Name");
      expect(webSearchTool?.secretKey).toBe("test-secret");
    });
  });

  describe("updateToolConfig", () => {
    it("should validate secretKey before saving", async () => {
      mockSecretsService.exists.mockResolvedValue(false);

      await expect(
        service.updateToolConfig("test-tool", { secretKey: "non-existent" }),
      ).rejects.toThrow("Secret key 'non-existent' does not exist");

      expect(mockSecretsService.exists).toHaveBeenCalledWith("non-existent");
      expect(mockPrismaService.toolConfig.upsert).not.toHaveBeenCalled();
    });

    it("should save config when secretKey is valid", async () => {
      mockSecretsService.exists.mockResolvedValue(true);
      mockPrismaService.toolConfig.upsert.mockResolvedValue({
        toolId: "test-tool",
        enabled: true,
        secretKey: "valid-secret",
      });

      const result = await service.updateToolConfig("test-tool", {
        secretKey: "valid-secret",
        enabled: true,
      });

      expect(result.success).toBe(true);
      expect(mockPrismaService.toolConfig.upsert).toHaveBeenCalled();
    });

    it("should allow null secretKey without validation", async () => {
      mockPrismaService.toolConfig.upsert.mockResolvedValue({
        toolId: "test-tool",
        enabled: true,
        secretKey: null,
      });

      const result = await service.updateToolConfig("test-tool", {
        secretKey: null,
        enabled: true,
      });

      expect(result.success).toBe(true);
      expect(mockSecretsService.exists).not.toHaveBeenCalled();
    });
  });

  describe("getSkillConfigs", () => {
    it("should return skill configurations with stats", async () => {
      mockPrismaService.skillConfig.findMany.mockResolvedValue([]);

      const result = await service.getSkillConfigs();

      expect(result).toHaveProperty("skills");
      expect(result).toHaveProperty("stats");
      expect(result.stats).toHaveProperty("total");
      expect(result.stats).toHaveProperty("enabled");
    });

    it("should combine registry skills and loaded skills", async () => {
      mockSkillRegistry.getAll.mockReturnValue([
        {
          id: "registry-skill",
          name: "Registry Skill",
          description: "From registry",
          layer: "content",
          domain: "common",
        },
      ]);

      mockSkillLoaderService.getAllLoadedSkills.mockReturnValue([
        {
          metadata: {
            id: "loaded-skill",
            name: "Loaded Skill",
            description: "From loader",
            domain: "writing",
            tags: ["test"],
          },
        },
      ]);

      mockPrismaService.skillConfig.findMany.mockResolvedValue([]);

      const result = await service.getSkillConfigs();

      expect(result.skills.length).toBeGreaterThanOrEqual(2);
      expect(result.skills.some((s) => s.skillId === "registry-skill")).toBe(
        true,
      );
      expect(result.skills.some((s) => s.skillId === "loaded-skill")).toBe(
        true,
      );
    });
  });

  describe("getMCPServerConfigs", () => {
    it("should return MCP server configurations", async () => {
      mockPrismaService.mCPServerConfig.findMany.mockResolvedValue([
        {
          serverId: "test-server",
          name: "Test Server",
          transport: "stdio",
          enabled: true,
        },
      ]);

      const result = await service.getMCPServerConfigs();

      expect(result).toHaveProperty("servers");
      expect(result.servers).toHaveLength(1);
      expect(result.servers[0].serverId).toBe("test-server");
    });
  });

  describe("testTool", () => {
    it("should return error for unregistered tool", async () => {
      mockToolRegistry.tryGet.mockReturnValue(null);

      const result = await service.testTool("non-existent-tool", {});

      expect(result.success).toBe(false);
      expect(result.error).toContain("not implemented or registered");
    });
  });

  describe("getAllConfigs", () => {
    it("should return aggregated configs with tools, skills, and MCP servers", async () => {
      mockPrismaService.toolConfig.findMany.mockResolvedValue([]);
      mockPrismaService.skillConfig.findMany.mockResolvedValue([]);
      mockPrismaService.mCPServerConfig.findMany.mockResolvedValue([]);

      const result = await service.getAllConfigs();

      expect(result).toHaveProperty("tools");
      expect(result).toHaveProperty("skills");
      expect(result).toHaveProperty("mcpServers");
      expect(result).toHaveProperty("timestamp");
      expect(result.tools).toHaveProperty("tools");
      expect(result.tools).toHaveProperty("stats");
      expect(result.skills).toHaveProperty("skills");
      expect(result.skills).toHaveProperty("stats");
      expect(result.mcpServers).toHaveProperty("servers");
    });

    it("should return timestamp in ISO format", async () => {
      mockPrismaService.toolConfig.findMany.mockResolvedValue([]);
      mockPrismaService.skillConfig.findMany.mockResolvedValue([]);
      mockPrismaService.mCPServerConfig.findMany.mockResolvedValue([]);

      const result = await service.getAllConfigs();

      expect(typeof result.timestamp).toBe("string");
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });
  });

  describe("batchUpdateTools", () => {
    it("should update multiple tools successfully using transaction", async () => {
      // Mock $transaction to return array of results
      mockPrismaService.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.batchUpdateTools([
        { toolId: "tool-1", enabled: true },
        { toolId: "tool-2", enabled: false },
      ]);

      expect(result.success).toBe(true);
      expect(result.updated).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
    });

    it("should report errors when transaction fails", async () => {
      mockPrismaService.$transaction.mockRejectedValue(
        new Error("Database error"),
      );

      const result = await service.batchUpdateTools([
        { toolId: "tool-1", enabled: true },
        { toolId: "tool-2", enabled: false },
      ]);

      expect(result.success).toBe(false);
      expect(result.updated).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Transaction failed");
    });
  });

  describe("batchUpdateSkills", () => {
    it("should update multiple skills successfully using transaction", async () => {
      // Mock $transaction to return array of results
      mockPrismaService.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.batchUpdateSkills([
        { skillId: "skill-1", enabled: true },
        { skillId: "skill-2", enabled: false },
      ]);

      expect(result.success).toBe(true);
      expect(result.updated).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });
  });
});
