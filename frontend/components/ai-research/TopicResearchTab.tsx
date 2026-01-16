'use client';

/**
 * Topic Research Tab Component
 *
 * 专题研究 TAB 组件，用于内嵌在 AI Studio 页面中
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/lib/i18n';
import { useTopicResearchStore } from '@/stores/topicResearchStore';
import { TopicCard } from './TopicCard';
import { CreateTopicDialog } from './CreateTopicDialog';
import { TopicDetail } from './TopicDetail';
import { TopicSharingModal } from './TopicSharingModal';
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

interface TopicResearchTabProps {
  activeType: ResearchTopicType | null;
  searchQuery: string;
  showCreateDialog: boolean;
  onShowCreateDialog: (show: boolean) => void;
  onDetailViewChange?: (isDetailView: boolean) => void;
  /** ★ 初始选中的主题ID（用于分享链接跳转） */
  initialTopicId?: string | null;
}

export function TopicResearchTab({
  activeType,
  searchQuery,
  showCreateDialog,
  onShowCreateDialog,
  onDetailViewChange,
  initialTopicId,
}: TopicResearchTabProps) {
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

  const [selectedTopic, setSelectedTopic] = useState<ResearchTopic | null>(
    null
  );
  const [sharingTopic, setSharingTopic] = useState<ResearchTopic | null>(null);

  // Notify parent when detail view changes
  useEffect(() => {
    onDetailViewChange?.(selectedTopic !== null);
  }, [selectedTopic, onDetailViewChange]);

  // Ensure topics is always an array
  const topicsList = Array.isArray(topics) ? topics : [];

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

  // ★ 处理初始主题ID（分享链接跳转）
  useEffect(() => {
    if (initialTopicId && topicsList.length > 0 && !selectedTopic) {
      const topic = topicsList.find((t) => t.id === initialTopicId);
      if (topic) {
        setSelectedTopic(topic);
      }
    }
  }, [initialTopicId, topicsList, selectedTopic]);

  // Handle topic created
  const handleTopicCreated = (topic: ResearchTopic) => {
    setSelectedTopic(topic);
    onShowCreateDialog(false);
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
    <>
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
              onClick={() => onShowCreateDialog(true)}
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
              onShare={() => setSharingTopic(topic)}
            />
          ))}

          {/* Create New Card */}
          <button
            onClick={() => onShowCreateDialog(true)}
            className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white p-6 transition-colors hover:border-blue-400 hover:bg-blue-50"
          >
            <PlusIcon className="h-10 w-10 text-gray-400" />
            <span className="mt-2 text-sm font-medium text-gray-600">
              {t('topicResearch.createTopic')}
            </span>
          </button>
        </div>
      )}

      {/* Create Dialog */}
      <CreateTopicDialog
        isOpen={showCreateDialog}
        onClose={() => onShowCreateDialog(false)}
        onCreated={handleTopicCreated}
        defaultType={activeType || ResearchTopicType.MACRO}
      />

      {/* Sharing Modal */}
      {sharingTopic && (
        <TopicSharingModal
          topicId={sharingTopic.id}
          topicName={sharingTopic.name}
          isOpen={!!sharingTopic}
          onClose={() => setSharingTopic(null)}
        />
      )}
    </>
  );
}
