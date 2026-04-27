'use client';

import { useState } from 'react';
import { ExternalLink, Quote, ImageOff } from 'lucide-react';
import type { ArtifactFigure } from '@/lib/agent-playground/report-artifact.types';

interface Props {
  figure: ArtifactFigure;
  citationIndex?: number;
  citationUrl?: string;
}

/**
 * Figure 渲染器（图文并茂红线：仅 reference / extracted_chart 两类）
 *
 * - reference：原图片 URL → <FigureCard>
 * - extracted_chart：结构化数据 → recharts（暂用 fallback table 占位）
 */
// 安全的 src 校验（mission-pipeline-baseline.md §7.4 红线）
function safeFigureSrc(src: string | undefined): string | null {
  if (!src) return null;
  const s = src.trim();
  if (!s) return null;
  // 仅 https / data:image 允许
  if (/^https:\/\//i.test(s)) return s;
  if (/^data:image\/(png|jpe?g|gif|svg\+xml|webp);base64,/i.test(s)) return s;
  return null;
}

export function FigureRenderer({ figure, citationUrl }: Props) {
  const [imgError, setImgError] = useState(false);
  const safeImg = safeFigureSrc(figure.imageUrl ?? figure.imageDataUri);
  return (
    <figure
      className="my-4 rounded-lg border border-gray-200 bg-gray-50/50 p-3"
      aria-label={figure.altText || figure.caption}
    >
      {figure.type === 'reference' && safeImg && !imgError && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={safeImg}
          alt={figure.altText || figure.caption}
          className="mx-auto max-h-96 rounded shadow-sm"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
        />
      )}
      {figure.type === 'reference' && safeImg && imgError && (
        <div className="flex h-32 flex-col items-center justify-center rounded border border-dashed border-gray-300 bg-white text-xs text-gray-500">
          <ImageOff className="mb-1 h-5 w-5" />
          原图加载失败 ·{' '}
          <a
            href={safeImg}
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-600 hover:underline"
          >
            访问源
          </a>
        </div>
      )}
      {figure.type === 'reference' && !safeImg && (
        <div className="flex h-32 items-center justify-center rounded border border-dashed border-gray-300 bg-white text-xs text-gray-500">
          [图源 URL 不安全或缺失，已隐藏]
        </div>
      )}
      {figure.type === 'extracted_chart' && (
        <div className="flex h-40 flex-col items-center justify-center rounded border border-dashed border-gray-300 bg-gradient-to-br from-blue-50 to-purple-50 text-xs">
          <span className="rounded bg-blue-100 px-2 py-0.5 font-medium text-blue-700">
            {figure.chartType ?? 'chart'}
          </span>
          <span className="mt-1 text-gray-500">
            [结构化图表 · 待 P28+ 接 recharts 渲染]
          </span>
        </div>
      )}
      <figcaption
        className="mt-2 text-center text-xs text-gray-600"
        title={`原图来源：${figure.sourceUrl}`}
      >
        <span className="font-medium">{figure.caption}</span>
        <span className="ml-2 text-gray-400">
          [来源 [{figure.evidenceCitationIndex}]
          {figure.sourcePageOrSection ? ` · ${figure.sourcePageOrSection}` : ''}
          ]
        </span>
      </figcaption>
      <div className="mt-1 flex items-center justify-center gap-3 text-[10px]">
        {citationUrl && (
          <a
            href={citationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-violet-600 hover:text-violet-700"
          >
            <ExternalLink className="h-3 w-3" />
            跳转原文献
          </a>
        )}
        {figure.sourceUrl && figure.sourceUrl !== citationUrl && (
          <a
            href={figure.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700"
            title={figure.sourceUrl}
          >
            <ExternalLink className="h-3 w-3" />
            图源
          </a>
        )}
      </div>
      {figure.referencedBy.length > 0 && (
        <div className="mt-2 border-t border-gray-100 pt-1.5">
          <p className="mb-0.5 flex items-center gap-1 text-[10px] font-medium text-gray-500">
            <Quote className="h-2.5 w-2.5" />
            被以下段落引用
          </p>
          <ul className="space-y-0.5">
            {figure.referencedBy.slice(0, 3).map((r, i) => (
              <li
                key={i}
                className="text-[10px] italic text-gray-500"
                title={r.phrase}
              >
                "...{r.phrase.slice(0, 80)}
                {r.phrase.length > 80 ? '…' : ''}"
              </li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  );
}
