'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { MultiKeyTable } from '@/components/admin/secrets/MultiKeyTable';
import type { UserApiKeyInfo } from '@/hooks/features/useUserApiKeys';
import type {
  SecretKeyRow,
  AddKeyInput,
  UpdateKeyMetaInput,
} from '@/hooks/domain/useSecretKeys';

/**
 * BYOK provider 卡片下方的多 KEY 表格抽屉（折叠展开）。
 *
 * 与管理员 SecretKeysDrawer 共享 <MultiKeyTable> 组件 → 视觉与行为完全一致。
 *
 * ★ 数据/操作 props 由父组件 UserApiKeysTab 注入（共享同一个 useUserApiKeys
 *   hook 实例），避免 panel 内独立 hook 实例导致 save/delete 后父组件 keys
 *   列表 stale 的问题。
 */
export interface UserApiKeyMultiKeyPanelProps {
  provider: string;
  /** 该 provider 下全部 label 的 keys（已按 label 排序） */
  keys: UserApiKeyInfo[];
  loading: boolean;
  saving: boolean;
  testing: boolean;
  /** PUT /user/api-keys/:provider — saveKey 用于 add 和 replace */
  onSave: (
    provider: string,
    apiKey: string,
    mode: 'personal' | 'donated',
    preferredModelId?: string,
    apiEndpoint?: string,
    label?: string
  ) => Promise<boolean>;
  /** DELETE /user/api-keys/:provider?label=X */
  onDelete: (provider: string, label?: string) => Promise<boolean>;
}

export function UserApiKeyMultiKeyPanel({
  provider,
  keys: userKeys,
  loading,
  saving,
  testing,
  onSave,
  onDelete,
}: UserApiKeyMultiKeyPanelProps) {
  const [open, setOpen] = useState(false);

  // UserApiKeyInfo → SecretKeyRow 适配（无 secretId/priority/lastErrorMessage 字段，填占位值）
  const adapted: SecretKeyRow[] = userKeys.map((k) => ({
    id: k.id,
    secretId: provider, // BYOK 用 provider 名当 secretId 占位
    label: k.label,
    keyHint: k.keyHint || null,
    isActive: k.isActive,
    priority: 0, // UserApiKey 无 priority；KeyChain 走 lastGood 健康调度
    testStatus: (k.testStatus as 'success' | 'failed' | null) ?? null,
    lastTestedAt: k.lastTestedAt,
    lastErrorMessage: null,
    accessCount: k.usageCount,
    createdAt: k.createdAt,
    updatedAt: k.updatedAt,
  }));

  const handleAdd = async (input: AddKeyInput) => {
    // BYOK 默认 personal mode；用户走完整 onboarding 才捐赠
    await onSave(
      provider,
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
    // PUT :provider with same label 即覆盖
    await onSave(
      provider,
      value,
      target.mode,
      undefined,
      undefined,
      target.label
    );
  };

  const handleUpdate = async (_keyId: string, _meta: UpdateKeyMetaInput) => {
    // BYOK 当前不支持 priority/isActive 改 meta（schema 也无 priority）
    // 留空实现；UI Edit 按钮不暴露（adapted.priority 恒 0）
  };

  const handleDelete = async (keyId: string) => {
    const target = userKeys.find((k) => k.id === keyId);
    if (!target) return;
    await onDelete(provider, target.label);
  };

  const handleTest = async (_keyId: string) => {
    // BYOK 现有 test endpoint 需要 apiKey 明文；保存后通过被动调用 markFailure 更新
    // 状态。UI 不主动触发；用户用 Replace 覆盖 + 后续真实流量被动反馈。
  };

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
      >
        {open ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
        Manage multiple keys ({userKeys.length})
      </button>
      {open && (
        <div className="mt-3">
          <MultiKeyTable
            keys={adapted}
            loading={loading}
            actionLoading={saving || testing}
            onAdd={handleAdd}
            onReplace={handleReplace}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onTest={handleTest}
          />
          <p className="mt-2 text-xs text-gray-500">
            Multiple keys for one provider rotate via KeyChain health scheduler
            (last-good selection + automatic failover). Priority is not
            user-configurable for BYOK.
          </p>
        </div>
      )}
    </div>
  );
}
