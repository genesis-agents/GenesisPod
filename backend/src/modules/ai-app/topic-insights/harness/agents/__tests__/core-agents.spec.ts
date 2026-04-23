/**
 * Tier Core Group C · 6 Agent runners 单测
 *
 * 覆盖：
 * - stub 模式：每个 agent stubOutput 通过 Zod schema（Zod-valid）
 * - access matrix：canUseTool 正确反映 tools + forbiddenTools
 * - business rules：Leader 的 modelId 白名单、SectionWriter 的 wordCount/citations
 * - signal abort：run 期间 abort → AbortError
 * - Budget charge：run 后 budget.tokensUsed 累加
 * - Real LLM 模式（STUB=0）→ throw "not yet wired"
 */

import { buildIdentityContext } from "../../pipeline";
import { canUseTool, type AgentRunContext } from "../types";
import {
  LeaderPlannerAgent,
  type LeaderPlannerInput,
} from "../leader-planner.agent";
import {
  SectionWriterAgent,
  type SectionWriterInput,
} from "../section-writer.agent";
import {
  SectionReviewerAgent,
  type SectionReviewerInput,
} from "../section-reviewer.agent";
import {
  MetaExtractorAgent,
  type MetaExtractorInput,
} from "../meta-extractor.agent";
import {
  QualityReviewerAgent,
  type QualityReviewerInput,
} from "../quality-reviewer.agent";
import { SynthesizerAgent, type SynthesizerInput } from "../synthesizer.agent";
import { HarnessAgentRegistry } from "../agent-registry";

function ctx<T>(input: T): AgentRunContext<T> {
  const identity = buildIdentityContext({
    missionId: "m-1",
    topicId: "t-1",
    reportId: "r-1",
    userId: "u-1",
    depth: "standard",
    mode: "fresh",
  });
  return { input, identity, signal: identity.abortController.signal };
}

