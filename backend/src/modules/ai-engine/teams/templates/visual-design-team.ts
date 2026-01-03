/**
 * AI Engine - Visual Design Team Template
 * 视觉设计团队模板
 *
 * 对应 ai-image/analytics 模块的 4-Agent 团队：
 * - Content Agent (Leader): 内容分析、信息架构
 * - Layout Agent: 布局决策、模板选择
 * - Visual Agent: 背景决策、图标映射
 * - Style Agent: 风格决策、配色方案
 */

import { TeamConfig, BUILTIN_TEAMS } from "../abstractions/team.interface";
import { BUILTIN_ROLES } from "../abstractions/role.interface";
import { WorkflowConfig } from "../abstractions/workflow.interface";
import { createConstraintProfile } from "../constraints/constraint-profile";
import { BUILTIN_TOOLS } from "../../core/types/agent.types";

/**
 * Visual Design 团队工作流配置
 * 四阶段顺序流程：内容分析 → 布局决策 → 视觉决策 → 风格决策
 */
export const VISUAL_DESIGN_WORKFLOW: WorkflowConfig = {
  id: "visual-design-workflow",
  name: "视觉设计工作流",
  type: "sequential",
  steps: [
    // Phase 1: 内容分析
    {
      id: "content-analysis",
      name: "内容分析",
      description: "分析内容结构，提取信息架构，识别内容类型",
      type: "task",
      executorRoles: [BUILTIN_ROLES.ANALYST],
      parallel: false,
      dependsOn: [],
      timeout: 30000, // 30s
    },
    // Phase 2: 布局决策
    {
      id: "layout-decision",
      name: "布局决策",
      description: "根据内容结构选择最佳模板布局",
      type: "task",
      executorRoles: [BUILTIN_ROLES.DESIGNER],
      parallel: false,
      dependsOn: ["content-analysis"],
      timeout: 20000, // 20s
    },
    // Phase 3: 视觉决策
    {
      id: "visual-decision",
      name: "视觉决策",
      description: "决定背景类型、图标映射、图表建议",
      type: "task",
      executorRoles: [BUILTIN_ROLES.DESIGNER],
      parallel: false,
      dependsOn: ["layout-decision"],
      timeout: 20000, // 20s
    },
    // Phase 4: 风格决策
    {
      id: "style-decision",
      name: "风格决策",
      description: "确定设计风格、配色方案、字体选择",
      type: "task",
      executorRoles: [BUILTIN_ROLES.DESIGNER],
      parallel: false,
      dependsOn: ["visual-decision"],
      timeout: 20000, // 20s
    },
  ],
  timeout: 2 * 60 * 1000, // 2 分钟总超时
};

/**
 * Visual Design 团队配置
 */
export const VISUAL_DESIGN_TEAM_CONFIG: TeamConfig = {
  id: BUILTIN_TEAMS.DESIGN,
  name: "视觉设计",
  description:
    "AI 驱动的视觉设计团队，4 个专业 Agent 协作完成信息图、图表等视觉内容设计",
  type: "predefined",
  icon: "🎨",
  color: "#EC4899", // Pink
  leaderRoleId: BUILTIN_ROLES.ANALYST,
  memberRoles: [
    {
      roleId: BUILTIN_ROLES.DESIGNER,
      minCount: 1,
      maxCount: 3,
      required: true,
    },
  ],
  workflow: VISUAL_DESIGN_WORKFLOW,
  availableSkills: [
    // 内容分析
    "content-analyzer",
    // 布局规划
    "layout-optimizer",
    // 视觉设计
    "template-matcher",
    "chart-renderer",
    "image-fetcher",
  ],
  availableTools: [
    BUILTIN_TOOLS.TEXT_GENERATION,
    BUILTIN_TOOLS.IMAGE_GENERATION,
    BUILTIN_TOOLS.STRUCTURED_OUTPUT,
  ],
  constraintProfile: createConstraintProfile("fast", {
    quality: {
      depth: "quick",
      accuracy: "allow_inference",
      reviewRequired: false,
      minReviewScore: 5,
      maxReworks: 0,
    },
    efficiency: {
      maxDuration: 2 * 60 * 1000, // 2 分钟最大
      priority: "high" as const,
      allowParallel: false,
      maxParallelism: 1,
    },
  }),
  deliverableTypes: ["html", "png", "svg"],
  metadata: {
    category: "visual",
    typicalDuration: "30s-2min",
    suitableFor: [
      "信息图设计",
      "数据可视化",
      "图表生成",
      "配图设计",
      "背景生成",
    ],
    capabilities: [
      "内容结构分析",
      "智能布局选择",
      "背景类型决策",
      "配色方案生成",
      "图标智能映射",
    ],
    agents: [
      {
        name: "Content Agent",
        role: "内容分析",
        output: "informationArchitecture, contentAnalysis",
      },
      {
        name: "Layout Agent",
        role: "布局决策",
        output: "templateLayout, layoutPlan",
      },
      {
        name: "Visual Agent",
        role: "视觉决策",
        output: "backgroundDecision, iconMapping",
      },
      {
        name: "Style Agent",
        role: "风格决策",
        output: "visualLanguage, designJournal",
      },
    ],
  },
};

/**
 * 创建 Visual Design 团队工厂函数
 */
export function createVisualDesignTeamConfig(
  overrides?: Partial<TeamConfig>,
): TeamConfig {
  return {
    ...VISUAL_DESIGN_TEAM_CONFIG,
    ...overrides,
    id: overrides?.id || VISUAL_DESIGN_TEAM_CONFIG.id,
  };
}
