/**
 * Unit tests for A2ATeamMemberAdapter
 */

import { Logger } from "@nestjs/common";
import { A2ATeamMemberAdapter } from "../../../../../ai-kernel/facade";
import {
  A2ATaskStatus,
  A2AAgentCard,
} from "../../../../../ai-kernel/ipc/a2a/a2a.types";

function makeAgentCard(overrides: Partial<A2AAgentCard> = {}): A2AAgentCard {
  return {
    name: "Research Bot",
    description: "An AI research assistant",
    url: "https://researchbot.example.com/a2a",
    provider: {
      organization: "ResearchCo",
      url: "https://researchco.com",
    },
    version: "2.1.0",
    capabilities: {
      streaming: false,
      pushNotifications: true,
      stateTransitionHistory: true,
    },
    defaultInputModes: ["text", "text/plain"],
    defaultOutputModes: ["text/markdown"],
    skills: [
      {
        id: "web-search",
        name: "Web Search",
        description: "Search the web",
        tags: ["search", "web"],
      },
      {
        id: "summarize",
        name: "Summarize",
        description: "Summarize content",
        tags: ["nlp"],
      },
    ],
    ...overrides,
  };
}

describe("A2ATeamMemberAdapter", () => {
  let adapter: A2ATeamMemberAdapter;
  let agentCard: A2AAgentCard;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, "log").mockReturnValue(undefined);
    jest.spyOn(Logger.prototype, "error").mockReturnValue(undefined);
    jest.spyOn(Logger.prototype, "warn").mockReturnValue(undefined);
    jest.spyOn(Logger.prototype, "debug").mockReturnValue(undefined);
    agentCard = makeAgentCard();
    adapter = new A2ATeamMemberAdapter(agentCard);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("constructor", () => {
    it("sets name from agent card", () => {
      expect(adapter.name).toBe("Research Bot");
    });

    it("sets model based on version", () => {
      expect(adapter.model).toBe("external-a2a-2.1.0");
    });

    it("derives skills from agent card skills", () => {
      expect(adapter.skills).toEqual(["web-search", "summarize"]);
    });

    it("sets empty tools array (external agents manage their own)", () => {
      expect(adapter.tools).toEqual([]);
    });

    it("uses agent description as persona", () => {
      expect(adapter.persona).toBe("An AI research assistant");
    });

    it("sets initial status to idle by default", () => {
      expect(adapter.status).toBe("idle");
    });

    it("accepts custom ID via options", () => {
      const customAdapter = new A2ATeamMemberAdapter(agentCard, {
        id: "custom-id-123",
      });
      expect(customAdapter.id).toBe("custom-id-123");
    });

    it("accepts custom initial status via options", () => {
      const customAdapter = new A2ATeamMemberAdapter(agentCard, {
        status: "waiting",
      });
      expect(customAdapter.status).toBe("waiting");
    });

    it("generates a unique ID when none is provided", () => {
      const adapter1 = new A2ATeamMemberAdapter(agentCard);
      const adapter2 = new A2ATeamMemberAdapter(agentCard);
      expect(adapter1.id).not.toBe(adapter2.id);
      expect(adapter1.id).toMatch(/^a2a-member-/);
    });

    it("stores metadata with type=a2a-external and agentUrl", () => {
      expect(adapter.metadata?.type).toBe("a2a-external");
      expect(adapter.metadata?.agentUrl).toBe(
        "https://researchbot.example.com/a2a",
      );
      expect(adapter.metadata?.provider).toEqual({
        organization: "ResearchCo",
        url: "https://researchco.com",
      });
    });

    it("stores version in metadata", () => {
      expect(adapter.metadata?.version).toBe("2.1.0");
    });

    it("stores capabilities in metadata", () => {
      expect(adapter.metadata?.capabilities).toEqual({
        streaming: false,
        pushNotifications: true,
        stateTransitionHistory: true,
      });
    });
  });

  describe("role", () => {
    it("creates an ExternalA2ARole with correct ID derived from name", () => {
      expect(adapter.role.id).toBe("a2a-research-bot");
    });

    it("sets role name from agent card name", () => {
      expect(adapter.role.name).toBe("Research Bot");
    });

    it("sets role type to member", () => {
      expect(adapter.role.type).toBe("member");
    });

    it("maps agent skills to role coreSkills", () => {
      expect(adapter.role.coreSkills).toEqual(["web-search", "summarize"]);
    });

    it("includes limitations for external agents", () => {
      expect(adapter.role.limitations).toContain("Cannot act as team leader");
      expect(adapter.role.limitations).toContain(
        "Cannot access internal Genesis resources directly",
      );
    });
  });

  describe("workStyle", () => {
    it("sets independent collaboration style for external agents", () => {
      expect(adapter.workStyle.collaborationStyle).toBe("independent");
    });

    it("sets standard thinking depth", () => {
      expect(adapter.workStyle.thinkingDepth).toBe("standard");
    });

    it("sets conservative risk tolerance", () => {
      expect(adapter.workStyle.riskTolerance).toBe("conservative");
    });
  });

  describe("isLeader", () => {
    it("always returns false - A2A agents cannot be leaders", () => {
      expect(adapter.isLeader()).toBe(false);
    });
  });

  describe("hasSkill", () => {
    it("returns true when agent has the specified skill", () => {
      expect(adapter.hasSkill("web-search")).toBe(true);
      expect(adapter.hasSkill("summarize")).toBe(true);
    });

    it("returns false when agent does not have the specified skill", () => {
      expect(adapter.hasSkill("code-generation")).toBe(false);
    });
  });

  describe("hasTool", () => {
    it("always returns false - external agents manage their own tools", () => {
      expect(adapter.hasTool("any-tool")).toBe(false);
      expect(adapter.hasTool("web-browser")).toBe(false);
    });
  });

  describe("getSystemPrompt", () => {
    it("returns the agent card description", () => {
      expect(adapter.getSystemPrompt()).toBe("An AI research assistant");
    });
  });

  describe("getAgentCard", () => {
    it("returns the underlying agent card", () => {
      expect(adapter.getAgentCard()).toEqual(agentCard);
    });
  });

  describe("getAgentUrl", () => {
    it("returns the agent URL from the card", () => {
      expect(adapter.getAgentUrl()).toBe("https://researchbot.example.com/a2a");
    });
  });

  describe("updateStatusFromA2ATask", () => {
    it("updates status to waiting for PENDING", () => {
      adapter.updateStatusFromA2ATask(A2ATaskStatus.PENDING);
      expect(adapter.status).toBe("waiting");
    });

    it("updates status to executing for RUNNING", () => {
      adapter.updateStatusFromA2ATask(A2ATaskStatus.RUNNING);
      expect(adapter.status).toBe("executing");
    });

    it("updates status to completed for COMPLETED", () => {
      adapter.updateStatusFromA2ATask(A2ATaskStatus.COMPLETED);
      expect(adapter.status).toBe("completed");
    });

    it("updates status to failed for FAILED", () => {
      adapter.updateStatusFromA2ATask(A2ATaskStatus.FAILED);
      expect(adapter.status).toBe("failed");
    });

    it("maps CANCELLED to failed status", () => {
      adapter.updateStatusFromA2ATask(A2ATaskStatus.CANCELLED);
      expect(adapter.status).toBe("failed");
    });
  });

  describe("name with spaces", () => {
    it("correctly handles agent names with multiple spaces in role ID", () => {
      const card = makeAgentCard({ name: "AI Research Agent" });
      const newAdapter = new A2ATeamMemberAdapter(card);
      expect(newAdapter.role.id).toBe("a2a-ai-research-agent");
    });
  });
});