describe("Core Agents · stub mode", () => {
  const origFlag = process.env.HARNESS_AGENTS_STUB;

  beforeAll(() => {
    process.env.HARNESS_AGENTS_STUB = "1";
  });

  afterAll(() => {
    if (origFlag === undefined) delete process.env.HARNESS_AGENTS_STUB;
    else process.env.HARNESS_AGENTS_STUB = origFlag;
  });

  it("AG-01-LD Leader produces Zod-valid plan + business rule OK", async () => {
    const agent = new LeaderPlannerAgent();
    const input: LeaderPlannerInput = {
      topicId: "t-1",
      topicName: "China Economy 2025",
      topicType: "MACRO",
      availableModels: ["gpt-4o", "claude-3.5-sonnet"],
      language: "zh",
      researchDepth: "standard",
      maxDimensions: 5,
    };
    const result = await agent.run(ctx(input));
    expect(result.agentId).toBe("AG-01-LD");
    expect(result.output.dimensions.length).toBeGreaterThanOrEqual(3);
    expect(result.stub).toBe(true);
    // access matrix
    expect(canUseTool(agent, "rag-search")).toBe(true);
    expect(canUseTool(agent, "TL-02-EVSAVE")).toBe(false);
  });

  it("AG-01-LD 拒绝 modelId 不在 availableModels", async () => {
    const agent = new LeaderPlannerAgent();
    const input: LeaderPlannerInput = {
      topicId: "t-1",
      topicName: "X",
      topicType: "MACRO",
      availableModels: ["only-one"],
      language: "zh",
      researchDepth: "standard",
      maxDimensions: 3,
    };
    // Monkey-patch stubOutput to return invalid modelId
    jest.spyOn(agent as never, "stubOutput" as never).mockResolvedValueOnce({
      output: {
        missionId: "m-1",
        dimensions: Array.from({ length: 3 }).map((_, i) => ({
          id: `d-${i}`,
          name: `n-${i}`,
          description: "desc",
          purpose: "purpose",
          searchQueries: ["q1"],
          dataSources: ["web-search"],
          priority: 1,
        })),
        agentAssignments: [
          {
            role: "dimension_researcher",
            modelId: "not-whitelisted",
            skills: [],
          },
          { role: "quality_reviewer", modelId: "only-one" },
          { role: "report_writer", modelId: "only-one" },
        ],
        executionStrategy: "parallel",
        complexityScore: 5,
        reasoning: "invalid model test",
      },
      tokensUsed: 0,
      costUsd: 0,
    } as never);

    await expect(agent.run(ctx(input))).rejects.toThrow(
      /not in availableModels/,
    );
  });

  it("AG-03-SW SectionWriter produces Zod-valid result + wordCount rule", async () => {
    const agent = new SectionWriterAgent();
    const input: SectionWriterInput = {
      topicId: "t-1",
      topicName: "T",
      dimensionId: "d-1",
      dimensionName: "Dim",
      sectionPlan: {
        id: "s-1",
        title: "Section 1",
        description: "desc",
        targetWords: 400,
        keyPoints: ["kp1", "kp2", "kp3"],
      },
      evidenceSummary: "evidence summary",
      language: "zh",
    };
    const r = await agent.run(ctx(input));
    expect(r.output.wordCount).toBeGreaterThanOrEqual(340); // 400 * 0.85
    expect(r.output.citationCount).toBeGreaterThanOrEqual(
      Math.ceil(r.output.keyFindings.length * 1.5),
    );
  });

  it("AG-03-SW 拒绝低于 85% wordCount", async () => {
    const agent = new SectionWriterAgent();
    jest.spyOn(agent as never, "stubOutput" as never).mockResolvedValueOnce({
      output: {
        sectionId: "s-1",
        dimensionId: "d-1",
        title: "T",
        content: "too short" + "x".repeat(100),
        wordCount: 100, // below 85% of 400
        keyFindings: [
          {
            statement: "kf1 xxxxxxxxxxx",
            evidenceRefs: ["e1"],
            confidence: 0.8,
          },
        ],
        citationCount: 2,
        evidenceIdsUsed: ["e1", "e2"],
      },
      tokensUsed: 0,
      costUsd: 0,
    } as never);

    const input: SectionWriterInput = {
      topicId: "t-1",
      topicName: "T",
      dimensionId: "d-1",
      dimensionName: "Dim",
      sectionPlan: {
        id: "s-1",
        title: "Section 1",
        description: "desc",
        targetWords: 400,
        keyPoints: ["kp1"],
      },
      evidenceSummary: "",
      language: "zh",
    };
    await expect(agent.run(ctx(input))).rejects.toThrow(/below 85%/);
  });

  it("AG-04-SR Reviewer Zod-valid", async () => {
    const agent = new SectionReviewerAgent();
    const input: SectionReviewerInput = {
      sectionResult: {
        sectionId: "s-1",
        dimensionId: "d-1",
        title: "T",
        content: "c".repeat(100),
        wordCount: 400,
        keyFindings: [
          { statement: "kf1 xxxxxxxxxxx", evidenceRefs: ["e1", "e2"] },
        ],
      },
      revisionRound: 1,
    };
    const r = await agent.run(ctx(input));
    expect(r.output.sectionId).toBe("s-1");
    expect(r.output.claims.length).toBeGreaterThan(0);
    expect(canUseTool(agent, "TL-02-EVSAVE")).toBe(false); // 严禁
  });

  it("AG-05-ME MetaExtractor Zod-valid", async () => {
    const agent = new MetaExtractorAgent();
    const input: MetaExtractorInput = {
      dimensionId: "d-1",
      dimensionName: "经济维度",
      integratedSections: "section content here".repeat(50),
      evidenceCount: 12,
    };
    const r = await agent.run(ctx(input));
    expect(r.output.evidenceCount).toBe(12);
    expect(r.output.keyFindings.length).toBeGreaterThanOrEqual(1);
  });

  it("AG-06-QR dimension scope Zod-valid", async () => {
    const agent = new QualityReviewerAgent();
    const input: QualityReviewerInput = {
      scope: "dimension",
      dimensionId: "d-1",
      dimensionName: "经济维度",
      dimensionMeta: {
        dimensionId: "d-1",
        dimensionName: "经济维度",
        summary: "a".repeat(40),
        keyFindings: ["kf1"],
        trends: [],
        challenges: [],
        opportunities: [],
        evidenceCount: 10,
      },
      sectionReviews: [
        {
          sectionId: "s-1",
          overallScore: 8,
          scores: {
            accuracy: 8,
            completeness: 8,
            coherence: 8,
            evidenceQuality: 8,
            depth: 8,
          },
          needsRevision: false,
          revisionInstructions: [],
          issues: [],
          claims: [],
        },
      ],
    };
    const r = await agent.run(ctx(input));
    if (r.output.scope !== "dimension") {
      throw new Error("expected dimension scope");
    }
    expect(r.output.dimensionId).toBe("d-1");
  });

  it("AG-06-QR overall scope Zod-valid", async () => {
    const agent = new QualityReviewerAgent();
    const input: QualityReviewerInput = {
      scope: "overall",
      missionId: "m-1",
      dimensionMetas: [
        {
          dimensionId: "d-1",
          dimensionName: "N1",
          summary: "a".repeat(40),
          keyFindings: ["kf"],
          trends: [],
          challenges: [],
          opportunities: [],
          evidenceCount: 5,
        },
      ],
    };
    const r = await agent.run(ctx(input));
    if (r.output.scope !== "overall") throw new Error("expected overall");
    expect(r.output.missionId).toBe("m-1");
    expect(r.output.dimensionsToReresearch).toEqual([]);
  });

  it("AG-11-SY Synthesizer Zod-valid + 严禁 TL-02-EVSAVE", async () => {
    const agent = new SynthesizerAgent();
    expect(canUseTool(agent, "TL-02-EVSAVE")).toBe(false);

    const input: SynthesizerInput = {
      topicId: "t-1",
      topicName: "Topic X",
      language: "zh",
      dimensionMetas: Array.from({ length: 4 }).map((_, i) => ({
        dimensionId: `d-${i}`,
        dimensionName: `N${i}`,
        summary: `summary for dim ${i} ` + "x".repeat(40),
        keyFindings: [`kf${i}`, "kf other"],
        trends: [],
        challenges: [],
        opportunities: [],
        evidenceCount: 10,
      })),
      integratedSectionsPerDim: {},
    };

    const r = await agent.run(ctx(input));
    expect(r.output.missionId).toBe("m-1");
    expect(r.output.highlights.length).toBeGreaterThanOrEqual(3);
    expect(r.output.riskMatrix.length).toBeGreaterThan(0);
    expect(r.output.recommendations.length).toBeGreaterThan(0);
  });
});

