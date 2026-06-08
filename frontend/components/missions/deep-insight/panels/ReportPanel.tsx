'use client';

/**
 * ReportPanel — 报告正文 markdown 渲染（下沉自公司 MissionReportView report tab）。
 *
 * 吃归一契约 report?: string（markdown）。这是「简版」报告面板，company / playground
 * 一致；playground 若要保留三视图（ArtifactReader）走 L4 的富 artifact 旁路 slot，
 * 不经由本面板。
 */

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { EmptyState } from '@/components/ui/states';
import { createMarkdownComponents } from '@/lib/markdown/createMarkdownComponents';

export interface ReportPanelProps {
  report?: string;
}

export function ReportPanel({ report }: ReportPanelProps) {
  const mdComponents = useMemo(() => createMarkdownComponents((t) => t), []);
  if (!report || !report.trim()) {
    return (
      <EmptyState
        type="default"
        size="sm"
        title="无报告正文"
        description="该任务未生成可展示的报告内容"
      />
    );
  }
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm leading-relaxed text-gray-800">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {report}
      </ReactMarkdown>
    </div>
  );
}

export default ReportPanel;
