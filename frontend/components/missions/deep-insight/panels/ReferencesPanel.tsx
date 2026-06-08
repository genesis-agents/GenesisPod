'use client';

/**
 * ReferencesPanel — 参考文献（双实现去重核心）。
 *
 * 归一为吃契约 Reference[] 的单一 L3 面板：company adapter 直接喂 MissionReference[]，
 * playground adapter 把富 citation 对象映成 Reference[]。
 *
 * 保留 playground 版的 citation 锚点能力（规范 panels.ReferencesPanel）：可选
 * `getAnchorId(ref, index)` 给每条加 `id`（如 `ref-${id}`）以支持跨面板跳转；
 * company 不传则退化为无锚点纯列表。
 */

import { ExternalLink } from 'lucide-react';
import { EmptyState } from '@/components/ui/states';
import type { Reference } from '../contract';

/** 短化展示 URL：去协议、截断。 */
function shortUrl(url: string): string {
  const noProto = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return noProto.length > 48 ? noProto.slice(0, 48) + '…' : noProto;
}

const isUrl = (s: string) => /^https?:\/\//i.test(s);

export interface ReferencesPanelProps {
  references: Reference[];
  /** 可选锚点 id 生成器（playground citationNavigation 用，company 省略）。 */
  getAnchorId?: (ref: Reference, index: number) => string | undefined;
}

export function ReferencesPanel({
  references,
  getAnchorId,
}: ReferencesPanelProps) {
  if (references.length === 0) {
    return (
      <EmptyState
        type="default"
        size="sm"
        title="暂无引用"
        description="本次研究未产出可展示的来源引用"
      />
    );
  }
  return (
    <ol className="space-y-2">
      {references.map((r, i) => (
        <li
          key={`${r.source}-${i}`}
          id={getAnchorId?.(r, i)}
          className="rounded-xl border border-gray-200 bg-white p-3"
        >
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-500">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium text-gray-900">
                  {r.title || shortUrl(r.source)}
                </span>
                {isUrl(r.source) && (
                  <a
                    href={r.source}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 text-gray-400 hover:text-primary"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
              {r.snippet && (
                <p className="mt-1 line-clamp-2 text-xs text-gray-500">
                  {r.snippet}
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-400">
                {r.dimension && (
                  <span className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-600">
                    {r.dimension}
                  </span>
                )}
                {r.publishedAt && <span>{r.publishedAt}</span>}
                <span className="truncate">{shortUrl(r.source)}</span>
              </div>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default ReferencesPanel;
