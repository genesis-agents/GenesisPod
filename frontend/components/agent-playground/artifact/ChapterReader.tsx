'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, List } from 'lucide-react';
import type {
  ArtifactCitation,
  ArtifactSection,
  ReportArtifact,
} from '@/lib/agent-playground/report-artifact.types';
import { ArtifactMarkdown } from './ArtifactMarkdown';
import { ReferencePanel } from './ReferencePanel';

interface Props {
  artifact: ReportArtifact;
  initialSectionId?: string;
}

/** 章节视图：左侧 TOC + 右侧单章渲染，URL 保留 sec={id} 锚点 */
export function ChapterReader({ artifact, initialSectionId }: Props) {
  const sections = artifact.sections;
  const [activeId, setActiveId] = useState<string>(
    initialSectionId ?? sections[0]?.id ?? ''
  );
  const activeIndex = sections.findIndex((s) => s.id === activeId);
  const activeSection: ArtifactSection | undefined = sections[activeIndex];

  const sectionMarkdown = useMemo(() => {
    if (!activeSection) return '';
    return artifact.content.fullMarkdown
      .slice(activeSection.startOffset, activeSection.endOffset)
      .trimEnd();
  }, [activeSection, artifact.content.fullMarkdown]);

  // 章节内出现的 citation 子集
  const sectionCitations = useMemo(() => {
    if (!activeSection) return [];
    const ids = new Set(activeSection.citations);
    return artifact.citations.filter((c) => ids.has(c.index));
  }, [activeSection, artifact.citations]);

  const sectionFigures = useMemo(() => {
    if (!activeSection) return [];
    const ids = new Set(activeSection.figureIds);
    return artifact.figures.filter((f) => ids.has(f.id));
  }, [activeSection, artifact.figures]);

  // ★ Phase P2-3: 章节视图反向溯源（同 ContinuousReader）
  const [reverseHighlight, setReverseHighlight] = useState<number | null>(null);
  const handleReverseHighlight = (citation: ArtifactCitation) => {
    setReverseHighlight(citation.index);
    setTimeout(() => setReverseHighlight(null), 4000);
    const firstSup = document.querySelector(
      `sup[data-cite="${citation.index}"]`
    );
    firstSup?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
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

  if (sections.length === 0) {
    return <p className="text-sm text-gray-500">报告暂无可视章节</p>;
  }

  return (
    <div className="flex gap-6">
      {/* 左侧 TOC */}
      <aside className="sticky top-4 h-[calc(100vh-2rem)] w-64 flex-shrink-0 overflow-y-auto rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
          <List className="h-3 w-3" />
          目录（{sections.length}）
        </p>
        <nav className="space-y-1">
          {sections.map((s) => (
            <div key={s.id}>
              <button
                type="button"
                onClick={() => setActiveId(s.id)}
                className={`block w-full truncate rounded px-2 py-1.5 text-left text-xs transition-colors ${
                  activeId === s.id
                    ? 'bg-violet-100 font-medium text-violet-700'
                    : 'text-gray-600 hover:bg-violet-50 hover:text-violet-700'
                }`}
              >
                {s.title}
                <span className="ml-1 text-[10px] text-gray-400">
                  · {s.wordCount} 字
                </span>
              </button>
              {/* Phase P36-1: 当前章 children 子节快速跳转 */}
              {activeId === s.id && s.children && s.children.length > 0 && (
                <ul className="ml-3 mt-0.5 border-l border-violet-200 pl-2">
                  {s.children.map((child) => (
                    <li key={child.id}>
                      <a
                        href={`#${child.anchor}`}
                        className="block truncate py-0.5 text-[11px] text-gray-500 hover:text-violet-700"
                      >
                        {child.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </nav>
      </aside>

      {/* 右侧单章 */}
      <main className="min-w-0 flex-1">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">
                第 {activeIndex + 1} / {sections.length} 章 · 约{' '}
                {activeSection?.readingTimeMinutes} 分钟 ·{' '}
                {activeSection?.wordCount ?? 0} 字 · {sectionCitations.length}{' '}
                引用
                {sectionFigures.length > 0 && ` · ${sectionFigures.length} 图`}
              </p>
              {/* Phase P16-4: 章节进度条 */}
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full bg-gradient-to-r from-violet-400 to-purple-500 transition-all"
                  style={{
                    width: `${Math.round(((activeIndex + 1) / sections.length) * 100)}%`,
                  }}
                />
              </div>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={activeIndex === 0}
                onClick={() => setActiveId(sections[activeIndex - 1].id)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
                title="上一章"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={activeIndex === sections.length - 1}
                onClick={() => setActiveId(sections[activeIndex + 1].id)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
                title="下一章"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          {sectionMarkdown.trim().length === 0 ? (
            <p className="rounded border border-dashed border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-700">
              该章节内容为空（可能是 Researcher 阶段降级失败）
            </p>
          ) : (
            <ArtifactMarkdown
              markdown={sectionMarkdown}
              citations={sectionCitations}
              figures={sectionFigures}
            />
          )}
        </div>
        <ReferencePanel
          citations={sectionCitations}
          onClickReverseHighlight={handleReverseHighlight}
        />
      </main>
    </div>
  );
}
