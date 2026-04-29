'use client';

import { useState, useEffect } from 'react';
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

/** 连续视图：整篇 markdown 一篇到底（对齐 TI preview 模式，无左 TOC） */
export function ContinuousReader({ artifact }: Props) {
  const [highlightedCite] = useState<number | null>(null);
  const [reverseHighlight, setReverseHighlight] = useState<number | null>(null);

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
      el.classList.add('ring-2', 'ring-blue-400', 'rounded-md', 'bg-blue-200')
    );
    return () => {
      sups.forEach((el) =>
        el.classList.remove(
          'ring-2',
          'ring-blue-400',
          'rounded-md',
          'bg-blue-200'
        )
      );
    };
  }, [reverseHighlight]);

  return (
    <div>
      {/* 主体：连续 markdown（去掉左侧 TOC，对齐 TI ChapterizedReportView preview 模式） */}
      <main className="min-w-0">
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
        {/* TI 同款极简包裹：bg-white + p-6，无 card shadow，让 prose 自己掌握排版 */}
        <div className="bg-white p-6">
          <ArtifactMarkdown
            markdown={artifact.content.fullMarkdown}
            citations={artifact.citations}
            figures={artifact.figures}
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
