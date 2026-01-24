'use client';

/**
 * Topic Sharing Modal Component
 *
 * 用于管理专题的共享设置：
 * - 可见性设置（私有/共享/公开）
 * - 添加/移除协作者
 * - 管理协作者角色
 */

import { useState, useEffect, useCallback } from 'react';
import { getAuthTokens } from '@/lib/utils/auth';

import { logger } from '@/lib/utils/logger';
// Helper function to get headers with auth token
function getAuthHeaders(): HeadersInit {
  const tokens = getAuthTokens();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (tokens?.accessToken) {
    headers['Authorization'] = `Bearer ${tokens.accessToken}`;
  }
  return headers;
}

// Types
export type TopicVisibility = 'PRIVATE' | 'SHARED' | 'PUBLIC';
export type CollaboratorRole = 'VIEWER' | 'EDITOR' | 'ADMIN';

interface Collaborator {
  id: string;
  userId: string;
  email: string;
  username?: string;
  avatarUrl?: string;
  role: CollaboratorRole;
  invitedAt: string;
  isActive: boolean;
}

interface TopicSharingModalProps {
  topicId: string;
  topicName: string;
  isOpen: boolean;
  onClose: () => void;
}

// Icons
const CloseIcon = ({ className }: { className?: string }) => (
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
      d="M6 18L18 6M6 6l12 12"
    />
  </svg>
);

const LockIcon = ({ className }: { className?: string }) => (
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
      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
    />
  </svg>
);

const UsersIcon = ({ className }: { className?: string }) => (
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
      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
    />
  </svg>
);

const GlobeIcon = ({ className }: { className?: string }) => (
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
      d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
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

const TrashIcon = ({ className }: { className?: string }) => (
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
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
    />
  </svg>
);

// Visibility options
const visibilityOptions: {
  value: TopicVisibility;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: 'PRIVATE',
    label: '私有',
    description: '仅自己可见',
    icon: <LockIcon className="h-5 w-5" />,
  },
  {
    value: 'SHARED',
    label: '共享',
    description: '邀请的协作者可见',
    icon: <UsersIcon className="h-5 w-5" />,
  },
  {
    value: 'PUBLIC',
    label: '公开',
    description: '所有人可见',
    icon: <GlobeIcon className="h-5 w-5" />,
  },
];

// Role options
const roleOptions: {
  value: CollaboratorRole;
  label: string;
  description: string;
}[] = [
  { value: 'VIEWER', label: '查看者', description: '只能查看内容' },
  { value: 'EDITOR', label: '编辑者', description: '可以编辑内容' },
  { value: 'ADMIN', label: '管理员', description: '可以管理成员' },
];

