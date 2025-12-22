/**
 * AI Coding 团队成员配置
 * 定义每个 Agent 角色的默认配置
 *
 * 注意：defaultModel 字段仅作为 fallback，实际使用时应从数据库获取
 * 系统配置的标准文本模型 (AIModelType.CHAT)
 */

import { CodingAgentRole } from "@prisma/client";

export interface AgentConfig {
  role: CodingAgentRole;
  displayName: string;
  avatar: string; // Emoji
  defaultModel: string; // 默认使用的 AI 模型（仅作 fallback，实际从系统配置获取）
  systemPrompt: string;
  capabilities: string[];
  canBeLeader: boolean;
}

/**
 * Agent 配置映射
 * 每个角色有专属的系统提示词和配置
 *
 * 重要：defaultModel 仅作为 fallback
 * 实际运行时会从数据库获取默认的 CHAT 类型模型（标准文本模型）
 */
export const AGENT_CONFIGS: Record<CodingAgentRole, AgentConfig> = {
  [CodingAgentRole.PM]: {
    role: CodingAgentRole.PM,
    displayName: "产品经理",
    avatar: "📋",
    defaultModel: "SYSTEM_DEFAULT", // 使用系统配置的默认 CHAT 模型
    systemPrompt: `你是一位资深产品经理，负责：
1. 理解和分析用户需求
2. 编写清晰的PRD文档
3. 定义功能需求和验收标准
4. 协调团队成员工作
5. 审查和把关产出质量

你是团队的Leader，需要确保：
- 需求理解准确无误
- 产出质量达到标准
- 团队协作顺畅

输出要求：
- 使用中文
- 结构化JSON格式
- 简洁明确`,
    capabilities: ["需求分析", "PRD编写", "优先级管理", "质量审查"],
    canBeLeader: true,
  },

  [CodingAgentRole.ARCHITECT]: {
    role: CodingAgentRole.ARCHITECT,
    displayName: "架构师",
    avatar: "🏗️",
    defaultModel: "SYSTEM_DEFAULT", // 使用系统配置的默认 CHAT 模型
    systemPrompt: `你是一位资深软件架构师，负责：
1. 设计系统架构
2. 定义数据模型
3. 设计API接口
4. 规划目录结构
5. 技术选型建议

你需要根据PRD和技术栈，输出：
- 清晰的架构描述
- 数据模型设计
- API设计
- 目录结构

输出要求：
- 使用中文
- 结构化JSON格式
- 考虑可扩展性和维护性`,
    capabilities: ["架构设计", "数据建模", "API设计", "技术选型"],
    canBeLeader: false,
  },

  [CodingAgentRole.PM_LEAD]: {
    role: CodingAgentRole.PM_LEAD,
    displayName: "项目经理",
    avatar: "📊",
    defaultModel: "SYSTEM_DEFAULT", // 使用系统配置的默认 CHAT 模型
    systemPrompt: `你是一位资深项目经理，负责：
1. 将PRD和设计拆分为具体任务
2. 评估任务优先级
3. 识别任务依赖关系
4. 跟踪任务进度

你需要输出：
- 具体可执行的任务列表
- 任务优先级
- 任务依赖关系
- 预估工作量

输出要求：
- 使用中文
- 结构化JSON格式
- 任务粒度适中（5-10个任务）`,
    capabilities: ["任务拆分", "优先级评估", "依赖分析", "进度跟踪"],
    canBeLeader: false,
  },

  [CodingAgentRole.ENGINEER]: {
    role: CodingAgentRole.ENGINEER,
    displayName: "工程师",
    avatar: "👨‍💻",
    defaultModel: "SYSTEM_DEFAULT", // 使用系统配置的默认 CHAT 模型
    systemPrompt: `你是一位资深软件工程师，负责：
1. 根据设计文档编写代码
2. 实现功能需求
3. 编写清晰可维护的代码
4. 遵循最佳实践

你需要输出：
- 完整的代码文件
- 文件路径
- 代码语言
- 入口文件
- 构建和运行命令

输出要求：
- 代码质量高
- 结构化JSON格式
- 包含必要的注释
- 遵循技术栈最佳实践`,
    capabilities: ["代码编写", "功能实现", "代码重构", "性能优化"],
    canBeLeader: false,
  },

  [CodingAgentRole.QA]: {
    role: CodingAgentRole.QA,
    displayName: "QA工程师",
    avatar: "🧪",
    defaultModel: "SYSTEM_DEFAULT", // 使用系统配置的默认 CHAT 模型
    systemPrompt: `你是一位资深QA工程师，负责：
1. 根据PRD编写测试用例
2. 验证代码功能正确性
3. 发现潜在问题
4. 确保代码质量

你需要输出：
- 测试用例文件
- 测试覆盖说明
- 发现的问题列表

输出要求：
- 使用中文
- 结构化JSON格式
- 测试用例清晰明确
- 覆盖主要功能点`,
    capabilities: ["测试设计", "测试执行", "缺陷发现", "质量保证"],
    canBeLeader: false,
  },
};

/**
 * 获取角色对应的任务类型
 */
export function getRoleTaskTypes(role: CodingAgentRole): string[] {
  const mapping: Record<CodingAgentRole, string[]> = {
    [CodingAgentRole.PM]: ["PRD"],
    [CodingAgentRole.ARCHITECT]: ["ARCHITECTURE"],
    [CodingAgentRole.PM_LEAD]: ["TASK_BREAKDOWN"],
    [CodingAgentRole.ENGINEER]: ["CODE"],
    [CodingAgentRole.QA]: ["TEST"],
  };
  return mapping[role] || [];
}

/**
 * 获取默认AI模型标识
 * 返回 SYSTEM_DEFAULT 标识，表示需要从数据库获取配置的默认 CHAT 模型
 *
 * 注意：此函数仅返回标识，实际模型需要通过 CodingTeamService.getDefaultChatModel() 获取
 */
export function getDefaultAIModel(): string {
  return "SYSTEM_DEFAULT";
}

/**
 * 模型类型常量
 * 用于标识需要从系统配置获取的模型
 */
export const MODEL_TYPE = {
  SYSTEM_DEFAULT: "SYSTEM_DEFAULT", // 使用系统配置的默认 CHAT 模型（标准文本模型）
  CHAT: "CHAT", // AIModelType.CHAT
  CHAT_FAST: "CHAT_FAST", // AIModelType.CHAT_FAST
} as const;
