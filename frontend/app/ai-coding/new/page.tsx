'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/layout/Sidebar';
import {
  useAiCodingSocket,
  TeamMessageEvent,
  ProjectProgressEvent,
  AgentStatusEvent,
  ProjectCompleteEvent,
  ProjectErrorEvent,
} from '@/hooks/useAiCodingSocket';

// Agent types for multi-agent collaboration
interface AgentMessage {
  id: string;
  agentRole: string;
  content: string;
  timestamp: Date;
  status: 'thinking' | 'done' | 'error';
  messageType?: string;
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

// Role mapping from backend to frontend
const ROLE_MAP: Record<string, AgentRole> = {
  PM: 'pm',
  ARCHITECT: 'architect',
  PM_LEAD: 'pmLead',
  ENGINEER: 'engineer',
  QA: 'qa',
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
  const [projectId, setProjectId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isAuthenticated = !!accessToken;

  // WebSocket event handlers
  const handleTeamMessage = useCallback((event: TeamMessageEvent) => {
    console.log('[NewCodingProject] Team message received:', event);
    const { message } = event;
    const role = message.senderRole
      ? ROLE_MAP[message.senderRole] || 'pm'
      : 'pm';

    // Skip SYSTEM and THINKING messages for main display
    if (message.messageType === 'SYSTEM') {
      return;
    }

    // For OUTPUT messages, update or add message
    if (message.messageType === 'OUTPUT') {
      setMessages((prev) => {
        // Check if we have a thinking message for this role
        const thinkingIdx = prev.findIndex(
          (m) => m.agentRole === role && m.status === 'thinking'
        );
        if (thinkingIdx !== -1) {
          // Replace thinking message with output
          const updated = [...prev];
          updated[thinkingIdx] = {
            id: message.id,
            agentRole: role,
            content: message.content,
            timestamp: new Date(message.createdAt),
            status: 'done',
            messageType: message.messageType,
          };
          return updated;
        }
        // Add new message
        return [
          ...prev,
          {
            id: message.id,
            agentRole: role,
            content: message.content,
            timestamp: new Date(message.createdAt),
            status: 'done',
            messageType: message.messageType,
          },
        ];
      });
    } else if (message.messageType === 'THINKING') {
      // Add thinking message
      setMessages((prev) => [
        ...prev,
        {
          id: message.id,
          agentRole: role,
          content: message.content,
          timestamp: new Date(message.createdAt),
          status: 'thinking',
          messageType: message.messageType,
        },
      ]);
    }
  }, []);

  const handleProgress = useCallback((event: ProjectProgressEvent) => {
    console.log('[NewCodingProject] Progress:', event);
    setProgress(event.progress);

    // Map phase to agent role
    const phaseToRole: Record<string, AgentRole> = {
      pm: 'pm',
      architect: 'architect',
      pm_lead: 'pmLead',
      engineer: 'engineer',
      qa: 'qa',
    };

    const role = phaseToRole[event.phase];
    if (role) {
      setCurrentAgent(role);
      if (event.status === 'started') {
        setAgents((prev) =>
          prev.map((a) => (a.role === role ? { ...a, status: 'running' } : a))
        );
      } else if (event.status === 'completed') {
        setAgents((prev) =>
          prev.map((a) => (a.role === role ? { ...a, status: 'completed' } : a))
        );
      } else if (event.status === 'failed') {
        setAgents((prev) =>
          prev.map((a) => (a.role === role ? { ...a, status: 'error' } : a))
        );
      }
    }
  }, []);

  const handleAgentStatus = useCallback((event: AgentStatusEvent) => {
    console.log('[NewCodingProject] Agent status:', event);
    const role =
      ROLE_MAP[event.agent.toUpperCase()] || (event.agent as AgentRole);

    setAgents((prev) =>
      prev.map((a) => {
        if (a.role === role) {
          let status: Agent['status'] = 'pending';
          if (event.status === 'running') status = 'running';
          else if (event.status === 'completed') status = 'completed';
          else if (event.status === 'failed') status = 'error';
          return { ...a, status };
        }
        return a;
      })
    );

    if (event.status === 'running') {
      setCurrentAgent(role);
    }
  }, []);

  const handleComplete = useCallback((event: ProjectCompleteEvent) => {
    console.log('[NewCodingProject] Complete:', event);
    setIsCompleted(true);
    setCurrentAgent(null);
    setAgents((prev) => prev.map((a) => ({ ...a, status: 'completed' })));
  }, []);

  const handleError = useCallback((event: ProjectErrorEvent) => {
    console.error('[NewCodingProject] Error:', event);
    setError(event.error);
  }, []);

  // Use WebSocket hook
  const { isConnected, joinProject } = useAiCodingSocket({
    projectId: projectId || undefined,
    onTeamMessage: handleTeamMessage,
    onProgress: handleProgress,
    onAgentStatus: handleAgentStatus,
    onComplete: handleComplete,
    onError: handleError,
  });

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Join project room when projectId is set and connected
  useEffect(() => {
    if (projectId && isConnected && joinProject) {
      console.log('[NewCodingProject] Joining project room:', projectId);
      joinProject(projectId);
    }
  }, [projectId, isConnected, joinProject]);

  // Start multi-agent collaboration via AI Coding API
  const startProject = useCallback(async () => {
    if (!requirement.trim() || !accessToken) return;

    setIsCreating(true);
    setError(null);
    setMessages([]);
    setProgress(0);
    setAgents(AGENTS);

    try {
      // Step 1: Create project via AI Coding API
      console.log('[NewCodingProject] Creating project...');
      const createResponse = await fetch('/api/v1/ai-coding/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: projectName || requirement.slice(0, 50),
          description: requirement,
          techStack,
        }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => ({}));
        throw new Error(errorData.message || '创建项目失败');
      }

      const project = await createResponse.json();
      console.log('[NewCodingProject] Project created:', project);
      setProjectId(project.id);
      setIsStarted(true);

      // Wait a bit for WebSocket to connect and join room
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Step 2: Start the project execution
      console.log('[NewCodingProject] Starting project execution...');
      const startResponse = await fetch(
        `/api/v1/ai-coding/projects/${project.id}/start`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!startResponse.ok) {
        const errorData = await startResponse.json().catch(() => ({}));
        throw new Error(errorData.message || '启动项目失败');
      }

      console.log('[NewCodingProject] Project started successfully');
    } catch (err) {
      console.error('[NewCodingProject] Error:', err);
      setError(err instanceof Error ? err.message : '发生错误，请重试');
      setIsStarted(false);
    } finally {
      setIsCreating(false);
    }
  }, [requirement, projectName, techStack, accessToken]);

