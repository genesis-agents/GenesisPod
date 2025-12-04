'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useAiGroupStore } from '@/stores/aiGroupStore';
import { Topic, CreateTopicDto, UpdateTopicDto } from '@/types/ai-group';
import { useAIModels, AIModel } from '@/hooks/useAIModels';
import Sidebar from '@/components/layout/Sidebar';

export default function AIGroupPage() {
  const router = useRouter();
  const { user, accessToken, isLoading: authLoading } = useAuth();
  const {
    topics,
    isLoadingTopics,
    fetchTopics,
    createTopic,
    deleteTopic,
    updateTopic,
  } = useAiGroupStore();
  const { models: aiModels } = useAIModels();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const isAuthenticated = !!accessToken;

  // 查找模型：优先用 modelId 匹配（新方式），兼容旧数据
  const findModel = (aiModel: string) => {
    const models = aiModels || [];
    return (
      models.find((m) => m.modelId === aiModel) ||
      models.find((m) => m.modelName === aiModel) ||
      models.find((m) => m.id === aiModel)
    );
  };

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      fetchTopics();
    }
  }, [authLoading, isAuthenticated, fetchTopics]);

  // 过滤topics
  const filteredTopics = (topics || []).filter((topic) => {
    if (!searchQuery) return true;
    return (
      topic.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      topic.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  if (authLoading) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
          <svg
            className="h-16 w-16 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          <h2 className="text-xl font-semibold text-gray-700">
            Please sign in to access AI Group
          </h2>
          <p className="text-gray-500">
            Create and join discussion groups with AI assistants
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />

      <main className="flex-1 overflow-auto">
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
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">AI Group</h1>
                  <p className="text-sm text-gray-500">多人多AI协作讨论社区</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateDialog(true)}
                className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-700"
              >
                <svg
                  className="h-5 w-5"
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
                New Topic
              </button>
            </div>

            {/* Search Bar */}
            <div className="mt-6">
              <div className="relative">
                <svg
                  className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
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
                <input
                  type="text"
                  placeholder="搜索话题..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-4 text-sm outline-none transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Topic Grid */}
        <div className="px-8 py-6">
          {isLoadingTopics ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
            </div>
          ) : filteredTopics.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <svg
                className="h-16 w-16 text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-gray-700">
                No topics yet
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                Create your first topic to start collaborating
              </p>
              <button
                onClick={() => setShowCreateDialog(true)}
                className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Create Topic
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredTopics.map((topic) => (
                <TopicCard
                  key={topic.id}
                  topic={topic}
                  currentUserId={user?.id}
                  onClick={() => router.push(`/ai-group/${topic.id}`)}
                  onEdit={(topic) => {
                    setEditingTopic(topic);
                  }}
                  onDelete={async (topicId) => {
                    if (
                      confirm(
                        'Are you sure you want to delete this topic? This action cannot be undone.'
                      )
                    ) {
                      await deleteTopic(topicId);
                      await fetchTopics();
                    }
                  }}
                  findModel={findModel}
                />
              ))}

              {/* Create New Card */}
              <button
                onClick={() => setShowCreateDialog(true)}
                className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white p-6 transition-colors hover:border-blue-400 hover:bg-blue-50"
              >
                <svg
                  className="h-10 w-10 text-gray-400"
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
                <span className="mt-2 text-sm font-medium text-gray-600">
                  Create New Topic
                </span>
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Create Topic Dialog */}
      {showCreateDialog && (
        <CreateTopicDialog
          aiModels={aiModels}
          onClose={() => setShowCreateDialog(false)}
          onCreate={async (dto) => {
            const topic = await createTopic(dto);
            setShowCreateDialog(false);
            router.push(`/ai-group/${topic.id}`);
          }}
        />
      )}

      {editingTopic && (
        <EditTopicDialog
          topic={editingTopic}
          onClose={() => setEditingTopic(null)}
          onUpdate={async (topicId, dto) => {
            await updateTopic(topicId, dto);
            setEditingTopic(null);
            await fetchTopics();
          }}
        />
      )}
    </div>
  );
}

