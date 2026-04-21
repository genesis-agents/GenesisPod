'use client';

import { useState } from 'react';
import { CheckCircle2, Edit, Plus, Star, Trash2 } from 'lucide-react';
import {
  type UserModelConfig,
  useUserModelConfigs,
  USER_MODEL_TYPE_OPTIONS,
} from '@/hooks/features/useUserModelConfigs';
import { UserModelConfigModal } from './UserModelConfigModal';

interface Props {
  provider: string;
  /** 父组件里输入框当前的 API Key（用于新建 Modal 的「获取」按钮实时拉 provider 模型） */
  apiKey: string;
  apiEndpoint?: string;
}

/**
 * 用户自定义模型列表 — 一个 Provider Key 下可挂多个模型实例（CHAT / CHAT_FAST /
 * EMBEDDING 等）。字段与管理员端 AIModelSettings 对齐。
 */
export function UserModelsList({ provider, apiKey, apiEndpoint }: Props) {
  const { items, loading, mutating, remove, setDefault } =
    useUserModelConfigs(provider);

  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<UserModelConfig | null>(null);

  const filtered = items.filter((m) => m.provider === provider);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-gray-900">我的模型</div>
          <div className="text-xs text-gray-500">
            这个 Key 下自定义的模型实例（可多个，按用途区分）
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-3.5 w-3.5" /> 添加模型
        </button>
      </div>

      {loading && <div className="text-xs text-gray-500">加载中...</div>}

      {!loading && filtered.length === 0 && (
        <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-4 text-center text-xs text-gray-500">
          还没配置任何模型。点击「添加模型」从你的 Key 可用列表里选一个 —
          管理员默认模型可能需要高付费 tier，你可以指定自己 Key 能用的（比如{' '}
          <code className="font-mono">gpt-4o-mini</code>）。
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((m) => (
          <ModelRow
            key={m.id}
            data={m}
            busy={mutating}
            onEdit={() => setEditing(m)}
            onDelete={async () => {
              if (confirm(`确定删除 ${m.displayName}（${m.modelId}）吗？`)) {
                await remove(m.id);
              }
            }}
            onSetDefault={() => setDefault(m.id)}
          />
        ))}
      </div>

      {(showAdd || editing) && (
        <UserModelConfigModal
          // key 强制 Modal 重建，避免切换编辑对象时沿用上次 state
          key={editing?.id ?? 'new'}
          provider={provider}
          apiKey={apiKey}
          apiEndpoint={apiEndpoint}
          initial={editing}
          onClose={() => {
            setShowAdd(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ModelRow({
  data,
  busy,
  onEdit,
  onDelete,
  onSetDefault,
}: {
  data: UserModelConfig;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
}) {
  const typeLabel =
    USER_MODEL_TYPE_OPTIONS.find((o) => o.value === data.modelType)?.label ??
    data.modelType;

  return (
    <div className="flex items-center justify-between rounded-md border border-gray-200 bg-white p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-gray-900">
            {data.displayName}
          </span>
          {data.isDefault && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
              <Star className="h-2.5 w-2.5" /> 默认
            </span>
          )}
          {!data.isEnabled && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
              已禁用
            </span>
          )}
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-700">
            {typeLabel}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500">
          <span className="font-mono">{data.modelId}</span>
          <span>·</span>
          <span>maxTokens {data.maxTokens}</span>
          <span>·</span>
          <span>temp {data.temperature}</span>
          <span>·</span>
          <span>{data.apiFormat}</span>
          {data.isReasoning && (
            <>
              <span>·</span>
              <span className="text-purple-600">reasoning</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {!data.isDefault && data.isEnabled && (
          <button
            onClick={onSetDefault}
            disabled={busy}
            title="设为该类型默认"
            className="rounded-md border border-gray-200 p-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={onEdit}
          disabled={busy}
          title="编辑"
          className="rounded-md border border-gray-200 p-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <Edit className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          disabled={busy}
          title="删除"
          className="rounded-md border border-red-200 p-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
