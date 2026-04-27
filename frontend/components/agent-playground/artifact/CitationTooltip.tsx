'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Copy,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Shield,
} from 'lucide-react';
import type { ArtifactCitation } from '@/lib/agent-playground/report-artifact.types';

interface Props {
  index: number;
  citation: ArtifactCitation | undefined;
  onCitationClick?: (index: number) => void;
}

/**
 * 角标 hover 卡片。
 * - hover：显示来源 / domain / credibility / [打开原文]
 * - click：scroll 到 ReferencePanel 对应条目
 */
export function CitationTooltip({ index, citation, onCitationClick }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    placement: 'above' | 'below';
  } | null>(null);

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const space = window.innerHeight - rect.bottom;
    const placement: 'above' | 'below' = space < 220 ? 'above' : 'below';
    setPos({
      top: placement === 'below' ? rect.bottom + 6 : rect.top - 6,
      left: rect.left,
      placement,
    });
  }, [open]);

  // Phase P34-2 / P47-1: ESC 关闭 + 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const clickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!triggerRef.current?.contains(target)) {
        // 点击不在 trigger 上 → 关闭（tooltip 内部交互不会触发，因为它在 portal-like 浮层但仍受到此点击影响 — 短延迟避免）
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    // delay click handler 避免 open 时立即关
    const timer = setTimeout(() => {
      document.addEventListener('click', clickHandler);
    }, 100);
    return () => {
      window.removeEventListener('keydown', handler);
      clearTimeout(timer);
      document.removeEventListener('click', clickHandler);
    };
  }, [open]);

  if (!citation) {
    // 灰色不可点击（缺失引用）
    return (
      <sup
        className="mx-0.5 inline-block cursor-not-allowed rounded px-0.5 align-super text-[10px] text-gray-400"
        title="引用元数据缺失"
      >
        [{index}]
      </sup>
    );
  }

  return (
    <>
      <sup
        ref={triggerRef}
        data-cite={index}
        tabIndex={0}
        className="mx-0.5 inline-block cursor-pointer rounded px-0.5 align-super text-[10px] font-medium text-violet-600 hover:bg-violet-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => onCitationClick?.(index)}
      >
        [{index}]
      </sup>
      {open && pos && (
        <div
          className="fixed z-50 max-h-[80vh] w-72 max-w-[90vw] overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 shadow-xl sm:w-80"
          style={{
            top: pos.placement === 'below' ? pos.top : pos.top - 220, // tooltip 高度近似 220
            left: Math.min(pos.left, window.innerWidth - 340),
          }}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
              [{citation.index}]
            </span>
            <span
              className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${
                citation.credibilityScore >= 80
                  ? 'text-emerald-600'
                  : citation.credibilityScore >= 60
                    ? 'text-amber-600'
                    : 'text-gray-500'
              }`}
            >
              {citation.credibilityScore >= 80 ? (
                <ShieldCheck className="h-2.5 w-2.5" />
              ) : citation.credibilityScore >= 60 ? (
                <Shield className="h-2.5 w-2.5" />
              ) : (
                <ShieldAlert className="h-2.5 w-2.5" />
              )}
              可信度 {citation.credibilityScore}/100
            </span>
          </div>
          <p className="mt-1.5 line-clamp-2 text-sm font-medium text-gray-900">
            {citation.title}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-gray-500">
            <span
              className={`rounded px-1 py-0 text-[9px] font-medium ${
                citation.sourceType === 'gov'
                  ? 'bg-blue-100 text-blue-700'
                  : citation.sourceType === 'academic'
                    ? 'bg-purple-100 text-purple-700'
                    : citation.sourceType === 'news'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-100 text-gray-600'
              }`}
            >
              {citation.sourceType}
            </span>
            <span>{citation.domain}</span>
            {citation.publishedAt && (
              <>
                <span>· {citation.publishedAt.slice(0, 10)}</span>
                {(() => {
                  const days = Math.floor(
                    (Date.now() - new Date(citation.publishedAt).getTime()) /
                      (1000 * 60 * 60 * 24)
                  );
                  if (isNaN(days)) return null;
                  if (days < 30)
                    return <span className="text-emerald-600">新鲜</span>;
                  if (days < 365)
                    return (
                      <span className="text-blue-600">
                        {Math.round(days / 30)}月前
                      </span>
                    );
                  return (
                    <span className="text-gray-500">
                      {Math.round(days / 365)}年前
                    </span>
                  );
                })()}
              </>
            )}
          </p>
          {citation.snippet && (
            <p className="mt-2 line-clamp-3 text-[11px] text-gray-600">
              {citation.snippet}
            </p>
          )}
          <div className="mt-2 flex items-center gap-3">
            <a
              href={citation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-600 hover:text-violet-700"
            >
              <ExternalLink className="h-3 w-3" />
              打开原文
            </a>
            <button
              type="button"
              onClick={() => {
                const text = `[${citation.index}] ${citation.title} — ${citation.domain}\n${citation.url}`;
                void navigator.clipboard?.writeText(text);
              }}
              className="inline-flex items-center gap-1 text-[11px] text-gray-600 hover:text-gray-800"
              title="复制引用条目"
            >
              <Copy className="h-3 w-3" />
              复制
            </button>
          </div>
          <div className="mt-1 text-[10px] text-gray-400">
            出现 {citation.occurrences.length} 次
          </div>
        </div>
      )}
    </>
  );
}
