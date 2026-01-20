'use client';

import { useState, useEffect } from 'react';
import {
  HardDrive,
  Cloud,
  Folder,
  Save,
  Loader2,
  Check,
  X,
  Settings,
} from 'lucide-react';
import { getAuthTokens } from '@/lib/utils/auth';

interface StorageConfig {
  provider: 'local' | 's3' | 'azure' | 'gdrive' | 'b2';
  localPath: string;
  s3Bucket: string;
  s3Region: string;
  gdriveClientId: string;
  gdriveClientSecret: string;
  gdriveFolderId: string;
  b2KeyId: string;
  b2AppKey: string;
  b2BucketName: string;
  b2BucketId: string;
  maxFileSize: number;
  allowedTypes: string[];
}

type ProviderId = StorageConfig['provider'];

interface ProviderInfo {
  id: ProviderId;
  label: string;
  description: string;
  icon: typeof Folder;
  color: string;
  bgColor: string;
  borderColor: string;
}

const PROVIDERS: ProviderInfo[] = [
  {
    id: 'local',
    label: 'Local Storage',
    description: 'Store files on local disk',
    icon: Folder,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-500',
  },
  {
    id: 's3',
    label: 'Amazon S3',
    description: 'AWS cloud object storage',
    icon: Cloud,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-500',
  },
  {
    id: 'azure',
    label: 'Azure Blob',
    description: 'Microsoft Azure storage',
    icon: Cloud,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50',
    borderColor: 'border-cyan-500',
  },
  {
    id: 'gdrive',
    label: 'Google Drive',
    description: 'Google cloud storage',
    icon: Cloud,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-500',
  },
  {
    id: 'b2',
    label: 'Backblaze B2',
    description: 'Affordable cloud storage',
    icon: Cloud,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-500',
  },
];

