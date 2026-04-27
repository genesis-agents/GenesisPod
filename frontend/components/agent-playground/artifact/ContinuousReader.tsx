'use client';

import { useState, useEffect } from 'react';
import { BookOpen, Clock } from 'lucide-react';
import type {
  ArtifactCitation,
  ReportArtifact,
} from '@/lib/agent-playground/report-artifact.types';
import { ArtifactMarkdown } from './ArtifactMarkdown';
import { ReferencePanel } from './ReferencePanel';
import { AlertTriangle } from 'lucide-react';

interface Props {
  artifact: ReportArtifact;
}

/** 连续视图：整篇 markdown 一篇到底，左侧浮动 mini-TOC */
export function ContinuousReader({ artifact }: Props) {
  const [highlightedCite, setHighlightedCite] = useState<number | null>(null);
  const [reverseHighlight, setReverseHighlight] = useState<number | null>(null);
  // Phase P43-5: 滚动追踪当前 section
  const [activeSectionAnchor, setActiveSectionAnchor] = useState<string>('');
  useEffect(() => {
    const handler = () => {
      let bestId = '';
      let bestTop = -Infinity;
      for (const sec of artifact.sections) {
        const el = document.getElementById(sec.anchor);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top < 100 && top > bestTop) {
          bestTop = top;
          bestId = sec.anchor;
        }
      }
      if (bestId) setActiveSectionAnchor(bestId);
    };
    handler();
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, [artifact.sections]);

  const handleCitationClick = (index: number) => {
    setHighlightedCite(index);
    setTimeout(() => setHighlightedCite(null), 2500);
    document
      .getElementById(`ref-${index}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // ★ Phase P1-12: 反向溯源 — 点击 ReferencePanel 引用条目 → 高亮文中所有位置
  const handleReverseHighlight = (citation: ArtifactCitation) => {
    setReverseHighlight(citation.index);
    setTimeout(() => setReverseHighlight(null), 4000);
    // 滚到第一个出现位置
    const firstSup = document.querySelector(
      `sup[data-cite="${citation.index}"]`
    );
    firstSup?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // 使用 effect 给文中所有 [N] 加临时高亮 class
  useEffect(() => {
    if (reverseHighlight == null) return;
    const sups = document.querySelectorAll(
      `sup[data-cite="${reverseHighlight}"]`
    );
    sups.forEach((el) =>
      el.classList.add(
        'ring-2',
        'ring-violet-400',
        'rounded-md',
        'bg-violet-200'
      )
    );
    return () => {
      sups.forEach((el) =>
        el.classList.remove(
          'ring-2',
          'ring-violet-400',
          'rounded-md',
          'bg-violet-200'
        )
      );
    };
  }, [reverseHighlight]);

  return (
    <div className="flex gap-6">
      {/* 左侧浮动 mini-TOC */}
      <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-56 flex-shrink-0 overflow-y-auto rounded-2xl border border-gray-100 bg-white p-4 shadow-sm lg:block">
        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
          <BookOpen className="h-3 w-3" />
          目录
        </p>
        <nav className="space-y-1">
          {artifact.sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.anchor}`}
              className={`block truncate rounded px-2 py-1 text-xs transition-colors ${
                activeSectionAnchor === s.anchor
                  ? 'bg-violet-100 font-medium text-violet-700'
                  : 'text-gray-600 hover:bg-violet-50 hover:text-violet-700'
              }`}
            >
              {s.title}
            </a>
          ))}
        </nav>
        <div className="mt-3 border-t border-gray-100 pt-2 text-[10px] text-gray-500">
          <Clock className="mr-1 inline h-2.5 w-2.5" />约{' '}
          {artifact.metadata.readingTimeMinutes} 分钟
          <br />
          {artifact.metadata.wordCount >= 1000
            ? `${(artifact.metadata.wordCount / 1000).toFixed(1)}k`
            : artifact.metadata.wordCount}{' '}
          字 · {artifact.metadata.sourceCount} 引用
          {artifact.metadata.figureCount > 0 &&
            ` · ${artifact.metadata.figureCount} 图`}
          {artifact.metadata.factCount > 0 &&
            ` · ${artifact.metadata.factCount} 事实`}
        </div>
      </aside>

      {/* 主体：连续 markdown */}
      <main className="min-w-0 flex-1">
        {/* Phase P18-3: 顶部 hardGate 警示条带（如有） */}
        {artifact.quality.hardGateViolations.length > 0 && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            <AlertTriangle className="mr-1 inline h-3 w-3" />
            <span className="font-semibold">
              {artifact.quality.hardGateViolations.length} 项硬卡违规
            </span>
            <span className="ml-2">
              {artifact.quality.hardGateViolations
                .slice(0, 2)
                .map((v) => `${v.dimension}: ${v.message}`)
                .join(' · ')}
            </span>
          </div>
        )}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <ArtifactMarkdown
            markdown={artifact.content.fullMarkdown}
            citations={artifact.citations}
            figures={artifact.figures}
            onCitationClick={handleCitationClick}
          />
        </div>
        <ReferencePanel
          citations={artifact.citations}
          highlightedIndex={highlightedCite}
          onClickReverseHighlight={handleReverseHighlight}
        />
      </main>
    </div>
  );
}
