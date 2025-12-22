'use client';

import { useState, useEffect } from 'react';
import { useApiGet, useApiPut, useApiPost } from '@/hooks/useApi';
import {
  Mail,
  Globe,
  Bot,
  Shield,
  HardDrive,
  Save,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  TestTube,
} from 'lucide-react';
import { toast } from '@/stores/toastStore';

interface SmtpSettings {
  host: string | null;
  port: number;
  user: string | null;
  pass: string | null;
  from: string;
  enabled: boolean;
  adminEmail: string | null;
}

interface SiteSettings {
  siteName: string;
  siteDescription: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  allowRegistration: boolean;
  requireEmailVerification: boolean;
}

interface AiSettings {
  defaultModel: string;
  maxTokens: number;
  temperature: number;
  rateLimitPerMinute: number;
  rateLimitPerDay: number;
}

interface SecuritySettings {
  sessionTimeoutHours: number;
  maxLoginAttempts: number;
  lockoutDurationMinutes: number;
}

interface StorageSettings {
  maxUploadSizeMb: number;
  allowedFileTypes: string;
}

type TabId = 'email' | 'site' | 'ai' | 'security' | 'storage';

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'email', label: 'Email (SMTP)', icon: Mail },
  { id: 'site', label: 'Site', icon: Globe },
  { id: 'ai', label: 'AI', icon: Bot },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'storage', label: 'Storage', icon: HardDrive },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('email');
  const [isTesting, setIsTesting] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50/30 p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">System Settings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configure system-wide settings for email, site, AI, security, and
            storage.
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex space-x-1 rounded-lg bg-white p-1 shadow-sm">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          {activeTab === 'email' && <EmailSettingsTab />}
          {activeTab === 'site' && <SiteSettingsTab />}
          {activeTab === 'ai' && <AiSettingsTab />}
          {activeTab === 'security' && <SecuritySettingsTab />}
          {activeTab === 'storage' && <StorageSettingsTab />}
        </div>
      </div>
    </div>
  );
}

// ========== Email Settings Tab ==========
function EmailSettingsTab() {
  const {
    data,
    loading,
    execute: refetch,
  } = useApiGet<SmtpSettings>('/api/v1/admin/settings/smtp', {
    immediate: true,
  });
  const { execute: updateSettings, loading: saving } = useApiPut<
    { success: boolean },
    Partial<SmtpSettings>
  >('/api/v1/admin/settings/smtp');
  const { execute: testConnection, loading: testing } = useApiPost<{
    success: boolean;
    message: string;
  }>('/api/v1/admin/settings/smtp/test');

  const [form, setForm] = useState<Partial<SmtpSettings>>({});

  useEffect(() => {
    if (data) {
      setForm({
        host: data.host || '',
        port: data.port || 587,
        user: data.user || '',
        pass: '',
        from: data.from || '',
        enabled: data.enabled || false,
        adminEmail: data.adminEmail || '',
      });
    }
  }, [data]);

  const handleSave = async () => {
    try {
      await updateSettings(form);
      toast.success('SMTP settings saved');
      refetch();
    } catch {
      toast.error('Failed to save settings');
    }
  };

  const handleTest = async () => {
    try {
      const result = await testConnection({});
      if (result?.success) {
        toast.success(result.message);
      } else {
        toast.error(result?.message || 'Connection test failed');
      }
    } catch {
      toast.error('Connection test failed');
    }
  };

  if (loading) {
    return <LoadingState />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Email (SMTP) Settings
          </h2>
          <p className="text-sm text-gray-500">
            Configure email server for notifications
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={form.enabled || false}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">
            Enable Email
          </span>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            SMTP Host
          </label>
          <input
            type="text"
            value={form.host || ''}
            onChange={(e) => setForm({ ...form, host: e.target.value })}
            placeholder="smtp.gmail.com"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            SMTP Port
          </label>
          <input
            type="number"
            value={form.port || 587}
            onChange={(e) =>
              setForm({ ...form, port: parseInt(e.target.value) })
            }
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">587 for TLS, 465 for SSL</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Username
          </label>
          <input
            type="email"
            value={form.user || ''}
            onChange={(e) => setForm({ ...form, user: e.target.value })}
            placeholder="your-email@gmail.com"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            type="password"
            value={form.pass || ''}
            onChange={(e) => setForm({ ...form, pass: e.target.value })}
            placeholder="Leave empty to keep current"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            For Gmail, use App Password
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            From Address
          </label>
          <input
            type="text"
            value={form.from || ''}
            onChange={(e) => setForm({ ...form, from: e.target.value })}
            placeholder="DeepDive <noreply@deepdive.ai>"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Admin Email
          </label>
          <input
            type="email"
            value={form.adminEmail || ''}
            onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
            placeholder="admin@example.com"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Receives system notifications
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t pt-4">
        <button
          onClick={handleTest}
          disabled={testing}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {testing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <TestTube className="h-4 w-4" />
          )}
          Test Connection
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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
  );
}

