'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import ReactMarkdown from 'react-markdown';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { useAIWritingStore } from '@/stores/aiWritingStore';
import { useWritingWebSocket } from '@/hooks/useWritingWebSocket';
import type { Chapter } from '@/lib/api/ai-writing';

// Dynamic import for Canvas component
const WritingCanvas = dynamic(
  () => import('@/components/ai-writing/WritingCanvas'),
  { ssr: false }
);

// AI Writing Team - 8 Agents (max configuration)
// Leader decides actual count at runtime
const WRITING_AGENTS = [
  {
    id: 'architect',
    name: '故事架构师',
    icon: '👑',
    color: 'bg-purple-500',
    desc: '统筹规划',
  },
  {
    id: 'keeper',
    name: '设定守护者',
    icon: '📚',
    color: 'bg-indigo-500',
    desc: '世界观',
  },
  {
    id: 'writer-1',
    name: '作家①',
    icon: '✍️',
    color: 'bg-blue-500',
    desc: '内容创作',
  },
  {
    id: 'writer-2',
    name: '作家②',
    icon: '✍️',
    color: 'bg-sky-500',
    desc: '内容创作',
  },
  {
    id: 'writer-3',
    name: '作家③',
    icon: '✍️',
    color: 'bg-cyan-500',
    desc: '内容创作',
  },
  {
    id: 'checker-1',
    name: '检查员①',
    icon: '🔍',
    color: 'bg-amber-500',
    desc: '逻辑校验',
  },
  {
    id: 'checker-2',
    name: '检查员②',
    icon: '🔍',
    color: 'bg-orange-500',
    desc: '逻辑校验',
  },
  {
    id: 'editor',
    name: '润色编辑',
    icon: '🎨',
    color: 'bg-green-500',
    desc: '文字打磨',
  },
];

