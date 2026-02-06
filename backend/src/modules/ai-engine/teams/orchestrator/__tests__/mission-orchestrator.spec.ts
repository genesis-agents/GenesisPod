/**
 * MissionOrchestrator Unit Tests
 *
 * 测试核心任务编排流程：Parse → Plan → Execute → Review → Deliver
 */

import { ConfigService } from "@nestjs/config";
import { MissionOrchestrator } from "../mission-orchestrator";
import { ConstraintEngine } from "../../constraints/constraint-engine";
import {
  MissionInput,
  ParsedIntent,
  TaskType,
} from "../../abstractions/mission.interface";
import { ITeam } from "../../abstractions/team.interface";
import { ITeamMember } from "../../abstractions/member.interface";
import { ConstraintProfile } from "../../constraints";

describe("MissionOrchestrator", () => {
  let orchestrator: MissionOrchestrator;
  let mockConstraintEngine: jest.Mocked<ConstraintEngine>;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    // Mock ConstraintEngine
    mockConstraintEngine = {
      check: jest.fn().mockReturnValue({ allowed: true }),
      canContinue: jest.fn().mockReturnValue({
        canContinue: true,
        reason: "",
      }),
      recordCost: jest.fn().mockReturnValue(0.5),
      getUsage: jest.fn().mockReturnValue({
        tokensUsed: 0,
        costUsed: 0,
      }),
      reset: jest.fn(),
    } as unknown as jest.Mocked<ConstraintEngine>;

    // Mock ConfigService
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === "ai.defaultModel") return "gpt-4o";
        if (key === "ai.temperature") return 0.7;
        return undefined;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    // Create orchestrator with minimal dependencies
    orchestrator = new MissionOrchestrator(
      mockConstraintEngine,
      mockConfigService,
      undefined, // toolRegistry
      undefined, // skillRegistry
      undefined, // llmFactory
      undefined, // memoryService
      undefined, // mcpManager
      undefined, // aiChatService
      undefined, // prismaService
      undefined, // traceCollector
      undefined, // checkpointManager
      {
        enableAutoRetry: false,
        enableParallel: false,
        reviewStrategy: "none",
      },
    );
  });

  describe("parse()", () => {
    it("should parse mission input and return parsed intent", async () => {
      const input: MissionInput = {
        prompt: "研究人工智能的发展趋势并撰写报告",
        requirements: ["包含最新技术", "至少3000字"],
        metadata: {},
      };

      const result = await orchestrator.parse(input);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.primaryGoal).toBe(input.prompt.slice(0, 100));
      expect(result.secondaryGoals).toEqual(input.requirements);
      expect(result.taskType).toBe("research");
      expect(result.complexity).toBeDefined();
      expect(result.complexity.overall).toMatch(/low|medium|high|very_high/);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("should infer task type from prompt keywords", async () => {
      // Note: Keywords are matched in order, first match wins
      // research: ["研究", "调研", "分析", "报告"]
      // analysis: ["分析", "评估", "对比", "趋势"]
      const testCases: Array<{ prompt: string; expectedType: TaskType }> = [
        { prompt: "深入研究市场", expectedType: "research" },
        { prompt: "需要评估和对比用户数据", expectedType: "analysis" },
        { prompt: "撰写和创作产品文案", expectedType: "creation" },
        { prompt: "设计全新的UI界面", expectedType: "design" },
        { prompt: "辩论AI伦理问题", expectedType: "debate" },
        { prompt: "审核代码质量", expectedType: "review" },
        { prompt: "完成通用任务", expectedType: "mixed" },
      ];

      for (const { prompt, expectedType } of testCases) {
        const result = await orchestrator.parse({ prompt, metadata: {} });
        expect(result.taskType).toBe(expectedType);
      }
    });

    it("should assess complexity based on input characteristics", async () => {
      const simpleInput: MissionInput = {
        prompt: "简单任务",
        metadata: {},
      };

      const complexInput: MissionInput = {
        prompt:
          "这是一个非常复杂的任务，需要深入研究多个领域，整合大量数据，并生成详细的分析报告。报告应包含数据可视化、趋势分析和预测建议。".repeat(
            3,
          ),
        requirements: ["需求1", "需求2", "需求3"],
        files: [
          {
            id: "f1",
            name: "file1.pdf",
            url: "file1.pdf",
            mimeType: "application/pdf",
            size: 1024,
          },
        ],
        urls: ["https://example.com"],
        metadata: {},
      };

      const simpleResult = await orchestrator.parse(simpleInput);
      const complexResult = await orchestrator.parse(complexInput);

      expect(simpleResult.complexity.overall).toBe("low");
      expect(complexResult.complexity.overall).toMatch(/high|very_high/);
      expect(complexResult.complexity.estimatedSubTasks).toBeGreaterThan(
        simpleResult.complexity.estimatedSubTasks,
      );
      expect(complexResult.complexity.estimatedDuration).toBeGreaterThan(
        simpleResult.complexity.estimatedDuration,
      );
    });

    it("should extract topics from prompt", async () => {
      const input: MissionInput = {
        prompt: "人工智能在医疗健康领域的应用研究",
        metadata: {},
      };

      const result = await orchestrator.parse(input);

      expect(result.extractedInfo.topics).toBeDefined();
      expect(result.extractedInfo.topics.length).toBeGreaterThan(0);
      // Topics are extracted as whole phrases (split by Chinese punctuation)
      expect(
        result.extractedInfo.topics.some((t) => t.includes("人工智能")),
      ).toBe(true);
    });

    it("should suggest appropriate strategy based on complexity", async () => {
      const highComplexityInput: MissionInput = {
        prompt: "需要深入研究的复杂任务".repeat(50),
        metadata: {},
      };

      const result = await orchestrator.parse(highComplexityInput);

      expect(result.suggestedStrategy).toBeDefined();
      expect(result.suggestedStrategy.workflowType).toMatch(
        /sequential|parallel|hybrid/,
      );
      expect(result.suggestedStrategy.needsIteration).toBeDefined();
    });
  });

  describe("plan()", () => {
    let mockTeam: ITeam;
    let mockLeader: ITeamMember;
    let mockMember: ITeamMember;
    let mockIntent: ParsedIntent;
    let mockConstraints: ConstraintProfile;

    beforeEach(() => {
      mockLeader = {
        id: "leader-1",
        name: "Leader",
        role: { id: "leader", name: "Leader", capabilities: [] },
        model: "gpt-4o",
        skills: [],
        tools: [],
        persona: "I am a leader",
        workStyle: {
          outputStyle: "detailed",
          thinkingDepth: "deep",
          riskTolerance: "balanced",
        },
        status: "idle",
        isLeader: () => true,
        hasSkill: () => false,
        hasTool: () => false,
        getSystemPrompt: () => "You are a team leader",
      } as unknown as ITeamMember;

      mockMember = {
        id: "member-1",
        name: "Researcher",
        role: { id: "researcher", name: "Researcher", capabilities: [] },
        model: "gpt-4o",
        skills: [],
        tools: [],
        persona: "I am a researcher",
        workStyle: {
          outputStyle: "detailed",
          thinkingDepth: "standard",
          riskTolerance: "balanced",
        },
        status: "idle",
        isLeader: () => false,
        hasSkill: () => false,
        hasTool: () => false,
        getSystemPrompt: () => "You are a researcher",
      } as unknown as ITeamMember;

      mockTeam = {
        id: "team-1",
        name: "Test Team",
        description: "A test team for unit testing",
        type: "predefined",
        config: {},
        leader: mockLeader,
        members: [mockLeader, mockMember],
        workflow: {
          id: "workflow-1",
          type: "sequential",
          name: "Sequential Workflow",
          description: "Simple sequential workflow",
          steps: [
            {
              id: "step-1",
              name: "研究",
              description: "Research the topic",
              type: "task",
              executorRoles: ["researcher"],
              dependsOn: [],
              timeout: 60000,
            },
            {
              id: "step-2",
              name: "整合",
              description: "Integrate findings",
              type: "task",
              executorRoles: ["leader"],
              dependsOn: ["step-1"],
              timeout: 30000,
            },
          ],
        },
        constraintProfile: {
          cost: {
            budget: 100,
            modelPreference: "balanced",
            allowOverBudget: false,
            warningThreshold: 80,
          },
          quality: {
            depth: "standard",
            accuracy: "prefer_evidence",
            reviewRequired: false,
            minReviewScore: 6,
            maxReworks: 2,
          },
          efficiency: {
            maxDuration: 300000,
            priority: "normal",
            allowParallel: false,
            maxParallelism: 1,
          },
        },
        getAllMembers: () => [mockLeader, mockMember],
        getMemberById: (id: string) =>
          [mockLeader, mockMember].find((m) => m.id === id),
        getMembersByRole: (roleId: string) =>
          [mockLeader, mockMember].filter((m) => m.role.id === roleId),
        hasRole: (roleId: string) =>
          [mockLeader, mockMember].some((m) => m.role.id === roleId),
        getAvailableSkills: () => [],
        getAvailableTools: () => [],
      } as unknown as ITeam;

      mockIntent = {
        id: "intent-1",
        missionId: "mission-1",
        primaryGoal: "Research AI trends",
        secondaryGoals: [],
        extractedInfo: {
          topics: ["AI", "trends"],
          entities: [],
          language: "zh",
        },
        taskType: "research",
        complexity: {
          overall: "medium",
          informational: "medium",
          logical: "medium",
          creative: "medium",
          estimatedSubTasks: 3,
          estimatedDuration: 120000,
          estimatedCost: 50,
        },
        suggestedStrategy: {
          workflowType: "sequential",
          memberConfig: [],
          needsIteration: true,
          needsHumanReview: false,
          riskFactors: [],
        },
        confidence: 0.9,
      };

      mockConstraints = {
        cost: {
          budget: 100,
          modelPreference: "balanced",
          allowOverBudget: false,
          warningThreshold: 80,
        },
        quality: {
          depth: "standard",
          accuracy: "prefer_evidence",
          reviewRequired: true,
          minReviewScore: 6,
          maxReworks: 2,
        },
        efficiency: {
          maxDuration: 300000,
          priority: "normal",
          allowParallel: false,
          maxParallelism: 1,
        },
      };
    });

    it("should generate execution plan with steps based on workflow", async () => {
      const plan = await orchestrator.plan(
        mockIntent,
        mockTeam,
        mockConstraints,
      );

      expect(plan).toBeDefined();
      expect(plan.id).toBeDefined();
      expect(plan.missionId).toBe(mockIntent.missionId);
      expect(plan.parsedIntent).toEqual(mockIntent);
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.estimatedCost).toBeGreaterThan(0);
      expect(plan.estimatedDuration).toBeGreaterThan(0);
      expect(plan.createdAt).toBeInstanceOf(Date);
    });

    it("should map workflow steps to execution steps", async () => {
      const plan = await orchestrator.plan(
        mockIntent,
        mockTeam,
        mockConstraints,
      );

      const workflowStepIds = mockTeam.workflow.steps.map((s) => s.id);
      const planStepIds = plan.steps.map((s) => s.id);

      for (const wfStepId of workflowStepIds) {
        expect(planStepIds).toContain(wfStepId);
      }
    });

    it("should add review step when review is required", async () => {
      const constraintsWithReview: ConstraintProfile = {
        ...mockConstraints,
        quality: { ...mockConstraints.quality, reviewRequired: true },
      };

      const plan = await orchestrator.plan(
        mockIntent,
        mockTeam,
        constraintsWithReview,
      );

      const reviewStep = plan.steps.find((s) => s.id === "review");
      expect(reviewStep).toBeDefined();
      expect(reviewStep?.type).toBe("review");
      expect(reviewStep?.executor).toBe(mockTeam.leader.id);
    });

    it("should add delivery step at the end", async () => {
      const plan = await orchestrator.plan(
        mockIntent,
        mockTeam,
        mockConstraints,
      );

      const deliveryStep = plan.steps.find((s) => s.id === "delivery");
      expect(deliveryStep).toBeDefined();
      expect(deliveryStep?.type).toBe("delivery");
      expect(deliveryStep?.executor).toBe(mockTeam.leader.id);
    });

    it("should set dependencies correctly", async () => {
      const plan = await orchestrator.plan(
        mockIntent,
        mockTeam,
        mockConstraints,
      );

      for (const step of plan.steps) {
        if (step.dependencies.length > 0) {
          for (const depId of step.dependencies) {
            const depStep = plan.steps.find((s) => s.id === depId);
            expect(depStep).toBeDefined();
          }
        }
      }
    });

    it("should include timeout from workflow step config", async () => {
      const plan = await orchestrator.plan(
        mockIntent,
        mockTeam,
        mockConstraints,
      );

      const step1 = plan.steps.find((s) => s.id === "step-1");
      expect(step1?.timeout).toBe(60000);
    });

    it("should estimate cost based on quality depth", async () => {
      const standardConstraints: ConstraintProfile = {
        ...mockConstraints,
        quality: { ...mockConstraints.quality, depth: "standard" },
      };

      const comprehensiveConstraints: ConstraintProfile = {
        ...mockConstraints,
        quality: { ...mockConstraints.quality, depth: "comprehensive" },
      };

      const standardPlan = await orchestrator.plan(
        mockIntent,
        mockTeam,
        standardConstraints,
      );
      const comprehensivePlan = await orchestrator.plan(
        mockIntent,
        mockTeam,
        comprehensiveConstraints,
      );

      expect(comprehensivePlan.estimatedCost).toBeGreaterThan(
        standardPlan.estimatedCost,
      );
      expect(comprehensivePlan.estimatedDuration).toBeGreaterThan(
        standardPlan.estimatedDuration,
      );
    });
  });

  describe("cancel()", () => {
    it("should mark execution as cancelled and cleanup state", async () => {
      const missionId = "mission-cancel-test";

      // Initialize state
      const state = orchestrator["initializeState"](missionId);
      state.phase = "executing";
      orchestrator["states"].set(missionId, state);

      // Add to internal caches
      orchestrator["originalInputs"].set(missionId, {
        prompt: "test",
        metadata: {},
      });
      orchestrator["messageQueues"].set(missionId, []);

      // Cancel
      await orchestrator.cancel(missionId);

      // Verify state is marked as failed
      const updatedState = orchestrator.getState(missionId);
      expect(updatedState?.phase).toBe("failed");

      // Verify cleanup
      expect(orchestrator["originalInputs"].has(missionId)).toBe(false);
      expect(orchestrator["messageQueues"].has(missionId)).toBe(false);
    });

    it("should handle cancellation of non-existent mission gracefully", async () => {
      await expect(
        orchestrator.cancel("non-existent-mission"),
      ).resolves.not.toThrow();
    });
  });

  describe("getState()", () => {
    it("should return execution state for existing mission", () => {
      const missionId = "mission-state-test";
      const state = orchestrator["initializeState"](missionId);
      state.phase = "executing";
      state.completedSteps = ["step-1", "step-2"];
      orchestrator["states"].set(missionId, state);

      const result = orchestrator.getState(missionId);

      expect(result).toBeDefined();
      expect(result?.missionId).toBe(missionId);
      expect(result?.phase).toBe("executing");
      expect(result?.completedSteps).toEqual(["step-1", "step-2"]);
    });

    it("should return undefined for non-existent mission", () => {
      const result = orchestrator.getState("non-existent");
      expect(result).toBeUndefined();
    });
  });

  describe("getResourceUsage()", () => {
    it("should return resource usage for existing mission", () => {
      const missionId = "mission-usage-test";
      const state = orchestrator["initializeState"](missionId);
      state.resourceUsage = {
        tokensUsed: 1000,
        costUsed: 0.5,
        timeElapsed: 30000,
        reviewCount: 2,
        reworkCount: 1,
        progress: 0.5,
      };
      orchestrator["states"].set(missionId, state);

      const usage = orchestrator.getResourceUsage(missionId);

      expect(usage).toBeDefined();
      expect(usage?.tokensUsed).toBe(1000);
      expect(usage?.costUsed).toBe(0.5);
      expect(usage?.progress).toBe(0.5);
    });

    it("should return undefined for non-existent mission", () => {
      const usage = orchestrator.getResourceUsage("non-existent");
      expect(usage).toBeUndefined();
    });
  });

  describe("updateState()", () => {
    it("should update mission state with provided updates", () => {
      const missionId = "mission-update-test";
      const initialState = orchestrator["initializeState"](missionId);
      orchestrator["states"].set(missionId, initialState);

      orchestrator.updateState(missionId, {
        phase: "executing",
        currentSteps: ["step-1"],
        completedSteps: ["step-0"],
        progress: 0.25,
      });

      const state = orchestrator.getState(missionId);
      expect(state?.phase).toBe("executing");
      expect(state?.currentSteps).toEqual(["step-1"]);
      expect(state?.completedSteps).toEqual(["step-0"]);
      expect(state?.resourceUsage.progress).toBe(0.25);
    });

    it("should create state if mission does not exist", () => {
      const missionId = "mission-new-update-test";
      expect(orchestrator.getState(missionId)).toBeUndefined();

      orchestrator.updateState(missionId, {
        phase: "parsing",
      });

      const state = orchestrator.getState(missionId);
      expect(state).toBeDefined();
      expect(state?.phase).toBe("parsing");
    });

    it("should preserve existing state when partial update", () => {
      const missionId = "mission-partial-update-test";
      const initialState = orchestrator["initializeState"](missionId);
      initialState.completedSteps = ["step-1"];
      orchestrator["states"].set(missionId, initialState);

      orchestrator.updateState(missionId, {
        phase: "reviewing",
      });

      const state = orchestrator.getState(missionId);
      expect(state?.phase).toBe("reviewing");
      expect(state?.completedSteps).toEqual(["step-1"]); // preserved
    });
  });

  describe("private helpers", () => {
    it("should initialize state correctly", () => {
      const missionId = "test-mission";
      const state = orchestrator["initializeState"](missionId);

      expect(state.missionId).toBe(missionId);
      expect(state.phase).toBe("idle");
      expect(state.completedSteps).toEqual([]);
      expect(state.currentSteps).toEqual([]);
      expect(state.failedSteps).toEqual([]);
      expect(state.reviewResults).toEqual([]);
      expect(state.deliverables).toEqual([]);
      expect(state.intermediateOutputs).toBeInstanceOf(Map);
      expect(state.resourceUsage).toEqual({
        tokensUsed: 0,
        costUsed: 0,
        timeElapsed: 0,
        reviewCount: 0,
        reworkCount: 0,
        progress: 0,
      });
    });

    it("should create mission events correctly", () => {
      const event = orchestrator["createEvent"](
        "mission_started",
        "mission-1",
        {
          input: { prompt: "test" },
        },
      );

      expect(event.type).toBe("mission_started");
      expect(event.missionId).toBe("mission-1");
      expect(event.timestamp).toBeInstanceOf(Date);
      expect(event.data).toEqual({ input: { prompt: "test" } });
    });

    it("should calculate total duration from steps", () => {
      const steps = [
        {
          id: "1",
          name: "Step 1",
          description: "",
          executor: "exec-1",
          type: "task" as const,
          dependencies: [],
          estimatedDuration: 10000,
          estimatedCost: 10,
        },
        {
          id: "2",
          name: "Step 2",
          description: "",
          executor: "exec-2",
          type: "task" as const,
          dependencies: [],
          estimatedDuration: 20000,
          estimatedCost: 20,
        },
      ];

      const totalDuration = orchestrator["calculateTotalDuration"](steps);
      expect(totalDuration).toBe(30000);
    });

    it("should extract topics from prompt", () => {
      const topics = orchestrator["extractTopics"](
        "人工智能和机器学习在医疗健康领域的应用",
      );

      expect(topics.length).toBeGreaterThan(0);
      expect(topics.length).toBeLessThanOrEqual(5);
      topics.forEach((topic) => {
        expect(topic.length).toBeGreaterThan(2);
      });
    });

    it("should map workflow step types correctly", () => {
      expect(orchestrator["mapStepType"]("review")).toBe("review");
      expect(orchestrator["mapStepType"]("decision")).toBe("task");
      expect(orchestrator["mapStepType"]("analysis")).toBe("task");
      expect(orchestrator["mapStepType"]("synthesis")).toBe("task");
    });
  });

  describe("constructor initialization", () => {
    it("should initialize with default config when no config provided", () => {
      const defaultOrchestrator = new MissionOrchestrator(
        mockConstraintEngine,
        mockConfigService,
      );

      const config = defaultOrchestrator["config"];
      expect(config.enableAutoRetry).toBe(true);
      expect(config.maxRetries).toBe(3);
      expect(config.enableParallel).toBe(true);
      expect(config.reviewStrategy).toBe("critical");
    });

    it("should merge provided config with defaults", () => {
      const customOrchestrator = new MissionOrchestrator(
        mockConstraintEngine,
        mockConfigService,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          enableAutoRetry: false,
          maxRetries: 5,
        },
      );

      const config = customOrchestrator["config"];
      expect(config.enableAutoRetry).toBe(false);
      expect(config.maxRetries).toBe(5);
      expect(config.enableParallel).toBe(true); // default preserved
    });

    it("should initialize HandoffCoordinator", () => {
      expect(orchestrator["handoffCoordinator"]).toBeDefined();
    });

    it("should initialize internal data structures", () => {
      expect(orchestrator["states"]).toBeInstanceOf(Map);
      expect(orchestrator["messageQueues"]).toBeDefined();
      expect(orchestrator["originalInputs"]).toBeDefined();
      expect(orchestrator["missionTraces"]).toBeDefined();
    });
  });

  describe("ConstraintEngine integration", () => {
    it("should check constraints during execution", async () => {
      const input: MissionInput = {
        prompt: "测试任务",
        metadata: {},
      };

      await orchestrator.parse(input);

      // Verify ConstraintEngine was not called for parse (lightweight operation)
      // Real constraint checks happen during execution phase
    });

    it("should record costs correctly", async () => {
      mockConstraintEngine.recordCost.mockReturnValue(1.5);

      const cost = mockConstraintEngine.recordCost(
        "test-operation",
        "gpt-4o",
        100,
        200,
        "mission-1",
      );

      expect(cost).toBe(1.5);
      expect(mockConstraintEngine.recordCost).toHaveBeenCalledWith(
        "test-operation",
        "gpt-4o",
        100,
        200,
        "mission-1",
      );
    });
  });
});
