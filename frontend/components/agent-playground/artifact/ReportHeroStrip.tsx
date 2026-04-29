'use client';

/**
 * ReportHeroStrip —— 报告头部资讯条（对标 TI 报告头部 + 杂志风格 stat 条）
 *
 * 信息层次：
 *   1. 标题 + 副标（topic + 生成时间 + version）
 *   2. 6 个核心统计 stat（字数 / 章节 / 引用 / 图表 / 事实 / 阅读时长）
 *   3. 受众 / 风格 / 长度 / 语言 tags
 */

import React from 'react';
import {
  FileText,
  Layers,
  BookmarkCheck,
  ImageIcon,
  Database,
  Clock,
  Users,
  Briefcase,
  Ruler,
  Globe,
  Calendar,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/common';
import type { ReportArtifact } from '@/lib/agent-playground/report-artifact.types';
import { Card } from '@/components/playground-ui';
import { BrandLogo } from '@/components/brand/BrandLogo';

const AUDIENCE_LABEL: Record<string, string> = {
  executive: '高管受众',
  'domain-expert': '领域专家',
  'general-public': '大众读者',
};
const STYLE_LABEL: Record<string, string> = {
  academic: '学术风格',
  executive: '管理风格',
  journalistic: '新闻风格',
  technical: '技术风格',
};
const LENGTH_LABEL: Record<string, string> = {
  brief: '简版 · 3K',
  standard: '标准 · 8K',
  deep: '深度 · 15K',
  extended: '加长 · 25K',
  epic: '巨幅 · 80K',
  mega: '专著 · 200K',
};
const LANG_LABEL: Record<string, string> = {
  'zh-CN': '中文',
  'en-US': 'English',
};

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return iso;
  }
}

interface StatCell {
  Icon: LucideIcon;
  label: string;
  value: string;
}

export function ReportHeroStrip({ artifact }: { artifact: ReportArtifact }) {
  const m = artifact.metadata;
  const cells: StatCell[] = [
    {
      Icon: FileText,
      label: '总字数',
      value:
        m.wordCount >= 1000
          ? `${(m.wordCount / 1000).toFixed(1)}k`
          : String(m.wordCount),
    },
    {
      Icon: Layers,
      label: '章节',
      value: String(artifact.sections.length),
    },
    {
      Icon: BookmarkCheck,
      label: '引用',
      value: String(m.sourceCount),
    },
    {
      Icon: ImageIcon,
      label: '图表',
      value: String(m.figureCount),
    },
    {
      Icon: Database,
      label: '事实',
      value: String(m.factCount),
    },
    {
      Icon: Clock,
      label: '阅读',
      value: `${m.readingTimeMinutes} 分钟`,
    },
  ];

  const tags: { Icon: LucideIcon; label: string; tone: string }[] = [
    {
      Icon: Users,
      label: AUDIENCE_LABEL[m.audienceProfile] ?? m.audienceProfile,
      tone: 'bg-violet-50 text-violet-700 ring-violet-200',
    },
    {
      Icon: Briefcase,
      label: STYLE_LABEL[m.styleProfile] ?? m.styleProfile,
      tone: 'bg-sky-50 text-sky-700 ring-sky-200',
    },
    {
      Icon: Ruler,
      label: LENGTH_LABEL[m.lengthProfile] ?? m.lengthProfile,
      tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    },
    {
      Icon: Globe,
      label: LANG_LABEL[m.language] ?? m.language,
      tone: 'bg-amber-50 text-amber-700 ring-amber-200',
    },
  ];

  return (
    <Card
      className="overflow-hidden bg-gradient-to-br from-violet-50/40 via-white to-sky-50/40"
      bordered
    >
      <div className="px-5 pb-3 pt-4">
        <div className="flex items-start gap-3">
          <BrandLogo
            variant="icon"
            iconClassName="h-9 w-9"
            className="mt-0.5 flex-shrink-0"
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-bold leading-snug text-gray-900">
              {m.topic}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {fmtDate(m.generatedAt)}
              </span>
              <span>v{m.version}</span>
              {m.versionLabel && (
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                  {m.versionLabel}
                </span>
              )}
              {m.isIncremental && (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                  增量
                </span>
              )}
              {m.dimensionCount > 0 && (
                <span>{m.dimensionCount} 个研究维度</span>
              )}
              {m.modelTrail.length > 0 && (
                <span
                  className="font-mono truncate text-gray-400"
                  title={m.modelTrail.join(', ')}
                >
                  · 模型: {m.modelTrail.slice(0, 2).join(' / ')}
                  {m.modelTrail.length > 2
                    ? ` +${m.modelTrail.length - 2}`
                    : ''}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-px border-t border-gray-200 bg-gray-200 md:grid-cols-6">
        {cells.map((c) => (
          <div
            key={c.label}
            className="flex items-center gap-2 bg-white/80 px-3 py-2.5"
          >
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 ring-1 ring-violet-100">
              <c.Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                {c.label}
              </p>
              <p className="text-[15px] font-bold leading-tight text-gray-900">
                {c.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Tags */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 bg-white/60 px-5 py-2">
        {tags.map((t) => (
          <span
            key={t.label}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ring-1',
              t.tone
            )}
          >
            <t.Icon className="h-2.5 w-2.5" />
            {t.label}
          </span>
        ))}
      </div>
    </Card>
  );
}