  // Get agent name
  const getAgentName = (role: string): string => {
    const names: Record<string, string> = {
      pm: '产品经理',
      architect: '架构师',
      pmLead: '项目经理',
      engineer: '工程师',
      qa: 'QA 工程师',
    };
    return names[role] || role;
  };

  // Get agent icon
  const getAgentIcon = (role: string): string => {
    const icons: Record<string, string> = {
      pm: '📝',
      architect: '🏗️',
      pmLead: '📋',
      engineer: '💻',
      qa: '🔍',
    };
    return icons[role] || '🤖';
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
              {projectName || requirement?.slice(0, 30) || '新建项目'}
            </h1>
            {template && (
              <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-600">
                {template.name} 模板
              </span>
            )}
            {isConnected && isStarted && (
              <span className="ml-2 inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-600">
                已连接
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

                  {/* Error Message */}
                  {error && (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      {error}
                    </div>
                  )}

                  {/* Start Button */}
                  <button
                    onClick={startProject}
                    disabled={!requirement.trim() || isCreating}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isCreating ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        创建中...
                      </>
                    ) : (
                      <>
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
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* Collaboration Messages */
              <div className="space-y-4">
                {messages.length === 0 && !isCompleted && (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
                      <p className="text-gray-500">AI 团队正在工作中...</p>
                    </div>
                  </div>
                )}

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
                        <span className="text-2xl">
                          {agent?.icon || getAgentIcon(message.agentRole)}
                        </span>
                        <div>
                          <div className="font-medium text-gray-900">
                            {agent?.name || getAgentName(message.agentRole)}
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
                  { type: 'prd', name: 'PRD 文档', icon: '📝', role: 'pm' },
                  {
                    type: 'design',
                    name: '架构设计',
                    icon: '🏗️',
                    role: 'architect',
                  },
                  {
                    type: 'task',
                    name: '任务列表',
                    icon: '📋',
                    role: 'pmLead',
                  },
                  {
                    type: 'code',
                    name: '代码文件',
                    icon: '💻',
                    role: 'engineer',
                  },
                  { type: 'test', name: '测试用例', icon: '🔍', role: 'qa' },
                ].map((output) => {
                  const hasOutput = messages.some(
                    (m) => m.status === 'done' && m.agentRole === output.role
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
