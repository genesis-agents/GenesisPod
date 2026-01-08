'use client';

/**
 * AI Writing Canvas - 写作任务可视化组件
 *
 * 参考 AI Teams Canvas 设计，使用树形结构展示：
 * - Leader (故事架构师) 在顶部，带皇冠
 * - Agent 团队成员以树形排列
 * - 连接线展示工作流程
 * - 进度徽章和状态指示
 */

import { useMemo } from 'react';

// Agent 配置 - 匹配 AI Teams Canvas 风格
const WRITING_AGENTS = [
  {
    id: 'story-architect',
    name: '故事架构师',
    role: 'leader',
    icon: '📐',
    bgColor: '#8B5CF6', // violet
    model: 'Claude',
  },
  {
    id: 'bible-keeper',
    name: '设定守护者',
    role: 'member',
    icon: '📚',
    bgColor: '#6366F1', // indigo
    model: 'GPT-4o',
  },
  {
    id: 'writer',
    name: '作家',
    role: 'member',
    icon: '✍️',
    bgColor: '#F59E0B', // amber
    model: 'Claude',
  },
  {
    id: 'consistency-checker',
    name: '检查员',
    role: 'member',
    icon: '🔍',
    bgColor: '#10B981', // green
    model: 'GPT-4o',
  },
  {
    id: 'editor',
    name: '编辑',
    role: 'member',
    icon: '📝',
    bgColor: '#EC4899', // pink
    model: 'Claude',
  },
];

interface ChapterInfo {
  chapterNumber: number;
  title: string;
  content?: string;
  wordCount: number;
  volumeIndex: number;
  status: 'pending' | 'writing' | 'checking' | 'completed';
}

interface ConsistencyIssue {
  chapterNumber: number;
  type: string;
  severity: 'error' | 'warning' | 'info';
  description: string;
  suggestion?: string;
}

interface WritingCanvasProps {
  projectId: string;
  missionId?: string;
  isRunning: boolean;
  progress: number;
  currentStep: string;
  activeAgentIds: string[];
  chapters: ChapterInfo[];
  consistencyIssues?: ConsistencyIssue[];
  worldSettings?: Record<string, unknown>;
  onClose?: () => void;
  embedded?: boolean;
}