// ========== Site Settings Tab ==========
function SiteSettingsTab() {
  const {
    data,
    loading,
    execute: refetch,
  } = useApiGet<SiteSettings>('/api/v1/admin/settings/site', {
    immediate: true,
  });
  const { execute: updateSettings, loading: saving } = useApiPut<
    { success: boolean },
    Partial<SiteSettings>
  >('/api/v1/admin/settings/site');

  const [form, setForm] = useState<Partial<SiteSettings>>({});

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const handleSave = async () => {
    try {
      await updateSettings(form);
      toast.success('Site settings saved');
      refetch();
    } catch {
      toast.error('Failed to save settings');
    }
  };

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Site Settings</h2>
        <p className="text-sm text-gray-500">
          Configure site name and behavior
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Site Name
          </label>
          <input
            type="text"
            value={form.siteName || ''}
            onChange={(e) => setForm({ ...form, siteName: e.target.value })}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Site Description
          </label>
          <input
            type="text"
            value={form.siteDescription || ''}
            onChange={(e) =>
              setForm({ ...form, siteDescription: e.target.value })
            }
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={form.maintenanceMode || false}
            onChange={(e) =>
              setForm({ ...form, maintenanceMode: e.target.checked })
            }
            className="h-4 w-4 rounded border-gray-300 text-blue-600"
          />
          <span className="text-sm font-medium text-gray-700">
            Maintenance Mode
          </span>
        </label>

        {form.maintenanceMode && (
          <div className="ml-7">
            <input
              type="text"
              value={form.maintenanceMessage || ''}
              onChange={(e) =>
                setForm({ ...form, maintenanceMessage: e.target.value })
              }
              placeholder="Maintenance message..."
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        )}

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={form.allowRegistration !== false}
            onChange={(e) =>
              setForm({ ...form, allowRegistration: e.target.checked })
            }
            className="h-4 w-4 rounded border-gray-300 text-blue-600"
          />
          <span className="text-sm font-medium text-gray-700">
            Allow New User Registration
          </span>
        </label>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={form.requireEmailVerification || false}
            onChange={(e) =>
              setForm({ ...form, requireEmailVerification: e.target.checked })
            }
            className="h-4 w-4 rounded border-gray-300 text-blue-600"
          />
          <span className="text-sm font-medium text-gray-700">
            Require Email Verification
          </span>
        </label>
      </div>

      <div className="flex justify-end border-t pt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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
  );
}

