'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Key,
  Eye,
  Trash2,
  Edit,
  History,
  GitBranch,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import {
  useAdminSecrets,
  Secret,
  SecretCategory,
  CreateSecretDto,
  UpdateSecretDto,
} from '@/hooks/domain/useAdminSecrets';
import { SecretForm } from './SecretForm';
import { SecretAccessLogs } from './SecretAccessLogs';
import { SecretVersions } from './SecretVersions';
import { SecretValueModal } from './SecretValueModal';
import { ExpectedSecretsPanel } from './ExpectedSecretsPanel';
import { SecretKeysDrawer } from './SecretKeysDrawer';
import type { ExpectedSecretItem } from '@/hooks/domain/useAdminSecrets';

const CATEGORY_OPTIONS: {
  value: SecretCategory;
  label: string;
  color: string;
}[] = [
  { value: 'AI_MODEL', label: 'AI Model', color: 'bg-blue-100 text-blue-800' },
  { value: 'SEARCH', label: 'Search', color: 'bg-green-100 text-green-800' },
  {
    value: 'EXTRACTION',
    label: 'Content Extraction',
    color: 'bg-purple-100 text-purple-800',
  },
  { value: 'YOUTUBE', label: 'YouTube', color: 'bg-red-100 text-red-800' },
  {
    value: 'TTS',
    label: 'Text-to-Speech',
    color: 'bg-yellow-100 text-yellow-800',
  },
  {
    value: 'SKILLSMP',
    label: 'SkillsMP',
    color: 'bg-indigo-100 text-indigo-800',
  },
  {
    value: 'POLICY',
    label: 'Policy Research',
    color: 'bg-teal-100 text-teal-800',
  },
  {
    value: 'FINANCE',
    label: 'Finance Data',
    color: 'bg-emerald-100 text-emerald-800',
  },
  {
    value: 'ACADEMIC',
    label: 'Academic Research',
    color: 'bg-violet-100 text-violet-800',
  },
  {
    value: 'WEATHER',
    label: 'Weather Data',
    color: 'bg-sky-100 text-sky-800',
  },
  {
    value: 'IMAGE_SEARCH',
    label: 'Image Search',
    color: 'bg-rose-100 text-rose-800',
  },
  {
    value: 'DEV_TOOLS',
    label: 'Dev Tools',
    color: 'bg-orange-100 text-orange-800',
  },
  {
    value: 'MCP',
    label: 'MCP Server',
    color: 'bg-cyan-100 text-cyan-800',
  },
  {
    value: 'USER_DONATED',
    label: 'User Donated',
    color: 'bg-pink-100 text-pink-800',
  },
  { value: 'OTHER', label: 'Other', color: 'bg-gray-100 text-gray-800' },
];

interface SecretsManagerProps {
  showAddModal: boolean;
  setShowAddModal: (show: boolean) => void;
}

