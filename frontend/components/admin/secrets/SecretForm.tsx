'use client';

import { useState, useEffect } from 'react';
import { X, Key, Save } from 'lucide-react';
import {
  Secret,
  SecretCategory,
  CreateSecretDto,
  UpdateSecretDto,
} from '@/hooks/domain/useAdminSecrets';

const CATEGORY_OPTIONS: { value: SecretCategory; label: string }[] = [
  { value: 'AI_MODEL', label: 'AI 模型' },
  { value: 'SEARCH', label: '搜索' },
  { value: 'EXTRACTION', label: '内容提取' },
  { value: 'YOUTUBE', label: 'YouTube' },
  { value: 'TTS', label: '语音合成' },
  { value: 'SKILLSMP', label: 'SkillsMP' },
  { value: 'OTHER', label: '其他' },
];

interface SecretFormProps {
  secret: Secret | null;
  onSubmit: (data: CreateSecretDto | UpdateSecretDto) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function SecretForm({
  secret,
  onSubmit,
  onCancel,
  isSubmitting,
}: SecretFormProps) {
  const isEditing = !!secret;

  const [formData, setFormData] = useState({
    name: secret?.name ?? '',
    displayName: secret?.displayName ?? '',
    value: '',
    category: secret?.category ?? ('OTHER' as SecretCategory),
    description: secret?.description ?? '',
    provider: secret?.provider ?? '',
    isActive: secret?.isActive ?? true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!isEditing && !formData.name.trim()) {
      newErrors.name = '名称不能为空';
    } else if (!isEditing && !/^[a-z0-9-]+$/.test(formData.name)) {
      newErrors.name = '名称只能包含小写字母、数字和连字符';
    }

    if (!formData.displayName.trim()) {
      newErrors.displayName = '显示名称不能为空';
    }

    if (!isEditing && !formData.value.trim()) {
      newErrors.value = '密钥值不能为空';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    if (isEditing) {
      const updateData: UpdateSecretDto = {
        displayName: formData.displayName,
        description: formData.description || undefined,
        category: formData.category,
        provider: formData.provider || undefined,
        isActive: formData.isActive,
      };
      if (formData.value.trim()) {
        updateData.value = formData.value;
      }
      await onSubmit(updateData);
    } else {
      await onSubmit({
        name: formData.name,
        displayName: formData.displayName,
        value: formData.value,
        category: formData.category,
        description: formData.description || undefined,
        provider: formData.provider || undefined,
        isActive: formData.isActive,
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-lg bg-white shadow-xl dark:bg-gray-800">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
            <Key className="h-5 w-5" />
            {isEditing ? '编辑密钥' : '添加密钥'}
          </h3>
          <button
            onClick={onCancel}
            className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 表单 */}
        <form
          onSubmit={handleSubmit}
          autoComplete="off"
          className="space-y-4 p-6"
        >
          {/* 名称 (仅创建时) */}
          {!isEditing && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                名称 (唯一标识) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                autoComplete="off"
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    name: e.target.value.toLowerCase(),
                  })
                }
                placeholder="例如: openai-api-key"
                className={`w-full rounded-lg border bg-white px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white ${
                  errors.name
                    ? 'border-red-500'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-500">{errors.name}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                只能包含小写字母、数字和连字符
              </p>
            </div>
          )}

          {/* 显示名称 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              显示名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.displayName}
              autoComplete="off"
              onChange={(e) =>
                setFormData({ ...formData, displayName: e.target.value })
              }
              placeholder="例如: OpenAI API Key"
              className={`w-full rounded-lg border bg-white px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white ${
                errors.displayName
                  ? 'border-red-500'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
            />
            {errors.displayName && (
              <p className="mt-1 text-sm text-red-500">{errors.displayName}</p>
            )}
          </div>

          {/* 密钥值 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              密钥值 {!isEditing && <span className="text-red-500">*</span>}
            </label>
            <input
              type="password"
              value={formData.value}
              autoComplete="new-password"
              onChange={(e) =>
                setFormData({ ...formData, value: e.target.value })
              }
              placeholder={isEditing ? '留空则不修改' : '输入密钥值'}
              className={`w-full rounded-lg border bg-white px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white ${
                errors.value
                  ? 'border-red-500'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
            />
            {errors.value && (
              <p className="mt-1 text-sm text-red-500">{errors.value}</p>
            )}
          </div>

          {/* 分类和提供商 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                分类
              </label>
              <select
                value={formData.category}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    category: e.target.value as SecretCategory,
                  })
                }
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                提供商
              </label>
              <input
                type="text"
                autoComplete="off"
                value={formData.provider}
                onChange={(e) =>
                  setFormData({ ...formData, provider: e.target.value })
                }
                placeholder="例如: OpenAI"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>

          {/* 描述 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              描述
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="可选的描述信息"
              rows={2}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>

          {/* 启用状态 */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) =>
                setFormData({ ...formData, isActive: e.target.checked })
              }
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label
              htmlFor="isActive"
              className="text-sm text-gray-700 dark:text-gray-300"
            >
              启用此密钥
            </label>
          </div>

          {/* 按钮 */}
          <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-4 py-2 text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {isSubmitting ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
