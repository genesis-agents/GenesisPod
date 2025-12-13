'use client';

import { useState, useEffect } from 'react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';

// AI模型类型枚举 - 支持 Tier 分级
type AIModelType =
  | 'CHAT'
  | 'CHAT_FAST'
  | 'IMAGE_GENERATION'
  | 'IMAGE_EDITING'
  | 'MULTIMODAL';

// 模型类型选项 - 按 Tier 分组
const MODEL_TYPE_OPTIONS = [
  // === 文本聊天 Tier ===
  {
    value: 'CHAT',
    label: '标准聊天',
    description: 'GPT-4, Claude, Gemini Pro 等 - 用于复杂对话和深度分析',
    tier: 'text',
  },
  {
    value: 'CHAT_FAST',
    label: '快速聊天',
    description:
      'GPT-4o-mini, Claude Haiku, Gemini Flash 等 - 用于分类、翻译、摘要等低成本任务',
    tier: 'text',
  },
  // === 图片处理 Tier ===
  {
    value: 'IMAGE_GENERATION',
    label: '图片生成',
    description: 'DALL-E 3, Imagen 4, Midjourney 等',
    tier: 'image',
  },
  {
    value: 'IMAGE_EDITING',
    label: '图片编辑',
    description: 'Imagen 3, DALL-E 2 edit 等',
    tier: 'image',
  },
  // === 多模态 Tier ===
  {
    value: 'MULTIMODAL',
    label: '多模态',
    description: 'Gemini 2.0 Flash - 同时支持文本和图片',
    tier: 'multimodal',
  },
];

