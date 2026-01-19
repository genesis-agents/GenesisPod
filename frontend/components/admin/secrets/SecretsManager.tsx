'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Search,
  Key,
  Eye,
  EyeOff,
  Trash2,
  Edit,
  History,
  Copy,
  Check,
  AlertCircle,
  RefreshCw,
  Shield,
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
  { value: 'OTHER', label: 'Other', color: 'bg-gray-100 text-gray-800' },
];

export function SecretsManager() {
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
    isCreating,
    isUpdating,
    isDeleting,
  } = useAdminSecrets();

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<SecretCategory | 'ALL'>(
    'ALL'
  );
  const [showForm, setShowForm] = useState(false);
  const [editingSecret, setEditingSecret] = useState<Secret | null>(null);
  const [showLogsFor, setShowLogsFor] = useState<string | null>(null);
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(
    new Set()
  );
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [copiedSecret, setCopiedSecret] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState<string | null>(null);

  // 过滤密钥
  const filteredSecrets = secrets.filter((secret) => {
    const matchesSearch =
      secret.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      secret.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      secret.provider?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory =
      categoryFilter === 'ALL' || secret.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // Show/Hide密钥Value
  const toggleReveal = async (name: string) => {
    if (revealedSecrets.has(name)) {
      setRevealedSecrets((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    } else {
      const value = await getSecretValue(name);
      if (value) {
        setSecretValues((prev) => ({ ...prev, [name]: value }));
        setRevealedSecrets((prev) => new Set(prev).add(name));
        // 30秒后自动Hide
        setTimeout(() => {
          setRevealedSecrets((prev) => {
            const next = new Set(prev);
            next.delete(name);
            return next;
          });
        }, 30000);
      }
    }
  };

  // Copy密钥Value
  const copySecret = async (name: string) => {
    let value = secretValues[name];
    if (!value) {
      value = (await getSecretValue(name)) ?? '';
    }
    if (value) {
      await navigator.clipboard.writeText(value);
      setCopiedSecret(name);
      setTimeout(() => setCopiedSecret(null), 2000);
    }
  };

  // 处理创建/更新
  const handleSubmit = async (data: CreateSecretDto | UpdateSecretDto) => {
    if (editingSecret) {
      await updateSecret(editingSecret.name, data as UpdateSecretDto);
    } else {
      await createSecret(data as CreateSecretDto);
    }
    setShowForm(false);
    setEditingSecret(null);
  };

  // 处理Delete
  const handleDelete = async (name: string) => {
    if (confirm(`确定要Delete密钥 "${name}" 吗？此Actions不可恢复。`)) {
      setDeletingName(name);
      await deleteSecret(name);
      setDeletingName(null);
    }
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
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white">
            <Shield className="h-5 w-5" />
            Secret Management
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Centralized management of all API keys with encrypted storage and
            access auditing
          </p>
        </div>
        <button
          onClick={() => {
            setEditingSecret(null);
            setShowForm(true);
          }}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Secret
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <span className="text-red-700">{error.message}</span>
        </div>
      )}

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
                        {revealedSecrets.has(secret.name)
                          ? secretValues[secret.name]
                          : secret.maskedValue}
                      </code>
                      <button
                        onClick={() => toggleReveal(secret.name)}
                        className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
                        title={
                          revealedSecrets.has(secret.name) ? 'Hide' : 'Show'
                        }
                      >
                        {revealedSecrets.has(secret.name) ? (
                          <EyeOff className="h-4 w-4 text-gray-500" />
                        ) : (
                          <Eye className="h-4 w-4 text-gray-500" />
                        )}
                      </button>
                      <button
                        onClick={() => copySecret(secret.name)}
                        className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
                        title="Copy"
                      >
                        {copiedSecret === secret.name ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4 text-gray-500" />
                        )}
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
                        onClick={() => setShowLogsFor(secret.name)}
                        className="rounded p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
                        title="Access Logs"
                      >
                        <History className="h-4 w-4 text-gray-500" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingSecret(secret);
                          setShowForm(true);
                        }}
                        className="rounded p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
                        title="Edit"
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
      {showForm && (
        <SecretForm
          secret={editingSecret}
          onSubmit={handleSubmit}
          onCancel={() => {
            setShowForm(false);
            setEditingSecret(null);
          }}
          isSubmitting={isCreating || isUpdating}
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
    </div>
  );
}
