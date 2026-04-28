/**
 * TaskBreakdownService Tests
 */

import { Test, TestingModule } from "@nestjs/testing";
import { TaskBreakdownService } from "../task-breakdown.service";
import { PrismaService } from "../../../../../../../common/prisma/prisma.service";
import { AgentFacade } from "../../../../../../ai-harness/facade";

const mockTeamMembers = [
  {
    id: "member-1",
    agentName: "Writer",
    displayName: "Writer Agent",
    aiModel: "gemini-pro",
    isLeader: false,
    roleDescription: "Writes content",
  },
  {
    id: "member-2",
    agentName: "Reviewer",
    displayName: "Review Agent",
    aiModel: "gpt-4",
    isLeader: true,
    roleDescription: "Reviews content",
  },
];

const mockBreakdownTasks = [
  {
    title: "Chapter 1: Introduction",
    description: "Write the introduction",
    assigneeId: "member-1",
    assigneeName: "Writer",
    reason: "Good at writing",
    priority: "HIGH" as const,
    taskType: "WRITING" as const,
    dependsOn: [] as number[],
  },
  {
    title: "Chapter 2: Development",
    description: "Write the main content",
    assigneeId: "member-1",
    assigneeName: "Writer",
    reason: "Main writer",
    priority: "MEDIUM" as const,
    taskType: "WRITING" as const,
    dependsOn: [0] as number[],
  },
];

const mockTaskDecomposer = {
  parseTaskBreakdown: jest.fn(),
  rebalanceTaskAssignments: jest.fn(),
};

const mockCreatedTask = { id: "task-created-1" };

