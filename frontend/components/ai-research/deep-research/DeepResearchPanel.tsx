'use client';

/**
 * DeepResearchPanel - 深度研究面板
 *
 * 完整的深度研究 UI，包括：
 * 1. 查询输入
 * 2. 思考链可视化
 * 3. 研究报告展示
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Loader2,
  Microscope,
  FileText,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Copy,
  CheckCircle2,
  AlertCircle,
  X,
  Brain,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import { useDeepResearch, DeepResearchReport } from '@/hooks';
import ThinkingChainPanel from './ThinkingChainPanel';

interface DeepResearchPanelProps {
  projectId: string;
  onReportGenerated?: (report: DeepResearchReport) => void;
  className?: string;
  /** 初始查询，设置后自动开始研究 */
  initialQuery?: string;
}

export function DeepResearchPanel({
  projectId,
  onReportGenerated,
  className,
  initialQuery,
}: DeepResearchPanelProps) {
  const [query, setQuery] = useState(initialQuery || '');
  const [showThinking, setShowThinking] = useState(true);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [hasAutoStarted, setHasAutoStarted] = useState(false);

  const { state, startResearch, stop, reset, isSearching } = useDeepResearch(
    projectId,
    {
      onComplete: (report) => {
        onReportGenerated?.(report);
      },
      onError: (error) => {
        console.error('Deep Research error:', error);
      },
    }
  );

  // 自动开始研究（当有 initialQuery 时）
  React.useEffect(() => {
    if (
      initialQuery &&
      initialQuery.trim() &&
      !hasAutoStarted &&
      !isSearching
    ) {
      setQuery(initialQuery);
      setHasAutoStarted(true);
      startResearch(initialQuery, {
        depth: 'standard',
        includeAcademic: true,
        language: 'zh-CN',
      });
    }
  }, [initialQuery, hasAutoStarted, isSearching, startResearch]);

  const handleStartResearch = useCallback(async () => {
    if (!query.trim() || isSearching) return;
    await startResearch(query, {
      depth: 'standard',
      includeAcademic: true,
      language: 'zh-CN',
    });
  }, [query, isSearching, startResearch]);

  const handleCopySection = useCallback((content: string, section: string) => {
    navigator.clipboard.writeText(content);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  }, []);

  return (
    <div className={cn('flex flex-col', className)}>
      {/* 查询输入区域 */}
      <div className="border-b bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Microscope className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-purple-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleStartResearch()}
              placeholder="输入研究主题，开始深度研究..."
              disabled={isSearching}
              className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:bg-gray-50"
            />
          </div>
          {isSearching ? (
            <button
              onClick={stop}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700"
            >
              <X className="h-4 w-4" />
              停止
            </button>
          ) : (
            <button
              onClick={handleStartResearch}
              disabled={!query.trim()}
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
            >
              <Search className="h-4 w-4" />
              深度研究
            </button>
          )}
        </div>
        {state.phase !== 'idle' && (
          <div className="mt-2 flex items-center justify-between">
            <button
              onClick={() => setShowThinking(!showThinking)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              <Brain className="h-3.5 w-3.5" />
              {showThinking ? '隐藏思考过程' : '显示思考过程'}
              {showThinking ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
            {state.phase === 'completed' && (
              <button
                onClick={reset}
                className="text-xs text-purple-600 hover:text-purple-700"
              >
                开始新研究
              </button>
            )}
          </div>
        )}
      </div>

      {/* 内容区域 */}
      <div className="flex flex-1 gap-4 overflow-hidden p-4">
        {/* 思考链面板 */}
        <AnimatePresence>
          {showThinking && state.phase !== 'idle' && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="flex-shrink-0 overflow-hidden"
            >
              <ThinkingChainPanel state={state} className="h-full" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* 报告区域 */}
        <div className="flex-1 overflow-auto">
          {state.phase === 'idle' ? (
            <EmptyState />
          ) : state.report ? (
            <ReportView
              report={state.report}
              copiedSection={copiedSection}
              onCopySection={handleCopySection}
            />
          ) : (
            <StreamingReport
              reportContent={state.reportContent}
              phase={state.phase}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// 空状态
function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-gray-400">
      <Microscope className="mb-4 h-16 w-16" />
      <h3 className="mb-2 text-lg font-medium text-gray-600">深度研究</h3>
      <p className="max-w-sm text-center text-sm">
        输入研究主题，AI 将进行多轮迭代搜索，自动规划研究路径，
        并生成带引用的专业研究报告。
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {['AI 发展趋势', '量子计算应用', '气候变化影响', '可持续能源'].map(
          (topic) => (
            <span
              key={topic}
              className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600"
            >
              {topic}
            </span>
          )
        )}
      </div>
    </div>
  );
}

// 流式报告内容
function StreamingReport({
  reportContent,
  phase,
}: {
  reportContent: Record<string, string>;
  phase: string;
}) {
  const sections = Object.entries(reportContent);

  if (sections.length === 0 && phase !== 'synthesizing') {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-purple-500" />
          <p className="text-sm text-gray-500">正在收集和分析信息...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-lg bg-white p-6 shadow-sm">
      {sections.map(([section, content]) => (
        <div key={section}>
          <h3 className="mb-2 text-lg font-semibold text-gray-900">
            {section === 'executive_summary'
              ? '执行摘要'
              : section === 'conclusion'
                ? '结论'
                : section}
          </h3>
          <div className="prose prose-sm max-w-none text-gray-700">
            {content}
            {phase === 'synthesizing' && (
              <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-purple-500" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// 完整报告视图
function ReportView({
  report,
  copiedSection,
  onCopySection,
}: {
  report: DeepResearchReport;
  copiedSection: string | null;
  onCopySection: (content: string, section: string) => void;
}) {
  const [expandedRefs, setExpandedRefs] = useState(false);

  return (
    <div className="space-y-6 rounded-lg bg-white p-6 shadow-sm">
      {/* 元数据 */}
      <div className="flex flex-wrap gap-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
        <span>来源: {report.metadata.totalSources} 个</span>
        <span>搜索轮次: {report.metadata.searchRounds}</span>
        <span>耗时: {report.metadata.duration.toFixed(1)}s</span>
      </div>

      {/* 执行摘要 */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">执行摘要</h2>
          <CopyButton
            content={report.executiveSummary}
            section="summary"
            copied={copiedSection === 'summary'}
            onCopy={onCopySection}
          />
        </div>
        <p className="leading-relaxed text-gray-700">
          {report.executiveSummary}
        </p>
      </section>

      {/* 主体章节 */}
      {report.sections.map((section, index) => (
        <section key={index}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {section.title}
            </h2>
            <CopyButton
              content={section.content}
              section={`section-${index}`}
              copied={copiedSection === `section-${index}`}
              onCopy={onCopySection}
            />
          </div>
          <div className="prose prose-sm max-w-none text-gray-700">
            {formatContentWithCitations(section.content, section.citations)}
          </div>
        </section>
      ))}

      {/* 结论 */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">结论</h2>
          <CopyButton
            content={report.conclusion}
            section="conclusion"
            copied={copiedSection === 'conclusion'}
            onCopy={onCopySection}
          />
        </div>
        <p className="leading-relaxed text-gray-700">{report.conclusion}</p>
      </section>

      {/* 参考文献 */}
      <section className="border-t pt-6">
        <button
          onClick={() => setExpandedRefs(!expandedRefs)}
          className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900"
        >
          <FileText className="h-5 w-5" />
          参考文献 ({report.references.length})
          {expandedRefs ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
        <AnimatePresence>
          {expandedRefs && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="space-y-2 overflow-hidden"
            >
              {report.references.map((ref) => (
                <div
                  key={ref.id}
                  className="flex items-start gap-2 rounded bg-gray-50 p-2"
                >
                  <span className="flex-shrink-0 rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700">
                    [{ref.id}]
                  </span>
                  <div className="min-w-0 flex-1">
                    <a
                      href={ref.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
                    >
                      {ref.title}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <p className="mt-1 line-clamp-2 text-xs text-gray-500">
                      {ref.snippet}
                    </p>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}

// 复制按钮
function CopyButton({
  content,
  section,
  copied,
  onCopy,
}: {
  content: string;
  section: string;
  copied: boolean;
  onCopy: (content: string, section: string) => void;
}) {
  return (
    <button
      onClick={() => onCopy(content, section)}
      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
    >
      {copied ? (
        <>
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          已复制
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          复制
        </>
      )}
    </button>
  );
}

// 格式化带引用的内容
function formatContentWithCitations(
  content: string,
  citations: number[]
): React.ReactNode {
  // 简单处理：高亮引用标记
  const parts = content.split(/(\[\d+\])/g);
  return parts.map((part, index) => {
    if (/^\[\d+\]$/.test(part)) {
      const num = parseInt(part.slice(1, -1));
      if (citations.includes(num)) {
        return (
          <sup
            key={index}
            className="cursor-pointer text-purple-600 hover:underline"
          >
            {part}
          </sup>
        );
      }
    }
    return part;
  });
}

export default DeepResearchPanel;
