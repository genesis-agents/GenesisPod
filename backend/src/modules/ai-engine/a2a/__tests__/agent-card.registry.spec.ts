/**
 * Agent Card Registry Tests
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { AgentCardRegistry } from "../agent-card/agent-card.registry";
import { APP_CONFIG } from "../../../../common/config/app.config";

describe("AgentCardRegistry", () => {
  let registry: AgentCardRegistry;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentCardRegistry,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === "PORT") return 3001;
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    registry = module.get<AgentCardRegistry>(AgentCardRegistry);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe("getAgentCard", () => {
    it("应该返回完整的 Agent Card", () => {
      const card = registry.getAgentCard();

      expect(card).toBeDefined();
      expect(card.name).toBe(APP_CONFIG.brand.fullName);
      expect(card.version).toBe("1.0.0");
      expect(card.provider.organization).toBe(APP_CONFIG.brand.name);
    });

    it("应该包含正确的能力配置", () => {
      const card = registry.getAgentCard();

      expect(card.capabilities).toMatchObject({
        streaming: false,
        pushNotifications: true,
        stateTransitionHistory: true,
      });
    });

    it("应该包含认证配置", () => {
      const card = registry.getAgentCard();

      expect(card.authentication?.schemes).toContain("Bearer");
      expect(card.authentication?.schemes).toContain("X-API-Key");
    });

    it("应该包含至少 5 个技能", () => {
      const card = registry.getAgentCard();

      expect(card.skills.length).toBeGreaterThanOrEqual(5);
    });

    it("应该包含必要的技能", () => {
      const card = registry.getAgentCard();
      const skillIds = card.skills.map((s) => s.id);

      expect(skillIds).toContain("deep-research");
      expect(skillIds).toContain("ai-ask");
      expect(skillIds).toContain("team-debate");
      expect(skillIds).toContain("document-generation");
      expect(skillIds).toContain("ai-writing");
    });
  });

  describe("getSkills", () => {
    it("应该返回技能列表", () => {
      const skills = registry.getSkills();

      expect(Array.isArray(skills)).toBe(true);
      expect(skills.length).toBeGreaterThan(0);
    });

    it("每个技能应该有必需的字段", () => {
      const skills = registry.getSkills();

      skills.forEach((skill) => {
        expect(skill).toHaveProperty("id");
        expect(skill).toHaveProperty("name");
        expect(skill).toHaveProperty("description");
        expect(skill).toHaveProperty("tags");
        expect(Array.isArray(skill.tags)).toBe(true);
      });
    });
  });

  describe("getSkillById", () => {
    it("应该根据 ID 返回技能", () => {
      const skill = registry.getSkillById("deep-research");

      expect(skill).toBeDefined();
      expect(skill?.id).toBe("deep-research");
      expect(skill?.name).toBe("Deep Research");
    });

    it("不存在的技能应该返回 undefined", () => {
      const skill = registry.getSkillById("non-existent-skill");

      expect(skill).toBeUndefined();
    });
  });

  describe("isValidSkill", () => {
    it("有效的技能 ID 应该返回 true", () => {
      expect(registry.isValidSkill("deep-research")).toBe(true);
      expect(registry.isValidSkill("ai-ask")).toBe(true);
    });

    it("无效的技能 ID 应该返回 false", () => {
      expect(registry.isValidSkill("invalid-skill")).toBe(false);
    });
  });

  describe("URL configuration", () => {
    it("应该使用 AGENT_BASE_URL 环境变量", () => {
      const testUrl = "https://api.genesis.ai";
      jest.spyOn(configService, "get").mockImplementation((key: string) => {
        if (key === "AGENT_BASE_URL") return testUrl;
        return undefined;
      });

      const card = registry.getAgentCard();
      expect(card.url).toContain(testUrl);
      expect(card.provider.url).toBe(testUrl);
    });

    it("应该 fallback 到 API_URL", () => {
      const testUrl = "https://api.genesis.ai";
      jest.spyOn(configService, "get").mockImplementation((key: string) => {
        if (key === "API_URL") return testUrl;
        if (key === "AGENT_BASE_URL") return undefined;
        return undefined;
      });

      const card = registry.getAgentCard();
      expect(card.url).toContain(testUrl);
    });

    it("应该使用默认 localhost URL", () => {
      jest.spyOn(configService, "get").mockImplementation((key: string) => {
        if (key === "PORT") return 3001;
        return undefined;
      });

      const card = registry.getAgentCard();
      expect(card.url).toContain("localhost:3001");
    });
  });
});