export function TopicSharingModal({
  topicId,
  topicName,
  isOpen,
  onClose,
}: TopicSharingModalProps) {
  const [visibility, setVisibility] = useState<TopicVisibility>('PRIVATE');
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<CollaboratorRole>('VIEWER');
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch sharing settings
  const fetchSettings = useCallback(async () => {
    if (!isOpen) return;

    setIsLoading(true);
    setError(null);

    try {
      const [sharingRes, collaboratorsRes] = await Promise.all([
        fetch(`/api/v1/topic-research/topics/${topicId}/sharing`, {
          headers: getAuthHeaders(),
        }),
        fetch(`/api/v1/topic-research/topics/${topicId}/collaborators`, {
          headers: getAuthHeaders(),
        }),
      ]);

      if (sharingRes.ok) {
        const result = await sharingRes.json();
        // Handle wrapped API response { success: true, data: T }
        const data = result?.data ?? result;
        setVisibility(data.visibility || 'PRIVATE');
      }

      if (collaboratorsRes.ok) {
        const result = await collaboratorsRes.json();
        // Handle wrapped API response { success: true, data: T }
        const data = result?.data ?? result;
        setCollaborators(data.collaborators || []);
      }
    } catch (err) {
      logger.error('Failed to fetch sharing settings:', err);
      setError('获取共享设置失败');
    } finally {
      setIsLoading(false);
    }
  }, [topicId, isOpen]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Update visibility
  const handleVisibilityChange = async (newVisibility: TopicVisibility) => {
    setVisibility(newVisibility);

    try {
      const res = await fetch(
        `/api/v1/topic-research/topics/${topicId}/visibility`,
        {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify({ visibility: newVisibility }),
        }
      );

      if (!res.ok) {
        throw new Error('Failed to update visibility');
      }
    } catch (err) {
      logger.error('Failed to update visibility:', err);
      setError('更新可见性失败');
      // Revert on error
      fetchSettings();
    }
  };

  // Add collaborator
  const handleAddCollaborator = async () => {
    if (!newEmail.trim()) return;

    setIsAdding(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/v1/topic-research/topics/${topicId}/collaborators`,
        {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ email: newEmail, role: newRole }),
        }
      );

      if (!res.ok) {
        const result = await res.json();
        // Handle wrapped API response { success: true, data: T }
        const data = result?.data ?? result;
        throw new Error(data.message || 'Failed to add collaborator');
      }

      const result = await res.json();
      // Handle wrapped API response { success: true, data: T }
      const newCollaborator = result?.data ?? result;
      setCollaborators((prev) => [...prev, newCollaborator]);
      setNewEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加协作者失败');
    } finally {
      setIsAdding(false);
    }
  };

  // Update collaborator role
  const handleRoleChange = async (
    collaboratorId: string,
    role: CollaboratorRole
  ) => {
    try {
      const res = await fetch(
        `/api/v1/topic-research/topics/${topicId}/collaborators/${collaboratorId}`,
        {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify({ role }),
        }
      );

      if (!res.ok) {
        throw new Error('Failed to update role');
      }

      setCollaborators((prev) =>
        prev.map((c) => (c.id === collaboratorId ? { ...c, role } : c))
      );
    } catch (err) {
      logger.error('Failed to update role:', err);
      setError('更新角色失败');
    }
  };

  // Remove collaborator
  const handleRemoveCollaborator = async (collaboratorId: string) => {
    try {
      const res = await fetch(
        `/api/v1/topic-research/topics/${topicId}/collaborators/${collaboratorId}`,
        { method: 'DELETE', headers: getAuthHeaders() }
      );

      if (!res.ok) {
        throw new Error('Failed to remove collaborator');
      }

      setCollaborators((prev) => prev.filter((c) => c.id !== collaboratorId));
    } catch (err) {
      logger.error('Failed to remove collaborator:', err);
      setError('移除协作者失败');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">共享设置</h2>
            <p className="text-sm text-gray-500">{topicName}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            </div>
          ) : (
            <>
              {/* Error */}
              {error && (
                <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
                  {typeof error === 'string' ? error : '操作失败'}
                </div>
              )}

              {/* Visibility */}
              <div className="mb-6">
                <h3 className="mb-3 text-sm font-medium text-gray-700">
                  可见性
                </h3>
                <div className="space-y-2">
                  {visibilityOptions.map((option) => (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                        visibility === option.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="visibility"
                        value={option.value}
                        checked={visibility === option.value}
                        onChange={() => handleVisibilityChange(option.value)}
                        className="sr-only"
                      />
                      <span
                        className={`${
                          visibility === option.value
                            ? 'text-blue-600'
                            : 'text-gray-400'
                        }`}
                      >
                        {option.icon}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {option.label}
                        </p>
                        <p className="text-xs text-gray-500">
                          {option.description}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Collaborators (only show when shared) */}
              {visibility === 'SHARED' && (
                <div>
                  <h3 className="mb-3 text-sm font-medium text-gray-700">
                    协作者 ({collaborators.length})
                  </h3>

                  {/* Add collaborator */}
                  <div className="mb-4 flex gap-2">
                    <input
                      type="email"
                      placeholder="输入邮箱地址"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-500"
                    />
                    <select
                      value={newRole}
                      onChange={(e) =>
                        setNewRole(e.target.value as CollaboratorRole)
                      }
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500"
                    >
                      {roleOptions.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleAddCollaborator}
                      disabled={isAdding || !newEmail.trim()}
                      className="flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isAdding ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        <PlusIcon className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {/* Collaborator list */}
                  <div className="space-y-2">
                    {collaborators.length === 0 ? (
                      <p className="py-4 text-center text-sm text-gray-500">
                        暂无协作者
                      </p>
                    ) : (
                      collaborators.map((collaborator) => (
                        <div
                          key={collaborator.id}
                          className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
                              {collaborator.username?.[0] ||
                                collaborator.email[0].toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {collaborator.username || collaborator.email}
                              </p>
                              {collaborator.username && (
                                <p className="text-xs text-gray-500">
                                  {collaborator.email}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              value={collaborator.role}
                              onChange={(e) =>
                                handleRoleChange(
                                  collaborator.id,
                                  e.target.value as CollaboratorRole
                                )
                              }
                              className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900 outline-none focus:border-blue-500"
                            >
                              {roleOptions.map((role) => (
                                <option key={role.value} value={role.value}>
                                  {role.label}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() =>
                                handleRemoveCollaborator(collaborator.id)
                              }
                              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
