'use client';

/**
 * Slides Engine v3.0 - 主页面组件
 *
 * 三栏布局：
 * - 左侧：进度面板 + 检查点
 * - 中间：预览面板
 * - 右侧：属性面板
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Pause,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Download,
  History,
  Settings,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileText,
  Layers,
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
import type { GenerateV3Request, PageState } from '@/types/slides-v3';

// ============================================================================
// 子组件
// ============================================================================

/**
 * 进度面板
 */
function ProgressPanel() {
  const { progress, generating, taskDecomposition, pages } = useSlidesV3Store();
  const overallProgress = useSlidesV3Store(selectOverallProgress);

  if (!generating && !progress) {
    return null;
  }

  return (
    <div className="border-b border-slate-700 p-4">
      <h3 className="mb-3 text-sm font-medium text-slate-300">生成进度</h3>

      {/* 总体进度条 */}
      <div className="mb-4">
        <div className="mb-1 flex justify-between text-xs text-slate-400">
          <span>{progress?.message || '准备中...'}</span>
          <span>{overallProgress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-700">
          <motion.div
            className="h-full bg-gradient-to-r from-amber-500 to-amber-400"
            initial={{ width: 0 }}
            animate={{ width: `${overallProgress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* 阶段指示器 */}
      <div className="space-y-2">
        {[
          'task_decomposition',
          'outline_planning',
          'page_rendering',
          'quality_review',
        ].map((phase, index) => {
          const isActive = progress?.phase === phase;
          const isCompleted =
            [
              'task_decomposition',
              'outline_planning',
              'page_rendering',
              'quality_review',
            ].indexOf(progress?.phase || '') > index;

          return (
            <div
              key={phase}
              className={cn(
                'flex items-center gap-2 text-xs',
                isActive
                  ? 'text-amber-400'
                  : isCompleted
                    ? 'text-green-400'
                    : 'text-slate-500'
              )}
            >
              {isCompleted ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : isActive ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Clock className="h-4 w-4" />
              )}
              <span>{getPhaseLabel(phase)}</span>
            </div>
          );
        })}
      </div>

      {/* 页面进度 */}
      {progress?.phase === 'page_rendering' && progress.totalPages && (
        <div className="mt-4 border-t border-slate-700 pt-4">
          <div className="mb-2 text-xs text-slate-400">
            页面 {progress.currentPage || 0} / {progress.totalPages}
          </div>
          <div className="grid grid-cols-6 gap-1">
            {pages.map((page) => (
              <div
                key={page.pageNumber}
                className={cn(
                  'flex aspect-[16/9] items-center justify-center rounded text-[8px]',
                  page.status === 'completed'
                    ? 'bg-green-500/20 text-green-400'
                    : page.status === 'generating'
                      ? 'bg-amber-500/20 text-amber-400'
                      : page.status === 'error'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-slate-700 text-slate-500'
                )}
              >
                {page.pageNumber}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 检查点面板
 */
function CheckpointPanel() {
  const { checkpoints, restoring, restoreCheckpoint } = useCheckpoints();

  if (checkpoints.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-slate-500">
        <History className="mx-auto mb-2 h-8 w-8 opacity-50" />
        <p>暂无检查点</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-300">
        <History className="h-4 w-4" />
        检查点
      </h3>
      <div className="space-y-2">
        {checkpoints.slice(0, 10).map((cp) => (
          <button
            key={cp.id}
            onClick={() => restoreCheckpoint(cp.id)}
            disabled={restoring}
            className={cn(
              'w-full rounded p-2 text-left text-xs transition-colors',
              'border border-slate-700 bg-slate-800 hover:bg-slate-700',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            <div className="truncate font-medium text-slate-300">{cp.name}</div>
            <div className="mt-1 text-slate-500">
              {new Date(cp.timestamp).toLocaleTimeString()}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * 预览面板
 */
function PreviewPanel() {
  const { pages, selectedPageIndex, setSelectedPageIndex } = useSlidesV3Store();
  const currentPage = pages[selectedPageIndex];

  if (pages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-slate-500">
        <div className="text-center">
          <Layers className="mx-auto mb-4 h-16 w-16 opacity-30" />
          <p>开始生成后将在这里显示预览</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* 页面导航 */}
      <div className="flex items-center justify-between border-b border-slate-700 p-4">
        <button
          onClick={() =>
            setSelectedPageIndex(Math.max(0, selectedPageIndex - 1))
          }
          disabled={selectedPageIndex === 0}
          className="rounded p-2 hover:bg-slate-700 disabled:opacity-30"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="text-sm text-slate-400">
          第 {selectedPageIndex + 1} / {pages.length} 页
        </span>
        <button
          onClick={() =>
            setSelectedPageIndex(
              Math.min(pages.length - 1, selectedPageIndex + 1)
            )
          }
          disabled={selectedPageIndex === pages.length - 1}
          className="rounded p-2 hover:bg-slate-700 disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* 预览区域 */}
      <div className="flex-1 overflow-auto p-4">
        {currentPage ? (
          <div className="aspect-[16/9] overflow-hidden rounded-lg bg-slate-900 shadow-xl">
            {currentPage.html ? (
              <div
                className="h-full w-full"
                style={{ transform: 'scale(0.5)', transformOrigin: 'top left' }}
                dangerouslySetInnerHTML={{ __html: currentPage.html }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-500">
                {currentPage.status === 'generating' ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : currentPage.status === 'error' ? (
                  <div className="text-center text-red-400">
                    <AlertCircle className="mx-auto mb-2 h-8 w-8" />
                    <p>{currentPage.error || '生成失败'}</p>
                  </div>
                ) : (
                  <p>等待生成...</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex aspect-[16/9] items-center justify-center rounded-lg bg-slate-900 text-slate-500">
            选择一个页面
          </div>
        )}
      </div>

      {/* 缩略图 */}
      <div className="border-t border-slate-700 p-4">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {pages.map((page, index) => (
            <button
              key={page.pageNumber}
              onClick={() => setSelectedPageIndex(index)}
              className={cn(
                'aspect-[16/9] w-20 flex-shrink-0 rounded border-2 transition-all',
                'bg-slate-800 hover:bg-slate-700',
                index === selectedPageIndex
                  ? 'border-amber-500'
                  : 'border-transparent'
              )}
            >
              <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                {page.pageNumber}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 输入面板
 */
function InputPanel({
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
    <div className="space-y-4 p-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-300">
          标题
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="输入演示文稿标题..."
          className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-300">
          素材内容
        </label>
        <textarea
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
          placeholder="粘贴要转换为幻灯片的文本内容..."
          rows={8}
          className="w-full resize-none rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-300">
          目标页数: {targetPages}
        </label>
        <input
          type="range"
          min={5}
          max={30}
          value={targetPages}
          onChange={(e) => setTargetPages(parseInt(e.target.value))}
          className="w-full"
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={generating || !title.trim() || !sourceText.trim()}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-lg py-3 font-medium transition-colors',
          generating
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
            <Play className="h-5 w-5" />
            开始生成
          </>
        )}
      </button>
    </div>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export function SlidesTabV3() {
  const {
    leftPanelCollapsed,
    rightPanelCollapsed,
    toggleLeftPanel,
    toggleRightPanel,
  } = useSlidesV3Store();
  const { generate, cancel, generating } = useSlideGenerationV3();

  return (
    <div className="flex h-full bg-slate-900 text-slate-200">
      {/* 左侧面板 */}
      <motion.div
        initial={false}
        animate={{ width: leftPanelCollapsed ? 48 : 280 }}
        className="bg-slate-850 flex flex-shrink-0 flex-col border-r border-slate-700"
      >
        <div className="flex items-center justify-between border-b border-slate-700 p-3">
          {!leftPanelCollapsed && (
            <span className="text-sm font-medium">Slides v3.0</span>
          )}
          <button
            onClick={toggleLeftPanel}
            className="rounded p-1 hover:bg-slate-700"
          >
            {leftPanelCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {!leftPanelCollapsed && (
          <div className="flex-1 overflow-y-auto">
            <InputPanel onGenerate={generate} />
            <ProgressPanel />
            <CheckpointPanel />
          </div>
        )}
      </motion.div>

      {/* 中间预览区域 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <PreviewPanel />
      </div>

      {/* 右侧面板 */}
      <motion.div
        initial={false}
        animate={{ width: rightPanelCollapsed ? 48 : 300 }}
        className="bg-slate-850 flex-shrink-0 border-l border-slate-700"
      >
        <div className="flex items-center justify-between border-b border-slate-700 p-3">
          <button
            onClick={toggleRightPanel}
            className="rounded p-1 hover:bg-slate-700"
          >
            {rightPanelCollapsed ? (
              <ChevronLeft className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          {!rightPanelCollapsed && (
            <span className="text-sm font-medium">属性</span>
          )}
        </div>

        {!rightPanelCollapsed && (
          <div className="p-4">
            <div className="text-center text-sm text-slate-500">
              <Settings className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p>选择页面查看属性</p>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ============================================================================
// 工具函数
// ============================================================================

function getPhaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    task_decomposition: '任务分解',
    outline_planning: '大纲规划',
    page_rendering: '页面渲染',
    quality_review: '质量检查',
  };
  return labels[phase] || phase;
}

export default SlidesTabV3;
