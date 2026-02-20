'use client';

/**
 * AI Slides V5.0 - Left Panel (Slide Navigator)
 *
 * Contains:
 * - Header: "Slide Navigator" label + collapse toggle
 * - Middle: GeneratingStatus (when generating) OR SlideThumbnailList (when done)
 * - Bottom: fixed control area (generate / cancel)
 */

import React from 'react';
import {
  Loader2,
  CheckCircle2,
  PanelLeftClose,
  RefreshCw,
  Square,
  Play,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import { useSlidesStore } from '@/stores';
import { sanitizeSlideHtml } from '@/lib/utils/sanitize';
import type {
  PageState,
  GenerationProgress,
  StreamEvent,
} from '@/types/slides';

// ============================================================================
// Phase label helper
// ============================================================================

function getPhaseLabel(phase: string | undefined): string {
  const labels: Record<string, string> = {
    task_decomposition: '任务分解',
    outline_planning: '大纲规划',
    page_rendering: '页面生成',
    quality_review: '质量检查',
  };
  return phase ? labels[phase] || phase : '处理中';
}

// ============================================================================
// SlideThumbnailList
// ============================================================================

interface SlideThumbnailListProps {
  pages: PageState[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

function SlideThumbnailList({
  pages,
  selectedIndex,
  onSelect,
}: SlideThumbnailListProps) {
  return (
    <div className="space-y-1.5 p-2">
      {pages.map((page, i) => (
        // Use div+role="button" — iframe inside <button> is invalid HTML
        <div
          key={page.pageNumber}
          role="button"
          tabIndex={0}
          onClick={() => onSelect(i)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onSelect(i);
          }}
          className={cn(
            'w-full cursor-pointer overflow-hidden rounded-lg border-2 transition-all',
            i === selectedIndex
              ? 'border-blue-500 shadow-md'
              : 'border-transparent hover:border-slate-300'
          )}
        >
          {/* 16:9 thumbnail area — iframe scales 1280×720 down to ~256px wide */}
          <div
            className="relative overflow-hidden bg-slate-800"
            style={{ paddingBottom: '56.25%' }}
          >
            {page.html ? (
              <iframe
                srcDoc={sanitizeSlideHtml(page.html)}
                className="pointer-events-none border-none"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '500%',
                  height: '500%',
                  transform: 'scale(0.2)',
                  transformOrigin: 'top left',
                }}
                sandbox="allow-same-origin"
                title={`Slide ${page.pageNumber} thumbnail`}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-700">
                {page.status === 'generating' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                ) : (
                  <div className="h-full w-full bg-slate-700" />
                )}
              </div>
            )}
            {/* Page number badge */}
            <div className="pointer-events-none absolute left-1 top-1 rounded bg-black/50 px-1 text-[10px] text-white">
              {i + 1}
            </div>
          </div>
          {/* Title label */}
          <div className="truncate bg-white px-2 py-1 text-left text-xs text-slate-600">
            {page.outline?.title || `第 ${page.pageNumber} 页`}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// GeneratingStatus
// ============================================================================

interface GeneratingStatusProps {
  progress: GenerationProgress | null;
  streamEvents: StreamEvent[];
}

function GeneratingStatus({ progress, streamEvents }: GeneratingStatusProps) {
  const percent = progress?.overallProgress ?? 0;
  const phaseLabel = getPhaseLabel(progress?.phase);

  // Last 5 agent events — key by type+timestamp for stable identity
  const agentEvents = streamEvents
    .filter(
      (e) =>
        e.type === 'agent:working' ||
        e.type === 'mission:agent_working' ||
        e.type === 'agent:completed' ||
        e.type === 'mission:agent_done'
    )
    .slice(-5);

  return (
    <div className="space-y-3 p-3">
      {/* Phase + progress bar */}
      <div>
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-slate-600">{phaseLabel}</span>
          <span className="font-medium text-blue-600">{percent}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        {progress?.message && (
          <p className="mt-1 truncate text-xs text-slate-500">
            {progress.message}
          </p>
        )}
      </div>

      {/* Agent event list */}
      {agentEvents.length > 0 && (
        <div className="space-y-1">
          {agentEvents.map((event) => {
            const data = event.data as Record<string, unknown>;
            const agentName = (data?.agentName || data?.agent || '') as string;
            const isDone =
              event.type === 'agent:completed' ||
              event.type === 'mission:agent_done';
            // Stable key: type + timestamp string
            const key = `${event.type}-${String(event.timestamp)}`;
            return (
              <div key={key} className="flex items-center gap-1.5 text-xs">
                {isDone ? (
                  <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-green-500" />
                ) : (
                  <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin text-blue-500" />
                )}
                <span
                  className={cn(
                    'truncate',
                    isDone ? 'text-slate-400' : 'text-slate-600'
                  )}
                >
                  {agentName || '处理中...'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// LeftPanel
// ============================================================================

interface LeftPanelProps {
  onCollapse?: () => void;
  onGenerate?: () => void;
  onCancel?: () => void;
  className?: string;
}

export function LeftPanel({
  onCollapse,
  onGenerate,
  onCancel,
  className,
}: LeftPanelProps) {
  const {
    pages,
    generating,
    progress,
    streamEvents,
    selectedPageIndex,
    setSelectedPageIndex,
  } = useSlidesStore();

  const phaseLabel = getPhaseLabel(progress?.phase);
  const canGenerate = !generating;
  const canCancel = generating;

  return (
    <div
      className={cn(
        'flex h-full flex-col border-r border-slate-200 bg-white',
        className
      )}
    >
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Slide Navigator
        </span>
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            title="折叠面板"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Middle: generating status OR thumbnail list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {generating && pages.length === 0 ? (
          <GeneratingStatus progress={progress} streamEvents={streamEvents} />
        ) : generating && pages.length > 0 ? (
          <>
            <GeneratingStatus progress={progress} streamEvents={streamEvents} />
            <div className="border-t border-slate-100" />
            <SlideThumbnailList
              pages={pages}
              selectedIndex={selectedPageIndex}
              onSelect={setSelectedPageIndex}
            />
          </>
        ) : pages.length > 0 ? (
          <SlideThumbnailList
            pages={pages}
            selectedIndex={selectedPageIndex}
            onSelect={setSelectedPageIndex}
          />
        ) : (
          <div className="flex h-32 flex-col items-center justify-center px-4 text-center text-xs text-slate-400">
            <Play className="mb-2 h-6 w-6 text-slate-300" />
            点击生成开始创建幻灯片
          </div>
        )}
      </div>

      {/* Bottom: fixed control area */}
      <div className="flex-shrink-0 space-y-2 border-t border-slate-200 bg-white px-3 py-2">
        {/* Phase + status pill */}
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{phaseLabel}</span>
          <span
            className={
              generating
                ? 'text-blue-600'
                : pages.length > 0
                  ? 'text-green-600'
                  : 'text-slate-400'
            }
          >
            {generating ? '生成中' : pages.length > 0 ? '已完成' : '待生成'}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex gap-1.5">
          <button
            onClick={onGenerate}
            disabled={!canGenerate}
            className={cn(
              'flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-xs transition-colors',
              canGenerate
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'cursor-not-allowed bg-slate-100 text-slate-400'
            )}
            title={pages.length > 0 ? '重新生成' : '开始生成'}
          >
            <RefreshCw className="h-3 w-3" />
            {pages.length > 0 ? '重新生成' : '生成'}
          </button>
          <button
            onClick={onCancel}
            disabled={!canCancel}
            className={cn(
              'flex flex-1 items-center justify-center gap-1 rounded-lg border py-1.5 text-xs transition-colors',
              canCancel
                ? 'border-red-400 text-red-500 hover:bg-red-50'
                : 'cursor-not-allowed border-slate-200 text-slate-300'
            )}
            title="取消生成"
          >
            <Square className="h-3 w-3" />
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

export default LeftPanel;
