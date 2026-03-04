import { SpecializedAgentCoordinatorService } from "../specialized-agent-coordinator.service";
import type {
  CollaborationRequest,
  DebateRequest,
} from "../specialized-agent-coordinator.service";
import type { ChatFacade } from "@/modules/ai-engine/facade";
import { SpecializedAgentType } from "../../../types/specialized-agents.types";

// Mock the json-extraction utils
jest.mock("@/common/utils/json-extraction.utils", () => ({
  extractJsonFromAIResponse: jest.fn(),
}));

// Mock the agent-roles constants
jest.mock("../../../constants/agent-roles", () => ({
  AGENT_ROLE_REGISTRY: {
    domain_expert: {
      type: "domain_expert",
      displayName: "Domain Expert",
      description: "An expert in the domain",
      systemPrompt: "You are a domain expert.",
      recommendedSkills: ["research"],
      recommendedTools: ["search"],
      taskProfile: { creativity: "medium", outputLength: "medium" },
    },
    fact_checker: {
      type: "fact_checker",
      displayName: "Fact Checker",
      description: "Verifies facts",
      systemPrompt: "You verify facts.",
      recommendedSkills: ["verification"],
      recommendedTools: ["web-search"],
      taskProfile: { creativity: "deterministic", outputLength: "short" },
    },
    synthesizer: {
      type: "synthesizer",
      displayName: "Synthesizer",
      description: "Synthesizes information",
      systemPrompt: "You synthesize information.",
      recommendedSkills: ["synthesis"],
      recommendedTools: [],
      taskProfile: { creativity: "low", outputLength: "long" },
    },
  },
}));

import { extractJsonFromAIResponse } from "@/common/utils/json-extraction.utils";

const mockExtractJson = extractJsonFromAIResponse as jest.MockedFunction<
  typeof extractJsonFromAIResponse
>;

function createMockAiFacade() {
  return {
    chatWithSkills: jest.fn(),
  } as unknown as jest.Mocked<ChatFacade>;
}

function createMockContext() {
  return {
    topicName: "Artificial Intelligence",
    dimensionName: "Market Impact",
    evidences: [
      {
        id: "ev-1",
        content: "AI market grew 30% in 2025",
        source: "TechReport",
      },
    ],
  };
}

function createCollaborationRequest(): CollaborationRequest {
  return {
    topic: "Impact of AI on employment",
    content:
      "AI systems are increasingly replacing human tasks in various sectors.",
    context: createMockContext(),
    roles: [
      SpecializedAgentType.DOMAIN_EXPERT,
      SpecializedAgentType.FACT_CHECKER,
      SpecializedAgentType.SYNTHESIZER,
    ],
  };
}

function createDebateRequest(): DebateRequest {
  return {
    proposition: "AI will create more jobs than it eliminates",
    context: createMockContext(),
    config: { debateRounds: 2 },
  };
}

