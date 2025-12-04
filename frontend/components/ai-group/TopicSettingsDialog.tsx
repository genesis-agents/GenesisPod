'use client';

import { useState } from 'react';
import {
  Topic,
  TopicAIMember,
  UpdateTopicDto,
  AddAIMemberDto,
} from '@/types/ai-group';
import { useAiGroupStore } from '@/stores/aiGroupStore';
import { useAIModels, AIModel } from '@/hooks/useAIModels';

interface TopicSettingsDialogProps {
  topic: Topic;
  onClose: () => void;
}

export default function TopicSettingsDialog({
  topic,
  onClose,
}: TopicSettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<
    'general' | 'ai' | 'members' | 'danger'
  >('general');
  const {
    updateTopic,
    addAIMember,
    updateAIMember,
    removeAIMember,
    addMember,
    removeMember,
    deleteTopic,
  } = useAiGroupStore();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[80vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Topic Settings
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

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6">
          {[
            { id: 'general', label: 'General' },
            { id: 'ai', label: 'AI Assistants' },
            { id: 'members', label: 'Members' },
            { id: 'danger', label: 'Danger Zone' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === 'general' && (
            <GeneralSettings topic={topic} onUpdate={updateTopic} />
          )}
          {activeTab === 'ai' && (
            <AISettings
              topic={topic}
              onAdd={addAIMember}
              onUpdate={updateAIMember}
              onRemove={removeAIMember}
            />
          )}
          {activeTab === 'members' && (
            <MemberSettings
              topic={topic}
              onAdd={addMember}
              onRemove={removeMember}
            />
          )}
          {activeTab === 'danger' && (
            <DangerSettings
              topic={topic}
              onDelete={deleteTopic}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// General Settings Tab
function GeneralSettings({
  topic,
  onUpdate,
}: {
  topic: Topic;
  onUpdate: (topicId: string, dto: UpdateTopicDto) => Promise<void>;
}) {
  const [name, setName] = useState(topic.name);
  const [description, setDescription] = useState(topic.description || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdate(topic.id, {
        name: name.trim(),
        description: description.trim() || undefined,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Topic Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

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

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={!name.trim() || isSaving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

// AI Settings Tab
function AISettings({
  topic,
  onAdd,
  onUpdate,
  onRemove,
}: {
  topic: Topic;
  onAdd: (topicId: string, dto: AddAIMemberDto) => Promise<void>;
  onUpdate: (
    topicId: string,
    aiMemberId: string,
    dto: Partial<AddAIMemberDto>
  ) => Promise<void>;
  onRemove: (topicId: string, aiMemberId: string) => Promise<void>;
}) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingAI, setEditingAI] = useState<TopicAIMember | null>(null);
  const { models } = useAIModels();

  // 查找模型：优先用 modelId 匹配（新方式），兼容 modelName 匹配（旧数据）
  const findModel = (aiModel: string) =>
    (models || []).find((m) => m.modelId === aiModel) ||
    (models || []).find((m) => m.modelName === aiModel);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900">AI Assistants</h3>
        <button
          onClick={() => setShowAddDialog(true)}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Add AI
        </button>
      </div>

      {(topic.aiMembers || []).length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm text-gray-500">No AI assistants added yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(topic.aiMembers || []).map((ai) => {
            const model = findModel(ai.aiModel);
            return (
              <div
                key={ai.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-green-100 to-blue-100 text-xl">
                    🤖
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">
                      {ai.displayName}
                    </div>
                    <div className="text-sm text-gray-500">
                      {model?.name || ai.aiModel}
                    </div>
                    {ai.roleDescription && (
                      <div className="text-xs text-gray-400">
                        {ai.roleDescription}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingAI(ai)}
                    className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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
                    onClick={() => onRemove(topic.id, ai.id)}
                    className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
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
              </div>
            );
          })}
        </div>
      )}

      {/* Add AI Dialog */}
      {showAddDialog && (
        <AddAIDialog
          topicId={topic.id}
          onAdd={onAdd}
          onClose={() => setShowAddDialog(false)}
        />
      )}

      {/* Edit AI Dialog */}
      {editingAI && (
        <EditAIDialog
          topicId={topic.id}
          ai={editingAI}
          onUpdate={onUpdate}
          onClose={() => setEditingAI(null)}
        />
      )}
    </div>
  );
}

// Add AI Dialog
function AddAIDialog({
  topicId,
  onAdd,
  onClose,
}: {
  topicId: string;
  onAdd: (topicId: string, dto: AddAIMemberDto) => Promise<void>;
  onClose: () => void;
}) {
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [displayName, setDisplayName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [autoRespond, setAutoRespond] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const { models, loading } = useAIModels();

  const handleAdd = async () => {
    if (!selectedModel || !displayName.trim()) return;

    // 找到选中的模型，获取 modelId 用于 aiModel 字段
    // 重要：使用 modelId（唯一）而不是 modelName（非唯一）
    // 这样后端可以精确匹配到用户选择的具体模型
    const selectedModelData = (models || []).find(
      (m) => m.id === selectedModel
    );
    if (!selectedModelData) return;

    setIsAdding(true);
    try {
      await onAdd(topicId, {
        aiModel: selectedModelData.modelId, // 使用 modelId（唯一）而不是 modelName（可能重复）
        displayName: displayName.trim(),
        roleDescription: roleDescription.trim() || undefined,
        systemPrompt: systemPrompt.trim() || undefined,
        autoRespond,
      });
      onClose();
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">
          Add AI Assistant
        </h3>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Select Model
            </label>
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {(models || []).map((model) => (
                  <button
                    key={model.id}
                    onClick={() => {
                      setSelectedModel(model.id);
                      if (!displayName) setDisplayName(`AI-${model.name}`);
                    }}
                    className={`flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-colors ${
                      selectedModel === model.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="text-xl">🤖</span>
                    <span className="text-sm font-medium">{model.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Role Description (optional)
            </label>
            <input
              type="text"
              value={roleDescription}
              onChange={(e) => setRoleDescription(e.target.value)}
              placeholder="e.g., Technical Expert, Meeting Facilitator"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              System Prompt (optional)
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={3}
              placeholder="Custom instructions for this AI..."
              className="mt-1 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoRespond}
              onChange={(e) => setAutoRespond(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              Auto-respond to @mentions
            </span>
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!selectedModel || !displayName.trim() || isAdding}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isAdding ? 'Adding...' : 'Add AI'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Edit AI Dialog
function EditAIDialog({
  topicId,
  ai,
  onUpdate,
  onClose,
}: {
  topicId: string;
  ai: TopicAIMember;
  onUpdate: (
    topicId: string,
    aiMemberId: string,
    dto: Partial<AddAIMemberDto>
  ) => Promise<void>;
  onClose: () => void;
}) {
  const [displayName, setDisplayName] = useState(ai.displayName);
  const [roleDescription, setRoleDescription] = useState(
    ai.roleDescription || ''
  );
  const [systemPrompt, setSystemPrompt] = useState(ai.systemPrompt || '');
  const [autoRespond, setAutoRespond] = useState(ai.autoRespond);
  const [canMentionOtherAI, setCanMentionOtherAI] = useState(
    ai.canMentionOtherAI ?? false
  );
  const [isSaving, setIsSaving] = useState(false);
  const { models } = useAIModels();

  const handleSave = async () => {
    if (!displayName.trim()) return;

    setIsSaving(true);
    try {
      await onUpdate(topicId, ai.id, {
        displayName: displayName.trim(),
        roleDescription: roleDescription.trim() || undefined,
        systemPrompt: systemPrompt.trim() || undefined,
        autoRespond,
        canMentionOtherAI,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  // 查找模型：优先用 modelId 匹配（新方式），兼容 modelName 匹配（旧数据）
  const model =
    (models || []).find((m) => m.modelId === ai.aiModel) ||
    (models || []).find((m) => m.modelName === ai.aiModel);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-green-100 to-blue-100 text-2xl">
            🤖
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Edit AI Assistant
            </h3>
            <p className="text-sm text-gray-500">{model?.name || ai.aiModel}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Role Description
            </label>
            <input
              type="text"
              value={roleDescription}
              onChange={(e) => setRoleDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              System Prompt
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={3}
              className="mt-1 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoRespond}
              onChange={(e) => setAutoRespond(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              Auto-respond to @mentions
            </span>
          </label>

          {/* AI-AI Collaboration Toggle */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <label className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-gray-700">
                  AI-AI Collaboration
                </span>
                <p className="text-xs text-gray-500">
                  Allow this AI to @mention and collaborate with other AIs
                </p>
              </div>
              <input
                type="checkbox"
                checked={canMentionOtherAI}
                onChange={(e) => setCanMentionOtherAI(e.target.checked)}
                className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </label>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!displayName.trim() || isSaving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Member Settings Tab
function MemberSettings({
  topic,
  onAdd,
  onRemove,
}: {
  topic: Topic;
  onAdd: (topicId: string, userId: string, role?: string) => Promise<void>;
  onRemove: (topicId: string, memberId: string) => Promise<void>;
}) {
  const [showAddDialog, setShowAddDialog] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900">
          Members ({topic.memberCount})
        </h3>
        <button
          onClick={() => setShowAddDialog(true)}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Add Member
        </button>
      </div>

      <div className="space-y-2">
        {(topic.members || []).map((member) => (
          <div
            key={member.id}
            className="flex items-center justify-between rounded-lg border border-gray-200 p-3"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
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
              <div>
                <div className="font-medium text-gray-900">
                  {member.user.fullName || member.user.username}
                </div>
                {member.user.email && (
                  <div className="text-sm text-gray-500">
                    {member.user.email}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-2 py-1 text-xs font-medium ${
                  member.role === 'OWNER'
                    ? 'bg-yellow-100 text-yellow-700'
                    : member.role === 'ADMIN'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-600'
                }`}
              >
                {member.role}
              </span>
              {member.role !== 'OWNER' && (
                <button
                  onClick={() => onRemove(topic.id, member.id)}
                  className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  title="Remove member"
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
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add Member Dialog */}
      {showAddDialog && (
        <AddMemberDialog
          topicId={topic.id}
          existingMemberIds={(topic.members || []).map((m) => m.user.id)}
          onAdd={onAdd}
          onClose={() => setShowAddDialog(false)}
        />
      )}
    </div>
  );
}

// Add Member Dialog
function AddMemberDialog({
  topicId,
  existingMemberIds,
  onAdd,
  onClose,
}: {
  topicId: string;
  existingMemberIds: string[];
  onAdd: (topicId: string, userId: string, role?: string) => Promise<void>;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'MEMBER' | 'ADMIN'>('MEMBER');
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!email.trim()) return;

    setIsAdding(true);
    setError(null);

    try {
      // Note: Backend should support adding by email
      // For now, we'll pass the email as userId and let the backend resolve it
      await onAdd(topicId, email.trim(), role);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add member');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Add Member</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'MEMBER' | 'ADMIN')}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!email.trim() || isAdding}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isAdding ? 'Adding...' : 'Add Member'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Danger Zone Tab
function DangerSettings({
  topic,
  onDelete,
  onClose,
}: {
  topic: Topic;
  onDelete: (topicId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [confirmName, setConfirmName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (confirmName !== topic.name) return;

    setIsDeleting(true);
    try {
      await onDelete(topic.id);
      onClose();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <h3 className="font-medium text-red-800">Delete Topic</h3>
        <p className="mt-1 text-sm text-red-600">
          This action cannot be undone. All messages, resources, and summaries
          will be permanently deleted.
        </p>

        <div className="mt-4">
          <label className="block text-sm font-medium text-red-700">
            Type "{topic.name}" to confirm
          </label>
          <input
            type="text"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-red-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
          />
        </div>

        <button
          onClick={handleDelete}
          disabled={confirmName !== topic.name || isDeleting}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isDeleting ? 'Deleting...' : 'Delete Topic'}
        </button>
      </div>
    </div>
  );
}
