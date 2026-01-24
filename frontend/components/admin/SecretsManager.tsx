'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';

import { logger } from '@/lib/utils/logger';
import {
  Key,
  Plus,
  Eye,
  EyeOff,
  Trash2,
  Edit2,
  Search,
  RefreshCw,
  Clock,
  Shield,
  CheckCircle,
  XCircle,
  Loader2,
  Save,
  X,
  AlertTriangle,
  History,
  Link2,
  Bot,
  FileText,
  Play,
  Volume2,
  Zap,
  KeyRound,
  type LucideIcon,
  Landmark,
  Github,
  Server,
} from 'lucide-react';

// Secret category enum matching backend
type SecretCategory =
  | 'AI_MODEL'
  | 'SEARCH'
  | 'EXTRACTION'
  | 'YOUTUBE'
  | 'TTS'
  | 'SKILLSMP'
  | 'POLICY'
  | 'DEV_TOOLS'
  | 'MCP'
  | 'OTHER';

interface Secret {
  id: string;
  name: string;
  displayName: string;
  category: SecretCategory;
  description: string | null;
  provider: string | null;
  isActive: boolean;
  maskedValue: string;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string | null;
  accessCount: number;
}

interface AccessLog {
  id: string;
  action: string;
  userId: string | null;
  userEmail: string | null;
  ipAddress: string | null;
  timestamp: string;
}

interface SecretReference {
  type: 'ai_model' | 'external_api';
  id: string;
  name: string;
}

// Category display configuration
const CATEGORY_CONFIG: Record<
  SecretCategory,
  { label: string; color: string; bgColor: string; icon: LucideIcon }
> = {
  AI_MODEL: {
    label: 'AI Models',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    icon: Bot,
  },
  SEARCH: {
    label: 'Search APIs',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    icon: Search,
  },
  EXTRACTION: {
    label: 'Extraction APIs',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    icon: FileText,
  },
  YOUTUBE: {
    label: 'YouTube APIs',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    icon: Play,
  },
  TTS: {
    label: 'TTS APIs',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
    icon: Volume2,
  },
  SKILLSMP: {
    label: 'SkillsMP',
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
    icon: Zap,
  },
  POLICY: {
    label: 'Policy APIs',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    icon: Landmark,
  },
  DEV_TOOLS: {
    label: 'Dev Tools',
    color: 'text-gray-700',
    bgColor: 'bg-gray-100',
    icon: Github,
  },
  MCP: {
    label: 'MCP Servers',
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50',
    icon: Server,
  },
  OTHER: {
    label: 'Other',
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
    icon: KeyRound,
  },
};

interface SecretsManagerProps {
  searchQuery?: string;
  selectedCategory?: string;
  showCreateModal?: boolean;
  setShowCreateModal?: (show: boolean) => void;
  refreshKey?: number;
}

