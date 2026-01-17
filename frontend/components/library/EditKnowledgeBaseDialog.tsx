'use client';

import { useState } from 'react';
import { Database, X } from 'lucide-react';
import type { KnowledgeBase } from '@/hooks/domain/useKnowledgeBase';
import { useTranslation } from '@/lib/i18n';

interface EditKnowledgeBaseDialogProps {
  knowledgeBase: KnowledgeBase;
  onClose: () => void;
  onUpdate: (data: { name?: string; description?: string }) => Promise<void>;
  updating: boolean;
}

/**
 * 编辑知识库对话框
 * 简化版本：仅支持修改名称和描述
 * 数据源管理通过「添加内容」功能进行
 */
export default function EditKnowledgeBaseDialog({
  knowledgeBase,
  onClose,
  onUpdate,
  updating,
}: EditKnowledgeBaseDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(knowledgeBase.name);
  const [description, setDescription] = useState(
    knowledgeBase.description || ''
  );
  const [nameError, setNameError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate name
    if (!name.trim()) {
      setNameError(
        t('knowledgeBase.errors.nameRequired') || '请输入知识库名称'
      );
      return;
    }
    setNameError(null);

    // Only send changed fields
    const updates: { name?: string; description?: string } = {};
    if (name !== knowledgeBase.name) {
      updates.name = name;
    }
    if (description !== (knowledgeBase.description || '')) {
      updates.description = description || undefined;
    }

    // Only update if there are changes
    if (Object.keys(updates).length > 0) {
      await onUpdate(updates);
    } else {
      onClose();
    }
  };

  // Clear error when name changes
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    if (e.target.value.trim()) {
      setNameError(null);
    }
  };

  const isTeam = knowledgeBase.type === 'TEAM';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div
          className={`flex items-center justify-between border-b px-6 py-4 ${
            isTeam
              ? 'border-purple-100 bg-purple-50'
              : 'border-blue-100 bg-blue-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                isTeam ? 'bg-purple-100' : 'bg-blue-100'
              }`}
            >
              <Database
                className={`h-5 w-5 ${isTeam ? 'text-purple-600' : 'text-blue-600'}`}
              />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {t('knowledgeBase.edit') || '编辑知识库'}
              </h2>
              <p className="text-xs text-gray-500">
                {t('knowledgeBase.editDesc') || '修改知识库基本信息'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t('knowledgeBase.name')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={handleNameChange}
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                nameError
                  ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                  : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
              }`}
              placeholder={
                isTeam
                  ? t('knowledgeBase.teamNamePlaceholder') ||
                    '例如：产品团队知识库'
                  : t('knowledgeBase.personalNamePlaceholder') ||
                    '例如：工作资料库'
              }
              autoFocus
            />
            {nameError && (
              <p className="mt-1 text-sm text-red-500">{nameError}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t('knowledgeBase.descriptionOptional')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder={
                t('knowledgeBase.descriptionPlaceholder') ||
                '描述这个知识库的用途'
              }
            />
          </div>

          {/* Hint */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-sm text-gray-600">
              <span className="font-medium">
                {t('knowledgeBase.manageDataSourceHint') || '💡 提示：'}
              </span>
              {t('knowledgeBase.useAddContentForDataSource') ||
                '如需添加或管理数据源，请使用「添加内容」功能'}
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t('knowledgeBase.cancel') || '取消'}
            </button>
            <button
              type="submit"
              disabled={updating || !name.trim()}
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                isTeam
                  ? 'bg-purple-600 hover:bg-purple-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {updating
                ? t('knowledgeBase.saving') || '保存中...'
                : t('knowledgeBase.save') || '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
