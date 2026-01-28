'use client';

/**
 * AI Research - 专题研究页面
 * 直接显示 Topic Research 内容，无 Tab 切换
 *
 * ★ 使用 dynamic import + ssr: false 彻底避免 hydration 错误
 */

import { useState, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from '@/lib/i18n';
import { ResearchTopicType } from '@/types/topic-research';

// ★ 动态导入复杂组件，禁用 SSR 以避免 hydration 错误
const TopicResearchTab = dynamic(
  () =>
    import('@/components/ai-research').then((mod) => ({
      default: mod.TopicResearchTab,
    })),
  { ssr: false }
);

// ==================== 图标组件 ====================
const SearchIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
    />
  </svg>
);

const LoaderIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
    />
  </svg>
);

const PlusIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 4v16m8-8H4"
    />
  </svg>
);

// ==================== 主页面内容 ====================
function ResearchPageContent() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [topicActiveType, setTopicActiveType] =
    useState<ResearchTopicType | null>(null);
  const [showTopicCreateDialog, setShowTopicCreateDialog] = useState(false);

  return (
    <div className="h-full overflow-auto bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/50 backdrop-blur-sm">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/25">
                <svg
                  className="h-7 w-7 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {t('aiStudio.title')}
                </h1>
                <p className="text-sm text-gray-500">
                  {t('aiStudio.subtitle')}
                </p>
              </div>
            </div>

            {/* Create Button */}
            <button
              onClick={() => setShowTopicCreateDialog(true)}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-500/25 transition-all hover:shadow-xl hover:shadow-violet-500/30"
            >
              <PlusIcon className="h-5 w-5" />
              {t('aiStudio.actions.createNew')}
            </button>
          </div>

          {/* Search Bar */}
          <div className="mt-6">
            <div className="relative">
              <SearchIcon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('aiStudio.search.placeholder')}
                className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-4 text-sm outline-none transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Topic Research Content */}
      <div className="px-8 py-6">
        <TopicResearchTab
          activeType={topicActiveType}
          searchQuery={searchQuery}
          showCreateDialog={showTopicCreateDialog}
          onShowCreateDialog={setShowTopicCreateDialog}
        />
      </div>
    </div>
  );
}

// ==================== 主页面 ====================
export default function ResearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center bg-gray-50">
          <LoaderIcon className="h-8 w-8 animate-spin text-violet-600" />
        </div>
      }
    >
      <ResearchPageContent />
    </Suspense>
  );
}
