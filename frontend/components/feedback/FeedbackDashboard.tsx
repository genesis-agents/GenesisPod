'use client';

import { useState } from 'react';
import {
  useFeedbackItems,
  usePendingReview,
  type ResearchFeedbackItemStatus,
  type ResearchFeedbackCategory,
  type FeedbackPriority,
  type ResearchFeedbackSource,
} from '@/hooks/domain/useResearchFeedback';
import {
  FeedbackStats,
  FeedbackTrendChart,
  CategoryBreakdown,
} from './FeedbackStats';
import { FeedbackItemCard } from './FeedbackItemCard';
import { FeedbackKnowledgePanel } from './FeedbackKnowledgePanel';
import {
  Filter,
  RefreshCw,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

type TabType = 'all' | 'pending' | 'applied' | 'knowledge';

interface FilterState {
  status?: ResearchFeedbackItemStatus;
  category?: ResearchFeedbackCategory;
  priority?: FeedbackPriority;
  sourceType?: ResearchFeedbackSource;
}

const statusOptions: { value: ResearchFeedbackItemStatus; label: string }[] = [
  { value: 'PENDING', label: '待处理' },
  { value: 'ANALYZING', label: '分析中' },
  { value: 'REVIEWING', label: '审核中' },
  { value: 'APPROVED', label: '已批准' },
  { value: 'REJECTED', label: '已拒绝' },
  { value: 'APPLIED', label: '已应用' },
  { value: 'CLOSED', label: '已关闭' },
];

const categoryOptions: { value: ResearchFeedbackCategory; label: string }[] = [
  { value: 'QUALITY_ISSUE', label: '质量问题' },
  { value: 'CONTENT_ERROR', label: '内容错误' },
  { value: 'FEATURE_REQUEST', label: '功能建议' },
  { value: 'IMPROVEMENT', label: '改进建议' },
  { value: 'POSITIVE', label: '正面反馈' },
];

const priorityOptions: { value: FeedbackPriority; label: string }[] = [
  { value: 'CRITICAL', label: '紧急' },
  { value: 'HIGH', label: '高' },
  { value: 'NORMAL', label: '普通' },
  { value: 'LOW', label: '低' },
];

const sourceOptions: { value: ResearchFeedbackSource; label: string }[] = [
  { value: 'REPORT_ANNOTATION', label: '报告批注' },
  { value: 'MANUAL', label: '手动提交' },
  { value: 'SYSTEM', label: '系统生成' },
];

export function FeedbackDashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [filters, setFilters] = useState<FilterState>({});
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [createKnowledgeForId, setCreateKnowledgeForId] = useState<
    string | undefined
  >();

  // 根据 tab 条件加载数据，避免同时请求两个数据源
  const shouldFetchAll = activeTab !== 'pending' && activeTab !== 'knowledge';
  const shouldFetchPending = activeTab === 'pending';

  const {
    data: allData,
    loading: allLoading,
    refresh: refreshAll,
  } = useFeedbackItems(
    { ...filters, page, limit: 20 },
    { enabled: shouldFetchAll }
  );

  const {
    data: pendingData,
    loading: pendingLoading,
    refresh: refreshPending,
  } = usePendingReview(page, 20, { enabled: shouldFetchPending });

  // 根据当前 tab 选择对应的数据
  const data = activeTab === 'pending' ? pendingData : allData;
  const loading = activeTab === 'pending' ? pendingLoading : allLoading;
  const refresh = activeTab === 'pending' ? refreshPending : refreshAll;

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setPage(1);
    setFilters({});
  };

  const handleFilterChange = (
    key: keyof FilterState,
    value: string | undefined
  ) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value || undefined,
    }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({});
    setPage(1);
  };

  const tabs = [
    { id: 'all' as const, label: '全部反馈' },
    { id: 'pending' as const, label: '待审核' },
    { id: 'applied' as const, label: '已应用' },
    { id: 'knowledge' as const, label: '知识库' },
  ];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <FeedbackStats />

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <FeedbackTrendChart />
        <CategoryBreakdown />
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between border-b">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {activeTab !== 'knowledge' && (
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1 rounded px-3 py-1.5 text-sm ${
                showFilters || Object.keys(filters).length > 0
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Filter className="h-4 w-4" />
              筛选
              {Object.keys(filters).length > 0 && (
                <span className="ml-1 rounded-full bg-blue-600 px-1.5 text-xs text-white">
                  {Object.keys(filters).length}
                </span>
              )}
            </button>
          )}
          <button
            onClick={() => refresh()}
            disabled={loading}
            className="flex items-center gap-1 rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            刷新
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && activeTab !== 'knowledge' && (
        <div className="flex flex-wrap items-center gap-4 rounded-lg bg-gray-50 p-4">
          <div>
            <label className="block text-xs text-gray-500">状态</label>
            <select
              value={filters.status || ''}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="mt-1 rounded border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="">全部</option>
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500">分类</label>
            <select
              value={filters.category || ''}
              onChange={(e) => handleFilterChange('category', e.target.value)}
              className="mt-1 rounded border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="">全部</option>
              {categoryOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500">优先级</label>
            <select
              value={filters.priority || ''}
              onChange={(e) => handleFilterChange('priority', e.target.value)}
              className="mt-1 rounded border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="">全部</option>
              {priorityOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500">来源</label>
            <select
              value={filters.sourceType || ''}
              onChange={(e) => handleFilterChange('sourceType', e.target.value)}
              className="mt-1 rounded border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="">全部</option>
              {sourceOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {Object.keys(filters).length > 0 && (
            <button
              onClick={clearFilters}
              className="mt-4 text-sm text-blue-600 hover:underline"
            >
              清除筛选
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {activeTab === 'knowledge' ? (
        <FeedbackKnowledgePanel
          feedbackIdForCreate={createKnowledgeForId}
          onCloseCreateModal={() => setCreateKnowledgeForId(undefined)}
        />
      ) : (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : data?.items && data.items.length > 0 ? (
            <div className="space-y-4">
              {data.items.map((item) => (
                <FeedbackItemCard
                  key={item.id}
                  item={item}
                  onUpdate={refresh}
                  onCreateKnowledge={(id) => {
                    setCreateKnowledgeForId(id);
                    setActiveTab('knowledge');
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center text-gray-500">
              <p>暂无反馈数据</p>
              <p className="text-xs">反馈将在用户提交批注或手动创建后显示</p>
            </div>
          )}

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between border-t pt-4">
              <div className="text-sm text-gray-500">
                共 {data.total} 条，第 {page}/{data.totalPages} 页
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1 rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                  上一页
                </button>
                <button
                  onClick={() =>
                    setPage((p) => Math.min(data.totalPages, p + 1))
                  }
                  disabled={page === data.totalPages}
                  className="flex items-center gap-1 rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                >
                  下一页
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Knowledge Modal */}
      {createKnowledgeForId && activeTab !== 'knowledge' && (
        <FeedbackKnowledgePanel
          feedbackIdForCreate={createKnowledgeForId}
          onCloseCreateModal={() => setCreateKnowledgeForId(undefined)}
        />
      )}
    </div>
  );
}