export function SecretsManager({
  showAddModal,
  setShowAddModal,
}: SecretsManagerProps) {
  const {
    secrets,
    loading,
    error,
    refreshSecrets,
    createSecret,
    updateSecret,
    deleteSecret,
    getSecretValue,
    getAccessLogs,
    getVersions,
    getVersionValue,
    rollbackVersion,
    isCreating,
    isUpdating,
    isDeleting,
    isRollingBack,
    expectedSecrets,
    expectedLoading,
  } = useAdminSecrets();

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<SecretCategory | 'ALL'>(
    'ALL'
  );
  const [editingSecret, setEditingSecret] = useState<Secret | null>(null);
  const [showLogsFor, setShowLogsFor] = useState<string | null>(null);
  const [showVersionsFor, setShowVersionsFor] = useState<string | null>(null);

  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [showValueFor, setShowValueFor] = useState<{
    name: string;
    displayName: string;
  } | null>(null);
  // ★ 多 KEY 管理抽屉（点击 Edit 图标触发；与 SecretForm 元信息编辑解耦）
  const [keysDrawerSecret, setKeysDrawerSecret] = useState<Secret | null>(null);

  // Reset editingSecret when modal is closed
  useEffect(() => {
    if (!showAddModal) {
      setEditingSecret(null);
    }
  }, [showAddModal]);

  // M5 Fix: Use useMemo for filteredSecrets to prevent recalculation on every render
  const filteredSecrets = useMemo(() => {
    return secrets.filter((secret) => {
      const matchesSearch =
        secret.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        secret.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        secret.provider?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory =
        categoryFilter === 'ALL' || secret.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [secrets, searchTerm, categoryFilter]);

  // 处理创建/更新
  const handleSubmit = async (data: CreateSecretDto | UpdateSecretDto) => {
    if (editingSecret) {
      await updateSecret(editingSecret.name, data as UpdateSecretDto);
    } else {
      await createSecret(data as CreateSecretDto);
    }
    setShowAddModal(false);
    setEditingSecret(null);
  };

  // H3 Fix: 处理Delete with try-finally for error recovery
  const handleDelete = async (name: string) => {
    if (confirm(`确定要Delete密钥 "${name}" 吗？此Actions不可恢复。`)) {
      setDeletingName(name);
      try {
        await deleteSecret(name);
      } catch {
        // Error is handled by the hook's error state
      } finally {
        setDeletingName(null);
      }
    }
  };

  const handleConfigureExpected = (_item: ExpectedSecretItem) => {
    setEditingSecret(null);
    setShowAddModal(true);
  };

  const handleDeleteOrphan = async (secretId: string, name: string) => {
    void secretId; // secretId not needed — deleteSecret uses name
    await handleDelete(name);
  };

  const getCategoryBadge = (category: SecretCategory) => {
    const option = CATEGORY_OPTIONS.find((o) => o.value === category);
    return option ? (
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${option.color}`}
      >
        {option.label}
      </span>
    ) : null;
  };

  if (loading && secrets.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 错误提示 */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <span className="text-red-700">
            {typeof error === 'string'
              ? error
              : error?.message || 'An error occurred'}
          </span>
        </div>
      )}

      {/* 预置卡槽面板 */}
      <ExpectedSecretsPanel
        expected={expectedSecrets}
        loading={expectedLoading}
        onConfigure={handleConfigureExpected}
        onDeleteOrphan={(secretId, name) => {
          void handleDeleteOrphan(secretId, name);
        }}
      />

      {/* Search和过滤 */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search密钥Name、提供商..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) =>
            setCategoryFilter(e.target.value as SecretCategory | 'ALL')
          }
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        >
          <option value="ALL">All Categories</option>
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => refreshSecrets()}
          className="rounded-lg border border-gray-300 p-2 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
          title="Refresh"
        >
          <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 密钥列表 */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Category
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Value
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Access Count
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredSecrets.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  {searchTerm || categoryFilter !== 'ALL'
                    ? 'No matching secrets found'
                    : '暂无密钥，点击"Add Secret"创建'}
                </td>
              </tr>
            ) : (
              filteredSecrets.map((secret) => (
                <tr
                  key={secret.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <Key className="h-5 w-5 text-gray-400" />
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {secret.displayName}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {secret.name}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    {getCategoryBadge(secret.category)}
                    {secret.provider && (
                      <span className="ml-2 text-sm text-gray-500">
                        {secret.provider}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <code className="font-mono rounded bg-gray-100 px-2 py-1 text-sm dark:bg-gray-700">
                        {secret.maskedValue}
                      </code>
                      <button
                        onClick={() =>
                          setShowValueFor({
                            name: secret.name,
                            displayName: secret.displayName,
                          })
                        }
                        className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
                        title="View Secret"
                      >
                        <Eye className="h-4 w-4 text-gray-500" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        secret.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {secret.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500">
                    {secret.accessCount}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setShowVersionsFor(secret.name)}
                        className="rounded p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
                        title="Version History"
                      >
                        <GitBranch className="h-4 w-4 text-gray-500" />
                      </button>
                      <button
                        onClick={() => setShowLogsFor(secret.name)}
                        className="rounded p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
                        title="Access Logs"
                      >
                        <History className="h-4 w-4 text-gray-500" />
                      </button>
                      <button
                        onClick={() => setKeysDrawerSecret(secret)}
                        className="rounded p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
                        title="Manage Keys"
                      >
                        <Edit className="h-4 w-4 text-gray-500" />
                      </button>
                      <button
                        onClick={() => handleDelete(secret.name)}
                        disabled={isDeleting && deletingName === secret.name}
                        className="rounded p-1.5 hover:bg-red-100 disabled:opacity-50 dark:hover:bg-red-900/30"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 表单弹窗 */}
      {showAddModal && (
        <SecretForm
          secret={editingSecret}
          onSubmit={handleSubmit}
          onCancel={() => {
            setShowAddModal(false);
            setEditingSecret(null);
          }}
          isSubmitting={isCreating || isUpdating}
        />
      )}

      {/* Version History弹窗 */}
      {showVersionsFor && (
        <SecretVersions
          secretName={showVersionsFor}
          onClose={() => setShowVersionsFor(null)}
          getVersions={getVersions}
          getVersionValue={getVersionValue}
          rollbackVersion={rollbackVersion}
          isRollingBack={isRollingBack}
        />
      )}

      {/* Access Logs弹窗 */}
      {showLogsFor && (
        <SecretAccessLogs
          secretName={showLogsFor}
          onClose={() => setShowLogsFor(null)}
          getAccessLogs={getAccessLogs}
        />
      )}

      {/* Secret Value弹窗 */}
      {showValueFor && (
        <SecretValueModal
          secretName={showValueFor.name}
          displayName={showValueFor.displayName}
          onClose={() => setShowValueFor(null)}
          getSecretValue={getSecretValue}
        />
      )}

      {/* 多 KEY 管理抽屉 */}
      <SecretKeysDrawer
        secret={keysDrawerSecret}
        onClose={() => setKeysDrawerSecret(null)}
      />
    </div>
  );
}