interface AIModel {
  id: string;
  name: string;
  provider: string;
  modelId: string;
  modelType: AIModelType;
  displayName: string;
  icon: string;
  color: string;
  apiEndpoint: string;
  apiKey: string | null;
  hasApiKey: boolean;
  isEnabled: boolean;
  isDefault: boolean;
  maxTokens: number;
  temperature: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TestResult {
  success: boolean;
  message: string;
  latency?: number;
}

interface DiagnoseResult {
  timestamp: string;
  models: Array<{
    id: string;
    name: string;
    displayName: string;
    provider: string;
    modelId: string;
    apiEndpoint: string;
    isEnabled: boolean;
    isDefault: boolean;
    hasApiKey: boolean;
    apiKeyLength: number;
    apiKeyPrefix: string | null;
    maxTokens: number;
    temperature: number;
    updatedAt: string;
  }>;
  summary: {
    total: number;
    enabled: number;
    withApiKey: number;
    ready: number;
  };
}

// Map model names to their icon URLs
const MODEL_ICONS: Record<string, string> = {
  grok: '/icons/ai/grok.svg',
  'gpt-4': '/icons/ai/openai.svg',
  claude: '/icons/ai/claude.svg',
  gemini: '/icons/ai/gemini.svg',
};

// Standard model configurations with defaults
const STANDARD_MODEL_CONFIGS = [
  {
    id: 'grok',
    name: 'Grok (xAI)',
    provider: 'xAI',
    defaultModelId: 'grok-3-latest',
    defaultEndpoint: 'https://api.x.ai/v1/chat/completions',
    icon: '/icons/ai/grok.svg',
  },
  {
    id: 'gpt-4',
    name: 'ChatGPT (OpenAI)',
    provider: 'OpenAI',
    defaultModelId: 'gpt-4-turbo',
    defaultEndpoint: 'https://api.openai.com/v1/chat/completions',
    icon: '/icons/ai/openai.svg',
  },
  {
    id: 'claude',
    name: 'Claude (Anthropic)',
    provider: 'Anthropic',
    defaultModelId: 'claude-sonnet-4-20250514',
    defaultEndpoint: 'https://api.anthropic.com/v1/messages',
    icon: '/icons/ai/claude.svg',
  },
  {
    id: 'gemini',
    name: 'Gemini (Google)',
    provider: 'Google',
    defaultModelId: 'gemini-2.0-flash',
    defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    icon: '/icons/ai/gemini.svg',
  },
] as const;

function getModelIconUrl(modelName: string): string | null {
  const name = modelName.toLowerCase();
  // 直接匹配
  if (MODEL_ICONS[name]) {
    return MODEL_ICONS[name];
  }
  // 支持带后缀的名称匹配 (如 "gpt-4 #1" -> "gpt-4")
  const baseName = name.replace(/\s*#\d+$/, '').trim();
  if (MODEL_ICONS[baseName]) {
    return MODEL_ICONS[baseName];
  }
  // 模糊匹配 - 检查是否包含已知的模型名
  for (const key of Object.keys(MODEL_ICONS)) {
    if (name.includes(key)) {
      return MODEL_ICONS[key];
    }
  }
  return null;
}

// Model ID Selector with fetch capability
// Shows all available models in a grid layout (no dropdown, no scrollbar)
function ModelIdSelector({
  value,
  onChange,
  provider,
  apiKey,
}: {
  value: string;
  onChange: (modelId: string) => void;
  provider: string;
  apiKey: string;
}) {
  const [availableModels, setAvailableModels] = useState<
    Array<{ id: string; name: string; description?: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const fetchModels = async () => {
    if (!apiKey) {
      setError('请先输入 API Key');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${config.apiUrl}/admin/ai-models/fetch-available`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
          credentials: 'include',
          body: JSON.stringify({ provider, apiKey }),
        }
      );
      const data = await response.json();
      if (data.success && data.models) {
        setAvailableModels(data.models);
        setHasFetched(true);
      } else {
        setError(data.error || '获取模型列表失败');
      }
    } catch (err) {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        Model ID <span className="text-red-500">*</span>
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="gpt-4-turbo"
          className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={fetchModels}
          disabled={loading}
          className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
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
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          )}
          获取
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}

      {/* Show all models in a grid - no dropdown, no scrollbar */}
      {hasFetched && availableModels.length > 0 && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="mb-2 text-xs font-medium text-gray-600">
            可用模型 ({availableModels.length}) - 点击选择:
          </p>
          <div className="flex flex-wrap gap-2">
            {availableModels.map((model) => (
              <button
                key={model.id}
                type="button"
                onClick={() => onChange(model.id)}
                className={`rounded-md border px-2 py-1 font-mono text-xs transition-colors ${
                  value === model.id
                    ? 'border-blue-500 bg-blue-100 text-blue-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50'
                }`}
                title={model.description || model.name}
              >
                {model.id}
              </button>
            ))}
          </div>
        </div>
      )}

      {!hasFetched && (
        <p className="mt-1 text-xs text-gray-500">
          输入 API Key 后点击"获取"按钮可获取可用模型列表
        </p>
      )}
    </div>
  );
}

export default function AIModelSettings() {
  const [models, setModels] = useState<AIModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingModel, setEditingModel] = useState<AIModel | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testingModel, setTestingModel] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>(
    {}
  );
  const [showDiagnose, setShowDiagnose] = useState(false);
  const [diagnoseResult, setDiagnoseResult] = useState<DiagnoseResult | null>(
    null
  );
  const [diagnosing, setDiagnosing] = useState(false);

  // Fetch models from API
  useEffect(() => {
    fetchModels();
  }, []);

  const fetchModels = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${config.apiUrl}/admin/ai-models`, {
        headers: { ...getAuthHeader() },
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setModels(data);
        setError(null);
      } else if (response.status === 401 || response.status === 403) {
        setError('Please sign in as an admin to manage AI models');
      } else {
        setError('Failed to fetch AI models');
      }
    } catch (err) {
      console.error('Failed to fetch AI models:', err);
      setError('Failed to fetch AI models');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEnabled = async (model: AIModel) => {
    try {
      const response = await fetch(
        `${config.apiUrl}/admin/ai-models/${model.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          credentials: 'include',
          body: JSON.stringify({ isEnabled: !model.isEnabled }),
        }
      );

      if (response.ok) {
        const updated = await response.json();
        setModels(models.map((m) => (m.id === model.id ? updated : m)));
        setSuccess(
          `${model.displayName} ${!model.isEnabled ? 'enabled' : 'disabled'}`
        );
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      console.error('Failed to update model:', err);
      setError('Failed to update model');
      setTimeout(() => setError(null), 3000);
    }
  };

  const handleSetDefault = async (model: AIModel) => {
    try {
      // 使用类型化的 API 端点，只在同类型模型中设置默认
      const response = await fetch(
        `${config.apiUrl}/admin/ai-models/${model.id}/set-type-default`,
        {
          method: 'POST',
          headers: { ...getAuthHeader() },
          credentials: 'include',
        }
      );

      if (response.ok) {
        // Refresh models to get updated default status
        await fetchModels();
        const typeLabel =
          MODEL_TYPE_OPTIONS.find((o) => o.value === model.modelType)?.label ||
          model.modelType;
        setSuccess(`${model.displayName} 已设为 ${typeLabel} 类型的默认模型`);
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      console.error('Failed to set default:', err);
      setError('Failed to set default');
      setTimeout(() => setError(null), 3000);
    }
  };

  const handleSaveModel = async (model: AIModel, newApiKey?: string) => {
    setSaving(true);
    try {
      const updateData: Record<string, unknown> = {
        displayName: model.displayName,
        provider: model.provider,
        modelId: model.modelId,
        modelType: model.modelType,
        icon: model.icon,
        color: model.color,
        apiEndpoint: model.apiEndpoint,
        maxTokens: model.maxTokens,
        temperature: model.temperature,
        description: model.description,
      };

      // Only send apiKey if it was changed
      if (newApiKey !== undefined && newApiKey !== '***configured***') {
        updateData.apiKey = newApiKey;
      }

      const response = await fetch(
        `${config.apiUrl}/admin/ai-models/${model.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          credentials: 'include',
          body: JSON.stringify(updateData),
        }
      );

      if (response.ok) {
        const updated = await response.json();
        setModels(models.map((m) => (m.id === model.id ? updated : m)));
        setEditingModel(null);
        setSuccess('Model settings saved');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        throw new Error('Failed to save');
      }
    } catch (err) {
      setError('Failed to save model settings');
      setTimeout(() => setError(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleAddModel = async (
    model: Omit<AIModel, 'id' | 'createdAt' | 'updatedAt' | 'hasApiKey'>,
    workerCount: number = 1
  ) => {
    setSaving(true);
    try {
      const newModels: AIModel[] = [];
      const updatedModels: AIModel[] = [];

      // 批量创建 Worker
      for (let i = 1; i <= workerCount; i++) {
        const workerModel = {
          ...model,
          // 如果只创建1个，使用原始名称；否则添加编号后缀
          name: workerCount === 1 ? model.name : `${model.name} #${i}`,
          displayName:
            workerCount === 1
              ? model.displayName
              : `${model.displayName} #${i}`,
        };

        const response = await fetch(`${config.apiUrl}/admin/ai-models`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          credentials: 'include',
          body: JSON.stringify(workerModel),
        });

        if (response.ok) {
          const result = await response.json();
          if (result.isUpdate) {
            updatedModels.push(result);
          } else {
            newModels.push(result);
          }
        } else {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `Failed to add Worker #${i}`);
        }
      }

      // 更新模型列表
      let updatedModelsList = [...models];
      // 先更新已存在的
      for (const updated of updatedModels) {
        updatedModelsList = updatedModelsList.map((m) =>
          m.id === updated.id ? updated : m
        );
      }
      // 再添加新的
      updatedModelsList = [...updatedModelsList, ...newModels];
      setModels(updatedModelsList);

      // 显示成功消息
      if (workerCount === 1) {
        setSuccess(
          newModels.length > 0
            ? `模型 ${newModels[0].displayName} 已添加`
            : `模型 ${updatedModels[0].displayName} 已更新`
        );
      } else {
        const addedCount = newModels.length;
        const updatedCount = updatedModels.length;
        const messages = [];
        if (addedCount > 0) messages.push(`新增 ${addedCount} 个`);
        if (updatedCount > 0) messages.push(`更新 ${updatedCount} 个`);
        setSuccess(`Worker 创建完成：${messages.join('，')}`);
      }

      setShowAddModal(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add model');
      setTimeout(() => setError(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteModel = async (model: AIModel) => {
    if (model.isDefault) {
      setError('Cannot delete the default model');
      setTimeout(() => setError(null), 3000);
      return;
    }

    if (!confirm(`Are you sure you want to delete ${model.displayName}?`))
      return;

    try {
      const response = await fetch(
        `${config.apiUrl}/admin/ai-models/${model.id}`,
        {
          method: 'DELETE',
          headers: { ...getAuthHeader() },
          credentials: 'include',
        }
      );

      if (response.ok) {
        setModels(models.filter((m) => m.id !== model.id));
        setSuccess('Model deleted');
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      setError('Failed to delete model');
      setTimeout(() => setError(null), 3000);
    }
  };

  const handleTestConnection = async (model: AIModel) => {
    setTestingModel(model.id);
    setTestResults((prev) => ({
      ...prev,
      [model.id]: { success: false, message: 'Testing...' },
    }));

    try {
      const response = await fetch(
        `${config.apiUrl}/admin/ai-models/${model.id}/test`,
        {
          method: 'POST',
          headers: { ...getAuthHeader() },
          credentials: 'include',
        }
      );

      if (response.ok) {
        const result = await response.json();
        setTestResults((prev) => ({
          ...prev,
          [model.id]: {
            success: result.success,
            message: result.message,
            latency: result.latency,
          },
        }));
      } else {
        setTestResults((prev) => ({
          ...prev,
          [model.id]: { success: false, message: 'Test request failed' },
        }));
      }
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [model.id]: { success: false, message: 'Connection error' },
      }));
    } finally {
      setTestingModel(null);
    }
  };

  const handleDiagnose = async () => {
    setDiagnosing(true);
    try {
      const response = await fetch(
        `${config.apiUrl}/admin/ai-models/diagnose`,
        {
          headers: { ...getAuthHeader() },
          credentials: 'include',
        }
      );

      if (response.ok) {
        const result = await response.json();
        setDiagnoseResult(result);
        setShowDiagnose(true);
      } else {
        setError('Failed to diagnose AI models');
        setTimeout(() => setError(null), 3000);
      }
    } catch (err) {
      setError('Network error during diagnosis');
      setTimeout(() => setError(null), 3000);
    } finally {
      setDiagnosing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            AI Model Configuration
          </h2>
          <p className="text-sm text-gray-500">
            Configure AI models, API keys, and test connections
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDiagnose}
            disabled={diagnosing}
            className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-700 shadow-sm transition-all hover:bg-orange-100 disabled:opacity-50"
          >
            {diagnosing ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            ) : (
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
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            )}
            Diagnose
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-700"
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
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add Model
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg bg-green-50 p-4 text-sm text-green-600">
          {success}
        </div>
      )}

      {/* Models Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {models.map((model) => (
          <div
            key={model.id}
            className={`rounded-xl border-2 bg-white p-5 shadow-sm transition-all ${
              model.isDefault ? 'border-blue-500' : 'border-gray-200'
            } ${!model.isEnabled ? 'opacity-60' : ''}`}
          >
            {/* Model Header */}
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br ${model.color} text-2xl text-white shadow-sm`}
                >
                  {(() => {
                    const iconUrl = getModelIconUrl(model.name);
                    // 优先使用 MODEL_ICONS 映射
                    if (iconUrl) {
                      return (
                        <img
                          src={iconUrl}
                          alt={model.displayName}
                          className="h-8 w-8"
                        />
                      );
                    }
                    // 如果 model.icon 是路径，则用 img 显示
                    if (model.icon && model.icon.startsWith('/')) {
                      return (
                        <img
                          src={model.icon}
                          alt={model.displayName}
                          className="h-8 w-8"
                        />
                      );
                    }
                    // 否则显示 emoji 或文字
                    return model.icon || '🤖';
                  })()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">
                      {model.displayName}
                    </h3>
                    {model.isDefault && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">{model.provider}</p>
                </div>
              </div>

              {/* Enable/Disable Toggle */}
              <button
                onClick={() => handleToggleEnabled(model)}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  model.isEnabled ? 'bg-green-500' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                    model.isEnabled ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Model Info */}
            <div className="mb-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Model ID:</span>
                <span className="font-mono text-gray-700">{model.modelId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Type:</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    model.modelType === 'CHAT'
                      ? 'bg-blue-100 text-blue-700'
                      : model.modelType === 'IMAGE_GENERATION'
                        ? 'bg-green-100 text-green-700'
                        : model.modelType === 'IMAGE_EDITING'
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-purple-100 text-purple-700'
                  }`}
                >
                  {MODEL_TYPE_OPTIONS.find((o) => o.value === model.modelType)
                    ?.label || model.modelType}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">API Key:</span>
                <span
                  className={`font-mono ${model.hasApiKey ? 'text-green-600' : 'text-red-500'}`}
                >
                  {model.hasApiKey ? '✓ Configured' : '✗ Not configured'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Max Tokens:</span>
                <span className="text-gray-700">{model.maxTokens}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Temperature:</span>
                <span className="text-gray-700">{model.temperature}</span>
              </div>
            </div>

            {/* Test Result */}
            {testResults[model.id] && (
              <div
                className={`mb-4 rounded-lg p-3 text-sm ${
                  testResults[model.id].success
                    ? 'bg-green-50 text-green-700'
                    : 'bg-red-50 text-red-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{testResults[model.id].message}</span>
                  {testResults[model.id].latency && (
                    <span className="font-mono text-xs">
                      {testResults[model.id].latency}ms
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Description */}
            {model.description && (
              <p className="mb-4 text-sm text-gray-600">{model.description}</p>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              {/* Test Connection */}
              <button
                onClick={() => handleTestConnection(model)}
                disabled={testingModel === model.id || !model.isEnabled}
                className="flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {testingModel === model.id ? (
                  <svg
                    className="h-4 w-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : (
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
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                )}
                Test
              </button>

              {!model.isDefault && model.isEnabled && (
                <button
                  onClick={() => handleSetDefault(model)}
                  className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
                >
                  Set Default
                </button>
              )}
              <button
                onClick={() => setEditingModel(model)}
                className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
              >
                Edit
              </button>
              <button
                onClick={() => handleDeleteModel(model)}
                disabled={model.isDefault}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
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
        ))}
      </div>

      {/* Edit Modal */}
      {editingModel && (
        <EditModelModal
          model={editingModel}
          onSave={handleSaveModel}
          onClose={() => setEditingModel(null)}
          saving={saving}
        />
      )}

      {/* Add Modal */}
      {showAddModal && (
        <AddModelModal
          onAdd={handleAddModel}
          onClose={() => setShowAddModal(false)}
          saving={saving}
        />
      )}

      {/* Diagnose Modal */}
      {showDiagnose && diagnoseResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                AI Models Diagnostic Report
              </h3>
              <button
                onClick={() => setShowDiagnose(false)}
                className="text-gray-500 hover:text-gray-700"
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Summary */}
            <div className="mb-6 grid grid-cols-4 gap-4">
              <div className="rounded-lg bg-gray-50 p-3 text-center">
                <div className="text-2xl font-bold text-gray-900">
                  {diagnoseResult.summary.total}
                </div>
                <div className="text-xs text-gray-500">Total Models</div>
              </div>
              <div className="rounded-lg bg-green-50 p-3 text-center">
                <div className="text-2xl font-bold text-green-600">
                  {diagnoseResult.summary.enabled}
                </div>
                <div className="text-xs text-gray-500">Enabled</div>
              </div>
              <div className="rounded-lg bg-blue-50 p-3 text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {diagnoseResult.summary.withApiKey}
                </div>
                <div className="text-xs text-gray-500">With API Key</div>
              </div>
              <div
                className={`rounded-lg p-3 text-center ${diagnoseResult.summary.ready > 0 ? 'bg-green-50' : 'bg-red-50'}`}
              >
                <div
                  className={`text-2xl font-bold ${diagnoseResult.summary.ready > 0 ? 'text-green-600' : 'text-red-600'}`}
                >
                  {diagnoseResult.summary.ready}
                </div>
                <div className="text-xs text-gray-500">Ready to Use</div>
              </div>
            </div>

            {/* Timestamp */}
            <p className="mb-4 text-xs text-gray-500">
              Diagnosed at:{' '}
              {new Date(diagnoseResult.timestamp).toLocaleString()}
            </p>

            {/* Models Table */}
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">
                      Name
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">
                      Provider
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">
                      Model ID
                    </th>
                    <th className="px-4 py-2 text-center font-medium text-gray-700">
                      Enabled
                    </th>
                    <th className="px-4 py-2 text-center font-medium text-gray-700">
                      API Key
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">
                      Key Prefix
                    </th>
                    <th className="px-4 py-2 text-center font-medium text-gray-700">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {diagnoseResult.models.map((model) => (
                    <tr
                      key={model.id}
                      className={
                        !model.isEnabled ? 'bg-gray-50 opacity-60' : ''
                      }
                    >
                      <td className="px-4 py-2">
                        <div className="font-medium">{model.displayName}</div>
                        <div className="text-xs text-gray-500">
                          {model.name}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-gray-600">
                        {model.provider}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-600">
                        {model.modelId}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {model.isEnabled ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                            No
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {model.hasApiKey ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            {model.apiKeyLength} chars
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                            Missing
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-500">
                        {model.apiKeyPrefix || '-'}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {model.isEnabled && model.hasApiKey ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            Ready
                          </span>
                        ) : !model.isEnabled ? (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                            Disabled
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                            No Key
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Warning if no models ready */}
            {diagnoseResult.summary.ready === 0 && (
              <div className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
                <strong>Warning:</strong> No AI models are ready to use. AI
                responses will fall back to mock data. Please configure at least
                one model with an API key and enable it.
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowDiagnose(false)}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Edit Model Modal - 与 AddModelModal 使用相同界面风格
function EditModelModal({
  model,
  onSave,
  onClose,
  saving,
}: {
  model: AIModel;
  onSave: (model: AIModel, newApiKey?: string) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [formData, setFormData] = useState(model);
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isApiKeyModified, setIsApiKeyModified] = useState(false);
  const [loadingApiKey, setLoadingApiKey] = useState(true);

  // 打开编辑模态框时，获取完整的 API Key
  useEffect(() => {
    const fetchFullApiKey = async () => {
      try {
        const response = await fetch(
          `${config.apiUrl}/admin/ai-models/${model.id}?edit=true`,
          {
            headers: { ...getAuthHeader() },
            credentials: 'include',
          }
        );
        if (response.ok) {
          const data = await response.json();
          setApiKey(data.apiKey || '');
        }
      } catch (err) {
        console.error('Failed to fetch full API key:', err);
        setApiKey(model.apiKey || '');
      } finally {
        setLoadingApiKey(false);
      }
    };
    fetchFullApiKey();
  }, [model.id, model.apiKey]);

  // 记录原始加载的 API Key，用于判断是否修改
  const [originalApiKey, setOriginalApiKey] = useState('');

  // 更新 fetchFullApiKey 后设置原始值
  useEffect(() => {
    if (!loadingApiKey && apiKey) {
      setOriginalApiKey(apiKey);
    }
  }, [loadingApiKey, apiKey]);

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    setIsApiKeyModified(value !== originalApiKey);
  };

  const colorOptions = [
    { value: 'from-blue-500 to-blue-600', label: 'Blue' },
    { value: 'from-green-500 to-green-600', label: 'Green' },
    { value: 'from-orange-500 to-orange-600', label: 'Orange' },
    { value: 'from-purple-500 to-purple-600', label: 'Purple' },
    { value: 'from-red-500 to-red-600', label: 'Red' },
    { value: 'from-pink-500 to-pink-600', label: 'Pink' },
    { value: 'from-indigo-500 to-indigo-600', label: 'Indigo' },
    { value: 'from-gray-500 to-gray-600', label: 'Gray' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">
          Edit {model.displayName}
        </h3>

        <div className="space-y-4">
          {/* Model Name - Read Only */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              模型标识
            </label>
            <input
              type="text"
              value={`${model.name} (${model.provider})`}
              readOnly
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600"
            />
          </div>

          {/* Model Type (功能类型) - Editable */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              功能类型
            </label>
            <select
              value={formData.modelType}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  modelType: e.target.value as AIModelType,
                })
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {MODEL_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} - {option.description}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Display Name
              </label>
              <input
                type="text"
                value={formData.displayName}
                onChange={(e) =>
                  setFormData({ ...formData, displayName: e.target.value })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Provider
              </label>
              <input
                type="text"
                value={formData.provider}
                readOnly
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600"
              />
            </div>
          </div>

          {/* API Configuration Section - Same style as AddModelModal */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <h4 className="mb-3 text-sm font-semibold text-blue-800">
              API 配置
              {model.hasApiKey && !isApiKeyModified && (
                <span className="ml-2 text-xs font-normal text-green-600">
                  (已配置)
                </span>
              )}
              {isApiKeyModified && (
                <span className="ml-2 text-xs font-normal text-orange-600">
                  (已修改)
                </span>
              )}
            </h4>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  API Endpoint <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.apiEndpoint}
                  onChange={(e) =>
                    setFormData({ ...formData, apiEndpoint: e.target.value })
                  }
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  API Key <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  {loadingApiKey ? (
                    <div className="flex h-10 w-full items-center rounded-lg border border-gray-300 bg-gray-50 px-3">
                      <span className="text-sm text-gray-500">Loading...</span>
                    </div>
                  ) : (
                    <>
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => handleApiKeyChange(e.target.value)}
                        placeholder={model.hasApiKey ? '' : 'sk-...'}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 pr-10 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      >
                        {showApiKey ? '🙈' : '👁️'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <ModelIdSelector
                value={formData.modelId}
                onChange={(modelId) => setFormData({ ...formData, modelId })}
                provider={formData.provider}
                apiKey={apiKey || ''}
              />
            </div>
          </div>

          {/* Display Settings - Collapsed */}
          <details className="rounded-lg border border-gray-200">
            <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              显示设置（可选）
            </summary>
            <div className="space-y-3 border-t border-gray-200 p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Icon Path
                  </label>
                  <input
                    type="text"
                    value={formData.icon}
                    onChange={(e) =>
                      setFormData({ ...formData, icon: e.target.value })
                    }
                    placeholder="/icons/ai/grok.svg"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Color
                  </label>
                  <select
                    value={formData.color}
                    onChange={(e) =>
                      setFormData({ ...formData, color: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {colorOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </details>

          {/* Advanced Settings - Collapsed */}
          <details className="rounded-lg border border-gray-200">
            <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              高级设置（可选）
            </summary>
            <div className="space-y-3 border-t border-gray-200 p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Max Tokens
                  </label>
                  <input
                    type="number"
                    value={formData.maxTokens}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        maxTokens: parseInt(e.target.value),
                      })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Temperature
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={formData.temperature}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        temperature: parseFloat(e.target.value),
                      })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Description
                </label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </details>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              onClick={() =>
                onSave(formData, isApiKeyModified ? apiKey : undefined)
              }
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存更改'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Add Model Modal
function AddModelModal({
  onAdd,
  onClose,
  saving,
}: {
  onAdd: (
    model: Omit<AIModel, 'id' | 'createdAt' | 'updatedAt' | 'hasApiKey'>,
    workerCount?: number
  ) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [formData, setFormData] = useState({
    name: '',
    provider: '',
    modelId: '',
    modelType: 'CHAT' as AIModelType,
    displayName: '',
    icon: '',
    color: 'from-gray-500 to-gray-600',
    apiEndpoint: '',
    apiKey: null as string | null,
    isEnabled: true,
    isDefault: false,
    maxTokens: 4096,
    temperature: 0.7,
    description: '',
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [workerCount, setWorkerCount] = useState(1); // 默认创建1个

  const colorOptions = [
    { value: 'from-blue-500 to-blue-600', label: 'Blue' },
    { value: 'from-green-500 to-green-600', label: 'Green' },
    { value: 'from-orange-500 to-orange-600', label: 'Orange' },
    { value: 'from-purple-500 to-purple-600', label: 'Purple' },
    { value: 'from-red-500 to-red-600', label: 'Red' },
    { value: 'from-pink-500 to-pink-600', label: 'Pink' },
    { value: 'from-indigo-500 to-indigo-600', label: 'Indigo' },
    { value: 'from-gray-500 to-gray-600', label: 'Gray' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">
          Add New AI Model
        </h3>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Model Type <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.name}
              onChange={(e) => {
                const selected = STANDARD_MODEL_CONFIGS.find(
                  (m) => m.id === e.target.value
                );
                if (selected) {
                  setFormData({
                    ...formData,
                    name: selected.id,
                    displayName: selected.name,
                    provider: selected.provider,
                    modelId: selected.defaultModelId,
                    apiEndpoint: selected.defaultEndpoint,
                    icon: selected.icon,
                  });
                }
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select a model type...</option>
              {STANDARD_MODEL_CONFIGS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} ({model.provider})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              选择后会自动填充默认配置
            </p>
          </div>

          {/* Model Type (功能类型) */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              功能类型 <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.modelType}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  modelType: e.target.value as AIModelType,
                })
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {MODEL_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} - {option.description}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              决定模型用于文本聊天、图片生成还是图片编辑
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Display Name
              </label>
              <input
                type="text"
                value={formData.displayName}
                onChange={(e) =>
                  setFormData({ ...formData, displayName: e.target.value })
                }
                placeholder="Auto-filled from model type"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Provider
              </label>
              <input
                type="text"
                value={formData.provider}
                readOnly
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600"
              />
            </div>
          </div>

          {/* API Configuration Section */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <h4 className="mb-3 text-sm font-semibold text-blue-800">
              API 配置
            </h4>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  API Endpoint <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.apiEndpoint}
                  onChange={(e) =>
                    setFormData({ ...formData, apiEndpoint: e.target.value })
                  }
                  placeholder="https://api.openai.com/v1/chat/completions"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  API Key <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={formData.apiKey || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        apiKey: e.target.value || null,
                      })
                    }
                    placeholder="sk-..."
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 pr-10 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showApiKey ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <ModelIdSelector
                value={formData.modelId}
                onChange={(modelId) => setFormData({ ...formData, modelId })}
                provider={formData.provider}
                apiKey={formData.apiKey || ''}
              />
            </div>
          </div>

          {/* Display Settings - Collapsed */}
          <details className="rounded-lg border border-gray-200">
            <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              显示设置（可选）
            </summary>
            <div className="space-y-3 border-t border-gray-200 p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Icon Path
                  </label>
                  <input
                    type="text"
                    value={formData.icon}
                    onChange={(e) =>
                      setFormData({ ...formData, icon: e.target.value })
                    }
                    placeholder="/icons/ai/grok.svg"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Color
                  </label>
                  <select
                    value={formData.color}
                    onChange={(e) =>
                      setFormData({ ...formData, color: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {colorOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </details>

          {/* 横向扩展 - Worker 数量 */}
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-purple-800">
              <span>🚀</span> 横向扩展（可选）
            </h4>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Worker 数量
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={workerCount}
                  onChange={(e) => setWorkerCount(parseInt(e.target.value))}
                  className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-purple-200 accent-purple-600"
                />
                <span className="w-8 text-center text-lg font-bold text-purple-700">
                  {workerCount}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {workerCount === 1
                  ? '创建单个模型配置'
                  : `将创建 ${workerCount} 个相同配置的 Worker（名称后缀 #1, #2, ...）`}
              </p>
            </div>
          </div>

          {/* Advanced Settings - Collapsed */}
          <details className="rounded-lg border border-gray-200">
            <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              高级设置（可选）
            </summary>
            <div className="space-y-3 border-t border-gray-200 p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Max Tokens
                  </label>
                  <input
                    type="number"
                    value={formData.maxTokens}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        maxTokens: parseInt(e.target.value),
                      })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Temperature
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={formData.temperature}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        temperature: parseFloat(e.target.value),
                      })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Description
                </label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </details>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              onClick={() =>
                onAdd(
                  {
                    ...formData,
                    apiKey: formData.apiKey || null,
                  } as any,
                  workerCount
                )
              }
              disabled={saving || !formData.name || !formData.apiKey}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving
                ? '保存中...'
                : workerCount === 1
                  ? '添加模型'
                  : `添加 ${workerCount} 个 Worker`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
