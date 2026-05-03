/**
 * TeamMemberAgent Tests
 * Ã¦Âµâ€¹Ã¨Â¯â€¢ AI Teams Ã¦Ë†ÂÃ¥â€˜Ëœ Agent Ã§Å¡â€žÃ¥Â·Â¥Ã¥â€¦Â·Ã©â€ºâ€ Ã¦Ë†ÂÃ¥Å Å¸Ã¨Æ’Â½
 */

import { Test, TestingModule } from "@nestjs/testing";
import { TeamMemberAgent, TeamMemberAgentConfig } from "../team-member.agent";
import {
  ToolRegistry,
  BUILTIN_TOOLS,
  ToolContext,
  JSONSchema,
} from "@/modules/ai-harness/facade";
import { BaseTool } from "@/modules/ai-harness/facade/base-classes";
import { AICapability, AgentWorkStyle } from "@prisma/client";

// ============================================================================
// Mock Tools
// ============================================================================

class MockWebSearchTool extends BaseTool<
  { query: string },
  { results: string[] }
> {
  readonly id = BUILTIN_TOOLS.WEB_SEARCH;
  readonly name = "Mock Web Search";
  readonly description = "Mock web search tool";
  readonly category = "information";
  readonly inputSchema: JSONSchema = {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  };
  readonly outputSchema: JSONSchema = {
    type: "object",
    properties: { results: { type: "array" } },
  };

  protected async doExecute(
    input: { query: string },
    _context: ToolContext,
  ): Promise<{ results: string[] }> {
    return { results: [`Result for: ${input.query}`] };
  }
}

class MockCodeGenerationTool extends BaseTool<
  { prompt: string },
  { code: string }
> {
  readonly id = BUILTIN_TOOLS.CODE_GENERATION;
  readonly name = "Mock Code Generation";
  readonly description = "Mock code generation tool";
  readonly category = "generation";
  readonly inputSchema: JSONSchema = {
    type: "object",
    properties: { prompt: { type: "string" } },
    required: ["prompt"],
  };
  readonly outputSchema: JSONSchema = {
    type: "object",
    properties: { code: { type: "string" } },
  };

  protected async doExecute(
    input: { prompt: string },
    _context: ToolContext,
  ): Promise<{ code: string }> {
    return { code: `// Generated code for: ${input.prompt}` };
  }
}

class MockDataAnalysisTool extends BaseTool<
  { data: unknown },
  { analysis: string }
