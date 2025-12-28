'use client';

/**
 * SourceBindingView - 素材绑定视图
 *
 * 功能：
 * 1. 显示素材分析结果（章节、数据点、洞见、引用）
 * 2. 显示幻灯片与素材的绑定关系
 * 3. 支持手动调整绑定
 * 4. 验证内容与素材的一致性
 *
 * API 调用：
 * - POST /api/ai-office/slides/{id}/analyze-source - 分析素材
 */

import React, { useState } from 'react';
import {
  FileText,
  Hash,
  Quote,
  Lightbulb,
  Link2,
  AlertTriangle,
  CheckCircle,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react';
import { useApiPost } from '@/hooks/core/useApi';

// ============================================
// 类型定义
// ============================================

interface DataPoint {
  id: string;
  value: string;
  type: 'percentage' | 'currency' | 'number' | 'date' | 'other';
  context: string;
  chapterId?: string;
}

interface ChapterInfo {
  id: string;
  title: string;
  keyPoints: string[];
  dataPointCount: number;
}

interface Insight {
  id: string;
  title: string;
  description: string;
}

interface QuoteItem {
  id: string;
  text: string;
  author?: string;
  source?: string;
}

interface SourceAnalysis {
  id: string;
  chapterCount: number;
  dataPointCount: number;
  insightCount: number;
  quoteCount: number;
  chapters: ChapterInfo[];
  dataPoints: DataPoint[];
  keyInsights: Insight[];
  quotes: QuoteItem[];
}

interface SlideBinding {
  slideIndex: number;
  slideTitle: string;
  boundChapterId?: string;
  boundChapterTitle?: string;
  dataPointsCovered: number;
  dataPointsTotal: number;
  coverageRate: number;
  hasIssues: boolean;
}

interface SourceBindingViewProps {
  pptId: string;
  sourceAnalysis?: SourceAnalysis;
  slideBindings?: SlideBinding[];
  onAnalyze?: () => void;
  className?: string;
}

// ============================================
// 主组件
// ============================================

export const SourceBindingView: React.FC<SourceBindingViewProps> = ({
  pptId,
  sourceAnalysis,
  slideBindings = [],
  onAnalyze,
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState<
    'chapters' | 'datapoints' | 'insights' | 'bindings'
  >('chapters');
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);

  const { execute: analyzeSource, loading: analyzing } = useApiPost(
    `/api/ai-office/slides/${pptId}/analyze-source`
  );

  const handleAnalyze = async () => {
    try {
      await analyzeSource({});
      onAnalyze?.();
    } catch (e) {
      console.error('Source analysis failed:', e);
    }
  };

  if (!sourceAnalysis) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="rounded-lg bg-gray-50 py-12 text-center dark:bg-gray-800">
          <FileText className="mx-auto mb-4 h-12 w-12 text-gray-400" />
          <h3 className="mb-2 text-lg font-medium text-gray-900 dark:text-white">
            暂无素材分析
          </h3>
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            分析原始素材以建立内容绑定关系
          </p>
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {analyzing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                分析中...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                开始分析
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      {/* 统计概览 */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <StatCard
          icon={<FileText className="h-5 w-5" />}
          label="章节"
          value={sourceAnalysis.chapterCount}
          color="blue"
        />
        <StatCard
          icon={<Hash className="h-5 w-5" />}
          label="数据点"
          value={sourceAnalysis.dataPointCount}
          color="green"
        />
        <StatCard
          icon={<Lightbulb className="h-5 w-5" />}
          label="洞见"
          value={sourceAnalysis.insightCount}
          color="yellow"
        />
        <StatCard
          icon={<Quote className="h-5 w-5" />}
          label="引用"
          value={sourceAnalysis.quoteCount}
          color="purple"
        />
      </div>

      {/* Tab 切换 */}
      <div className="mb-4 flex border-b dark:border-gray-700">
        {[
          {
            id: 'chapters',
            label: '章节结构',
            icon: <FileText className="h-4 w-4" />,
          },
          {
            id: 'datapoints',
            label: '数据点',
            icon: <Hash className="h-4 w-4" />,
          },
          {
            id: 'insights',
            label: '关键洞见',
            icon: <Lightbulb className="h-4 w-4" />,
          },
          {
            id: 'bindings',
            label: '绑定关系',
            icon: <Link2 className="h-4 w-4" />,
          },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2 transition-colors ${
              activeTab === tab.id
                ? 'border-blue-500 text-blue-500'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab.icon}
            <span className="text-sm">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      <div className="min-h-[300px]">
        {activeTab === 'chapters' && (
          <ChapterList
            chapters={sourceAnalysis.chapters}
            expandedId={expandedChapter}
            onToggle={setExpandedChapter}
          />
        )}

        {activeTab === 'datapoints' && (
          <DataPointList dataPoints={sourceAnalysis.dataPoints} />
        )}

        {activeTab === 'insights' && (
          <InsightList insights={sourceAnalysis.keyInsights} />
        )}

        {activeTab === 'bindings' && <BindingList bindings={slideBindings} />}
      </div>
    </div>
  );
};

// ============================================
// 子组件
// ============================================

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: 'blue' | 'green' | 'yellow' | 'purple';
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, color }) => {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-500 dark:bg-blue-900/20',
    green: 'bg-green-50 text-green-500 dark:bg-green-900/20',
    yellow: 'bg-yellow-50 text-yellow-500 dark:bg-yellow-900/20',
    purple: 'bg-purple-50 text-purple-500 dark:bg-purple-900/20',
  };

  return (
    <div className={`rounded-lg p-4 ${colorClasses[color]}`}>
      <div className="mb-1 flex items-center gap-2">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
};

interface ChapterListProps {
  chapters: ChapterInfo[];
  expandedId: string | null;
  onToggle: (id: string | null) => void;
}

const ChapterList: React.FC<ChapterListProps> = ({
  chapters,
  expandedId,
  onToggle,
}) => {
  if (chapters.length === 0) {
    return <p className="py-8 text-center text-gray-500">暂无章节数据</p>;
  }

  return (
    <div className="space-y-2">
      {chapters.map((chapter) => (
        <div
          key={chapter.id}
          className="overflow-hidden rounded-lg border dark:border-gray-700"
        >
          <button
            onClick={() =>
              onToggle(expandedId === chapter.id ? null : chapter.id)
            }
            className="flex w-full items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <div className="flex items-center gap-3">
              <FileText className="h-4 w-4 text-blue-500" />
              <span className="font-medium text-gray-900 dark:text-white">
                {chapter.title}
              </span>
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-700">
                {chapter.dataPointCount} 个数据点
              </span>
            </div>
            {expandedId === chapter.id ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </button>

          {expandedId === chapter.id && (
            <div className="border-t px-3 pb-3 dark:border-gray-700">
              <h4 className="mb-2 mt-3 text-xs font-medium uppercase text-gray-500">
                关键要点
              </h4>
              <ul className="space-y-1">
                {chapter.keyPoints.map((point, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
                  >
                    <span className="mt-1 text-blue-500">•</span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

interface DataPointListProps {
  dataPoints: DataPoint[];
}

const DataPointList: React.FC<DataPointListProps> = ({ dataPoints }) => {
  const typeLabels: Record<string, string> = {
    percentage: '百分比',
    currency: '金额',
    number: '数字',
    date: '日期',
    other: '其他',
  };

  const typeColors: Record<string, string> = {
    percentage:
      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    currency:
      'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    number: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    date: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    other: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  };

  if (dataPoints.length === 0) {
    return <p className="py-8 text-center text-gray-500">暂无数据点</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {dataPoints.map((dp) => (
        <div key={dp.id} className="rounded-lg border p-3 dark:border-gray-700">
          <div className="mb-2 flex items-center gap-2">
            <span
              className={`text-lg font-bold ${typeColors[dp.type]?.split(' ')[1] || 'text-gray-900'}`}
            >
              {dp.value}
            </span>
            <span
              className={`rounded px-2 py-0.5 text-xs ${typeColors[dp.type]}`}
            >
              {typeLabels[dp.type]}
            </span>
          </div>
          <p className="line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
            {dp.context}
          </p>
        </div>
      ))}
    </div>
  );
};

interface InsightListProps {
  insights: Insight[];
}

const InsightList: React.FC<InsightListProps> = ({ insights }) => {
  if (insights.length === 0) {
    return <p className="py-8 text-center text-gray-500">暂无洞见</p>;
  }

  return (
    <div className="space-y-3">
      {insights.map((insight) => (
        <div
          key={insight.id}
          className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20"
        >
          <div className="mb-2 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-yellow-500" />
            <h4 className="font-medium text-gray-900 dark:text-white">
              {insight.title}
            </h4>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {insight.description}
          </p>
        </div>
      ))}
    </div>
  );
};

interface BindingListProps {
  bindings: SlideBinding[];
}

const BindingList: React.FC<BindingListProps> = ({ bindings }) => {
  if (bindings.length === 0) {
    return <p className="py-8 text-center text-gray-500">暂无绑定关系</p>;
  }

  return (
    <div className="space-y-2">
      {bindings.map((binding) => (
        <div
          key={binding.slideIndex}
          className={`flex items-center justify-between rounded-lg border p-3 ${
            binding.hasIssues
              ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
              : 'border-gray-200 dark:border-gray-700'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded bg-gray-100 text-sm font-medium dark:bg-gray-700">
              {binding.slideIndex + 1}
            </span>
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                {binding.slideTitle}
              </div>
              {binding.boundChapterTitle && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Link2 className="h-3 w-3" />
                  绑定: {binding.boundChapterTitle}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* 数据点覆盖率 */}
            <div className="text-right">
              <div className="text-sm font-medium">
                {binding.dataPointsCovered}/{binding.dataPointsTotal}
              </div>
              <div className="text-xs text-gray-500">数据点覆盖</div>
            </div>

            {/* 覆盖率进度条 */}
            <div className="w-24">
              <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className={`h-full rounded-full ${
                    binding.coverageRate >= 80
                      ? 'bg-green-500'
                      : binding.coverageRate >= 50
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                  }`}
                  style={{ width: `${binding.coverageRate}%` }}
                />
              </div>
            </div>

            {/* 状态图标 */}
            {binding.hasIssues ? (
              <AlertTriangle className="h-5 w-5 text-red-500" />
            ) : (
              <CheckCircle className="h-5 w-5 text-green-500" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default SourceBindingView;