export default function WritingProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const { user, isLoading: authLoading } = useAuth();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    currentProject,
    isLoadingProjects,
    volumes,
    isLoadingVolumes,
    storyBible,
    error,
    fetchProject,
    fetchVolumes,
    fetchStoryBible,
    startMission,
    isMissionRunning,
    missionProgress,
    missionMessage,
    missionCompleted,
    activeAgentIds,
    clearError,
  } = useAIWritingStore();

  const [userInput, setUserInput] = useState('');
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [showLeaderMenu, setShowLeaderMenu] = useState(false);
  const [activeTab, setActiveTab] = useState<'chapters' | 'worldview'>(
    'chapters'
  );
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  // Agent 详情数据
  const agentDetails: Record<
    string,
    {
      name: string;
      role: string;
      description: string;
      skills: string[];
      tools: string[];
    }
  > = {
    architect: {
      name: '故事架构师',
      role: '团队领导',
      description:
        '负责统筹整体故事结构，规划章节大纲，确保叙事逻辑连贯。擅长把握故事节奏和情节转折。',
      skills: ['故事结构设计', '章节规划', '情节编排', '节奏把控'],
      tools: ['大纲生成器', '故事线追踪', '冲突设计器'],
    },
    keeper: {
      name: '设定守护者',
      role: '世界观管理',
      description:
        '维护故事世界观的一致性，管理角色设定、地点背景和时间线，确保细节不出错。',
      skills: ['世界观构建', '角色档案管理', '时间线维护', '设定校验'],
      tools: ['角色数据库', '世界观图谱', '时间线编辑器'],
    },
    'writer-1': {
      name: '作家①',
      role: '内容创作',
      description: '专注于创作生动的故事内容，擅长细腻的情感描写和人物对话。',
      skills: ['情感描写', '对话创作', '场景渲染', '人物刻画'],
      tools: ['文本生成器', '风格模板', '词汇库'],
    },
    'writer-2': {
      name: '作家②',
      role: '内容创作',
      description: '擅长动作场面和紧张情节的描写，为故事增添激动人心的元素。',
      skills: ['动作描写', '悬念构建', '节奏控制', '冲突展现'],
      tools: ['文本生成器', '风格模板', '词汇库'],
    },
    'writer-3': {
      name: '作家③',
      role: '内容创作',
      description: '专注于环境描写和氛围营造，让读者身临其境。',
      skills: ['环境描写', '氛围营造', '意象运用', '细节刻画'],
      tools: ['文本生成器', '风格模板', '词汇库'],
    },
    'checker-1': {
      name: '检查员①',
      role: '一致性审核',
      description: '负责检查内容的逻辑一致性和设定准确性，发现并标记问题。',
      skills: ['逻辑校验', '设定比对', '时间线检查', '角色行为分析'],
      tools: ['一致性检查器', '设定比对器', '问题标记器'],
    },
    'checker-2': {
      name: '检查员②',
      role: '质量审核',
      description: '专注于内容质量审核，包括文笔流畅度和表达准确性。',
      skills: ['文笔审核', '语法检查', '表达优化建议', '质量评分'],
      tools: ['语法检查器', '质量评估器', '改进建议器'],
    },
    editor: {
      name: '编辑',
      role: '润色优化',
      description: '对内容进行最终润色，优化文字表达，提升整体阅读体验。',
      skills: ['文字润色', '表达优化', '风格统一', '细节打磨'],
      tools: ['润色工具', '同义词库', '风格指南'],
    },
  };

  // 处理输入变化，检测 @Leader 提及
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setUserInput(value);

    // 检测 @ 触发，只显示 Leader 选项
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);

    if (atMatch) {
      const query = atMatch[1].toLowerCase();
      // 只有输入 @ 或 @l/@le/@lea/@lead/@leade/@leader 时显示
      if (query === '' || 'leader'.startsWith(query)) {
        setShowLeaderMenu(true);
      } else {
        setShowLeaderMenu(false);
      }
    } else {
      setShowLeaderMenu(false);
    }
  };

  // 选择 @Leader
  const handleSelectLeader = () => {
    const cursorPos = inputRef.current?.selectionStart || userInput.length;
    const textBeforeCursor = userInput.slice(0, cursorPos);
    const textAfterCursor = userInput.slice(cursorPos);

    // 替换 @query 为 @Leader
    const newTextBefore = textBeforeCursor.replace(/@\w*$/, '@Leader ');
    setUserInput(newTextBefore + textAfterCursor);
    setShowLeaderMenu(false);

    // 聚焦输入框
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // WebSocket for real-time updates
  const wsState = useWritingWebSocket(projectId, isMissionRunning);

  // Load project data
  useEffect(() => {
    if (user && projectId) {
      void fetchProject(projectId);
      void fetchVolumes(projectId);
      void fetchStoryBible(projectId);
    }
  }, [user, projectId, fetchProject, fetchVolumes, fetchStoryBible]);

  const handleStartWriting = async () => {
    if (!currentProject) return;
    try {
      await startMission(projectId, {
        prompt: userInput || currentProject.description || '开始写作',
        missionType: 'full_story',
      });
      setUserInput('');
    } catch {
      // Error handled by store
    }
  };

  const handleContinueWriting = async () => {
    if (!currentProject) return;
    try {
      await startMission(projectId, {
        prompt: userInput || '继续写作下一章',
        missionType: 'chapter',
      });
      setUserInput('');
    } catch {
      // Error handled by store
    }
  };

  const handleSendMessage = async () => {
    if (!userInput.trim() || !currentProject || isMissionRunning) return;

    // 检测是否 @Leader
    const hasLeaderMention = /@Leader\b/i.test(userInput);

    // @Leader 时使用 edit 类型，否则使用 chapter
    const missionType = hasLeaderMention ? 'edit' : 'chapter';

    // 清理提示词中的 @Leader 标记
    const cleanPrompt = userInput.replace(/@Leader\s*/gi, '').trim();

    try {
      await startMission(projectId, {
        prompt: cleanPrompt || userInput,
        missionType,
        targetAgent: hasLeaderMention ? 'leader' : undefined,
      });
      setUserInput('');
      setShowLeaderMenu(false);
    } catch {
      // Error handled by store
    }
  };

  const handleExport = () => {
    if (!currentProject) return;
    const allContent = volumes
      .flatMap((v) => v.chapters || [])
      .sort((a, b) => a.chapterNumber - b.chapterNumber)
      .map((c) => `# ${c.title}\n\n${c.content || ''}`)
      .join('\n\n---\n\n');
    const content = `# ${currentProject.name}\n\n${currentProject.description || ''}\n\n---\n\n${allContent}`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentProject.name}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Get all chapters sorted
  const allChapters = volumes
    .flatMap((v) => v.chapters || [])
    .sort((a, b) => a.chapterNumber - b.chapterNumber);

  const getProgress = () => {
    if (!currentProject || !currentProject.targetWords) return 0;
    return Math.min(
      100,
      Math.round(
        (currentProject.currentWords / currentProject.targetWords) * 100
      )
    );
  };

  if (authLoading || isLoadingProjects) {
    return (
      <AppShell>
        <main className="flex flex-1 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </main>
      </AppShell>
    );
  }

  if (!user) {
    router.push('/ai-writing');
    return null;
  }

  if (!currentProject) {
    return (
      <AppShell>
        <main className="flex flex-1 flex-col items-center justify-center p-8">
          <span className="mb-4 text-5xl">📖</span>
          <h2 className="mb-2 text-xl font-semibold text-gray-800">
            项目不存在
          </h2>
          <button
            onClick={() => router.push('/ai-writing')}
            className="text-amber-600 hover:underline"
          >
            返回项目列表
          </button>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="flex h-full flex-1 flex-col overflow-hidden bg-gray-50">
        {/* Compact Header */}
        <div className="shrink-0 border-b border-gray-200 bg-white px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/ai-writing')}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <div>
                <h1 className="text-lg font-bold text-gray-900">
                  {currentProject.name}
                </h1>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>
                    {currentProject.currentWords.toLocaleString()} /{' '}
                    {currentProject.targetWords.toLocaleString()} 字
                  </span>
                  <span className="font-medium text-amber-600">
                    ({getProgress()}%)
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Export */}
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
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
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                导出
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mt-3 flex items-center justify-between rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
            <span>{error}</span>
            <button
              onClick={clearError}
              className="text-red-500 hover:text-red-700"
            >
              ✕
            </button>
          </div>
        )}

        {/* Main Content */}
        <div className="flex flex-1 gap-4 overflow-hidden p-4">
          {/* Left: Embedded Canvas */}
          <div className="flex w-80 shrink-0 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-br from-slate-50 via-white to-violet-50 shadow-sm">
            {/* Canvas Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-3 py-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-800">
                  AI 写作团队
                </h2>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    isMissionRunning
                      ? 'bg-green-100 text-green-700'
                      : missionCompleted
                        ? 'bg-green-100 text-green-700'
                        : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {isMissionRunning
                    ? '进行中'
                    : missionCompleted
                      ? '已完成'
                      : '待开始'}
                </span>
              </div>
            </div>

            {/* Tree Visualization */}
            <div className="relative shrink-0 overflow-hidden">
              {/* Current Step */}
              <div className="py-1 text-center">
                <p className="line-clamp-1 px-2 text-xs text-slate-500">
                  {missionMessage || '等待任务开始...'}
                </p>
              </div>

              {/* Agent Tree - Two Rows */}
              <div className="relative mx-auto px-2 pb-2">
                {/* SVG Lines - use viewBox for proper scaling */}
                <svg
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  style={{ zIndex: 0 }}
                  viewBox="0 0 400 200"
                  preserveAspectRatio="xMidYMid meet"
                >
                  {/* Leader to first row (4 agents) */}
                  {[0, 1, 2, 3].map((i) => {
                    const leaderX = 200;
                    const memberX = 50 + i * 100;
                    return (
                      <path
                        key={`row1-${i}`}
                        d={`M ${leaderX} 45 C ${leaderX} 75 ${memberX} 75 ${memberX} 105`}
                        fill="none"
                        stroke={
                          missionCompleted || isMissionRunning
                            ? '#10B981'
                            : '#E2E8F0'
                        }
                        strokeWidth="2"
                        strokeDasharray={
                          missionCompleted || isMissionRunning ? '0' : '4'
                        }
                      />
                    );
                  })}
                  {/* First row to second row (3 agents) */}
                  {[0, 1, 2].map((i) => {
                    const fromX = 150 + i * 100; // From writers
                    const toX = 80 + i * 120;
                    return (
                      <path
                        key={`row2-${i}`}
                        d={`M ${fromX} 130 C ${fromX} 155 ${toX} 155 ${toX} 180`}
                        fill="none"
                        stroke={
                          missionCompleted || isMissionRunning
                            ? '#10B981'
                            : '#E2E8F0'
                        }
                        strokeWidth="2"
                        strokeDasharray={
                          missionCompleted || isMissionRunning ? '0' : '4'
                        }
                      />
                    );
                  })}
                </svg>

                {/* Leader Node */}
                {(() => {
                  const msg = missionMessage || '';
                  const isArchitectActive = [
                    '架构',
                    '规划',
                    '结构',
                    '大纲',
                  ].some((kw) => msg.includes(kw));
                  return (
                    <div
                      className="relative z-10 flex cursor-pointer flex-col items-center"
                      onClick={() => setSelectedAgent('architect')}
                    >
                      <div
                        className={`text-sm transition-transform duration-300 ${isArchitectActive ? 'scale-110' : ''}`}
                      >
                        👑
                      </div>
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full text-base transition-all duration-300 hover:ring-2 hover:ring-violet-300 ${
                          isArchitectActive
                            ? 'agent-glow-violet scale-110 bg-gradient-to-br from-violet-400 to-violet-600'
                            : missionCompleted
                              ? 'bg-violet-500 shadow-md ring-2 ring-green-300'
                              : 'bg-violet-500 shadow-md'
                        }`}
                      >
                        <span className="text-white drop-shadow-md">📐</span>
                      </div>
                      <div className="text-center">
                        <div
                          className={`text-[10px] font-medium transition-colors ${isArchitectActive ? 'text-violet-600' : 'text-slate-700'}`}
                        >
                          架构师
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* First Row: 守护者 + 3个作家 */}
                <div className="relative z-10 mt-2 flex justify-around">
                  {[
                    {
                      id: 'keeper',
                      icon: '📚',
                      name: '守护者',
                      gradient: 'from-indigo-400 to-indigo-600',
                      bgColor: 'bg-indigo-500',
                      glowClass: 'agent-glow-indigo',
                      textColor: 'text-indigo-600',
                      keywords: ['世界观', '设定', '守护'],
                    },
                    {
                      id: 'writer-1',
                      icon: '✍️',
                      name: '作家①',
                      gradient: 'from-amber-400 to-amber-600',
                      bgColor: 'bg-amber-500',
                      glowClass: 'agent-glow-amber',
                      textColor: 'text-amber-600',
                      keywords: ['作家', '写作', '创作', '章节', '撰写'],
                    },
                    {
                      id: 'writer-2',
                      icon: '✍️',
                      name: '作家②',
                      gradient: 'from-orange-400 to-orange-600',
                      bgColor: 'bg-orange-500',
                      glowClass: 'agent-glow-amber',
                      textColor: 'text-orange-600',
                      keywords: ['作家', '写作', '创作', '章节', '撰写'],
                    },
                    {
                      id: 'writer-3',
                      icon: '✍️',
                      name: '作家③',
                      gradient: 'from-yellow-400 to-yellow-600',
                      bgColor: 'bg-yellow-500',
                      glowClass: 'agent-glow-amber',
                      textColor: 'text-yellow-600',
                      keywords: ['作家', '写作', '创作', '章节', '撰写'],
                    },
                  ].map((agent) => {
                    const msg = missionMessage || '';
                    const isActive = agent.keywords.some((kw) =>
                      msg.includes(kw)
                    );
                    return (
                      <div
                        key={agent.id}
                        className="flex cursor-pointer flex-col items-center"
                        onClick={() => setSelectedAgent(agent.id)}
                      >
                        <div
                          className={`flex h-9 w-9 items-center justify-center rounded-full text-sm transition-all duration-300 hover:ring-2 hover:ring-slate-300 ${
                            isActive
                              ? `${agent.glowClass} scale-110 bg-gradient-to-br ${agent.gradient}`
                              : missionCompleted
                                ? `${agent.bgColor} shadow-md ring-2 ring-green-300`
                                : `${agent.bgColor} shadow-md`
                          }`}
                        >
                          <span className="text-white drop-shadow">
                            {agent.icon}
                          </span>
                        </div>
                        <div className="text-center">
                          <div
                            className={`text-[10px] ${isActive ? `font-semibold ${agent.textColor}` : 'text-slate-600'}`}
                          >
                            {agent.name}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Second Row: 2个检查员 + 编辑 */}
                <div className="relative z-10 mt-2 flex justify-around px-4">
                  {[
                    {
                      id: 'checker-1',
                      icon: '🔍',
                      name: '检查①',
                      gradient: 'from-green-400 to-green-600',
                      bgColor: 'bg-green-500',
                      glowClass: 'agent-glow-green',
                      textColor: 'text-green-600',
                      keywords: ['检查', '校验', '一致性', '审核', '检查员'],
                    },
                    {
                      id: 'checker-2',
                      icon: '🔍',
                      name: '检查②',
                      gradient: 'from-emerald-400 to-emerald-600',
                      bgColor: 'bg-emerald-500',
                      glowClass: 'agent-glow-green',
                      textColor: 'text-emerald-600',
                      keywords: ['检查', '校验', '一致性', '审核', '检查员'],
                    },
                    {
                      id: 'editor',
                      icon: '📝',
                      name: '编辑',
                      gradient: 'from-pink-400 to-pink-600',
                      bgColor: 'bg-pink-500',
                      glowClass: 'agent-glow-pink',
                      textColor: 'text-pink-600',
                      keywords: ['编辑', '润色', '打磨', '优化'],
                    },
                  ].map((agent) => {
                    const msg = missionMessage || '';
                    const isActive = agent.keywords.some((kw) =>
                      msg.includes(kw)
                    );
                    return (
                      <div
                        key={agent.id}
                        className="flex cursor-pointer flex-col items-center"
                        onClick={() => setSelectedAgent(agent.id)}
                      >
                        <div
                          className={`flex h-9 w-9 items-center justify-center rounded-full text-sm transition-all duration-300 hover:ring-2 hover:ring-slate-300 ${
                            isActive
                              ? `${agent.glowClass} scale-110 bg-gradient-to-br ${agent.gradient}`
                              : missionCompleted
                                ? `${agent.bgColor} shadow-md ring-2 ring-green-300`
                                : `${agent.bgColor} shadow-md`
                          }`}
                        >
                          <span className="text-white drop-shadow">
                            {agent.icon}
                          </span>
                        </div>
                        <div className="text-center">
                          <div
                            className={`text-[10px] ${isActive ? `font-semibold ${agent.textColor}` : 'text-slate-600'}`}
                          >
                            {agent.name}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Progress Steps - Scrollable area */}
            <div className="mx-3 mb-3 min-h-0 flex-1 overflow-auto rounded-lg bg-slate-50 p-3">
              <div className="space-y-2">
                {[
                  {
                    id: 'architect',
                    label: '规划故事结构',
                    icon: '👑',
                    keywords: ['架构', '规划', '结构', '大纲'],
                  },
                  {
                    id: 'keeper',
                    label: '建立世界观设定',
                    icon: '📚',
                    keywords: ['世界观', '设定', '守护'],
                  },
                  {
                    id: 'writer',
                    label: '创作故事内容',
                    icon: '✍️',
                    keywords: ['作家', '写作', '创作', '章节', '撰写'],
                  },
                  {
                    id: 'checker',
                    label: '校验内容一致性',
                    icon: '🔍',
                    keywords: ['检查', '校验', '一致性', '审核', '检查员'],
                  },
                  {
                    id: 'editor',
                    label: '润色文字表达',
                    icon: '🎨',
                    keywords: ['编辑', '润色', '打磨', '优化'],
                  },
                ].map((step, idx) => {
                  const msg = missionMessage || '';
                  const isStepActive = step.keywords.some((kw) =>
                    msg.includes(kw)
                  );
                  const stepThreshold = (idx + 1) * 20;
                  const isDone =
                    missionProgress >= stepThreshold && !isStepActive;
                  return (
                    <div key={step.id} className="flex items-center gap-2">
                      <div
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs transition-all ${
                          isStepActive
                            ? 'animate-pulse bg-amber-500 text-white ring-2 ring-amber-200'
                            : isDone
                              ? 'bg-green-500 text-white'
                              : 'bg-gray-200 text-gray-400'
                        }`}
                      >
                        {isDone ? '✓' : step.icon}
                      </div>
                      <span
                        className={`text-xs ${
                          isStepActive
                            ? 'font-medium text-amber-700'
                            : isDone
                              ? 'text-green-700'
                              : 'text-gray-400'
                        }`}
                      >
                        {step.label}
                        {isStepActive && (
                          <span className="ml-1 text-amber-500">...</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
              {/* Progress Bar */}
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-slate-500">
                  <span>整体进度</span>
                  <span className="font-semibold text-amber-600">
                    {Math.round(missionProgress)}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full transition-all duration-500 ${
                      missionCompleted
                        ? 'bg-gradient-to-r from-green-400 to-emerald-500'
                        : 'bg-gradient-to-r from-amber-400 to-orange-500'
                    }`}
                    style={{ width: `${missionProgress}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex shrink-0 items-center justify-center gap-2 border-t border-gray-100 bg-white/80 px-3 py-2">
              <button
                onClick={handleStartWriting}
                disabled={isMissionRunning}
                className="flex items-center gap-1 rounded-md bg-violet-500 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span>+</span>
                创建任务
              </button>
              <button
                onClick={handleContinueWriting}
                disabled={isMissionRunning || allChapters.length === 0}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                继续任务
              </button>
              <button
                disabled={!isMissionRunning}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                取消任务
              </button>
            </div>
          </div>

          {/* Right: Content Area */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Tabbed Content */}
            <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              {/* Tab Header */}
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
                <div className="flex gap-1">
                  <button
                    onClick={() => setActiveTab('chapters')}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      activeTab === 'chapters'
                        ? 'bg-amber-100 text-amber-700'
                        : 'text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    📖 章节列表
                    <span className="ml-1 text-xs">({allChapters.length})</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('worldview')}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      activeTab === 'worldview'
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    🌍 世界观
                    {storyBible?.premise && (
                      <span className="ml-1 text-xs text-green-500">✓</span>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-4">
                {/* Chapters Tab */}
                {activeTab === 'chapters' && (
                  <>
                    {isLoadingVolumes ? (
                      <div className="flex h-full items-center justify-center">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {/* Mission Running Status Banner */}
                        {isMissionRunning && (
                          <div className="mb-4 flex items-center gap-3 rounded-xl bg-amber-50 p-3">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                            <span className="text-sm font-medium text-amber-700">
                              {missionMessage || 'AI 团队正在创作中...'}
                            </span>
                          </div>
                        )}

                        {/* Chapter List */}
                        {allChapters.length > 0 ? (
                          <>
                            {allChapters.map((chapter) => (
                              <button
                                key={chapter.id}
                                onClick={() => setSelectedChapter(chapter)}
                                className="block w-full rounded-xl border border-gray-100 bg-white p-4 text-left transition-all hover:border-amber-200 hover:bg-amber-50"
                              >
                                <div className="flex items-start gap-3">
                                  <span
                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
                                      chapter.content
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-gray-100 text-gray-500'
                                    }`}
                                  >
                                    {chapter.content
                                      ? '✓'
                                      : chapter.chapterNumber}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="font-medium text-gray-800">
                                      第{chapter.chapterNumber}章{' '}
                                      {chapter.title}
                                    </div>
                                    {chapter.outline && (
                                      <div className="mt-1 line-clamp-2 text-xs text-gray-400">
                                        {chapter.outline}
                                      </div>
                                    )}
                                    {/* Show content preview if available */}
                                    {chapter.content && (
                                      <div className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs text-gray-500">
                                        {chapter.content.slice(0, 200)}...
                                      </div>
                                    )}
                                  </div>
                                  {chapter.wordCount > 0 && (
                                    <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                                      {chapter.wordCount.toLocaleString()} 字
                                    </span>
                                  )}
                                </div>
                              </button>
                            ))}

                            {/* Continue Writing Button */}
                            {!isMissionRunning && (
                              <button
                                onClick={handleContinueWriting}
                                className="w-full rounded-xl border-2 border-dashed border-gray-200 py-4 text-gray-500 transition-all hover:border-amber-300 hover:text-amber-600"
                              >
                                + 继续写作下一章
                              </button>
                            )}
                          </>
                        ) : (
                          /* Empty State */
                          <div className="flex h-full flex-col items-center justify-center py-12 text-center">
                            {isMissionRunning ? (
                              <>
                                <div className="mx-auto mb-4 flex h-12 w-12 animate-pulse items-center justify-center rounded-full bg-amber-100">
                                  <span className="text-2xl">✍️</span>
                                </div>
                                <p className="text-sm text-gray-500">
                                  AI 团队正在创作，章节内容将实时显示在这里...
                                </p>
                              </>
                            ) : missionCompleted ? (
                              <>
                                <span className="mb-4 text-4xl">✅</span>
                                <h3 className="mb-2 text-lg font-semibold text-gray-800">
                                  创作任务已完成
                                </h3>
                                <button
                                  onClick={() => fetchVolumes(projectId)}
                                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600"
                                >
                                  🔄 刷新内容
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="mb-4 text-4xl">📝</span>
                                <h3 className="mb-2 text-lg font-semibold text-gray-800">
                                  开始你的创作
                                </h3>
                                <p className="mb-4 max-w-xs text-sm text-gray-500">
                                  {currentProject.description ||
                                    '点击左侧创建任务按钮，AI 团队将自动完成故事创作'}
                                </p>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Worldview Tab */}
                {activeTab === 'worldview' && (
                  <div className="space-y-4">
                    {storyBible ? (
                      <>
                        {/* Premise */}
                        {storyBible.premise && (
                          <div className="rounded-xl bg-indigo-50 p-4">
                            <h3 className="mb-2 flex items-center gap-2 font-medium text-indigo-800">
                              <span>💡</span> 核心概念
                            </h3>
                            <p className="whitespace-pre-wrap text-sm text-indigo-700">
                              {storyBible.premise}
                            </p>
                          </div>
                        )}

                        {/* Theme */}
                        {storyBible.theme && (
                          <div className="rounded-xl bg-purple-50 p-4">
                            <h3 className="mb-2 flex items-center gap-2 font-medium text-purple-800">
                              <span>🎭</span> 主题
                            </h3>
                            <p className="whitespace-pre-wrap text-sm text-purple-700">
                              {storyBible.theme}
                            </p>
                          </div>
                        )}

                        {/* Setting */}
                        {storyBible.setting && (
                          <div className="rounded-xl bg-blue-50 p-4">
                            <h3 className="mb-2 flex items-center gap-2 font-medium text-blue-800">
                              <span>🌍</span> 世界设定
                            </h3>
                            <p className="whitespace-pre-wrap text-sm text-blue-700">
                              {storyBible.setting}
                            </p>
                          </div>
                        )}

                        {/* Tone */}
                        {storyBible.tone && (
                          <div className="rounded-xl bg-amber-50 p-4">
                            <h3 className="mb-2 flex items-center gap-2 font-medium text-amber-800">
                              <span>🎨</span> 基调风格
                            </h3>
                            <p className="whitespace-pre-wrap text-sm text-amber-700">
                              {storyBible.tone}
                            </p>
                          </div>
                        )}

                        {/* Writing Style */}
                        {storyBible.writingStyle && (
                          <div className="rounded-xl bg-green-50 p-4">
                            <h3 className="mb-2 flex items-center gap-2 font-medium text-green-800">
                              <span>✍️</span> 写作风格
                            </h3>
                            <p className="whitespace-pre-wrap text-sm text-green-700">
                              {storyBible.writingStyle}
                            </p>
                          </div>
                        )}

                        {/* Empty fields message */}
                        {!storyBible.premise &&
                          !storyBible.theme &&
                          !storyBible.setting &&
                          !storyBible.tone &&
                          !storyBible.writingStyle && (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                              <span className="mb-4 text-4xl">🌍</span>
                              <h3 className="mb-2 text-lg font-semibold text-gray-800">
                                世界观正在构建中
                              </h3>
                              <p className="text-sm text-gray-500">
                                AI 守护者正在建立故事的世界观设定...
                              </p>
                            </div>
                          )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <span className="mb-4 text-4xl">🌍</span>
                        <h3 className="mb-2 text-lg font-semibold text-gray-800">
                          暂无世界观设定
                        </h3>
                        <p className="text-sm text-gray-500">
                          开始创作后，AI 守护者将自动建立故事的世界观
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Input Area */}
            <div className="relative mt-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              {/* @Leader Dropdown - 只支持 Leader */}
              {showLeaderMenu && (
                <div className="absolute bottom-full left-4 mb-2 w-64 rounded-xl border border-gray-200 bg-white py-2 shadow-lg">
                  <div className="px-3 py-1.5 text-xs font-medium text-gray-400">
                    提及 Leader
                  </div>
                  <button
                    onClick={handleSelectLeader}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-amber-50"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-violet-600 text-sm">
                      👑
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-800">
                        @Leader
                      </div>
                      <div className="text-xs text-gray-400">
                        故事架构师 · 编辑调整内容
                      </div>
                    </div>
                  </button>
                </div>
              )}

              <div className="flex gap-3">
                <div className="relative flex-1">
                  <textarea
                    ref={inputRef}
                    value={userInput}
                    onChange={handleInputChange}
                    onKeyDown={(e) => {
                      // Handle Leader menu
                      if (showLeaderMenu) {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setShowLeaderMenu(false);
                        } else if (
                          e.key === 'Tab' ||
                          (e.key === 'Enter' && !e.shiftKey)
                        ) {
                          e.preventDefault();
                          handleSelectLeader();
                        }
                        return;
                      }
                      // Normal submit
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    onBlur={() => {
                      // Delay to allow click on menu
                      setTimeout(() => setShowLeaderMenu(false), 200);
                    }}
                    placeholder="输入 @Leader 让架构师编辑调整内容..."
                    rows={2}
                    className="w-full resize-none rounded-xl border border-gray-200 p-3 text-sm placeholder-gray-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                    disabled={isMissionRunning}
                  />
                  {/* Hint for @ */}
                  {!userInput && !isMissionRunning && (
                    <div className="pointer-events-none absolute bottom-2 right-3 text-xs text-gray-300">
                      @ 提及 Leader
                    </div>
                  )}
                </div>
                <button
                  onClick={handleSendMessage}
                  disabled={!userInput.trim() || isMissionRunning}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white transition-all hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
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
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Chapter Content Modal */}
        {selectedChapter && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="relative mx-4 flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl">
              {/* Modal Header */}
              <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    第{selectedChapter.chapterNumber}章 {selectedChapter.title}
                  </h3>
                  <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
                    {selectedChapter.wordCount > 0 && (
                      <span>
                        {selectedChapter.wordCount.toLocaleString()} 字
                      </span>
                    )}
                    {selectedChapter.outline && (
                      <span className="text-gray-400">
                        {selectedChapter.outline}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedChapter(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-auto px-6 py-4">
                {selectedChapter.content ? (
                  <div className="prose prose-gray prose-headings:text-gray-800 prose-p:text-gray-700 prose-p:leading-relaxed prose-strong:text-gray-800 max-w-none">
                    <ReactMarkdown>{selectedChapter.content}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <span className="mb-4 text-4xl">📝</span>
                    <p className="text-gray-500">暂无内容</p>
                    <p className="mt-1 text-sm text-gray-400">
                      该章节尚未生成内容
                    </p>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
                <button
                  onClick={() => {
                    if (!selectedChapter.content) return;
                    const blob = new Blob([selectedChapter.content], {
                      type: 'text/plain;charset=utf-8',
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `第${selectedChapter.chapterNumber}章-${selectedChapter.title}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  disabled={!selectedChapter.content}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
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
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  下载
                </button>
                <button
                  onClick={() => setSelectedChapter(null)}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Agent Details Modal */}
        {selectedAgent && agentDetails[selectedAgent] && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setSelectedAgent(null)}
          >
            <div
              className="relative mx-4 w-full max-w-md rounded-2xl bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-violet-600 text-xl text-white shadow-md">
                    {selectedAgent === 'architect' && '📐'}
                    {selectedAgent === 'keeper' && '📚'}
                    {selectedAgent.startsWith('writer') && '✍️'}
                    {selectedAgent.startsWith('checker') && '🔍'}
                    {selectedAgent === 'editor' && '📝'}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">
                      {agentDetails[selectedAgent].name}
                    </h3>
                    <span className="text-sm text-gray-500">
                      {agentDetails[selectedAgent].role}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedAgent(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Modal Content */}
              <div className="px-6 py-4">
                {/* Description */}
                <p className="text-sm leading-relaxed text-gray-600">
                  {agentDetails[selectedAgent].description}
                </p>

                {/* Skills */}
                <div className="mt-4">
                  <h4 className="mb-2 text-sm font-semibold text-gray-800">
                    技能
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {agentDetails[selectedAgent].skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-700"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Tools */}
                <div className="mt-4">
                  <h4 className="mb-2 text-sm font-semibold text-gray-800">
                    工具
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {agentDetails[selectedAgent].tools.map((tool) => (
                      <span
                        key={tool}
                        className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end border-t border-gray-100 px-6 py-4">
                <button
                  onClick={() => setSelectedAgent(null)}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}