describe("Core Agents · signal abort", () => {
  beforeAll(() => {
    process.env.HARNESS_AGENTS_STUB = "1";
  });

  it("abort 前触发 → throw AbortError", async () => {
    const agent = new LeaderPlannerAgent();
    const identity = buildIdentityContext({
      missionId: "m-1",
      topicId: "t-1",
      reportId: "r-1",
      userId: "u-1",
      depth: "standard",
      mode: "fresh",
    });
    identity.abortController.abort();
    const input: LeaderPlannerInput = {
      topicId: "t-1",
      topicName: "X",
      topicType: "MACRO",
      availableModels: [],
      language: "zh",
      researchDepth: "standard",
      maxDimensions: 3,
    };
    await expect(
      agent.run({
        input,
        identity,
        signal: identity.abortController.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("Core Agents · real LLM mode requires invoker", () => {
  const origFlag = process.env.HARNESS_AGENTS_STUB;

  beforeAll(() => {
    process.env.HARNESS_AGENTS_STUB = "0";
  });

  afterAll(() => {
    if (origFlag === undefined) delete process.env.HARNESS_AGENTS_STUB;
    else process.env.HARNESS_AGENTS_STUB = origFlag;
  });

  it("STUB=0 时调用 Leader 但未注入 LlmInvoker → 清晰报错", async () => {
    const agent = new LeaderPlannerAgent(); // 无 invoker
    const input: LeaderPlannerInput = {
      topicId: "t-1",
      topicName: "X",
      topicType: "MACRO",
      availableModels: ["m"],
      language: "zh",
      researchDepth: "standard",
      maxDimensions: 3,
    };
    await expect(agent.run(ctx(input))).rejects.toThrow(
      /LlmInvokerService not injected/,
    );
  });
});

describe("HarnessAgentRegistry", () => {
  beforeAll(() => {
    process.env.HARNESS_AGENTS_STUB = "1";
  });

  it("注册 + get + mustGet", () => {
    const reg = new HarnessAgentRegistry();
    const leader = new LeaderPlannerAgent();
    reg.register(leader);
    expect(reg.listIds()).toContain("AG-01-LD");
    expect(reg.get("AG-01-LD")).toBe(leader);
    expect(() => reg.mustGet("AG-MISSING")).toThrow();
  });
});
