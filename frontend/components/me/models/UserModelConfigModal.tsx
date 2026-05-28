'use client';

import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/dialogs/Modal';
import { UserModelIdSelector } from './UserModelIdSelector';
import {
  type UserModelConfig,
  type UserModelType,
  USER_MODEL_TYPE_OPTIONS,
  useUserModelConfigs,
  type CreateUserModelConfigInput,
} from '@/hooks/features/useUserModelConfigs';
import { useUserApiKeys } from '@/hooks/features/useUserApiKeys';

interface Props {
  provider: string;
  /** 表单里当前 API Key（从外层传入，用于「获取可用模型」按钮实时调 provider） */
  apiKey: string;
  apiEndpoint?: string;
  /** 传入则编辑，否则新增 */
  initial?: UserModelConfig | null;
  onClose: () => void;
  onSaved?: () => void;
}

const API_FORMAT_OPTIONS = [
  {
    value: 'openai',
    label: 'OpenAI 兼容 (默认，适合 OpenAI/DeepSeek/xAI/Groq…)',
  },
  { value: 'anthropic', label: 'Anthropic (Claude)' },
  { value: 'google', label: 'Google (Gemini)' },
  { value: 'cohere', label: 'Cohere' },
];

const TOKEN_PARAM_OPTIONS = [
  { value: 'max_tokens', label: 'max_tokens (多数模型)' },
  {
    value: 'max_completion_tokens',
    label: 'max_completion_tokens (o1/gpt-5 推理系列)',
  },
];