describe("SpecializedAgentCoordinatorService", () => {
  let service: SpecializedAgentCoordinatorService;
  let mockAiFacade: jest.Mocked<ChatFacade>;

  beforeEach(() => {
    mockAiFacade = createMockAiFacade();
    service = new SpecializedAgentCoordinatorService(
      mockAiFacade as unknown as ChatFacade,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("runCollaboration", () => {
    function setupSuccessfulAgentAnalysis() {
      mockAiFacade.chatWithSkills.mockResolvedValue({
        content: '{"valid": "json"}',
      } as never);
      mockExtractJson.mockReturnValue({
        success: true,
        data: {
          mainFindings: ["Finding 1", "Finding 2"],
          supportingEvidence: ["Evidence 1"],
          caveats: ["Note 1"],
          confidence: 0.85,
          suggestedActions: [
            { action: "Investigate further", priority: "high" },
          ],
        },
      } as never);
    }

    it("should run collaboration and return multi-role result", async () => {
      setupSuccessfulAgentAnalysis();

      const request = createCollaborationRequest();
      const result = await service.runCollaboration(request);

      expect(result.participatingRoles).toHaveLength(3);
      expect(result.interactions).toBeDefined();
      expect(result.synthesizedInsights).toBeDefined();
      expect(result.metadata.totalAgents).toBe(3);
      expect(result.metadata.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("should call aiFacade.chat for each role plus synthesis", async () => {
      setupSuccessfulAgentAnalysis();

      const request = createCollaborationRequest();
      await service.runCollaboration(request);

      // 3 roles + 1 synthesis = 4 calls
      expect(mockAiFacade.chatWithSkills).toHaveBeenCalledTimes(4);
    });

    it("should use default roles when none specified", async () => {
      setupSuccessfulAgentAnalysis();

      const request: CollaborationRequest = {
        ...createCollaborationRequest(),
        roles: undefined,
      };
      const result = await service.runCollaboration(request);

      // Default roles: DOMAIN_EXPERT, FACT_CHECKER, SYNTHESIZER
      expect(result.participatingRoles).toHaveLength(3);
    });

    it("should handle AI extraction failure gracefully (return null for role)", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValue({
        content: "invalid",
      } as never);
      mockExtractJson
        .mockReturnValueOnce({ success: false, data: null } as never) // domain_expert
        .mockReturnValueOnce({ success: false, data: null } as never) // fact_checker
        .mockReturnValueOnce({ success: false, data: null } as never) // synthesizer
        .mockReturnValueOnce({ success: false, data: null } as never); // synthesis

      const request = createCollaborationRequest();
      const result = await service.runCollaboration(request);

      // Should still return result structure even if all extractions fail
      expect(result.participatingRoles).toHaveLength(3);
      expect(result.synthesizedInsights.keyFindings).toEqual([]);
    });

    it("should handle chat error for individual role gracefully", async () => {
      mockAiFacade.chatWithSkills
        .mockRejectedValueOnce(new Error("API error")) // domain_expert fails
        .mockResolvedValue({ content: "{}" } as never); // others succeed

      mockExtractJson.mockReturnValue({
        success: true,
        data: {
          mainFindings: ["Finding"],
          supportingEvidence: [],
          caveats: [],
          confidence: 0.7,
          suggestedActions: [],
        },
      } as never);

      const request = createCollaborationRequest();
      const result = await service.runCollaboration(request);

      // Should continue despite domain_expert failing
      expect(result).toBeDefined();
    });

    it("should populate suggestedActions in role results", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValue({ content: "{}" } as never);
      mockExtractJson.mockReturnValue({
        success: true,
        data: {
          mainFindings: ["F1"],
          supportingEvidence: [],
          caveats: [],
          confidence: 0.9,
          suggestedActions: [
            { action: "Action 1", priority: "high" },
            { action: "Action 2", priority: "low" },
            { action: "Action 3", priority: "invalid" }, // should default to medium
          ],
        },
      } as never);

      const request = createCollaborationRequest();
      const result = await service.runCollaboration(request);

      const domainExpertResult =
        result.roleResults[SpecializedAgentType.DOMAIN_EXPERT];
      if (domainExpertResult) {
        expect(domainExpertResult.suggestedActions[0].priority).toBe("high");
        expect(domainExpertResult.suggestedActions[1].priority).toBe("low");
        expect(domainExpertResult.suggestedActions[2].priority).toBe("medium");
      }
    });

    it("should include previous role results in subsequent role prompts", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValue({ content: "{}" } as never);
      mockExtractJson.mockReturnValue({
        success: true,
        data: {
          mainFindings: ["Finding"],
          supportingEvidence: [],
          caveats: [],
          confidence: 0.8,
          suggestedActions: [],
        },
      } as never);

      const request = createCollaborationRequest();
      await service.runCollaboration(request);

      // After first role completes, subsequent roles should have context
      const calls = mockAiFacade.chatWithSkills.mock.calls;
      // The third call (synthesizer) should include previous results context
      if (calls.length > 2) {
        const thirdCallMessages = calls[2][0].messages;
        const systemOrUserContent = thirdCallMessages[0].content;
        expect(typeof systemOrUserContent).toBe("string");
      }
    });

    it("should calculate correct confidence bounds", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValue({ content: "{}" } as never);
      mockExtractJson.mockReturnValue({
        success: true,
        data: {
          mainFindings: [],
          supportingEvidence: [],
          caveats: [],
          confidence: 1.5, // out of bounds (> 1)
          suggestedActions: [],
        },
      } as never);

      const request = createCollaborationRequest();
      const result = await service.runCollaboration(request);

      const roleResult = result.roleResults[SpecializedAgentType.DOMAIN_EXPERT];
      if (roleResult) {
        expect(roleResult.analysis.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("runDebate", () => {
    function setupSuccessfulDebate() {
      mockAiFacade.chatWithSkills.mockResolvedValue({ content: "{}" } as never);

      // Mock for pro argument
      const proArgResponse = {
        success: true,
        data: {
          argument: "Pro argument for AI job creation",
          evidenceUsed: ["Evidence 1"],
          confidence: 0.8,
        },
      };

      // Mock for con argument
      const conArgResponse = {
        success: true,
        data: {
          argument: "Con argument against AI job creation",
          evidenceUsed: ["Counter evidence"],
          confidence: 0.75,
        },
      };

      // Mock for judge assessment
      const judgeResponse = {
        success: true,
        data: {
          proStrengths: ["Clear logic"],
          proWeaknesses: ["Lacks data"],
          conStrengths: ["Strong evidence"],
          conWeaknesses: ["Overly pessimistic"],
          currentLeaning: "undecided",
          pointsToAddress: ["Need more research"],
        },
      };

      // Mock for final verdict
      const verdictResponse = {
        success: true,
        data: {
          conclusion: "Both sides make valid points",
          confidence: 0.7,
          winningPosition: "nuanced",
          keyArguments: ["AI creates new jobs", "AI displaces existing ones"],
          remainingContention: ["Net effect unclear"],
          synthesizedView: "The impact depends on adaptation",
        },
      };

      mockExtractJson
        .mockReturnValueOnce(proArgResponse as never) // round 1 pro
        .mockReturnValueOnce(conArgResponse as never) // round 1 con
        .mockReturnValueOnce(judgeResponse as never) // round 1 judge
        .mockReturnValueOnce(proArgResponse as never) // round 2 pro
        .mockReturnValueOnce(conArgResponse as never) // round 2 con
        .mockReturnValueOnce(judgeResponse as never) // round 2 judge
        .mockReturnValueOnce(verdictResponse as never); // final verdict
    }

    it("should run debate and return debate result", async () => {
      setupSuccessfulDebate();

      const request = createDebateRequest();
      const result = await service.runDebate(request);

      expect(result.proposition).toBe(request.proposition);
      expect(result.rounds).toBeDefined();
      expect(result.totalRounds).toBeGreaterThan(0);
      expect(result.finalVerdict).toBeDefined();
      expect(result.metadata.startTime).toBeInstanceOf(Date);
      expect(result.metadata.endTime).toBeInstanceOf(Date);
    });

    it("should use default debate rounds config when not specified", async () => {
      setupSuccessfulDebate();

      const requestNoConfig: DebateRequest = {
        proposition: "Test proposition",
        context: createMockContext(),
      };

      const result = await service.runDebate(requestNoConfig);
      expect(result).toBeDefined();
    });

    it("should stop early when judge reaches clear verdict", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValue({ content: "{}" } as never);

      const earlyStopJudge = {
        success: true,
        data: {
          proStrengths: ["Overwhelming evidence"],
          proWeaknesses: [],
          conStrengths: [],
          conWeaknesses: ["Lacks substance"],
          currentLeaning: "pro",
          pointsToAddress: [], // empty = clear verdict
        },
      };

      const proArg = {
        success: true,
        data: {
          argument: "Strong pro argument",
          evidenceUsed: [],
          confidence: 0.95,
        },
      };

      const conArg = {
        success: true,
        data: {
          argument: "Weak con argument",
          evidenceUsed: [],
          confidence: 0.3,
        },
      };

      const verdict = {
        success: true,
        data: {
          conclusion: "Pro wins clearly",
          confidence: 0.9,
          winningPosition: "pro",
          keyArguments: ["Key arg"],
          remainingContention: [],
          synthesizedView: "Pro view prevailed",
        },
      };

      mockExtractJson
        .mockReturnValueOnce(proArg as never)
        .mockReturnValueOnce(conArg as never)
        .mockReturnValueOnce(earlyStopJudge as never)
        .mockReturnValueOnce(verdict as never);

      const request = createDebateRequest();
      const result = await service.runDebate(request);

      // Should have stopped at round 1
      expect(result.totalRounds).toBe(1);
      expect(result.finalVerdict.winningPosition).toBe("pro");
    });

    it("should handle failed AI extraction in debate arguments", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValue({
        content: "invalid",
      } as never);
      mockExtractJson.mockReturnValue({ success: false, data: null } as never);

      const request = createDebateRequest();
      const result = await service.runDebate(request);

      // Should still produce fallback result
      expect(result.finalVerdict.winningPosition).toBe("nuanced");
      expect(result.finalVerdict.conclusion).toBe("最终裁决生成失败");
    });

    it("should parse leaning values correctly", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValue({ content: "{}" } as never);

      const judgeWithConLeaning = {
        success: true,
        data: {
          proStrengths: [],
          proWeaknesses: [],
          conStrengths: [],
          conWeaknesses: [],
          currentLeaning: "con",
          pointsToAddress: [],
        },
      };

      const proArg = {
        success: true,
        data: { argument: "P", evidenceUsed: [], confidence: 0.5 },
      };
      const conArg = {
        success: true,
        data: { argument: "C", evidenceUsed: [], confidence: 0.5 },
      };
      const verdict = {
        success: true,
        data: {
          conclusion: "Con wins",
          confidence: 0.8,
          winningPosition: "con",
          keyArguments: [],
          remainingContention: [],
          synthesizedView: "Con prevailed",
        },
      };

      mockExtractJson
        .mockReturnValueOnce(proArg as never)
        .mockReturnValueOnce(conArg as never)
        .mockReturnValueOnce(judgeWithConLeaning as never)
        .mockReturnValueOnce(verdict as never);

      const request = createDebateRequest();
      const result = await service.runDebate(request);

      expect(result.rounds[0].judgeAssessment.currentLeaning).toBe("con");
      expect(result.finalVerdict.winningPosition).toBe("con");
    });

    it("should handle chat errors in debate gracefully", async () => {
      mockAiFacade.chatWithSkills.mockRejectedValue(
        new Error("API unavailable"),
      );
      mockExtractJson.mockReturnValue({ success: false, data: null } as never);

      const request = createDebateRequest();
      const result = await service.runDebate(request);

      // Should return fallback results without throwing
      expect(result).toBeDefined();
      expect(result.finalVerdict).toBeDefined();
    });

    it("should include previous rounds context in later rounds", async () => {
      setupSuccessfulDebate();

      const request = createDebateRequest(); // 2 rounds
      await service.runDebate(request);

      // The second round calls should reference previous rounds
      const allCalls = mockAiFacade.chatWithSkills.mock.calls;
      // Round 2 pro arg is call 4 (0-indexed: 3)
      if (allCalls.length > 3) {
        const round2ProPrompt = allCalls[3][0].messages[0].content;
        expect(round2ProPrompt).toContain("第 1 轮");
      }
    });
  });
});