export default function WritingCanvas({
  isRunning,
  progress,
  currentStep,
  activeAgentIds,
  chapters,
  onClose,
  embedded = false,
}: WritingCanvasProps) {
  // 计算各 Agent 状态
  const agentStatuses = useMemo(() => {
    return WRITING_AGENTS.map((agent) => {
      const isActive = activeAgentIds.includes(agent.id);
      const isCompleted = progress >= 100;
      return {
        ...agent,
        isActive,
        isCompleted,
      };
    });
  }, [activeAgentIds, progress]);

  // 统计信息
  const stats = useMemo(() => {
    const completedChapters = chapters.filter(
      (c) => c.status === 'completed'
    ).length;
    const totalWords = chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0);
    return { completedChapters, totalChapters: chapters.length, totalWords };
  }, [chapters]);

  const leader = agentStatuses.find((a) => a.role === 'leader');
  const members = agentStatuses.filter((a) => a.role === 'member');

  return (
    <div
      className={`flex h-full flex-col bg-gradient-to-br from-slate-50 via-white to-violet-50 ${
        embedded ? '' : 'fixed inset-0 z-50'
      }`}
    >
      {/* Header - 参考 AI Teams Canvas */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white/90 px-6 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-800">
            AI Writing Canvas
          </h2>
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              isRunning
                ? 'bg-green-100 text-green-700'
                : progress >= 100
                  ? 'bg-green-100 text-green-700'
                  : 'bg-slate-100 text-slate-600'
            }`}
          >
            {isRunning ? '进行中' : progress >= 100 ? '已完成' : '待开始'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Zoom controls */}
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1">
            <button className="px-1.5 text-slate-400 hover:text-slate-600">
              −
            </button>
            <span className="w-10 text-center text-xs text-slate-500">
              100%
            </span>
            <button className="px-1.5 text-slate-400 hover:text-slate-600">
              +
            </button>
          </div>

          <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
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
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </button>

          {/* Download */}
          <button className="flex items-center gap-1.5 rounded-lg bg-violet-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-600">
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
            下载PDF报告
          </button>

          {!embedded && onClose && (
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
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
          )}
        </div>
      </div>

      {/* Canvas Area */}
      <div className="relative flex-1 overflow-auto">
        {/* Mission Title */}
        <div className="mt-12 text-center">
          <h3 className="text-xl font-semibold text-slate-700">
            {currentStep || '写作任务'}
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            {stats.completedChapters}/{stats.totalChapters} 章完成 ·{' '}
            {stats.totalWords.toLocaleString()} 字
          </p>
        </div>

        {/* Tree Visualization */}
        <div className="relative mx-auto mt-8 w-full max-w-4xl px-8 pb-24">
          {/* SVG Connection Lines */}
          <svg
            className="pointer-events-none absolute left-0 top-0 h-full w-full"
            style={{ zIndex: 0 }}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient
                id="lineGradient"
                x1="0%"
                y1="0%"
                x2="0%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#10B981" />
                <stop offset="100%" stopColor="#10B981" stopOpacity="0.3" />
              </linearGradient>
            </defs>
            {/* Leader to each member curved lines */}
            {members.map((member, index) => {
              const totalMembers = members.length;
              const leaderCx = 50; // Leader at center (%)
              const memberCx = ((index + 1) / (totalMembers + 1)) * 100;
              const leaderY = 140;
              const memberY = 320;
              const midY = (leaderY + memberY) / 2;

              return (
                <path
                  key={member.id}
                  d={`M ${leaderCx}% ${leaderY}
                      C ${leaderCx}% ${midY}, ${memberCx}% ${midY}, ${memberCx}% ${memberY}`}
                  fill="none"
                  stroke={
                    member.isActive || member.isCompleted
                      ? '#10B981'
                      : '#E2E8F0'
                  }
                  strokeWidth={member.isActive ? 3 : 2}
                  strokeDasharray={
                    member.isActive || member.isCompleted ? '0' : '6,4'
                  }
                  className="transition-all duration-500"
                />
              );
            })}
          </svg>

          {/* Leader Node */}
          {leader && (
            <div className="relative z-10 flex justify-center">
              <div
                className={`flex flex-col items-center transition-transform duration-300 ${
                  leader.isActive ? 'scale-110' : ''
                }`}
              >
                {/* Crown */}
                <div className="mb-1 text-2xl">👑</div>

                {/* Avatar Circle */}
                <div className="relative">
                  <div
                    className={`flex h-20 w-20 items-center justify-center rounded-full text-3xl shadow-lg transition-all duration-300 ${
                      leader.isActive
                        ? 'ring-4 ring-green-400 ring-offset-2'
                        : leader.isCompleted
                          ? 'ring-4 ring-green-300 ring-offset-2'
                          : ''
                    }`}
                    style={{ backgroundColor: leader.bgColor }}
                  >
                    <span className="drop-shadow">{leader.icon}</span>
                  </div>

                  {/* Task count badge */}
                  <div
                    className={`absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white shadow ${
                      leader.isCompleted
                        ? 'bg-green-500'
                        : leader.isActive
                          ? 'animate-pulse bg-green-500'
                          : 'bg-slate-400'
                    }`}
                  >
                    {leader.isCompleted ? '✓' : leader.isActive ? '...' : '0'}
                  </div>
                </div>

                {/* Name & Model */}
                <div className="mt-3 text-center">
                  <div className="font-semibold text-slate-700">
                    {leader.name}
                  </div>
                  <div className="text-xs text-slate-400">{leader.model}</div>
                </div>
              </div>
            </div>
          )}

          {/* Member Nodes Row */}
          <div className="relative z-10 mt-24 flex justify-around px-4">
            {members.map((member) => (
              <div
                key={member.id}
                className={`flex flex-col items-center transition-transform duration-300 ${
                  member.isActive ? 'scale-110' : ''
                }`}
              >
                {/* Avatar Circle */}
                <div className="relative">
                  <div
                    className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl shadow-md transition-all duration-300 ${
                      member.isActive
                        ? 'ring-4 ring-green-400 ring-offset-2'
                        : member.isCompleted
                          ? 'ring-2 ring-green-300'
                          : ''
                    }`}
                    style={{ backgroundColor: member.bgColor }}
                  >
                    <span className="drop-shadow">{member.icon}</span>
                  </div>

                  {/* Task count badge */}
                  <div
                    className={`absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white shadow ${
                      member.isCompleted
                        ? 'bg-green-500'
                        : member.isActive
                          ? 'animate-pulse bg-green-500'
                          : 'bg-slate-400'
                    }`}
                  >
                    {member.isCompleted ? '✓' : member.isActive ? '1' : '0'}
                  </div>
                </div>

                {/* Name & Model */}
                <div className="mt-2 text-center">
                  <div className="text-sm font-medium text-slate-700">
                    {member.name}
                  </div>
                  <div className="text-xs text-slate-400">{member.model}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Actions - 参考 AI Teams Canvas */}
      <div className="flex items-center justify-center gap-3 border-t border-slate-200 bg-white/90 px-6 py-4 backdrop-blur-sm">
        <button
          disabled={isRunning}
          className="flex items-center gap-2 rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span>+</span>
          创建任务
        </button>
        <button
          disabled={!isRunning}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          继续任务
        </button>
        <button
          disabled={!isRunning}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
          取消任务
        </button>
        <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
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
              d="M4 6h16M4 10h16M4 14h16M4 18h16"
            />
          </svg>
          任务面板
        </button>
      </div>
    </div>
  );
}