// Configuration modal for each provider
function ConfigModal({
  isOpen,
  onClose,
  onSave,
  provider,
  config,
  setConfig,
  saving,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  provider: ProviderInfo | null;
  config: StorageConfig;
  setConfig: (config: StorageConfig) => void;
  saving: boolean;
}) {
  if (!isOpen || !provider) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${provider.bgColor}`}
            >
              <provider.icon className={`h-5 w-5 ${provider.color}`} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {provider.label} Settings
              </h2>
              <p className="text-sm text-gray-500">{provider.description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {provider.id === 'local' && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Upload Path
              </label>
              <input
                type="text"
                value={config.localPath}
                onChange={(e) =>
                  setConfig({ ...config, localPath: e.target.value })
                }
                placeholder="/uploads"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
          )}

          {provider.id === 's3' && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Bucket Name
                </label>
                <input
                  type="text"
                  value={config.s3Bucket}
                  onChange={(e) =>
                    setConfig({ ...config, s3Bucket: e.target.value })
                  }
                  placeholder="my-bucket"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Region
                </label>
                <select
                  value={config.s3Region}
                  onChange={(e) =>
                    setConfig({ ...config, s3Region: e.target.value })
                  }
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                >
                  <option value="us-east-1">US East (N. Virginia)</option>
                  <option value="us-west-2">US West (Oregon)</option>
                  <option value="eu-west-1">EU (Ireland)</option>
                  <option value="ap-northeast-1">Asia Pacific (Tokyo)</option>
                </select>
              </div>
            </>
          )}

          {provider.id === 'gdrive' && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Client ID
                </label>
                <input
                  type="text"
                  value={config.gdriveClientId}
                  onChange={(e) =>
                    setConfig({ ...config, gdriveClientId: e.target.value })
                  }
                  placeholder="xxx.apps.googleusercontent.com"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Client Secret
                </label>
                <input
                  type="password"
                  value={config.gdriveClientSecret}
                  onChange={(e) =>
                    setConfig({ ...config, gdriveClientSecret: e.target.value })
                  }
                  placeholder="Enter client secret"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Folder ID (optional)
                </label>
                <input
                  type="text"
                  value={config.gdriveFolderId}
                  onChange={(e) =>
                    setConfig({ ...config, gdriveFolderId: e.target.value })
                  }
                  placeholder="Leave empty for root folder"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  The folder ID from the Google Drive URL
                </p>
              </div>
            </>
          )}

          {provider.id === 'b2' && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Application Key ID
                </label>
                <input
                  type="text"
                  value={config.b2KeyId}
                  onChange={(e) =>
                    setConfig({ ...config, b2KeyId: e.target.value })
                  }
                  placeholder="Enter key ID"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Application Key
                </label>
                <input
                  type="password"
                  value={config.b2AppKey}
                  onChange={(e) =>
                    setConfig({ ...config, b2AppKey: e.target.value })
                  }
                  placeholder="Enter application key"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Bucket Name
                </label>
                <input
                  type="text"
                  value={config.b2BucketName}
                  onChange={(e) =>
                    setConfig({ ...config, b2BucketName: e.target.value })
                  }
                  placeholder="my-bucket"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Bucket ID
                </label>
                <input
                  type="text"
                  value={config.b2BucketId}
                  onChange={(e) =>
                    setConfig({ ...config, b2BucketId: e.target.value })
                  }
                  placeholder="Enter bucket ID"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
            </>
          )}
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
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save & Activate
          </button>
        </div>
      </div>
    </div>
  );
}

// Check if a provider is configured
function isProviderConfigured(
  providerId: ProviderId,
  config: StorageConfig
): boolean {
  switch (providerId) {
    case 'local':
      return !!config.localPath;
    case 's3':
      return !!config.s3Bucket;
    case 'azure':
      return false; // Azure config not implemented yet
    case 'gdrive':
      return !!config.gdriveClientId && !!config.gdriveClientSecret;
    case 'b2':
      return !!config.b2KeyId && !!config.b2AppKey && !!config.b2BucketName;
    default:
      return false;
  }
}

export default function StorageSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<StorageConfig>({
    provider: 'local',
    localPath: '/uploads',
    s3Bucket: '',
    s3Region: 'us-east-1',
    gdriveClientId: '',
    gdriveClientSecret: '',
    gdriveFolderId: '',
    b2KeyId: '',
    b2AppKey: '',
    b2BucketName: '',
    b2BucketId: '',
    maxFileSize: 10,
    allowedTypes: ['image/*', 'application/pdf', 'text/*'],
  });
  const [configModalProvider, setConfigModalProvider] =
    useState<ProviderInfo | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const token = getAuthTokens()?.accessToken;
      const res = await fetch('/api/v1/admin/storage-config', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (error) {
      // Silently fail - use defaults
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = getAuthTokens()?.accessToken;
      const res = await fetch('/api/v1/admin/storage-config', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setConfigModalProvider(null);
      }
    } catch (error) {
      // Handle silently
    } finally {
      setSaving(false);
    }
  };

  const handleSetActive = (providerId: ProviderId) => {
    setConfig({ ...config, provider: providerId });
    handleSave();
  };

  const handleSaveAndActivate = async () => {
    if (configModalProvider) {
      setConfig({ ...config, provider: configModalProvider.id });
    }
    await handleSave();
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  return (
    <>
      {/* Provider Cards */}
      <div className="mb-8">
        <div className="mb-4 flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-violet-600" />
          <h3 className="font-medium text-gray-900">Storage Providers</h3>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {PROVIDERS.map((provider) => {
            const isActive = config.provider === provider.id;
            const isConfigured = isProviderConfigured(provider.id, config);

            return (
              <div
                key={provider.id}
                className={`rounded-xl border-2 bg-white p-5 shadow-sm transition-all ${
                  isActive ? provider.borderColor : 'border-gray-200'
                }`}
              >
                {/* Header: Icon + Name + Active Badge */}
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-xl ${provider.bgColor}`}
                    >
                      <provider.icon className={`h-6 w-6 ${provider.color}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-gray-900">
                          {provider.label}
                        </h4>
                        {isActive && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">
                        {provider.description}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Status Info */}
                <div className="mb-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Status:</span>
                    <span
                      className={`flex items-center gap-1 font-medium ${
                        isConfigured ? 'text-green-600' : 'text-gray-400'
                      }`}
                    >
                      {isConfigured ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          Configured
                        </>
                      ) : (
                        <>
                          <X className="h-3.5 w-3.5" />
                          Not configured
                        </>
                      )}
                    </span>
                  </div>

                  {/* Provider-specific info */}
                  {provider.id === 'local' && config.localPath && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Path:</span>
                      <span className="font-mono text-gray-700">
                        {config.localPath}
                      </span>
                    </div>
                  )}
                  {provider.id === 's3' && config.s3Bucket && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Bucket:</span>
                      <span className="font-mono text-gray-700">
                        {config.s3Bucket}
                      </span>
                    </div>
                  )}
                  {provider.id === 'gdrive' && config.gdriveClientId && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Client ID:</span>
                      <span className="font-mono text-gray-700">
                        {config.gdriveClientId.substring(0, 12)}...
                      </span>
                    </div>
                  )}
                  {provider.id === 'b2' && config.b2BucketName && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Bucket:</span>
                      <span className="font-mono text-gray-700">
                        {config.b2BucketName}
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setConfigModalProvider(provider)}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
                  >
                    <Settings className="h-4 w-4" />
                    Configure
                  </button>
                  {!isActive && isConfigured && (
                    <button
                      onClick={() => handleSetActive(provider.id)}
                      className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
                    >
                      Set Active
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* General Settings */}
      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <h3 className="mb-4 font-medium text-gray-900">Upload Limits</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Max File Size (MB)
            </label>
            <input
              type="number"
              value={config.maxFileSize}
              onChange={(e) =>
                setConfig({
                  ...config,
                  maxFileSize: parseInt(e.target.value) || 10,
                })
              }
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:ring-violet-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Allowed File Types
            </label>
            <input
              type="text"
              value={config.allowedTypes.join(', ')}
              onChange={(e) =>
                setConfig({
                  ...config,
                  allowedTypes: e.target.value.split(',').map((s) => s.trim()),
                })
              }
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:ring-violet-500"
              placeholder="image/*, application/pdf"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Settings
          </button>
        </div>
      </div>

      {/* Config Modal */}
      <ConfigModal
        isOpen={!!configModalProvider}
        onClose={() => setConfigModalProvider(null)}
        onSave={handleSaveAndActivate}
        provider={configModalProvider}
        config={config}
        setConfig={setConfig}
        saving={saving}
      />
    </>
  );
}
