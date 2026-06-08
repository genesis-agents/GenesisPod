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

/**
 * 基础设施型 domain：这些是某个 AI App 的内部生产管线（如 slides 渲染流水线），
 * 不是「一人公司」用户可装配的通用方法论技能，不应出现在市场货架。
 * 可调整：若要把某领域重新放回市场，从这里移除即可。
 */
const INFRA_SKILL_DOMAINS = new Set<string>(["office"]);

/**
 * engine SkillRegistry 里的 prompt 型技能适配器（PromptSkillAdapter）鸭子类型。
 * 只有 prompt 技能才有可注入 Agent 系统提示的方法论正文；code-backed 执行单元
 * （slides page-pipeline / content-compression 等 NestJS Provider）没有正文，
 * 不能被装配，故不进市场。用鸭子类型避免跨 facade 导入 engine 内部类。
 */
interface PromptSkillLike {
  isPromptSkillAdapter?: boolean;
  getPromptContent?: () => string;
  getDefinitionMetadata?: () => { allowedTools?: string[] };
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

    // Source 2: engine SkillRegistry
    // 仅投影 prompt 型方法论技能（有可注入 Agent 的指令正文）；跳过 code-backed
    // 执行单元（slides 渲染管线、playground 执行体等基础设施，无方法论正文）。
    try {
      for (const skill of this.skillRegistry.getAll()) {
        const prompt = skill as unknown as PromptSkillLike;
        const isPromptSkill =
          prompt.isPromptSkillAdapter === true &&
          typeof prompt.getPromptContent === "function";
        if (!isPromptSkill) continue;

        // 跳过某个 App 的内部生产管线领域（如 office/slides）
        if (INFRA_SKILL_DOMAINS.has(skill.domain)) continue;

        const body = prompt.getPromptContent?.() ?? "";
        const meta = prompt.getDefinitionMetadata?.() ?? {};

        items.push({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          category: skill.domain ?? "general",
          tags: skill.tags ? [...skill.tags] : [],
          activatesFor: [],
          // 取技能真正"教什么"的指令正文（截断，避免目录响应过大）
          instructionsPreview: truncate(body, 1200),
          allowedTools: meta.allowedTools ? [...meta.allowedTools] : [],
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