> {
  readonly id = BUILTIN_TOOLS.DATA_ANALYSIS;
  readonly name = "Mock Data Analysis";
  readonly description = "Mock data analysis tool";
  readonly category = "processing";
  readonly inputSchema: JSONSchema = {
    type: "object",
    properties: { data: { type: "object" } },
    required: ["data"],
  };
  readonly outputSchema: JSONSchema = {
    type: "object",
    properties: { analysis: { type: "string" } },
  };

  protected async doExecute(
    _input: { data: unknown },
    _context: ToolContext,
  ): Promise<{ analysis: string }> {
    return { analysis: "Analysis result" };
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("TeamMemberAgent", () => {
  let agent: TeamMemberAgent;
  let toolRegistry: ToolRegistry;
  let mockWebSearch: MockWebSearchTool;
  let mockCodeGen: MockCodeGenerationTool;
  let mockDataAnalysis: MockDataAnalysisTool;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TeamMemberAgent, ToolRegistry],
    }).compile();

    agent = module.get<TeamMemberAgent>(TeamMemberAgent);
    toolRegistry = module.get<ToolRegistry>(ToolRegistry);

    // Ã¦Â³Â¨Ã¥â€ Å’ mock Ã¥Â·Â¥Ã¥â€¦Â·
    mockWebSearch = new MockWebSearchTool();
    mockCodeGen = new MockCodeGenerationTool();
    mockDataAnalysis = new MockDataAnalysisTool();

    toolRegistry.register(mockWebSearch);
    toolRegistry.register(mockCodeGen);
    toolRegistry.register(mockDataAnalysis);
  });

  afterEach(() => {
    toolRegistry.clear();
  });

  // ==========================================================================
  // resolveTools - Ã¦Â Â¹Ã¦ÂÂ®Ã¦Ë†ÂÃ¥â€˜ËœÃ©â€¦ÂÃ§Â½Â®Ã¨Â§Â£Ã¦Å¾ÂÃ¥Â·Â¥Ã¥â€¦Â·Ã¥Ë†â€”Ã¨Â¡Â¨
  // ==========================================================================

  describe("resolveTools", () => {
    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¤Â¸Âº researcher Ã¨Â§â€™Ã¨â€°Â²Ã¥Ë†â€ Ã©â€¦ÂÃ¦ÂÅ“Ã§Â´Â¢Ã¥â€™Å’Ã§Å¸Â¥Ã¨Â¯â€ Ã¥Â·Â¥Ã¥â€¦Â·", () => {
      const config: TeamMemberAgentConfig = {
        memberId: "member-1",
        displayName: "Researcher",
        role: "researcher",
        capabilities: [],
        expertiseAreas: [],
        workStyle: null,
        isLeader: false,
      };

      const tools = agent.resolveTools(config);

      expect(tools).toContain(BUILTIN_TOOLS.WEB_SEARCH);
      expect(tools).toContain(BUILTIN_TOOLS.WEB_SCRAPER);
      expect(tools).toContain(BUILTIN_TOOLS.RAG_SEARCH);
      expect(tools).toContain(BUILTIN_TOOLS.KNOWLEDGE_GRAPH);
      expect(tools).toContain(BUILTIN_TOOLS.SHORT_TERM_MEMORY);
    });

    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¤Â¸Âº analyst Ã¨Â§â€™Ã¨â€°Â²Ã¥Ë†â€ Ã©â€¦ÂÃ¦â€¢Â°Ã¦ÂÂ®Ã¥Ë†â€ Ã¦Å¾ÂÃ¥Â·Â¥Ã¥â€¦Â·", () => {
      const config: TeamMemberAgentConfig = {
        memberId: "member-2",
        displayName: "Analyst",
        role: "analyst",
        capabilities: [],
        expertiseAreas: [],
        workStyle: null,
        isLeader: false,
      };

      const tools = agent.resolveTools(config);

      expect(tools).toContain(BUILTIN_TOOLS.DATA_ANALYSIS);
      expect(tools).toContain(BUILTIN_TOOLS.PYTHON_EXECUTOR);
      expect(tools).toContain(BUILTIN_TOOLS.DATA_VALIDATION);
      expect(tools).toContain(BUILTIN_TOOLS.DATA_CLEANING);
      expect(tools).toContain(BUILTIN_TOOLS.STRUCTURED_OUTPUT);
    });

    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¤Â¸Âº developer Ã¨Â§â€™Ã¨â€°Â²Ã¥Ë†â€ Ã©â€¦ÂÃ¤Â»Â£Ã§Â ÂÃ¥Â·Â¥Ã¥â€¦Â·", () => {
      const config: TeamMemberAgentConfig = {
        memberId: "member-3",
        displayName: "Developer",
        role: "developer",
        capabilities: [],
        expertiseAreas: [],
        workStyle: null,
        isLeader: false,
      };

      const tools = agent.resolveTools(config);

      expect(tools).toContain(BUILTIN_TOOLS.CODE_GENERATION);
      expect(tools).toContain(BUILTIN_TOOLS.PYTHON_EXECUTOR);
      expect(tools).toContain(BUILTIN_TOOLS.JAVASCRIPT_EXECUTOR);
      expect(tools).toContain(BUILTIN_TOOLS.SQL_EXECUTOR);
      expect(tools).toContain(BUILTIN_TOOLS.GITHUB_INTEGRATION);
    });

    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¤Â¸Âº writer Ã¨Â§â€™Ã¨â€°Â²Ã¥Ë†â€ Ã©â€¦ÂÃ¦â€“â€¡Ã¦Â¡Â£Ã¥Â·Â¥Ã¥â€¦Â·", () => {
      const config: TeamMemberAgentConfig = {
        memberId: "member-4",
        displayName: "Writer",
        role: "writer",
        capabilities: [],
        expertiseAreas: [],
        workStyle: null,
        isLeader: false,
      };

      const tools = agent.resolveTools(config);

      expect(tools).toContain(BUILTIN_TOOLS.TEXT_GENERATION);
      expect(tools).toContain(BUILTIN_TOOLS.EXPORT_DOCX);
      expect(tools).toContain(BUILTIN_TOOLS.EXPORT_PDF);
      expect(tools).toContain(BUILTIN_TOOLS.TEMPLATE_RENDER);
      expect(tools).toContain(BUILTIN_TOOLS.WEB_SEARCH);
    });

    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¤Â¸Âº leader Ã¨Â§â€™Ã¨â€°Â²Ã¥Ë†â€ Ã©â€¦ÂÃ¥ÂÂÃ¤Â½Å“Ã¥Â·Â¥Ã¥â€¦Â·", () => {
      const config: TeamMemberAgentConfig = {
        memberId: "member-5",
        displayName: "Leader",
        role: "leader",
        capabilities: [],
        expertiseAreas: [],
        workStyle: null,
        isLeader: false,
      };

      const tools = agent.resolveTools(config);

      expect(tools).toContain(BUILTIN_TOOLS.TEXT_GENERATION);
      expect(tools).toContain(BUILTIN_TOOLS.TASK_DELEGATION);
      expect(tools).toContain(BUILTIN_TOOLS.AGENT_HANDOFF);
      expect(tools).toContain(BUILTIN_TOOLS.CONSENSUS_MECHANISM);
      expect(tools).toContain(BUILTIN_TOOLS.WORKFLOW_ORCHESTRATION);
      expect(tools).toContain(BUILTIN_TOOLS.HUMAN_APPROVAL);
    });

    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¦Â Â¹Ã¦ÂÂ® capabilities Ã¥Ë†â€ Ã©â€¦ÂÃ©Â¢ÂÃ¥Â¤â€“Ã¥Â·Â¥Ã¥â€¦Â·", () => {
      const config: TeamMemberAgentConfig = {
        memberId: "member-6",
        displayName: "GeneralMember",
        role: "general",
        capabilities: [
          AICapability.CODE_GENERATION,
          AICapability.IMAGE_GENERATION,
          AICapability.WEB_SEARCH,
        ],
        expertiseAreas: [],
        workStyle: null,
        isLeader: false,
      };

      const tools = agent.resolveTools(config);

      // CODE_GENERATION capability
      expect(tools).toContain(BUILTIN_TOOLS.CODE_GENERATION);
      expect(tools).toContain(BUILTIN_TOOLS.PYTHON_EXECUTOR);
      expect(tools).toContain(BUILTIN_TOOLS.JAVASCRIPT_EXECUTOR);

      // IMAGE_GENERATION capability
      expect(tools).toContain(BUILTIN_TOOLS.IMAGE_GENERATION);
      expect(tools).toContain(BUILTIN_TOOLS.EXPORT_IMAGE);

      // WEB_SEARCH capability
      expect(tools).toContain(BUILTIN_TOOLS.WEB_SEARCH);
      expect(tools).toContain(BUILTIN_TOOLS.WEB_SCRAPER);
    });

    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¦Â Â¹Ã¦ÂÂ® expertiseAreas Ã¦Å½Â¨Ã¦â€“Â­Ã¥Â·Â¥Ã¥â€¦Â·", () => {
      const config: TeamMemberAgentConfig = {
        memberId: "member-7",
        displayName: "Expert",
        role: "general",
        capabilities: [],
        expertiseAreas: ["数据分析", "编程", "研究"],
        workStyle: null,
        isLeader: false,
      };

      const tools = agent.resolveTools(config);

      // Ã¦â€¢Â°Ã¦ÂÂ®Ã¥Ë†â€ Ã¦Å¾ÂÃ©Â¢â€ Ã¥Å¸Å¸
      expect(tools).toContain(BUILTIN_TOOLS.DATA_ANALYSIS);
      expect(tools).toContain(BUILTIN_TOOLS.PYTHON_EXECUTOR);

      // Ã§Â¼â€“Ã§Â¨â€¹Ã©Â¢â€ Ã¥Å¸Å¸
      expect(tools).toContain(BUILTIN_TOOLS.CODE_GENERATION);

      // Ã§Â â€Ã§Â©Â¶Ã©Â¢â€ Ã¥Å¸Å¸
      expect(tools).toContain(BUILTIN_TOOLS.WEB_SEARCH);
      expect(tools).toContain(BUILTIN_TOOLS.RAG_SEARCH);
      expect(tools).toContain(BUILTIN_TOOLS.KNOWLEDGE_GRAPH);
    });

    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¤Â¸Âº Leader Ã¦Â·Â»Ã¥Å Â Ã©Â¢ÂÃ¥Â¤â€“Ã§Å¡â€žÃ¥ÂÂÃ¤Â½Å“Ã¥Â·Â¥Ã¥â€¦Â·", () => {
      const config: TeamMemberAgentConfig = {
        memberId: "member-8",
        displayName: "TeamLeader",
        role: "general",
        capabilities: [],
        expertiseAreas: [],
        workStyle: null,
        isLeader: true, // Ã¨Â®Â¾Ã§Â½Â®Ã¤Â¸Âº Leader
      };

      const tools = agent.resolveTools(config);

      expect(tools).toContain(BUILTIN_TOOLS.TASK_DELEGATION);
      expect(tools).toContain(BUILTIN_TOOLS.WORKFLOW_ORCHESTRATION);
      expect(tools).toContain(BUILTIN_TOOLS.CONSENSUS_MECHANISM);
      expect(tools).toContain(BUILTIN_TOOLS.HUMAN_APPROVAL);
    });

    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¦Â·Â»Ã¥Å Â Ã¨â€¡ÂªÃ¥Â®Å¡Ã¤Â¹â€°Ã¥Â·Â¥Ã¥â€¦Â·", () => {
      const config: TeamMemberAgentConfig = {
        memberId: "member-9",
        displayName: "CustomMember",
        role: "general",
        capabilities: [],
        expertiseAreas: [],
        workStyle: null,
        isLeader: false,
        customTools: [
          BUILTIN_TOOLS.GITHUB_INTEGRATION,
          BUILTIN_TOOLS.EMAIL_SENDER,
        ],
      };

      const tools = agent.resolveTools(config);

      expect(tools).toContain(BUILTIN_TOOLS.GITHUB_INTEGRATION);
      expect(tools).toContain(BUILTIN_TOOLS.EMAIL_SENDER);
    });

    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¤Â¸ÂºÃ¦â€°â‚¬Ã¦Å“â€°Ã¦Ë†ÂÃ¥â€˜ËœÃ¦Â·Â»Ã¥Å Â  SHORT_TERM_MEMORY", () => {
      const config: TeamMemberAgentConfig = {
        memberId: "member-10",
        displayName: "AnyMember",
        role: "general",
        capabilities: [],
        expertiseAreas: [],
        workStyle: null,
        isLeader: false,
      };

      const tools = agent.resolveTools(config);

      expect(tools).toContain(BUILTIN_TOOLS.SHORT_TERM_MEMORY);
    });

    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¥Å½Â»Ã©â€¡ÂÃ¥Â·Â¥Ã¥â€¦Â·Ã¥Ë†â€”Ã¨Â¡Â¨Ã¯Â¼Ë†Ã¤Â¸ÂÃ©â€¡ÂÃ¥Â¤ÂÃ¦Â·Â»Ã¥Å Â Ã¯Â¼â€°", () => {
      const config: TeamMemberAgentConfig = {
        memberId: "member-11",
        displayName: "MultiRoleMember",
        role: "researcher", // researcher Ã¥Å’â€¦Ã¥ÂÂ« WEB_SEARCH
        capabilities: [AICapability.WEB_SEARCH], // WEB_SEARCH capability Ã¤Â¹Å¸Ã¥Å’â€¦Ã¥ÂÂ« WEB_SEARCH
        expertiseAreas: ["Ã§Â â€Ã§Â©Â¶"], // Ã§Â â€Ã§Â©Â¶Ã©Â¢â€ Ã¥Å¸Å¸Ã¤Â¹Å¸Ã¥Å’â€¦Ã¥ÂÂ« WEB_SEARCH
        workStyle: null,
        isLeader: false,
      };

      const tools = agent.resolveTools(config);

      // Ã§Â»Å¸Ã¨Â®Â¡ WEB_SEARCH Ã¥â€¡ÂºÃ§Å½Â°Ã¦Â¬Â¡Ã¦â€¢Â°
      const webSearchCount = tools.filter(
        (t) => t === BUILTIN_TOOLS.WEB_SEARCH,
      ).length;

      expect(webSearchCount).toBe(1); // Ã¥Âºâ€Ã¨Â¯Â¥Ã¥ÂÂªÃ¥â€¡ÂºÃ§Å½Â°Ã¤Â¸â‚¬Ã¦Â¬Â¡
    });
  });

  // ==========================================================================
  // inferRoleFromDescription - Ã¤Â»Å½Ã¦ÂÂÃ¨Â¿Â°Ã¤Â¸Â­Ã¦Å½Â¨Ã¦â€“Â­Ã¨Â§â€™Ã¨â€°Â²
  // ==========================================================================

  describe("inferRoleFromDescription", () => {
    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¤Â»Å½Ã¦ÂÂÃ¨Â¿Â°Ã¤Â¸Â­Ã¦Å½Â¨Ã¦â€“Â­ leader Ã¨Â§â€™Ã¨â€°Â²", () => {
      expect(agent.inferRoleFromDescription("Team Leader")).toBe("leader");
      expect(agent.inferRoleFromDescription("项目负责人")).toBe("leader");
      expect(agent.inferRoleFromDescription("团队领导")).toBe("leader");
      expect(agent.inferRoleFromDescription("项目经理")).toBe("leader");
    });

    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¤Â»Å½Ã¦ÂÂÃ¨Â¿Â°Ã¤Â¸Â­Ã¦Å½Â¨Ã¦â€“Â­ researcher Ã¨Â§â€™Ã¨â€°Â²", () => {
      expect(agent.inferRoleFromDescription("Researcher")).toBe("researcher");
      expect(agent.inferRoleFromDescription("负责研究工作")).toBe("researcher");
      expect(agent.inferRoleFromDescription("市场调研专员")).toBe("researcher");
    });

    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¤Â»Å½Ã¦ÂÂÃ¨Â¿Â°Ã¤Â¸Â­Ã¦Å½Â¨Ã¦â€“Â­ analyst Ã¨Â§â€™Ã¨â€°Â²", () => {
      expect(agent.inferRoleFromDescription("Data Analyst")).toBe("analyst");
      expect(agent.inferRoleFromDescription("数据分析师")).toBe("analyst");
      expect(agent.inferRoleFromDescription("负责数据分析")).toBe("analyst");
    });

    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¤Â»Å½Ã¦ÂÂÃ¨Â¿Â°Ã¤Â¸Â­Ã¦Å½Â¨Ã¦â€“Â­ developer Ã¨Â§â€™Ã¨â€°Â²", () => {
      expect(agent.inferRoleFromDescription("Software Developer")).toBe(
        "developer",
      );
      expect(agent.inferRoleFromDescription("开发工程师")).toBe("developer");
      expect(agent.inferRoleFromDescription("前端程序员")).toBe("developer");
      expect(agent.inferRoleFromDescription("Engineer")).toBe("developer");
    });

    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¤Â»Å½Ã¦ÂÂÃ¨Â¿Â°Ã¤Â¸Â­Ã¦Å½Â¨Ã¦â€“Â­ designer Ã¨Â§â€™Ã¨â€°Â²", () => {
      expect(agent.inferRoleFromDescription("UI Designer")).toBe("designer");
      expect(agent.inferRoleFromDescription("美术设计师")).toBe("designer");
      expect(agent.inferRoleFromDescription("负责设计工作")).toBe("designer");
    });

    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¤Â»Å½Ã¦ÂÂÃ¨Â¿Â°Ã¤Â¸Â­Ã¦Å½Â¨Ã¦â€“Â­ writer Ã¨Â§â€™Ã¨â€°Â²", () => {
      expect(agent.inferRoleFromDescription("Content Writer")).toBe("writer");
      expect(agent.inferRoleFromDescription("文案编辑")).toBe("writer");
      expect(agent.inferRoleFromDescription("负责写作工作")).toBe("writer");
    });

    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¤Â»Å½Ã¦ÂÂÃ¨Â¿Â°Ã¤Â¸Â­Ã¦Å½Â¨Ã¦â€“Â­ moderator Ã¨Â§â€™Ã¨â€°Â²", () => {
      expect(agent.inferRoleFromDescription("Moderator")).toBe("moderator");
      expect(agent.inferRoleFromDescription("主持人")).toBe("moderator");
      expect(agent.inferRoleFromDescription("协调员")).toBe("moderator");
    });

    it("Ã¦â€”Â Ã¦Â³â€¢Ã¨Â¯â€ Ã¥Ë†Â«Ã¦â€”Â¶Ã¥Âºâ€Ã¨Â¯Â¥Ã¨Â¿â€Ã¥â€ºÅ¾ general", () => {
      expect(agent.inferRoleFromDescription("Some random description")).toBe(
        "general",
      );
      expect(agent.inferRoleFromDescription(null)).toBe("general");
      expect(agent.inferRoleFromDescription(undefined)).toBe("general");
      expect(agent.inferRoleFromDescription("")).toBe("general");
    });

    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¥Â¤Â§Ã¥Â°ÂÃ¥â€ â„¢Ã¤Â¸ÂÃ¦â€¢ÂÃ¦â€žÅ¸", () => {
      expect(agent.inferRoleFromDescription("LEADER")).toBe("leader");
      expect(agent.inferRoleFromDescription("ReSeArChEr")).toBe("researcher");
      expect(agent.inferRoleFromDescription("DEVELOPER")).toBe("developer");
    });
  });

  // ==========================================================================
  // getToolInstances - Ã¨Å½Â·Ã¥Ââ€“Ã¥Â·Â¥Ã¥â€¦Â·Ã¥Â®Å¾Ã¤Â¾â€¹
  // ==========================================================================

  describe("getToolInstances", () => {
    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¨Â¿â€Ã¥â€ºÅ¾Ã¥Â·Â²Ã¦Â³Â¨Ã¥â€ Å’Ã§Å¡â€žÃ¥Â·Â¥Ã¥â€¦Â·Ã¥Â®Å¾Ã¤Â¾â€¹Ã¥Ë†â€”Ã¨Â¡Â¨", () => {
      const toolTypes = [
        BUILTIN_TOOLS.WEB_SEARCH,
        BUILTIN_TOOLS.CODE_GENERATION,
      ];

      const instances = agent.getToolInstances(toolTypes);

      expect(instances).toHaveLength(2);
      expect(instances[0]).toBe(mockWebSearch);
      expect(instances[1]).toBe(mockCodeGen);
    });

    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¨Â·Â³Ã¨Â¿â€¡Ã¦Å“ÂªÃ¦Â³Â¨Ã¥â€ Å’Ã§Å¡â€žÃ¥Â·Â¥Ã¥â€¦Â·Ã¥Â¹Â¶Ã¨Â®Â°Ã¥Â½â€¢Ã¨Â­Â¦Ã¥â€˜Å ", () => {
      const toolTypes = [
        BUILTIN_TOOLS.WEB_SEARCH,
        BUILTIN_TOOLS.IMAGE_GENERATION, // Ã¦Å“ÂªÃ¦Â³Â¨Ã¥â€ Å’
        BUILTIN_TOOLS.CODE_GENERATION,
      ];

      const instances = agent.getToolInstances(toolTypes);

      // Ã¥Âºâ€Ã¨Â¯Â¥Ã¥ÂÂªÃ¨Â¿â€Ã¥â€ºÅ¾Ã¥Â·Â²Ã¦Â³Â¨Ã¥â€ Å’Ã§Å¡â€žÃ¥Â·Â¥Ã¥â€¦Â·
      expect(instances).toHaveLength(2);
      expect(instances[0]).toBe(mockWebSearch);
      expect(instances[1]).toBe(mockCodeGen);
    });

    it("Ã§Â©ÂºÃ¥Ë†â€”Ã¨Â¡Â¨Ã¥Âºâ€Ã¨Â¯Â¥Ã¨Â¿â€Ã¥â€ºÅ¾Ã§Â©ÂºÃ¦â€¢Â°Ã§Â»â€ž", () => {
      const instances = agent.getToolInstances([]);

      expect(instances).toHaveLength(0);
    });
  });

  // ==========================================================================
  // executeTool - Ã¦â€°Â§Ã¨Â¡Å’Ã¥Ââ€¢Ã¤Â¸ÂªÃ¥Â·Â¥Ã¥â€¦Â·
  // ==========================================================================

  describe("executeTool", () => {
    const context = {
      topicId: "topic-1",
      memberId: "member-1",
      messageId: "message-1",
      prompt: "Test prompt",
    };

    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¦Ë†ÂÃ¥Å Å¸Ã¦â€°Â§Ã¨Â¡Å’Ã¥Â·Â¥Ã¥â€¦Â·", async () => {
      const result = await agent.executeTool(
        BUILTIN_TOOLS.WEB_SEARCH,
        { query: "test query" },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.toolType).toBe(BUILTIN_TOOLS.WEB_SEARCH);
      expect(result.output).toEqual({ results: ["Result for: test query"] });
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeUndefined();
    });

    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¥Â¤â€žÃ§Ââ€ Ã¥Â·Â¥Ã¥â€¦Â·Ã¦Å“ÂªÃ¦â€°Â¾Ã¥Ë†Â°Ã§Å¡â€žÃ¦Æ’â€¦Ã¥â€ Âµ", async () => {
      const result = await agent.executeTool(
        BUILTIN_TOOLS.IMAGE_GENERATION, // Ã¦Å“ÂªÃ¦Â³Â¨Ã¥â€ Å’
        { prompt: "test" },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.toolType).toBe(BUILTIN_TOOLS.IMAGE_GENERATION);
      expect(result.error).toContain("Tool not found");
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¥Â¤â€žÃ§Ââ€ Ã¥Â·Â¥Ã¥â€¦Â·Ã¦â€°Â§Ã¨Â¡Å’Ã¥Â¤Â±Ã¨Â´Â¥Ã§Å¡â€žÃ¦Æ’â€¦Ã¥â€ Âµ", async () => {
      // Mock Ã¥Â·Â¥Ã¥â€¦Â·Ã¦Å â€ºÃ¥â€¡ÂºÃ©â€â„¢Ã¨Â¯Â¯
      jest
        .spyOn(mockCodeGen, "execute")
        .mockRejectedValueOnce(new Error("Execution failed"));

      const result = await agent.executeTool(
        BUILTIN_TOOLS.CODE_GENERATION,
        { prompt: "test" },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.toolType).toBe(BUILTIN_TOOLS.CODE_GENERATION);
      expect(result.error).toBe("Execution failed");
    });

    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¨Â¿â€Ã¥â€ºÅ¾Ã¦â€°Â§Ã¨Â¡Å’Ã¦â€”Â¶Ã©â€¢Â¿", async () => {
      const result = await agent.executeTool(
        BUILTIN_TOOLS.WEB_SEARCH,
        { query: "test" },
        context,
      );

      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe("number");
    });
  });

  // ==========================================================================
  // executeToolsParallel - Ã¥Â¹Â¶Ã¨Â¡Å’Ã¦â€°Â§Ã¨Â¡Å’Ã¥Â¤Å¡Ã¤Â¸ÂªÃ¥Â·Â¥Ã¥â€¦Â·
  // ==========================================================================

  describe("executeToolsParallel", () => {
    const context = {
      topicId: "topic-1",
      memberId: "member-1",
      prompt: "Test prompt",
    };

    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¥Â¹Â¶Ã¨Â¡Å’Ã¦â€°Â§Ã¨Â¡Å’Ã¥Â¤Å¡Ã¤Â¸ÂªÃ¥Â·Â¥Ã¥â€¦Â·", async () => {
      const executions = [
        { toolType: BUILTIN_TOOLS.WEB_SEARCH, input: { query: "query1" } },
        {
          toolType: BUILTIN_TOOLS.CODE_GENERATION,
          input: { prompt: "prompt1" },
        },
        { toolType: BUILTIN_TOOLS.DATA_ANALYSIS, input: { data: {} } },
      ];

      const results = await agent.executeToolsParallel(executions, context);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(results[2].success).toBe(true);
    });

    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¥Â¤â€žÃ§Ââ€ Ã©Æ’Â¨Ã¥Ë†â€ Ã¥Â·Â¥Ã¥â€¦Â·Ã¥Â¤Â±Ã¨Â´Â¥Ã§Å¡â€žÃ¦Æ’â€¦Ã¥â€ Âµ", async () => {
      jest
        .spyOn(mockCodeGen, "execute")
        .mockRejectedValueOnce(new Error("Failed"));

      const executions = [
        { toolType: BUILTIN_TOOLS.WEB_SEARCH, input: { query: "query1" } },
        {
          toolType: BUILTIN_TOOLS.CODE_GENERATION,
          input: { prompt: "prompt1" },
        },
      ];

      const results = await agent.executeToolsParallel(executions, context);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBe("Failed");
    });
  });

  // ==========================================================================
  // executeToolsSequential - Ã©Â¡ÂºÃ¥ÂºÂÃ¦â€°Â§Ã¨Â¡Å’Ã¥Â¤Å¡Ã¤Â¸ÂªÃ¥Â·Â¥Ã¥â€¦Â·
  // ==========================================================================

  describe("executeToolsSequential", () => {
    const context = {
      topicId: "topic-1",
      memberId: "member-1",
      prompt: "Test prompt",
    };

    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¦Å’â€°Ã©Â¡ÂºÃ¥ÂºÂÃ¦â€°Â§Ã¨Â¡Å’Ã¥Â¤Å¡Ã¤Â¸ÂªÃ¥Â·Â¥Ã¥â€¦Â·", async () => {
      const executions = [
        { toolType: BUILTIN_TOOLS.WEB_SEARCH, input: { query: "query1" } },
        {
          toolType: BUILTIN_TOOLS.CODE_GENERATION,
          input: { prompt: "prompt1" },
        },
      ];

      const results = await agent.executeToolsSequential(executions, context);

      expect(results).toHaveLength(2);
      expect(results[0].toolType).toBe(BUILTIN_TOOLS.WEB_SEARCH);
      expect(results[1].toolType).toBe(BUILTIN_TOOLS.CODE_GENERATION);
    });

    it("Ã¥Â¤Â±Ã¨Â´Â¥Ã¥ÂÅ½Ã¥Âºâ€Ã¨Â¯Â¥Ã§Â»Â§Ã§Â»Â­Ã¦â€°Â§Ã¨Â¡Å’Ã¥â€°Â©Ã¤Â½â„¢Ã¥Â·Â¥Ã¥â€¦Â·", async () => {
      jest
        .spyOn(mockCodeGen, "execute")
        .mockRejectedValueOnce(new Error("Failed"));

      const executions = [
        {
          toolType: BUILTIN_TOOLS.CODE_GENERATION,
          input: { prompt: "prompt1" },
        },
        { toolType: BUILTIN_TOOLS.WEB_SEARCH, input: { query: "query1" } },
      ];

      const results = await agent.executeToolsSequential(executions, context);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(false);
      expect(results[1].success).toBe(true); // Ã¥Âºâ€Ã¨Â¯Â¥Ã§Â»Â§Ã§Â»Â­Ã¦â€°Â§Ã¨Â¡Å’
    });
  });

  // ==========================================================================
  // generateFunctionCallingSchema - Ã§â€Å¸Ã¦Ë†Â Function Calling Schema
  // ==========================================================================

  describe("generateFunctionCallingSchema", () => {
    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã§â€Å¸Ã¦Ë†ÂÃ¦Â­Â£Ã§Â¡Â®Ã§Å¡â€ž Function Calling Schema", () => {
      const toolTypes = [
        BUILTIN_TOOLS.WEB_SEARCH,
        BUILTIN_TOOLS.CODE_GENERATION,
      ];

      const schemas = agent.generateFunctionCallingSchema(toolTypes);

      expect(schemas).toHaveLength(2);
      expect(schemas[0].name).toBe(BUILTIN_TOOLS.WEB_SEARCH);
      expect(schemas[0].description).toBe("Mock web search tool");
      expect(schemas[0].parameters).toEqual(mockWebSearch.inputSchema);

      expect(schemas[1].name).toBe(BUILTIN_TOOLS.CODE_GENERATION);
      expect(schemas[1].description).toBe("Mock code generation tool");
      expect(schemas[1].parameters).toEqual(mockCodeGen.inputSchema);
    });

    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¨Â·Â³Ã¨Â¿â€¡Ã¦Å“ÂªÃ¦Â³Â¨Ã¥â€ Å’Ã§Å¡â€žÃ¥Â·Â¥Ã¥â€¦Â·", () => {
      const toolTypes = [
        BUILTIN_TOOLS.WEB_SEARCH,
        BUILTIN_TOOLS.IMAGE_GENERATION, // Ã¦Å“ÂªÃ¦Â³Â¨Ã¥â€ Å’
      ];

      const schemas = agent.generateFunctionCallingSchema(toolTypes);

      expect(schemas).toHaveLength(1); // Ã¥ÂÂªÃ¦Å“â€°Ã¥Â·Â²Ã¦Â³Â¨Ã¥â€ Å’Ã§Å¡â€žÃ¥Â·Â¥Ã¥â€¦Â·
      expect(schemas[0].name).toBe(BUILTIN_TOOLS.WEB_SEARCH);
    });
  });

  // ==========================================================================
  // buildToolsSystemPrompt - Ã¦Å¾â€žÃ¥Â»ÂºÃ¥Â·Â¥Ã¥â€¦Â·Ã§Â³Â»Ã§Â»Å¸Ã¦ÂÂÃ§Â¤ÂºÃ¨Â¯Â
  // ==========================================================================

  describe("buildToolsSystemPrompt", () => {
    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã§â€Å¸Ã¦Ë†ÂÃ¥Å’â€¦Ã¥ÂÂ«Ã¥Â·Â¥Ã¥â€¦Â·Ã¦ÂÂÃ¨Â¿Â°Ã§Å¡â€žÃ¦ÂÂÃ§Â¤ÂºÃ¨Â¯Â", () => {
      const toolTypes = [
        BUILTIN_TOOLS.WEB_SEARCH,
        BUILTIN_TOOLS.CODE_GENERATION,
      ];

      const prompt = agent.buildToolsSystemPrompt(toolTypes);

      expect(prompt).toContain("可用工具");
      expect(prompt).toContain("web-search");
      expect(prompt).toContain("Mock web search tool");
      expect(prompt).toContain("code-generation");
      expect(prompt).toContain("Mock code generation tool");
    });

    it("Ã§Â©ÂºÃ¥Â·Â¥Ã¥â€¦Â·Ã¥Ë†â€”Ã¨Â¡Â¨Ã¥Âºâ€Ã¨Â¯Â¥Ã¨Â¿â€Ã¥â€ºÅ¾Ã§Â©ÂºÃ¥Â­â€”Ã§Â¬Â¦Ã¤Â¸Â²", () => {
      const prompt = agent.buildToolsSystemPrompt([]);

      expect(prompt).toBe("");
    });

    it("Ã¥Âºâ€Ã¨Â¯Â¥Ã¨Â·Â³Ã¨Â¿â€¡Ã¦Å“ÂªÃ¦Â³Â¨Ã¥â€ Å’Ã§Å¡â€žÃ¥Â·Â¥Ã¥â€¦Â·", () => {
      const toolTypes = [
        BUILTIN_TOOLS.WEB_SEARCH,
        BUILTIN_TOOLS.IMAGE_GENERATION, // Ã¦Å“ÂªÃ¦Â³Â¨Ã¥â€ Å’
      ];

      const prompt = agent.buildToolsSystemPrompt(toolTypes);

      expect(prompt).toContain("web-search");
      expect(prompt).not.toContain("image-generation");
    });
  });

  // ==========================================================================
  // getExecutionStrategy - Ã¨Å½Â·Ã¥Ââ€“Ã¦â€°Â§Ã¨Â¡Å’Ã§Â­â€“Ã§â€¢Â¥
  // ==========================================================================

  describe("getExecutionStrategy", () => {
    it("AUTONOMOUS Ã¥Â·Â¥Ã¤Â½Å“Ã©Â£Å½Ã¦Â Â¼Ã¥Âºâ€Ã¨Â¯Â¥Ã¨Â¿â€Ã¥â€ºÅ¾Ã¥Â¹Â¶Ã¨Â¡Å’Ã£â‚¬ÂÃ©Â«ËœÃ¥Â¹Â¶Ã¥Ââ€˜Ã§Â­â€“Ã§â€¢Â¥", () => {
      const strategy = agent.getExecutionStrategy(AgentWorkStyle.AUTONOMOUS);

      expect(strategy.parallel).toBe(true);
      expect(strategy.maxConcurrent).toBe(5);
      expect(strategy.retryOnFailure).toBe(true);
      expect(strategy.timeoutMs).toBe(60000);
    });

    it("COLLABORATIVE Ã¥Â·Â¥Ã¤Â½Å“Ã©Â£Å½Ã¦Â Â¼Ã¥Âºâ€Ã¨Â¯Â¥Ã¨Â¿â€Ã¥â€ºÅ¾Ã¤Â¸Â­Ã§Â­â€°Ã¥Â¹Â¶Ã¥Ââ€˜Ã§Â­â€“Ã§â€¢Â¥", () => {
      const strategy = agent.getExecutionStrategy(AgentWorkStyle.COLLABORATIVE);

      expect(strategy.parallel).toBe(true);
      expect(strategy.maxConcurrent).toBe(3);
      expect(strategy.retryOnFailure).toBe(true);
      expect(strategy.timeoutMs).toBe(45000);
    });

    it("ANALYTICAL Ã¥Â·Â¥Ã¤Â½Å“Ã©Â£Å½Ã¦Â Â¼Ã¥Âºâ€Ã¨Â¯Â¥Ã¨Â¿â€Ã¥â€ºÅ¾Ã©Â¡ÂºÃ¥ÂºÂÃ¦â€°Â§Ã¨Â¡Å’Ã§Â­â€“Ã§â€¢Â¥", () => {
      const strategy = agent.getExecutionStrategy(AgentWorkStyle.ANALYTICAL);

      expect(strategy.parallel).toBe(false);
      expect(strategy.maxConcurrent).toBe(1);
      expect(strategy.retryOnFailure).toBe(true);
      expect(strategy.timeoutMs).toBe(90000); // Ã¦â€ºÂ´Ã©â€¢Â¿Ã§Å¡â€žÃ¨Â¶â€¦Ã¦â€”Â¶Ã¦â€”Â¶Ã©â€”Â´
    });

    it("CREATIVE Ã¥Â·Â¥Ã¤Â½Å“Ã©Â£Å½Ã¦Â Â¼Ã¥Âºâ€Ã¨Â¯Â¥Ã¨Â¿â€Ã¥â€ºÅ¾Ã¥Â¹Â¶Ã¨Â¡Å’Ã£â‚¬ÂÃ¤Â¸ÂÃ©â€¡ÂÃ¨Â¯â€¢Ã§Â­â€“Ã§â€¢Â¥", () => {
      const strategy = agent.getExecutionStrategy(AgentWorkStyle.CREATIVE);

      expect(strategy.parallel).toBe(true);
      expect(strategy.maxConcurrent).toBe(4);
      expect(strategy.retryOnFailure).toBe(false); // Ã¥Ë†â€ºÃ¦â€žÂÃ¥Â·Â¥Ã¤Â½Å“Ã¤Â¸ÂÃ©â€¡ÂÃ¨Â¯â€¢
      expect(strategy.timeoutMs).toBe(60000);
    });

    it("SUPPORTIVE Ã¥Â·Â¥Ã¤Â½Å“Ã©Â£Å½Ã¦Â Â¼Ã¥Âºâ€Ã¨Â¯Â¥Ã¨Â¿â€Ã¥â€ºÅ¾Ã¤Â½Å½Ã¥Â¹Â¶Ã¥Ââ€˜Ã§Â­â€“Ã§â€¢Â¥", () => {
      const strategy = agent.getExecutionStrategy(AgentWorkStyle.SUPPORTIVE);

      expect(strategy.parallel).toBe(false);
      expect(strategy.maxConcurrent).toBe(2);
      expect(strategy.retryOnFailure).toBe(true);
      expect(strategy.timeoutMs).toBe(30000);
    });

    it("null Ã¥Â·Â¥Ã¤Â½Å“Ã©Â£Å½Ã¦Â Â¼Ã¥Âºâ€Ã¨Â¯Â¥Ã¨Â¿â€Ã¥â€ºÅ¾Ã©Â»ËœÃ¨Â®Â¤Ã§Â­â€“Ã§â€¢Â¥", () => {
      const strategy = agent.getExecutionStrategy(null);

      expect(strategy.parallel).toBe(true);
      expect(strategy.maxConcurrent).toBe(3);
      expect(strategy.retryOnFailure).toBe(true);
      expect(strategy.timeoutMs).toBe(45000);
    });
  });
});