export function UserModelConfigModal({
  provider: initialProvider,
  apiKey,
  apiEndpoint,
  initial,
  onClose,
  onSaved,
}: Props) {
  const { create, update, mutating } = useUserModelConfigs();
  const { keys: userKeys } = useUserApiKeys();
  const isEdit = !!initial;

  // Provider（新增时可选；编辑时固定为 initial.provider）
  const [provider, setProvider] = useState(
    initial?.provider ?? initialProvider
  );
  // 表单字段
  const [modelType, setModelType] = useState<UserModelType>(
    initial?.modelType ?? 'CHAT'
  );
  const [modelId, setModelId] = useState(initial?.modelId ?? '');
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '');
  const [endpoint, setEndpoint] = useState(initial?.apiEndpoint ?? '');
  // 2026-05-27 BYOK：该模型运行时使用哪把用户 Key（UserApiKey.id），空 = provider 默认
  const [apiKeyId, setApiKeyId] = useState(initial?.apiKeyId ?? '');
  const [maxTokens, setMaxTokens] = useState(
    String(initial?.maxTokens ?? 4096)
  );
  const [temperature, setTemperature] = useState(
    String(initial?.temperature ?? 0.7)
  );
  const [apiFormat, setApiFormat] = useState(initial?.apiFormat ?? 'openai');
  const [isReasoning, setIsReasoning] = useState(initial?.isReasoning ?? false);
  const [supportsTemperature, setSupportsTemperature] = useState(
    initial?.supportsTemperature ?? true
  );
  const [supportsStreaming, setSupportsStreaming] = useState(
    initial?.supportsStreaming ?? true
  );
  const [supportsFunctionCalling, setSupportsFunctionCalling] = useState(
    initial?.supportsFunctionCalling ?? true
  );
  const [supportsVision, setSupportsVision] = useState(
    initial?.supportsVision ?? false
  );
  const [tokenParamName, setTokenParamName] = useState(
    initial?.tokenParamName ?? 'max_tokens'
  );
  const [priority, setPriority] = useState(String(initial?.priority ?? 50));
  const [isEnabled, setIsEnabled] = useState(initial?.isEnabled ?? true);
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [rpmLimit, setRpmLimit] = useState(
    initial?.rpmLimit != null ? String(initial.rpmLimit) : ''
  );
  const [tpmLimit, setTpmLimit] = useState(
    initial?.tpmLimit != null ? String(initial.tpmLimit) : ''
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  // 用户是否手动动过能力字段；一旦动过就停止自动推断，尊重用户选择
  const [reasoningTouched, setReasoningTouched] = useState(false);

  // 自动推断：只在新建 + 用户还没手动改过能力字段时触发
  // 避免"改个 modelId 就把用户刚调好的设置重置"
  useEffect(() => {
    if (isEdit || reasoningTouched || !modelId) return;
    const lower = modelId.toLowerCase();
    const looksReasoning =
      lower.startsWith('o1') ||
      lower.startsWith('o3') ||
      lower.startsWith('o4') ||
      lower.includes('gpt-5') ||
      lower.includes('reasoner');
    if (looksReasoning) {
      setIsReasoning(true);
      setTokenParamName('max_completion_tokens');
      setSupportsTemperature(false);
    } else {
      // 如果用户一开始输了推理模型 ID，后来改成普通模型 ID，自动恢复默认
      setIsReasoning(false);
      setTokenParamName('max_tokens');
      setSupportsTemperature(true);
    }
  }, [modelId, isEdit, reasoningTouched]);

  const canSave = useMemo(
    () => !!(modelId.trim() && displayName.trim()),
    [modelId, displayName]
  );

  const buildPayload = (): CreateUserModelConfigInput => ({
    provider,
    modelId: modelId.trim(),
    displayName: displayName.trim(),
    modelType,
    apiEndpoint: endpoint.trim() || null,
    apiKeyId: apiKeyId.trim() || null,
    maxTokens: Number(maxTokens) || 4096,
    temperature: Number(temperature) || 0.7,
    apiFormat,
    isReasoning,
    supportsTemperature,
    supportsStreaming,
    supportsFunctionCalling,
    supportsVision,
    tokenParamName,
    defaultTimeoutMs: initial?.defaultTimeoutMs ?? 120000,
    priority: Number(priority) || 50,
    isEnabled,
    isDefault,
    description: description.trim() || null,
    priceInputPerMillion: null,
    priceOutputPerMillion: null,
    embeddingDimensions: null,
    maxInputTokens: null,
    rpmLimit: rpmLimit.trim() ? Number(rpmLimit) || null : null,
    tpmLimit: tpmLimit.trim() ? Number(tpmLimit) || null : null,
  });

  const handleSave = async () => {
    const payload = buildPayload();
    const ok = isEdit
      ? await update(initial.id, payload)
      : !!(await create(payload));
    if (ok) {
      onSaved?.();
      onClose();
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="2xl"
      title={isEdit ? '编辑模型配置' : '添加模型配置'}
      subtitle={`provider: ${provider}`}
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            disabled={!canSave || mutating}
            onClick={handleSave}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {mutating ? '保存中...' : isEdit ? '保存' : '添加'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Provider —— 改为可输入文本 + datalist autocomplete (用户反馈:
            本地模型 / 自建 provider 无法用 select 限定的下拉, 必须支持自由输入) */}
        <Field label="Provider" required>
          <input
            list="user-model-provider-list"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            disabled={isEdit}
            placeholder="选择或输入 provider, e.g. openai / ollama-local / vllm-prod"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
          />
          <datalist id="user-model-provider-list">
            {userKeys
              .filter((k) => k.isActive)
              .map((k) => (
                <option key={k.provider} value={k.provider}>
                  {k.keyHint}
                </option>
              ))}
          </datalist>
          {userKeys.filter((k) => k.isActive).length === 0 && (
            <p className="mt-1 text-xs text-amber-600">
              暂无已配置的 API Key —— 留空 Provider 或填自建 slug, 之后到 API Keys 配密钥。
            </p>
          )}
        </Field>

        {/* ★ API 配置 section — 视觉对齐 admin AI Model form */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            API 配置
          </div>
          <div className="space-y-3">
            <Field label="API Endpoint（留空使用 provider 默认值）">
              <input
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder={
                  apiEndpoint || 'https://api.example.com/v1/chat/completions'
                }
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono"
              />
              {apiEndpoint && !endpoint && (
                <p className="mt-1 text-xs text-gray-500">
                  当前 provider 默认:{' '}
                  <code className="font-mono">{apiEndpoint}</code>
                </p>
              )}
            </Field>
          </div>
        </div>

        {/* 模型类型 */}
        <Field label="模型类型" required>
          <select
            value={modelType}
            onChange={(e) => setModelType(e.target.value as UserModelType)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {USER_MODEL_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} — {o.description}
              </option>
            ))}
          </select>
        </Field>

        {/* Model ID（带「获取」按钮） */}
        <UserModelIdSelector
          provider={provider}
          apiKey={apiKey}
          apiEndpoint={endpoint || apiEndpoint}
          modelType={modelType}
          value={modelId}
          onChange={(v) => {
            setModelId(v);
            if (!displayName) setDisplayName(v);
          }}
        />

        {/* 显示名 */}
        <Field label="显示名" required>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="例如：My GPT-4o mini"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </Field>

        {/* 自定义 endpoint */}
        <Field label="自定义 API Endpoint（留空则使用 provider 默认）">
          <input
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder={apiEndpoint || '留空使用 provider 默认'}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </Field>

        {/* 2026-05-27 BYOK：运行时使用哪把用户 Key */}
        <Field label="使用 Key（留空走 provider 默认 / 系统）">
          <select
            value={apiKeyId}
            onChange={(e) => setApiKeyId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">默认（provider 默认 / 系统）</option>
            {userKeys
              .filter((k) => k.isActive && k.provider === provider)
              .map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}（{k.keyHint}）
                </option>
              ))}
          </select>
        </Field>


        {/* 参数 */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Max Tokens">
            <input
              type="number"
              min={1}
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Temperature">
            <input
              type="number"
              step="0.1"
              min={0}
              max={2}
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              disabled={!supportsTemperature}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
            />
          </Field>
        </div>

        {/* 默认 / 启用 */}
        <div className="grid grid-cols-2 gap-4">
          <Toggle
            label="作为该类型的默认模型"
            description="启用 AI 调用时优先选用此模型"
            value={isDefault}
            onChange={setIsDefault}
          />
          <Toggle
            label="启用"
            description="关闭后此模型不会被路由选中"
            value={isEnabled}
            onChange={setIsEnabled}
          />
        </div>

        {/* 高级设置折叠 */}
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          {showAdvanced ? '▾' : '▸'} 高级设置（API 格式 / 能力标志 / 优先级 /
          描述）
        </button>

        {showAdvanced && (
          <div className="space-y-4 rounded-md bg-gray-50 p-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="API Format">
                <select
                  value={apiFormat}
                  onChange={(e) => setApiFormat(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  {API_FORMAT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Token Param Name">
                <select
                  value={tokenParamName}
                  onChange={(e) => {
                    setTokenParamName(e.target.value);
                    setReasoningTouched(true);
                  }}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  {TOKEN_PARAM_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Toggle
                label="推理模型（Reasoning）"
                description="o1/o3/DeepSeek-R1 等"
                value={isReasoning}
                onChange={(v) => {
                  setIsReasoning(v);
                  setReasoningTouched(true);
                }}
              />
              <Toggle
                label="支持 Temperature 参数"
                description="推理系列通常不支持"
                value={supportsTemperature}
                onChange={(v) => {
                  setSupportsTemperature(v);
                  setReasoningTouched(true);
                }}
              />
              <Toggle
                label="支持流式输出"
                value={supportsStreaming}
                onChange={setSupportsStreaming}
              />
              <Toggle
                label="支持 Function Calling"
                value={supportsFunctionCalling}
                onChange={setSupportsFunctionCalling}
              />
              <Toggle
                label="支持视觉输入"
                description="可以接收图片输入"
                value={supportsVision}
                onChange={setSupportsVision}
              />
              <Field label="优先级 (0-100)">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </Field>
            </div>

            {/* 限速参数：避免上游 429 风暴。留空 = 用 provider 启发式默认 */}
            <div className="rounded-md border border-amber-100 bg-amber-50/40 p-3">
              <div className="mb-2 text-xs font-medium text-amber-900">
                限速参数（避免 429）—— 留空走 provider 启发式默认
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="RPM (Requests / minute)">
                  <input
                    type="number"
                    min={1}
                    value={rpmLimit}
                    onChange={(e) => setRpmLimit(e.target.value)}
                    placeholder="例如 100（Gemini free embedding）"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </Field>
                <Field label="TPM (Tokens / minute)">
                  <input
                    type="number"
                    min={1}
                    value={tpmLimit}
                    onChange={(e) => setTpmLimit(e.target.value)}
                    placeholder="例如 30000（Gemini free embedding）"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </Field>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-gray-600">
                Gemini free tier embedding：100 RPM / 30K TPM。OpenAI tier-1
                paid embedding：~1500 RPM / 1M TPM。可在 Google AI Studio /
                OpenAI dashboard 的 Rate Limit 页面查实际配额。
              </p>
            </div>

            <Field label="描述（可选）">
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </Field>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-md bg-white p-2">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1"
      />
      <div>
        <div className="text-sm text-gray-900">{label}</div>
        {description && (
          <div className="text-xs text-gray-500">{description}</div>
        )}
      </div>
    </label>
  );
}
