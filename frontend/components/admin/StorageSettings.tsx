'use client';

import { useState, useEffect } from 'react';
import { HardDrive, Cloud, Folder, Save, Loader2 } from 'lucide-react';

interface StorageConfig {
  provider: 'local' | 's3' | 'azure';
  localPath: string;
  s3Bucket: string;
  s3Region: string;
  maxFileSize: number;
  allowedTypes: string[];
}

export default function StorageSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<StorageConfig>({
    provider: 'local',
    localPath: '/uploads',
    s3Bucket: '',
    s3Region: 'us-east-1',
    maxFileSize: 10,
    allowedTypes: ['image/*', 'application/pdf', 'text/*'],
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/v1/admin/storage-config', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (error) {
      console.error('Failed to load storage config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/v1/admin/storage-config', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        alert('Storage configuration saved successfully!');
      } else {
        alert('Failed to save storage configuration');
      }
    } catch (error) {
      console.error('Failed to save storage config:', error);
      alert('Failed to save storage configuration');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900">
            Storage Settings
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Configure file storage provider and settings
          </p>
        </div>

        {/* Storage Provider */}
        <div className="mb-8 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-violet-600" />
            <h3 className="font-medium text-gray-900">Storage Provider</h3>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { id: 'local', label: 'Local Storage', icon: Folder },
              { id: 's3', label: 'Amazon S3', icon: Cloud },
              { id: 'azure', label: 'Azure Blob', icon: Cloud },
            ].map((provider) => (
              <button
                key={provider.id}
                onClick={() =>
                  setConfig({
                    ...config,
                    provider: provider.id as StorageConfig['provider'],
                  })
                }
                className={`flex items-center gap-3 rounded-lg border p-4 transition-all ${
                  config.provider === provider.id
                    ? 'border-violet-600 bg-violet-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <provider.icon
                  className={`h-5 w-5 ${
                    config.provider === provider.id
                      ? 'text-violet-600'
                      : 'text-gray-400'
                  }`}
                />
                <span
                  className={`text-sm font-medium ${
                    config.provider === provider.id
                      ? 'text-violet-600'
                      : 'text-gray-700'
                  }`}
                >
                  {provider.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Provider-specific Settings */}
        {config.provider === 'local' && (
          <div className="mb-8 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="mb-4 font-medium text-gray-900">
              Local Storage Settings
            </h3>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Upload Path
              </label>
              <input
                type="text"
                value={config.localPath}
                onChange={(e) =>
                  setConfig({ ...config, localPath: e.target.value })
                }
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:ring-violet-500"
              />
            </div>
          </div>
        )}

        {config.provider === 's3' && (
          <div className="mb-8 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="mb-4 font-medium text-gray-900">
              Amazon S3 Settings
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Bucket Name
                </label>
                <input
                  type="text"
                  value={config.s3Bucket}
                  onChange={(e) =>
                    setConfig({ ...config, s3Bucket: e.target.value })
                  }
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Region
                </label>
                <select
                  value={config.s3Region}
                  onChange={(e) =>
                    setConfig({ ...config, s3Region: e.target.value })
                  }
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:ring-violet-500"
                >
                  <option value="us-east-1">US East (N. Virginia)</option>
                  <option value="us-west-2">US West (Oregon)</option>
                  <option value="eu-west-1">EU (Ireland)</option>
                  <option value="ap-northeast-1">Asia Pacific (Tokyo)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* General Settings */}
        <div className="mb-8 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
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
                    allowedTypes: e.target.value
                      .split(',')
                      .map((s) => s.trim()),
                  })
                }
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:ring-violet-500"
                placeholder="image/*, application/pdf"
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
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
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
