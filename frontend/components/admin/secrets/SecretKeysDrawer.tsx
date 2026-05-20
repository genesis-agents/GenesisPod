'use client';

import { X } from 'lucide-react';
import { MultiKeyTable } from '@/components/common/tables/MultiKeyTable';
import { useSecretKeys } from '@/hooks/domain/useSecretKeys';
import type { Secret } from '@/hooks/domain/useAdminSecrets';

interface SecretKeysDrawerProps {
  secret: Secret | null;
  onClose: () => void;
}

/**
 * 编辑 secret 的多 KEY 抽屉。
 * 点击列表行的 edit 图标触发；保留列表上下文可见。
 */
export function SecretKeysDrawer({ secret, onClose }: SecretKeysDrawerProps) {
  const {
    keys,
    loading,
    actionLoading,
    addKey,
    updateKeyMeta,
    replaceKeyValue,
    deleteKey,
    testKey,
  } = useSecretKeys(secret?.id ?? null);

  if (!secret) return null;

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
              {secret.displayName}
            </h2>
            <p className="font-mono mt-1 text-sm text-gray-500">
              {secret.name}
            </p>
            {secret.provider && (
              <span className="mt-2 inline-block rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                {secret.provider}
              </span>
            )}
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
            keys={keys}
            loading={loading}
            actionLoading={actionLoading}
            onAdd={addKey}
            onUpdate={updateKeyMeta}
            onReplace={replaceKeyValue}
            onDelete={deleteKey}
            onTest={testKey}
          />

          <div className="mt-6 rounded border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
            <p className="mb-1 font-medium">How multi-key works:</p>
            <ul className="list-inside list-disc space-y-0.5">
              <li>
                Existing secrets are migrated as a single{' '}
                <span className="font-mono">primary</span> key — the original
                value you configured. Click <strong>+ Add Key</strong> to add
                backups for fallback.
              </li>
              <li>
                Lower <strong>priority</strong> wins. On error the next eligible
                key is used automatically.
              </li>
              <li>
                Keys marked <span className="font-mono">failed</span> within 5
                min are temporarily skipped (circuit breaker).
              </li>
              <li>
                <strong>Replace</strong> rotates a key's value — status resets
                to Unknown; click <strong>Test</strong> to verify decryption.
              </li>
              <li>
                Status <span className="font-mono">Unknown</span> only means no
                test has run yet; the key may still be valid in real traffic.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
