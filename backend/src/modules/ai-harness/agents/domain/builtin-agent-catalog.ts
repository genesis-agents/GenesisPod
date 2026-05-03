import type { AgentConfig } from "../abstractions/agent.types";

export const BUILTIN_AGENTS = {
  SLIDES: "slides",
  DOCS: "docs",
  DESIGNER: "designer",
  RESEARCHER: "researcher",
  SIMULATOR: "simulator",
  IMAGE_DESIGNER: "image-designer",
  TEAM_COLLABORATION: "team-collaboration",
  TOPIC_INSIGHTS: "topic-insights",
} as const;

export type BuiltinAgentId =
  (typeof BUILTIN_AGENTS)[keyof typeof BUILTIN_AGENTS];

export const AGENT_CONFIGS: Record<BuiltinAgentId, AgentConfig> = {
  [BUILTIN_AGENTS.SLIDES]: {
    id: BUILTIN_AGENTS.SLIDES,
    name: "AI Slides",
    description: "智能 PPT 生成器，快速创建专业演示文稿",
    icon: "📊",
    color: "#3B82F6",
    capabilities: ["自动生成大纲", "智能配图", "多种主题风格", "导出 PPTX"],
    templates: [],
  },
  [BUILTIN_AGENTS.DOCS]: {
    id: BUILTIN_AGENTS.DOCS,
    name: "AI Docs",
    description: "智能文档助手，撰写专业文档报告",
    icon: "📄",
    color: "#10B981",
    capabilities: ["自动调研资料", "生成大纲", "撰写内容", "导出 Word/PDF"],
    templates: [],
  },
  [BUILTIN_AGENTS.DESIGNER]: {
    id: BUILTIN_AGENTS.DESIGNER,
    name: "AI Designer",
    description: "智能设计工具，生成创意设计图",
    icon: "🎨",
    color: "#F59E0B",
    capabilities: ["海报设计", "Logo 设计", "Banner 生成", "多风格变体"],
    templates: [],
  },
  [BUILTIN_AGENTS.RESEARCHER]: {
    id: BUILTIN_AGENTS.RESEARCHER,
    name: "AI Researcher",
    description: "智能研究助手，进行资料调研和知识整理",
    icon: "🔬",
    color: "#EC4899",
    capabilities: [
      "自动调研资料",
      "知识图谱构建",
      "内容摘要生成",
      "研究报告撰写",
    ],
    templates: [],
  },
  [BUILTIN_AGENTS.SIMULATOR]: {
    id: BUILTIN_AGENTS.SIMULATOR,
    name: "AI Simulator",
    description: "智能推演专家，进行多方博弈和场景模拟",
    icon: "🎯",
    color: "#EF4444",
    capabilities: ["多方博弈模拟", "场景推演分析", "决策建议生成", "风险评估"],
    templates: [],
  },
  [BUILTIN_AGENTS.IMAGE_DESIGNER]: {
    id: BUILTIN_AGENTS.IMAGE_DESIGNER,
    name: "AI Image Designer",
    description: "智能图像设计师，生成高质量图像和信息图表",
    icon: "🖼️",
    color: "#06B6D4",
    capabilities: ["信息图表生成", "Prompt 优化", "多风格生成", "图像编辑"],
    templates: [],
  },
  [BUILTIN_AGENTS.TEAM_COLLABORATION]: {
    id: BUILTIN_AGENTS.TEAM_COLLABORATION,
    name: "AI Team Collaboration",
    description: "智能团队协作专家，管理多 AI 成员协作",
    icon: "👥",
    color: "#8B5CF6",
    capabilities: ["团队任务协调", "智能任务分配", "共识投票决策", "任务编排执行"],
    templates: [],
  },
  [BUILTIN_AGENTS.TOPIC_INSIGHTS]: {
    id: BUILTIN_AGENTS.TOPIC_INSIGHTS,
    name: "Topic Insights Researcher",
    description: "多维度深度研究与专业报告生成",
    icon: "💡",
    color: "#8B5CF6",
    capabilities: [
      "多维度深度研究",
      "自动化报告生成",
      "事实核查",
      "多Agent辩论分析",
      "跨维度关联分析",
    ],
    templates: [],
  },
};
