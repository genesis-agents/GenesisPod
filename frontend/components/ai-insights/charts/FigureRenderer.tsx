'use client';

/**
 * FigureRenderer - 图表/图片渲染组件
 *
 * 支持两种类型：
 * 1. reference: 引用原始证据中的图表/图片（显示图片）
 * 2. generated: AI 根据数据生成的图表（使用 Recharts）
 *
 * @version 3.1 - 添加错误边界、类型验证、加载状态
 */

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { ImageOff, ZoomIn, Loader2, AlertTriangle } from 'lucide-react';
import type { ReportChart } from '@/types/topic-insights';
import { ReportChartRenderer } from './ReportChartRenderer';
import { ChartErrorBoundary } from './ChartErrorBoundary';
import { useI18n } from '@/lib/i18n';

interface FigureRendererProps {
  /** 图表/图片数据 */
  chart: ReportChart;
  /** 额外的 CSS 类名 */
  className?: string;
  /** 是否显示来源信息 */
  showSource?: boolean;
  /** 是否允许点击放大 */
  allowZoom?: boolean;
  /** 点击引用索引时的回调 */
  onCitationClick?: (citationIndex: number) => void;
  /** 重试回调 */
  onRetry?: () => void;
}

/**
 * 验证图表是否可以作为生成图表渲染
 */
function isValidGeneratedChart(chart: ReportChart): chart is ReportChart & {
  type: NonNullable<ReportChart['type']>;
  data: NonNullable<ReportChart['data']>;
} {
  return (
    chart.type !== undefined &&
    chart.data !== undefined &&
    Array.isArray(chart.data) &&
    chart.data.length > 0
  );
}

/**
 * 生成描述性的 alt 文本
 */
function generateAltText(
  chart: ReportChart,
  t: (key: string) => string
): string {
  const parts: string[] = [];

  if (chart.title) {
    parts.push(chart.title);
  }

  if (chart.description) {
    parts.push(chart.description);
  }

  if (chart.type) {
    const typeKey = `topicResearch.charts.types.${chart.type}` as const;
    parts.push(t(typeKey));
  }

  if (chart.source) {
    parts.push(`${t('topicResearch.charts.source')} ${chart.source}`);
  }

  return parts.length > 0
    ? parts.join(' - ')
    : t('topicResearch.charts.types.chart');
}

/**
 * 引用图表渲染（显示图片）
 */