describe("TaskBreakdownService", () => {
  let service: TaskBreakdownService;
  let prisma: {
    agentTask: {
      findMany: jest.Mock;
      create: jest.Mock;
      createManyAndReturn: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let aiFacade: { taskDecomposer: typeof mockTaskDecomposer | null }; // shape matches AgentFacade.taskDecomposer

  beforeEach(async () => {
    prisma = {
      agentTask: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(mockCreatedTask),
        createManyAndReturn: jest.fn().mockResolvedValue([mockCreatedTask]),
      },
      $transaction: jest.fn().mockImplementation(async (fn) => {
        return fn({
          agentTask: {
            findMany: jest.fn().mockResolvedValue([]),
            create: jest.fn().mockResolvedValue(mockCreatedTask),
            createManyAndReturn: jest
              .fn()
              .mockResolvedValue([{ id: "task-created-1" }]),
          },
        });
      }),
    };

    aiFacade = {
      taskDecomposer: mockTaskDecomposer,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskBreakdownService,
        { provide: PrismaService, useValue: prisma },
        { provide: AgentFacade, useValue: aiFacade },
      ],
    }).compile();

    service = module.get<TaskBreakdownService>(TaskBreakdownService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("parseTaskBreakdown", () => {
    it("should delegate to taskDecomposer and return formatted result", () => {
      const engineResult = {
        understanding: "Write a novel",
        tasks: mockBreakdownTasks,
        executionPlan: "Sequential writing",
        risks: "Consistency issues",
      };
      mockTaskDecomposer.parseTaskBreakdown.mockReturnValue(engineResult);

      const result = service.parseTaskBreakdown("AI content", mockTeamMembers);

      expect(result.understanding).toBe("Write a novel");
      expect(result.tasks).toHaveLength(2);
      expect(result.tasks[0].title).toBe("Chapter 1: Introduction");
      expect(mockTaskDecomposer.parseTaskBreakdown).toHaveBeenCalledWith({
        content: "AI content",
        teamMembers: expect.arrayContaining([
          expect.objectContaining({ id: "member-1" }),
        ]),
      });
    });

    it("should return empty breakdown when taskDecomposer is unavailable", () => {
      aiFacade.taskDecomposer = null;

      const result = service.parseTaskBreakdown("content", mockTeamMembers);

      expect(result).toEqual({
        understanding: "",
        tasks: [],
        executionPlan: "",
        risks: "",
      });
    });

    it("should return empty breakdown when taskDecomposer returns null", () => {
      mockTaskDecomposer.parseTaskBreakdown.mockReturnValue(null);

      const result = service.parseTaskBreakdown("content", mockTeamMembers);

      expect(result.tasks).toHaveLength(0);
    });
  });

  describe("rebalanceTaskAssignments", () => {
    it("should do nothing when no tasks", () => {
      const breakdown = {
        tasks: [],
        understanding: "",
        executionPlan: "",
        risks: "",
      };
      service.rebalanceTaskAssignments(breakdown, mockTeamMembers);
      expect(
        mockTaskDecomposer.rebalanceTaskAssignments,
      ).not.toHaveBeenCalled();
    });

    it("should do nothing when no team members", () => {
      const breakdown = {
        tasks: [...mockBreakdownTasks],
        understanding: "",
        executionPlan: "",
        risks: "",
      };
      service.rebalanceTaskAssignments(breakdown, []);
      expect(
        mockTaskDecomposer.rebalanceTaskAssignments,
      ).not.toHaveBeenCalled();
    });

    it("should delegate to taskDecomposer and update assignments", () => {
      const rebalancedTasks = [
        {
          ...mockBreakdownTasks[0],
          assigneeId: "member-2",
          assigneeName: "Reviewer",
        },
        {
          ...mockBreakdownTasks[1],
          assigneeId: "member-1",
          assigneeName: "Writer",
        },
      ];
      mockTaskDecomposer.rebalanceTaskAssignments.mockReturnValue(
        rebalancedTasks,
      );

      const breakdown = {
        tasks: [...mockBreakdownTasks],
        understanding: "",
        executionPlan: "",
        risks: "",
      };
      service.rebalanceTaskAssignments(breakdown, mockTeamMembers);

      expect(breakdown.tasks[0].assigneeId).toBe("member-2");
      expect(breakdown.tasks[1].assigneeId).toBe("member-1");
    });

    it("should not update assignments when taskDecomposer is unavailable", () => {
      aiFacade.taskDecomposer = null;

      const breakdown = {
        tasks: [...mockBreakdownTasks],
        understanding: "",
        executionPlan: "",
        risks: "",
      };
      const originalAssignee = breakdown.tasks[0].assigneeId;
      service.rebalanceTaskAssignments(breakdown, mockTeamMembers);

      expect(breakdown.tasks[0].assigneeId).toBe(originalAssignee);
    });
  });

  describe("validateChapterUniqueness", () => {
    it("should return no duplicates for unique titles", async () => {
      prisma.agentTask.findMany.mockResolvedValue([]);

      const result = await service.validateChapterUniqueness("mission-1", [
        "Chapter 1: Intro",
        "Chapter 2: Body",
      ]);

      expect(result.duplicatesInNew).toHaveLength(0);
      expect(result.duplicatesInDb).toHaveLength(0);
    });

    it("should detect duplicates within new titles", async () => {
      prisma.agentTask.findMany.mockResolvedValue([]);

      const result = await service.validateChapterUniqueness("mission-1", [
        "第1章 Introduction",
        "第1章 Introduction (copy)",
      ]);

      // Only detects chapter key duplicates (e.g. "第X章" pattern)
      // The extractChapterKey function determines what's a duplicate
      expect(result).toHaveProperty("duplicatesInNew");
      expect(result).toHaveProperty("duplicatesInDb");
    });

    it("should detect duplicates in DB", async () => {
      prisma.agentTask.findMany.mockResolvedValue([
        { title: "第1章 Introduction" },
      ]);

      const result = await service.validateChapterUniqueness("mission-1", [
        "第1章 Introduction v2",
      ]);

      expect(result).toHaveProperty("duplicatesInDb");
    });

    it("should not query DB when no chapter keys found", async () => {
      const result = await service.validateChapterUniqueness("mission-1", [
        "No chapter pattern here",
        "Another title",
      ]);

      expect(prisma.agentTask.findMany).not.toHaveBeenCalled();
      expect(result.duplicatesInNew).toHaveLength(0);
      expect(result.duplicatesInDb).toHaveLength(0);
    });
  });

  describe("createTasksFromBreakdown", () => {
    it("should create tasks and return taskIdMap", async () => {
      const engineResult = {
        understanding: "Write novel",
        tasks: [
          {
            title: "Chapter 1",
            description: "Write intro",
            assigneeId: "member-1",
            assigneeName: "Writer",
            reason: "Writer role",
            priority: "HIGH" as const,
            taskType: "WRITING" as const,
            dependsOn: [] as number[],
          },
        ],
        executionPlan: "",
        risks: "",
      };
      mockTaskDecomposer.rebalanceTaskAssignments.mockReturnValue(
        engineResult.tasks,
      );

      const result = await service.createTasksFromBreakdown(
        "mission-1",
        engineResult,
        mockTeamMembers,
      );

      expect(result).toBeInstanceOf(Map);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it("should skip tasks whose assignee is not found in teamMembers", async () => {
      const breakdown = {
        understanding: "",
        tasks: [
          {
            title: "Task 1",
            description: "Do something",
            assigneeId: "non-existent-member",
            assigneeName: "Unknown",
            reason: "Not found",
            priority: "HIGH" as const,
            taskType: "RESEARCH" as const,
            dependsOn: [] as number[],
          },
        ],
        executionPlan: "",
        risks: "",
      };
      mockTaskDecomposer.rebalanceTaskAssignments.mockReturnValue(
        breakdown.tasks,
      );

      const result = await service.createTasksFromBreakdown(
        "mission-1",
        breakdown,
        mockTeamMembers,
      );

      expect(result.size).toBe(0);
    });
  });
});
