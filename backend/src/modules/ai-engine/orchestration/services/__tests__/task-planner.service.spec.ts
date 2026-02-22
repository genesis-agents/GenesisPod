import { Test, TestingModule } from "@nestjs/testing";
import {
  TaskPlannerService,
  CapabilityRequirement,
} from "../task-planner.service";

describe("TaskPlannerService", () => {
  let service: TaskPlannerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TaskPlannerService],
    }).compile();

    service = module.get(TaskPlannerService);
  });

  describe("buildPlan()", () => {
    it("empty requirements → fallback plan using ask module", () => {
      const plan = service.buildPlan([], "hello", 0.5);
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].module).toBe("ask");
      expect(plan.executionMode).toBe("sequential");
    });

    it("single requirement → sequential plan", () => {
      const reqs: CapabilityRequirement[] = [
        {
          module: "research",
          action: "研究 AI 趋势",
          input: "AI 2026",
          priority: 1,
        },
      ];
      const plan = service.buildPlan(reqs, "研究 AI 趋势", 0.9);
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].module).toBe("research");
      expect(plan.executionMode).toBe("sequential");
    });

    it("two phase-1 modules → parallel plan (no cross-phase deps)", () => {
      const reqs: CapabilityRequirement[] = [
        { module: "research", action: "研究", input: "AI", priority: 1 },
        { module: "ask", action: "问答", input: "AI", priority: 1 },
      ];
      const plan = service.buildPlan(reqs, "研究并问答 AI", 0.85);
      expect(plan.steps).toHaveLength(2);
      expect(plan.steps.every((s) => s.dependsOn.length === 0)).toBe(true);
      expect(plan.executionMode).toBe("parallel");
    });

    it("research + writing → writing depends on research (dag)", () => {
      const reqs: CapabilityRequirement[] = [
        { module: "research", action: "研究", input: "OpenAI o3", priority: 1 },
        {
          module: "writing",
          action: "写报告",
          input: "OpenAI o3 分析",
          priority: 2,
        },
      ];
      const plan = service.buildPlan(reqs, "研究然后写报告", 0.9);
      expect(plan.steps).toHaveLength(2);
      const researchStep = plan.steps.find((s) => s.module === "research")!;
      const writingStep = plan.steps.find((s) => s.module === "writing")!;
      expect(writingStep.dependsOn).toContain(researchStep.id);
      expect(researchStep.dependsOn).toHaveLength(0);
    });

    it("executionMode is dag when phase-1 and phase-2 mix", () => {
      const reqs: CapabilityRequirement[] = [
        { module: "research", action: "研究", input: "topic", priority: 1 },
        { module: "ask", action: "问答", input: "topic", priority: 1 },
        { module: "writing", action: "写作", input: "topic", priority: 2 },
      ];
      const plan = service.buildPlan(reqs, "研究+问答后写作", 0.85);
      expect(plan.executionMode).toBe("dag");
      const writingStep = plan.steps.find((s) => s.module === "writing")!;
      // writing depends on both research and ask
      expect(writingStep.dependsOn.length).toBeGreaterThanOrEqual(2);
    });

    it("plan has correct metadata", () => {
      const plan = service.buildPlan(
        [{ module: "teams", action: "辩论", input: "AI ethics", priority: 1 }],
        "AI 伦理辩论",
        0.75,
      );
      expect(plan.id).toMatch(/^plan-/);
      expect(plan.originalIntent).toBe("AI 伦理辩论");
      expect(plan.confidence).toBe(0.75);
      expect(plan.plannedAt).toBeInstanceOf(Date);
    });

    it("priorities determine step ordering", () => {
      const reqs: CapabilityRequirement[] = [
        { module: "ask", action: "问答", input: "topic", priority: 2 },
        { module: "research", action: "研究", input: "topic", priority: 1 },
      ];
      const plan = service.buildPlan(reqs, "先研究后问答", 0.8);
      // step-0 should be research (priority 1 < priority 2)
      expect(plan.steps[0].module).toBe("research");
      expect(plan.steps[1].module).toBe("ask");
    });
  });
});
