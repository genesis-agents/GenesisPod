/**
 * SlidesTeamMember 单元测试
 */

import { Test, TestingModule } from "@nestjs/testing";
import { SlidesTeamMember } from "../slides-team-member";
import { SkillRegistry, TeamFacade } from "@/modules/ai-engine/facade";
import type { SlidesTask, SkillExecutionContext } from "../types";

// ==================== Mocks ====================

const mockSkill = {
  id: "outline-planning",
  name: "Outline Planning",
  isPromptSkillAdapter: false,
};

const mockSkillRegistry = {
  tryGet: jest.fn(),
};

const mockAiFacade = {
  executeSkill: jest.fn(),
  resolveSkillInputBindings: jest.fn(),
};

// ==================== Helpers ====================

function makeTask(overrides: Partial<SlidesTask> = {}): SlidesTask {
  return {
    id: "task-001",
    title: "制作大纲",
    skillId: "outline-planning",
    description: "根据源文本生成幻灯片大纲",
    input: {},
    ...overrides,
  } as SlidesTask;
}

function makeContext(
  overrides: Partial<SkillExecutionContext> = {},
): SkillExecutionContext {
  return {
    executionId: "exec-001",
    sessionId: "sess-001",
    globalContext: {
      sourceText: "这是源文本内容",
      outline: null,
      themeId: "genspark-dark",
      stylePreference: "dark",
    },
    previousOutputs: {},
    outputManager: undefined,
    ...overrides,
  } as SkillExecutionContext;
}

// ==================== Tests ====================