function ReferenceFigureRenderer({
  chart,
  showSource = true,
  allowZoom = true,
  onCitationClick,
}: Omit<FigureRendererProps, 'className' | 'onRetry'>) {
  const { t } = useI18n();
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [isZoomed, setIsZoomed] = useState(false);
  const isMountedRef = useRef(true);

  // 清理挂载状态
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleImageError = () => {
    if (isMountedRef.current) {
      setImageError(true);
      setImageLoading(false);
    }
  };

  const handleImageLoad = () => {
    if (isMountedRef.current) {
      setImageLoading(false);
    }
  };

  const handleCitationClick = () => {
    if (chart.evidenceCitationIndex && onCitationClick) {
      onCitationClick(chart.evidenceCitationIndex);
    }
  };

  const altText = generateAltText(chart, t);

  // 图片加载失败时显示占位符
  if (imageError || !chart.imageUrl) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8">
        <ImageOff className="h-12 w-12 text-gray-400" aria-hidden="true" />
        <p className="mt-2 text-sm text-gray-500">
          {t('topicResearch.charts.imageLoadFailed')}
        </p>
        {chart.title && (
          <p className="mt-1 text-xs text-gray-400">{chart.title}</p>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        {/* 加载状态指示器 */}
        {imageLoading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-gray-100">
            <Loader2
              className="h-8 w-8 animate-spin text-gray-400"
              aria-label={t('topicResearch.charts.loading')}
            />
          </div>
        )}

        {/* 图片 */}
        <div
          className={`relative overflow-hidden rounded-lg ${
            allowZoom ? 'cursor-zoom-in' : ''
          } ${imageLoading ? 'min-h-[200px]' : ''}`}
          onClick={() => allowZoom && !imageLoading && setIsZoomed(true)}
          role={allowZoom ? 'button' : undefined}
          tabIndex={allowZoom ? 0 : undefined}
          onKeyDown={(e) => {
            if (allowZoom && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              setIsZoomed(true);
            }
          }}
          aria-label={
            allowZoom
              ? `${t('topicResearch.charts.clickToZoom')}: ${altText}`
              : undefined
          }
        >
          <Image
            src={chart.imageUrl}
            alt={altText}
            width={800}
            height={450}
            className={`h-auto w-full object-contain transition-opacity ${
              imageLoading ? 'opacity-0' : 'opacity-100'
            }`}
            onError={handleImageError}
            onLoad={handleImageLoad}
            unoptimized // 外部图片不进行优化
          />
          {allowZoom && !imageLoading && (
            <div className="absolute bottom-2 right-2 rounded-full bg-black/50 p-1.5 text-white opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100">
              <ZoomIn className="h-4 w-4" aria-hidden="true" />
            </div>
          )}
        </div>

        {/* 标题和来源已由外层 FigureRenderer 统一渲染 */}
      </div>

      {/* 放大查看模态框 */}
      {isZoomed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setIsZoomed(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`${t('topicResearch.charts.clickToZoom')}: ${altText}`}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <Image
              src={chart.imageUrl}
              alt={altText}
              width={1200}
              height={800}
              className="max-h-[90vh] w-auto object-contain"
              unoptimized
            />
            <button
              onClick={() => setIsZoomed(false)}
              className="absolute -right-2 -top-2 rounded-full bg-white p-1 shadow-lg hover:bg-gray-100"
              aria-label={t('topicResearch.charts.closezoomView')}
            >
              <svg
                className="h-5 w-5 text-gray-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
            {chart.title && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                <p className="text-sm text-white">{chart.title}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * 图表数据不完整时的占位符
 */
function IncompleteChartPlaceholder({
  chart,
  onRetry,
}: {
  chart: ReportChart;
  onRetry?: () => void;
}) {
  const { t } = useI18n();

  const missingParts: string[] = [];
  if (!chart.type)
    missingParts.push(t('topicResearch.charts.missingChartType'));
  if (!chart.data || chart.data.length === 0)
    missingParts.push(t('topicResearch.charts.missingChartData'));

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-amber-300 bg-amber-50 p-8">
      <AlertTriangle className="h-10 w-10 text-amber-400" aria-hidden="true" />
      <p className="mt-2 text-sm text-amber-700">
        {t('topicResearch.charts.incompleteChartData')}
      </p>
      {chart.title && (
        <p className="mt-1 text-xs text-amber-600">{chart.title}</p>
      )}
      <p className="mt-2 max-w-xs text-center text-xs text-amber-500">
        {missingParts.join('、')}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 rounded-md bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-200"
        >
          {t('topicResearch.charts.regenerate')}
        </button>
      )}
    </div>
  );
}

/**
 * 无法识别的图表类型占位符
 */
function UnknownChartPlaceholder({ chart }: { chart: ReportChart }) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8">
      <ImageOff className="h-12 w-12 text-gray-400" aria-hidden="true" />
      <p className="mt-2 text-sm text-gray-500">
        {t('topicResearch.charts.cannotRenderChart')}
      </p>
      {chart.title && (
        <p className="mt-1 text-xs text-gray-400">{chart.title}</p>
      )}
      <p className="mt-1 text-xs text-gray-400">
        {t('topicResearch.charts.missingRequiredData')}
      </p>
    </div>
  );
}

/**
 * 生成学术规范的图表编号标签
 * APA/IEEE 格式: "图 N." / "Figure N."
 */
function getFigureLabel(figureNumber: number | undefined): string | null {
  if (!figureNumber) return null;
  return `图 ${figureNumber}.`;
}

/**
 * 主渲染组件
 *
 * SOTA 图表呈现规范（对标 APA/IEEE/McKinsey/BCG）：
 * - 编号: 全文顺序编号 "图 N."
 * - 标题: 编号 + 描述性标题
 * - 说明: caption 在图表下方
 * - 来源: 数据出处，关联引用编号
 */
