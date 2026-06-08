/**
 * MarketplaceCatalogService
 *
 * Projects the platform registries (ToolRegistry / TeamRegistry /
 * BuiltinSkillCatalog + SkillRegistry) into the 4-shelf marketplace catalog
 * consumed by the "一人公司 OS" agent-marketplace frontend.
 *
 * This service is read-only: it never mutates registry state.
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  ToolRegistry,
  TeamRegistry,
  BuiltinSkillCatalog,
} from "@/modules/ai-harness/facade";
import { SkillRegistry } from "@/modules/ai-engine/facade";
import {
  PLATFORM_AGENT_IDS,
  PLATFORM_AGENT_METAS,
} from "@/modules/ai-app/contracts/agent-catalog";
import type {
  AgentCatalogItem,
  SkillCatalogItem,
  ToolCatalogItem,
  WorkflowCatalogItem,
  MarketplaceCatalog,
} from "../api/dto/marketplace.dto";

/** 截断长文本（技能指令正文），保留可读预览。 */
function truncate(text: string | undefined, max: number): string {
  if (!text) return "";
  const t = text.trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

@Injectable()
export class MarketplaceCatalogService {
  private readonly logger = new Logger(MarketplaceCatalogService.name);

  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly teamRegistry: TeamRegistry,
    private readonly builtinSkillCatalog: BuiltinSkillCatalog,
    private readonly skillRegistry: SkillRegistry,
  ) {}

  getCatalog(): MarketplaceCatalog {
    return {
      agents: this.getAgents(),
      skills: this.getSkills(),
      tools: this.getTools(),
      workflows: this.getWorkflows(),
    };
  }

  getAgents(): AgentCatalogItem[] {
    return PLATFORM_AGENT_IDS.map((id) => {
      const meta = PLATFORM_AGENT_METAS[id];
      return {
        id: meta.id,
        name: meta.name,
        description: meta.description,
        role: meta.name,
        category: "平台",
        tags: meta.capabilities,
        capabilities: meta.capabilities,
        skillIds: [],
        toolIds: [],
        defaultModel: "",
      } satisfies AgentCatalogItem;
    });
  }

  getSkills(): SkillCatalogItem[] {
    const items: SkillCatalogItem[] = [];

    // Source 1: harness BuiltinSkillCatalog (SKILL.md files)
    try {
      for (const skill of this.builtinSkillCatalog.all()) {
        const fm = skill.frontmatter;
        items.push({
          id: fm.name,
          name: fm.name,
          description: fm.description,
          category: "general",
          tags: fm.tags ? [...fm.tags] : [],
          activatesFor: fm.activateFor ? [...fm.activateFor] : [],
          // 取技能真正"教什么"的指令正文（截断，避免目录响应过大）
          instructionsPreview: truncate(skill.instructions, 1200),
          allowedTools: fm.allowedTools ? [...fm.allowedTools] : [],
        });
      }
    } catch (err) {
      this.logger.warn(
        `BuiltinSkillCatalog enumeration failed: ${String(err)}`,
      );
    }

    // Source 2: engine SkillRegistry (DB-backed ISkill objects)
    try {
      for (const skill of this.skillRegistry.getAll()) {
        items.push({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          category: skill.domain ?? "general",
          tags: skill.tags ? [...skill.tags] : [],
          activatesFor: [],
          instructionsPreview: "",
          allowedTools: [],
        });
      }
    } catch (err) {
      this.logger.warn(`SkillRegistry enumeration failed: ${String(err)}`);
    }

    if (items.length === 0) {
      this.logger.warn(
        "No skills found in either BuiltinSkillCatalog or SkillRegistry",
      );
    }

    return items;
  }

  getTools(): ToolCatalogItem[] {
    try {
      return this.toolRegistry.getEnabled().map((tool) => ({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        category: String(tool.category),
        tags: tool.tags ? [...tool.tags] : [],
        source: "builtin" as const,
        sideEffect: tool.sideEffect ?? "none",
      }));
    } catch (err) {
      this.logger.warn(`ToolRegistry enumeration failed: ${String(err)}`);
      return [];
    }
  }

  getWorkflows(): WorkflowCatalogItem[] {
    try {
      return this.teamRegistry.getAllConfigs().map((config) => {
        const memberTeamSize = config.memberRoles.reduce(
          (sum, r) => sum + r.minCount,
          0,
        );
        // +1 for the leader
        const teamSize = memberTeamSize + 1;

        const roles = [
          config.leaderRoleId,
          ...config.memberRoles.map((r) => r.roleId),
        ];

        const stages = config.workflow.steps.map((s) => s.name);

        return {
          id: config.id,
          name: config.name,
          description: config.description,
          category: "平台",
          teamSize,
          roles,
          stages,
        } satisfies WorkflowCatalogItem;
      });
    } catch (err) {
      this.logger.warn(`TeamRegistry enumeration failed: ${String(err)}`);
      return [];
    }
  }
}
