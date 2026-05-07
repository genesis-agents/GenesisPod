// PR-8 v1.6 D6 figure-curator AI 生成水印 CSS overlay
//
// 用法（mission 详情页 chapter 渲染图片）：
//   <ChapterFigureWithOverlay figure={fig} />
//
// 见 docs/architecture/ai-app/agent-playground/agent-playground-overhaul-v1.6.md § 14.4 P-A15

'use client';

import * as React from 'react';

export type ChapterFigureProps = {
  figure: {
    id?: string;
    imageUrl: string;
    caption?: string;
    altText?: string | null;
    sourceType: string; // "scraped" | "ai-generated" | "user-uploaded" | "hotlink"
    sourceUrl?: string | null;
    watermarkOverlayRequired?: boolean;
  };
};

export function ChapterFigureWithOverlay({
  figure,
}: ChapterFigureProps): React.ReactElement {
  // EU AI Act Art.50 best-effort: AI 生成图必须在前端 CSS overlay 显式标注（不依赖图片本身）
  // pointer-events-none + select-none 让 overlay 不可交互；用户右键保存图片不携带，但页面渲染始终带
  const isAiGen =
    figure.sourceType === 'ai-generated' || figure.watermarkOverlayRequired;

  return (
    <figure className="relative my-3">
      <div className="relative">
        <img
          src={figure.imageUrl}
          alt={figure.altText ?? figure.caption ?? ''}
          className="w-full rounded"
          loading="lazy"
        />
        {isAiGen && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-2 right-2 select-none rounded bg-black/70 px-2 py-1 text-xs font-medium text-white shadow-md"
          >
            🤖 AI generated
          </div>
        )}
      </div>
      {figure.caption && (
        <figcaption className="mt-2 text-center text-xs text-gray-600">
          {figure.caption}
          {isAiGen && <span className="ml-1 text-gray-500">(AI 生成插图)</span>}
          {figure.sourceUrl && figure.sourceType !== 'ai-generated' && (
            <a
              href={figure.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1 text-blue-600 hover:underline"
            >
              来源
            </a>
          )}
        </figcaption>
      )}
    </figure>
  );
}
