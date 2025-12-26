'use client';

import { useState } from 'react';
import {
  Database,
  X,
  Upload,
  Link as LinkIcon,
  FileText,
  Bookmark,
  StickyNote,
  Image as ImageIcon,
} from 'lucide-react';
import type { CreateKnowledgeBaseDto } from '@/hooks/domain/useKnowledgeBase';
import GoogleDriveFolderPicker from './GoogleDriveFolderPicker';

// 数据源类型配置
const DATA_SOURCE_OPTIONS = [
  {
    value: 'MANUAL',
    label: '手动上传',
    description: '上传本地文档文件',
    icon: Upload,
    color: 'bg-blue-50 text-blue-600',
  },
  {
    value: 'GOOGLE_DRIVE',
    label: 'Google Drive',
    description: '从 Google Drive 同步文件',
    icon: Database,
    color: 'bg-green-50 text-green-600',
  },
  {
    value: 'URL',
    label: 'URL 抓取',
    description: '从网页 URL 抓取内容',
    icon: LinkIcon,
    color: 'bg-purple-50 text-purple-600',
  },
  {
    value: 'BOOKMARK',
    label: '平台书签',
    description: '从你保存的书签导入',
    icon: Bookmark,
    color: 'bg-orange-50 text-orange-600',
  },
  {
    value: 'NOTE',
    label: '平台笔记',
    description: '从你创建的笔记导入',
    icon: StickyNote,
    color: 'bg-yellow-50 text-yellow-600',
  },
  {
    value: 'IMAGE',
    label: '图片 OCR',
    description: '从图片中提取文字',
    icon: ImageIcon,
    color: 'bg-pink-50 text-pink-600',
  },
] as const;

interface CreateKnowledgeBaseDialogProps {
  onClose: () => void;
  onCreate: (dto: CreateKnowledgeBaseDto) => void;
  creating: boolean;
  kbType: 'PERSONAL' | 'TEAM';
}

/**
 * 创建知识库对话框
 * 支持多数据源选择
 */
export default function CreateKnowledgeBaseDialog({
  onClose,
  onCreate,
  creating,
  kbType,
}: CreateKnowledgeBaseDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sourceType, setSourceType] = useState<string>('MANUAL');
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const [selectedFolderNames, setSelectedFolderNames] = useState<string[]>([]);

  const handleFolderSelectionChange = (
    folderIds: string[],
    folderNames: string[]
  ) => {
    setSelectedFolderIds(folderIds);
    setSelectedFolderNames(folderNames);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({
      name,
      description: description || undefined,
      sourceType: sourceType as 'GOOGLE_DRIVE' | 'MANUAL' | 'URL',
      googleDriveFolderIds:
        sourceType === 'GOOGLE_DRIVE' && selectedFolderIds.length > 0
          ? selectedFolderIds
          : undefined,
    });
  };

  // 检查表单是否可以提交
  const canSubmit =
    name.trim() &&
    !creating &&
    (sourceType !== 'GOOGLE_DRIVE' || selectedFolderIds.length > 0);

  const isTeam = kbType === 'TEAM';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl">
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
                创建{isTeam ? '团队' : '个人'}知识库
              </h2>
              <p className="text-xs text-gray-500">
                {isTeam ? '团队知识库可与成员共享' : '个人知识库仅自己可见'}
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
              知识库名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder={isTeam ? '例如：产品团队知识库' : '例如：工作资料库'}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              描述 <span className="text-gray-400">(可选)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="描述这个知识库的用途"
            />
          </div>

          {/* Data Source Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              数据来源 <span className="text-red-500">*</span>
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {DATA_SOURCE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isSelected = sourceType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setSourceType(option.value);
                      // 切换来源类型时清空文件夹选择
                      if (option.value !== 'GOOGLE_DRIVE') {
                        setSelectedFolderIds([]);
                        setSelectedFolderNames([]);
                      }
                    }}
                    className={`flex items-start gap-3 rounded-lg border-2 p-3 text-left transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${option.color}`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm font-medium ${
                          isSelected ? 'text-blue-700' : 'text-gray-900'
                        }`}
                      >
                        {option.label}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {option.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Google Drive Folder Picker */}
          {sourceType === 'GOOGLE_DRIVE' && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                选择要同步的文件夹
                <span className="ml-1 text-xs text-gray-500">
                  (单击选择，双击进入)
                </span>
              </label>
              <GoogleDriveFolderPicker
                selectedFolderIds={selectedFolderIds}
                onSelectionChange={handleFolderSelectionChange}
                disabled={creating}
              />
              {selectedFolderIds.length === 0 && (
                <p className="mt-2 text-xs text-amber-600">
                  请至少选择一个文件夹
                </p>
              )}
            </div>
          )}

          {/* Coming Soon for other sources */}
          {['BOOKMARK', 'NOTE', 'IMAGE'].includes(sourceType) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-800">
                <span className="font-medium">即将推出：</span>
                {sourceType === 'BOOKMARK' && '书签导入功能正在开发中'}
                {sourceType === 'NOTE' && '笔记导入功能正在开发中'}
                {sourceType === 'IMAGE' && '图片 OCR 功能正在开发中'}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                isTeam
                  ? 'bg-purple-600 hover:bg-purple-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {creating ? '创建中...' : '创建知识库'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