// ========== AI Settings Tab ==========
function AiSettingsTab() {
  const {
    data,
    loading,
    execute: refetch,
  } = useApiGet<AiSettings>('/api/v1/admin/settings/ai', { immediate: true });
  const { execute: updateSettings, loading: saving } = useApiPut<
    { success: boolean },
    Partial<AiSettings>
  >('/api/v1/admin/settings/ai');

  const [form, setForm] = useState<Partial<AiSettings>>({});

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const handleSave = async () => {
    try {
      await updateSettings(form);
      toast.success('AI settings saved');
      refetch();
    } catch {
      toast.error('Failed to save settings');
    }
  };

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">AI Settings</h2>
        <p className="text-sm text-gray-500">
          Configure AI model defaults and rate limits
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Default Model
          </label>
          <select
            value={form.defaultModel || 'gpt-4o-mini'}
            onChange={(e) => setForm({ ...form, defaultModel: e.target.value })}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="gpt-4o-mini">GPT-4o Mini</option>
            <option value="gpt-4o">GPT-4o</option>
            <option value="gpt-4-turbo">GPT-4 Turbo</option>
            <option value="claude-3-sonnet">Claude 3 Sonnet</option>
            <option value="claude-3-opus">Claude 3 Opus</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Max Tokens
          </label>
          <input
            type="number"
            value={form.maxTokens || 4096}
            onChange={(e) =>
              setForm({ ...form, maxTokens: parseInt(e.target.value) })
            }
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Temperature
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="2"
            value={form.temperature || 0.7}
            onChange={(e) =>
              setForm({ ...form, temperature: parseFloat(e.target.value) })
            }
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            0 = deterministic, 1 = creative
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Rate Limit (per minute)
          </label>
          <input
            type="number"
            value={form.rateLimitPerMinute || 20}
            onChange={(e) =>
              setForm({ ...form, rateLimitPerMinute: parseInt(e.target.value) })
            }
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Rate Limit (per day)
          </label>
          <input
            type="number"
            value={form.rateLimitPerDay || 500}
            onChange={(e) =>
              setForm({ ...form, rateLimitPerDay: parseInt(e.target.value) })
            }
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex justify-end border-t pt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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
  );
}

// ========== Security Settings Tab ==========
function SecuritySettingsTab() {
  const {
    data,
    loading,
    execute: refetch,
  } = useApiGet<SecuritySettings>('/api/v1/admin/settings/security', {
    immediate: true,
  });
  const { execute: updateSettings, loading: saving } = useApiPut<
    { success: boolean },
    Partial<SecuritySettings>
  >('/api/v1/admin/settings/security');

  const [form, setForm] = useState<Partial<SecuritySettings>>({});

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const handleSave = async () => {
    try {
      await updateSettings(form);
      toast.success('Security settings saved');
      refetch();
    } catch {
      toast.error('Failed to save settings');
    }
  };

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          Security Settings
        </h2>
        <p className="text-sm text-gray-500">
          Configure session and login security
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Session Timeout (hours)
          </label>
          <input
            type="number"
            value={form.sessionTimeoutHours || 24}
            onChange={(e) =>
              setForm({
                ...form,
                sessionTimeoutHours: parseInt(e.target.value),
              })
            }
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Max Login Attempts
          </label>
          <input
            type="number"
            value={form.maxLoginAttempts || 5}
            onChange={(e) =>
              setForm({ ...form, maxLoginAttempts: parseInt(e.target.value) })
            }
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Lockout Duration (minutes)
          </label>
          <input
            type="number"
            value={form.lockoutDurationMinutes || 15}
            onChange={(e) =>
              setForm({
                ...form,
                lockoutDurationMinutes: parseInt(e.target.value),
              })
            }
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex justify-end border-t pt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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
  );
}

// ========== Storage Settings Tab ==========
function StorageSettingsTab() {
  const {
    data,
    loading,
    execute: refetch,
  } = useApiGet<StorageSettings>('/api/v1/admin/settings/storage', {
    immediate: true,
  });
  const { execute: updateSettings, loading: saving } = useApiPut<
    { success: boolean },
    Partial<StorageSettings>
  >('/api/v1/admin/settings/storage');

  const [form, setForm] = useState<Partial<StorageSettings>>({});

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const handleSave = async () => {
    try {
      await updateSettings(form);
      toast.success('Storage settings saved');
      refetch();
    } catch {
      toast.error('Failed to save settings');
    }
  };

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          Storage Settings
        </h2>
        <p className="text-sm text-gray-500">Configure file upload limits</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Max Upload Size (MB)
          </label>
          <input
            type="number"
            value={form.maxUploadSizeMb || 10}
            onChange={(e) =>
              setForm({ ...form, maxUploadSizeMb: parseInt(e.target.value) })
            }
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Allowed File Types
          </label>
          <input
            type="text"
            value={form.allowedFileTypes || ''}
            onChange={(e) =>
              setForm({ ...form, allowedFileTypes: e.target.value })
            }
            placeholder="image/*,application/pdf,.doc,.docx"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Comma-separated list of MIME types or extensions
          </p>
        </div>
      </div>

      <div className="flex justify-end border-t pt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
    </div>
  );
}
