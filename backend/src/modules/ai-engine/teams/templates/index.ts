/**
 * AI Engine - Team Templates (Delegation Layer)
 *
 * 重要架构说明:
 * ================
 * 团队配置已迁移到 AI Apps 层，这里仅作为向后兼容的委托层。
 *
 * 正确的导入路径:
 * - 研究团队: import { RESEARCH_TEAM_CONFIG } from '@/modules/ai-app/research/teams'
 * - 报告团队: import { REPORT_TEAM_CONFIG } from '@/modules/ai-app/office/teams'
 * - PPT 团队: import { SLIDES_TEAM_CONFIG } from '@/modules/ai-app/office/teams'
 * - 辩论团队: import { DEBATE_TEAM_CONFIG } from '@/modules/ai-app/teams/teams'
 * - 设计团队: import { VISUAL_DESIGN_TEAM_CONFIG } from '@/modules/ai-app/office/teams'
 *
 * 架构原则:
 * - AI Engine: 领域无关的通用框架（接口、基类、注册表）
 * - AI Apps: 业务特定的配置和实现
 *
 * @see .claude/skills/ai/ai-architecture-layering/SKILL.md
 */

// ============================================================================
// Re-exports from AI Apps (for backwards compatibility)
// ============================================================================

// Research Team - from ai-app/research
export {
  RESEARCH_WORKFLOW,
  RESEARCH_TEAM_CONFIG,
  createResearchTeamConfig,
} from "../../../ai-app/research/teams";

// Report Team - from ai-app/office
export {
  REPORT_WORKFLOW,
  REPORT_TEAM_CONFIG,
  createReportTeamConfig,
} from "../../../ai-app/office/teams";

// Slides Team - from ai-app/office
export {
  SLIDES_WORKFLOW,
  SLIDES_TEAM_CONFIG,
  createSlidesTeamConfig,
} from "../../../ai-app/office/teams";

// Visual Design Team - from ai-app/office
export {
  VISUAL_DESIGN_WORKFLOW,
  VISUAL_DESIGN_TEAM_CONFIG,
  createVisualDesignTeamConfig,
  CONTENT_AGENT_PROMPT,
  LAYOUT_AGENT_PROMPT,
  VISUAL_AGENT_PROMPT,
  STYLE_AGENT_PROMPT,
} from "../../../ai-app/office/teams";

// Debate Team - from ai-app/teams
export {
  DEBATE_WORKFLOW,
  DEBATE_TEAM_CONFIG,
  createDebateTeamConfig,
} from "../../../ai-app/teams/teams";

// ============================================================================
// Aggregated Team Configs Registry
// ============================================================================

import { RESEARCH_TEAM_CONFIG } from "../../../ai-app/research/teams";
import {
  REPORT_TEAM_CONFIG,
  SLIDES_TEAM_CONFIG,
  VISUAL_DESIGN_TEAM_CONFIG,
} from "../../../ai-app/office/teams";
import { DEBATE_TEAM_CONFIG } from "../../../ai-app/teams/teams";
import {
  TeamConfig,
  BUILTIN_TEAMS,
  BuiltinTeamId,
} from "../abstractions/team.interface";

/**
 * 所有预定义团队配置
 *
 * @deprecated 建议直接从各 AI App 模块导入
 */
export const PREDEFINED_TEAM_CONFIGS: Record<BuiltinTeamId, TeamConfig> = {
  [BUILTIN_TEAMS.RESEARCH]: RESEARCH_TEAM_CONFIG,
  [BUILTIN_TEAMS.REPORT]: REPORT_TEAM_CONFIG,
  [BUILTIN_TEAMS.DEBATE]: DEBATE_TEAM_CONFIG,
  [BUILTIN_TEAMS.SLIDES]: SLIDES_TEAM_CONFIG,
  [BUILTIN_TEAMS.DESIGN]: VISUAL_DESIGN_TEAM_CONFIG,
  // TODO: Add coding team when available
  [BUILTIN_TEAMS.CODING]: RESEARCH_TEAM_CONFIG, // Placeholder
};

/**
 * 获取预定义团队配置
 *
 * @deprecated 建议直接从各 AI App 模块导入
 */
export function getPredefinedTeamConfig(
  teamId: BuiltinTeamId,
): TeamConfig | undefined {
  return PREDEFINED_TEAM_CONFIGS[teamId];
}

/**
 * 获取所有预定义团队配置
 *
 * @deprecated 建议直接从各 AI App 模块导入
 */
export function getAllPredefinedTeamConfigs(): TeamConfig[] {
  return Object.values(PREDEFINED_TEAM_CONFIGS);
}
