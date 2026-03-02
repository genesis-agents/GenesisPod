// Mock transitive deps that are not installed in the worktree
jest.mock("@nestjs/cache-manager", () => ({ CACHE_MANAGER: "CACHE_MANAGER" }), {
  virtual: true,
});
jest.mock("cache-manager", () => ({}), { virtual: true });
jest.mock("ioredis", () => ({}), { virtual: true });

// Mock workspace services to avoid deep transitive imports
jest.mock("../workspace.service", () => ({ WorkspaceService: class {} }));
jest.mock("../workspace-task.service", () => ({
  WorkspaceTaskService: class {},
}));
jest.mock("../report-template.service", () => ({
  ReportTemplateService: class {},
}));

// Mock the jwt-auth.guard module entirely
// Note: 5 levels up from __tests__ folder to reach common/guards
jest.mock("../../../../../common/guards/jwt-auth.guard", () => ({
  JwtAuthGuard: class {
    canActivate() {
      return true;
    }
  },
}));

import { Test, TestingModule } from "@nestjs/testing";
import { UnauthorizedException } from "@nestjs/common";
import { WorkspaceController } from "../workspace.controller";
import { WorkspaceService } from "../workspace.service";
import { WorkspaceTaskService } from "../workspace-task.service";
import { ReportTemplateService } from "../report-template.service";
import { JwtAuthGuard } from "../../../../../common/guards/jwt-auth.guard";

const mockWorkspaceService = {
  createWorkspace: jest.fn(),
  getWorkspace: jest.fn(),
  updateWorkspaceResources: jest.fn(),
  ensureWorkspaceOwnership: jest.fn(),
};

const mockWorkspaceTaskService = {
  createTask: jest.fn(),
  getTask: jest.fn(),
};

const mockReportTemplateService = {
  listTemplates: jest.fn(),
  getTemplate: jest.fn(),
};