export default function SecretsManager({
  searchQuery: propSearchQuery = '',
  selectedCategory: propCategory = 'ALL',
  showCreateModal: propShowCreate,
  setShowCreateModal: propSetShowCreate,
  refreshKey = 0,
}: SecretsManagerProps) {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use props when provided
  const searchQuery = propSearchQuery;
  const selectedCategory = (propCategory || 'ALL') as SecretCategory | 'ALL';

  // Modal states - sync with parent
  const [internalShowCreate, setInternalShowCreate] = useState(false);
  const showCreateModal =
    propShowCreate !== undefined ? propShowCreate : internalShowCreate;
  const setShowCreateModal = propSetShowCreate || setInternalShowCreate;
  const [showEditModal, setShowEditModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [showValueModal, setShowValueModal] = useState(false);
  const [selectedSecret, setSelectedSecret] = useState<Secret | null>(null);
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
  const [references, setReferences] = useState<SecretReference[]>([]);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    displayName: '',
    category: 'OTHER' as SecretCategory,
    description: '',
    value: '',
    provider: '',
    isActive: true,
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  // H5 Fix: Auto-clear revealed value after 30 seconds for security
  useEffect(() => {
    if (revealedValue) {
      const timer = setTimeout(() => {
        setRevealedValue(null);
      }, 30000); // Auto-clear after 30 seconds
      return () => clearTimeout(timer);
    }
  }, [revealedValue]);

  // H5 Fix: Clear revealed value when modal closes
  useEffect(() => {
    if (!showValueModal) {
      setRevealedValue(null);
    }
  }, [showValueModal]);

  // Fetch secrets
  const fetchSecrets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url =
        selectedCategory === 'ALL'
          ? `${config.apiUrl}/admin/secrets`
          : `${config.apiUrl}/admin/secrets?category=${selectedCategory}`;

      const response = await fetch(url, {
        headers: getAuthHeader(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch secrets');
      }

      const data = await response.json();
      setSecrets(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    fetchSecrets();
  }, [fetchSecrets]);

  // Filter secrets by search
  const filteredSecrets = secrets.filter(
    (secret) =>
      secret.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      secret.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (secret.provider?.toLowerCase().includes(searchQuery.toLowerCase()) ??
        false)
  );

  // Group secrets by category
  const groupedSecrets = filteredSecrets.reduce(
    (acc, secret) => {
      if (!acc[secret.category]) {
        acc[secret.category] = [];
      }
      acc[secret.category].push(secret);
      return acc;
    },
    {} as Record<SecretCategory, Secret[]>
  );

  // Create secret
  const handleCreate = async () => {
    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch(`${config.apiUrl}/admin/secrets`, {
        method: 'POST',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create secret');
      }

      setShowCreateModal(false);
      resetForm();
      fetchSecrets();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Update secret
  const handleUpdate = async () => {
    if (!selectedSecret) return;
    setSaving(true);
    setFormError(null);
    try {
      const updateData: Record<string, unknown> = {};
      if (formData.displayName) updateData.displayName = formData.displayName;
      if (formData.category) updateData.category = formData.category;
      if (formData.description !== undefined)
        updateData.description = formData.description;
      if (formData.provider !== undefined)
        updateData.provider = formData.provider;
      if (formData.value) updateData.value = formData.value;
      updateData.isActive = formData.isActive;

      const response = await fetch(
        `${config.apiUrl}/admin/secrets/${selectedSecret.name}`,
        {
          method: 'PATCH',
          headers: {
            ...getAuthHeader(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateData),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update secret');
      }

      setShowEditModal(false);
      resetForm();
      fetchSecrets();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Delete secret
  const handleDelete = async (name: string) => {
    if (!confirm(`Are you sure you want to delete secret "${name}"?`)) return;

    try {
      const response = await fetch(`${config.apiUrl}/admin/secrets/${name}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete secret');
      }

      fetchSecrets();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  // Reveal secret value
  const handleRevealValue = async (secret: Secret) => {
    setSelectedSecret(secret);
    setRevealedValue(null);
    setShowValueModal(true);

    try {
      const response = await fetch(
        `${config.apiUrl}/admin/secrets/${secret.name}/value`,
        {
          headers: getAuthHeader(),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch secret value');
      }

      const data = await response.json();
      setRevealedValue(data.value);

      // Also fetch references
      const refResponse = await fetch(
        `${config.apiUrl}/admin/secrets/${secret.name}/references`,
        {
          headers: getAuthHeader(),
        }
      );
      if (refResponse.ok) {
        const refData = await refResponse.json();
        setReferences(refData);
      }
    } catch (err) {
      setRevealedValue(`Error: ${(err as Error).message}`);
    }
  };

  // View access logs
  const handleViewLogs = async (secret: Secret) => {
    setSelectedSecret(secret);
    setAccessLogs([]);
    setShowLogsModal(true);

    try {
      const response = await fetch(
        `${config.apiUrl}/admin/secrets/${secret.name}/logs`,
        {
          headers: getAuthHeader(),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch access logs');
      }

      const data = await response.json();
      setAccessLogs(data);
    } catch (err) {
      logger.error('Failed to fetch logs:', err);
    }
  };

  // Open edit modal
  const openEditModal = (secret: Secret) => {
    setSelectedSecret(secret);
    setFormData({
      name: secret.name,
      displayName: secret.displayName,
      category: secret.category,
      description: secret.description || '',
      value: '',
      provider: secret.provider || '',
      isActive: secret.isActive,
    });
    setFormError(null);
    setShowEditModal(true);
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      displayName: '',
      category: 'OTHER',
      description: '',
      value: '',
      provider: '',
      isActive: true,
    });
    setSelectedSecret(null);
    setFormError(null);
  };

  // Migrate existing keys
  const handleMigrate = async () => {
    if (
      !confirm(
        'This will import existing API keys from AI Models and System Settings into the Secrets Manager. Continue?'
      )
    )
      return;

    setMigrating(true);
    setMigrationResult(null);
    try {
      const response = await fetch(`${config.apiUrl}/admin/secrets/migrate`, {
        method: 'POST',
        headers: getAuthHeader(),
      });

      if (!response.ok) {
        throw new Error('Migration failed');
      }

      const result = await response.json();
      setMigrationResult(result);
      fetchSecrets();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setMigrating(false);
    }
  };

  // Format date
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  return (
    <>
      {/* Migration Result */}
      {migrationResult && (
        <div className="mb-6 rounded-lg bg-blue-50 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="mt-0.5 h-5 w-5 text-blue-600" />
            <div>
              <h4 className="font-medium text-blue-900">Migration Complete</h4>
              <p className="text-sm text-blue-700">
                Imported: {migrationResult.imported}, Skipped:{' '}
                {migrationResult.skipped}
                {migrationResult.errors.length > 0 && (
                  <span className="text-red-600">
                    , Errors: {migrationResult.errors.length}
                  </span>
                )}
              </p>
              {migrationResult.errors.length > 0 && (
                <ul className="mt-2 text-xs text-red-600">
                  {migrationResult.errors.slice(0, 5).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
            <button
              onClick={() => setMigrationResult(null)}
              className="ml-auto text-blue-400 hover:text-blue-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Filters now in header */}

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-600">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        </div>
      )}

      {/* Secrets List */}
      {!loading && (
        <div className="space-y-6">
          {Object.entries(groupedSecrets).map(([category, categorySecrets]) => {
            const categoryConfig = CATEGORY_CONFIG[category as SecretCategory];
            return (
              <div
                key={category}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
              >
                <div
                  className={`flex items-center gap-2 px-6 py-3 ${categoryConfig.bgColor}`}
                >
                  {React.createElement(categoryConfig.icon, {
                    className: 'h-5 w-5',
                  })}
                  <h2 className={`font-semibold ${categoryConfig.color}`}>
                    {categoryConfig.label}
                  </h2>
                  <span className="ml-auto rounded-full bg-white/50 px-2 py-0.5 text-xs text-gray-600">
                    {categorySecrets.length} secret
                    {categorySecrets.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="divide-y divide-gray-100">
                  {categorySecrets.map((secret) => (
                    <div
                      key={secret.id}
                      className="flex items-center justify-between px-6 py-4 hover:bg-gray-50"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">
                            {secret.displayName}
                          </span>
                          {!secret.isActive && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                              Inactive
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-4 text-sm text-gray-500">
                          <span className="font-mono text-xs">
                            {secret.name}
                          </span>
                          {secret.provider && (
                            <span className="text-xs">
                              Provider: {secret.provider}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-600">
                          {secret.maskedValue}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleRevealValue(secret)}
                            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            title="View value"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => openEditModal(secret)}
                            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            title="Edit"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleViewLogs(secret)}
                            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            title="View logs"
                          >
                            <History className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(secret.name)}
                            className="rounded-lg p-2 text-gray-400 hover:bg-red-100 hover:text-red-600"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {filteredSecrets.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
              <Key className="mx-auto h-12 w-12 text-gray-300" />
              <h3 className="mt-4 text-lg font-medium text-gray-900">
                No secrets found
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                {searchQuery
                  ? 'Try adjusting your search query'
                  : 'Create your first secret to get started'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <Modal
          title="Create New Secret"
          onClose={() => setShowCreateModal(false)}
        >
          <SecretForm
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleCreate}
            onCancel={() => setShowCreateModal(false)}
            saving={saving}
            error={formError}
            isEdit={false}
          />
        </Modal>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedSecret && (
        <Modal
          title={`Edit Secret: ${selectedSecret.displayName}`}
          onClose={() => setShowEditModal(false)}
        >
          <SecretForm
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleUpdate}
            onCancel={() => setShowEditModal(false)}
            saving={saving}
            error={formError}
            isEdit={true}
          />
        </Modal>
      )}

      {/* Value Modal */}
      {showValueModal && selectedSecret && (
        <Modal
          title={`Secret: ${selectedSecret.displayName}`}
          onClose={() => {
            setShowValueModal(false);
            setRevealedValue(null);
          }}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Name
              </label>
              <p className="font-mono mt-1 text-sm text-gray-600">
                {selectedSecret.name}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Value
              </label>
              {revealedValue === null ? (
                <div className="mt-1 flex items-center gap-2 text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : (
                <div className="mt-1 rounded-lg bg-gray-100 p-3">
                  <code className="break-all text-sm text-gray-800">
                    {revealedValue}
                  </code>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Last Accessed
              </label>
              <p className="mt-1 flex items-center gap-2 text-sm text-gray-600">
                <Clock className="h-4 w-4" />
                {formatDate(selectedSecret.lastAccessedAt)}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Access Count
              </label>
              <p className="mt-1 text-sm text-gray-600">
                {selectedSecret.accessCount} times
              </p>
            </div>
            {references.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Referenced By
                </label>
                <ul className="mt-2 space-y-1">
                  {references.map((ref, idx) => (
                    <li
                      key={idx}
                      className="flex items-center gap-2 text-sm text-gray-600"
                    >
                      <Link2 className="h-3 w-3" />
                      {ref.type === 'ai_model'
                        ? 'AI Model'
                        : 'External API'}: {ref.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Logs Modal */}
      {showLogsModal && selectedSecret && (
        <Modal
          title={`Access Logs: ${selectedSecret.displayName}`}
          onClose={() => setShowLogsModal(false)}
        >
          <div className="max-h-96 overflow-y-auto">
            {accessLogs.length === 0 ? (
              <p className="text-center text-gray-500">No access logs found</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">
                      Action
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">
                      User
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {accessLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            log.action === 'view'
                              ? 'bg-blue-100 text-blue-700'
                              : log.action === 'create'
                                ? 'bg-green-100 text-green-700'
                                : log.action === 'update'
                                  ? 'bg-amber-100 text-amber-700'
                                  : log.action === 'delete'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {log.userEmail || log.userId || 'Unknown'}
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        {formatDate(log.timestamp)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

// Modal Component
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

// Secret Form Component
function SecretForm({
  formData,
  setFormData,
  onSubmit,
  onCancel,
  saving,
  error,
  isEdit,
}: {
  formData: {
    name: string;
    displayName: string;
    category: SecretCategory;
    description: string;
    value: string;
    provider: string;
    isActive: boolean;
  };
  setFormData: React.Dispatch<
    React.SetStateAction<{
      name: string;
      displayName: string;
      category: SecretCategory;
      description: string;
      value: string;
      provider: string;
      isActive: boolean;
    }>
  >;
  onSubmit: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  isEdit: boolean;
}) {
  const [showValue, setShowValue] = useState(false);

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) =>
            setFormData({ ...formData, name: e.target.value.toLowerCase() })
          }
          placeholder="e.g., openai-api-key"
          disabled={isEdit}
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:bg-gray-100"
        />
        <p className="mt-1 text-xs text-gray-500">
          Lowercase alphanumeric with hyphens only
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Display Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.displayName}
          onChange={(e) =>
            setFormData({ ...formData, displayName: e.target.value })
          }
          placeholder="e.g., OpenAI API Key"
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Category <span className="text-red-500">*</span>
        </label>
        <select
          value={formData.category}
          onChange={(e) =>
            setFormData({
              ...formData,
              category: e.target.value as SecretCategory,
            })
          }
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
        >
          {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
            <option key={key} value={key}>
              {config.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Provider
        </label>
        <input
          type="text"
          value={formData.provider}
          onChange={(e) =>
            setFormData({ ...formData, provider: e.target.value })
          }
          placeholder="e.g., OpenAI, Anthropic, Tavily"
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Value {!isEdit && <span className="text-red-500">*</span>}
        </label>
        <div className="relative mt-1">
          <input
            type={showValue ? 'text' : 'password'}
            value={formData.value}
            onChange={(e) =>
              setFormData({ ...formData, value: e.target.value })
            }
            placeholder={
              isEdit
                ? 'Leave empty to keep existing value'
                : 'Enter secret value'
            }
            className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-10 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          />
          <button
            type="button"
            onClick={() => setShowValue(!showValue)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showValue ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Description
        </label>
        <textarea
          value={formData.description}
          onChange={(e) =>
            setFormData({ ...formData, description: e.target.value })
          }
          placeholder="Optional description"
          rows={2}
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isActive"
          checked={formData.isActive}
          onChange={(e) =>
            setFormData({ ...formData, isActive: e.target.checked })
          }
          className="rounded border-gray-300 text-amber-500 focus:ring-amber-500"
        />
        <label htmlFor="isActive" className="text-sm text-gray-700">
          Active
        </label>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <button
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={onSubmit}
          disabled={
            saving ||
            (!isEdit &&
              (!formData.name || !formData.displayName || !formData.value))
          }
          className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-amber-500/25 transition-all hover:shadow-xl disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {isEdit ? 'Update' : 'Create'}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
