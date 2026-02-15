'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  FileText,
  Copy,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  BookOpen,
  Download,
  Search,
  Clock,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import { ExportDialog } from '@/components/common/ExportDialog';
import { useTranslation } from '@/lib/i18n';
import type { DeepResearchReport, ReportReference } from '@/hooks';

// ==================== Types ====================

interface ReportPanelProps {
  report: DeepResearchReport | null;
  isStreaming?: boolean;
  streamingContent?: Record<string, string>;
  projectId: string;
  sessionId?: string | null;
  className?: string;
}

// ==================== Main Component ====================

export function ReportPanel({
  report,
  isStreaming = false,
  streamingContent = {},
  projectId,
  sessionId,
  className,
}: ReportPanelProps) {
  const { t } = useTranslation();
  const [showExport, setShowExport] = useState(false);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [expandedRefs, setExpandedRefs] = useState(true);
  const [highlightedRef, setHighlightedRef] = useState<number | null>(null);
  const [highlightedQuote, setHighlightedQuote] = useState<string | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

  const scheduleTimer = useCallback((fn: () => void, delay: number) => {
    const timer = setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== timer);
      fn();
    }, delay);
    timersRef.current.push(timer);
    return timer;
  }, []);

  const handleCopySection = useCallback(
    (content: string, section: string) => {
      navigator.clipboard.writeText(content);
      setCopiedSection(section);
      scheduleTimer(() => setCopiedSection(null), 2000);
    },
    [scheduleTimer]
  );

  const handleCitationClick = useCallback(
    (refId: number, surroundingContext?: string) => {
      if (!expandedRefs) {
        setExpandedRefs(true);
      }
      setHighlightedQuote(surroundingContext || null);
      scheduleTimer(
        () => {
          const refElement = document.getElementById(`ref-${refId}`);
          if (refElement) {
            refElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightedRef(refId);
            scheduleTimer(() => {
              setHighlightedRef(null);
              setHighlightedQuote(null);
            }, 5000);
          }
        },
        expandedRefs ? 0 : 300
      );
    },
    [expandedRefs, scheduleTimer]
  );

  // Empty State
  if (!report && !isStreaming) {
    return (
      <div
        className={cn(
          'flex h-full flex-col items-center justify-center',
          className
        )}
      >
        <div className="mb-4 rounded-2xl bg-purple-50 p-4">
          <FileText className="h-12 w-12 text-purple-500" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-gray-900">
          {t('aiResearch.deepResearch.report.noReport') || 'No report yet'}
        </h3>
        <p className="max-w-md text-center text-gray-500">
          {t('aiResearch.deepResearch.report.noReportDescription') ||
            'Start a research discussion to generate a comprehensive report'}
        </p>
      </div>
    );
  }

  // Streaming State
  if (isStreaming || !report) {
    const sections = Object.entries(streamingContent);

    if (sections.length === 0) {
      return (
        <div
          className={cn(
            'flex h-full flex-col items-center justify-center',
            className
          )}
        >
          <Loader2 className="mb-4 h-10 w-10 animate-spin text-purple-500" />
          <p className="text-gray-500">
            {t('aiResearch.deepResearch.streaming.collecting') ||
              'Collecting information...'}
          </p>
          <p className="mt-1 text-sm text-gray-400">
            {t('aiResearch.deepResearch.streaming.executing') ||
              'Research in progress'}
          </p>
        </div>
      );
    }

    return (
      <div className={cn('space-y-8', className)}>
        {sections.map(([section, content]) => (
          <div key={section} className="rounded-xl border bg-white p-6">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-gray-900">
              {getSectionIcon(section)}
              {getSectionTitle(section, t)}
            </h2>
            <div className="whitespace-pre-wrap leading-relaxed text-gray-700">
              {content}
              <span className="ml-1 inline-block h-5 w-2 animate-pulse bg-purple-500" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Completed Report View
  return (
    <div className={cn('space-y-8', className)}>
      {/* Report Header */}
      <div className="overflow-hidden rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 p-6 text-white">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/20 p-3">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">
                {t('aiResearch.deepResearch.report.title') || 'Research Report'}
              </h1>
              <div className="mt-2 flex flex-wrap gap-4 text-sm text-purple-100">
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  {t('aiResearch.deepResearch.report.sourcesCount', {
                    count: report.metadata.totalSources,
                  }) || `${report.metadata.totalSources} sources`}
                </span>
                <span className="flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  {t('aiResearch.deepResearch.report.searchRounds', {
                    count: report.metadata.searchRounds,
                  }) || `${report.metadata.searchRounds} rounds`}
                </span>
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  {t('aiResearch.deepResearch.report.duration', {
                    duration: report.metadata.duration.toFixed(1),
                  }) || `${report.metadata.duration.toFixed(1)}s`}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowExport(true)}
            className="flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/30"
          >
            <Download className="h-4 w-4" />
            {t('common.export') || 'Export'}
          </button>
        </div>
      </div>

      {/* Executive Summary */}
      <section className="rounded-xl border bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <Sparkles className="h-5 w-5 text-purple-500" />
            {t('aiResearch.deepResearch.report.executiveSummary') ||
              'Executive Summary'}
          </h2>
          <CopyButton
            content={report.executiveSummary}
            section="summary"
            copied={copiedSection === 'summary'}
            onCopy={handleCopySection}
          />
        </div>
        <div className="prose prose-purple max-w-none leading-relaxed text-gray-700">
          {formatContentWithCitations(
            report.executiveSummary,
            [],
            handleCitationClick,
            report.references
          )}
        </div>
      </section>

      {/* Main Sections */}
      {report.sections.map((section, index) => (
        <section key={index} className="rounded-xl border bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">{section.title}</h2>
            <CopyButton
              content={section.content}
              section={`section-${index}`}
              copied={copiedSection === `section-${index}`}
              onCopy={handleCopySection}
            />
          </div>
          <div className="prose prose-purple max-w-none">
            {formatContentWithCitations(
              section.content,
              section.citations,
              handleCitationClick,
              report.references
            )}
          </div>
        </section>
      ))}

      {/* Conclusion */}
      <section className="rounded-xl border bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            {t('aiResearch.deepResearch.report.conclusion') || 'Conclusion'}
          </h2>
          <CopyButton
            content={report.conclusion}
            section="conclusion"
            copied={copiedSection === 'conclusion'}
            onCopy={handleCopySection}
          />
        </div>
        <div className="prose prose-purple max-w-none leading-relaxed text-gray-700">
          {formatContentWithCitations(
            report.conclusion,
            [],
            handleCitationClick,
            report.references
          )}
        </div>
      </section>

      {/* References */}
      <section className="rounded-xl bg-gray-50 p-6">
        <button
          onClick={() => setExpandedRefs(!expandedRefs)}
          className="flex w-full items-center justify-between"
        >
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <FileText className="h-5 w-5 text-gray-500" />
            {t('aiResearch.deepResearch.report.references') || 'References'} (
            {report.references.length})
          </h2>
          {expandedRefs ? (
            <ChevronUp className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          )}
        </button>
        {expandedRefs && (
          <div className="mt-4 space-y-2">
            {report.references.map((ref) => {
              const isHighlighted = highlightedRef === ref.id;
              return (
                <div
                  key={ref.id}
                  id={`ref-${ref.id}`}
                  className={cn(
                    'rounded-lg border transition-all duration-300',
                    isHighlighted
                      ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-300 ring-offset-2'
                      : 'bg-white'
                  )}
                >
                  <div className="flex items-start gap-3 p-3">
                    <span className="flex-shrink-0 rounded bg-purple-600 px-2 py-0.5 text-xs font-bold text-white">
                      [{ref.id}]
                    </span>
                    <div className="min-w-0 flex-1">
                      <a
                        href={ref.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
                      >
                        <span className="line-clamp-1">{ref.title}</span>
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                      </a>
                      {ref.snippet && (
                        <div className="mt-2 text-xs leading-relaxed text-gray-600">
                          {isHighlighted && highlightedQuote ? (
                            <HighlightedSnippet
                              snippet={ref.snippet}
                              quote={highlightedQuote}
                            />
                          ) : (
                            <p className="line-clamp-3">{ref.snippet}</p>
                          )}
                        </div>
                      )}
                      {isHighlighted && ref.snippet && (
                        <div className="mt-2 border-t border-purple-200 pt-2">
                          <p className="text-xs italic text-purple-600">
                            {t('aiResearch.deepResearch.report.clickToJump') ||
                              'Click citation to jump here'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Export Dialog */}
      {sessionId && (
        <ExportDialog
          isOpen={showExport}
          onClose={() => setShowExport(false)}
          contentSelector="[data-export-content='research']"
          contentTitle="Research Report"
          moduleType="research"
          sourceId={sessionId}
          availableFormats={['PDF', 'DOCX', 'PPTX', 'HTML']}
        />
      )}
    </div>
  );
}

// ==================== Sub Components ====================

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
  const { t } = useTranslation();
  return (
    <button
      onClick={() => onCopy(content, section)}
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
    >
      {copied ? (
        <>
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          {t('aiResearch.deepResearch.copy.copied') || 'Copied'}
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" />
          {t('aiResearch.deepResearch.copy.copy') || 'Copy'}
        </>
      )}
    </button>
  );
}

function HighlightedSnippet({
  snippet,
  quote,
}: {
  snippet: string;
  quote: string;
}) {
  const cleanQuote = quote
    .replace(/\[[\d,\s]+\]/g, '')
    .replace(/\[资料\s*[\d,、\s]+\]/g, '')
    .replace(/CITE_GROUP_\d+(?:_\d+)*/g, '')
    .trim()
    .slice(0, 50);

  const lowerSnippet = snippet.toLowerCase();
  const lowerQuote = cleanQuote.toLowerCase();
  const matchIndex = lowerSnippet.indexOf(lowerQuote);

  if (matchIndex === -1 || cleanQuote.length < 10) {
    return (
      <p className="animate-pulse rounded bg-yellow-100 px-1">{snippet}</p>
    );
  }

  const before = snippet.slice(0, matchIndex);
  const highlighted = snippet.slice(matchIndex, matchIndex + cleanQuote.length);
  const after = snippet.slice(matchIndex + cleanQuote.length);

  return (
    <p>
      {before}
      <span className="animate-pulse rounded bg-yellow-200 px-0.5 font-medium text-gray-900">
        {highlighted}
      </span>
      {after}
    </p>
  );
}

function DeepCitationLink({
  sourceIndex,
  sourceTitle,
  sourceSnippet,
  onClick,
}: {
  sourceIndex: number;
  sourceTitle?: string;
  sourceSnippet?: string;
  onClick?: () => void;
}) {
  const { t } = useTranslation();
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const preview = sourceSnippet
    ? sourceSnippet.length > 150
      ? sourceSnippet.slice(0, 150) + '...'
      : sourceSnippet
    : null;

  return (
    <span className="relative inline">
      <sup
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClick?.();
        }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="mx-0.5 cursor-pointer rounded px-0.5 font-medium text-purple-600 transition-all hover:bg-purple-100 hover:text-purple-800"
        title={`${t('aiResearch.deepResearch.report.clickToJump') || 'Click to jump'} [${sourceIndex}]`}
      >
        [{sourceIndex}]
      </sup>

      {showTooltip && sourceTitle && (
        <div
          ref={tooltipRef}
          className="absolute bottom-full left-1/2 z-50 mb-2 w-72 -translate-x-1/2 rounded-lg border border-gray-200 bg-white shadow-xl"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <div className="flex items-start gap-2 border-b border-gray-100 px-3 py-2">
            <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-purple-100">
              <FileText className="h-3.5 w-3.5 text-purple-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="rounded bg-purple-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {sourceIndex}
                </span>
                <span className="truncate text-sm font-medium text-gray-900">
                  {sourceTitle}
                </span>
              </div>
            </div>
          </div>

          {preview && (
            <div className="px-3 py-2">
              <p className="text-xs leading-relaxed text-gray-600">{preview}</p>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-3 py-1.5">
            <span className="text-[10px] text-gray-400">
              {t('aiResearch.deepResearch.report.clickToView') ||
                'Click to view full'}
            </span>
            <ExternalLink className="h-3 w-3 text-gray-400" />
          </div>

          <div className="absolute left-1/2 top-full -translate-x-1/2">
            <div className="h-2 w-2 -translate-y-1 rotate-45 border-b border-r border-gray-200 bg-gray-50" />
          </div>
        </div>
      )}
    </span>
  );
}

// ==================== Helpers ====================

type TranslateFunction = (
  key: string,
  params?: Record<string, string | number>
) => string;

function getSectionIcon(section: string) {
  if (section.includes('summary') || section.includes('摘要')) {
    return <Sparkles className="h-5 w-5 text-purple-500" />;
  }
  if (section.includes('conclusion') || section.includes('结论')) {
    return <CheckCircle2 className="h-5 w-5 text-green-500" />;
  }
  return <FileText className="h-5 w-5 text-gray-400" />;
}

function getSectionTitle(section: string, t: TranslateFunction): string {
  if (section === 'executive_summary' || section.includes('摘要')) {
    return (
      t('aiResearch.deepResearch.report.executiveSummary') ||
      'Executive Summary'
    );
  }
  if (section === 'conclusion' || section.includes('结论')) {
    return t('aiResearch.deepResearch.report.conclusion') || 'Conclusion';
  }
  return section;
}

function formatContentWithCitations(
  content: string,
  citations: number[],
  onCitationClick?: (refId: number, surroundingContext?: string) => void,
  references?: ReportReference[]
): React.ReactNode {
  const pattern =
    /(\[(\d+(?:\s*,\s*\d+)*)\]|\[资料\s*(\d+(?:\s*[,、]\s*\d+)*)\]|CITE_GROUP_(\d+(?:_\d+)*))/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }

    let indices: number[];
    if (match[2]) {
      indices = match[2].split(/\s*,\s*/).map((s) => parseInt(s, 10));
    } else if (match[3]) {
      indices = match[3].split(/\s*[,、]\s*/).map((s) => parseInt(s, 10));
    } else if (match[4]) {
      indices = match[4].split('_').map((s) => parseInt(s, 10));
    } else {
      parts.push(match[0]);
      lastIndex = match.index + match[0].length;
      continue;
    }

    const contextStart = Math.max(0, match.index - 80);
    const contextEnd = Math.min(
      content.length,
      match.index + match[0].length + 80
    );
    let surroundingContext = content.slice(contextStart, contextEnd);
    surroundingContext = surroundingContext
      .replace(/\[[\d,\s]+\]/g, '')
      .replace(/\[资料\s*[\d,、\s]+\]/g, '')
      .replace(/CITE_GROUP_\d+(?:_\d+)*/g, '')
      .trim();

    indices.forEach((num) => {
      const shouldShow = citations.length === 0 || citations.includes(num);
      if (shouldShow) {
        const reference = references?.find((r) => r.id === num);
        parts.push(
          <DeepCitationLink
            key={`${match!.index}-${num}`}
            sourceIndex={num}
            sourceTitle={reference?.title}
            sourceSnippet={reference?.snippet}
            onClick={() => onCitationClick?.(num, surroundingContext)}
          />
        );
      }
    });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts.length === 0 ? content : parts;
}
