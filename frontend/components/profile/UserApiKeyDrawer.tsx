'use client';

import { X } from 'lucide-react';
import { MultiKeyTable } from '@/components/admin/secrets/MultiKeyTable';
import type { UserApiKeyInfo } from '@/hooks/features/useUserApiKeys';
import type {
  SecretKeyRow,
  AddKeyInput,
  UpdateKeyMetaInput,
} from '@/hooks/domain/useSecretKeys';

/**
 * BYOK 多 KEY 管理抽屉（与 admin SecretKeysDrawer 视觉行为一致）。
 *
 * 共享 <MultiKeyTable> 组件，端点走现有 /user/api-keys/:provider PUT/DELETE
 * （label-aware）。priority/test 在 BYOK 不可控（hideEditMeta + hideTest）。
 */
export interface UserApiKeyDrawerProps {
  open: boolean;
  onClose: () => void;
  provider: { id: string; name: string };
  keys: UserApiKeyInfo[];
  loading: boolean;
  saving: boolean;
  testing: boolean;
  onSave: (
    provider: string,
    apiKey: string,
    mode: 'personal' | 'donated',
    preferredModelId?: string,
    apiEndpoint?: string,
    label?: string
  ) => Promise<boolean>;
  onDelete: (provider: string, label?: string) => Promise<boolean>;
}

export function UserApiKeyDrawer({
  open,
  onClose,
  provider,
  keys: userKeys,
  loading,
  saving,
  testing,
  onSave,
  onDelete,
}: UserApiKeyDrawerProps) {
  if (!open) return null;

  // UserApiKeyInfo → SecretKeyRow 适配
  const adapted: SecretKeyRow[] = userKeys.map((k) => ({
    id: k.id,
    secretId: provider.id,
    label: k.label,
    keyHint: k.keyHint || null,
    isActive: k.isActive,
    priority: 0,
    testStatus: (k.testStatus as 'success' | 'failed' | null) ?? null,
    lastTestedAt: k.lastTestedAt,
    // ★ 2026-05-06: BYOK 后端 testKey 现在写回 lastErrorCode/lastErrorMessage；
    //   useUserApiKeys hook 当前的 UserApiKeyInfo 还没扩这两字段，下个 PR 补
    lastErrorCode: null,
    lastErrorMessage: null,
    accessCount: k.usageCount,
    createdAt: k.createdAt,
    updatedAt: k.updatedAt,
  }));

  const handleAdd = async (input: AddKeyInput) => {
    await onSave(
      provider.id,
      input.value,
      'personal',
      undefined,
      undefined,
      input.label
    );
  };

  const handleReplace = async (keyId: string, value: string) => {
    const target = userKeys.find((k) => k.id === keyId);
    if (!target) return;
    await onSave(
      provider.id,
      value,
      target.mode,
      undefined,
      undefined,
      target.label
    );
  };

  const handleUpdate = async (_keyId: string, _meta: UpdateKeyMetaInput) => {
    // BYOK 无 priority/isActive 改 meta（hideEditMeta，UI 不暴露按钮）
  };

  const handleDelete = async (keyId: string) => {
    const target = userKeys.find((k) => k.id === keyId);
    if (!target) return;
    await onDelete(provider.id, target.label);
  };

  const handleTest = async (_keyId: string) => {
    // BYOK 无主动 test（hideTest）；通过真实流量被动 markFailure 反馈
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="flex-1 bg-black/30"
        onClick={onClose}
        aria-label="close drawer"
      />
      <div className="flex w-full max-w-3xl flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b p-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {provider.name}
            </h2>
            <p className="font-mono mt-1 text-sm text-gray-500">
              {provider.id}
            </p>
            <span className="mt-2 inline-block rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
              BYOK · 用户自有
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-gray-100"
            aria-label="close"
          >
            <X className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <MultiKeyTable
            keys={adapted}
            loading={loading}
            actionLoading={saving || testing}
            onAdd={handleAdd}
            onUpdate={handleUpdate}
            onReplace={handleReplace}
            onDelete={handleDelete}
            onTest={handleTest}
            hideEditMeta
            hideTest
          />

          <div className="mt-6 rounded border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
            <p className="mb-1 font-medium">关于多 KEY:</p>
            <ul className="list-inside list-disc space-y-0.5">
              <li>
                同一 provider 下可配置多条 KEY（用 label 区分，如{' '}
                <span className="font-mono">default</span> /{' '}
                <span className="font-mono">backup-1</span>）。
              </li>
              <li>
                KeyChain 自动按健康调度选用：上次成功的 KEY
                优先；失败时切下一个。
              </li>
              <li>
                <strong>Replace</strong> 会重写该 label 的 value（status
                自动重置）。
              </li>
              <li>priority / 主动 test 不在 BYOK 暴露（系统自动调度）。</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