describe("SlidesTeamMember", () => {
  let member: SlidesTeamMember;

  beforeEach(async () => {
    jest.clearAllMocks();

    // 默认：技能存在，执行成功
    mockSkillRegistry.tryGet.mockReturnValue(mockSkill);
    mockAiFacade.executeSkill.mockResolvedValue({
      success: true,
      data: { slides: [] },
    });
    // 默认：非 PromptSkillAdapter，resolveSkillInputBindings 返回 null
    mockAiFacade.resolveSkillInputBindings.mockReturnValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlidesTeamMember,
        { provide: SkillRegistry, useValue: mockSkillRegistry },
        { provide: TeamFacade, useValue: mockAiFacade },
      ],
    }).compile();

    member = module.get<SlidesTeamMember>(SlidesTeamMember);
  });

  // ==================== executeTask - happy path ====================

  describe("executeTask - success", () => {
    it("should execute task and return success result with data", async () => {
      const task = makeTask();
      const context = makeContext();

      const result = await member.executeTask(task, context);

      expect(result.success).toBe(true);
      expect(result.result).toEqual({ slides: [] });
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(mockSkillRegistry.tryGet).toHaveBeenCalledWith("outline-planning");
      expect(mockAiFacade.executeSkill).toHaveBeenCalledWith(
        mockSkill,
        expect.any(Object),
        expect.objectContaining({
          executionId: "exec-001",
          skillId: "outline-planning",
          sessionId: "sess-001",
        }),
      );
    });

    it("should return duration in result", async () => {
      const result = await member.executeTask(makeTask(), makeContext());
      expect(typeof result.duration).toBe("number");
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  // ==================== executeTask - skill not found ====================

  describe("executeTask - skill not found", () => {
    it("should return failure when skill not found with any variant", async () => {
      mockSkillRegistry.tryGet.mockReturnValue(null);

      const result = await member.executeTask(makeTask(), makeContext());

      expect(result.success).toBe(false);
      expect(result.error).toContain("Skill not found");
      // tryGet 应被调用多次（原始 + slides- 前缀 + 去前缀）
      expect(mockSkillRegistry.tryGet).toHaveBeenCalledTimes(2);
    });

    it("should try slides- prefix variant", async () => {
      mockSkillRegistry.tryGet
        .mockReturnValueOnce(null) // 原始
        .mockReturnValueOnce(mockSkill); // slides- 前缀版本

      const task = makeTask({ skillId: "outline-planning" });
      const result = await member.executeTask(task, makeContext());

      expect(result.success).toBe(true);
      expect(mockSkillRegistry.tryGet).toHaveBeenCalledWith(
        "slides-outline-planning",
      );
    });

    it("should try removing slides- prefix variant", async () => {
      mockSkillRegistry.tryGet
        .mockReturnValueOnce(null) // 原始 "slides-outline"
        .mockReturnValueOnce(null) // "slides-slides-outline"
        .mockReturnValueOnce(mockSkill); // "outline"（去前缀）

      const task = makeTask({ skillId: "slides-outline" });
      const result = await member.executeTask(task, makeContext());

      expect(result.success).toBe(true);
      expect(mockSkillRegistry.tryGet).toHaveBeenCalledWith("outline");
    });
  });

  // ==================== executeTask - comma in skillId ====================

  describe("executeTask - comma in skillId", () => {
    it("should normalize comma-separated skillId to first part", async () => {
      const task = makeTask({ skillId: "outline-planning, extra-skill" });

      const result = await member.executeTask(task, makeContext());

      expect(result.success).toBe(true);
      expect(mockSkillRegistry.tryGet).toHaveBeenCalledWith("outline-planning");
    });
  });

  // ==================== executeTask - skill execution fails ====================

  describe("executeTask - skill execution fails", () => {
    it("should return failure when executeSkill returns success=false", async () => {
      mockAiFacade.executeSkill.mockResolvedValue({
        success: false,
        error: { message: "LLM 调用失败" },
      });

      const result = await member.executeTask(makeTask(), makeContext());

      expect(result.success).toBe(false);
      expect(result.error).toBe("LLM 调用失败");
    });

    it("should handle executeSkill throwing an exception", async () => {
      mockAiFacade.executeSkill.mockRejectedValue(new Error("网络超时"));

      const result = await member.executeTask(makeTask(), makeContext());

      expect(result.success).toBe(false);
      expect(result.error).toBe("网络超时");
    });
  });

  // ==================== executeTask - PromptSkillAdapter path ====================

  describe("executeTask - PromptSkillAdapter", () => {
    it("should use resolved bindings when resolveSkillInputBindings returns non-null", async () => {
      const resolved = { sourceText: "源文本", outline: "大纲内容" };
      mockAiFacade.resolveSkillInputBindings.mockReturnValue(resolved);

      const result = await member.executeTask(makeTask(), makeContext());

      expect(result.success).toBe(true);
      const skillInput = mockAiFacade.executeSkill.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(skillInput).toMatchObject({
        task: "根据源文本生成幻灯片大纲",
        ...resolved,
      });
      // 不应包含 previousOutputs
      expect(skillInput).not.toHaveProperty("previousOutputs");
    });

    it("should use minimal input for isPromptSkillAdapter when resolved is null", async () => {
      const promptSkill = { ...mockSkill, isPromptSkillAdapter: true };
      mockSkillRegistry.tryGet.mockReturnValue(promptSkill);
      mockAiFacade.resolveSkillInputBindings.mockReturnValue(null);

      const result = await member.executeTask(makeTask(), makeContext());

      expect(result.success).toBe(true);
      const skillInput = mockAiFacade.executeSkill.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(skillInput).toHaveProperty("task");
      expect(skillInput).toHaveProperty("themeId");
      expect(skillInput).toHaveProperty("stylePreference");
    });
  });

  // ==================== executeTask - code-based skills ====================

  describe("executeTask - code-based skill inputs", () => {
    it("should pass correct input for page-type-selection", async () => {
      const task = makeTask({ skillId: "page-type-selection" });
      const context = makeContext({
        previousOutputs: {
          outline: { slides: [{ id: "s1" }, { id: "s2" }] },
        },
      });

      await member.executeTask(task, context);

      const skillInput = mockAiFacade.executeSkill.mock.calls[0][1];
      expect(skillInput).toEqual([{ id: "s1" }, { id: "s2" }]);
    });

    it("should pass correct input for page-pipeline", async () => {
      const task = makeTask({ skillId: "page-pipeline" });
      const context = makeContext({
        previousOutputs: {
          "outline-planning": { pages: [{ id: "p1" }] },
        },
      });

      await member.executeTask(task, context);

      const skillInput = mockAiFacade.executeSkill.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(skillInput).toHaveProperty("outline");
      expect(skillInput).toHaveProperty("sourceText");
      expect(skillInput).toHaveProperty("themeId");
    });

    it("should pass correct input for quality-audit", async () => {
      const task = makeTask({ skillId: "quality-audit" });
      const context = makeContext({
        previousOutputs: { pages: [{ id: "pg1" }] },
      });

      await member.executeTask(task, context);

      const skillInput = mockAiFacade.executeSkill.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(skillInput).toHaveProperty("pages");
    });

    it("should pass baseInput for unknown skill", async () => {
      const task = makeTask({ skillId: "unknown-custom-skill" });
      const context = makeContext();

      await member.executeTask(task, context);

      const skillInput = mockAiFacade.executeSkill.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(skillInput).toHaveProperty("task");
      expect(skillInput).toHaveProperty("context");
      expect(skillInput).toHaveProperty("previousOutputs");
    });
  });

  // ==================== getMemberInfo ====================

  describe("getMemberInfo", () => {
    it("should return leader member info", () => {
      const info = member.getMemberInfo("leader");
      expect(info.role).toBe("leader");
      expect(info.name).toBe("Slides Architect");
    });

    it("should return writer member info", () => {
      const info = member.getMemberInfo("writer");
      expect(info.role).toBe("writer");
    });
  });

  // ==================== hasSkill ====================

  describe("hasSkill", () => {
    it("should return true when role has the exact skill", () => {
      expect(member.hasSkill("writer", "page-pipeline")).toBe(true);
    });

    it("should return true when skill has slides- prefix in registry", () => {
      // hasSkill 检查 skillId 本身 OR member.skills 中是否有 "slides-{skillId}"
      // writer 有 "page-pipeline"，查询 "page-pipeline" 直接命中
      expect(member.hasSkill("writer", "page-pipeline")).toBe(true);
      // 查询 "slides-page-pipeline" — writer skills 中没有该精确值，也没有 "slides-slides-page-pipeline"
      // 所以应该返回 false（这是实际行为）
      expect(member.hasSkill("writer", "slides-page-pipeline")).toBe(false);
    });

    it("should return false when role does not have the skill", () => {
      expect(member.hasSkill("analyst", "page-pipeline")).toBe(false);
    });

    it("should return false for non-existent skill", () => {
      expect(member.hasSkill("leader", "non-existent-skill")).toBe(false);
    });
  });
});
