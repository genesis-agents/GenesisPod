'use client';

import { AlertTriangle } from 'lucide-react';

/**
 * ConfirmDialog —— 替代 window.confirm() 的轻量内联弹窗。
 * 受 Round 1 UX 评审 P0 驱动：native confirm 视觉断片 + 不可 i18n + a11y 差。
 *
 * 受控用法：父持有 open 状态，onConfirm/onCancel 由父决定关闭时机。
 */
interface Props {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确定',
  cancelLabel = '取消',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-start gap-3">
          {danger && (
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
          )}
          <div className="min-w-0 flex-1">
            <h3
              id="confirm-dialog-title"
              className="text-sm font-semibold text-gray-900"
            >
              {title}
            </h3>
            {description && (
              <p className="mt-1 text-xs text-gray-600">{description}</p>
            )}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60 ${
              danger
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-cyan-600 hover:bg-cyan-700'
            }`}
            onClick={onConfirm}
          >
            {busy ? '处理中…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
