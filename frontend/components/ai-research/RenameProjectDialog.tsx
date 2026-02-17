'use client';

import { useTranslation } from '@/lib/i18n';

interface RenameProjectDialogProps {
  isOpen: boolean;
  originalName: string;
  renameName: string;
  onRenameNameChange: (name: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function RenameProjectDialog({
  isOpen,
  originalName,
  renameName,
  onRenameNameChange,
  onConfirm,
  onClose,
}: RenameProjectDialogProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900">
          {t('aiResearch.project.rename')}
        </h2>
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700">
            {t('aiResearch.project.name')}
          </label>
          <input
            type="text"
            autoFocus
            value={renameName}
            onChange={(e) => onRenameNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && renameName.trim()) {
                onConfirm();
              }
              if (e.key === 'Escape') {
                onClose();
              }
            }}
            placeholder={t('aiResearch.project.namePlaceholder')}
            className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            maxLength={500}
          />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={!renameName.trim() || renameName.trim() === originalName}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