const mockWorkspace = {
  id: "ws-1",
  userId: "user-123",
  name: "Test Workspace",
  description: "Test workspace description",
  resources: [],
  tasks: [],
  reports: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockTemplate = {
  id: "tmpl-1",
  name: "Research Report",
  category: "research",
  description: "A research report template",
  promptTemplate: "Generate a research report about {{topic}}",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const makeRequest = (userId = "user-123") => ({
  user: { id: userId, email: "test@example.com" },
});

describe("WorkspaceController", () => {
  let controller: WorkspaceController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkspaceController],
      providers: [
        { provide: WorkspaceService, useValue: mockWorkspaceService },
        { provide: WorkspaceTaskService, useValue: mockWorkspaceTaskService },
        {
          provide: ReportTemplateService,
          useValue: mockReportTemplateService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WorkspaceController>(WorkspaceController);
  });

  // ==================== createWorkspace ====================

  describe("createWorkspace", () => {
    it("creates a workspace for authenticated user", async () => {
      mockWorkspaceService.createWorkspace.mockResolvedValue(mockWorkspace);

      const dto = { resourceIds: ["res-1", "res-2"], name: "Test Workspace" };
      const result = await controller.createWorkspace(makeRequest(), dto);

      expect(mockWorkspaceService.createWorkspace).toHaveBeenCalledWith(
        "user-123",
        dto,
      );
      expect(result).toEqual(mockWorkspace);
    });

    it("throws UnauthorizedException when user is not authenticated", async () => {
      const req = { user: { id: undefined as unknown as string, email: "" } };

      await expect(
        controller.createWorkspace(req, { resourceIds: ["res-1"], name: "x" }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ==================== listTemplates ====================

  describe("listTemplates", () => {
    it("returns all templates when no category provided", async () => {
      mockReportTemplateService.listTemplates.mockResolvedValue([mockTemplate]);

      const result = await controller.listTemplates();

      expect(mockReportTemplateService.listTemplates).toHaveBeenCalledWith(
        undefined,
      );
      expect(result).toEqual([mockTemplate]);
    });

    it("returns filtered templates by category", async () => {
      mockReportTemplateService.listTemplates.mockResolvedValue([mockTemplate]);

      const result = await controller.listTemplates("research");

      expect(mockReportTemplateService.listTemplates).toHaveBeenCalledWith(
        "research",
      );
      expect(result).toHaveLength(1);
    });
  });

  // ==================== getWorkspace ====================

  describe("getWorkspace", () => {
    it("returns workspace detail for authenticated user", async () => {
      mockWorkspaceService.getWorkspace.mockResolvedValue(mockWorkspace);

      const result = await controller.getWorkspace("ws-1", makeRequest());

      expect(mockWorkspaceService.getWorkspace).toHaveBeenCalledWith(
        "ws-1",
        "user-123",
      );
      expect(result).toEqual(mockWorkspace);
    });

    it("throws UnauthorizedException when user id is missing", async () => {
      const req = { user: { id: undefined as unknown as string, email: "" } };

      await expect(controller.getWorkspace("ws-1", req)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ==================== updateWorkspaceResources ====================

  describe("updateWorkspaceResources", () => {
    it("updates workspace resources for authenticated user", async () => {
      const updated = { ...mockWorkspace, resources: [] };
      mockWorkspaceService.updateWorkspaceResources.mockResolvedValue(updated);

      const dto = { resourceIds: ["res-1", "res-2"] };
      const result = await controller.updateWorkspaceResources(
        "ws-1",
        makeRequest(),
        dto,
      );

      expect(
        mockWorkspaceService.updateWorkspaceResources,
      ).toHaveBeenCalledWith("ws-1", "user-123", dto);
      expect(result).toEqual(updated);
    });

    it("throws UnauthorizedException when not authenticated", async () => {
      const req = { user: { id: undefined as unknown as string, email: "" } };

      await expect(
        controller.updateWorkspaceResources("ws-1", req, {
          resourceIds: [],
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ==================== createWorkspaceTask ====================

  describe("createWorkspaceTask", () => {
    it("creates a task in the workspace for authenticated user", async () => {
      const mockTask = {
        id: "task-1",
        workspaceId: "ws-1",
        status: "PENDING",
        createdAt: new Date(),
      };
      mockWorkspaceTaskService.createTask.mockResolvedValue(mockTask);

      const dto = { templateId: "tmpl-1", parameters: {} };
      const result = await controller.createWorkspaceTask(
        "ws-1",
        makeRequest(),
        dto,
      );

      expect(mockWorkspaceTaskService.createTask).toHaveBeenCalledWith(
        "user-123",
        "ws-1",
        dto,
      );
      expect(result).toEqual(mockTask);
    });

    it("throws UnauthorizedException when not authenticated", async () => {
      const req = { user: { id: undefined as unknown as string, email: "" } };

      await expect(
        controller.createWorkspaceTask("ws-1", req, { templateId: "tmpl-1" }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ==================== getWorkspaceTask ====================

  describe("getWorkspaceTask", () => {
    it("returns task status for authenticated user", async () => {
      const mockTask = {
        id: "task-1",
        workspaceId: "ws-1",
        status: "RUNNING",
        createdAt: new Date(),
      };
      mockWorkspaceTaskService.getTask.mockResolvedValue(mockTask);

      const result = await controller.getWorkspaceTask(
        "ws-1",
        "task-1",
        makeRequest(),
      );

      expect(mockWorkspaceTaskService.getTask).toHaveBeenCalledWith(
        "user-123",
        "ws-1",
        "task-1",
      );
      expect(result.status).toBe("RUNNING");
    });

    it("throws UnauthorizedException when not authenticated", async () => {
      const req = { user: { id: undefined as unknown as string, email: "" } };

      await expect(
        controller.getWorkspaceTask("ws-1", "task-1", req),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
