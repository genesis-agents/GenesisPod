'use client';

/**
 * ReferencesPanel —— 参考文献（对标 Topic Insights，叠加多维分组）
 *
 * 在 TI 单一域名分组的基础上叠加：
 *   - 类型分组（gov / academic / industry / news / blog / community / other）
 *   - 时效分组（按发布年份）
 *   - 权威度分组（高 / 中 / 低，按 credibilityScore）
 *   - 域名分组（兼容 TI）
 *
 * 当 ReportArtifact 提供结构化 citations 时，渲染富信息条目（title + snippet + 类型 + 时间 + 评分）；
 * 否则降级到 URL 列表（裸 sources）。
 *
 * 全程使用 playground-ui primitives。
 */

import React, { useMemo, useState } from 'react';
import {
  Layers,
  Globe,
  Calendar,
  ShieldCheck,
  ListTree,
  ExternalLink,
  Building2,
  GraduationCap,
  Newspaper,
  Megaphone,
  Users,
  Star,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/common';
import type { ArtifactCitation } from '@/lib/agent-playground/report-artifact.types';
import { Card } from '@/components/playground-ui';

interface Props {
  /** 结构化 citations（来自 ReportArtifact） —— 优先用 */
  citations?: readonly ArtifactCitation[];
  /** 裸 URL fallback —— 仅 citations 缺失时使用 */
  fallbackSources?: readonly string[];
}

type GroupKey = 'type' | 'year' | 'credibility' | 'domain';

const SOURCE_TYPE_META: Record<
  ArtifactCitation['sourceType'],
  { label: string; Icon: LucideIcon; tone: string }
> = {
  gov: {
    label: '官方 / 政府',
    Icon: Building2,
    tone: 'bg-sky-50 text-sky-700 ring-sky-200',
  },
  academic: {
    label: '学术 / 论文',
    Icon: GraduationCap,
    tone: 'bg-violet-50 text-violet-700 ring-violet-200',
  },
  industry: {
    label: '行业 / 智库',
    Icon: Megaphone,
    tone: 'bg-amber-50 text-amber-700 ring-amber-200',
  },
  news: {
    label: '新闻媒体',
    Icon: Newspaper,
    tone: 'bg-blue-50 text-blue-700 ring-blue-200',
  },
  blog: {
    label: '博客 / 个人',
    Icon: Users,
    tone: 'bg-gray-50 text-gray-700 ring-gray-200',
  },
  community: {
    label: '社区 / 论坛',
    Icon: Users,
    tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  },
  other: {
    label: '其它',
    Icon: Globe,
    tone: 'bg-gray-50 text-gray-600 ring-gray-200',
  },
};

function credibilityBucket(score: number): {
  key: 'high' | 'medium' | 'low';
  label: string;
  tone: string;
} {
  if (score >= 0.75)
    return {
      key: 'high',
      label: '高权威 (≥ 0.75)',
      tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    };
  if (score >= 0.5)
    return {
      key: 'medium',
      label: '中权威 (0.5 ~ 0.75)',
      tone: 'bg-amber-50 text-amber-700 ring-amber-200',
    };
  return {
    key: 'low',
    label: '低权威 (< 0.5)',
    tone: 'bg-rose-50 text-rose-700 ring-rose-200',
  };
}

function yearOf(c: ArtifactCitation): string {
  if (!c.publishedAt) return '未标注年份';
  const m = c.publishedAt.match(/^(\d{4})/);
  return m ? m[1] : '未标注年份';
}

// ─── Citation 卡片 ─────────────────────────────────
function CitationCard({ c }: { c: ArtifactCitation }) {
  const meta = SOURCE_TYPE_META[c.sourceType] ?? SOURCE_TYPE_META.other;
  const Icon = meta.Icon;
  const safeUrl = /^https?:\/\//i.test(c.url) ? c.url : null;
  const cred = credibilityBucket(c.credibilityScore);
  const occ = c.occurrences?.length ?? 0;
  return (
    <li
      id={`ref-${c.uuid || c.index}`}
      data-cite-uuid={c.uuid}
      className="scroll-mt-4 rounded-md border border-gray-200 bg-white px-3 py-2 transition-all hover:border-violet-200 hover:bg-violet-50/30"
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            'mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ring-1',
            meta.tone
          )}
          title={meta.label}
        >
          <Icon className="h-3 w-3" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono inline-block flex-shrink-0 text-[10px] font-bold text-violet-700">
              [{c.index}]
            </span>
            <p className="line-clamp-2 text-[12.5px] font-medium leading-snug text-gray-900">
              {c.title || c.url}
            </p>
          </div>
          {c.snippet && (
            <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-gray-600">
              {c.snippet}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
            <span
              className={cn(
                'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 ring-1',
                meta.tone
              )}
            >
              {meta.label}
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 ring-1',
                cred.tone
              )}
            >
              <Star className="h-2.5 w-2.5" />
              {(c.credibilityScore * 100).toFixed(0)}
            </span>
            <span className="font-mono text-gray-500">{c.domain}</span>
            {c.publishedAt && (
              <span className="font-mono text-gray-500">
                <Calendar className="mr-0.5 inline-block h-2.5 w-2.5" />
                {c.publishedAt}
              </span>
            )}
            {occ > 0 && <span className="text-gray-500">引用 {occ} 处</span>}
            {safeUrl && (
              <a
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-0.5 text-violet-600 hover:text-violet-700"
                title={safeUrl}
              >
                打开 <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

// ─── 分组 helpers ───────────────────────────────────
function groupCitations(
  citations: readonly ArtifactCitation[],
  groupBy: GroupKey
): { label: string; tone?: string; items: ArtifactCitation[] }[] {
  const map = new Map<string, ArtifactCitation[]>();
  for (const c of citations) {
    let key: string;
    if (groupBy === 'type') {
      key = SOURCE_TYPE_META[c.sourceType]?.label ?? '其它';
    } else if (groupBy === 'year') {
      key = yearOf(c);
    } else if (groupBy === 'credibility') {
      key = credibilityBucket(c.credibilityScore).label;
    } else {
      key = c.domain || '(no domain)';
    }
    const arr = map.get(key) ?? [];
    arr.push(c);
    map.set(key, arr);
  }
  return [...map.entries()]
    .map(([label, items]) => ({ label, items }))
    .sort((a, b) => b.items.length - a.items.length);
}

// ─── Group Header chip ──────────────────────────────
function GroupTabs({
  active,
  onChange,
}: {
  active: GroupKey;
  onChange: (k: GroupKey) => void;
}) {
  const tabs: { key: GroupKey; label: string; Icon: LucideIcon }[] = [
    { key: 'type', label: '按类型', Icon: ListTree },
    { key: 'credibility', label: '按权威度', Icon: ShieldCheck },
    { key: 'year', label: '按年份', Icon: Calendar },
    { key: 'domain', label: '按域名', Icon: Globe },
  ];
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-[11px]">
      {tabs.map((t) => {
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors',
              isActive
                ? 'bg-white text-violet-700 shadow-sm ring-1 ring-violet-200'
                : 'text-gray-600 hover:text-gray-900'
            )}
          >
            <t.Icon className="h-3 w-3" />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── 总览 stat row ──────────────────────────────────
function StatRow({ citations }: { citations: readonly ArtifactCitation[] }) {
  const byType: Record<string, number> = {};
  let highCred = 0;
  let withDate = 0;
  for (const c of citations) {
    byType[c.sourceType] = (byType[c.sourceType] ?? 0) + 1;
    if (c.credibilityScore >= 0.75) highCred += 1;
    if (c.publishedAt) withDate += 1;
  }
  const domains = new Set(citations.map((c) => c.domain)).size;
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {[
        { label: '总引用', value: citations.length, sub: `${domains} 个域名` },
        {
          label: '高权威',
          value: highCred,
          sub:
            citations.length > 0
              ? `${Math.round((highCred / citations.length) * 100)}%`
              : '—',
        },
        {
          label: '官方 / 学术',
          value: (byType['gov'] ?? 0) + (byType['academic'] ?? 0),
          sub: (byType['gov'] ?? 0) + (byType['academic'] ?? 0) + ' 条',
        },
        {
          label: '有日期',
          value: withDate,
          sub:
            citations.length > 0
              ? `${Math.round((withDate / citations.length) * 100)}%`
              : '—',
        },
      ].map((c) => (
        <Card key={c.label} className="px-3 py-2.5" bordered>
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
            {c.label}
          </p>
          <p className="mt-0.5 text-xl font-bold text-gray-900">{c.value}</p>
          <p className="mt-0.5 text-[10px] text-gray-500">{c.sub}</p>
        </Card>
      ))}
    </div>
  );
}

// ─── 主组件 ──────────────────────────────────────────
export function ReferencesPanel({ citations, fallbackSources }: Props) {
  const [groupBy, setGroupBy] = useState<GroupKey>('type');
  const list = useMemo(() => citations ?? [], [citations]);
  const grouped = useMemo(() => groupCitations(list, groupBy), [list, groupBy]);

  // ─── 降级路径：没有结构化 citations，只有裸 URL ───
  if (list.length === 0) {
    const sources = fallbackSources ?? [];
    if (sources.length === 0) {
      return (
        <Card className="px-4 py-10 text-center" bordered>
          <Layers className="mx-auto mb-2 h-7 w-7 text-gray-300" />
          <p className="text-sm font-medium text-gray-700">暂无引用来源</p>
          <p className="mt-1 text-[11px] text-gray-500">
            Researcher / Writer 在报告中引用 URL 后会自动收集到这里
          </p>
        </Card>
      );
    }
    // URL fallback —— 按域名分组
    const byHost = new Map<string, string[]>();
    for (const u of sources) {
      let host = '其它';
      try {
        host = new URL(u).hostname.replace(/^www\./, '');
      } catch {
        // ignore
      }
      const arr = byHost.get(host) ?? [];
      arr.push(u);
      byHost.set(host, arr);
    }
    const hostList = [...byHost.entries()].sort(
      (a, b) => b[1].length - a[1].length
    );
    return (
      <Card className="p-4" bordered>
        <div className="mb-3 flex items-center gap-2">
          <Layers className="h-4 w-4 text-violet-500" />
          <h3 className="text-sm font-semibold text-gray-900">参考文献</h3>
          <span className="ml-auto text-[11px] text-gray-500">
            {sources.length} 条 · {hostList.length} 域名
          </span>
        </div>
        <div className="space-y-3">
          {hostList.map(([host, urls]) => (
            <div
              key={host}
              className="rounded-lg border border-gray-100 bg-gray-50/30"
            >
              <div className="flex items-center justify-between border-b border-gray-100 px-3 py-1.5">
                <span className="font-mono text-[11px] font-semibold text-gray-700">
                  {host}
                </span>
                <span className="text-[10px] text-gray-500">
                  {urls.length} 条
                </span>
              </div>
              <ul className="space-y-0.5 p-2">
                {urls.map((u, i) => {
                  const safe = /^https?:\/\//i.test(u) ? u : null;
                  return (
                    <li key={`${u}-${i}`}>
                      {safe ? (
                        <a
                          href={safe}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="line-clamp-2 break-all rounded-md px-2 py-1 text-[11px] text-violet-700 hover:bg-violet-50 hover:underline"
                        >
                          {safe}
                        </a>
                      ) : (
                        <span className="line-clamp-2 break-all px-2 py-1 text-[11px] text-gray-400">
                          {u}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10px] text-gray-400">
          报告暂未提供结构化引用元数据；当前仅按域名展示 URL。
        </p>
      </Card>
    );
  }

  // ─── 结构化路径：完整富信息 ───
  return (
    <div className="space-y-4">
      <StatRow citations={list} />
      <Card className="overflow-hidden" bordered>
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-violet-500" />
            <h3 className="text-sm font-semibold text-gray-900">参考文献</h3>
            <span className="text-xs text-gray-500">· 共 {list.length} 条</span>
          </div>
          <div className="ml-auto">
            <GroupTabs active={groupBy} onChange={setGroupBy} />
          </div>
        </div>
        <div className="space-y-4 p-4">
          {grouped.map((g) => (
            <section key={g.label}>
              <header className="mb-2 flex items-center gap-2">
                <h4 className="text-[12.5px] font-semibold text-gray-800">
                  {g.label}
                </h4>
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700">
                  {g.items.length}
                </span>
              </header>
              <ul className="space-y-1.5">
                {g.items.map((c) => (
                  <CitationCard key={`${c.uuid}-${c.index}`} c={c} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Card>
    </div>
  );
}
