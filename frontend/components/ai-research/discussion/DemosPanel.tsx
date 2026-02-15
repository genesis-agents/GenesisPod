'use client';

import { useState } from 'react';
import {
  Play,
  X,
  Loader2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Trash2,
  Maximize2,
  Lightbulb,
  Code2,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import type { ResearchDemo } from '@/hooks/features/useResearchDemos';

interface DemosPanelProps {
  projectId: string;
  demos: ResearchDemo[];
  onGenerateDemo?: (ideaId: string) => void;
  onDeleteDemo?: (demoId: string) => void;
  isLoading?: boolean;
  className?: string;
}

/**
 * Inject a Content-Security-Policy meta tag into HTML content
 * to restrict network access from sandboxed iframes.
 */
function injectCSP(html: string): string {
  const cspMeta =
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:;\">";
  // Insert after <head> if present, otherwise prepend
  if (html.includes('<head>')) {
    return html.replace('<head>', `<head>${cspMeta}`);
  }
  if (html.includes('<head ')) {
    return html.replace(/<head\s[^>]*>/, `$&${cspMeta}`);
  }
  return `${cspMeta}${html}`;
}

const STATUS_CONFIG = {
  PENDING: { label: '等待生成', color: 'bg-gray-100 text-gray-600' },
  GENERATING: { label: '生成中', color: 'bg-blue-100 text-blue-700' },
  COMPLETED: { label: '已完成', color: 'bg-green-100 text-green-700' },
  FAILED: { label: '生成失败', color: 'bg-red-100 text-red-700' },
} as const;

export function DemosPanel({
  projectId,
  demos,
  onGenerateDemo,
  onDeleteDemo,
  isLoading = false,
  className,
}: DemosPanelProps) {
  const [viewingDemo, setViewingDemo] = useState<ResearchDemo | null>(null);
  const [iframeKey, setIframeKey] = useState(0);

  const handleRefreshIframe = () => {
    setIframeKey((prev) => prev + 1);
  };

  const handleOpenInNewTab = () => {
    if (!viewingDemo) return;
    const blob = new Blob([viewingDemo.htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const handleDeleteDemo = (demoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDeleteDemo) {
      onDeleteDemo(demoId);
    }
  };

  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="animate-pulse overflow-hidden rounded-lg border border-gray-200 bg-white"
            >
              <div className="h-1 bg-gradient-to-r from-purple-500 to-blue-500" />
              <div className="space-y-4 p-6">
                <div className="h-6 w-3/4 rounded bg-gray-200" />
                <div className="h-4 w-1/2 rounded bg-gray-200" />
                <div className="h-4 w-1/3 rounded bg-gray-200" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (demos.length === 0) {
    return (
      <div className={cn('flex items-center justify-center py-16', className)}>
        <div className="max-w-md space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple-100 to-blue-100">
            <Code2 className="h-8 w-8 text-purple-600" />
          </div>
          <div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900">
              暂无演示
            </h3>
            <p className="text-sm text-gray-500">
              从想法标签页生成演示，查看交互式原型
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={cn('space-y-4', className)}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {demos.map((demo) => {
            const statusConfig = STATUS_CONFIG[demo.status];
            const formattedDate = new Date(demo.createdAt).toLocaleDateString(
              'zh-CN',
              {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
              }
            );

            return (
              <div
                key={demo.id}
                className="overflow-hidden rounded-lg border border-gray-200 bg-white transition-shadow hover:shadow-md"
              >
                <div className="h-1 bg-gradient-to-r from-purple-500 to-blue-500" />
                <div className="space-y-4 p-6">
                  <div className="space-y-3">
                    <h3 className="line-clamp-2 text-lg font-semibold text-gray-900">
                      {demo.title}
                    </h3>

                    {demo.idea && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Lightbulb className="h-4 w-4 flex-shrink-0 text-amber-500" />
                        <span className="line-clamp-1">{demo.idea.title}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                          statusConfig.color
                        )}
                      >
                        {demo.status === 'GENERATING' && (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        )}
                        {demo.status === 'FAILED' && (
                          <AlertCircle className="h-3 w-3" />
                        )}
                        {statusConfig.label}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formattedDate}
                      </span>
                    </div>

                    {demo.status === 'FAILED' && demo.error && (
                      <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 p-3">
                        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                        <p className="line-clamp-2 text-sm text-red-700">
                          {demo.error}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    {demo.status === 'COMPLETED' && (
                      <button
                        onClick={() => setViewingDemo(demo)}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:from-purple-700 hover:to-blue-700"
                      >
                        <Play className="h-4 w-4" />
                        查看演示
                      </button>
                    )}
                    {demo.status === 'GENERATING' && (
                      <div className="inline-flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        生成中...
                      </div>
                    )}
                    {demo.status === 'PENDING' && (
                      <div className="inline-flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-500">
                        等待生成...
                      </div>
                    )}
                    {onDeleteDemo && (
                      <button
                        onClick={(e) => handleDeleteDemo(demo.id, e)}
                        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        title="删除演示"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {viewingDemo && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setViewingDemo(null)}
                className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {viewingDemo.title}
                </h2>
                {viewingDemo.idea && (
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
                    <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                    {viewingDemo.idea.title}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefreshIframe}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
                title="刷新"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <button
                onClick={handleOpenInNewTab}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
                title="在新标签页中打开"
              >
                <ExternalLink className="h-4 w-4" />
              </button>
            </div>
          </div>

          <iframe
            key={iframeKey}
            sandbox="allow-scripts"
            srcDoc={injectCSP(viewingDemo.htmlContent)}
            className="w-full flex-1 border-0"
            title={viewingDemo.title}
          />
        </div>
      )}
    </>
  );
}
