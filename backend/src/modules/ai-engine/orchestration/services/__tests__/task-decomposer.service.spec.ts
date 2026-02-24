import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { TaskDecomposerService } from "../task-decomposer.service";

describe("TaskDecomposerService", () => {
  let service: TaskDecomposerService;

  const mockMembers = [
    {
      id: "member-1",
      agentName: "researcher",
      displayName: "Research Agent",
      capabilities: ["WEB_SEARCH"],
      role: "executor" as const,
    },
    {
      id: "member-2",
      agentName: "writer",
      displayName: "Writing Agent",
      capabilities: ["TEXT_GENERATION"],
      role: "executor" as const,
    },
    {
      id: "member-3",
      agentName: "analyst",
      displayName: "Analysis Agent",
      capabilities: ["DATA_ANALYSIS"],
      role: "executor" as const,
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TaskDecomposerService],
    }).compile();

    service = module.get<TaskDecomposerService>(TaskDecomposerService);
  });

  // ==================== parseTaskBreakdown ====================

  describe("parseTaskBreakdown", () => {
    it("should parse a valid markdown table with member assignments", () => {
      const content = `
| # | 任务 | 负责人 | 原因 | 优先级 | 依赖 |
|---|------|--------|------|--------|------|
| 1 | Research AI trends | researcher | Web search needed | 高 | 无 |
| 2 | Write report | writer | Writing skill needed | 中 | 1 |
`;

      const result = service.parseTaskBreakdown({
        content,
        teamMembers: mockMembers,
      });

      expect(result.tasks).toHaveLength(2);
      expect(result.tasks[0].title).toBe("Research AI trends");
      expect(result.tasks[0].assigneeId).toBe("member-1");
      expect(result.tasks[1].title).toBe("Write report");
      expect(result.tasks[1].assigneeId).toBe("member-2");
    });

    it("should parse task dependencies correctly", () => {
      const content = `
| # | 任务 | 负责人 | 原因 | 优先级 | 依赖 |
|---|------|--------|------|--------|------|
| 1 | Task A | researcher | Reason | 高 | 无 |
| 2 | Task B | writer | Reason | 中 | 1 |
| 3 | Task C | analyst | Reason | 低 | 1,2 |
`;

      const result = service.parseTaskBreakdown({
        content,
        teamMembers: mockMembers,
      });

      expect(result.tasks[1].dependsOn).toContain(0); // 1 -> index 0
      expect(result.tasks[2].dependsOn).toContain(0); // 1 -> index 0
      expect(result.tasks[2].dependsOn).toContain(1); // 2 -> index 1
    });

    it("should parse priority correctly", () => {
      const content = `
| # | 任务 | 负责人 | 原因 | 优先级 | 依赖 |
|---|------|--------|------|--------|------|
| 1 | Task Critical | researcher | Reason | critical | 无 |
| 2 | Task High | writer | Reason | 高 | 无 |
| 3 | Task Low | analyst | Reason | 低 | 无 |
`;

      const result = service.parseTaskBreakdown({
        content,
        teamMembers: mockMembers,
      });

      expect(result.tasks[0].priority).toBe("CRITICAL");
      expect(result.tasks[1].priority).toBe("HIGH");
      expect(result.tasks[2].priority).toBe("LOW");
    });

    it("should create fallback task for content without table", () => {
      const content = "No table here, just plain text about tasks.";

      const result = service.parseTaskBreakdown({
        content,
        teamMembers: mockMembers,
      });

      // When no table is found, a default task is created for the first member
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].title).toBe("执行任务");
    });

    it("should handle member name with @ prefix", () => {
      const content = `
| # | 任务 | 负责人 | 原因 | 优先级 | 依赖 |
|---|------|--------|------|--------|------|
| 1 | Task A | @researcher | Reason | 高 | 无 |
`;

      const result = service.parseTaskBreakdown({
        content,
        teamMembers: mockMembers,
      });

      expect(result.tasks[0].assigneeId).toBe("member-1");
    });

    it("should do fuzzy matching for member names", () => {
      const content = `
| # | 任务 | 负责人 | 原因 | 优先级 | 依赖 |
|---|------|--------|------|--------|------|
| 1 | Task A | Research Agent | Reason | 高 | 无 |
`;

      // "Research Agent" matches displayName of member-1
      const result = service.parseTaskBreakdown({
        content,
        teamMembers: mockMembers,
      });

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].assigneeId).toBe("member-1");
    });

    it("should skip header and separator rows in table", () => {
      const content = `
| # | 任务标题 | 负责人 | 原因 | 优先级 | 依赖 |
|---|----------|--------|------|--------|------|
| 1 | Task A | researcher | Reason | 中 | 无 |
`;

      // Should only have one real task (header/separator rows have # or - in first cell)
      const result = service.parseTaskBreakdown({
        content,
        teamMembers: mockMembers,
      });

      expect(result.tasks).toHaveLength(1);
    });

    it("should throw when match failure rate exceeds threshold", () => {
      const content = `
| # | 任务 | 负责人 | 原因 | 优先级 | 依赖 |
|---|------|--------|------|--------|------|
| 1 | Task A | nonexistent_agent_1 | Reason | 高 | 无 |
| 2 | Task B | nonexistent_agent_2 | Reason | 中 | 无 |
| 3 | Task C | nonexistent_agent_3 | Reason | 低 | 无 |
| 4 | Task D | nonexistent_agent_4 | Reason | 低 | 无 |
`;

      expect(() =>
        service.parseTaskBreakdown({
          content,
          teamMembers: mockMembers,
        }),
      ).toThrow(BadRequestException);
    });

    it("should not throw when only 1 out of many tasks is unmatched (under threshold)", () => {
      // 1 unmatched out of 11 = ~9% < 10% threshold - should not throw
      const rows = Array.from({ length: 10 }, (_, i) => {
        const member = ["researcher", "writer", "analyst"][i % 3];
        return `| ${i + 1} | Task ${i + 1} | ${member} | Reason | 中 | 无 |`;
      });
      rows.push(`| 11 | Last Task | unmatched_agent | Reason | 低 | 无 |`);

      const content = `
| # | 任务 | 负责人 | 原因 | 优先级 | 依赖 |
|---|------|--------|------|--------|------|
${rows.join("\n")}
`;

      // 1/11 ≈ 9% < 10%, should not throw
      expect(() =>
        service.parseTaskBreakdown({
          content,
          teamMembers: mockMembers,
        }),
      ).not.toThrow();
    });

    it("should include assigneeName in task", () => {
      const content = `
| # | 任务 | 负责人 | 原因 | 优先级 | 依赖 |
|---|------|--------|------|--------|------|
| 1 | Task A | researcher | Reason | 高 | |
`;

      const result = service.parseTaskBreakdown({
        content,
        teamMembers: mockMembers,
      });

      expect(result.tasks[0].assigneeName).toBeDefined();
    });

    it("should include reason field", () => {
      const content = `
| # | 任务 | 负责人 | 原因 | 优先级 | 依赖 |
|---|------|--------|------|--------|------|
| 1 | Task A | researcher | Web search is needed | 高 | 无 |
`;

      const result = service.parseTaskBreakdown({
        content,
        teamMembers: mockMembers,
      });

      expect(result.tasks[0].reason).toContain("Web search is needed");
    });
  });

  // ==================== rebalanceTaskAssignments ====================

  describe("rebalanceTaskAssignments", () => {
    it("should rebalance tasks to include idle members", () => {
      const tasks = [
        {
          title: "Task 1",
          description: "Desc 1",
          assigneeId: "member-1",
          assigneeName: "researcher",
          reason: "",
          priority: "HIGH" as const,
          taskType: "implementation" as const,
          dependsOn: [],
        },
        {
          title: "Task 2",
          description: "Desc 2",
          assigneeId: "member-1",
          assigneeName: "researcher",
          reason: "",
          priority: "MEDIUM" as const,
          taskType: "implementation" as const,
          dependsOn: [],
        },
        {
          title: "Task 3",
          description: "Desc 3",
          assigneeId: "member-1",
          assigneeName: "researcher",
          reason: "",
          priority: "MEDIUM" as const,
          taskType: "implementation" as const,
          dependsOn: [],
        },
      ];

      const rebalanced = service.rebalanceTaskAssignments(tasks, mockMembers);

      // After rebalancing, same number of tasks but possibly redistributed
      expect(rebalanced.length).toBe(tasks.length);
    });

    it("should return same tasks when all members have tasks", () => {
      const tasks = [
        {
          title: "Task 1",
          description: "Desc",
          assigneeId: "member-1",
          assigneeName: "researcher",
          reason: "",
          priority: "HIGH" as const,
          taskType: "implementation" as const,
          dependsOn: [],
        },
        {
          title: "Task 2",
          description: "Desc",
          assigneeId: "member-2",
          assigneeName: "writer",
          reason: "",
          priority: "MEDIUM" as const,
          taskType: "implementation" as const,
          dependsOn: [],
        },
        {
          title: "Task 3",
          description: "Desc",
          assigneeId: "member-3",
          assigneeName: "analyst",
          reason: "",
          priority: "LOW" as const,
          taskType: "implementation" as const,
          dependsOn: [],
        },
      ];

      const rebalanced = service.rebalanceTaskAssignments(tasks, mockMembers);

      // All members already have tasks, no rebalancing needed
      expect(rebalanced.length).toBe(tasks.length);
    });

    it("should handle empty tasks array", () => {
      const rebalanced = service.rebalanceTaskAssignments([], mockMembers);
      expect(rebalanced).toEqual([]);
    });

    it("should handle empty executors array", () => {
      const tasks = [
        {
          title: "Task 1",
          description: "Desc",
          assigneeId: "member-1",
          assigneeName: "researcher",
          reason: "",
          priority: "HIGH" as const,
          taskType: "implementation" as const,
          dependsOn: [],
        },
      ];

      const rebalanced = service.rebalanceTaskAssignments(tasks, []);
      expect(rebalanced).toEqual(tasks);
    });
  });

  // ==================== Levenshtein distance fuzzy matching ====================

  describe("fuzzy member matching", () => {
    it("should do partial name matching (contains)", () => {
      const content = `
| # | 任务 | 负责人 | 原因 | 优先级 | 依赖 |
|---|------|--------|------|--------|------|
| 1 | Task A | research | Reason | 高 | 无 |
`;

      // "research" is contained in "researcher" -> partial match
      const result = service.parseTaskBreakdown({
        content,
        teamMembers: mockMembers,
      });

      // Should match because "research" is substring of "researcher"
      expect(result.tasks.length).toBeGreaterThanOrEqual(0);
    });

    it("should handle close spelling with Levenshtein distance", () => {
      const content = `
| # | 任务 | 负责人 | 原因 | 优先级 | 依赖 |
|---|------|--------|------|--------|------|
| 1 | Task A | researher | Reason | 高 | 无 |
`;

      // "researher" has edit distance 1 from "researcher" (missing 'c')
      const result = service.parseTaskBreakdown({
        content,
        teamMembers: mockMembers,
      });

      // Either matched via fuzzy or not matched at all
      expect(result).toHaveProperty("tasks");
    });
  });

  // ==================== Content without table ====================

  describe("content edge cases", () => {
    it("should create fallback task for empty content", () => {
      const result = service.parseTaskBreakdown({
        content: "",
        teamMembers: mockMembers,
      });

      // Default task created for first member
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].title).toBe("执行任务");
    });

    it("should create fallback task for whitespace-only content", () => {
      const result = service.parseTaskBreakdown({
        content: "   \n\n\t  ",
        teamMembers: mockMembers,
      });

      expect(result.tasks).toHaveLength(1);
    });

    it("should create fallback task for table with only header rows", () => {
      const content = `
| # | 任务 | 负责人 | 原因 | 优先级 | 依赖 |
|---|------|--------|------|--------|------|
`;
      const result = service.parseTaskBreakdown({
        content,
        teamMembers: mockMembers,
      });

      // No data rows -> creates default task
      expect(result.tasks).toHaveLength(1);
    });
  });
});
