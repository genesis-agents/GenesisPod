/**
 * AI Coding 任务类型的提示词配置
 * 定义每种任务类型的系统提示词补充和输出格式
 */

import { CodingTaskType } from "@prisma/client";

export interface TaskPromptConfig {
  taskType: CodingTaskType;
  systemPromptAddition: string;
  outputFormat: string;
  validationRules: string[];
}

/**
 * 任务提示词配置
 */
export const TASK_PROMPTS: Record<CodingTaskType, TaskPromptConfig> = {
  [CodingTaskType.PRD]: {
    taskType: CodingTaskType.PRD,
    systemPromptAddition: `
你现在需要编写产品需求文档(PRD)。

请根据用户需求，生成完整的PRD，包括：
1. 项目概述 - 简要描述项目目标和范围
2. 用户故事 - 从用户角度描述功能需求
3. 功能需求 - 详细的功能点列表
4. 非功能需求 - 性能、安全、兼容性等要求
5. 验收标准 - 如何判断功能是否完成`,
    outputFormat: `{
  "overview": "项目概述描述",
  "userStories": [
    {"id": "US-001", "description": "作为用户，我希望...", "priority": "P0/P1/P2"}
  ],
  "functionalRequirements": ["功能需求1", "功能需求2"],
  "nonFunctionalRequirements": ["非功能需求1", "非功能需求2"],
  "acceptanceCriteria": ["验收标准1", "验收标准2"]
}`,
    validationRules: [
      "overview 必须存在且不为空",
      "overview 不能包含错误信息",
      "functionalRequirements 必须是数组且至少有1项",
      "userStories 必须是数组且至少有1项",
    ],
  },

  [CodingTaskType.ARCHITECTURE]: {
    taskType: CodingTaskType.ARCHITECTURE,
    systemPromptAddition: `
你现在需要设计系统架构。

请根据PRD和技术栈，生成技术设计文档，包括：
1. 架构描述 - 系统整体架构说明
2. 数据模型 - 核心数据结构设计
3. API设计 - RESTful API接口定义
4. 目录结构 - 项目文件组织方式`,
    outputFormat: `{
  "architecture": "架构描述文本",
  "dataModels": [
    {"name": "User", "fields": ["id: string", "name: string", "email: string"]}
  ],
  "apiDesign": [
    {"method": "GET", "path": "/api/users", "description": "获取用户列表"}
  ],
  "directoryStructure": "src/\\n├── components/\\n├── pages/\\n└── utils/"
}`,
    validationRules: [
      "architecture 必须存在且不为空",
      "architecture 不能包含错误信息",
      "dataModels 必须是数组",
      "apiDesign 必须是数组",
    ],
  },

  [CodingTaskType.TASK_BREAKDOWN]: {
    taskType: CodingTaskType.TASK_BREAKDOWN,
    systemPromptAddition: `
你现在需要将项目拆分为具体的开发任务。

请根据PRD和架构设计，生成任务列表，包括：
1. 任务ID - 唯一标识
2. 任务标题 - 简短描述
3. 任务描述 - 详细说明
4. 状态 - 默认为 pending`,
    outputFormat: `[
  {
    "id": "TASK-001",
    "title": "任务标题",
    "description": "任务详细描述",
    "status": "pending"
  }
]`,
    validationRules: [
      "结果必须是数组",
      "数组至少有1个任务",
      "每个任务必须有id和title",
    ],
  },

  [CodingTaskType.CODE]: {
    taskType: CodingTaskType.CODE,
    systemPromptAddition: `
你现在需要编写项目代码。

请根据PRD、架构设计和任务列表，生成完整可运行的代码，包括：
1. 代码文件列表 - 每个文件的路径、内容和语言
2. 入口文件 - 项目启动入口
3. 构建命令 - 如何构建项目
4. 运行命令 - 如何运行项目

要求：
- 代码完整可运行
- 遵循技术栈最佳实践
- 包含必要的配置文件（package.json等）`,
    outputFormat: `{
  "files": [
    {
      "path": "src/index.ts",
      "content": "// 代码内容",
      "language": "typescript"
    },
    {
      "path": "package.json",
      "content": "{\\"name\\": \\"project\\"}",
      "language": "json"
    }
  ],
  "entryPoint": "src/index.ts",
  "buildCommand": "npm run build",
  "runCommand": "npm start"
}`,
    validationRules: [
      "files 必须是数组且至少有1个文件",
      "每个文件必须有path和content",
      "entryPoint 必须存在",
    ],
  },

  [CodingTaskType.TEST]: {
    taskType: CodingTaskType.TEST,
    systemPromptAddition: `
你现在需要编写测试用例。

请根据PRD和代码，生成测试文件，包括：
1. 测试文件列表 - 测试代码
2. 覆盖率目标 - 预期测试覆盖率

要求：
- 覆盖主要功能点
- 测试用例清晰
- 使用合适的测试框架`,
    outputFormat: `{
  "testFiles": [
    {
      "path": "tests/app.test.ts",
      "content": "// 测试代码",
      "language": "typescript"
    }
  ],
  "coverage": 80
}`,
    validationRules: ["testFiles 必须是数组", "coverage 必须是数字"],
  },

  [CodingTaskType.REVIEW]: {
    taskType: CodingTaskType.REVIEW,
    systemPromptAddition: `
你现在需要审查代码或产出物。

请评估以下内容：
1. 是否完整满足任务要求
2. 是否有明显的错误或遗漏
3. 质量是否达到标准
4. 是否需要修改`,
    outputFormat: `{
  "approved": true/false,
  "feedback": "反馈意见",
  "issues": ["问题1", "问题2"],
  "suggestions": ["建议1", "建议2"]
}`,
    validationRules: ["approved 必须是布尔值", "feedback 必须存在"],
  },
};

/**
 * 获取任务分解的提示词
 */
export const TASK_BREAKDOWN_PROMPT = `
你是一个任务规划专家。请分析以下需求，并将其分解为具体的开发任务。

请输出JSON格式的任务分解：
{
  "understanding": "对需求的理解",
  "tasks": [
    {
      "title": "任务标题",
      "description": "详细描述",
      "taskType": "PRD|ARCHITECTURE|TASK_BREAKDOWN|CODE|TEST",
      "assigneeRole": "PM|ARCHITECT|PM_LEAD|ENGINEER|QA",
      "priority": 0-2,
      "dependsOn": ["task_0", "task_1"]
    }
  ],
  "executionPlan": "执行计划说明",
  "risks": ["风险1", "风险2"]
}

任务类型说明：
- PRD: 产品需求文档，由PM完成
- ARCHITECTURE: 系统架构设计，由ARCHITECT完成
- TASK_BREAKDOWN: 详细任务拆分，由PM_LEAD完成
- CODE: 代码实现，由ENGINEER完成
- TEST: 测试用例，由QA完成

依赖关系使用临时ID格式 task_N，N从0开始。
`;
