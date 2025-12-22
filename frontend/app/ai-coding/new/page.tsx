'use client';

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  Suspense,
  useMemo,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/layout/Sidebar';
import AIMessageRenderer from '@/components/ui/AIMessageRenderer';
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
  const { isConnected, joinProject, getTeamMessages } = useAiCodingSocket({
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

  // Note: Room joining is now handled in startProject function to ensure
  // proper sequencing before starting project execution

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
      const requirementText = requirement?.trim() || '';
      if (requirementText.length < 10) {
        throw new Error('需求描述至少需要10个字符');
      }

      console.log(
        '[NewCodingProject] Creating project with requirement:',
        requirementText.slice(0, 50)
      );
      const createResponse = await fetch('/api/v1/ai-coding/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: projectName || requirementText.slice(0, 50),
          description: requirementText.slice(0, 500),
          requirement: requirementText,
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

      // Wait for WebSocket to be ready and join the project room
      // This ensures we receive all messages from the beginning
      let joinAttempts = 0;
      const maxAttempts = 10;
      let joined = false;

      while (!joined && joinAttempts < maxAttempts) {
        if (isConnected && joinProject) {
          console.log(
            `[NewCodingProject] Attempting to join project room (attempt ${joinAttempts + 1})...`
          );
          joined = await joinProject(project.id);
          if (joined) {
            console.log('[NewCodingProject] Successfully joined project room');
            break;
          }
        }
        joinAttempts++;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      if (!joined) {
        console.warn(
          '[NewCodingProject] Could not join WebSocket room, proceeding anyway'
        );
      }

      // Fetch any historical messages that might have been sent before we joined
      if (joined && getTeamMessages) {
        try {
          const historyMessages = await getTeamMessages(project.id, 100);
          if (historyMessages && historyMessages.length > 0) {
            console.log(
              `[NewCodingProject] Fetched ${historyMessages.length} historical messages`
            );
            // Convert historical messages to our format
            historyMessages.forEach((msg) => {
              const role = msg.senderRole
                ? ROLE_MAP[msg.senderRole] || 'pm'
                : 'pm';
              if (
                msg.messageType === 'OUTPUT' ||
                msg.messageType === 'THINKING'
              ) {
                setMessages((prev) => {
                  // Avoid duplicates
                  if (prev.some((m) => m.id === msg.id)) return prev;
                  return [
                    ...prev,
                    {
                      id: msg.id,
                      agentRole: role,
                      content: msg.content,
                      timestamp: new Date(msg.createdAt),
                      status:
                        msg.messageType === 'THINKING' ? 'thinking' : 'done',
                      messageType: msg.messageType,
                    },
                  ];
                });
              }
            });
          }
        } catch (historyError) {
          console.warn(
            '[NewCodingProject] Failed to fetch historical messages:',
            historyError
          );
        }
      }

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
  }, [
    requirement,
    projectName,
    techStack,
    accessToken,
    isConnected,
    joinProject,
    getTeamMessages,
  ]);

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
              /* Collaboration Messages - Enhanced Visualization */
              <div className="space-y-4">
                {/* Progress Timeline */}
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-700">
                      开发流程
                    </h4>
                    <span className="text-xs text-gray-500">
                      {progress}% 完成
                    </span>
                  </div>
                  <div className="mb-2 h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between">
                    {agents.map((agent, idx) => (
                      <div
                        key={agent.role}
                        className="flex flex-col items-center"
                      >
                        <div
                          className={`mb-1 flex h-8 w-8 items-center justify-center rounded-full text-sm transition-all duration-300 ${
                            agent.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-600'
                              : agent.status === 'running'
                                ? 'animate-pulse bg-blue-100 text-blue-600 ring-2 ring-blue-400 ring-offset-2'
                                : agent.status === 'error'
                                  ? 'bg-red-100 text-red-600'
                                  : 'bg-gray-100 text-gray-400'
                          }`}
                        >
                          {agent.status === 'completed' ? (
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
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          ) : agent.status === 'running' ? (
                            <svg
                              className="h-4 w-4 animate-spin"
                              fill="none"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              />
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                              />
                            </svg>
                          ) : (
                            <span className="text-xs">{idx + 1}</span>
                          )}
                        </div>
                        <span
                          className={`text-xs ${agent.status === 'running' ? 'font-medium text-blue-600' : 'text-gray-500'}`}
                        >
                          {agent.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Current Agent Working Status */}
                {currentAgent && !isCompleted && (
                  <div className="overflow-hidden rounded-xl border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                    <div className="flex items-center gap-3 border-b border-blue-100 bg-white/50 px-4 py-3">
                      <div className="relative">
                        <span className="text-2xl">
                          {agents.find((a) => a.role === currentAgent)?.icon}
                        </span>
                        <span className="absolute -bottom-1 -right-1 flex h-3 w-3">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                          <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500"></span>
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">
                          {agents.find((a) => a.role === currentAgent)?.name}{' '}
                          正在工作
                        </div>
                        <div className="text-xs text-gray-500">
                          {
                            agents.find((a) => a.role === currentAgent)
                              ?.description
                          }
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-blue-600">
                        <svg
                          className="h-4 w-4 animate-spin"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        处理中
                      </div>
                    </div>
                    {/* Streaming dots animation */}
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span>正在生成内容</span>
                        <span className="inline-flex gap-1">
                          <span
                            className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500"
                            style={{ animationDelay: '0ms' }}
                          />
                          <span
                            className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500"
                            style={{ animationDelay: '150ms' }}
                          />
                          <span
                            className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500"
                            style={{ animationDelay: '300ms' }}
                          />
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Messages with Markdown Rendering */}
                {messages.length === 0 && !isCompleted && !currentAgent && (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
                      <p className="text-gray-500">正在初始化 AI 团队...</p>
                    </div>
                  </div>
                )}

                {messages.map((message) => {
                  const agent = agents.find(
                    (a) => a.role === message.agentRole
                  );
                  const agentColors: Record<
                    string,
                    { bg: string; border: string; icon: string }
                  > = {
                    pm: {
                      bg: 'bg-blue-50',
                      border: 'border-blue-200',
                      icon: 'text-blue-600',
                    },
                    architect: {
                      bg: 'bg-purple-50',
                      border: 'border-purple-200',
                      icon: 'text-purple-600',
                    },
                    pmLead: {
                      bg: 'bg-orange-50',
                      border: 'border-orange-200',
                      icon: 'text-orange-600',
                    },
                    engineer: {
                      bg: 'bg-green-50',
                      border: 'border-green-200',
                      icon: 'text-green-600',
                    },
                    qa: {
                      bg: 'bg-red-50',
                      border: 'border-red-200',
                      icon: 'text-red-600',
                    },
                  };
                  const colors =
                    agentColors[message.agentRole] || agentColors.pm;

                  return (
                    <div
                      key={message.id}
                      className={`overflow-hidden rounded-xl border shadow-sm transition-all duration-300 ${
                        message.status === 'thinking'
                          ? 'border-gray-200 bg-gray-50'
                          : `${colors.border} bg-white`
                      }`}
                    >
                      {/* Agent Header */}
                      <div
                        className={`flex items-center gap-3 border-b px-4 py-3 ${
                          message.status === 'thinking'
                            ? 'border-gray-100 bg-gray-50'
                            : `${colors.border} ${colors.bg}`
                        }`}
                      >
                        <span
                          className={`text-2xl ${message.status === 'thinking' ? 'opacity-50' : ''}`}
                        >
                          {agent?.icon || getAgentIcon(message.agentRole)}
                        </span>
                        <div className="flex-1">
                          <div
                            className={`font-medium ${message.status === 'thinking' ? 'text-gray-500' : 'text-gray-900'}`}
                          >
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
                        {message.status === 'thinking' ? (
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
                            分析中
                          </div>
                        ) : (
                          <div
                            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${colors.bg} ${colors.icon}`}
                          >
                            <svg
                              className="h-3 w-3"
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
                            完成
                          </div>
                        )}
                      </div>

                      {/* Message Content with Markdown */}
                      <div
                        className={`p-4 ${message.status === 'thinking' ? 'animate-pulse' : ''}`}
                      >
                        {message.status === 'thinking' ? (
                          <div className="flex items-center gap-2 text-sm text-gray-400">
                            <span>正在生成内容</span>
                            <span className="inline-flex gap-1">
                              <span
                                className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
                                style={{ animationDelay: '0ms' }}
                              />
                              <span
                                className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
                                style={{ animationDelay: '150ms' }}
                              />
                              <span
                                className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
                                style={{ animationDelay: '300ms' }}
                              />
                            </span>
                          </div>
                        ) : (
                          <div className="max-h-96 overflow-y-auto">
                            <AIMessageRenderer content={message.content} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />

                {/* Error Message */}
                {error && (
                  <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
                    <svg
                      className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div>
                      <h4 className="text-sm font-medium text-red-800">
                        执行出错
                      </h4>
                      <p className="mt-1 text-sm text-red-700">{error}</p>
                    </div>
                  </div>
                )}

                {/* Completion Actions */}
                {isCompleted && (
                  <div className="overflow-hidden rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50">
                    <div className="p-6 text-center">
                      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                        <svg
                          className="h-8 w-8 text-emerald-600"
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
                      </div>
                      <h3 className="mb-2 text-lg font-semibold text-gray-900">
                        项目创建完成！
                      </h3>
                      <p className="mb-4 text-sm text-gray-600">
                        AI 团队已完成所有工作，共生成{' '}
                        {messages.filter((m) => m.status === 'done').length}{' '}
                        份产出
                      </p>
                      <div className="flex justify-center gap-3">
                        {projectId && (
                          <button
                            onClick={() =>
                              router.push(`/ai-coding/${projectId}`)
                            }
                            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
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
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                              />
                            </svg>
                            查看项目详情
                          </button>
                        )}
                        <button
                          onClick={() => router.push('/ai-coding')}
                          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          返回列表
                        </button>
                      </div>
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
