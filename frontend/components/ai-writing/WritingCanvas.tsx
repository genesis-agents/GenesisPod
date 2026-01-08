'use client';

/**
 * AI Writing Canvas - 写作任务可视化组件
 *
 * 参考 AI Teams Canvas 设计，展示：
 * - 任务整体进度
 * - 各 Agent 工作状态
 * - 章节生成进度
 * - 一致性检查结果
 * - 中间输出实时查看
 */

import { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Agent 角色配置
const WRITING_AGENTS = [
  {
    id: 'story-architect',
    name: '故事架构师',
    role: 'architect',
    icon: '📐',
    color: 'bg-blue-500',
    description: '规划整体故事结构和章节大纲',
  },
  {
    id: 'bible-keeper',
    name: '设定守护者',
    role: 'keeper',
    icon: '📚',
    color: 'bg-purple-500',
    description: '建立和维护世界观设定',
  },
  {
    id: 'writer',
    name: '作家',
    role: 'writer',
    icon: '✍️',
    color: 'bg-amber-500',
    description: '创作章节内容',
  },
  {
    id: 'consistency-checker',
    name: '一致性检查员',
    role: 'checker',
    icon: '🔍',
    color: 'bg-green-500',
    description: '检查内容一致性',
  },
  {
    id: 'editor',
    name: '编辑',
    role: 'editor',
    icon: '📝',
    color: 'bg-pink-500',
    description: '润色和优化文字',
  },
];

interface AgentStatus {
  agentId: string;
  status: 'idle' | 'working' | 'completed' | 'failed';
  taskDescription?: string;
  progress?: number;
}

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
  projectId,
  missionId,
  isRunning,
  progress,
  currentStep,
  activeAgentIds,
  chapters,
  consistencyIssues = [],
  worldSettings,
  onClose,
  embedded = false,
}: WritingCanvasProps) {
  const [selectedChapter, setSelectedChapter] = useState<ChapterInfo | null>(
    null
  );
  const [viewMode, setViewMode] = useState<'agents' | 'chapters' | 'world'>(
    'agents'
  );

  // 计算各 Agent 状态
  const agentStatuses = useMemo(() => {
    return WRITING_AGENTS.map((agent) => ({
      ...agent,
      status: activeAgentIds.includes(agent.id)
        ? 'working'
        : progress >= 100
          ? 'completed'
          : 'idle',
    }));
  }, [activeAgentIds, progress]);

  // 统计信息
  const stats = useMemo(() => {
    const completedChapters = chapters.filter(
      (c) => c.status === 'completed'
    ).length;
    const totalWords = chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0);
    const issueCount = consistencyIssues.length;
    const errorCount = consistencyIssues.filter(
      (i) => i.severity === 'error'
    ).length;

    return {
      completedChapters,
      totalChapters: chapters.length,
      totalWords,
      issueCount,
      errorCount,
    };
  }, [chapters, consistencyIssues]);

  return (
    <div
      className={`flex h-full flex-col ${embedded ? '' : 'fixed inset-0 z-50 bg-white'}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50 px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white">
            📖
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-800">写作任务进度</h2>
            <p className="text-sm text-gray-500">
              {currentStep || '准备中...'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Progress */}
          <div className="flex items-center gap-2">
            <div className="h-2 w-32 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-sm font-medium text-gray-600">
              {progress}%
            </span>
          </div>

          {/* Status Badge */}
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              isRunning
                ? 'animate-pulse bg-amber-100 text-amber-700'
                : progress >= 100
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-600'
            }`}
          >
            {isRunning ? '创作中' : progress >= 100 ? '已完成' : '待开始'}
          </span>

          {!embedded && onClose && (
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-6 border-b border-gray-100 bg-white px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📚</span>
          <div>
            <div className="text-xs text-gray-400">章节进度</div>
            <div className="font-semibold text-gray-800">
              {stats.completedChapters}/{stats.totalChapters}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl">📝</span>
          <div>
            <div className="text-xs text-gray-400">总字数</div>
            <div className="font-semibold text-gray-800">
              {stats.totalWords.toLocaleString()}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl">{stats.errorCount > 0 ? '⚠️' : '✅'}</span>
          <div>
            <div className="text-xs text-gray-400">一致性问题</div>
            <div
              className={`font-semibold ${stats.errorCount > 0 ? 'text-red-600' : 'text-green-600'}`}
            >
              {stats.issueCount} 个
            </div>
          </div>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="flex border-b border-gray-100 bg-gray-50 px-6">
        {[
          { id: 'agents', label: 'Agent 状态', icon: '🤖' },
          { id: 'chapters', label: '章节列表', icon: '📑' },
          { id: 'world', label: '世界观设定', icon: '🌍' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setViewMode(tab.id as typeof viewMode)}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-all ${
              viewMode === tab.id
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        {viewMode === 'agents' && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {agentStatuses.map((agent) => (
              <div
                key={agent.id}
                className={`rounded-xl border p-4 transition-all ${
                  agent.status === 'working'
                    ? 'border-amber-200 bg-amber-50 ring-2 ring-amber-100'
                    : agent.status === 'completed'
                      ? 'border-green-200 bg-green-50'
                      : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl ${
                      agent.status === 'working'
                        ? `${agent.color} text-white`
                        : 'bg-gray-100'
                    }`}
                  >
                    {agent.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-800">
                        {agent.name}
                      </h3>
                      {agent.status === 'working' && (
                        <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500">{agent.description}</p>
                    {agent.status === 'working' && (
                      <div className="mt-2 text-sm text-amber-600">
                        正在工作中...
                      </div>
                    )}
                    {agent.status === 'completed' && (
                      <div className="mt-2 text-sm text-green-600">
                        ✓ 已完成
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {viewMode === 'chapters' && (
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Chapter List */}
            <div className="space-y-2">
              <h3 className="mb-3 font-semibold text-gray-800">章节列表</h3>
              {chapters.length === 0 ? (
                <div className="rounded-lg bg-gray-50 p-8 text-center text-gray-400">
                  暂无章节，开始创作后将显示
                </div>
              ) : (
                chapters.map((chapter) => (
                  <button
                    key={chapter.chapterNumber}
                    onClick={() => setSelectedChapter(chapter)}
                    className={`w-full rounded-lg border p-3 text-left transition-all ${
                      selectedChapter?.chapterNumber === chapter.chapterNumber
                        ? 'border-amber-300 bg-amber-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                            chapter.status === 'completed'
                              ? 'bg-green-100 text-green-700'
                              : chapter.status === 'writing'
                                ? 'animate-pulse bg-amber-100 text-amber-700'
                                : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {chapter.status === 'completed'
                            ? '✓'
                            : chapter.chapterNumber}
                        </span>
                        <span className="font-medium text-gray-800">
                          第{chapter.chapterNumber}章 {chapter.title}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">
                        {chapter.wordCount.toLocaleString()} 字
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Chapter Content Preview */}
            <div className="rounded-xl border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-4 py-3">
                <h3 className="font-semibold text-gray-800">
                  {selectedChapter
                    ? `第${selectedChapter.chapterNumber}章 ${selectedChapter.title}`
                    : '选择章节查看内容'}
                </h3>
              </div>
              <div className="max-h-96 overflow-auto p-4">
                {selectedChapter?.content ? (
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {selectedChapter.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="text-center text-gray-400">
                    {selectedChapter ? '内容生成中...' : '点击左侧章节查看内容'}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {viewMode === 'world' && (
          <div className="grid gap-4 md:grid-cols-2">
            {/* World Settings */}
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="mb-3 font-semibold text-gray-800">
                🌍 世界观设定
              </h3>
              {worldSettings ? (
                <pre className="max-h-64 overflow-auto rounded-lg bg-gray-50 p-3 text-xs">
                  {JSON.stringify(worldSettings, null, 2)}
                </pre>
              ) : (
                <div className="text-center text-gray-400">
                  世界观设定将在创作开始后生成
                </div>
              )}
            </div>

            {/* Consistency Issues */}
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="mb-3 font-semibold text-gray-800">
                🔍 一致性检查结果
              </h3>
              {consistencyIssues.length === 0 ? (
                <div className="rounded-lg bg-green-50 p-4 text-center text-green-600">
                  ✓ 暂无一致性问题
                </div>
              ) : (
                <div className="max-h-64 space-y-2 overflow-auto">
                  {consistencyIssues.map((issue, index) => (
                    <div
                      key={index}
                      className={`rounded-lg border p-3 ${
                        issue.severity === 'error'
                          ? 'border-red-200 bg-red-50'
                          : issue.severity === 'warning'
                            ? 'border-yellow-200 bg-yellow-50'
                            : 'border-blue-200 bg-blue-50'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span>
                          {issue.severity === 'error'
                            ? '❌'
                            : issue.severity === 'warning'
                              ? '⚠️'
                              : 'ℹ️'}
                        </span>
                        <div className="flex-1">
                          <div className="text-sm font-medium">
                            第{issue.chapterNumber}章 - {issue.type}
                          </div>
                          <div className="text-xs text-gray-600">
                            {issue.description}
                          </div>
                          {issue.suggestion && (
                            <div className="mt-1 text-xs text-gray-500">
                              建议：{issue.suggestion}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
