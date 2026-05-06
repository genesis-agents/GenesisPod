'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { MultiKeyTable } from '@/components/admin/secrets/MultiKeyTable';
import {
  useUserApiKeys,
  type UserApiKeyInfo,
} from '@/hooks/features/useUserApiKeys';
import type {
  SecretKeyRow,
  AddKeyInput,
  UpdateKeyMetaInput,
} from '@/hooks/domain/useSecretKeys';

/**
 * BYOK provider 卡片下方的多 KEY 表格抽屉（折叠展开）。
 *
 * 与管理员 SecretKeysDrawer 共享 <MultiKeyTable> 组件 → 视觉与行为完全一致。
 * 数据源：useUserApiKeys.getKeysForProvider(provider)
 * 操作端点：现有 /user/api-keys/:provider PUT/DELETE/POST :provider/test（已支持 label）
 */
export function UserApiKeyMultiKeyPanel({ provider }: { provider: string }) {
  const {
    getKeysForProvider,
    saveKey,
    deleteKey,
    testKey,
    saving,
    testing,
    loading,
  } = useUserApiKeys();
  const [open, setOpen] = useState(false);

  const userKeys = getKeysForProvider(provider);

  // UserApiKeyInfo → SecretKeyRow 适配（无 secretId/priority/lastErrorMessage 字段，填占位值）
  const adapted: SecretKeyRow[] = userKeys.map((k: UserApiKeyInfo) => ({
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
    await saveKey(
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
    await saveKey(
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
    // 留空实现；UI 不会出现 edit 操作（priority 列恒 0）
  };

  const handleDelete = async (keyId: string) => {
    const target = userKeys.find((k) => k.id === keyId);
    if (!target) return;
    await deleteKey(provider, target.label);
  };

  const handleTest = async (_keyId: string) => {
    // 新版 test 通过 listUserApiKeys.testStatus 字段被动回写；P3+ 可加主动 test
    // 当前 endpoint 需要 apiKey 明文，这里没有 → 提示用户用 Replace 覆盖再观察
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
