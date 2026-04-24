/**
 * LEADER_PLANNER_SPEC 单元测试
 *
 * 不调 LLM；验证 spec 的契约：
 *  - identity / role / tools / forbiddenTools / taskProfile 完整
 *  - outputSchema 为 LeaderPlanSchema
 *  - stubFn 产出通过 outputSchema + validateBusinessRules 双重校验
 *  - validateBusinessRules 对 modelId 强校验
 */

import { LEADER_PLANNER_SPEC } from "../leader-planner";
import { LeaderPlanSchema } from "../schemas";

describe("LEADER_PLANNER_SPEC", () => {
  it("identity has AG-01-LD role + tools + forbiddenTools", () => {
    expect(LEADER_PLANNER_SPEC.identity.role.id).toBe("AG-01-LD");
    expect(LEADER_PLANNER_SPEC.identity.role.name).toBe("Research Leader");
    expect(LEADER_PLANNER_SPEC.identity.tools).toContain("rag-search");
    expect(LEADER_PLANNER_SPEC.identity.forbiddenTools).toContain(
      "TL-02-EVSAVE",
    );
  });

  it("taskProfile aligned with baseline planResearch (medium creativity / extended length / deep reasoning)", () => {
    // baseline leader-planning.service.ts:L315-L319：
    //   creativity: medium / outputLength: extended / reasoningDepth: deep
    expect(LEADER_PLANNER_SPEC.taskProfile).toEqual({
      creativity: "medium",
      outputLength: "extended",
      reasoningDepth: "deep",
    });
  });

  it("outputSchema is LeaderPlanSchema", () => {
    expect(LEADER_PLANNER_SPEC.outputSchema).toBe(LeaderPlanSchema);
  });

  it("buildSystemPrompt returns instruction text", () => {
    const prompt = LEADER_PLANNER_SPEC.buildSystemPrompt!({
      input: {
        missionId: "m1",
        topicId: "t1",
        topicName: "AI",
        topicType: "TECHNOLOGY",
        availableModels: ["m"],
        language: "zh-CN",
        researchDepth: "standard",
        maxDimensions: 5,
      },
      identity: LEADER_PLANNER_SPEC.identity,
    });
    // Apr 21 baseline 的 LEADER_PLAN_PROMPT 开篇：
    expect(prompt).toContain("资深的研究协调专家");
    // 本 spec 的 JSON schema 覆盖段：
    expect(prompt).toContain("dimensions");
    expect(prompt).toContain("agentAssignments");
  });

  it("buildSystemPrompt fully resolves ALL prompt placeholders (no literal braces left)", () => {
    // 回归测试：任何未替换的 {placeholder} 会让 LLM 收到字面量 → 灾难。
    const prompt = LEADER_PLANNER_SPEC.buildSystemPrompt!({
      input: {
        missionId: "m-1",
        topicId: "t-1",
        topicName: "Specific Topic Name",
        topicType: "EVENT",
        topicDescription: "Some description",
        userPrompt: "user query",
        availableModels: ["model-a", "model-b"],
        language: "zh",
        researchDepth: "standard",
        maxDimensions: 6,
        existingDimensions: [
          { id: "d1", name: "Dim One", description: "desc", status: "PENDING" },
        ],
        anchorContent: "## 锚文章\n内容片段",
      },
      identity: LEADER_PLANNER_SPEC.identity,
    });
    // baseline 所有占位符必须替换完（leader-planner.ts buildSystemPrompt 有 11 个 replace）
    const placeholders = [
      "{topic}",
      "{topicType}",
      "{description}",
      "{userPrompt}",
      "{availableModels}",
      "{existingDimensions}",
      "{currentDate}",
      "{currentYear}",
      "{recommendedDepth}",
      "{anchorArticleContent}",
      "{languageInstruction}",
    ];
    for (const ph of placeholders) {
      expect(prompt).not.toContain(ph);
    }
    // 内容被正确展开
    expect(prompt).toContain("Specific Topic Name");
    expect(prompt).toContain("EVENT");
    expect(prompt).toContain("model-a");
    expect(prompt).toContain("Dim One");
    expect(prompt).toContain("锚文章");
  });

  it("buildUserPrompt includes mission + topic fields", () => {
    const prompt = LEADER_PLANNER_SPEC.buildUserPrompt!({
      input: {
        missionId: "m-xyz",
        topicId: "t-abc",
        topicName: "Quantum",
        topicType: "TECHNOLOGY",
        availableModels: ["gpt-4o", "claude"],
        language: "zh-CN",
        researchDepth: "thorough",
        maxDimensions: 6,
        userPrompt: "深入分析",
      },
      identity: LEADER_PLANNER_SPEC.identity,
    });
    expect(prompt).toContain("missionId: m-xyz");
    expect(prompt).toContain("topicName: Quantum");
    expect(prompt).toContain("userPrompt: 深入分析");
    expect(prompt).toContain("gpt-4o, claude");
  });

  it("stubFn produces schema-valid plan", async () => {
    const out = await LEADER_PLANNER_SPEC.stubFn!({
      input: {
        missionId: "m1",
        topicId: "t1",
        topicName: "AI",
        topicType: "TECHNOLOGY",
        availableModels: ["gpt-4o", "claude"],
        language: "zh-CN",
        researchDepth: "standard",
        maxDimensions: 5,
      },
      identity: LEADER_PLANNER_SPEC.identity,
    });
    const parsed = LeaderPlanSchema.safeParse(out);
    expect(parsed.success).toBe(true);
  });

  it("validateBusinessRules passes when modelId in availableModels", () => {
    const plan = {
      missionId: "m1",
      dimensions: [],
      agentAssignments: [
        {
          agentId: "r1",
          agentType: "dimension_researcher",
          role: "domain_expert",
          modelId: "gpt-4o",
        },
        {
          agentId: "rv1",
          agentType: "quality_reviewer",
          role: "quality_reviewer",
          modelId: "claude",
        },
        {
          agentId: "w1",
          agentType: "report_writer",
          role: "report_writer",
          modelId: "gpt-4o",
        },
      ],
      executionStrategy: { parallelism: 3, priorityOrder: [] },
      complexityScore: 5,
      reasoning: "x",
    } as any;
    expect(() =>
      LEADER_PLANNER_SPEC.validateBusinessRules!(plan, {
        input: {
          availableModels: ["gpt-4o", "claude"],
        } as any,
        identity: LEADER_PLANNER_SPEC.identity,
      }),
    ).not.toThrow();
  });

  it("validateBusinessRules throws when modelId absent from availableModels", () => {
    const plan = {
      missionId: "m1",
      dimensions: [],
      agentAssignments: [
        {
          agentId: "r1",
          agentType: "dimension_researcher",
          role: "domain_expert",
          modelId: "unknown-model",
        },
      ],
      executionStrategy: { parallelism: 1, priorityOrder: [] },
      complexityScore: 5,
      reasoning: "x",
    } as any;
    expect(() =>
      LEADER_PLANNER_SPEC.validateBusinessRules!(plan, {
        input: { availableModels: ["gpt-4o"] } as any,
        identity: LEADER_PLANNER_SPEC.identity,
      }),
    ).toThrow(/not in availableModels/);
  });

  it("validateBusinessRules skips when availableModels empty", () => {
    const plan = {
      agentAssignments: [
        {
          agentId: "r1",
          agentType: "dimension_researcher",
          role: "domain_expert",
          modelId: "any-model",
        },
      ],
    } as any;
    expect(() =>
      LEADER_PLANNER_SPEC.validateBusinessRules!(plan, {
        input: { availableModels: [] } as any,
        identity: LEADER_PLANNER_SPEC.identity,
      }),
    ).not.toThrow();
  });

  it("validateBusinessRules skips modelId check when modelId is empty string", () => {
    // 空 modelId 是合法 fallback（后处理会轮询分配）
    const plan = {
      agentAssignments: [
        {
          agentId: "r1",
          agentType: "dimension_researcher",
          role: "domain_expert",
          modelId: "",
        },
      ],
    } as any;
    expect(() =>
      LEADER_PLANNER_SPEC.validateBusinessRules!(plan, {
        input: { availableModels: ["gpt-4o"] } as any,
        identity: LEADER_PLANNER_SPEC.identity,
      }),
    ).not.toThrow();
  });
});
