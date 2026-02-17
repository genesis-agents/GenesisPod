'use client';

import { useTranslation } from '@/lib/i18n';

interface DeleteProjectDialogProps {
  isOpen: boolean;
  projectName: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function DeleteProjectDialog({
  isOpen,
  projectName,
  onConfirm,
  onClose,
}: DeleteProjectDialogProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900">
          {t('common.delete')}
        </h2>
        <p className="mt-2 text-sm text-gray-500">
          {t('aiResearch.project.deleteConfirm', { name: projectName })}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
          >
            {t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}