// Topic Card Component
function TopicCard({
  topic,
  currentUserId,
  onClick,
  onEdit,
  onDelete,
  findModel,
}: {
  topic: Topic;
  currentUserId?: string;
  onClick: () => void;
  onEdit: (topic: Topic) => void;
  onDelete: (topicId: string) => void;
  findModel: (aiModel: string) => AIModel | undefined;
}) {
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  // Check if current user is the creator (owner)
  const isOwner = currentUserId === topic.createdById;

  return (
    <div className="group relative cursor-pointer rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-blue-300 hover:shadow-md">
      {/* Action Buttons - only show for owner */}
      {isOwner && (
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(topic);
            }}
            className="rounded-lg bg-white p-1.5 text-gray-400 shadow-sm hover:bg-gray-50 hover:text-blue-600"
            title="Edit topic"
          >
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
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(topic.id);
            }}
            className="rounded-lg bg-white p-1.5 text-gray-400 shadow-sm hover:bg-red-50 hover:text-red-600"
            title="Delete topic"
          >
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
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Card Content */}
      <div onClick={onClick}>
        {/* Avatar */}
        <div className="flex items-start justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-500">
            {topic.avatar ? (
              <span className="text-2xl">{topic.avatar}</span>
            ) : (
              <svg
                className="h-6 w-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z"
                />
              </svg>
            )}
          </div>
          {topic.unreadCount && topic.unreadCount > 0 && (
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-2 text-xs font-semibold text-white">
              {topic.unreadCount > 99 ? '99+' : topic.unreadCount}
            </span>
          )}
        </div>

        {/* Title & Description */}
        <h3 className="mt-3 truncate text-base font-semibold text-gray-900 group-hover:text-blue-600">
          {topic.name}
        </h3>
        {topic.description && (
          <p className="mt-1 line-clamp-2 text-sm text-gray-500">
            {topic.description}
          </p>
        )}

        {/* Tags */}
        {topic.metadata?.tags && topic.metadata.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {topic.metadata.tags.slice(0, 3).map((tag: string, idx: number) => (
              <span
                key={idx}
                className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600"
              >
                {tag}
              </span>
            ))}
            {topic.metadata.tags.length > 3 && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                +{topic.metadata.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
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
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            {topic.memberCount}
          </span>
          <span className="flex items-center gap-1">
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
            {topic.aiMemberCount} AI
          </span>
          <span className="ml-auto">{formatTime(topic.updatedAt)}</span>
        </div>

        {/* Member Avatars */}
        <div className="mt-3 flex items-center">
          <div className="flex -space-x-2">
            {(topic.members || []).slice(0, 4).map((member, idx) => (
              <div
                key={member.id}
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-gray-200 text-xs font-medium text-gray-600"
                title={member.user.fullName || member.user.username || 'User'}
              >
                {member.user.avatarUrl ? (
                  <img
                    src={member.user.avatarUrl}
                    alt=""
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  (member.user.fullName ||
                    member.user.username ||
                    'U')[0].toUpperCase()
                )}
              </div>
            ))}
            {topic.memberCount > 4 && (
              <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-gray-100 text-xs font-medium text-gray-500">
                +{topic.memberCount - 4}
              </div>
            )}
          </div>

          {/* AI Avatars */}
          {(topic.aiMembers || []).length > 0 && (
            <>
              <div className="mx-2 h-4 w-px bg-gray-200" />
              <div className="flex -space-x-2">
                {(topic.aiMembers || []).slice(0, 2).map((ai) => {
                  const model = findModel(ai.aiModel);
                  return (
                    <div
                      key={ai.id}
                      className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-blue-500 to-cyan-500"
                      title={ai.displayName}
                    >
                      {model?.iconUrl ? (
                        <img
                          src={model.iconUrl}
                          alt={model.name}
                          className="h-4 w-4"
                        />
                      ) : (
                        <svg
                          className="h-4 w-4 text-white"
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
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Create Topic Dialog
function CreateTopicDialog({
  aiModels,
  onClose,
  onCreate,
}: {
  aiModels: AIModel[];
  onClose: () => void;
  onCreate: (dto: CreateTopicDto) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedAI, setSelectedAI] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleAddTag = () => {
    const trimmedTag = tagInput.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleCreate = async () => {
    if (!name.trim()) return;

    setIsCreating(true);
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim() || undefined,
        metadata: tags.length > 0 ? { tags } : undefined,
        aiMembers: selectedAI.map((aiId) => {
          // aiId 是 model.id（数据库唯一 ID），需要找到对应的 modelId
          const model = (aiModels || []).find((m) => m.id === aiId);
          return {
            aiModel: model?.modelId || aiId, // 使用 modelId（唯一）而不是旧的 id
            displayName: `AI-${model?.name || aiId}`,
          };
        }),
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Create New Topic
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 px-6 py-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Topic Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Tech Discussion, Weekly Meeting"
              className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this topic about?"
              rows={3}
              className="mt-1 w-full resize-none rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Tags
            </label>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="Add tags (press Enter)"
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Add
              </button>
            </div>
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-600"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-blue-800"
                    >
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
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* AI Members */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Add AI Assistants
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(aiModels || []).map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    setSelectedAI((prev) =>
                      prev.includes(model.id)
                        ? prev.filter((id) => id !== model.id)
                        : [...prev, model.id]
                    );
                  }}
                  className={`flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-colors ${
                    selectedAI.includes(model.id)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {model.iconUrl ? (
                    <img
                      src={model.iconUrl}
                      alt={model.name}
                      className="h-6 w-6"
                    />
                  ) : (
                    <span className="text-2xl">{model.icon}</span>
                  )}
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {model.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {model.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || isCreating}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreating ? 'Creating...' : 'Create Topic'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Edit Topic Dialog
function EditTopicDialog({
  topic,
  onClose,
  onUpdate,
}: {
  topic: Topic;
  onClose: () => void;
  onUpdate: (topicId: string, dto: UpdateTopicDto) => Promise<void>;
}) {
  const [name, setName] = useState(topic.name);
  const [description, setDescription] = useState(topic.description || '');
  const [tags, setTags] = useState<string[]>(
    (topic.metadata?.tags as string[]) || []
  );
  const [tagInput, setTagInput] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const handleAddTag = () => {
    const trimmedTag = tagInput.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleUpdate = async () => {
    if (!name.trim()) return;

    setIsUpdating(true);
    try {
      await onUpdate(topic.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        metadata: { ...topic.metadata, tags },
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Edit Topic</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 px-6 py-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Topic Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full resize-none rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Tags
            </label>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="Add tags (press Enter)"
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Add
              </button>
            </div>
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-600"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-blue-800"
                    >
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
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleUpdate}
            disabled={!name.trim() || isUpdating}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUpdating ? 'Updating...' : 'Update Topic'}
          </button>
        </div>
      </div>
    </div>
  );
}
