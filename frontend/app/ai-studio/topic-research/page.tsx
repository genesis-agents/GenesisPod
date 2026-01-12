'use client';

/**
 * Topic Research Page
 *
 * 专题研究列表页面
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n';
import { useTopicResearchStore } from '@/stores/topicResearchStore';
import {
  TopicCard,
  CreateTopicDialog,
  TopicDetail,
} from '@/components/topic-research';
import type { ResearchTopic } from '@/types/topic-research';
import { ResearchTopicType } from '@/types/topic-research';

// Icons
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

const FolderOpenIcon = ({ className }: { className?: string }) => (
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
      d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
    />
  </svg>
);

// Tab icons
const AllIcon = () => (
  <svg
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 6h16M4 10h16M4 14h16M4 18h16"
    />
  </svg>
);

const MacroIcon = () => (
  <svg
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const TechnologyIcon = () => (
  <svg
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
    />
  </svg>
);

const CompanyIcon = () => (
  <svg
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
    />
  </svg>
);

export default function TopicResearchPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const {
    topics,
    isLoadingTopics,
    error,
    fetchTopics,
    triggerRefresh,
    deleteTopic,
    clearError,
  } = useTopicResearchStore();

  const [activeType, setActiveType] = useState<ResearchTopicType | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<ResearchTopic | null>(
    null
  );

  // Topic type tabs with i18n
  const topicTypeTabs = [
    {
      type: null as ResearchTopicType | null,
      labelKey: 'topicResearch.tabs.all',
      icon: <AllIcon />,
    },
    {
      type: ResearchTopicType.MACRO,
      labelKey: 'topicResearch.tabs.macro',
      icon: <MacroIcon />,
    },
    {
      type: ResearchTopicType.TECHNOLOGY,
      labelKey: 'topicResearch.tabs.technology',
      icon: <TechnologyIcon />,
    },
    {
      type: ResearchTopicType.COMPANY,
      labelKey: 'topicResearch.tabs.company',
      icon: <CompanyIcon />,
    },
  ];

  // Load topics
  const loadTopics = useCallback(async () => {
    try {
      await fetchTopics({
        type: activeType || undefined,
        search: searchQuery || undefined,
      });
    } catch (err) {
      // Error is handled in store
    }
  }, [activeType, searchQuery, fetchTopics]);

  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  // Handle topic created
  const handleTopicCreated = (topic: ResearchTopic) => {
    setSelectedTopic(topic);
  };

  // Handle refresh
  const handleRefresh = async (topicId: string) => {
    try {
      await triggerRefresh(topicId);
    } catch (err) {
      // Error is already handled in store
    }
  };

  // Handle delete
  const handleDelete = async (topicId: string) => {
    if (!confirm(t('topicResearch.confirmDelete'))) return;
    try {
      await deleteTopic(topicId);
    } catch (err) {
      // Error is already handled in store
    }
  };

  // Ensure topics is always an array
  const topicsList = Array.isArray(topics) ? topics : [];

  // If a topic is selected, show detail view
  if (selectedTopic) {
    return (
      <TopicDetail
        topic={selectedTopic}
        onBack={() => {
          setSelectedTopic(null);
          loadTopics();
        }}
      />
    );
  }

  return (
    <div className="h-full overflow-auto bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/80 backdrop-blur-sm">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 shadow-lg shadow-blue-500/25">
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
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {t('topicResearch.title')}
                </h1>
                <p className="text-sm text-gray-500">
                  {t('topicResearch.subtitle')}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              <PlusIcon className="h-5 w-5" />
              {t('topicResearch.createTopic')}
            </button>
          </div>

          {/* Type Tabs */}
          <div className="mt-6 flex items-center gap-6 border-b border-gray-200">
            {topicTypeTabs.map((tab) => (
              <button
                key={tab.type || 'all'}
                onClick={() => setActiveType(tab.type)}
                className={`relative flex items-center gap-2 pb-3 text-sm font-medium transition-colors ${
                  activeType === tab.type
                    ? 'text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.icon}
                {t(tab.labelKey)}
                {activeType === tab.type && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                )}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="mt-6">
            <div className="relative">
              <SearchIcon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('topicResearch.searchPlaceholder')}
                className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-8 py-6">
        {/* Error */}
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-red-600">{error}</p>
              <button
                onClick={clearError}
                className="text-sm text-red-600 hover:underline"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoadingTopics ? (
          <div className="flex items-center justify-center py-20">
            <LoaderIcon className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : topicsList.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-20">
            <FolderOpenIcon className="h-16 w-16 text-gray-300" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">
              {searchQuery
                ? t('topicResearch.noMatchingTopics')
                : t('topicResearch.noTopics')}
            </h3>
            <p className="mt-1 text-gray-500">
              {searchQuery
                ? t('topicResearch.noMatchingTopicsDesc')
                : t('topicResearch.noTopicsDesc')}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setShowCreateDialog(true)}
                className="mt-6 flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700"
              >
                <PlusIcon className="h-5 w-5" />
                {t('topicResearch.createFirstTopic')}
              </button>
            )}
          </div>
        ) : (
          /* Topics Grid */
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {topicsList.map((topic) => (
              <TopicCard
                key={topic.id}
                topic={topic}
                onClick={() => setSelectedTopic(topic)}
                onRefresh={() => handleRefresh(topic.id)}
                onDelete={() => handleDelete(topic.id)}
              />
            ))}

            {/* Create New Card */}
            <button
              onClick={() => setShowCreateDialog(true)}
              className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white p-6 transition-colors hover:border-blue-400 hover:bg-blue-50"
            >
              <PlusIcon className="h-10 w-10 text-gray-400" />
              <span className="mt-2 text-sm font-medium text-gray-600">
                {t('topicResearch.createTopic')}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <CreateTopicDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreated={handleTopicCreated}
        defaultType={activeType || ResearchTopicType.MACRO}
      />
    </div>
  );
}
