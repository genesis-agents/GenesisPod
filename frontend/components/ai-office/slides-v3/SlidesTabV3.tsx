'use client';

/**
 * Slides Engine v3.0 - 主页面组件
 *
 * 根据设计文档 Section 7 实现：
 * - 浅色主题，与项目整体风格一致
 * - 两栏布局：对话面板 + 预览面板
 * - 底部进度条
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download,
  History,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Brain,
  FileText,
  Send,
  ChevronDown,
  Layers,
  Eye,
  Palette,
  Grid3X3,
  Sparkles,
  RefreshCw,
  Trash2,
  LayoutGrid,
  List,
  Plus,
  FolderOpen,
  X,
  ArrowLeft,
  Home,
  Copy,
  Terminal,
} from 'lucide-react';

import { cn } from '@/lib/utils/common';
import {
  useSlidesV3Store,
  selectOverallProgress,
} from '@/stores/slidesV3Store';
import {
  useSlideGenerationV3,
  useCheckpoints,
  useSessions,
  SessionWithCheckpoint,
} from '@/hooks/features/slides-v3';
import type {
  GenerateV3Request,
  PageState,
  PageOutline,
  GenerationProgress,
  OutlinePlan,
} from '@/types/slides-v3';
import {
  useSlidesHistoryStore,
  formatRelativeTime,
  SlidesHistoryItem,
} from '@/stores/slidesHistoryStore';
import { useAuth } from '@/contexts/AuthContext';
import { config } from '@/lib/utils/config';

// ============================================================================
// 类型定义
// ============================================================================

interface ToolCallItem {
  id: string;
  type: 'thinking' | 'outline' | 'render' | 'image' | 'checkpoint';
  title: string;
  status: 'running' | 'completed' | 'error';
  content?: string;
  timestamp: Date;
}

// ============================================================================
// 主组件
// ============================================================================

export function SlidesTabV3() {
  const { session, pages, generating, streamEvents, progress, outlinePlan } =
    useSlidesV3Store();
  const { generate, cancel } = useSlideGenerationV3();
  const { createCheckpoint, checkpoints } = useCheckpoints();
  const { history, addHistory, updateHistory, removeHistory, clearHistory } =
    useSlidesHistoryStore();
  const { restoreCheckpoint, restoreBySessionId } = useCheckpoints();
  const { sessions: backendSessions, loading: sessionsLoading, refresh: refreshSessions } = useSessions();
  const { user } = useAuth();
  const [toolCalls, setToolCalls] = useState<ToolCallItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showNewForm, setShowNewForm] = useState(false);
  const currentHistoryIdRef = useRef<string | null>(null);

  // 重置回到历史记录画廊
  const handleBackToGallery = useCallback(() => {
    const { reset } = useSlidesV3Store.getState();
    reset();
    setShowNewForm(false);
    refreshSessions();
  }, [refreshSessions]);

  // 将 streamEvents 转换为 toolCalls
  useEffect(() => {
    const calls: ToolCallItem[] = [];

    streamEvents.forEach((event) => {
      const id = `${event.type}-${event.timestamp}`;

      if (event.type === 'phase_started') {
        const data = event.data as { phase: string };
        calls.push({
          id,
          type: 'thinking',
          title: getPhaseTitle(data.phase),
          status: 'running',
          timestamp: new Date(event.timestamp),
        });
      } else if (event.type === 'phase_completed') {
        const data = event.data as { phase: string };
        const existingIndex = calls.findIndex(
          (c) => c.title === getPhaseTitle(data.phase) && c.status === 'running'
        );
        if (existingIndex >= 0) {
          calls[existingIndex].status = 'completed';
        } else {
          calls.push({
            id,
            type: 'thinking',
            title: getPhaseTitle(data.phase),
            status: 'completed',
            timestamp: new Date(event.timestamp),
          });
        }
      } else if (event.type === 'checkpoint_created') {
        const data = event.data as { name?: string; type?: string };
        calls.push({
          id,
          type: 'checkpoint',
          title: `保存检查点: ${data.name || data.type || '自动保存'}`,
          status: 'completed',
          timestamp: new Date(event.timestamp),
        });
      } else if (event.type === 'page_started') {
        const data = event.data as { pageNumber: number };
        calls.push({
          id,
          type: 'render',
          title: `渲染第 ${data.pageNumber} 页`,
          status: 'running',
          timestamp: new Date(event.timestamp),
        });
      } else if (event.type === 'page_completed') {
        const data = event.data as { pageNumber: number };
        const existingIndex = calls.findIndex(
          (c) =>
            c.title === `渲染第 ${data.pageNumber} 页` && c.status === 'running'
        );
        if (existingIndex >= 0) {
          calls[existingIndex].status = 'completed';
        }
      }
    });

    setToolCalls(calls);
  }, [streamEvents]);

  const handleSendMessage = useCallback((message: string) => {
    console.log('Send message:', message);
  }, []);

  const handleCreateCheckpoint = useCallback(() => {
    createCheckpoint('用户保存点');
  }, [createCheckpoint]);

  const handleGenerate = useCallback(
    (request: GenerateV3Request) => {
      const historyId = addHistory({
        title: request.title,
        sourceText: request.sourceText.slice(0, 200),
        targetPages: request.targetPages || 10,
        status: 'pending',
      });
      currentHistoryIdRef.current = historyId;
      generate(request);
    },
    [generate, addHistory]
  );

  // 监听 session 创建和完成事件，更新历史记录
  useEffect(() => {
    const historyId = currentHistoryIdRef.current;
    if (!historyId) return;

    // 查找最新的 session_created 和 complete 事件
    const sessionEvent = streamEvents.find((e) => e.type === 'session_created');
    const completeEvent = streamEvents.find((e) => e.type === 'complete');

    if (sessionEvent) {
      const sessionData = sessionEvent.data as {
        session: { id: string; title: string };
      };
      updateHistory(historyId, {
        sessionId: sessionData.session.id,
      });
    }

    if (completeEvent) {
      const completeData = completeEvent.data as {
        sessionId: string;
        checkpointId: string;
      };
      updateHistory(historyId, {
        status: 'success',
        sessionId: completeData.sessionId,
        checkpointId: completeData.checkpointId,
      });
      currentHistoryIdRef.current = null;
    }
  }, [streamEvents, updateHistory]);

  // 恢复历史记录（localStorage）
  const handleRestoreHistory = useCallback(
    async (item: SlidesHistoryItem) => {
      setRestoring(true);
      try {
        // 优先使用 checkpointId，如果没有则使用 sessionId
        if (item.checkpointId) {
          await restoreCheckpoint(item.checkpointId);
        } else if (item.sessionId) {
          await restoreBySessionId(item.sessionId);
        } else {
          console.warn('No checkpointId or sessionId in history item');
          return;
        }
        setShowHistory(false);
      } catch (err) {
        console.error('Failed to restore:', err);
      } finally {
        setRestoring(false);
      }
    },
    [restoreCheckpoint, restoreBySessionId]
  );

  // 恢复后端会话
  const handleRestoreSession = useCallback(
    async (sessionItem: SessionWithCheckpoint) => {
      setRestoring(true);
      try {
        if (sessionItem.latestCheckpoint?.id) {
          await restoreCheckpoint(sessionItem.latestCheckpoint.id);
        } else {
          await restoreBySessionId(sessionItem.id);
        }
        setShowHistory(false);
        setShowNewForm(false);
      } catch (err) {
        console.error('Failed to restore session:', err);
      } finally {
        setRestoring(false);
      }
    },
    [restoreCheckpoint, restoreBySessionId]
  );

  // 初始状态 - 显示 Sessions 画廊或输入表单
  if (!session && pages.length === 0 && !generating) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-white">
        {/* 头部 */}
        <Header
          showHistory={showHistory}
          onToggleHistory={() => setShowHistory(!showHistory)}
          onCreateCheckpoint={handleCreateCheckpoint}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onNewClick={() => setShowNewForm(true)}
          showViewToggle={!showNewForm}
        />

        {/* 历史记录面板 */}
        <HistoryPanel
          show={showHistory}
          history={history}
          onRemove={removeHistory}
          onClear={clearHistory}
          onRestore={handleRestoreHistory}
        />

        {/* 根据状态显示画廊或输入表单 */}
        {showNewForm ? (
          <InitialInputForm
            onGenerate={handleGenerate}
            onCancel={() => setShowNewForm(false)}
          />
        ) : (
          <SessionsGallery
            backendSessions={backendSessions}
            localHistory={history}
            viewMode={viewMode}
            onRestoreSession={handleRestoreSession}
            onRestoreHistory={handleRestoreHistory}
            onNewClick={() => setShowNewForm(true)}
            loading={sessionsLoading}
          />
        )}
      </div>
    );
  }

  // 生成中或已有内容 - 显示两栏布局
  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      {/* 头部 */}
      <Header
        title={session?.title}
        showHistory={showHistory}
        onToggleHistory={() => setShowHistory(!showHistory)}
        onCreateCheckpoint={handleCreateCheckpoint}
        showBackButton={true}
        onBackToGallery={handleBackToGallery}
      />

      {/* 历史记录面板 */}
      <HistoryPanel
        show={showHistory}
        history={history}
        onRemove={removeHistory}
        onClear={clearHistory}
        onRestore={handleRestoreHistory}
      />

      {/* 两栏布局 */}
      <div className="flex flex-1 overflow-hidden">
        <ConversationPanel
          onSendMessage={handleSendMessage}
          onCancel={cancel}
          toolCalls={toolCalls}
          generating={generating}
          progress={progress}
          outlinePlan={outlinePlan}
        />
        <PreviewPanel />
      </div>

      {/* 底部进度条 */}
      <ProgressBar />
    </div>
  );
}

