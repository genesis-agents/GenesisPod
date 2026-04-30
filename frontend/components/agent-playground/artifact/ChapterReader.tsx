'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import type {
  ArtifactCitation,
  ArtifactSection,
  ReportArtifact,
} from '@/lib/agent-playground/report-artifact.types';
import { ArtifactMarkdown } from './ArtifactMarkdown';

interface Props {
  artifact: ReportArtifact;
  initialSectionId?: string;
}

/**
 * 章节视图（TI 双层模式）：
 *  - 默认渲染章节卡列表（每章一个 button card）
 *  - 点击进入全屏阅读单章；返回按钮回列表
 *
 * 对齐 frontend/components/ai-insights/reports/ChapterizedReportView.tsx
 */
export function ChapterReader({ artifact, initialSectionId }: Props) {
  // ★ 2026-04-30: 启发式合并被 chapter-writer LLM 违规写成 H2 的"keyPoint 子小节"
  //   到前一个真章节。后端 buildSectionTree 只看 ## 切 sections，但 LLM 经常把
  //   "1. xxx" / "（一）xxx" / "其一：xxx" 这种 keyPoint 编号写成 ## H2，导致
  //   一个 chapter 被切成 N 张卡片（如 f976eb07 sections=54 实际只有 ~8 个 chapter）。
  //   合并规则：H2 标题以下列模式开头视为"伪 H2 子小节"，吸收到前一个真章节范围内：
  //     - 数字+点 (1. 2. 10.)
  //     - 中文数字 (一、二、三 / 一. / （一）)
  //     - 顺序词 (其一 其二 / 第一 第二)
  //   合并 = 前一章节 endOffset 扩展到本节 endOffset；本节不进 chapter 卡列表。
  const PSEUDO_H2_PATTERN =
    /^(\d+[.、]|[一二三四五六七八九十]+[.、]|（[一二三四五六七八九十]+）|[（(][1-9]\d*[）)]|其[一二三四五六七八九十]|第[一二三四五六七八九十]+[、章节])\s*/u;
  const sections = useMemo(() => {
    const all = artifact.sections.filter(
      (s) => s.level === 2 && s.parentId == null
    );
    const merged: typeof all = [];
    for (const s of all) {
      const isPseudo =
        PSEUDO_H2_PATTERN.test(s.title.trim()) && merged.length > 0;
      if (isPseudo) {
        // 合并到前一个真章节：扩展 endOffset + 累加 wordCount
        const prev = merged[merged.length - 1];
        prev.endOffset = Math.max(prev.endOffset, s.endOffset);
        prev.wordCount = (prev.wordCount ?? 0) + (s.wordCount ?? 0);
        // citations / figureIds / factIds 也合并
        prev.citations = Array.from(
          new Set([...(prev.citations ?? []), ...(s.citations ?? [])])
        );
        prev.figureIds = Array.from(
          new Set([...(prev.figureIds ?? []), ...(s.figureIds ?? [])])
        );
        prev.factIds = Array.from(
          new Set([...(prev.factIds ?? []), ...(s.factIds ?? [])])
        );
      } else {
        merged.push({ ...s });
      }
    }
    return merged;
  }, [artifact.sections]);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSectionId ?? null
  );
  const selectedSection: ArtifactSection | undefined = sections.find(
    (s) => s.id === selectedId
  );
  const selectedIndex = selectedSection
    ? sections.findIndex((s) => s.id === selectedSection.id)
    : -1;

  const sectionMarkdown = useMemo(() => {
    if (!selectedSection) return '';
    return artifact.content.fullMarkdown
      .slice(selectedSection.startOffset, selectedSection.endOffset)
      .trimEnd();
  }, [selectedSection, artifact.content.fullMarkdown]);

  // 当前章对应的 citations 子集（章末参考文献）
  const sectionCitations = useMemo(() => {
    if (!selectedSection) return [];
    const ids = new Set(selectedSection.citations);
    return artifact.citations.filter((c) => ids.has(c.index));
  }, [selectedSection, artifact.citations]);

  const sectionFigures = useMemo(() => {
    if (!selectedSection) return [];
    const ids = new Set(selectedSection.figureIds);
    return artifact.figures.filter((f) => ids.has(f.id));
  }, [selectedSection, artifact.figures]);

  // 反向溯源
  const [reverseHighlight, setReverseHighlight] = useState<number | null>(null);
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

  if (sections.length === 0) {
    return <p className="text-sm text-gray-500">报告暂无可视章节</p>;
  }

  // ─── Selected: 全屏阅读单章（TI 风格） ───────────────────────
  if (selectedSection) {
    const totalWords = sections.reduce((s, x) => s + (x.wordCount ?? 0), 0);
    void totalWords;

    return (
      <div className="flex h-full flex-col bg-white">
        {/* Header: back + chapter number badge + title + word count */}
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-2">
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="shrink-0 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            title="返回章节列表"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-medium text-green-700">
            <Check className="h-3.5 w-3.5" />
          </span>
          <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
            第 {selectedIndex + 1} 章: {selectedSection.title}
          </h3>
          <span className="shrink-0 text-xs text-gray-400">
            {selectedSection.wordCount} 字
          </span>
        </div>

        {/* Chapter content */}
        <div className="flex-1 overflow-auto">
          <div className="bg-white p-6">
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

            {/* 章末参考文献（TI 风格） */}
            {sectionCitations.length > 0 && (
              <div className="mt-8 border-t border-gray-200 pt-6">
                <h4 className="mb-4 text-base font-semibold text-gray-700">
                  参考文献
                </h4>
                <div className="space-y-2 text-sm text-gray-600">
                  {sectionCitations
                    .slice()
                    .sort((a, b) => a.index - b.index)
                    .map((c) => (
                      <div
                        key={c.uuid}
                        id={`ref-${c.index}`}
                        data-cite-uuid={c.uuid}
                        className="flex gap-2.5 leading-relaxed"
                      >
                        <span className="font-mono shrink-0 text-xs text-gray-400">
                          [{c.index}]
                        </span>
                        {c.url ? (
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {c.title || c.domain || c.url}
                          </a>
                        ) : (
                          <span>{c.title || 'Unknown source'}</span>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── 章节列表视图 ─────────────────────────────────────
  const stats = {
    total: sections.length,
    completed: sections.length,
    totalWords: sections.reduce((s, x) => s + (x.wordCount ?? 0), 0),
  };

  return (
    <div className="flex h-full flex-col">
      {/* Stats Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4">
        <div className="text-base text-gray-600">
          共 {stats.total} 章 · 已完成 {stats.completed} · 总字数{' '}
          {stats.totalWords >= 1000
            ? `${(stats.totalWords / 1000).toFixed(1)}k`
            : stats.totalWords}
        </div>
      </div>

      {/* Chapter Cards */}
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-2">
          {sections.map((s, idx) => {
            const preview = artifact.content.fullMarkdown
              .slice(s.startOffset, s.endOffset)
              .replace(/^#{1,6}\s+[^\n]+\n+/, '')
              .replace(/\*\*([^*]+)\*\*/g, '$1')
              .replace(/\[(\d+)\]/g, '')
              .replace(/^>\s*/gm, '')
              .trim()
              .slice(0, 200);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedId(s.id)}
                className="block w-full rounded-xl border border-gray-100 bg-white p-4 text-left transition-all hover:border-blue-200 hover:bg-blue-50/50"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-medium text-green-700">
                    <Check className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-medium text-gray-800">
                      第 {idx + 1} 章: {s.title}
                    </div>
                    {preview && (
                      <div className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-gray-500">
                        {preview}
                        {preview.length >= 200 ? '...' : ''}
                      </div>
                    )}
                  </div>
                  {s.wordCount > 0 && (
                    <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                      {s.wordCount} 字
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// keep useEffect type imports; fallback handler ref
function _useReverseHighlight(
  setReverseHighlight: (n: number | null) => void
): (citation: ArtifactCitation) => void {
  return (citation) => {
    setReverseHighlight(citation.index);
    setTimeout(() => setReverseHighlight(null), 4000);
    const firstSup = document.querySelector(
      `sup[data-cite="${citation.index}"]`
    );
    firstSup?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
}
void _useReverseHighlight;
