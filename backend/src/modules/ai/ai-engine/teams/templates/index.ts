/**
 * AI Engine - Team Templates
 * 预定义团队模板导出
 */

// Research Team
export {
  RESEARCH_WORKFLOW,
  RESEARCH_TEAM_CONFIG,
  createResearchTeamConfig,
} from "./research-team";

// Report Team
export {
  REPORT_WORKFLOW,
  REPORT_TEAM_CONFIG,
  createReportTeamConfig,
} from "./report-team";

// Debate Team
export {
  DEBATE_WORKFLOW,
  DEBATE_TEAM_CONFIG,
  createDebateTeamConfig,
} from "./debate-team";

// Slides Team
export {
  SLIDES_WORKFLOW,
  SLIDES_TEAM_CONFIG,
  createSlidesTeamConfig,
} from "./slides-team";

// All team configs
import { RESEARCH_TEAM_CONFIG } from "./research-team";
import { REPORT_TEAM_CONFIG } from "./report-team";
import { DEBATE_TEAM_CONFIG } from "./debate-team";
import { SLIDES_TEAM_CONFIG } from "./slides-team";
import {
  TeamConfig,
  BUILTIN_TEAMS,
  BuiltinTeamId,
} from "../abstractions/team.interface";

/**
 * 所有预定义团队配置
 */
export const PREDEFINED_TEAM_CONFIGS: Record<BuiltinTeamId, TeamConfig> = {
  [BUILTIN_TEAMS.RESEARCH]: RESEARCH_TEAM_CONFIG,
  [BUILTIN_TEAMS.REPORT]: REPORT_TEAM_CONFIG,
  [BUILTIN_TEAMS.DEBATE]: DEBATE_TEAM_CONFIG,
  [BUILTIN_TEAMS.SLIDES]: SLIDES_TEAM_CONFIG,
  // TODO: Add more predefined teams
  [BUILTIN_TEAMS.CODING]: RESEARCH_TEAM_CONFIG, // Placeholder
  [BUILTIN_TEAMS.DESIGN]: REPORT_TEAM_CONFIG, // Placeholder
};

/**
 * 获取预定义团队配置
 */
export function getPredefinedTeamConfig(
  teamId: BuiltinTeamId,
): TeamConfig | undefined {
  return PREDEFINED_TEAM_CONFIGS[teamId];
}

/**
 * 获取所有预定义团队配置
 */
export function getAllPredefinedTeamConfigs(): TeamConfig[] {
  return Object.values(PREDEFINED_TEAM_CONFIGS);
}