export function FigureRenderer({
  chart,
  className = '',
  showSource = true,
  allowZoom = true,
  onCitationClick,
  onRetry,
}: FigureRendererProps) {
  // 判断图表类型 - 优先使用明确的 chartType
  const isReferenceChart =
    chart.chartType === 'reference' || (!chart.chartType && chart.imageUrl);

  const isGeneratedChart =
    chart.chartType === 'generated' ||
    (!chart.chartType &&
      !chart.imageUrl &&
      chart.data &&
      chart.data.length > 0);

  // 生成图表需要验证数据完整性
  const hasValidGeneratedData =
    isGeneratedChart && isValidGeneratedChart(chart);

  const figureLabel = getFigureLabel(chart.figureNumber);

  return (
    <figure
      className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm ${className}`}
      role="figure"
      aria-label={figureLabel ? `${figureLabel} ${chart.title}` : chart.title}
    >
      {/* ★ SOTA: 图表编号 + 标题（图表上方，加粗编号 + 描述性标题） */}
      {(figureLabel || chart.title) && (
        <div className="mb-3 border-b border-gray-100 pb-2">
          <h5 className="text-sm font-semibold text-gray-900">
            {figureLabel && (
              <span className="mr-1 font-bold text-blue-700">
                {figureLabel}
              </span>
            )}
            {chart.title}
          </h5>
        </div>
      )}

      <ChartErrorBoundary chartTitle={chart.title} onRetry={onRetry}>
        {isReferenceChart ? (
          <ReferenceFigureRenderer
            chart={chart}
            showSource={showSource}
            allowZoom={allowZoom}
            onCitationClick={onCitationClick}
          />
        ) : isGeneratedChart ? (
          hasValidGeneratedData ? (
            <ReportChartRenderer chart={chart} />
          ) : (
            <IncompleteChartPlaceholder chart={chart} onRetry={onRetry} />
          )
        ) : (
          <UnknownChartPlaceholder chart={chart} />
        )}
      </ChartErrorBoundary>

      {/* ★ SOTA: 图表说明 + 来源标注（图表下方 caption） */}
      {(chart.description ||
        (showSource && (chart.evidenceCitationIndex || chart.source))) && (
        <figcaption className="mt-3 border-t border-gray-100 pt-2">
          {chart.description && (
            <p className="text-xs leading-relaxed text-gray-500">
              {chart.description}
            </p>
          )}
          {showSource && (chart.evidenceCitationIndex || chart.source) && (
            <div className="mt-1 flex items-center gap-1 text-xs text-gray-400">
              <span>Source:</span>
              {chart.source && (
                <span className="text-gray-500">{chart.source}</span>
              )}
              {chart.evidenceCitationIndex &&
                (onCitationClick ? (
                  <button
                    onClick={() =>
                      onCitationClick(chart.evidenceCitationIndex!)
                    }
                    className="inline-flex items-center rounded bg-blue-50 px-1 py-0.5 text-[10px] font-medium text-blue-600 transition-colors hover:bg-blue-100"
                    title={`Reference [${chart.evidenceCitationIndex}]`}
                  >
                    [{chart.evidenceCitationIndex}]
                  </button>
                ) : (
                  <a
                    href={`#ref-${chart.evidenceCitationIndex}`}
                    className="inline-flex items-center rounded bg-blue-50 px-1 py-0.5 text-[10px] font-medium text-blue-600 transition-colors hover:bg-blue-100"
                    title={`Reference [${chart.evidenceCitationIndex}]`}
                  >
                    [{chart.evidenceCitationIndex}]
                  </a>
                ))}
            </div>
          )}
        </figcaption>
      )}
    </figure>
  );
}

/**
 * 批量图表渲染组件
 */
export function FigureGallery({
  charts,
  className = '',
  columns = 2,
  onCitationClick,
  onRetry,
  showEmptyState = false,
  emptyStateMessage,
  isLoading = false,
}: {
  charts: ReportChart[];
  className?: string;
  columns?: 1 | 2 | 3;
  onCitationClick?: (citationIndex: number) => void;
  onRetry?: (chartId: string) => void;
  /** 是否显示空状态（默认隐藏） */
  showEmptyState?: boolean;
  /** 空状态提示信息 */
  emptyStateMessage?: string;
  /** 是否正在加载 */
  isLoading?: boolean;
}) {
  const { t } = useI18n();

  // 加载状态
  if (isLoading) {
    return (
      <div className={`flex items-center justify-center py-12 ${className}`}>
        <div className="text-center">
          <Loader2
            className="mx-auto h-8 w-8 animate-spin text-blue-500"
            aria-label={t('topicResearch.charts.loading')}
          />
          <p className="mt-2 text-sm text-gray-500">
            {t('topicResearch.charts.loadingCharts')}
          </p>
        </div>
      </div>
    );
  }

  // 空状态
  if (!charts || charts.length === 0) {
    if (!showEmptyState) {
      return null;
    }
    return (
      <div
        className={`flex items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 py-12 ${className}`}
      >
        <div className="text-center">
          <svg
            className="mx-auto h-10 w-10 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <p className="mt-2 text-sm text-gray-500">
            {emptyStateMessage || t('topicResearch.charts.noVisualizationData')}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {t('topicResearch.charts.chartsWillBeGenerated')}
          </p>
        </div>
      </div>
    );
  }

  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  };

  return (
    <div className={`grid gap-4 ${gridCols[columns]} ${className}`}>
      {charts.map((chart) => (
        <FigureRenderer
          key={chart.id}
          chart={chart}
          onCitationClick={onCitationClick}
          onRetry={onRetry ? () => onRetry(chart.id) : undefined}
        />
      ))}
    </div>
  );
}

export default FigureRenderer;
