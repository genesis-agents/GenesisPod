/**
 * Real-LLM 模式集成测试（HARNESS_AGENTS_STUB=0）
 *
 * 用 mock AiChatService 驱动 6 agent 都跑 real executeReal 路径：
 * - 验证 prompt 构造 + JSON parse + Zod validate + budget charge 全链路
 * - 不需真实 LLM 成本
 */

import type { AiChatService } from "@/modules/ai-engine/facade";
import { buildIdentityContext } from "../../pipeline";
import { LlmInvokerService } from "../../llm";
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
import type { AgentRunContext } from "../types";

function mockChat(jsonByOpName: Record<string, string>): AiChatService {
  return {
    chat: jest.fn((opts: { operationName?: string }) =>
      Promise.resolve({
        content: jsonByOpName[opts.operationName ?? ""] ?? "{}",
        model: "gpt-4o",
        usage: { totalTokens: 120, inputTokens: 50, outputTokens: 70 },
        isError: false,
      }),
    ),
  } as unknown as AiChatService;
}

function ctx<T>(input: T): AgentRunContext<T> {
  const identity = buildIdentityContext({
    missionId: "real-m-1",
    topicId: "real-t-1",
    reportId: "real-r-1",
    userId: "u-1",
    depth: "standard",
    mode: "fresh",
  });
  return { input, identity, signal: identity.abortController.signal };
}

