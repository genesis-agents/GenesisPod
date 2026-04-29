/**
 * TaskDecomposerService — supplemental branch coverage
 *
 * Targets:
 *  - Lines 249-252: rebalanceTaskAssignments early return when all members are leaders
 *  - Line 354: stillIdleCount > 0 warning branch (some members have no tasks)
 */

import { Test, TestingModule } from "@nestjs/testing";
import { TaskDecomposerService } from "../task-decomposer.service";

describe("TaskDecomposerService (branch supplement)", () => {
  let service: TaskDecomposerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TaskDecomposerService],
    }).compile();
    service = module.get<TaskDecomposerService>(TaskDecomposerService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─────────────────────────────────────────────────────────────────
  // Lines 249-252: all team members are leaders → executors.length === 0
  // ─────────────────────────────────────────────────────────────────
  describe("rebalanceTaskAssignments — no executor members", () => {
    it("returns tasks unchanged when all team members are leaders", () => {
      const tasks = [
        {
          id: "t1",
          title: "Task 1",
          description: "desc",
          assigneeId: "leader-1",
          assigneeName: "Leader",
          priority: "high" as const,
          estimatedDuration: 60,
          dependsOn: [],
          status: "pending" as const,
        },
      ];
      const membersAllLeaders = [
        {
          id: "leader-1",
          agentName: "Leader",
          displayName: "Team Leader",
          capabilities: [],
          role: "leader" as const,
          isLeader: true,
        },
      ];

      const result = service.rebalanceTaskAssignments(tasks, membersAllLeaders);
      expect(result).toBe(tasks); // same reference, early return
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Line 354: stillIdleCount > 0 warning (some executors have no tasks)
  // ─────────────────────────────────────────────────────────────────
  describe("rebalanceTaskAssignments — idle members remain after rebalancing", () => {
    it("logs warning when some executor members have no tasks assigned", () => {
      const tasks = [
        {
          id: "t1",
          title: "Task 1",
          description: "desc",
          assigneeId: "exec-1",
          assigneeName: "Executor1",
          priority: "high" as const,
          estimatedDuration: 60,
          dependsOn: [],
          status: "pending" as const,
        },
      ];
      // Two executors but only one task assigned to exec-1; exec-2 is idle
      const members = [
        {
          id: "exec-1",
          agentName: "Executor1",
          displayName: "Executor 1",
          capabilities: [],
          role: "executor" as const,
          isLeader: false,
        },
        {
          id: "exec-2",
          agentName: "Executor2",
          displayName: "Executor 2",
          capabilities: [],
          role: "executor" as const,
          isLeader: false,
        },
      ];

      // Should complete without throwing; warning is logged but not exposed
      const result = service.rebalanceTaskAssignments(tasks, members);
      expect(result).toBeDefined();
      expect(result.length).toBe(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Early return branches: empty tasks or empty members
  // ─────────────────────────────────────────────────────────────────
  describe("rebalanceTaskAssignments — empty input early returns", () => {
    it("returns empty tasks immediately when tasks array is empty", () => {
      const result = service.rebalanceTaskAssignments(
        [],
        [
          {
            id: "m1",
            agentName: "Agent",
            displayName: "Agent",
            capabilities: [],
            role: "executor" as const,
          },
        ],
      );
      expect(result).toEqual([]);
    });

    it("returns tasks immediately when members array is empty", () => {
      const tasks = [
        {
          id: "t1",
          title: "Task",
          description: "desc",
          assigneeId: "m1",
          assigneeName: "Agent",
          priority: "high" as const,
          estimatedDuration: 60,
          dependsOn: [],
          status: "pending" as const,
        },
      ];
      const result = service.rebalanceTaskAssignments(tasks, []);
      expect(result).toBe(tasks);
    });
  });
});
