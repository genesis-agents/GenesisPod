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
} from 'lucide-react';

import { cn } from '@/lib/utils/common';
import {
  useSlidesV3Store,
  selectOverallProgress,
} from '@/stores/slidesV3Store';
import {
  useSlideGenerationV3,
  useCheckpoints,
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
  const { history, addHistory, removeHistory, clearHistory } =
    useSlidesHistoryStore();
  const [toolCalls, setToolCalls] = useState<ToolCallItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

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
        const data = event.data as { name: string };
        calls.push({
          id,
          type: 'checkpoint',
          title: `保存检查点: ${data.name}`,
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
      addHistory({
        title: request.title,
        sourceText: request.sourceText.slice(0, 200),
        targetPages: request.targetPages || 10,
        status: 'pending',
      });
      generate(request);
    },
    [generate, addHistory]
  );

  // 初始状态 - 显示输入表单
  if (!session && pages.length === 0 && !generating) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-white">
        {/* 头部 */}
        <Header
          showHistory={showHistory}
          onToggleHistory={() => setShowHistory(!showHistory)}
          onCreateCheckpoint={handleCreateCheckpoint}
        />

        {/* 历史记录面板 */}
        <HistoryPanel
          show={showHistory}
          history={history}
          onRemove={removeHistory}
          onClear={clearHistory}
        />

        {/* 初始输入表单 */}
        <InitialInputForm onGenerate={handleGenerate} />
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
      />

      {/* 历史记录面板 */}
      <HistoryPanel
        show={showHistory}
        history={history}
        onRemove={removeHistory}
        onClear={clearHistory}
      />

      {/* 两栏布局 */}
      <div className="flex flex-1 overflow-hidden">
        <ConversationPanel
          onSendMessage={handleSendMessage}
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
}: {
  title?: string;
  showHistory: boolean;
  onToggleHistory: () => void;
  onCreateCheckpoint: () => void;
}) {
  const [showExportMenu, setShowExportMenu] = useState(false);

  return (
    <header className="flex-shrink-0 border-b border-gray-200 bg-white">
      <div className="flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-orange-600">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">{title || 'AI 演示文稿'}</h1>
            <p className="text-xs text-gray-500">智能PPT生成</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
}: {
  show: boolean;
  history: SlidesHistoryItem[];
  onRemove: (id: string) => void;
  onClear: () => void;
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
                    className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3 hover:border-gray-300"
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
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onRemove(item.id)}
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
  toolCalls,
  generating,
  progress,
  outlinePlan,
}: {
  onSendMessage: (message: string) => void;
  toolCalls: ToolCallItem[];
  generating: boolean;
  progress: GenerationProgress | null;
  outlinePlan: OutlinePlan | null;
}) {
  const [inputValue, setInputValue] = useState('');
  const [outlineExpanded, setOutlineExpanded] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="flex h-full w-[400px] flex-shrink-0 flex-col border-r border-gray-200 bg-gray-50">
      {/* 滚动区域 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {/* 工具调用展示 */}
        <div className="space-y-3">
          {toolCalls.map((call) => (
            <ToolCallCard key={call.id} call={call} />
          ))}

          {/* 当前进度 */}
          {generating && progress && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
              <div className="flex items-center gap-2 text-orange-700">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm font-medium">{progress.message}</span>
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
                  <div className="mt-3 space-y-2">
                    {outlinePlan.pages.map(
                      (page: PageOutline, index: number) => (
                        <OutlineItem key={index} page={page} index={index} />
                      )
                    )}
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button className="flex-1 rounded-lg bg-orange-500 py-2 text-sm font-medium text-white hover:bg-orange-600">
                      确认大纲
                    </button>
                    <button className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                      修改
                    </button>
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
    <div className="flex items-start gap-2 rounded-lg bg-gray-50 p-2 text-sm">
      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-orange-100 text-xs font-medium text-orange-600">
        {index + 1}
      </span>
      <div className="flex-1">
        <div className="font-medium text-gray-900">{page.title}</div>
        <div className="mt-0.5 text-xs text-gray-500">{page.templateType}</div>
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

  return (
    <div className="flex flex-1 flex-col bg-gray-100">
      {/* 缩略图区域 */}
      <div className="flex-shrink-0 border-b border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {pages.length === 0 ? (
            <div className="flex h-16 items-center justify-center text-sm text-gray-500">
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
      <div className="flex flex-1 items-center justify-center overflow-auto p-8">
        {currentPage ? (
          <div className="relative aspect-[16/9] w-full max-w-4xl overflow-hidden rounded-lg bg-[#0F172A] shadow-2xl">
            {currentPage.html ? (
              <iframe
                srcDoc={currentPage.html}
                className="h-full w-full"
                style={{ border: 'none' }}
                sandbox="allow-scripts"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                {currentPage.status === 'generating' ? (
                  <div className="text-center">
                    <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-orange-400" />
                    <p className="text-gray-400">
                      正在生成第 {currentPage.pageNumber} 页...
                    </p>
                  </div>
                ) : currentPage.status === 'error' ? (
                  <div className="text-center text-red-400">
                    <AlertCircle className="mx-auto mb-4 h-12 w-12" />
                    <p>{currentPage.error || '生成失败'}</p>
                  </div>
                ) : (
                  <div className="text-center text-gray-500">
                    <Layers className="mx-auto mb-4 h-12 w-12 opacity-30" />
                    <p>等待生成...</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center text-gray-400">
            <Grid3X3 className="mx-auto mb-4 h-16 w-16 opacity-20" />
            <p className="text-lg">开始生成演示文稿</p>
            <p className="mt-2 text-sm">在左侧输入内容并点击生成</p>
          </div>
        )}
      </div>

      {/* 属性面板 */}
      {currentPage && (
        <div className="flex-shrink-0 border-t border-gray-200 bg-white px-6 py-3">
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="text-gray-500">模板:</span>
              <span className="ml-2 font-medium text-gray-900">
                {currentPage.outline?.templateType || '未知'}
              </span>
            </div>
            <div>
              <span className="text-gray-500">状态:</span>
              <span
                className={cn('ml-2 font-medium', {
                  'text-green-600': currentPage.status === 'completed',
                  'text-orange-600': currentPage.status === 'generating',
                  'text-red-600': currentPage.status === 'error',
                  'text-gray-600': currentPage.status === 'pending',
                })}
              >
                {getStatusText(currentPage.status)}
              </span>
            </div>
            <div>
              <span className="text-gray-500">页码:</span>
              <span className="ml-2 font-medium text-gray-900">
                {selectedPageIndex + 1} / {pages.length}
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
        'relative aspect-[16/9] w-24 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all',
        isSelected
          ? 'border-orange-500 shadow-lg'
          : 'border-gray-200 hover:border-gray-300'
      )}
    >
      {page.html ? (
        <div
          className="h-full w-full bg-[#0F172A]"
          style={{
            transform: 'scale(0.1)',
            transformOrigin: 'top left',
            width: '1000%',
            height: '1000%',
          }}
          dangerouslySetInnerHTML={{ __html: page.html }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gray-100">
          {page.status === 'generating' ? (
            <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          ) : page.status === 'error' ? (
            <AlertCircle className="h-4 w-4 text-red-500" />
          ) : (
            <span className="text-xs text-gray-400">{index + 1}</span>
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
}: {
  onGenerate: (request: GenerateV3Request) => void;
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
            <h2 className="mb-6 text-xl font-semibold text-gray-900">
              创建新的演示文稿
            </h2>

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
