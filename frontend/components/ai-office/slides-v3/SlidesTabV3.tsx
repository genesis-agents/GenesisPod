'use client';

/**
 * Slides Engine v3.0 - 主页面组件
 *
 * 根据设计文档 Section 7 实现：
 * - Header: [返回] [项目名称] [检查点▾] [导出▾] [设置]
 * - 两栏布局：对话面板 + 预览面板
 * - 底部进度条
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Download,
  Settings,
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
  ChevronRight,
  Layers,
  Eye,
  Palette,
  Grid3X3,
} from 'lucide-react';

import { cn } from '@/lib/utils/common';
import {
  useSlidesV3Store,
  selectOverallProgress,
  selectCurrentPage,
} from '@/stores/slidesV3Store';
import {
  useSlideGenerationV3,
  useCheckpoints,
} from '@/hooks/features/slides-v3';
import type {
  GenerateV3Request,
  PageState,
  StreamEvent,
  PageOutline,
  GenerationProgress,
} from '@/types/slides-v3';

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
// Header 组件
// ============================================================================

function Header({
  title,
  onBack,
  onExport,
  onCheckpoint,
}: {
  title: string;
  onBack: () => void;
  onExport: () => void;
  onCheckpoint: () => void;
}) {
  const { checkpoints, session } = useSlidesV3Store();
  const [showCheckpointMenu, setShowCheckpointMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  return (
    <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-slate-700 bg-slate-900 px-4">
      {/* 左侧 */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1 rounded px-2 py-1.5 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </button>
        <div className="h-4 w-px bg-slate-700" />
        <h1 className="text-sm font-medium text-slate-200">
          {session?.title || title || '新建演示文稿'}
        </h1>
      </div>

      {/* 右侧 */}
      <div className="flex items-center gap-2">
        {/* 历史记录按钮 */}
        <div className="relative">
          <button
            onClick={() => setShowCheckpointMenu(!showCheckpointMenu)}
            className="flex items-center gap-1 rounded px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <History className="h-4 w-4" />
            历史记录
            <ChevronDown className="h-3 w-3" />
          </button>
          {showCheckpointMenu && (
            <CheckpointDropdown
              onClose={() => setShowCheckpointMenu(false)}
              onCreateCheckpoint={onCheckpoint}
            />
          )}
        </div>

        {/* 导出按钮 */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="flex items-center gap-1 rounded px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <Download className="h-4 w-4" />
            导出
            <ChevronDown className="h-3 w-3" />
          </button>
          {showExportMenu && (
            <ExportDropdown onClose={() => setShowExportMenu(false)} />
          )}
        </div>

        {/* 设置按钮 */}
        <button className="rounded p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// 检查点下拉菜单
// ============================================================================

function CheckpointDropdown({
  onClose,
  onCreateCheckpoint,
}: {
  onClose: () => void;
  onCreateCheckpoint: () => void;
}) {
  const { checkpoints, restoring, restoreCheckpoint } = useCheckpoints();
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
      className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-slate-700 bg-slate-800 py-2 shadow-xl"
    >
      <button
        onClick={() => {
          onCreateCheckpoint();
          onClose();
        }}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-amber-400 hover:bg-slate-700"
      >
        <Save className="h-4 w-4" />
        创建保存点
      </button>

      {checkpoints.length > 0 && (
        <>
          <div className="my-2 border-t border-slate-700" />
          <div className="max-h-64 overflow-y-auto">
            {checkpoints.map((cp) => (
              <button
                key={cp.id}
                onClick={() => {
                  restoreCheckpoint(cp.id);
                  onClose();
                }}
                disabled={restoring}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-50"
              >
                <Clock className="h-4 w-4 text-slate-500" />
                <div className="flex-1 truncate">
                  <div className="truncate">{cp.name}</div>
                  <div className="text-xs text-slate-500">
                    {new Date(cp.timestamp).toLocaleString()}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
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
      className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-slate-700 bg-slate-800 py-2 shadow-xl"
    >
      <button className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700">
        <FileText className="h-4 w-4" />
        导出 PPTX
      </button>
      <button className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700">
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
}: {
  onSendMessage: (message: string) => void;
  toolCalls: ToolCallItem[];
  generating: boolean;
}) {
  const { progress, outlinePlan, taskDecomposition } = useSlidesV3Store();
  const [inputValue, setInputValue] = useState('');
  const [outlineExpanded, setOutlineExpanded] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
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
    <div className="flex h-full w-[400px] flex-shrink-0 flex-col border-r border-slate-700 bg-slate-900">
      {/* 滚动区域 - 思考过程 + 大纲预览 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {/* 工具调用展示 - 统一滚动区域 */}
        <div className="space-y-3 p-4">
          {toolCalls.map((call) => (
            <ToolCallCard key={call.id} call={call} />
          ))}

          {/* 当前进度显示 */}
          {generating && progress && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex items-center gap-2 text-amber-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm font-medium">{progress.message}</span>
              </div>
              {progress.totalPages && (
                <div className="mt-2 text-xs text-amber-400/70">
                  页面 {progress.currentPage || 0} / {progress.totalPages}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 大纲预览 */}
        {outlinePlan && (
          <div className="border-t border-slate-700 p-4">
            <button
              onClick={() => setOutlineExpanded(!outlineExpanded)}
              className="flex w-full items-center gap-2 text-left text-sm font-medium text-slate-300"
            >
              <FileText className="h-4 w-4 text-blue-400" />
              大纲预览
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
                    {outlinePlan.pages.map((page, index) => (
                      <OutlineItem key={index} page={page} index={index} />
                    ))}
                  </div>

                  {/* 确认/修改按钮 */}
                  <div className="mt-4 flex gap-2">
                    <button className="flex-1 rounded-lg bg-amber-500 py-2 text-sm font-medium text-slate-900 hover:bg-amber-600">
                      确认大纲
                    </button>
                    <button className="flex-1 rounded-lg border border-slate-600 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800">
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
      <div className="flex-shrink-0 border-t border-slate-700 p-4">
        <div className="flex items-end gap-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入修改建议..."
            rows={1}
            className="max-h-32 min-h-[40px] flex-1 resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            className={cn(
              'rounded-lg p-2 transition-colors',
              inputValue.trim()
                ? 'bg-amber-500 text-slate-900 hover:bg-amber-600'
                : 'bg-slate-800 text-slate-500'
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
        return <Loader2 className="h-4 w-4 animate-spin text-amber-400" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-400" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-400" />;
    }
  };

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50">
      <button
        onClick={() => call.content && setExpanded(!expanded)}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <div className="text-amber-400">{getIcon()}</div>
        <div className="flex-1">
          <div className="text-sm font-medium text-slate-300">{call.title}</div>
          <div className="text-xs text-slate-500">
            {call.timestamp.toLocaleTimeString()}
          </div>
        </div>
        {getStatusIcon()}
        {call.content && (
          <ChevronDown
            className={cn(
              'h-4 w-4 text-slate-500 transition-transform',
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
            <div className="border-t border-slate-700 p-3">
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs text-slate-400">
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
    <div className="flex items-start gap-2 rounded bg-slate-800/50 p-2 text-sm">
      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-slate-700 text-xs text-slate-400">
        {index + 1}
      </span>
      <div className="flex-1">
        <div className="font-medium text-slate-300">{page.title}</div>
        <div className="mt-0.5 text-xs text-slate-500">{page.templateType}</div>
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
    <div className="flex flex-1 flex-col bg-slate-950">
      {/* 缩略图区域 */}
      <div className="flex-shrink-0 border-b border-slate-700 bg-slate-900 p-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {pages.length === 0 ? (
            <div className="flex h-16 items-center justify-center text-sm text-slate-500">
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
                    <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-amber-400" />
                    <p className="text-slate-400">
                      正在生成第 {currentPage.pageNumber} 页...
                    </p>
                  </div>
                ) : currentPage.status === 'error' ? (
                  <div className="text-center text-red-400">
                    <AlertCircle className="mx-auto mb-4 h-12 w-12" />
                    <p>{currentPage.error || '生成失败'}</p>
                  </div>
                ) : (
                  <div className="text-center text-slate-500">
                    <Layers className="mx-auto mb-4 h-12 w-12 opacity-30" />
                    <p>等待生成...</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center text-slate-500">
            <Grid3X3 className="mx-auto mb-4 h-16 w-16 opacity-20" />
            <p className="text-lg">开始生成演示文稿</p>
            <p className="mt-2 text-sm">在左侧输入内容并点击生成</p>
          </div>
        )}
      </div>

      {/* 属性面板 */}
      {currentPage && (
        <div className="flex-shrink-0 border-t border-slate-700 bg-slate-900 p-4">
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="text-slate-500">模板:</span>
              <span className="ml-2 text-slate-300">
                {currentPage.outline?.templateType || '未知'}
              </span>
            </div>
            <div>
              <span className="text-slate-500">状态:</span>
              <span
                className={cn('ml-2', {
                  'text-green-400': currentPage.status === 'completed',
                  'text-amber-400': currentPage.status === 'generating',
                  'text-red-400': currentPage.status === 'error',
                  'text-slate-400': currentPage.status === 'pending',
                })}
              >
                {getStatusText(currentPage.status)}
              </span>
            </div>
            <div>
              <span className="text-slate-500">页码:</span>
              <span className="ml-2 text-slate-300">
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
        'relative aspect-[16/9] w-24 flex-shrink-0 overflow-hidden rounded border-2 transition-all',
        isSelected
          ? 'border-amber-500 shadow-lg shadow-amber-500/20'
          : 'border-slate-700 hover:border-slate-500'
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
        <div className="flex h-full w-full items-center justify-center bg-slate-800">
          {page.status === 'generating' ? (
            <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
          ) : page.status === 'error' ? (
            <AlertCircle className="h-4 w-4 text-red-400" />
          ) : (
            <span className="text-xs text-slate-500">{index + 1}</span>
          )}
        </div>
      )}

      {/* 页码标签 */}
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
    <div className="flex h-10 flex-shrink-0 items-center justify-between border-t border-slate-700 bg-slate-900 px-4">
      <div className="flex items-center gap-4">
        {/* 进度条 */}
        <div className="flex items-center gap-2">
          <div className="h-2 w-48 overflow-hidden rounded-full bg-slate-700">
            <motion.div
              className="h-full bg-gradient-to-r from-amber-500 to-amber-400"
              initial={{ width: 0 }}
              animate={{ width: `${overallProgress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <span className="text-xs text-slate-400">{overallProgress}%</span>
        </div>

        {/* 页面计数 */}
        <div className="text-xs text-slate-500">
          {completedPages} / {pages.length} 页
        </div>
      </div>

      {/* 检查点信息 */}
      {latestCheckpoint && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Save className="h-3 w-3" />
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
    <div className="flex flex-1 items-center justify-center bg-slate-950 p-8">
      <div className="w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 p-8">
        <h2 className="mb-6 text-xl font-semibold text-slate-200">
          创建新的演示文稿
        </h2>

        <div className="space-y-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">
              标题
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="输入演示文稿标题..."
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-200 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">
              素材内容
            </label>
            <textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="粘贴要转换为幻灯片的文本内容..."
              rows={12}
              className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-200 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">
              目标页数: {targetPages} 页
            </label>
            <input
              type="range"
              min={5}
              max={30}
              value={targetPages}
              onChange={(e) => setTargetPages(parseInt(e.target.value))}
              className="w-full accent-amber-500"
            />
            <div className="mt-1 flex justify-between text-xs text-slate-500">
              <span>5 页</span>
              <span>30 页</span>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={generating || !title.trim() || !sourceText.trim()}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-lg py-4 text-base font-medium transition-colors',
              generating || !title.trim() || !sourceText.trim()
                ? 'cursor-not-allowed bg-slate-700 text-slate-400'
                : 'bg-amber-500 text-slate-900 hover:bg-amber-600'
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
    </div>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export function SlidesTabV3() {
  const { session, pages, generating, streamEvents, progress } =
    useSlidesV3Store();
  const { generate, cancel } = useSlideGenerationV3();
  const { createCheckpoint } = useCheckpoints();
  const [toolCalls, setToolCalls] = useState<ToolCallItem[]>([]);

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
    // TODO: 实现对话式修改
    console.log('Send message:', message);
  }, []);

  const handleBack = useCallback(() => {
    // TODO: 实现返回逻辑
  }, []);

  const handleCreateCheckpoint = useCallback(() => {
    createCheckpoint('用户保存点');
  }, [createCheckpoint]);

  // 初始状态 - 显示输入表单
  if (!session && pages.length === 0 && !generating) {
    return (
      <div className="flex h-full flex-col bg-slate-950">
        <Header
          title=""
          onBack={handleBack}
          onExport={() => {}}
          onCheckpoint={handleCreateCheckpoint}
        />
        <InitialInputForm onGenerate={generate} />
      </div>
    );
  }

  // 生成中或已有内容 - 显示两栏布局
  return (
    <div className="flex h-full flex-col bg-slate-950">
      <Header
        title={session?.title || ''}
        onBack={handleBack}
        onExport={() => {}}
        onCheckpoint={handleCreateCheckpoint}
      />

      <div className="flex flex-1 overflow-hidden">
        <ConversationPanel
          onSendMessage={handleSendMessage}
          toolCalls={toolCalls}
          generating={generating}
        />
        <PreviewPanel />
      </div>

      <ProgressBar />
    </div>
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
