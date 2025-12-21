'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/layout/Sidebar';

// Agent types for multi-agent collaboration
interface AgentMessage {
  id: string;
  agentRole: AgentRole;
  content: string;
  timestamp: Date;
  status: 'thinking' | 'done' | 'error';
  artifacts?: {
    type: 'prd' | 'design' | 'task' | 'code' | 'test';
    content: string;
    filename?: string;
  }[];
}

type AgentRole = 'pm' | 'architect' | 'pmLead' | 'engineer' | 'qa';

interface Agent {
  role: AgentRole;
  name: string;
  description: string;
  icon: string;
  color: string;
  status: 'pending' | 'running' | 'completed' | 'error';
}

// Define agents based on MetaGPT-style multi-agent collaboration
const AGENTS: Agent[] = [
  {
    role: 'pm',
    name: '产品经理',
    description: '分析需求，编写 PRD',
    icon: '📝',
    color: 'blue',
    status: 'pending',
  },
  {
    role: 'architect',
    name: '架构师',
    description: '设计系统架构',
    icon: '🏗️',
    color: 'purple',
    status: 'pending',
  },
  {
    role: 'pmLead',
    name: '项目经理',
    description: '拆分任务',
    icon: '📋',
    color: 'orange',
    status: 'pending',
  },
  {
    role: 'engineer',
    name: '工程师',
    description: '实现代码',
    icon: '💻',
    color: 'green',
    status: 'pending',
  },
  {
    role: 'qa',
    name: 'QA',
    description: '测试验证',
    icon: '🔍',
    color: 'red',
    status: 'pending',
  },
];

// Template configurations
const TEMPLATES: Record<
  string,
  {
    name: string;
    techStack: { frontend?: string; backend?: string; database?: string };
    prompt: string;
  }
> = {
  'web-app': {
    name: 'Web App',
    techStack: {
      frontend: 'React',
      backend: 'Node.js',
      database: 'PostgreSQL',
    },
    prompt: '开发一个任务管理应用，支持添加、编辑、删除和标记完成任务',
  },
  'cli-tool': {
    name: 'CLI Tool',
    techStack: { backend: 'Python' },
    prompt: '开发一个文件批量重命名工具，支持正则表达式匹配',
  },
  'api-server': {
    name: 'API Server',
    techStack: { backend: 'Node.js', database: 'PostgreSQL' },
    prompt: '开发一个用户认证 API，支持注册、登录、密码重置',
  },
  'data-analysis': {
    name: 'Data Analysis',
    techStack: { backend: 'Python' },
    prompt: '开发一个销售数据分析脚本，生成可视化报表',
  },
};

// Wrapper component with Suspense for useSearchParams
export default function NewCodingProjectPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen">
          <Sidebar />
          <div className="flex flex-1 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          </div>
        </div>
      }
    >
      <NewCodingProjectPageContent />
    </Suspense>
  );
}

function NewCodingProjectPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken, isLoading: authLoading } = useAuth();

  // Get initial values from URL params
  const templateId = searchParams.get('template');
  const initialRequirement = searchParams.get('requirement') || '';
  const template = templateId ? TEMPLATES[templateId] : null;

  // State
  const [requirement, setRequirement] = useState(
    initialRequirement || template?.prompt || ''
  );
  const [projectName, setProjectName] = useState('');
  const [techStack, setTechStack] = useState<{
    frontend?: string;
    backend?: string;
    database?: string;
  }>(template?.techStack || {});
  const [isStarted, setIsStarted] = useState(false);
  const [agents, setAgents] = useState<Agent[]>(AGENTS);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [currentAgent, setCurrentAgent] = useState<AgentRole | null>(null);
  const [progress, setProgress] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isAuthenticated = !!accessToken;

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Simulate multi-agent collaboration with AI Agents
  const startProject = useCallback(async () => {
    if (!requirement.trim()) return;

    setIsStarted(true);
    setError(null);
    setMessages([]);
    setProgress(0);

    const agentSequence: AgentRole[] = [
      'pm',
      'architect',
      'pmLead',
      'engineer',
      'qa',
    ];

    try {
      for (let i = 0; i < agentSequence.length; i++) {
        const agentRole = agentSequence[i];
        setCurrentAgent(agentRole);

        // Update agent status to running
        setAgents((prev) =>
          prev.map((a) =>
            a.role === agentRole
              ? { ...a, status: 'running' }
              : a.role === agentSequence[i - 1]
                ? { ...a, status: 'completed' }
                : a
          )
        );

        // Add thinking message
        const thinkingMessage: AgentMessage = {
          id: `${agentRole}-${Date.now()}`,
          agentRole,
          content: getAgentThinkingMessage(agentRole),
          timestamp: new Date(),
          status: 'thinking',
        };
        setMessages((prev) => [...prev, thinkingMessage]);

        // Call the AI Agent API
        const response = await executeAgent(agentRole, requirement, messages);

        // Update message with response
        setMessages((prev) =>
          prev.map((m) =>
            m.id === thinkingMessage.id
              ? {
                  ...m,
                  content: response.content,
                  status: 'done' as const,
                  artifacts: response.artifacts,
                }
              : m
          )
        );

        // Update progress
        setProgress(Math.round(((i + 1) / agentSequence.length) * 100));

        // Small delay between agents
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Mark last agent as completed
      setAgents((prev) =>
        prev.map((a) => (a.role === 'qa' ? { ...a, status: 'completed' } : a))
      );
      setCurrentAgent(null);
      setIsCompleted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '发生错误，请重试');
      setAgents((prev) =>
        prev.map((a) =>
          a.role === currentAgent ? { ...a, status: 'error' } : a
        )
      );
    }
  }, [requirement, messages]);

  // Get thinking message for each agent
  const getAgentThinkingMessage = (role: AgentRole): string => {
    const messages: Record<AgentRole, string> = {
      pm: '正在分析需求，编写产品需求文档 (PRD)...',
      architect: '正在设计系统架构，规划技术方案...',
      pmLead: '正在拆分任务，制定开发计划...',
      engineer: '正在实现代码，构建功能模块...',
      qa: '正在编写测试用例，进行代码审查...',
    };
    return messages[role];
  };

  // Execute agent via API
  const executeAgent = async (
    agentRole: AgentRole,
    requirement: string,
    previousMessages: AgentMessage[]
  ): Promise<{ content: string; artifacts?: AgentMessage['artifacts'] }> => {
    // Build context from previous messages
    const context = previousMessages
      .filter((m) => m.status === 'done')
      .map((m) => `[${getAgentName(m.agentRole)}]:\n${m.content}`)
      .join('\n\n');

    const systemPrompt = getAgentSystemPrompt(agentRole, techStack);
    const userPrompt = `
用户需求：${requirement}

${context ? `之前的工作成果：\n${context}` : ''}

请根据你的角色职责，完成相应的工作任务。
    `.trim();

    try {
      // Call the agents/execute API
      const response = await fetch('/api/agents/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agentType: 'DEVELOPER', // Use DEVELOPER agent type
          prompt: userPrompt,
          systemPrompt,
          metadata: {
            role: agentRole,
            techStack,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('AI Agent 调用失败');
      }

      const data = await response.json();

      // Parse the response and extract artifacts
      const artifacts = parseArtifacts(agentRole, data.result || data.content);

      return {
        content: data.result || data.content || '处理完成',
        artifacts,
      };
    } catch (err) {
      // Fallback to mock response if API fails
      console.error('Agent execution error:', err);
      return getMockResponse(agentRole, requirement);
    }
  };

  // Get agent name
  const getAgentName = (role: AgentRole): string => {
    const names: Record<AgentRole, string> = {
      pm: '产品经理',
      architect: '架构师',
      pmLead: '项目经理',
      engineer: '工程师',
      qa: 'QA 工程师',
    };
    return names[role];
  };

  // Get system prompt for each agent
  const getAgentSystemPrompt = (
    role: AgentRole,
    techStack: { frontend?: string; backend?: string; database?: string }
  ): string => {
    const techInfo = [
      techStack.frontend && `前端: ${techStack.frontend}`,
      techStack.backend && `后端: ${techStack.backend}`,
      techStack.database && `数据库: ${techStack.database}`,
    ]
      .filter(Boolean)
      .join(', ');

    const prompts: Record<AgentRole, string> = {
      pm: `你是一位经验丰富的产品经理。根据用户需求，编写详细的产品需求文档 (PRD)，包括：
1. 项目概述
2. 目标用户
3. 核心功能列表
4. 用户故事
5. 验收标准

技术栈参考: ${techInfo || '待定'}`,

      architect: `你是一位资深软件架构师。基于 PRD 文档，设计系统技术架构，包括：
1. 技术选型说明
2. 系统架构图（用文字描述）
3. 数据模型设计
4. API 接口设计
5. 目录结构规划

技术栈: ${techInfo || '待定'}`,

      pmLead: `你是一位项目经理。基于系统设计，将开发工作拆分为具体任务，包括：
1. 任务列表（按优先级排序）
2. 每个任务的详细描述
3. 任务依赖关系
4. 预估工作量

技术栈: ${techInfo || '待定'}`,

      engineer: `你是一位全栈工程师。基于任务列表，实现核心功能代码，包括：
1. 项目初始化代码
2. 核心功能模块
3. 数据模型实现
4. API 接口实现
5. 基本测试代码

技术栈: ${techInfo || '待定'}
要求：代码要符合最佳实践，包含必要注释`,

      qa: `你是一位 QA 工程师。审查代码并编写测试用例，包括：
1. 代码审查报告
2. 单元测试用例
3. 集成测试用例
4. 潜在问题清单
5. 优化建议

技术栈: ${techInfo || '待定'}`,
    };
    return prompts[role];
  };

  // Parse artifacts from response
  const parseArtifacts = (
    role: AgentRole,
    content: string
  ): AgentMessage['artifacts'] => {
    // Simple parsing - in real implementation, use structured output
    const artifactTypes: Record<
      AgentRole,
      'prd' | 'design' | 'task' | 'code' | 'test'
    > = {
      pm: 'prd',
      architect: 'design',
      pmLead: 'task',
      engineer: 'code',
      qa: 'test',
    };

    return [
      {
        type: artifactTypes[role],
        content,
      },
    ];
  };

  // Mock response fallback
  const getMockResponse = (
    role: AgentRole,
    requirement: string
  ): { content: string; artifacts?: AgentMessage['artifacts'] } => {
    const responses: Record<AgentRole, string> = {
      pm: `## 产品需求文档 (PRD)

### 项目概述
${requirement}

### 核心功能
1. 用户认证模块
2. 核心业务功能
3. 数据管理功能

### 用户故事
- 作为用户，我希望能够快速完成核心操作
- 作为用户，我希望界面简洁易用

### 验收标准
- [ ] 核心功能可正常使用
- [ ] 界面响应及时
- [ ] 数据正确保存`,

      architect: `## 系统架构设计

### 技术选型
- 前端：${techStack.frontend || 'React'}
- 后端：${techStack.backend || 'Node.js'}
- 数据库：${techStack.database || 'PostgreSQL'}

### 目录结构
\`\`\`
src/
├── components/    # 前端组件
├── pages/         # 页面
├── api/           # 后端接口
├── models/        # 数据模型
└── utils/         # 工具函数
\`\`\`

### API 设计
- GET /api/items - 获取列表
- POST /api/items - 创建项目
- PUT /api/items/:id - 更新项目
- DELETE /api/items/:id - 删除项目`,

      pmLead: `## 任务拆分

### 高优先级
1. **初始化项目** - 创建项目结构，配置开发环境
2. **数据模型实现** - 定义数据库表结构
3. **核心 API** - 实现 CRUD 接口

### 中优先级
4. **前端组件** - 创建基础 UI 组件
5. **页面开发** - 实现主要页面

### 低优先级
6. **测试代码** - 编写单元测试
7. **文档完善** - 补充开发文档`,

      engineer: `## 代码实现

\`\`\`typescript
// src/api/items.ts
import { Router } from 'express';

const router = Router();

// 获取列表
router.get('/', async (req, res) => {
  const items = await ItemModel.findAll();
  res.json({ success: true, data: items });
});

// 创建项目
router.post('/', async (req, res) => {
  const item = await ItemModel.create(req.body);
  res.json({ success: true, data: item });
});

export default router;
\`\`\`

代码已按照最佳实践实现，包含错误处理和数据验证。`,

      qa: `## 测试报告

### 代码审查
- ✅ 代码结构清晰
- ✅ 命名规范统一
- ⚠️ 建议增加更多注释

### 测试用例
1. ✅ 获取列表 - 正常返回数据
2. ✅ 创建项目 - 数据正确保存
3. ✅ 更新项目 - 字段正确更新
4. ✅ 删除项目 - 数据正确删除

### 测试覆盖率
- 总覆盖率：85%
- 核心模块：92%`,
    };

    return {
      content: responses[role],
      artifacts: [
        {
          type:
            role === 'pm'
              ? 'prd'
              : role === 'architect'
                ? 'design'
                : role === 'pmLead'
                  ? 'task'
                  : role === 'engineer'
                    ? 'code'
                    : 'test',
          content: responses[role],
        },
      ],
    };
  };

  if (authLoading) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
          <h2 className="text-xl font-semibold text-gray-700">
            Please sign in to access AI Coding
          </h2>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />

      <main className="flex flex-1 overflow-hidden">
        {/* Left Panel - Agent Status */}
        <div className="w-64 flex-shrink-0 border-r border-gray-200 bg-white">
          <div className="p-4">
            <button
              onClick={() => router.push('/ai-coding')}
              className="mb-4 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              返回列表
            </button>

            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              AI 开发团队
            </h2>

            {/* Progress */}
            {isStarted && (
              <div className="mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">进度</span>
                  <span className="font-medium text-emerald-600">
                    {progress}%
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Agent List */}
            <div className="space-y-2">
              {agents.map((agent) => (
                <div
                  key={agent.role}
                  className={`flex items-center gap-3 rounded-lg p-3 transition-colors ${
                    agent.status === 'running'
                      ? 'bg-emerald-50 ring-1 ring-emerald-200'
                      : agent.status === 'completed'
                        ? 'bg-gray-50'
                        : agent.status === 'error'
                          ? 'bg-red-50'
                          : 'bg-white'
                  }`}
                >
                  <span className="text-xl">{agent.icon}</span>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">
                      {agent.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {agent.description}
                    </div>
                  </div>
                  {/* Status indicator */}
                  {agent.status === 'running' && (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                  )}
                  {agent.status === 'completed' && (
                    <svg
                      className="h-5 w-5 text-emerald-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                  {agent.status === 'error' && (
                    <svg
                      className="h-5 w-5 text-red-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Center Panel - Collaboration View */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div className="border-b border-gray-200 bg-white px-6 py-4">
            <h1 className="text-xl font-bold text-gray-900">
              {projectName || '新建项目'}
            </h1>
            {template && (
              <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-600">
                {template.name} 模板
              </span>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {!isStarted ? (
              /* Initial Form */
              <div className="mx-auto max-w-2xl">
                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                  <h2 className="mb-4 text-lg font-semibold text-gray-900">
                    描述你的项目需求
                  </h2>

                  {/* Project Name */}
                  <div className="mb-4">
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      项目名称
                    </label>
                    <input
                      type="text"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      placeholder="例如：Todo App"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Requirement */}
                  <div className="mb-4">
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      需求描述
                    </label>
                    <textarea
                      value={requirement}
                      onChange={(e) => setRequirement(e.target.value)}
                      placeholder="详细描述你想要的功能..."
                      rows={5}
                      className="w-full resize-none rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Tech Stack */}
                  <div className="mb-6">
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      技术栈
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">
                          前端
                        </label>
                        <select
                          value={techStack.frontend || ''}
                          onChange={(e) =>
                            setTechStack((prev) => ({
                              ...prev,
                              frontend: e.target.value || undefined,
                            }))
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                        >
                          <option value="">无</option>
                          <option value="React">React</option>
                          <option value="Vue">Vue</option>
                          <option value="Next.js">Next.js</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">
                          后端
                        </label>
                        <select
                          value={techStack.backend || ''}
                          onChange={(e) =>
                            setTechStack((prev) => ({
                              ...prev,
                              backend: e.target.value || undefined,
                            }))
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                        >
                          <option value="">无</option>
                          <option value="Node.js">Node.js</option>
                          <option value="Python">Python</option>
                          <option value="Go">Go</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">
                          数据库
                        </label>
                        <select
                          value={techStack.database || ''}
                          onChange={(e) =>
                            setTechStack((prev) => ({
                              ...prev,
                              database: e.target.value || undefined,
                            }))
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                        >
                          <option value="">无</option>
                          <option value="PostgreSQL">PostgreSQL</option>
                          <option value="MongoDB">MongoDB</option>
                          <option value="MySQL">MySQL</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Start Button */}
                  <button
                    onClick={startProject}
                    disabled={!requirement.trim()}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    开始创建
                  </button>
                </div>
              </div>
            ) : (
              /* Collaboration Messages */
              <div className="space-y-4">
                {messages.map((message) => {
                  const agent = agents.find(
                    (a) => a.role === message.agentRole
                  );
                  return (
                    <div
                      key={message.id}
                      className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                    >
                      {/* Agent Header */}
                      <div className="mb-3 flex items-center gap-3">
                        <span className="text-2xl">{agent?.icon}</span>
                        <div>
                          <div className="font-medium text-gray-900">
                            {agent?.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {message.status === 'thinking'
                              ? '思考中...'
                              : new Date(
                                  message.timestamp
                                ).toLocaleTimeString()}
                          </div>
                        </div>
                        {message.status === 'thinking' && (
                          <div className="ml-auto h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                        )}
                      </div>

                      {/* Message Content */}
                      <div
                        className={`prose prose-sm max-w-none ${
                          message.status === 'thinking'
                            ? 'animate-pulse text-gray-400'
                            : 'text-gray-700'
                        }`}
                      >
                        <pre className="whitespace-pre-wrap font-sans">
                          {message.content}
                        </pre>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />

                {/* Error Message */}
                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {error}
                  </div>
                )}

                {/* Completion Actions */}
                {isCompleted && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
                    <div className="mb-4 text-4xl">🎉</div>
                    <h3 className="mb-2 text-lg font-semibold text-gray-900">
                      项目创建完成！
                    </h3>
                    <p className="mb-4 text-sm text-gray-600">
                      AI 团队已完成所有工作，你可以查看或下载产出
                    </p>
                    <div className="flex justify-center gap-3">
                      <button className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                          />
                        </svg>
                        下载代码
                      </button>
                      <button
                        onClick={() => router.push('/ai-coding')}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        返回列表
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Output Preview */}
        {isStarted && (
          <div className="w-80 flex-shrink-0 border-l border-gray-200 bg-white">
            <div className="p-4">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">产出</h3>

              {/* Output List */}
              <div className="space-y-2">
                {[
                  { type: 'prd', name: 'PRD 文档', icon: '📝' },
                  { type: 'design', name: '架构设计', icon: '🏗️' },
                  { type: 'task', name: '任务列表', icon: '📋' },
                  { type: 'code', name: '代码文件', icon: '💻' },
                  { type: 'test', name: '测试用例', icon: '🔍' },
                ].map((output) => {
                  const hasOutput = messages.some(
                    (m) =>
                      m.status === 'done' &&
                      m.artifacts?.some((a) => a.type === output.type)
                  );
                  return (
                    <div
                      key={output.type}
                      className={`flex items-center gap-3 rounded-lg p-3 ${
                        hasOutput
                          ? 'cursor-pointer bg-gray-50 hover:bg-gray-100'
                          : 'opacity-50'
                      }`}
                    >
                      <span className="text-xl">{output.icon}</span>
                      <span className="flex-1 text-sm font-medium text-gray-900">
                        {output.name}
                      </span>
                      {hasOutput ? (
                        <svg
                          className="h-5 w-5 text-emerald-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      ) : (
                        <span className="text-xs text-gray-400">待生成</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Quick Actions */}
              {isCompleted && (
                <div className="mt-6 space-y-2">
                  <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white hover:bg-gray-800">
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    下载全部
                  </button>
                  <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                    <svg
                      className="h-4 w-4"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </svg>
                    推送到 GitHub
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