// ============================================================================
// Header 组件
// ============================================================================

function Header({
  title,
  showHistory,
  onToggleHistory,
  onCreateCheckpoint,
  onBackToGallery,
  viewMode,
  onViewModeChange,
  onNewClick,
  showViewToggle = false,
  showBackButton = false,
}: {
  title?: string;
  showHistory: boolean;
  onToggleHistory: () => void;
  onCreateCheckpoint: () => void;
  onBackToGallery?: () => void;
  viewMode?: 'grid' | 'list';
  onViewModeChange?: (mode: 'grid' | 'list') => void;
  onNewClick?: () => void;
  showViewToggle?: boolean;
  showBackButton?: boolean;
}) {
  const [showExportMenu, setShowExportMenu] = useState(false);

  return (
    <header className="flex-shrink-0 border-b border-gray-200 bg-white">
      <div className="flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-3">
          {/* 返回按钮 */}
          {showBackButton && onBackToGallery && (
            <button
              onClick={onBackToGallery}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
              title="返回历史记录"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-orange-600">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">{title || 'AI 演示文稿'}</h1>
            <p className="text-xs text-gray-500">智能PPT生成</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 新建按钮 */}
          {onNewClick && (
            <button
              onClick={onNewClick}
              className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-600"
            >
              <Plus className="h-4 w-4" />
              新建
            </button>
          )}

          {/* 视图切换 */}
          {showViewToggle && viewMode && onViewModeChange && (
            <div className="flex items-center rounded-lg border border-gray-200 p-1">
              <button
                onClick={() => onViewModeChange('grid')}
                className={cn(
                  'rounded p-1.5 transition-colors',
                  viewMode === 'grid'
                    ? 'bg-orange-100 text-orange-600'
                    : 'text-gray-400 hover:text-gray-600'
                )}
                title="网格视图"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => onViewModeChange('list')}
                className={cn(
                  'rounded p-1.5 transition-colors',
                  viewMode === 'list'
                    ? 'bg-orange-100 text-orange-600'
                    : 'text-gray-400 hover:text-gray-600'
                )}
                title="列表视图"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* 历史记录 */}
          <button
            onClick={onToggleHistory}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors',
              showHistory
                ? 'bg-orange-100 text-orange-600'
                : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            <History className="h-4 w-4" />
            历史记录
          </button>

          {/* 创建保存点 */}
          <button
            onClick={onCreateCheckpoint}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            <Save className="h-4 w-4" />
            创建保存点
          </button>

          {/* 导出 */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
            >
              <Download className="h-4 w-4" />
              导出
              <ChevronDown className="h-3 w-3" />
            </button>
            {showExportMenu && (
              <ExportDropdown onClose={() => setShowExportMenu(false)} />
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

// ============================================================================
// 历史记录面板
// ============================================================================

function HistoryPanel({
  show,
  history,
  onRemove,
  onClear,
  onRestore,
}: {
  show: boolean;
  history: SlidesHistoryItem[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onRestore: (item: SlidesHistoryItem) => void;
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden border-b border-gray-200 bg-gray-50"
        >
          <div className="max-h-[280px] overflow-y-auto p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-700">生成历史</h3>
              {history.length > 0 && (
                <button
                  onClick={onClear}
                  className="text-xs text-red-500 hover:text-red-600"
                >
                  清空
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <p className="py-4 text-center text-xs text-gray-400">
                暂无历史记录
              </p>
            ) : (
              <div className="space-y-2">
                {history.slice(0, 20).map((item) => (
                  <div
                    key={item.id}
                    onClick={() => item.sessionId && onRestore(item)}
                    className={cn(
                      'flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3 transition-colors',
                      item.sessionId
                        ? 'cursor-pointer hover:border-orange-300 hover:bg-orange-50'
                        : 'hover:border-gray-300'
                    )}
                  >
                    <div className="mr-2 min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {item.title}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-xs text-gray-500">
                          {formatRelativeTime(item.timestamp)}
                        </span>
                        <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-600">
                          {item.targetPages} 页
                        </span>
                        {item.status === 'success' ? (
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                        ) : item.status === 'error' ? (
                          <AlertCircle className="h-3 w-3 text-red-500" />
                        ) : (
                          <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                        )}
                        {item.sessionId && (
                          <span className="text-xs text-orange-500">
                            点击恢复
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemove(item.id);
                        }}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-500"
                        title="删除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================================================
// 导出下拉菜单
// ============================================================================

function ExportDropdown({ onClose }: { onClose: () => void }) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={dropdownRef}
      className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-2 shadow-lg"
    >
      <button className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
        <FileText className="h-4 w-4" />
        导出 PPTX
      </button>
      <button className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
        <FileText className="h-4 w-4" />
        导出 PDF
      </button>
    </div>
  );
}

// ============================================================================
// 对话面板 - 左侧
// ============================================================================

function ConversationPanel({
  onSendMessage,
  onCancel,
  toolCalls,
  generating,
  progress,
  outlinePlan,
}: {
  onSendMessage: (message: string) => void;
  onCancel: () => void;
  toolCalls: ToolCallItem[];
  generating: boolean;
  progress: GenerationProgress | null;
  outlinePlan: OutlinePlan | null;
}) {
  const [inputValue, setInputValue] = useState('');
  const [outlineExpanded, setOutlineExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { streamEvents } = useSlidesV3Store();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [toolCalls, progress]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim()) return;
    onSendMessage(inputValue.trim());
    setInputValue('');
  }, [inputValue, onSendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // 复制日志到剪贴板
  const handleCopyLog = useCallback(() => {
    const logText = streamEvents
      .map((event) => {
        const time = new Date(event.timestamp).toLocaleTimeString();
        const data = JSON.stringify(event.data, null, 2);
        return `[${time}] ${event.type}\n${data}`;
      })
      .join('\n\n');

    navigator.clipboard.writeText(logText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [streamEvents]);

  return (
    <div className="flex h-full w-[360px] flex-shrink-0 flex-col border-r border-slate-200 bg-slate-50">
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Terminal className="h-4 w-4 text-orange-500" />
          生成过程 ({toolCalls.length})
        </div>
        <button
          onClick={handleCopyLog}
          disabled={streamEvents.length === 0}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
            copied
              ? 'bg-green-100 text-green-700'
              : 'text-gray-600 hover:bg-gray-100'
          )}
          title="复制完整日志"
        >
          {copied ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              已复制
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              复制日志
            </>
          )}
        </button>
      </div>

      {/* 滚动区域 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {/* 工具调用展示 */}
        <div className="space-y-3">
          {toolCalls.length === 0 && !generating ? (
            <div className="py-8 text-center text-sm text-gray-400">
              开始生成后将显示过程信息
            </div>
          ) : (
            toolCalls.map((call) => (
              <ToolCallCard key={call.id} call={call} />
            ))
          )}

          {/* 当前进度 */}
          {generating && progress && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-orange-700">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm font-medium">
                    {progress.message}
                  </span>
                </div>
                <button
                  onClick={onCancel}
                  className="flex items-center gap-1 rounded-lg bg-orange-100 px-2.5 py-1 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-200"
                >
                  <X className="h-3.5 w-3.5" />
                  取消
                </button>
              </div>
              {progress.totalPages && (
                <div className="mt-2 text-xs text-orange-600">
                  页面 {progress.currentPage || 0} / {progress.totalPages}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 大纲预览 */}
        {outlinePlan && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
            <button
              onClick={() => setOutlineExpanded(!outlineExpanded)}
              className="flex w-full items-center gap-2 text-left text-sm font-medium text-gray-700"
            >
              <FileText className="h-4 w-4 text-blue-500" />
              大纲预览 ({outlinePlan.pages.length} 页)
              <ChevronDown
                className={cn(
                  'ml-auto h-4 w-4 transition-transform',
                  outlineExpanded ? '' : '-rotate-90'
                )}
              />
            </button>

            <AnimatePresence>
              {outlineExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 space-y-1">
                    {outlinePlan.pages.map(
                      (page: PageOutline, index: number) => (
                        <OutlineItem key={index} page={page} index={index} />
                      )
                    )}
                  </div>

                  <div className="mt-4">
                    {generating ? (
                      <div className="flex items-center justify-center gap-2 rounded-lg bg-orange-100 py-2 text-sm font-medium text-orange-700">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        正在生成页面...
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2 rounded-lg bg-green-100 py-2 text-sm font-medium text-green-700">
                        <CheckCircle2 className="h-4 w-4" />
                        大纲已确认，生成完成
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* 固定在底部的输入框 */}
      <div className="flex-shrink-0 border-t border-gray-200 bg-white p-4">
        <div className="flex items-end gap-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入修改建议..."
            rows={1}
            className="max-h-32 min-h-[40px] flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            className={cn(
              'rounded-lg p-2.5 transition-colors',
              inputValue.trim()
                ? 'bg-orange-500 text-white hover:bg-orange-600'
                : 'bg-gray-100 text-gray-400'
            )}
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 工具调用卡片
// ============================================================================

function ToolCallCard({ call }: { call: ToolCallItem }) {
  const [expanded, setExpanded] = useState(false);

  const getIcon = () => {
    switch (call.type) {
      case 'thinking':
        return <Brain className="h-4 w-4" />;
      case 'outline':
        return <FileText className="h-4 w-4" />;
      case 'render':
        return <Palette className="h-4 w-4" />;
      case 'image':
        return <Eye className="h-4 w-4" />;
      case 'checkpoint':
        return <Save className="h-4 w-4" />;
      default:
        return <Brain className="h-4 w-4" />;
    }
  };

  const getStatusIcon = () => {
    switch (call.status) {
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-orange-500" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        onClick={() => call.content && setExpanded(!expanded)}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <div className="text-orange-500">{getIcon()}</div>
        <div className="flex-1">
          <div className="text-sm font-medium text-gray-900">{call.title}</div>
          <div className="text-xs text-gray-500">
            {call.timestamp.toLocaleTimeString()}
          </div>
        </div>
        {getStatusIcon()}
        {call.content && (
          <ChevronDown
            className={cn(
              'h-4 w-4 text-gray-400 transition-transform',
              expanded ? '' : '-rotate-90'
            )}
          />
        )}
      </button>

      <AnimatePresence>
        {expanded && call.content && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-100 p-3">
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs text-gray-600">
                {call.content}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// 大纲项
// ============================================================================

function OutlineItem({ page, index }: { page: PageOutline; index: number }) {
  return (
    <div className="flex items-center gap-2 rounded bg-slate-50 px-2 py-1.5 text-xs">
      <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded bg-orange-100 text-[10px] font-medium text-orange-600">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-slate-700">{page.title}</div>
        <div className="truncate text-[10px] text-slate-400">{page.templateType}</div>
      </div>
    </div>
  );
}

// ============================================================================
// 预览面板 - 右侧
// ============================================================================

function PreviewPanel() {
  const { pages, selectedPageIndex, setSelectedPageIndex } = useSlidesV3Store();
  const currentPage = pages[selectedPageIndex];
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // 使用 ResizeObserver 监听容器尺寸变化
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 初始化时立即获取尺寸
    const rect = container.getBoundingClientRect();
    setDimensions({ width: rect.width, height: rect.height });

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // 固定画布尺寸
  const SLIDE_WIDTH = 1280;
  const SLIDE_HEIGHT = 720;
  const PADDING = 48; // p-6 = 24px * 2

  // 计算可用空间（减去内边距）
  const availableWidth = Math.max(dimensions.width - PADDING, 200);
  const availableHeight = Math.max(dimensions.height - PADDING, 150);

  // 计算缩放比例，保持宽高比
  const scaleX = availableWidth / SLIDE_WIDTH;
  const scaleY = availableHeight / SLIDE_HEIGHT;
  const scale = Math.min(scaleX, scaleY, 1); // 最大不超过 1

  // 缩放后的尺寸
  const scaledWidth = Math.floor(SLIDE_WIDTH * scale);
  const scaledHeight = Math.floor(SLIDE_HEIGHT * scale);

  return (
    <div className="flex flex-1 flex-col bg-gradient-to-br from-slate-100 to-slate-200">
      {/* 缩略图区域 */}
      <div className="flex-shrink-0 border-b border-slate-200 bg-white/80 backdrop-blur-sm px-4 py-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          {pages.length === 0 ? (
            <div className="flex h-14 w-full items-center justify-center text-sm text-slate-500">
              <Layers className="mr-2 h-4 w-4 opacity-50" />
              开始生成后将显示缩略图
            </div>
          ) : (
            pages.map((page, index) => (
              <ThumbnailCard
                key={page.pageNumber}
                page={page}
                index={index}
                isSelected={index === selectedPageIndex}
                onClick={() => setSelectedPageIndex(index)}
              />
            ))
          )}
        </div>
      </div>

      {/* 主预览区域 */}
      <div
        ref={containerRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-6"
      >
        {currentPage ? (
          <div
            className="relative rounded-xl shadow-2xl ring-1 ring-slate-700/50"
            style={{
              width: scaledWidth,
              height: scaledHeight,
              overflow: 'hidden', // 强制隐藏溢出
            }}
          >
            {currentPage.html ? (
              <div
                style={{
                  width: scaledWidth,
                  height: scaledHeight,
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <iframe
                  srcDoc={currentPage.html}
                  style={{
                    width: SLIDE_WIDTH,
                    height: SLIDE_HEIGHT,
                    border: 'none',
                    display: 'block', // 避免 inline 元素的间隙
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                  }}
                  sandbox="allow-scripts"
                />
              </div>
            ) : (
              <div
                className="flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900"
                style={{ width: '100%', height: '100%' }}
              >
                {currentPage.status === 'generating' ? (
                  <div className="text-center">
                    <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-orange-400" />
                    <p className="text-sm font-medium text-slate-300">
                      正在生成第 {currentPage.pageNumber} 页...
                    </p>
                    <p className="mt-1 text-xs text-slate-500">请稍候</p>
                  </div>
                ) : currentPage.status === 'error' ? (
                  <div className="text-center">
                    <AlertCircle className="mx-auto mb-4 h-10 w-10 text-red-400" />
                    <p className="text-sm font-medium text-red-300">{currentPage.error || '生成失败'}</p>
                    <p className="mt-1 text-xs text-slate-500">请重试或检查内容</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <Layers className="mx-auto mb-4 h-10 w-10 text-slate-600" />
                    <p className="text-sm font-medium text-slate-400">等待生成...</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-200">
              <Grid3X3 className="h-10 w-10 text-slate-400" />
            </div>
            <p className="text-lg font-medium text-slate-700">开始生成演示文稿</p>
            <p className="mt-2 text-sm text-slate-500">在左侧输入内容并点击生成</p>
          </div>
        )}
      </div>

      {/* 属性面板 */}
      {currentPage && (
        <div className="flex-shrink-0 border-t border-slate-200 bg-white/90 backdrop-blur-sm px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">模板:</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                  {currentPage.outline?.templateType || '未知'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">状态:</span>
                <span
                  className={cn('rounded px-2 py-0.5 font-medium', {
                    'bg-green-100 text-green-700': currentPage.status === 'completed',
                    'bg-orange-100 text-orange-700': currentPage.status === 'generating',
                    'bg-red-100 text-red-700': currentPage.status === 'error',
                    'bg-slate-100 text-slate-600': currentPage.status === 'pending',
                  })}
                >
                  {getStatusText(currentPage.status)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-slate-700">
                {selectedPageIndex + 1}
              </span>
              <span className="text-slate-400">/</span>
              <span className="text-slate-500">
                {pages.length} 页
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 缩略图卡片
// ============================================================================

function ThumbnailCard({
  page,
  index,
  isSelected,
  onClick,
}: {
  page: PageState;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative aspect-[16/9] w-24 flex-shrink-0 overflow-hidden rounded-lg transition-all',
        isSelected
          ? 'ring-2 ring-orange-500 ring-offset-2 shadow-lg'
          : 'ring-1 ring-slate-200 hover:ring-slate-300'
      )}
    >
      {page.html ? (
        <div
          className="h-full w-full bg-slate-900"
          style={{
            transform: 'scale(0.1)',
            transformOrigin: 'top left',
            width: '1000%',
            height: '1000%',
          }}
          dangerouslySetInnerHTML={{ __html: page.html }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
          {page.status === 'generating' ? (
            <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          ) : page.status === 'error' ? (
            <AlertCircle className="h-4 w-4 text-red-500" />
          ) : (
            <span className="text-xs font-medium text-slate-400">{index + 1}</span>
          )}
        </div>
      )}

      <div className="absolute bottom-1 right-1 rounded bg-black/50 px-1 text-[10px] text-white">
        {index + 1}
      </div>
    </button>
  );
}

// ============================================================================
// 底部进度条
// ============================================================================

function ProgressBar() {
  const overallProgress = useSlidesV3Store(selectOverallProgress);
  const { progress, pages, generating } = useSlidesV3Store();
  const { checkpoints } = useCheckpoints();

  if (!generating && pages.length === 0) {
    return null;
  }

  const completedPages = pages.filter((p) => p.status === 'completed').length;
  const latestCheckpoint = checkpoints[0];

  return (
    <div className="flex h-12 flex-shrink-0 items-center justify-between border-t border-gray-200 bg-white px-6">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-48 overflow-hidden rounded-full bg-gray-200">
            <motion.div
              className="h-full bg-gradient-to-r from-orange-500 to-orange-400"
              initial={{ width: 0 }}
              animate={{ width: `${overallProgress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <span className="text-sm font-medium text-gray-700">
            {overallProgress}%
          </span>
        </div>

        <span className="text-sm text-gray-500">
          {completedPages} / {pages.length} 页
        </span>
      </div>

      {latestCheckpoint && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Save className="h-4 w-4" />
          <span>检查点: {latestCheckpoint.name}</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 输入表单（初始状态）
// ============================================================================

function InitialInputForm({
  onGenerate,
  onCancel,
}: {
  onGenerate: (request: GenerateV3Request) => void;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [targetPages, setTargetPages] = useState(10);
  const { generating } = useSlidesV3Store();

  const handleSubmit = useCallback(() => {
    if (!title.trim() || !sourceText.trim()) return;
    onGenerate({
      title: title.trim(),
      sourceText: sourceText.trim(),
      targetPages,
      stylePreference: 'dark',
    });
  }, [title, sourceText, targetPages, onGenerate]);

  return (
    <main className="flex min-h-0 flex-1 flex-col bg-gray-50">
      <div className="flex-1 overflow-auto p-8">
        <div className="mx-auto w-full max-w-2xl">
          <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                创建新的演示文稿
              </h2>
              {onCancel && (
                <button
                  onClick={onCancel}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  取消
                </button>
              )}
            </div>

            <div className="space-y-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  标题
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="输入演示文稿标题..."
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  素材内容
                </label>
                <textarea
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  placeholder="粘贴要转换为幻灯片的文本内容..."
                  rows={8}
                  className="w-full resize-none rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  目标页数: {targetPages} 页
                </label>
                <input
                  type="range"
                  min={5}
                  max={30}
                  value={targetPages}
                  onChange={(e) => setTargetPages(parseInt(e.target.value))}
                  className="w-full accent-orange-500"
                />
                <div className="mt-1 flex justify-between text-xs text-gray-500">
                  <span>5 页</span>
                  <span>30 页</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 固定在底部的按钮 */}
      <div className="flex-shrink-0 border-t border-gray-200 bg-white p-4">
        <div className="mx-auto w-full max-w-2xl">
          <button
            onClick={handleSubmit}
            disabled={generating || !title.trim() || !sourceText.trim()}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-lg py-4 text-base font-medium transition-colors',
              generating || !title.trim() || !sourceText.trim()
                ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                : 'bg-orange-500 text-white hover:bg-orange-600'
            )}
          >
            {generating ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <Layers className="h-5 w-5" />
                开始生成
              </>
            )}
          </button>
        </div>
      </div>
    </main>
  );
}

// ============================================================================
// Sessions 画廊组件
// ============================================================================

function SessionsGallery({
  backendSessions,
  localHistory,
  viewMode,
  onRestoreSession,
  onRestoreHistory,
  onNewClick,
  loading,
}: {
  backendSessions: SessionWithCheckpoint[];
  localHistory: SlidesHistoryItem[];
  viewMode: 'grid' | 'list';
  onRestoreSession: (session: SessionWithCheckpoint) => void;
  onRestoreHistory: (item: SlidesHistoryItem) => void;
  onNewClick: () => void;
  loading?: boolean;
}) {
  // 优先使用后端会话，如果没有则使用本地历史
  const hasBackendSessions = backendSessions.length > 0;
  const localSessions = localHistory.filter(
    (item) => item.sessionId && item.status === 'success'
  );

  if (loading) {
    return (
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center bg-gray-50 p-8">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-orange-500" />
          <p className="text-sm text-gray-500">加载历史记录...</p>
        </div>
      </main>
    );
  }

  if (!hasBackendSessions && localSessions.length === 0) {
    return (
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center bg-gray-50 p-8">
        <div className="text-center">
          <FolderOpen className="mx-auto mb-4 h-16 w-16 text-gray-300" />
          <h2 className="mb-2 text-lg font-medium text-gray-900">
            还没有演示文稿
          </h2>
          <p className="mb-6 text-sm text-gray-500">
            点击新建按钮创建您的第一个 AI 演示文稿
          </p>
          <button
            onClick={onNewClick}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-6 py-3 text-sm font-medium text-white hover:bg-orange-600"
          >
            <Plus className="h-4 w-4" />
            新建演示文稿
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col bg-gray-50">
      <div className="flex-1 overflow-auto p-6">
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {/* 后端会话 */}
            {backendSessions.map((session) => (
              <BackendSessionCard
                key={session.id}
                session={session}
                onClick={() => onRestoreSession(session)}
              />
            ))}
            {/* 本地历史（只显示不在后端的） */}
            {!hasBackendSessions &&
              localSessions.map((item) => (
                <SessionGridCard
                  key={item.id}
                  item={item}
                  onClick={() => onRestoreHistory(item)}
                />
              ))}
          </div>
        ) : (
          <div className="space-y-2">
            {/* 后端会话 */}
            {backendSessions.map((session) => (
              <BackendSessionListItem
                key={session.id}
                session={session}
                onClick={() => onRestoreSession(session)}
              />
            ))}
            {/* 本地历史 */}
            {!hasBackendSessions &&
              localSessions.map((item) => (
                <SessionListItem
                  key={item.id}
                  item={item}
                  onClick={() => onRestoreHistory(item)}
                />
              ))}
          </div>
        )}
      </div>
    </main>
  );
}

// 后端会话卡片
function BackendSessionCard({
  session,
  onClick,
}: {
  session: SessionWithCheckpoint;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white text-left transition-all hover:border-orange-300 hover:shadow-lg"
    >
      {/* 缩略图占位 */}
      <div className="relative aspect-[16/9] bg-gradient-to-br from-slate-800 to-slate-900">
        <div className="absolute inset-0 flex items-center justify-center">
          <Layers className="h-8 w-8 text-slate-600" />
        </div>
        <div className="absolute bottom-2 right-2 rounded bg-black/50 px-1.5 py-0.5 text-xs text-white">
          {session.latestCheckpoint?.pagesCount || '?'} 页
        </div>
        {/* 来源标识 */}
        <div className="absolute left-2 top-2 rounded bg-green-500/80 px-1.5 py-0.5 text-xs text-white">
          已保存
        </div>
      </div>

      {/* 信息 */}
      <div className="flex-1 p-3">
        <h3 className="line-clamp-2 text-sm font-medium text-gray-900 group-hover:text-orange-600">
          {session.title}
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          {formatRelativeTime(session.updatedAt)}
        </p>
      </div>
    </button>
  );
}

// 后端会话列表项
function BackendSessionListItem({
  session,
  onClick,
}: {
  session: SessionWithCheckpoint;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 text-left transition-all hover:border-orange-300 hover:bg-orange-50"
    >
      {/* 缩略图 */}
      <div className="relative h-16 w-28 flex-shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-slate-800 to-slate-900">
        <div className="absolute inset-0 flex items-center justify-center">
          <Layers className="h-6 w-6 text-slate-600" />
        </div>
        {/* 来源标识 */}
        <div className="absolute left-1 top-1 rounded bg-green-500/80 px-1 py-0.5 text-[10px] text-white">
          已保存
        </div>
      </div>

      {/* 信息 */}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium text-gray-900">
          {session.title}
        </h3>
        <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
          <span>{formatRelativeTime(session.updatedAt)}</span>
          <span className="rounded bg-orange-100 px-1.5 py-0.5 text-orange-600">
            {session.latestCheckpoint?.pagesCount || '?'} 页
          </span>
        </div>
      </div>

      {/* 箭头 */}
      <ChevronDown className="h-5 w-5 -rotate-90 text-gray-400" />
    </button>
  );
}

// 网格卡片
function SessionGridCard({
  item,
  onClick,
}: {
  item: SlidesHistoryItem;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white text-left transition-all hover:border-orange-300 hover:shadow-lg"
    >
      {/* 缩略图占位 */}
      <div className="relative aspect-[16/9] bg-gradient-to-br from-slate-800 to-slate-900">
        <div className="absolute inset-0 flex items-center justify-center">
          <Layers className="h-8 w-8 text-slate-600" />
        </div>
        <div className="absolute bottom-2 right-2 rounded bg-black/50 px-1.5 py-0.5 text-xs text-white">
          {item.targetPages || '?'} 页
        </div>
      </div>

      {/* 信息 */}
      <div className="flex-1 p-3">
        <h3 className="line-clamp-2 text-sm font-medium text-gray-900 group-hover:text-orange-600">
          {item.title}
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          {formatRelativeTime(item.timestamp)}
        </p>
      </div>
    </button>
  );
}

// 列表项
function SessionListItem({
  item,
  onClick,
}: {
  item: SlidesHistoryItem;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 text-left transition-all hover:border-orange-300 hover:bg-orange-50"
    >
      {/* 缩略图 */}
      <div className="relative h-16 w-28 flex-shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-slate-800 to-slate-900">
        <div className="absolute inset-0 flex items-center justify-center">
          <Layers className="h-6 w-6 text-slate-600" />
        </div>
      </div>

      {/* 信息 */}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium text-gray-900">
          {item.title}
        </h3>
        <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
          <span>{formatRelativeTime(item.timestamp)}</span>
          <span className="rounded bg-orange-100 px-1.5 py-0.5 text-orange-600">
            {item.targetPages || '?'} 页
          </span>
        </div>
      </div>

      {/* 箭头 */}
      <ChevronDown className="h-5 w-5 -rotate-90 text-gray-400" />
    </button>
  );
}

// ============================================================================
// 工具函数
// ============================================================================

function getPhaseTitle(phase: string): string {
  const titles: Record<string, string> = {
    task_decomposition: '🧠 深度思考 - 任务分解',
    outline_planning: '📄 大纲规划',
    page_rendering: '🎨 页面渲染',
    quality_review: '✅ 质量检查',
  };
  return titles[phase] || phase;
}

function getStatusText(status: string): string {
  const texts: Record<string, string> = {
    pending: '等待中',
    generating: '生成中',
    completed: '已完成',
    error: '失败',
  };
  return texts[status] || status;
}

export default SlidesTabV3;