describe("Real-LLM mode · 6 agents (mock AiChatService)", () => {
  const origFlag = process.env.HARNESS_AGENTS_STUB;
  beforeAll(() => {
    process.env.HARNESS_AGENTS_STUB = "0";
  });
  afterAll(() => {
    if (origFlag === undefined) delete process.env.HARNESS_AGENTS_STUB;
    else process.env.HARNESS_AGENTS_STUB = origFlag;
  });

  it("AG-01-LD: mock 返回 schema-valid JSON → 通过", async () => {
    const plan = {
      missionId: "real-m-1",
      dimensions: [
        {
          id: "d1",
          name: "n1",
          description: "desc1",
          purpose: "purpose1",
          searchQueries: ["q1"],
          dataSources: ["web-search"],
          priority: 1,
        },
        {
          id: "d2",
          name: "n2",
          description: "desc2",
          purpose: "purpose2",
          searchQueries: ["q2"],
          dataSources: ["rag-search"],
          priority: 2,
        },
        {
          id: "d3",
          name: "n3",
          description: "desc3",
          purpose: "purpose3",
          searchQueries: ["q3"],
          dataSources: ["web-search"],
          priority: 3,
        },
      ],
      agentAssignments: [
        { role: "dimension_researcher", modelId: "gpt-4o" },
        { role: "quality_reviewer", modelId: "gpt-4o" },
        { role: "report_writer", modelId: "gpt-4o" },
      ],
      executionStrategy: "parallel",
      complexityScore: 5,
      reasoning: "real-llm mode test plan reasoning xxxx",
    };
    const invoker = new LlmInvokerService(
      mockChat({ "AG-01-LD": JSON.stringify(plan) }),
    );
    const agent = new LeaderPlannerAgent(invoker);
    const input: LeaderPlannerInput = {
      topicId: "t-1",
      topicName: "Real Topic",
      topicType: "MACRO",
      availableModels: ["gpt-4o"],
      language: "zh",
      researchDepth: "standard",
      maxDimensions: 4,
    };
    const result = await agent.run(ctx(input));
    expect(result.stub).toBe(false);
    expect(result.output.dimensions.length).toBe(3);
    expect(result.tokensUsed).toBe(120);
    expect(result.costUsd).toBeGreaterThan(0);
  });

  it("AG-03-SW: mock 返回 schema-valid section", async () => {
    const section = {
      sectionId: "s1",
      dimensionId: "d1",
      title: "t",
      content: "some content".repeat(80),
      wordCount: 500,
      keyFindings: [
        {
          statement: "finding stmt 1 xxxxxxxx",
          evidenceRefs: ["e1", "e2"],
          confidence: 0.8,
        },
      ],
      citationCount: 4,
      evidenceIdsUsed: ["e1", "e2"],
    };
    const invoker = new LlmInvokerService(
      mockChat({ "AG-03-SW": JSON.stringify(section) }),
    );
    const agent = new SectionWriterAgent(invoker);
    const input: SectionWriterInput = {
      topicId: "t",
      topicName: "T",
      dimensionId: "d1",
      dimensionName: "N",
      sectionPlan: {
        id: "s1",
        title: "t",
        description: "d",
        targetWords: 500,
        keyPoints: ["k1"],
      },
      evidenceSummary: "evid",
      language: "zh",
    };
    const r = await agent.run(ctx(input));
    expect(r.stub).toBe(false);
    expect(r.output.sectionId).toBe("s1");
  });

  it("AG-04-SR Reviewer: real mode", async () => {
    const review = {
      sectionId: "s1",
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
      claims: [
        {
          id: "c1",
          statement: "claim statement xxx",
          evidenceRefs: ["e1"],
        },
      ],
    };
    const invoker = new LlmInvokerService(
      mockChat({ "AG-04-SR": JSON.stringify(review) }),
    );
    const agent = new SectionReviewerAgent(invoker);
    const input: SectionReviewerInput = {
      sectionResult: {
        sectionId: "s1",
        dimensionId: "d1",
        title: "t",
        content: "content ".repeat(50),
        wordCount: 400,
        keyFindings: [{ statement: "kf stmt xxxxxx", evidenceRefs: ["e1"] }],
      },
      revisionRound: 1,
    };
    const r = await agent.run(ctx(input));
    expect(r.stub).toBe(false);
    expect(r.output.overallScore).toBe(8);
  });

  it("AG-05-ME MetaExtractor: real mode", async () => {
    const meta = {
      dimensionId: "d1",
      dimensionName: "N",
      summary: "summary xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      keyFindings: ["kf1"],
      trends: ["t1"],
      challenges: [],
      opportunities: ["o1"],
      evidenceCount: 8,
    };
    const invoker = new LlmInvokerService(
      mockChat({ "AG-05-ME": JSON.stringify(meta) }),
    );
    const agent = new MetaExtractorAgent(invoker);
    const input: MetaExtractorInput = {
      dimensionId: "d1",
      dimensionName: "N",
      integratedSections: "integrated content".repeat(50),
      evidenceCount: 8,
    };
    const r = await agent.run(ctx(input));
    expect(r.stub).toBe(false);
    expect(r.output.evidenceCount).toBe(8);
  });

  it("AG-06-QR dimension scope real mode", async () => {
    const qr = {
      scope: "dimension",
      dimensionId: "d1",
      overallScore: 7,
      issues: [],
      recommendations: [],
      needsReresearch: false,
    };
    const invoker = new LlmInvokerService(
      mockChat({ "AG-06-QR": JSON.stringify(qr) }),
    );
    const agent = new QualityReviewerAgent(invoker);
    const input: QualityReviewerInput = {
      scope: "dimension",
      dimensionId: "d1",
      dimensionName: "N",
      dimensionMeta: {
        dimensionId: "d1",
        dimensionName: "N",
        summary: "s".repeat(40),
        keyFindings: ["kf"],
        trends: [],
        challenges: [],
        opportunities: [],
        evidenceCount: 5,
      },
      sectionReviews: [],
    };
    const r = await agent.run(ctx(input));
    if (r.output.scope !== "dimension") throw new Error("scope mismatch");
    expect(r.output.overallScore).toBe(7);
  });

  it("AG-11-SY Synthesizer real mode", async () => {
    const synth = {
      missionId: "real-m-1",
      executiveSummary: "exec summary ".repeat(30),
      preface: "preface content xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      fullMarkdown: "# report\n\n".repeat(100),
      highlights: [
        { type: "KEY_FINDING", text: "finding 1 xxxxxxx" },
        { type: "KEY_FINDING", text: "finding 2 xxxxxxx" },
        { type: "KEY_FINDING", text: "finding 3 xxxxxxx" },
      ],
      crossDimensionAnalysis:
        "cross analysis xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      riskMatrix: [
        {
          level: "medium",
          description: "risk desc xxxxxxxxxxx",
          relatedDimensions: ["d1"],
        },
      ],
      recommendations: [
        {
          priority: "P1",
          action: "action text xxxxxxxxxx",
          rationale: "rationale text xxxxxx",
          relatedDimensions: ["d1"],
        },
      ],
    };
    const invoker = new LlmInvokerService(
      mockChat({ "AG-11-SY": JSON.stringify(synth) }),
    );
    const agent = new SynthesizerAgent(invoker);
    const input: SynthesizerInput = {
      topicId: "t-1",
      topicName: "T",
      dimensionMetas: [
        {
          dimensionId: "d1",
          dimensionName: "N",
          summary: "s".repeat(40),
          keyFindings: ["kf"],
          trends: [],
          challenges: [],
          opportunities: [],
          evidenceCount: 5,
        },
      ],
      integratedSectionsPerDim: {},
      language: "zh",
    };
    const r = await agent.run(ctx(input));
    expect(r.stub).toBe(false);
    expect(r.output.riskMatrix.length).toBe(1);
  });

  it("real 模式但无 invoker → 抛清晰错误", async () => {
    const agent = new LeaderPlannerAgent(); // 无 invoker
    const input: LeaderPlannerInput = {
      topicId: "t-1",
      topicName: "T",
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
